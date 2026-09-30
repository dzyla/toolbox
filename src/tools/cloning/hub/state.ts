import { mergeLinkState } from '@/lib/url-state';
import { validateDocument, type PlasmidDocument } from '@/core/plasmid/model';
import type { Project } from '@/lib/projects';

export type SourceRole = 'vector' | 'insert';

export interface HubSource {
  id: string;
  role: SourceRole;
  document: PlasmidDocument;
}

export type HubMethod = 'nebuilder' | 'infusion' | 'ligation' | 'sdm' | 'goldengate';

export const METHODS: Array<{ id: HubMethod; label: string; blurb: string }> = [
  { id: 'nebuilder', label: 'NEBuilder / Gibson', blurb: 'Overlap assembly of PCR products and digested vectors' },
  { id: 'infusion', label: 'In-Fusion', blurb: '15 bp homology extensions, Takara rules' },
  { id: 'ligation', label: 'Restriction + ligation', blurb: 'Sticky or blunt ends, T4 DNA ligase' },
  { id: 'sdm', label: 'Amino-acid change', blurb: 'Q5 site-directed mutagenesis (KLD), e.g. Y127F' },
  { id: 'goldengate', label: 'Golden Gate', blurb: 'Type IIS planning calculator' },
];

/** Options remembered per source for the assembly methods. */
export interface FragmentOption {
  kind: 'pcr' | 'digest';
  enzymeA: string;
  enzymeB: string;
  /** Where a circular PCR source is opened (1-based in the UI). */
  open?: { mode: 'whole' | 'caret' | 'region'; caret: number; start: number; end: number };
}

export interface NebuilderSettings {
  polymeraseId: string;
  minOverlap: number;
  minPrimerLength: number;
  maxTmDifference: number;
  circularize: boolean;
  fragments: Record<string, FragmentOption>;
  /** ng/µL of each source, for the reaction calculator. */
  concentrations: Record<string, number>;
  /** Spacer and placement per junction index. */
  junctions: Record<string, { spacer: string; mode: 'default' | 'upstream' | 'downstream' | 'split' | 'custom'; share?: number }>;
}

export interface InfusionSettings {
  linearize: 'digest' | 'pcr-caret' | 'pcr-region' | 'linear';
  enzymeA: string;
  enzymeB: string;
  includeFirst: boolean;
  includeSecond: boolean;
  caret: number;
  regionStart: number;
  regionEnd: number;
  vectorNg: number;
  vectorConcentration: number;
  insertConcentration: number;
  /** Percent (0-100) of the vector homology carried by the vector primers. */
  vectorShare: number;
}

export interface LigationSettings {
  vectorEnzymeA: string;
  vectorEnzymeB: string;
  insertEnzymeA: string;
  insertEnzymeB: string;
  makeBlunt: boolean;
  dephosphorylateVector: boolean;
  phosphorylateInsert: boolean;
  vectorFragment: number;
  insertFragment: number;
  vectorNg: number;
  ratio: number;
  vectorConcentration: number;
  insertConcentration: number;
}

export interface SdmSettings {
  /** 'aa': amino-acid changes in an ORF; 'sequence': insert, replace or delete bases by position. */
  mode: 'aa' | 'sequence';
  edit: 'insert' | 'replace' | 'delete';
  from: number;
  to: number;
  sequence: string;
  sourceId: string;
  orfIndex: number;
  manualStart: number;
  mutations: string;
  strategy: 'usage' | 'minimal';
  host: 'ecoli' | 'human' | 'yeast' | 'insect';
  minPrimerLength: number;
}

export interface GoldenGateSettings {
  enzyme: string;
  vectorBp: number;
  fragmentCount: number;
}

export interface HubState {
  schemaVersion: 1;
  method: HubMethod;
  sources: HubSource[];
  nebuilder: NebuilderSettings;
  infusion: InfusionSettings;
  ligation: LigationSettings;
  sdm: SdmSettings;
  goldengate: GoldenGateSettings;
}

export const HUB_PROJECT_VERSION = 1;

export const DEFAULT_STATE: HubState = {
  schemaVersion: 1,
  method: 'nebuilder',
  sources: [],
  nebuilder: { polymeraseId: 'q5-0', minOverlap: 20, minPrimerLength: 18, maxTmDifference: 5, circularize: true, fragments: {}, concentrations: {}, junctions: {} },
  infusion: { linearize: 'digest', enzymeA: '', enzymeB: 'auto', includeFirst: false, includeSecond: false, caret: 0, regionStart: 0, regionEnd: 0, vectorNg: 100, vectorConcentration: 50, insertConcentration: 50, vectorShare: 0 },
  ligation: { vectorEnzymeA: '', vectorEnzymeB: 'auto', insertEnzymeA: 'auto', insertEnzymeB: 'auto', makeBlunt: false, dephosphorylateVector: false, phosphorylateInsert: false, vectorFragment: -1, insertFragment: -1, vectorNg: 50, ratio: 3, vectorConcentration: 25, insertConcentration: 25 },
  sdm: { mode: 'aa', edit: 'insert', from: 1, to: 1, sequence: '', sourceId: '', orfIndex: 0, manualStart: 1, mutations: '', strategy: 'usage', host: 'ecoli', minPrimerLength: 15 },
  goldengate: { enzyme: 'BsaI', vectorBp: 4500, fragmentCount: 3 },
};

export function hubProjectSnapshot(state: HubState) {
  const vectors = state.sources.filter(source => source.role === 'vector').length;
  const name = state.sources.length
    ? `Cloning: ${state.sources.map(source => source.document.name).slice(0, 3).join(' + ')}${state.sources.length > 3 ? '…' : ''}`
    : 'Cloning hub';
  return { name: vectors > 1 ? `${name} (${METHODS.find(method => method.id === state.method)!.label})` : name, version: HUB_PROJECT_VERSION, state };
}

const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);

/** Validate a stored hub project; throws a user-facing error when it is unusable. */
export function restoreHubProject(project: Project): HubState {
  const raw = project.state;
  if (!isRecord(raw) || raw.schemaVersion !== HUB_PROJECT_VERSION || !Array.isArray(raw.sources)) {
    throw new Error('This cloning project cannot be opened: it was saved in an unsupported format.');
  }
  const sources: HubSource[] = [];
  for (const entry of raw.sources) {
    if (!isRecord(entry) || typeof entry.id !== 'string' || (entry.role !== 'vector' && entry.role !== 'insert') || !isRecord(entry.document)) {
      throw new Error('This cloning project cannot be opened: one of its sequences is damaged.');
    }
    const document = entry.document as unknown as PlasmidDocument;
    const validation = validateDocument(document);
    if (!validation.valid) throw new Error(`This cloning project cannot be opened: ${validation.reason}`);
    sources.push({ id: entry.id, role: entry.role, document });
  }
  const merged = mergeLinkState(DEFAULT_STATE, { ...raw, sources: [] });
  const method = METHODS.some(candidate => candidate.id === merged.method) ? merged.method : 'nebuilder';
  return { ...merged, method, sources, schemaVersion: 1 };
}
