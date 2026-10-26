import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/preact';
import { read } from '../core/structure-helpers';
import { parseMmcif, toFasta, type ResidueRef, type StructureModel } from '@/core/structure';
import type { MolstarHandle, MolstarViewerProps } from '@/tools/structure/MolstarViewer';

// 3KZ5 numbering used below (from the fixture's _pdbx_poly_seq_scheme): label seq n ↔ auth n + 270
// up to label 28 (auth 298); auth 299 is skipped, so label 29 ↔ auth 300 … label 52 ↔ auth 323.
// Chains: label A = auth E, label B = auth B, label C = auth A.

const handle = vi.hoisted(() => ({
  load: vi.fn(async () => undefined),
  setRepresentation: vi.fn(async () => undefined),
  setColoring: vi.fn(async () => undefined),
  highlight: vi.fn(),
  select: vi.fn(),
  focus: vi.fn(),
  snapshot: vi.fn(async () => new Blob([], { type: 'image/png' })),
}));
/** The props the View last passed to the (fake) Mol* viewer, so tests can play Mol* events. */
const viewerProps = vi.hoisted(() => ({ current: null as MolstarViewerProps | null }));

vi.mock('@/tools/structure/MolstarViewer', async () => {
  const { useEffect } = await import('preact/hooks');
  return {
    MolstarViewer: (props: MolstarViewerProps) => {
      viewerProps.current = props;
      useEffect(() => { props.onReady(handle as unknown as MolstarHandle); }, []);
      return <div data-testid="fake-molstar" aria-label={`Mol* 3D viewer: ${props.label}`} />;
    },
  };
});

const downloadText = vi.hoisted(() => vi.fn());
vi.mock('@/lib/export', async importOriginal => ({ ...(await importOriginal<typeof import('@/lib/export')>()), downloadText }));

const { default: StructureView } = await import('@/tools/structure/View');
const { EntityTable } = await import('@/tools/structure/components/EntityTable');

const header = () => screen.getByTestId('structure-header');
const residue = (name: string) => screen.getByRole('button', { name, exact: true });
const ref = (authAsymId: string, authSeqId: number): ResidueRef => ({ authAsymId, authSeqId, insCode: '' });

async function loadFile(name: string, title: RegExp | string) {
  render(<StructureView />);
  await waitFor(() => expect(within(header()).getByText(/UBIQUITIN/)).toBeTruthy());
  const file = new File([read(name)], name);
  fireEvent.change(screen.getByLabelText(/Structure file/), { target: { files: [file] } });
  await waitFor(() => expect(within(header()).getByText(title)).toBeTruthy());
}
const load3kz5 = () => loadFile('3KZ5.cif', 'Structure of cdomain');
const pickChain = (labelAsymId: string) =>
  fireEvent.change(screen.getByLabelText('Chain', { exact: true }), { target: { value: labelAsymId } });

