import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/preact';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { read } from '../core/structure-helpers';
import type { MolstarHandle, MolstarViewerProps } from '@/tools/structure/MolstarViewer';

// A fake Mol*: hands the View a handle of spies as soon as it mounts.
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

/** When `defer` is set, the fake Mol* keeps its handle until the test calls `ready.fire()`. */
const ready = vi.hoisted(() => ({ defer: false, fire: () => undefined as void }));

vi.mock('@/tools/structure/MolstarViewer', async () => {
  const { useEffect } = await import('preact/hooks');
  return {
    MolstarViewer: (props: MolstarViewerProps) => {
      useEffect(() => {
        const give = () => props.onReady(handle as unknown as MolstarHandle);
        if (ready.defer) ready.fire = give; else give();
      }, []);
      return <div data-testid="fake-molstar" aria-label={`Mol* 3D viewer: ${props.label}`} />;
    },
  };
});

const downloadBlob = vi.hoisted(() => vi.fn());
vi.mock('@/lib/export', async importOriginal => ({ ...(await importOriginal<typeof import('@/lib/export')>()), downloadBlob }));

const { default: StructureView } = await import('@/tools/structure/View');

const FIXTURES = join(__dirname, '..', 'fixtures', 'structure');
/** RCSB text for an ID from tests/fixtures/structure (`.cif` or `.cif.gz`), or null. */
function fixture(id: string): string | null {
  if (existsSync(join(FIXTURES, `${id}.cif`))) return read(`${id}.cif`);
  if (existsSync(join(FIXTURES, `${id}.cif.gz`))) return read(`${id}.cif.gz`);
  return null;
}

type Fetch = (url: string) => Promise<Response>;
const serveFixtures: Fetch = async url => {
  const id = /\/download\/([^/]+)\.cif$/.exec(url)?.[1] ?? '';
  const text = fixture(id);
  return text === null ? new Response('missing', { status: 404 }) : new Response(text, { status: 200 });
};
let fetchMock: ReturnType<typeof vi.fn<Fetch>>;

const header = () => screen.getByTestId('structure-header');
/** The example entries are one picker above the viewer. */
const pickExample = (id: string) => fireEvent.change(screen.getByLabelText('Examples', { exact: true }), { target: { value: id } });
const UBQ_TITLE = 'STRUCTURE OF UBIQUITIN REFINED AT 1.8 ANGSTROMS RESOLUTION';

async function renderLoaded() {
  render(<StructureView />);
  await waitFor(() => expect(within(header()).getByText(UBQ_TITLE)).toBeTruthy());
}

