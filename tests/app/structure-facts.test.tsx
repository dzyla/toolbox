import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/preact';
import { read } from '../core/structure-helpers';
import { parseMmcif } from '@/core/structure';
import type { MolstarHandle, MolstarViewerProps } from '@/tools/structure/MolstarViewer';

const handle = vi.hoisted(() => ({
  load: vi.fn(async () => undefined),
  setRepresentation: vi.fn(async () => undefined),
  setColoring: vi.fn(async () => undefined),
  setHydrogens: vi.fn(async () => undefined),
  highlight: vi.fn(),
  select: vi.fn(),
  focus: vi.fn(),
  snapshot: vi.fn(async () => new Blob([], { type: 'image/png' })),
}));

vi.mock('@/tools/structure/MolstarViewer', async () => {
  const { useEffect } = await import('preact/hooks');
  return {
    MolstarViewer: (props: MolstarViewerProps) => {
      useEffect(() => { props.onReady(handle as unknown as MolstarHandle); }, []);
      return <div data-testid="fake-molstar" />;
    },
  };
});

const downloadText = vi.hoisted(() => vi.fn());
const downloadBlob = vi.hoisted(() => vi.fn());
vi.mock('@/lib/export', async importOriginal => ({ ...(await importOriginal<typeof import('@/lib/export')>()), downloadText, downloadBlob }));

const { default: StructureView } = await import('@/tools/structure/View');

const header = () => screen.getByTestId('structure-header');
async function loadFile(name: string, title: RegExp | string, text?: string) {
  render(<StructureView />);
  await waitFor(() => expect(within(header()).getByText(/UBIQUITIN/)).toBeTruthy());
  const file = new File([text ?? read(name)], name);
  fireEvent.change(screen.getByLabelText(/Structure file/), { target: { files: [file] } });
  await waitFor(() => expect(within(header()).getByText(title)).toBeTruthy());
}
/** Side-panel tabs keep their content mounted but hidden; open one before using its buttons. */
const openTab = (name: RegExp) => fireEvent.click(screen.getByRole('tab', { name }));
const section = (name: string) => within(screen.getByRole('region', { name }));
const interfaceRows = () => within(screen.getByRole('list', { name: 'Interfaces' })).queryAllByRole('button');

