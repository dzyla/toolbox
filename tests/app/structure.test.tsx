import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/preact';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { read } from '../core/structure-helpers';
import type { MolstarHandle, MolstarViewerProps } from '@/tools/structure/MolstarViewer';

// A fake Mol*: hands the View a handle of spies as soon as it mounts.
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
const UBQ_TITLE = 'STRUCTURE OF UBIQUITIN REFINED AT 1.8 ANGSTROMS RESOLUTION';

async function renderLoaded() {
  render(<StructureView />);
  await waitFor(() => expect(within(header()).getByText(UBQ_TITLE)).toBeTruthy());
}

beforeEach(() => {
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
    expect(screen.getByRole('button', { name: '4HHB Hemoglobin' })).toBeTruthy();
    expect(screen.getAllByRole('button', { name: /4HHB/ })).toHaveLength(1);
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

  it('a preset button fetches its entry', async () => {
    await renderLoaded();
    fireEvent.click(screen.getByRole('button', { name: '4HHB Hemoglobin' }));
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
    fireEvent.click(screen.getByRole('button', { name: '4HHB Hemoglobin' }));
    fireEvent.click(screen.getByRole('button', { name: '1CRN Crambin' }));
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
    fireEvent.change(screen.getByLabelText('Representation', { exact: true }), { target: { value: 'surface' } });
    expect(handle.setRepresentation).toHaveBeenCalledWith('surface');
    expect(screen.getByRole('button', { name: 'Mol* panels' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Large canvas' })).toBeTruthy();
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
    fireEvent.click(screen.getByRole('button', { name: '1CRN Crambin' }));
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
    fireEvent.click(screen.getByRole('button', { name: '1CRN Crambin' }));
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