beforeEach(() => {
  ready.defer = false;
  for (const fn of Object.values(handle)) fn.mockClear();
  downloadBlob.mockClear();
  fetchMock = vi.fn<Fetch>(serveFixtures);
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('Structure viewer', () => {
  it('opens on the bundled 1UBQ with its header and loads it into Mol* as mmCIF', async () => {
    await renderLoaded();
    expect(fetchMock).not.toHaveBeenCalled();
    const card = header();
    expect(within(card).getByText('1UBQ')).toBeTruthy();
    expect(within(card).getByText('X-RAY DIFFRACTION')).toBeTruthy();
    expect(within(card).getByText('1.8 Å')).toBeTruthy();
    expect(within(card).getByText('Homo sapiens')).toBeTruthy();
    expect(within(card).getByText('1987-01-02')).toBeTruthy();
    await waitFor(() => expect(handle.load).toHaveBeenCalledWith(expect.stringContaining('data_1UBQ'), 'mmcif', '1UBQ', 0));
    // One preset list, each preset addressable by ID and name; no model picker for a single model.
    expect(screen.getByRole('option', { name: '4HHB Hemoglobin' })).toBeTruthy();
    expect(screen.getAllByRole('option', { name: /4HHB/ })).toHaveLength(1);
    expect((screen.getByLabelText('Examples', { exact: true }) as HTMLSelectElement).value).toBe('1UBQ');
    expect(screen.queryByLabelText('Model', { exact: true })).toBeNull();
    // The old external "Mol* Viewer Tab" link is gone (everything renders locally).
    expect(document.querySelector('a[href*="molstar.org/viewer"]')).toBeNull();
  });

  it('typing an ID and pressing Enter fetches <ID>.cif from RCSB', async () => {
    await renderLoaded();
    const box = screen.getByLabelText('PDB ID', { exact: true });
    fireEvent.input(box, { target: { value: '3kz5' } });
    fireEvent.submit(box.closest('form')!);
    await waitFor(() => expect(within(header()).getByText('Structure of cdomain')).toBeTruthy());
    expect(fetchMock).toHaveBeenCalledWith('https://files.rcsb.org/download/3KZ5.cif');
    await waitFor(() => expect(handle.load).toHaveBeenLastCalledWith(expect.any(String), 'mmcif', '3KZ5', 0));
  });

  it('picking an example fetches its entry', async () => {
    await renderLoaded();
    pickExample('4HHB');
    await waitFor(() => expect(within(header()).getByText(/DEOXYHAEMOGLOBIN/)).toBeTruthy());
    expect(within(header()).getByText('1.74 Å')).toBeTruthy();
    expect(within(header()).getByText(/4 polymer chains/)).toBeTruthy();
  });

  it('dragging over the tool shows the overlay; dropping a CIF anywhere on it loads the file', async () => {
    await renderLoaded();
    const root = screen.getByTestId('structure-tool');
    fireEvent.dragEnter(root, { dataTransfer: { files: [], types: ['Files'] } });
    expect(screen.getByText('Drop a .cif, .pdb or .gz file')).toBeTruthy();
    const file = new File([read('3KZ5.cif')], '3KZ5.cif');
    fireEvent.drop(root, { dataTransfer: { files: [file], types: ['Files'] } });
    expect(screen.queryByText('Drop a .cif, .pdb or .gz file')).toBeNull();
    await waitFor(() => expect(within(header()).getByText('Structure of cdomain')).toBeTruthy());
    await waitFor(() => expect(handle.load).toHaveBeenLastCalledWith(expect.any(String), 'mmcif', '3KZ5', 0));
  });

  it('leaving the window hides the drop overlay', async () => {
    await renderLoaded();
    const root = screen.getByTestId('structure-tool');
    fireEvent.dragEnter(root, { dataTransfer: { files: [], types: ['Files'] } });
    expect(screen.getByText('Drop a .cif, .pdb or .gz file')).toBeTruthy();
    fireEvent.dragLeave(root, { relatedTarget: null });
    expect(screen.queryByText('Drop a .cif, .pdb or .gz file')).toBeNull();
  });

  it('dropping a PNG shows an error and keeps 1UBQ', async () => {
    await renderLoaded();
    const png = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])], 'photo.png', { type: 'image/png' });
    fireEvent.drop(screen.getByTestId('structure-tool'), { dataTransfer: { files: [png], types: ['Files'] } });
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/photo\.png is not a structure file/);
    expect(within(header()).getByText(UBQ_TITLE)).toBeTruthy();
  });

  it('a failed fetch keeps the previous structure; the next successful load clears the error', async () => {
    await renderLoaded();
    const box = screen.getByLabelText('PDB ID', { exact: true });
    fireEvent.input(box, { target: { value: '9ZZZ' } });
    fireEvent.submit(box.closest('form')!);
    expect((await screen.findByRole('alert')).textContent).toMatch(/RCSB has no entry 9ZZZ/);
    expect(within(header()).getByText(UBQ_TITLE)).toBeTruthy();
    fireEvent.input(box, { target: { value: '3KZ5' } });
    fireEvent.submit(box.closest('form')!);
    await waitFor(() => expect(within(header()).getByText('Structure of cdomain')).toBeTruthy());
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('a slow earlier fetch never replaces a later one', async () => {
    await renderLoaded();
    let releaseSlow: () => void = () => undefined;
    fetchMock.mockImplementation(async url => {
      if (url.includes('4HHB')) await new Promise<void>(r => { releaseSlow = r; });
      return serveFixtures(url);
    });
    pickExample('4HHB');
    pickExample('1CRN');
    await waitFor(() => expect(handle.load).toHaveBeenLastCalledWith(expect.any(String), 'mmcif', '1CRN', 0));
    releaseSlow();
    await new Promise(r => setTimeout(r, 50));
    expect(handle.load).toHaveBeenLastCalledWith(expect.any(String), 'mmcif', '1CRN', 0);
    expect(within(header()).getByText('1CRN')).toBeTruthy();
  });

  it('an NMR ensemble gets a model picker; picking model 2 reloads Mol* with model index 1', async () => {
    await renderLoaded();
    const file = new File([read('1L2Y.cif.gz')], '1L2Y.cif');
    fireEvent.change(screen.getByLabelText(/Structure file/), { target: { files: [file] } });
    await waitFor(() => expect(screen.getByText('Model 1 of 38')).toBeTruthy());
    const picker = screen.getByLabelText('Model', { exact: true });
    fireEvent.change(picker, { target: { value: '1' } });
    await waitFor(() => expect(handle.load).toHaveBeenLastCalledWith(expect.any(String), 'mmcif', '1L2Y', 1));
  });

  it('display controls drive Mol*: colour and representation', async () => {
    await renderLoaded();
    fireEvent.change(screen.getByLabelText('Colour', { exact: true }), { target: { value: 'entity-id' } });
    expect(handle.setColoring).toHaveBeenCalledWith('entity-id');
    fireEvent.change(screen.getByLabelText('Representation style', { exact: true }), { target: { value: 'surface' } });
    expect(handle.setRepresentation).toHaveBeenCalledWith('surface');
    expect(screen.getByRole('button', { name: 'Mol* panels' })).toBeTruthy();
  });

  it('hydrogens: disabled for a file without them; a toggle reaches Mol* for one with them', async () => {
    await renderLoaded();
    const h = screen.getByRole('button', { name: 'Hydrogens' }) as HTMLButtonElement;
    expect(h.disabled).toBe(true);   // 1UBQ is an X-ray entry without hydrogens
    const file = new File([read('1L2Y.cif.gz')], '1L2Y.cif');   // NMR: hydrogens modelled
    fireEvent.change(screen.getByLabelText(/Structure file/), { target: { files: [file] } });
    await waitFor(() => expect((screen.getByRole('button', { name: 'Hydrogens' }) as HTMLButtonElement).disabled).toBe(false));
    expect(screen.getByRole('button', { name: 'Hydrogens' }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Hydrogens' }));
    expect(handle.setHydrogens).toHaveBeenLastCalledWith(false);
    expect(screen.getByRole('button', { name: 'Hydrogens' }).getAttribute('aria-pressed')).toBe('false');
  });

  it('B-factor colouring gets the 2nd–98th percentile range of the file, with a legend', async () => {
    await renderLoaded();
    fireEvent.change(screen.getByLabelText('Colour', { exact: true }), { target: { value: 'uncertainty' } });
    const [name, scale] = handle.setColoring.mock.calls.at(-1)! as unknown as [string, { domain: [number, number] }];
    expect(name).toBe('uncertainty');
    expect(scale.domain[0]).toBeGreaterThan(0);
    expect(scale.domain[1]).toBeGreaterThan(scale.domain[0]);
    expect(within(screen.getByTestId('colour-legend')).getByText('B-factor (Å²)')).toBeTruthy();
  });

  it('pLDDT is offered only for a predicted model, falls back to Default for an experimental one', async () => {
    await renderLoaded();
    const colour = () => screen.getByLabelText('Colour', { exact: true }) as HTMLSelectElement;
    const offered = () => Array.from(colour().options).some(o => o.value === 'plddt');
    expect(offered()).toBe(false);
    // A bare model file (ColabFold-style PDB: no header, no water) with pLDDT in the B-factor column.
    const atoms = read('1UBQ.pdb').split('\n').filter(l => l.startsWith('ATOM')).map((l, i) => `${l.slice(0, 60)}${(40 + (i % 60)).toFixed(2).padStart(6)}${l.slice(66)}`);
    fireEvent.change(screen.getByLabelText(/Structure file/), { target: { files: [new File([`${atoms.join('\n')}\nEND\n`], 'ranked_0.pdb')] } });
    await waitFor(() => expect(offered()).toBe(true));
    expect(screen.getByText('Predicted model · pLDDT available')).toBeTruthy();
    fireEvent.change(colour(), { target: { value: 'plddt' } });
    expect(handle.setColoring).toHaveBeenLastCalledWith('plddt', expect.objectContaining({ plddtScale: 1 }));
    expect(within(screen.getByTestId('colour-legend')).getByText('Very high (> 90)')).toBeTruthy();
    pickExample('4HHB');
    await waitFor(() => expect(within(header()).getByText(/DEOXYHAEMOGLOBIN/)).toBeTruthy());
    await waitFor(() => expect(colour().value).toBe(''));
    expect(handle.setColoring).toHaveBeenLastCalledWith(null);
    expect(offered()).toBe(false);
  });

  it('colour starts at "Default" (Mol* preset colouring) and every colour, Chain included, can be picked', async () => {
    await renderLoaded();
    const colour = screen.getByLabelText('Colour', { exact: true }) as HTMLSelectElement;
    expect(colour.value).toBe('');
    expect(colour.selectedOptions[0]!.textContent).toBe('Default');
    // Nothing was replayed onto Mol*: both settings are still the defaults.
    expect(handle.setColoring).not.toHaveBeenCalled();
    expect(handle.setRepresentation).not.toHaveBeenCalled();
    fireEvent.change(colour, { target: { value: 'chain-id' } });
    expect(handle.setColoring).toHaveBeenLastCalledWith('chain-id');
    fireEvent.change(colour, { target: { value: '' } });
    expect(handle.setColoring).toHaveBeenLastCalledWith(null);
    expect(colour.value).toBe('');
  });

  it('display choices made before Mol* is ready are applied once its handle arrives', async () => {
    ready.defer = true;
    await renderLoaded();
    fireEvent.change(screen.getByLabelText('Representation style', { exact: true }), { target: { value: 'surface' } });
    fireEvent.change(screen.getByLabelText('Colour', { exact: true }), { target: { value: 'entity-id' } });
    expect(handle.setRepresentation).not.toHaveBeenCalled();
    act(() => ready.fire());
    await waitFor(() => expect(handle.load).toHaveBeenCalled());
    expect(handle.setRepresentation).toHaveBeenCalledTimes(1);
    expect(handle.setRepresentation).toHaveBeenCalledWith('surface');
    expect(handle.setColoring).toHaveBeenCalledTimes(1);
    expect(handle.setColoring).toHaveBeenCalledWith('entity-id');
    // The style reaches Mol* before the structure does, so the load uses it.
    expect(handle.setRepresentation.mock.invocationCallOrder[0]).toBeLessThan(handle.load.mock.invocationCallOrder[0]!);
  });

  it('viewer size: Medium by default; Small and Large change the workspace and are remembered', async () => {
    localStorage.removeItem('bb.structure.viewerSize');
    await renderLoaded();
    const size = (name: string) => screen.getByRole('button', { name, exact: true });
    expect(size('Medium').getAttribute('aria-pressed')).toBe('true');
    const workspace = () => screen.getByTestId('fake-molstar').closest('.grid') as HTMLElement;
    expect(workspace().className).toContain('min(40rem');
    fireEvent.click(size('Small'));
    expect(size('Small').getAttribute('aria-pressed')).toBe('true');
    expect(workspace().className).toContain('lg:h-[28rem]');
    fireEvent.click(size('Large'));
    expect(workspace().className).toContain('100dvh-6rem');
    expect(localStorage.getItem('bb.structure.viewerSize')).toBe('large');
    cleanup();
    await renderLoaded();
    expect(size('Large').getAttribute('aria-pressed')).toBe('true');
    localStorage.removeItem('bb.structure.viewerSize');
  });

  it('snapshot downloads the Mol* PNG as <name>.png', async () => {
    await renderLoaded();
    fireEvent.click(screen.getByRole('button', { name: /Snapshot/ }));
    await waitFor(() => expect(downloadBlob).toHaveBeenCalledWith(expect.any(Blob), '1UBQ.png'));
    expect(handle.snapshot).toHaveBeenCalled();
  });
});

// Parsing off the main thread: a fake Worker whose parse replies are released by hand, so a
// superseded parse can be made to finish after a newer request.
describe('Structure viewer with an asynchronous parse worker', () => {
  interface Held { input: unknown; reply(opts?: { evenIfTerminated?: boolean }): Promise<void> }
  let held: Held[] = [];
  let hold = false;

  /** Runs the same functions as parse.worker.ts / interface.worker.ts; parse replies wait in `held` while `hold` is set. */
  class FakeWorker {
    onmessage: ((ev: MessageEvent) => void) | null = null;
    onerror: ((ev: ErrorEvent) => void) | null = null;
    terminated = false;
    private readonly parse: boolean;
    constructor(url: URL | string) { this.parse = String(url).includes('parse.worker'); }
    postMessage(input: unknown) {
      // evenIfTerminated: the reply was already queued when the worker was terminated.
      const reply = async ({ evenIfTerminated = false } = {}) => {
        if (this.terminated && !evenIfTerminated) return;
        const job = await import('@/tools/structure/job-compute');
        const run = (this.parse ? job.runTaggedParseJob : job.runInterfaceJob) as (i: unknown) => unknown;
        this.onmessage?.({ data: { ok: true, result: run(input) } } as MessageEvent);
      };
      if (this.parse && hold) held.push({ input, reply });
      else void Promise.resolve().then(() => reply());
    }
    terminate() { this.terminated = true; }
  }

  beforeEach(() => {
    held = [];
    hold = false;
    vi.stubGlobal('Worker', FakeWorker);
  });

  const submitId = (value: string) => {
    const box = screen.getByLabelText('PDB ID', { exact: true });
    fireEvent.input(box, { target: { value } });
    fireEvent.submit(box.closest('form')!);
  };

  it('a newer request that fails keeps its error when an older parse finishes later', async () => {
    await renderLoaded();
    hold = true;
    pickExample('1CRN');
    await waitFor(() => expect(held).toHaveLength(1));         // 1CRN fetched, parse in flight
    submitId('9ZZZ');
    expect((await screen.findByRole('alert')).textContent).toMatch(/RCSB has no entry 9ZZZ/);
    await held[0]!.reply({ evenIfTerminated: true });          // the stale parse lands anyway
    await new Promise(r => setTimeout(r, 50));
    expect(within(header()).getByText(UBQ_TITLE)).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toMatch(/RCSB has no entry 9ZZZ/);
    expect(handle.load).not.toHaveBeenCalledWith(expect.any(String), 'mmcif', '1CRN', expect.any(Number));
  });

  it('an older parse finishing while a newer one runs never lands under the newer name', async () => {
    await renderLoaded();
    hold = true;
    pickExample('1CRN');
    await waitFor(() => expect(held).toHaveLength(1));
    submitId('3KZ5');
    await waitFor(() => expect(held).toHaveLength(2));         // 3KZ5 parse in flight too
    await held[0]!.reply({ evenIfTerminated: true });          // stale 1CRN result arrives first
    await new Promise(r => setTimeout(r, 50));
    expect(within(header()).getByText(UBQ_TITLE)).toBeTruthy();
    await held[1]!.reply();
    await waitFor(() => expect(within(header()).getByText('Structure of cdomain')).toBeTruthy());
    await waitFor(() => expect(handle.load).toHaveBeenLastCalledWith(expect.stringContaining('data_3KZ5'), 'mmcif', '3KZ5', 0));
    expect(handle.load).not.toHaveBeenCalledWith(expect.not.stringContaining('data_3KZ5'), 'mmcif', '3KZ5', expect.any(Number));
  });
});
