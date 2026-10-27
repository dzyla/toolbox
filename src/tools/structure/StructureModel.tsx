import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { bFactorStats, detectPlddt, type InterfacePair, type ResidueRef, type StructureFormat, type StructureMetrics, type StructureModel } from '@/core/structure';
import { downloadBlob } from '@/lib/export';
import { importErrorMessage } from '@/lib/file-import';
import { useUrlState } from '@/lib/url-state';
import { useWorkerCompute } from '@/lib/use-worker-compute';
import { makeInterfaceWorker, makeParseWorker, runInterfaceJob, runTaggedParseJob, type InterfaceJob, type TaggedParseJob } from './job';
import { fetchRcsbEntry, loadDemo, normaliseRcsbId, readStructureFile, type StructureSource } from './load';
import type { ColorScale, Coloring, MolstarHandle, Representation } from './MolstarViewer';
import { indexResidues, refKey, refsInRange } from './sequence';

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
  /** Read or fetched, waiting for the parser; becomes `loaded` only if it parses and is still the newest request. */
  const [candidate, setCandidate] = useState<{ source: StructureSource; requestId: number } | null>(null);
  const [fetching, setFetching] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [modelIndex, setModelIndex] = useState(0);
  const [cutoff, setCutoff] = useState(DEFAULT_CUTOFF);
  const [selection, setSelection] = useState<SequenceSelection | null>(null);
  const [hovered, setHovered] = useState<ResidueRef | null>(null);
  const [viewer, setViewerState] = useState<MolstarHandle | null>(null);
  const [representation, setRepresentationState] = useState<Representation>('auto');
  /** null: Mol*'s preset colouring (what the viewer queue starts with). */
  const [coloring, setColoringState] = useState<Coloring | null>(null);
  const [hydrogens, setHydrogensState] = useState(true);
  const [panels, setPanels] = useState(false);
  /** The strip's chain belongs to one model; a new structure starts on its first chain. */
  const [chainPick, setChainPick] = useState<{ model: StructureModel; id: string } | null>(null);
  /** Residues picked as a set elsewhere (an interface), marked in the strip. */
  const [marked, setMarked] = useState<ResidueRef[]>([]);

  // Only the newest request may set `loaded` or clear `error`. Each request gets a token; a new one
  // drops any in-flight parse (which also terminates its worker), and fetch/read results and parse
  // replies carrying an older token are ignored.
  const token = useRef(0);
  const begin = async (what: string, get: () => Promise<StructureSource>, label: string) => {
    const t = ++token.current;
    setCandidate(null);
    setFetching(what);
    try {
      const source = await get();
      if (t !== token.current) return;
      setCandidate({ source, requestId: t });
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
  const parseJob = useMemo<TaggedParseJob | null>(
    () => (candidate ? { text: candidate.source.text, name: candidate.source.name, requestId: candidate.requestId } : null),
    [candidate],
  );
  const parsed = useWorkerCompute(makeParseWorker, runTaggedParseJob, parseJob);
  const candidateRef = useRef(candidate);
  candidateRef.current = candidate;
  useEffect(() => {
    const reply = parsed.result;
    const c = candidateRef.current;
    // A reply for anything but the newest request's candidate is stale (it may arrive between a
    // newer request starting and the old worker being terminated).
    if (!reply || !c || reply.requestId !== c.requestId || reply.requestId !== token.current) return;
    setCandidate(null);
    if (!reply.ok) {
      setError(`Could not read ${c.source.name}: ${reply.error}`);
      return;
    }
    setLoaded({ source: c.source, model: reply.model, format: reply.format });
    setModelIndex(0);
    setSelection(null);
    setHovered(null);
    setMarked([]);
    setError('');
  }, [parsed.result]);
  useEffect(() => {
    // The worker itself failed (not a parse error, which comes back tagged in the result).
    const c = candidateRef.current;
    if (!parsed.error || !c || c.requestId !== token.current) return;
    setError(`Could not read ${c.source.name}: ${parsed.error}`);
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

  // Display choices made before Mol* hands over its handle are replayed onto it (the handle's
  // queue then applies them before the first load). Defaults need no replay.
  // B-factor scale ends and pLDDT detection for the shown model (cheap: one pass over the atoms).
  const bStats = useMemo(() => (loaded ? bFactorStats(loaded.model, modelIndex) : null), [loaded, modelIndex]);
  const plddt = useMemo(() => (loaded ? detectPlddt(loaded.model, bStats) : null), [loaded, bStats]);
  const colorScale = useMemo<ColorScale>(() => ({
    ...(bStats ? { domain: [bStats.low, bStats.high] as [number, number] } : {}),
    ...(plddt ? { plddtScale: plddt.scale } : {}),
  }), [bStats, plddt]);
  const hasHydrogens = useMemo(() => !!loaded?.model.models[modelIndex]?.isHydrogen.some(h => h === 1), [loaded, modelIndex]);

  const colourError = () => setError('The 3D viewer could not change the colours.');
  /** Only data-dependent colourings carry a scale (the others are called with the name alone). */
  const applyColoring = (h: MolstarHandle, c: Coloring | null, scale: ColorScale) =>
    (c === 'uncertainty' || c === 'plddt' ? h.setColoring(c, scale) : h.setColoring(c)).catch(colourError);

  const style = useRef({ representation, coloring, colorScale, hydrogens });
  style.current = { representation, coloring, colorScale, hydrogens };
  const setViewer = useCallback((h: MolstarHandle) => {
    const { representation: r, coloring: c, colorScale: scale, hydrogens: hy } = style.current;
    if (r !== 'auto') h.setRepresentation(r).catch(() => setError('The 3D viewer could not change the representation.'));
    if (c !== null) applyColoring(h, c, scale);
    if (!hy) h.setHydrogens(false).catch(() => setError('The 3D viewer could not hide the hydrogens.'));
    setViewerState(() => h);
  }, []);

  // A new structure or model: the B-factor scale follows its data, and pLDDT colouring falls back
  // to the default when the new structure is not a predicted model.
  const scaleKey = useRef(colorScale);
  useEffect(() => {
    if (scaleKey.current === colorScale) return;
    scaleKey.current = colorScale;
    if (coloring === 'plddt' && !plddt) {
      setColoringState(null);
      if (viewer) applyColoring(viewer, null, colorScale);
    } else if (viewer && (coloring === 'uncertainty' || coloring === 'plddt')) {
      applyColoring(viewer, coloring, colorScale);
    }
  }, [colorScale]);

  // A residue clicked in Mol* becomes the strip's selection (polymer residues only; clicks on
  // ligands, water or empty space leave the selection alone).
  const residueIndex = useMemo(() => (loaded ? indexResidues(loaded.model) : null), [loaded]);
  const selectFromViewer = (r: ResidueRef | null) => {
    const at = r && residueIndex?.get(refKey(r));
    if (!r || !at) return;
    setSelection({ labelAsymId: at.labelAsymId, from: at.seqId, to: at.seqId });
    setMarked([]);
    viewer?.select([r]);
  };

  const model = loaded?.model ?? null;
  const chainId = chainPick && chainPick.model === model ? chainPick.id : model?.chains[0]?.labelAsymId ?? '';
  const setChainId = (id: string) => { if (model) setChainPick({ model, id }); };

  /** Select residues in Mol*, show them and their surroundings as sticks, and zoom to them. */
  const showResidues = (refs: ResidueRef[]) => {
    if (!viewer) return;
    viewer.select(refs);
    viewer.focus(refs);
  };
  /** One residue from a list (an interface): the strip jumps to it when it is a polymer residue. */
  const showResidue = (r: ResidueRef) => {
    const at = residueIndex?.get(refKey(r));
    if (at) setSelection({ labelAsymId: at.labelAsymId, from: at.seqId, to: at.seqId });
    showResidues([r]);
  };
  /** Both sides of an interface: sticks in 3D, marked in the strip. */
  const showInterface = (pair: InterfacePair) => {
    const all = [...pair.a.residues, ...pair.b.residues];
    setSelection(null);
    setMarked(all);
    showResidues(all);
  };
  /** A whole chain: the strip switches to it, Mol* selects it and zooms out to it (no sticks). */
  const showChain = (labelAsymId: string) => {
    const chain = model?.chains.find(c => c.labelAsymId === labelAsymId);
    if (!chain) return;
    setChainId(labelAsymId);
    setSelection(null);
    setMarked([]);
    const refs = refsInRange(chain, -Infinity, Infinity);
    viewer?.select(refs);
    viewer?.focus(refs, { sticks: false });
  };
  const clearSelection = () => {
    setSelection(null);
    setMarked([]);
    viewer?.select([]);
    viewer?.focus([]);
  };
  const setRepresentation = (r: Representation) => {
    setRepresentationState(r);
    viewer?.setRepresentation(r).catch(() => setError('The 3D viewer could not change the representation.'));
  };
  const setColoring = (c: Coloring | null) => {
    setColoringState(c);
    if (viewer) applyColoring(viewer, c, colorScale);
  };
  const setHydrogens = (show: boolean) => {
    setHydrogensState(show);
    viewer?.setHydrogens(show).catch(() => setError('The 3D viewer could not change the hydrogens.'));
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
    model,
    format: loaded?.format ?? null,
    parsing: candidate !== null,
    /** What is being read or fetched right now, for a status line; null when idle. */
    fetching,
    error,
    modelIndex, setModelIndex,
    interfaces,
    metrics,
    computing: facts.busy,
    interfaceError: facts.error,
    cutoff, setCutoff,
    loadRcsb, loadFile,
    selection, setSelection, selectFromViewer, clearSelection,
    marked,
    chainId, setChainId,
    showResidues, showResidue, showInterface, showChain,
    hovered, setHovered,
    viewer, setViewer,
    representation, setRepresentation,
    coloring, setColoring,
    bStats, plddt,
    hydrogens, setHydrogens, hasHydrogens,
    panels, setPanels,
    snapshot,
    shareUrl,
  };
}

export type StructureViewModel = ReturnType<typeof useStructureModel>;