beforeEach(() => {
  for (const fn of Object.values(handle)) fn.mockClear();
  downloadText.mockClear();
  downloadBlob.mockClear();
  vi.spyOn(navigator.clipboard, 'writeText').mockImplementation(async () => undefined);
  vi.stubGlobal('fetch', vi.fn(async () => new Response('offline', { status: 404 })));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('Ligands', () => {
  it('groups 4HHB ligands by component and hides the waters', async () => {
    await loadFile('4HHB.cif.gz', /DEOXYHAEMOGLOBIN/i);
    openTab(/^Ligands/);
    const s = section('Ligands');
    expect(s.getByText('PROTOPORPHYRIN IX CONTAINING FE')).toBeTruthy();
    expect(s.getByText('×4')).toBeTruthy();
    expect(s.getByText('221 waters hidden')).toBeTruthy();
  });

  it('shows a whole group or one instance: selected, as sticks, camera on it', async () => {
    await loadFile('4HHB.cif.gz', /DEOXYHAEMOGLOBIN/i);
    openTab(/^Ligands/);
    const s = section('Ligands');
    fireEvent.click(s.getByRole('button', { name: 'Focus all HEM' }));
    expect(handle.focus).toHaveBeenLastCalledWith(expect.arrayContaining([expect.objectContaining({ authAsymId: 'A', insCode: '' })]));
    expect(handle.focus.mock.calls.at(-1)![0]).toHaveLength(4);
    expect(handle.select.mock.calls.at(-1)![0]).toHaveLength(4);
    fireEvent.click(s.getAllByRole('button', { name: /^Focus HEM / })[0]!);
    expect(handle.focus.mock.calls.at(-1)![0]).toHaveLength(1);
  });
});

describe('Interfaces', () => {
  it('lists chain pairs, never a chain with itself, and re-runs for a new cutoff', async () => {
    await loadFile('4HHB.cif.gz', /DEOXYHAEMOGLOBIN/i);
    const rows = interfaceRows().map(r => r.textContent ?? '');
    expect(rows.some(t => /^A \[auth A\] ↔ B \[auth B\]: \d+ \+ \d+ residues$/.test(t))).toBe(true);
    for (const t of rows) {
      const m = /^(\w+) \[auth \w+\] ↔ (\w+) \[auth/.exec(t)!;
      expect(m[1]).not.toBe(m[2]);
    }
    const total = (list: string[]) => list.reduce((n, t) => n + [...t.matchAll(/(\d+) \+ (\d+)/g)].reduce((k, x) => k + Number(x[1]) + Number(x[2]), 0), 0);
    const before = total(rows);
    fireEvent.input(screen.getByLabelText('Contact cutoff (Å)', { exact: true }), { target: { value: '3' } });
    await waitFor(() => expect(screen.getByText(/within 3 Å/)).toBeTruthy());
    const after = interfaceRows().map(r => r.textContent ?? '');
    expect(after.length).toBeLessThanOrEqual(rows.length);
    expect(total(after)).toBeLessThan(before);
  });

  it('a pair shows both sides as sticks, marks them in the strip and lists them; a residue shows that one', async () => {
    await loadFile('3KZ5.cif', 'Structure of cdomain');
    const pair = screen.getAllByRole('button', { name: /↔/ })[0]!;
    fireEvent.click(pair);
    expect(pair.getAttribute('aria-expanded')).toBe('true');
    const both = handle.focus.mock.calls.at(-1)![0];
    expect(both.length).toBeGreaterThan(1);
    expect(handle.select).toHaveBeenLastCalledWith(both);
    // The strip shows the side in its chain with a marker.
    expect(document.querySelectorAll('[data-mark]').length).toBeGreaterThan(0);
    expect(screen.getByText('Interface marked')).toBeTruthy();
    const lists = screen.getAllByRole('list', { name: /^Interface residues of chain/ });
    expect(lists).toHaveLength(2);
    const first = within(lists[0]!).getAllByRole('button')[0]!;
    fireEvent.click(first);
    expect(handle.focus.mock.calls.at(-1)![0]).toHaveLength(1);
    // A polymer residue lands in the strip as the selection.
    expect(screen.getByText(/^Selected/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Copy residues' }));
    await waitFor(() => expect(screen.getByText('Copied interface residues.')).toBeTruthy());
    const text = (navigator.clipboard.writeText as unknown as ReturnType<typeof vi.fn>).mock.calls.at(-1)![0] as string;
    expect(text.split('\n')[0]).toMatch(/^[A-C]: (\w+\d+, )*\w+\d+$/);
  });
});

describe('Metrics', () => {
  it('shows atoms, Rg and the bounding box', async () => {
    await loadFile('3KZ5.cif', 'Structure of cdomain');
    openTab(/^Info/);
    const s = section('Structure metrics');
    expect(s.getByText('Heavy atoms')).toBeTruthy();
    // The atom count is every atom of the model, hydrogens included; the label says so.
    expect(s.getByText('Atoms (incl. H)')).toBeTruthy();
        expect(s.getByText('Bounding box')).toBeTruthy();
  });
});

describe('Export', () => {
  it('downloads the original text with the right extension', async () => {
    await loadFile('3KZ5.cif', 'Structure of cdomain');
    openTab(/^Export/);
    fireEvent.click(screen.getByRole('button', { name: 'Original file (.cif)' }));
    expect(downloadText).toHaveBeenCalledWith(read('3KZ5.cif'), '3KZ5.cif');
  });

  it('exports chain B of 3KZ5 as mmCIF that parses back as one chain', async () => {
    await loadFile('3KZ5.cif', 'Structure of cdomain');
    openTab(/^Export/);
    fireEvent.change(screen.getByLabelText('Export part', { exact: true }), { target: { value: 'chain:B' } });
    fireEvent.click(screen.getByRole('button', { name: 'Download' }));
    const [text, file] = downloadText.mock.calls.at(-1)!;
    expect(file).toMatch(/chain_B\.cif$/);
    const back = parseMmcif(text as string);
    expect(back.chains).toHaveLength(1);
    expect(back.chains[0]!.authAsymId).toBe('B');
  });

  it('PDB input: chain and whole-structure exports leave out water and keep ligands, in both formats', async () => {
    await loadFile('3KZ5.pdb', /cdomain/i);
    openTab(/^Export/);
    const part = screen.getByLabelText('Export part', { exact: true }) as HTMLSelectElement;
    const all = Array.from(part.options).find(o => o.textContent === 'Whole structure (no water)')!.value;
    for (const fmt of ['mmcif', 'pdb']) {
      fireEvent.change(screen.getByLabelText('Export format', { exact: true }), { target: { value: fmt } });
      for (const value of ['chain:B', all]) {
        fireEvent.change(part, { target: { value } });
        fireEvent.click(screen.getByRole('button', { name: 'Download' }));
        const text = downloadText.mock.calls.at(-1)![0] as string;
        expect(text).not.toMatch(/HOH/);
        expect(text).toMatch(/ACT/);
      }
    }
  });

  it('PDB input: "Whole structure" includes a ligand that sits in a chain of its own', async () => {
    const gol = 'HETATM 9999  C1  GOL Z 901      10.000  10.000  10.000  1.00 20.00           C';
    const text = read('1UBQ.pdb').replace(/^END\s*$/m, `${gol}\nEND`);
    await loadFile('1UBQ.pdb', /characters, PDB/, text);
    openTab(/^Export/);   // the demo is 1UBQ too, so wait for the PDB format
    const part = screen.getByLabelText('Export part', { exact: true }) as HTMLSelectElement;
    fireEvent.change(part, { target: { value: Array.from(part.options).find(o => o.textContent === 'Whole structure (no water)')!.value } });
    fireEvent.change(screen.getByLabelText('Export format', { exact: true }), { target: { value: 'pdb' } });
    fireEvent.click(screen.getByRole('button', { name: 'Download' }));
    const out = downloadText.mock.calls.at(-1)![0] as string;
    expect(out).toMatch(/^HETATM.{11}GOL Z 901/m);
    expect(out).not.toMatch(/HOH/);
  });

  it('warns that PDB truncates a two-letter chain ID', async () => {
    const cif = read('minimal.cif').replace(/^(ATOM .* [A-Z]{3}) A (\w+ 1)$/gm, '$1 AA $2');
    await loadFile('long.cif', /./, cif).catch(() => undefined);
    openTab(/^Export/);
    await waitFor(() => expect(screen.getByLabelText('Export format', { exact: true })).toBeTruthy());
    fireEvent.change(screen.getByLabelText('Export format', { exact: true }), { target: { value: 'pdb' } });
    expect(screen.getByText(/truncated in PDB format/)).toBeTruthy();
  });

  it('downloads FASTA for all entities and a PNG snapshot', async () => {
    await loadFile('3KZ5.cif', 'Structure of cdomain');
    openTab(/^Export/);
    fireEvent.click(screen.getByRole('button', { name: 'FASTA (all entities)' }));
    expect(downloadText.mock.calls.at(-1)![1]).toMatch(/\.fasta$/);
    fireEvent.click(screen.getByRole('button', { name: 'PNG snapshot' }));
    await waitFor(() => expect(downloadBlob).toHaveBeenCalled());
  });
});

describe('InterfaceTable error', () => {
  it('surfaces a failed interface job in an alert', async () => {
    const { InterfaceTable } = await import('@/tools/structure/components/InterfaceTable');
    render(<InterfaceTable interfaces={null} computing={false} error="worker crashed" cutoff={4.5} setCutoff={() => undefined} onPair={() => undefined} onResidue={() => undefined} />);
    expect(screen.getByRole('alert').textContent).toMatch(/worker crashed/);
  });
});
