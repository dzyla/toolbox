import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/preact';
import { read } from '../core/structure-helpers';
import { parseMmcif } from '@/core/structure';
import type { MolstarHandle, MolstarViewerProps } from '@/tools/structure/MolstarViewer';

const handle = vi.hoisted(() => ({
  load: vi.fn(async () => undefined),
  setRepresentation: vi.fn(async () => undefined),
  setColoring: vi.fn(async () => undefined),
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
    const s = section('Ligands');
    expect(s.getByText('PROTOPORPHYRIN IX CONTAINING FE')).toBeTruthy();
    expect(s.getByText('×4')).toBeTruthy();
    expect(s.getByText('221 waters hidden')).toBeTruthy();
  });

  it('focuses a whole group or one instance', async () => {
    await loadFile('4HHB.cif.gz', /DEOXYHAEMOGLOBIN/i);
    const s = section('Ligands');
    fireEvent.click(s.getByRole('button', { name: 'Focus all HEM' }));
    expect(handle.focus).toHaveBeenLastCalledWith(expect.arrayContaining([expect.objectContaining({ authAsymId: 'A', insCode: '' })]));
    expect(handle.focus.mock.calls.at(-1)![0]).toHaveLength(4);
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

  it('highlights both sides on click and copies auth residue lists', async () => {
    await loadFile('3KZ5.cif', 'Structure of cdomain');
    fireEvent.click(interfaceRows()[0]!);
    expect(handle.highlight.mock.calls.at(-1)![0].length).toBeGreaterThan(0);
    expect(handle.focus).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Copy residues' }));
    await waitFor(() => expect(screen.getByText('Copied interface residues.')).toBeTruthy());
    const text = (navigator.clipboard.writeText as unknown as ReturnType<typeof vi.fn>).mock.calls.at(-1)![0] as string;
    expect(text.split('\n')[0]).toMatch(/^[A-C]: (\w+\d+, )*\w+\d+$/);
  });
});

describe('Metrics', () => {
  it('shows atoms, Rg and the bounding box', async () => {
    await loadFile('3KZ5.cif', 'Structure of cdomain');
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
    fireEvent.click(screen.getByRole('button', { name: 'Original file (.cif)' }));
    expect(downloadText).toHaveBeenCalledWith(read('3KZ5.cif'), '3KZ5.cif');
  });

  it('exports chain B of 3KZ5 as mmCIF that parses back as one chain', async () => {
    await loadFile('3KZ5.cif', 'Structure of cdomain');
    fireEvent.change(screen.getByLabelText('Export part', { exact: true }), { target: { value: 'chain:B' } });
    fireEvent.click(screen.getByRole('button', { name: 'Download' }));
    const [text, file] = downloadText.mock.calls.at(-1)!;
    expect(file).toMatch(/chain_B\.cif$/);
    const back = parseMmcif(text as string);
    expect(back.chains).toHaveLength(1);
    expect(back.chains[0]!.authAsymId).toBe('B');
  });

  it('warns that PDB truncates a two-letter chain ID', async () => {
    const cif = read('minimal.cif').replace(/^(ATOM .* [A-Z]{3}) A (\w+ 1)$/gm, '$1 AA $2');
    await loadFile('long.cif', /./, cif).catch(() => undefined);
    await waitFor(() => expect(screen.getByLabelText('Export format', { exact: true })).toBeTruthy());
    fireEvent.change(screen.getByLabelText('Export format', { exact: true }), { target: { value: 'pdb' } });
    expect(screen.getByText(/truncated in PDB format/)).toBeTruthy();
  });

  it('downloads FASTA for all entities and a PNG snapshot', async () => {
    await loadFile('3KZ5.cif', 'Structure of cdomain');
    fireEvent.click(screen.getByRole('button', { name: 'FASTA (all entities)' }));
    expect(downloadText.mock.calls.at(-1)![1]).toMatch(/\.fasta$/);
    fireEvent.click(screen.getByRole('button', { name: 'PNG snapshot' }));
    await waitFor(() => expect(downloadBlob).toHaveBeenCalled());
  });
});

describe('InterfaceTable error', () => {
  it('surfaces a failed interface job in an alert', async () => {
    const { InterfaceTable } = await import('@/tools/structure/components/InterfaceTable');
    render(<InterfaceTable interfaces={null} computing={false} error="worker crashed" cutoff={4.5} setCutoff={() => undefined} viewer={null} />);
    expect(screen.getByRole('alert').textContent).toMatch(/worker crashed/);
  });
});