let writeText: ReturnType<typeof vi.fn<(text: string) => Promise<void>>>;
beforeEach(() => {
  for (const fn of Object.values(handle)) fn.mockClear();
  downloadText.mockClear();
  writeText = vi.fn(async (_text: string) => undefined);
  vi.spyOn(navigator.clipboard, 'writeText').mockImplementation(writeText);
  vi.stubGlobal('fetch', vi.fn(async () => new Response('offline', { status: 404 })));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('Sequence panel', () => {
  it('groups chains by entity in the chain picker, with label and auth IDs', async () => {
    await load3kz5();
    const group = document.querySelector('optgroup');
    expect(group?.getAttribute('label')).toBe('Entity 1 · Protein sopB · chains A, B, C (3 copies)');
    const options = Array.from(group!.querySelectorAll('option')).map(o => o.textContent);
    expect(options).toEqual(['A [auth E]', 'B [auth B]', 'C [auth A]']);
  });

  it('marks unmodelled residues of chain C (auth A) as not modelled, lower-case', async () => {
    await load3kz5();
    pickChain('C');
    for (const name of ['Residue A 271 GLY', 'Residue A 272 SER', 'Residue A 273 HIS', 'Residue A 274 MET', 'Residue A 323 PRO']) {
      const el = residue(name);
      expect(el.getAttribute('title')).toBe('Not modelled');
      expect(el.textContent).toBe(el.textContent!.toLowerCase());
    }
    expect(residue('Residue A 275 SER').getAttribute('title')).toBeNull();
    expect(residue('Residue A 275 SER').textContent).toBe('S');
    expect(screen.getAllByRole('button', { name: /^Residue A / })).toHaveLength(52);
  });

  it('click then shift-click selects a range in Mol*; Copy selection writes its FASTA', async () => {
    await load3kz5();
    pickChain('C');
    fireEvent.click(residue('Residue A 275 SER'));
    expect(handle.select).toHaveBeenLastCalledWith([ref('A', 275)]);
    fireEvent.click(residue('Residue A 280 PHE'), { shiftKey: true });
    const six = [275, 276, 277, 278, 279, 280].map(n => ref('A', n));
    expect(handle.select).toHaveBeenLastCalledWith(six);
    expect(handle.focus).toHaveBeenLastCalledWith(six);
    for (const n of [275, 280]) expect(screen.getByRole('button', { name: new RegExp(`^Residue A ${n} `) }).getAttribute('aria-pressed')).toBe('true');
    expect(residue('Residue A 281 ALA').getAttribute('aria-pressed')).toBe('false');

    fireEvent.change(screen.getByLabelText('FASTA scope', { exact: true }), { target: { value: 'selection' } });
    fireEvent.click(screen.getByRole('button', { name: 'Copy FASTA' }));
    const model = parseMmcif(read('3KZ5.cif'), '3KZ5');
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(toFasta(model, { kind: 'range', labelAsymId: 'C', from: 5, to: 10 })));
    const exportBox = screen.getByRole('group', { name: 'FASTA export' });
    await waitFor(() => expect(within(exportBox).getByRole('status').textContent).toMatch(/Copied/));
  });

  it('a range over unmodelled residues sends only the modelled ones to Mol*', async () => {
    await load3kz5();
    pickChain('C');
    fireEvent.click(residue('Residue A 272 SER'));
    expect(handle.select).toHaveBeenLastCalledWith([]);
    fireEvent.click(residue('Residue A 276 SER'), { shiftKey: true });
    expect(handle.select).toHaveBeenLastCalledWith([ref('A', 275), ref('A', 276)]);
  });

  it('dragging across the strip extends the selection', async () => {
    await load3kz5();
    pickChain('B');
    fireEvent.pointerDown(residue('Residue B 280 PHE'), { pointerType: 'mouse', button: 0 });
    fireEvent.pointerOver(residue('Residue B 282 PRO'), { pointerType: 'mouse', buttons: 1 });
    fireEvent.pointerOver(residue('Residue B 283 GLY'), { pointerType: 'mouse', buttons: 1 });
    fireEvent.pointerUp(window, { pointerType: 'mouse' });
    expect(handle.select).toHaveBeenLastCalledWith([280, 281, 282, 283].map(n => ref('B', n)));
    expect(residue('Residue B 281 ALA').getAttribute('aria-pressed')).toBe('true');
  });

  it('a Mol* click on chain E switches the strip to label chain A and selects the residue', async () => {
    await load3kz5();
    pickChain('C');
    act(() => viewerProps.current!.onResidueClick!(ref('E', 290)));
    expect((screen.getByLabelText('Chain', { exact: true }) as HTMLSelectElement).value).toBe('A');
    await waitFor(() => expect(residue('Residue E 290 GLY').getAttribute('aria-pressed')).toBe('true'));
    expect(handle.select).toHaveBeenLastCalledWith([ref('E', 290)]);
  });

  it('keyboard: one tab stop; arrows move focus, shift+arrows extend the selection', async () => {
    await load3kz5();
    const first = residue('Residue E 271 GLY');
    expect(first.tabIndex).toBe(0);
    expect(residue('Residue E 272 SER').tabIndex).toBe(-1);
    fireEvent.click(residue('Residue E 275 SER'));
    await waitFor(() => expect(residue('Residue E 275 SER').tabIndex).toBe(0));
    fireEvent.keyDown(residue('Residue E 275 SER'), { key: 'ArrowRight', shiftKey: true });
    fireEvent.keyDown(residue('Residue E 276 SER'), { key: 'ArrowRight', shiftKey: true });
    expect(handle.select).toHaveBeenLastCalledWith([275, 276, 277].map(n => ref('E', n)));
    await waitFor(() => expect(document.activeElement).toBe(residue('Residue E 277 ARG')));
    fireEvent.click(screen.getByRole('button', { name: 'Clear selection' }));
    expect(handle.select).toHaveBeenLastCalledWith([]);
    expect(residue('Residue E 275 SER').getAttribute('aria-pressed')).toBe('false');
  });

  it('a Mol* click on a ligand or empty space leaves the selection alone', async () => {
    await load3kz5();
    fireEvent.click(residue('Residue E 280 PHE'));
    handle.select.mockClear();
    act(() => viewerProps.current!.onResidueClick!(null));
    act(() => viewerProps.current!.onResidueClick!(ref('A', 1)));   // no polymer residue A 1 in 3KZ5
    expect(handle.select).not.toHaveBeenCalled();
    expect(residue('Residue E 280 PHE').getAttribute('aria-pressed')).toBe('true');
  });

  it('hovering the strip highlights in Mol*; a Mol* hover marks the residue in the strip', async () => {
    await load3kz5();
    fireEvent.pointerOver(residue('Residue E 275 SER'), { pointerType: 'mouse' });
    expect(handle.highlight).toHaveBeenLastCalledWith([ref('E', 275)]);
    fireEvent.pointerLeave(screen.getByRole('group', { name: /^Sequence of chain A/ }));
    expect(handle.highlight).toHaveBeenLastCalledWith([]);
    act(() => viewerProps.current!.onResidueHover!(ref('E', 300)));
    await waitFor(() => expect(residue('Residue E 300 ARG').hasAttribute('data-hl')).toBe(true));
  });

  it('auth / label numbering toggle changes the row numbers', async () => {
    await load3kz5();
    const strip = screen.getByRole('group', { name: /^Sequence of chain A/ });
    expect(strip.textContent).toContain('271');
    fireEvent.click(screen.getByRole('button', { name: 'label', exact: true }));
    expect(strip.textContent).not.toContain('271');
    expect(screen.getByRole('button', { name: 'label', exact: true }).getAttribute('aria-pressed')).toBe('true');
  });

  it('minimal.cif: MSE shows the parent letter M with a modified-residue title', async () => {
    await loadFile('minimal.cif', 'minimal');
    const mse = residue('Residue A 3 MSE');
    expect(mse.textContent).toBe('M');
    expect(mse.getAttribute('title')).toBe('MSE (modified, parent MET)');
    // The header card lists the parser warning about chain B's numbering jump.
    expect(within(header()).getByText('Chain B: residue numbering jumps 3→7; the file has no deposited sequence, so gaps cannot be shown')).toBeTruthy();
  });

  it('"Modelled only" with "drop gaps" downloads the 47 modelled residues of chain C', async () => {
    await load3kz5();
    pickChain('C');
    fireEvent.change(screen.getByLabelText('FASTA scope', { exact: true }), { target: { value: 'chain' } });
    fireEvent.click(screen.getByRole('button', { name: 'Modelled only' }));
    fireEvent.click(screen.getByRole('button', { name: 'drop gaps' }));
    fireEvent.click(screen.getByRole('button', { name: 'Download .fasta' }));
    expect(downloadText).toHaveBeenCalledTimes(1);
    const [text, filename] = downloadText.mock.calls[0] as [string, string];
    const lines = text.trim().split('\n');
    expect(lines[0]).toBe('>3KZ5_1 | Chain C [auth A] | Protein sopB');
    expect(lines[1]).toHaveLength(47);
    expect(lines[1]).toBe('SSRHQFAPGATVLYKGDKMVLNLDRSRVPTECIEKIEAILKELEKPA');
    expect(filename).toBe('3KZ5_chain_C.fasta');
  });
});

describe('Entity table', () => {
  it('lists each entity with kind, description, chains (auth IDs), length and modelled counts', async () => {
    await load3kz5();
    const table = screen.getByRole('table', { name: 'Entities' });
    const row = within(table).getByRole('row', { name: /Protein sopB/ });
    expect(row.textContent).toContain('Protein');
    expect(row.textContent).toContain('A [auth E]');
    expect(row.textContent).toContain('C [auth A]');
    expect(row.textContent).toContain('52');
    expect(row.textContent).toMatch(/48.*47.*47/);
    expect(within(table).getByRole('row', { name: /ACETATE ION/ })).toBeTruthy();
    expect(screen.queryByRole('searchbox', { name: 'Filter chains' })).toBeNull();
  });

  it('shows a chain filter when there are more than 8 chains', () => {
    const base = parseMmcif(read('3KZ5.cif'), '3KZ5');
    const chains = Array.from({ length: 9 }, (_, i) => ({ ...base.chains[0]!, labelAsymId: `L${i}`, authAsymId: `Q${i}` }));
    const model: StructureModel = {
      ...base,
      chains,
      entities: [{ ...base.entities[0]!, labelAsymIds: chains.map(c => c.labelAsymId) }],
    };
    render(<EntityTable model={model} />);
    const box = screen.getByRole('searchbox', { name: 'Filter chains' });
    fireEvent.input(box, { target: { value: 'Q3' } });
    const table = screen.getByRole('table', { name: 'Entities' });
    expect(table.textContent).toContain('L3 [auth Q3]');
    expect(table.textContent).not.toContain('L4 [auth Q4]');
  });
});
