import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { InterfacePair, ResidueRef, StructureFormat, StructureMetrics, StructureModel } from '@/core/structure';
import { downloadBlob } from '@/lib/export';
import { importErrorMessage } from '@/lib/file-import';
import { useUrlState } from '@/lib/url-state';
import { useWorkerCompute } from '@/lib/use-worker-compute';
import { makeInterfaceWorker, makeParseWorker, runInterfaceJob, runParseJob, type InterfaceJob, type ParseJob } from './job';
import { fetchRcsbEntry, loadDemo, normaliseRcsbId, readStructureFile, type StructureSource } from './load';
import type { Coloring, MolstarHandle, Representation } from './MolstarViewer';

export interface Preset { id: string; name: string }
/** The one preset list (RCSB entries). */
export const PRESETS: Preset[] = [
  { id: '1UBQ', name: 'Ubiquitin' },
  { id: '1L2Y', name: 'Trp-Cage' },
  { id: '1AKI', name: 'Lysozyme' },
  { id: '4HHB', name: 'Hemoglobin' },
  { id: '1JGQ', name: '30S Ribosome' },
  { id: '1CRN', name: 'Crambin' },
  { id: '6M0J', name: 'SARS-CoV-2 RBD / ACE2' },
];

/** A run of residues in one chain, in label numbering (label_seq_id), inclusive. */
export interface SequenceSelection { labelAsymId: string; from: number; to: number }

interface UrlState { pdbId: string }
const DEFAULTS: UrlState = { pdbId: '1UBQ' };
/** The bundled demo is the RCSB 1UBQ file, so that ID never needs the network. */
const DEMO_ID = '1UBQ';
export const DEFAULT_CUTOFF = 4.5;

interface Loaded { source: StructureSource; model: StructureModel; format: StructureFormat }

export function useStructureModel() {
  const [url, shareUrl] = useUrlState<UrlState>('structure-viewer', DEFAULTS);

  const [loaded, setLoaded] = useState<Loaded | null>(null);
  /** Read or fetched, waiting for the parser; becomes `loaded` only if it parses. */
  const [candidate, setCandidate] = useState<StructureSource | null>(null);
  const [fetching, setFetching] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [modelIndex, setModelIndex] = useState(0);
  const [cutoff, setCutoff] = useState(DEFAULT_CUTOFF);
  const [selection, setSelection] = useState<SequenceSelection | null>(null);
  const [hovered, setHovered] = useState<ResidueRef | null>(null);
  const [viewer, setViewerState] = useState<MolstarHandle | null>(null);
  const [representation, setRepresentationState] = useState<Representation>('auto');
  const [coloring, setColoringState] = useState<Coloring>('chain-id');
  const [panels, setPanels] = useState(false);
  const [largeCanvas, setLargeCanvas] = useState(false);

  // Only the newest request may land: a slow fetch that settles after a later one is dropped.
  const token = useRef(0);
  const begin = async (what: string, get: () => Promise<StructureSource>, label: string) => {
    const t = ++token.current;
    setFetching(what);
    try {
      const source = await get();
      if (t !== token.current) return;
      setCandidate(source);
    } catch (e) {
      if (t !== token.current) return;
      setError(importErrorMessage(e, label));
    } finally {
      if (t === token.current) setFetching(null);
    }
  };

  const loadRcsb = useCallback(async (input: string) => {
    const id = normaliseRcsbId(input);
    if (id === DEMO_ID) return begin(`Loading ${id}…`, loadDemo, id);
    return begin(`Fetching ${id ?? input.trim()} from RCSB…`, () => fetchRcsbEntry(input), input.trim() || 'the entry');
  }, []);
  const loadFile = useCallback(async (file: File) => begin(`Reading ${file.name}…`, () => readStructureFile(file), file.name), []);

  // On mount: the URL's ID ('1UBQ' or none → bundled demo, offline).
  useEffect(() => {
    const id = url.value.pdbId;
    if (!id || !normaliseRcsbId(id) || normaliseRcsbId(id) === DEMO_ID) void begin('Loading 1UBQ…', loadDemo, DEMO_ID);
    else void loadRcsb(id);
  }, []);

  // Parsing (worker; synchronous where Workers are missing). The job object changes only with the candidate.
  const parseJob = useMemo<ParseJob | null>(() => (candidate ? { text: candidate.text, name: candidate.name } : null), [candidate]);
  const parsed = useWorkerCompute(makeParseWorker, runParseJob, parseJob);
  const candidateRef = useRef(candidate);
  candidateRef.current = candidate;
  useEffect(() => {
    const source = candidateRef.current;
    if (!source || !parsed.result) return;
    setLoaded({ source, model: parsed.result.model, format: parsed.result.format });
    setModelIndex(0);
    setSelection(null);
    setHovered(null);
    setCandidate(null);
    setError('');
  }, [parsed.result]);
  useEffect(() => {
    const source = candidateRef.current;
    if (!source || !parsed.error) return;
    setError(`Could not read ${source.name}: ${parsed.error}`);
    setCandidate(null);
  }, [parsed.error]);

  // Shareable link: RCSB entries keep their ID, local files clear it.
  useEffect(() => {
    if (!loaded) return;
    const pdbId = loaded.source.origin === 'file' ? '' : loaded.source.rcsbId ?? '';
    if (url.value.pdbId !== pdbId) url.value = { ...url.value, pdbId };
  }, [loaded]);

  // Mol* always shows the loaded structure's selected model.
  useEffect(() => {
    if (!viewer || !loaded) return;
    viewer.load(loaded.source.text, loaded.format, loaded.source.name, modelIndex)
      .catch(() => setError(`The 3D viewer could not display ${loaded.source.name}.`));
  }, [viewer, loaded, modelIndex]);

  // Coordinate-derived numbers describe the same model as Mol*.
  const interfaceJob = useMemo<InterfaceJob | null>(
    () => (loaded ? { model: loaded.model, modelIndex, cutoff } : null),
    [loaded, modelIndex, cutoff],
  );
  const facts = useWorkerCompute(makeInterfaceWorker, runInterfaceJob, interfaceJob);
  const interfaces: InterfacePair[] | null = facts.result?.pairs ?? null;
  const metrics: StructureMetrics | null = facts.result?.metrics ?? null;

  const setViewer = useCallback((h: MolstarHandle) => setViewerState(() => h), []);
  const setRepresentation = (r: Representation) => {
    setRepresentationState(r);
    viewer?.setRepresentation(r).catch(() => setError('The 3D viewer could not change the representation.'));
  };
  const setColoring = (c: Coloring) => {
    setColoringState(c);
    viewer?.setColoring(c).catch(() => setError('The 3D viewer could not change the colours.'));
  };
  const snapshot = async () => {
    if (!viewer || !loaded) return;
    try {
      downloadBlob(await viewer.snapshot(), `${loaded.source.name}.png`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not capture the 3D view.');
    }
  };

  return {
    source: loaded?.source ?? null,
    model: loaded?.model ?? null,
    format: loaded?.format ?? null,
    parsing: candidate !== null,
    /** What is being read or fetched right now, for a status line; null when idle. */
    fetching,
    error,
    modelIndex, setModelIndex,
    interfaces,
    metrics,
    computing: facts.busy,
    cutoff, setCutoff,
    loadRcsb, loadFile,
    selection, setSelection,
    hovered, setHovered,
    viewer, setViewer,
    representation, setRepresentation,
    coloring, setColoring,
    panels, setPanels,
    largeCanvas, setLargeCanvas,
    snapshot,
    shareUrl,
  };
}

export type StructureViewModel = ReturnType<typeof useStructureModel>;
