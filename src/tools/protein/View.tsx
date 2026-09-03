import { useMemo } from 'preact/hooks';
import { useUrlState } from '@/lib/url-state';
import { downloadText, toCsv } from '@/lib/export';
import {
  ACCEPTED_AA,
  PROTEASES,
  STANDARD_AA,
  countAA,
  digest,
  extinctionCoefficients,
  halfLife,
  isoelectricPoint,
  netCharge,
  parseFasta,
  sanitize,
  summarize,
  type Organism,
  type PKaScheme,
  type Peptide,
} from '@/core/protein';
import {
  chargeProfile,
  foldIndexProfile,
  hydropathyProfile,
  hydrophobicMomentProfile,
  secondaryStructureProfiles,
} from '@/core/protein/profiles';
import {
  mergeFeatures,
  parseDomainCsv,
  scanFeatures,
  signalPeptideCandidates,
  transmembraneCandidates,
  type ProteinFeature,
} from '@/core/protein/features';
import { esiChargeLadder, matchPeptideMasses, type MassToleranceUnit, type PeptideMassMode } from '@/core/protein/mass';
import { LineChart } from '@/app/components/LineChart';
import { SciencePanel, scienceText } from '@/app/components/SciencePanel';
import { ActionBar } from '@/app/components/ActionBar';
import { ToolLayout } from '@/app/components/ToolLayout';
import { SCIENCE } from './science';

const EXAMPLE = '>Example protein\nMKWVTFISLLFLFSSAYSRGVFRRDTHKSEIAHRFKDLGE';
const FIELD = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900';
const CHECK = 'h-4 w-4 rounded border-slate-300';

interface State {
  fasta: string;
  scheme: PKaScheme;
  pH: number;
  organism: Organism;
  hydroWindow: number;
  chargeWindow: number;
  foldWindow: number;
  momentWindow: number;
  helixWindow: number;
  sheetWindow: number;
  showHydro: boolean;
  showCharge: boolean;
  showFold: boolean;
  showMoment: boolean;
  showSecondary: boolean;
  showTags: boolean;
  showMotifs: boolean;
  showTm: boolean;
  showSignal: boolean;
  showDomains: boolean;
  tmWindow: number;
  tmThreshold: number;
  largeTagIdentity: number;
  domainCsv: string;
  protease: string;
  missedCleavages: number;
  observedMasses: string;
  massTolerance: number;
  massToleranceUnit: MassToleranceUnit;
  massMode: PeptideMassMode;
  zmax: number;
}

const DEFAULTS: State = {
  fasta: EXAMPLE,
  scheme: 'bjellqvist', pH: 7, organism: 'mammal',
  hydroWindow: 9, chargeWindow: 9, foldWindow: 51, momentWindow: 11, helixWindow: 6, sheetWindow: 5,
  showHydro: true, showCharge: true, showFold: true, showMoment: true, showSecondary: true,
  showTags: true, showMotifs: true, showTm: true, showSignal: true, showDomains: true,
  tmWindow: 19, tmThreshold: 1.6, largeTagIdentity: 90, domainCsv: '',
  protease: 'Trypsin', missedCleavages: 0, observedMasses: '', massTolerance: 10, massToleranceUnit: 'ppm', massMode: '[M+H]+', zmax: 8,
};

interface Analysis {
  header: string;
  raw: string;
  seq: string;
  clean: ReturnType<typeof sanitize>;
  summary: ReturnType<typeof summarize>;
  charge: number;
  nativeExt: ReturnType<typeof extinctionCoefficients>;
  denaturedExt: ReturnType<typeof extinctionCoefficients>;
  features: ProteinFeature[];
  peptides: Peptide[];
}

function NumberField({ id, label, value, set, min, max, step = 1 }: { id: string; label: string; value: number; set: (value: number) => void; min?: number; max?: number; step?: number }) {
  return <label for={id} class="block"><span class="mb-1 block text-sm font-medium">{label}</span>
    <input id={id} class={`${FIELD} mono`} type="number" value={value} min={min} max={max} step={step}
      onInput={event => set(Number((event.target as HTMLInputElement).value))} /></label>;
}

function ProfileControls({ state, set }: { state: State; set: (patch: Partial<State>) => void }) {
  const profile = (key: keyof Pick<State, 'showHydro' | 'showCharge' | 'showFold' | 'showMoment' | 'showSecondary'>, label: string) =>
    <label class="flex min-h-11 items-center gap-2 text-sm"><input class={CHECK} type="checkbox" checked={state[key]} onChange={event => set({ [key]: (event.target as HTMLInputElement).checked })} />{label}</label>;
  return <details class="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
    <summary class="cursor-pointer font-medium">Profile plots and windows</summary>
    <div class="mt-3 grid gap-3 sm:grid-cols-2">
      <div>{profile('showHydro', 'Kyte-Doolittle hydropathy')}<NumberField id="protein-hydro-window" label="Hydropathy window" value={state.hydroWindow} min={1} step={2} set={hydroWindow => set({ hydroWindow })} /></div>
      <div>{profile('showCharge', 'Per-residue charge')}<NumberField id="protein-charge-window" label="Charge window" value={state.chargeWindow} min={1} step={2} set={chargeWindow => set({ chargeWindow })} /></div>
      <div>{profile('showFold', 'FoldIndex')}<NumberField id="protein-fold-window" label="FoldIndex window" value={state.foldWindow} min={1} step={2} set={foldWindow => set({ foldWindow })} /></div>
      <div>{profile('showMoment', 'Hydrophobic moment')}<NumberField id="protein-moment-window" label="Moment window" value={state.momentWindow} min={1} step={2} set={momentWindow => set({ momentWindow })} /></div>
      <div>{profile('showSecondary', 'Chou-Fasman helix and sheet')}<div class="grid grid-cols-2 gap-2"><NumberField id="protein-helix-window" label="Helix window" value={state.helixWindow} min={1} set={helixWindow => set({ helixWindow })} /><NumberField id="protein-sheet-window" label="Sheet window" value={state.sheetWindow} min={1} set={sheetWindow => set({ sheetWindow })} /></div></div>
    </div>
  </details>;
}

function FeatureControls({ state, set }: { state: State; set: (patch: Partial<State>) => void }) {
  const toggle = (key: keyof Pick<State, 'showTags' | 'showMotifs' | 'showTm' | 'showSignal' | 'showDomains'>, label: string) =>
    <label class="flex min-h-11 items-center gap-2 text-sm"><input class={CHECK} type="checkbox" checked={state[key]} onChange={event => set({ [key]: (event.target as HTMLInputElement).checked })} />{label}</label>;
  return <details class="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
    <summary class="cursor-pointer font-medium">Feature map controls</summary>
    <div class="mt-3 grid grid-cols-2 gap-x-3 sm:grid-cols-3">{toggle('showTags', 'Tags')}{toggle('showMotifs', 'Motifs')}{toggle('showTm', 'TM candidates')}{toggle('showSignal', 'Signal candidate')}{toggle('showDomains', 'User domains')}</div>
    <div class="grid gap-3 sm:grid-cols-3"><NumberField id="protein-tm-window" label="TM window" value={state.tmWindow} min={1} set={tmWindow => set({ tmWindow })} /><NumberField id="protein-tm-threshold" label="TM KD threshold" value={state.tmThreshold} step={0.1} set={tmThreshold => set({ tmThreshold })} /><NumberField id="protein-large-identity" label="Large-tag identity (%)" value={state.largeTagIdentity} min={1} max={100} set={largeTagIdentity => set({ largeTagIdentity })} /></div>
  </details>;
}

function FeatureMap({ features, length }: { features: ProteinFeature[]; length: number }) {
  if (!features.length) return <p class="text-sm text-slate-500">No enabled features found.</p>;
  const width = 720, trackStart = 24, trackWidth = width - 48;
  const x = (position: number) => trackStart + (position - 1) / Math.max(1, length - 1) * trackWidth;
  return <div>
    <svg viewBox={`0 0 ${width} ${50 + Math.min(5, features.length) * 12}`} class="h-auto min-w-[36rem] w-full" role="img" aria-label="Protein feature map">
      <line x1={trackStart} x2={trackStart + trackWidth} y1="20" y2="20" stroke="currentColor" stroke-width="4" />
      <text x={trackStart} y="12" font-size="10" fill="currentColor">1</text><text x={trackStart + trackWidth} y="12" text-anchor="end" font-size="10" fill="currentColor">{length}</text>
      {features.map((feature, index) => <g key={`${feature.kind}-${feature.name}-${feature.start}-${index}`}>
        <rect x={x(feature.start)} y={30 + index % 5 * 12} width={Math.max(3, x(feature.end) - x(feature.start) + 2)} height="8" rx="2" fill={feature.color} stroke="currentColor" stroke-width="0.5"><title>{feature.name}: {feature.start}–{feature.end}</title></rect>
      </g>)}
    </svg>
    <ul class="mt-2 grid gap-1 text-xs sm:grid-cols-2">{features.map((feature, index) => <li key={`${feature.name}-${feature.start}-${index}`}><span class="font-semibold">{feature.name}</span> <span class="mono">{feature.start}–{feature.end}</span>{feature.identity !== undefined ? ` (${(feature.identity * 100).toFixed(1)}%)` : ''}</li>)}</ul>
  </div>;
}

function filteredFeatures(features: ProteinFeature[], state: State): ProteinFeature[] {
  return features.filter(feature => feature.kind === 'tag' || feature.kind === 'large-tag' ? state.showTags
    : feature.kind === 'motif' ? state.showMotifs
      : feature.kind === 'transmembrane' ? state.showTm
        : feature.kind === 'signal-peptide' ? state.showSignal : state.showDomains);
}

function methodCsv(rows: (string | number)[][]): string {
  return `${scienceText(SCIENCE).split('\n').map(line => `# ${line}`).join('\n')}\n${toCsv(rows)}`;
}

function ProteinCard({ analysis, state }: { analysis: Analysis; state: State }) {
  const positions = Array.from({ length: analysis.seq.length }, (_, index) => index + 1);
  const secondary = secondaryStructureProfiles(analysis.seq, state.helixWindow, state.sheetWindow);
  const shownFeatures = filteredFeatures(analysis.features, state);
  const observed = state.observedMasses.split(/[\s,;]+/).map(Number).filter(value => Number.isFinite(value) && value > 0);
  const matches = matchPeptideMasses(analysis.peptides, observed, state.massTolerance, state.massToleranceUnit, state.massMode);
  const ladder = esiChargeLadder(analysis.summary.mono, state.zmax);
  const removed = Object.entries(analysis.clean.removed).filter(([, count]) => count > 0);
  const extRows = [
    ['Native water, reduced', analysis.nativeExt.reduced, analysis.nativeExt.absRed],
    ['Native water, all cystines', analysis.nativeExt.cystines, analysis.nativeExt.absCys],
    ['6 M GdnHCl, reduced', analysis.denaturedExt.reduced, analysis.denaturedExt.absRed],
    ['6 M GdnHCl, all cystines', analysis.denaturedExt.cystines, analysis.denaturedExt.absCys],
  ] as const;
  const summaryRows: (string | number)[][] = [
    ['Header', 'Length', 'Average_MW_Da', 'Monoisotopic_MW_Da', 'pI', `Charge_pH_${state.pH}`, 'E280_native_reduced_M-1cm-1', 'E280_native_cystines_M-1cm-1', 'Instability_index', 'Aliphatic_index', 'GRAVY_KD', 'Formula', 'Half_life'],
    [analysis.header, analysis.seq.length, analysis.summary.mw, analysis.summary.mono, analysis.summary.pI, analysis.charge, analysis.nativeExt.reduced, analysis.nativeExt.cystines, analysis.summary.instability, analysis.summary.aliphatic, analysis.summary.gravy, analysis.summary.formula, halfLife(analysis.seq, state.organism)],
  ];
  const digestRows: (string | number)[][] = [['Start', 'End', 'Sequence', 'Missed_cleavages', 'Average_mass_Da', 'Monoisotopic_mass_Da', `pI_${state.scheme}`], ...analysis.peptides.map(peptide => [peptide.start, peptide.end, peptide.seq, peptide.missed, peptide.mw, peptide.mono, isoelectricPoint(countAA(peptide.seq), state.scheme, peptide.seq)])];
  return <article class="space-y-5 rounded-xl border border-slate-200 p-4 dark:border-slate-700" data-testid="protein-card">
    <div><h2 class="text-xl font-semibold break-words">{analysis.header}</h2><p class="mono mt-1 break-all text-xs text-slate-500">{analysis.seq}</p></div>
    {analysis.clean.ambiguous.length > 0 && <p role="alert" class="rounded-lg border border-amber-300 bg-amber-50 p-2 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100">Ambiguous residues: {analysis.clean.ambiguous.join(', ')}. Approximate masses may be used; atom counts and extinction contributions are omitted.</p>}
    <div class="rounded-lg bg-slate-50 p-3 text-sm dark:bg-slate-800"><strong>Sequence cleaning report:</strong> {removed.length ? removed.map(([kind, count]) => `${count} ${kind}`).join(', ') : 'No characters removed.'}</div>
    <dl class="grid gap-3 text-sm sm:grid-cols-2 xl:grid-cols-3">
      <div><dt class="text-slate-500">Length</dt><dd class="mono text-lg font-semibold">{analysis.seq.length} aa</dd></div>
      <div><dt class="text-slate-500">Average molecular weight</dt><dd class="mono text-lg font-semibold">{analysis.summary.mw.toFixed(2)} Da</dd></div>
      <div><dt class="text-slate-500">Monoisotopic molecular weight</dt><dd class="mono text-lg font-semibold">{analysis.summary.mono.toFixed(4)} Da</dd></div>
      <div><dt class="text-slate-500">Theoretical pI ({state.scheme === 'bjellqvist' ? 'Bjellqvist' : 'EMBOSS'})</dt><dd class="mono text-lg font-semibold">{analysis.summary.pI.toFixed(3)}</dd></div>
      <div><dt class="text-slate-500">Net charge at pH {state.pH.toFixed(1)}</dt><dd class="mono text-lg font-semibold">{analysis.charge.toFixed(3)} e</dd></div>
      <div><dt class="text-slate-500">Instability index</dt><dd class="mono text-lg font-semibold">{analysis.summary.instability.toFixed(2)} — {analysis.summary.instability < 40 ? 'stable prediction' : 'unstable prediction'}</dd></div>
      <div><dt class="text-slate-500">Aliphatic index</dt><dd class="mono text-lg font-semibold">{analysis.summary.aliphatic.toFixed(2)}</dd></div>
      <div><dt class="text-slate-500">GRAVY (Kyte–Doolittle)</dt><dd class="mono text-lg font-semibold">{analysis.summary.gravy.toFixed(3)}</dd></div>
      <div><dt class="text-slate-500">Estimated half-life</dt><dd class="mono text-lg font-semibold">{halfLife(analysis.seq, state.organism)}</dd></div>
      <div class="sm:col-span-2"><dt class="text-slate-500">Atomic formula</dt><dd class="mono text-lg font-semibold break-all">{analysis.summary.formula || 'Unavailable'}</dd></div>
    </dl>

    <section><h3 class="font-semibold">Extinction at 280 nm</h3><div class="mt-2 overflow-x-auto"><table class="w-full min-w-[34rem] text-left text-sm"><thead><tr><th class="pb-2">State</th><th class="pb-2 text-right">ε₂₈₀ (M⁻¹cm⁻¹)</th><th class="pb-2 text-right">Abs 0.1% (1 g/L, 1 cm)</th></tr></thead><tbody>{extRows.map(row => <tr key={row[0]} class="border-t border-slate-200 dark:border-slate-700"><td class="py-2">{row[0]}</td><td class="mono py-2 text-right">{row[1].toFixed(0)}</td><td class="mono py-2 text-right">{row[2].toFixed(3)}</td></tr>)}</tbody></table></div></section>

    <details><summary class="cursor-pointer font-semibold">Residue composition</summary><div class="mt-2 overflow-x-auto"><table class="w-full min-w-[24rem] text-sm"><thead><tr><th class="pb-2 text-left">Residue</th><th class="pb-2 text-right">Count</th><th class="pb-2 text-right">Percent</th></tr></thead><tbody>{[...ACCEPTED_AA].map(residue => <tr key={residue} class="border-t border-slate-200 dark:border-slate-700"><td class="mono py-1">{residue}{STANDARD_AA.includes(residue) ? '' : ' (ambiguous)'}</td><td class="mono py-1 text-right">{analysis.summary.counts[residue] ?? 0}</td><td class="mono py-1 text-right">{(100 * (analysis.summary.counts[residue] ?? 0) / analysis.seq.length).toFixed(2)}%</td></tr>)}</tbody><tfoot><tr class="border-t-2 border-slate-300 font-semibold dark:border-slate-600"><td class="pt-2">Total</td><td class="mono pt-2 text-right">{analysis.seq.length}</td><td class="mono pt-2 text-right">100.00%</td></tr></tfoot></table></div></details>

    {analysis.seq.length > 1 && <details open><summary class="cursor-pointer font-semibold">Property profiles</summary><div class="mt-3 space-y-6">
      {state.showHydro && <LineChart title="Kyte-Doolittle hydropathy" xLabel="Residue" yLabel={`Mean KD (${state.hydroWindow}-residue window)`} series={[{ name: 'Hydropathy', x: positions, y: hydropathyProfile(analysis.seq, state.hydroWindow) }]} exportName="protein-hydropathy" />}
      {state.showCharge && <LineChart title={`Per-residue charge at pH ${state.pH.toFixed(1)} (${state.scheme})`} xLabel="Residue" yLabel={`Mean charge / e (${state.chargeWindow}-residue window)`} hLines={[{ y: 0 }]} series={[{ name: 'Charge', x: positions, y: chargeProfile(analysis.seq, state.pH, state.chargeWindow, state.scheme) }]} exportName="protein-charge" />}
      {state.showFold && <LineChart title="FoldIndex: positive folded, negative disordered" xLabel="Residue" yLabel={`FoldIndex (${state.foldWindow}-residue window)`} hLines={[{ y: 0, label: 'folded / disordered' }]} series={[{ name: 'FoldIndex', x: positions, y: foldIndexProfile(analysis.seq, state.foldWindow) }]} exportName="protein-foldindex" />}
      {state.showMoment && <LineChart title="Hydrophobic moment (α-helix 100°, Kyte-Doolittle scale)" xLabel="Residue" yLabel={`µH (${state.momentWindow}-residue window)`} series={[{ name: 'Hydrophobic moment', x: positions, y: hydrophobicMomentProfile(analysis.seq, state.momentWindow) }]} exportName="protein-hydrophobic-moment" />}
      {state.showSecondary && <LineChart title="Chou-Fasman secondary-structure propensity" xLabel="Residue" yLabel="Relative propensity (/100)" hLines={[{ y: 1, label: 'neutral propensity' }]} series={[{ name: `Helix (${state.helixWindow})`, x: positions, y: secondary.helix }, { name: `Sheet (${state.sheetWindow})`, x: positions, y: secondary.sheet }]} exportName="protein-secondary-structure" />}
    </div></details>}

    <details open><summary class="cursor-pointer font-semibold">Feature map</summary><div class="mt-3 overflow-x-auto"><FeatureMap features={shownFeatures} length={analysis.seq.length} /></div></details>

    <details open><summary class="cursor-pointer font-semibold">Digest and mass matching</summary><div class="mt-3 space-y-4">
      {matches.length > 0 && <div class="rounded-lg border border-accent-500 p-3 text-sm"><strong>Mass matches</strong><ul class="mt-1">{matches.map((match, index) => <li key={`${match.observed}-${match.peptide.start}-${index}`}><span class="mono">{match.observed.toFixed(4)}</span> → {match.peptide.seq} ({match.peptide.start}–{match.peptide.end}), Δ {match.errorDa.toFixed(5)} Da / {match.errorPpm.toFixed(2)} ppm</li>)}</ul></div>}
      {observed.length > 0 && matches.length === 0 && <p class="text-sm text-slate-500">No digest peptides match the observed masses at this tolerance.</p>}
      <div class="overflow-x-auto"><table class="w-full min-w-[48rem] text-left text-xs"><thead><tr><th class="pb-2">Residues</th><th class="pb-2">Peptide</th><th class="pb-2 text-right">Missed</th><th class="pb-2 text-right">Average Da</th><th class="pb-2 text-right">Monoisotopic Da</th><th class="pb-2 text-right">pI ({state.scheme})</th></tr></thead><tbody>{analysis.peptides.map((peptide, index) => <tr key={`${peptide.start}-${peptide.end}-${index}`} class="border-t border-slate-200 dark:border-slate-700"><td class="mono py-2">{peptide.start}–{peptide.end}</td><td class="mono py-2">{peptide.seq}</td><td class="mono py-2 text-right">{peptide.missed}</td><td class="mono py-2 text-right">{peptide.mw.toFixed(3)}</td><td class="mono py-2 text-right">{peptide.mono.toFixed(4)}</td><td class="mono py-2 text-right">{isoelectricPoint(countAA(peptide.seq), state.scheme, peptide.seq).toFixed(3)}</td></tr>)}</tbody></table></div>
      <div><h4 class="font-medium">ESI charge ladder for the intact monoisotopic mass</h4><div class="mt-1 flex flex-wrap gap-2">{ladder.map(item => <span key={item.charge} class="rounded-lg bg-slate-100 px-2 py-1 text-xs dark:bg-slate-800"><strong>{item.charge}+</strong> <span class="mono">{item.mz.toFixed(4)} m/z</span></span>)}</div></div>
      <div class="flex flex-wrap gap-2"><button type="button" class="min-h-11 rounded-lg border border-slate-300 px-3 text-sm dark:border-slate-700" onClick={() => downloadText(methodCsv(summaryRows), `${analysis.header.replace(/[^a-z0-9_-]+/gi, '_')}-summary.csv`, 'text/csv;charset=utf-8')}>Export summary CSV</button><button type="button" class="min-h-11 rounded-lg border border-slate-300 px-3 text-sm dark:border-slate-700" onClick={() => downloadText(methodCsv(digestRows), `${analysis.header.replace(/[^a-z0-9_-]+/gi, '_')}-digest.csv`, 'text/csv;charset=utf-8')}>Export digest CSV</button></div>
    </div></details>
  </article>;
}

function analyse(state: State, domains: ProteinFeature[]): { analyses: Analysis[]; errors: string[] } {
  const records = parseFasta(state.fasta);
  if (!records.length) return { analyses: [], errors: ['Enter at least one protein sequence or FASTA entry.'] };
  const protease = PROTEASES.find(candidate => candidate.name === state.protease) ?? PROTEASES[0]!;
  const analyses: Analysis[] = [], errors: string[] = [];
  for (const record of records) {
    const clean = sanitize(record.seq);
    if (!clean.seq) { errors.push(`${record.header}: no accepted protein residues remain after cleaning.`); continue; }
    try {
      const summary = summarize(clean.seq, state.scheme);
      const detected = mergeFeatures([
        ...scanFeatures(clean.seq, state.largeTagIdentity),
        ...transmembraneCandidates(clean.seq, state.tmWindow, state.tmThreshold),
        ...signalPeptideCandidates(clean.seq),
        ...domains.filter(domain => domain.start <= clean.seq.length).map(domain => ({ ...domain, end: Math.min(domain.end, clean.seq.length) })),
      ]);
      analyses.push({ header: record.header, raw: record.seq, seq: clean.seq, clean, summary,
        charge: netCharge(summary.counts, state.pH, state.scheme, clean.seq),
        nativeExt: extinctionCoefficients(summary.counts, summary.mw, 'native'),
        denaturedExt: extinctionCoefficients(summary.counts, summary.mw, 'denatured'),
        features: detected, peptides: digest(clean.seq, protease, state.missedCleavages) });
    } catch (error) { errors.push(`${record.header}: ${error instanceof Error ? error.message : 'Analysis failed.'}`); }
  }
  return { analyses, errors };
}

export default function View() {
  const [state, shareUrl] = useUrlState<State>('protein', DEFAULTS);
  const current = state.value;
  const set = (patch: Partial<State>) => { state.value = { ...state.value, ...patch }; };
  const domainResult = useMemo(() => {
    try { return { domains: parseDomainCsv(current.domainCsv), error: '' }; }
    catch (error) { return { domains: [] as ProteinFeature[], error: error instanceof Error ? error.message : 'Could not parse domain CSV.' }; }
  }, [current.domainCsv]);
  const result = useMemo(() => analyse(current, domainResult.domains), [current, domainResult.domains]);
  const copyText = () => {
    const rows = result.analyses.map(item => `${item.header}: ${item.seq.length} aa; average MW ${item.summary.mw.toFixed(2)} Da; monoisotopic MW ${item.summary.mono.toFixed(4)} Da; pI ${item.summary.pI.toFixed(3)} (${current.scheme}); charge ${item.charge.toFixed(3)} e at pH ${current.pH.toFixed(1)}; ε280 ${item.nativeExt.cystines} M⁻¹cm⁻¹ (native, all cystines); instability ${item.summary.instability.toFixed(2)} (${item.summary.instability < 40 ? 'stable' : 'unstable'} prediction).`);
    return `${rows.join('\n')}\n\n${scienceText(SCIENCE)}`;
  };
  return <ToolLayout icon="🧬" title="Protein Workbench" blurb="Auditable protein parameters, profiles, sequence features, digestion, and mass matching."
    inputs={<>
      <label for="protein-fasta" class="block"><span class="mb-1 block text-sm font-medium">Protein sequence or FASTA</span><textarea id="protein-fasta" rows={8} class={`${FIELD} mono text-xs`} value={current.fasta} onInput={event => set({ fasta: (event.target as HTMLTextAreaElement).value })} /></label>
      <label for="protein-file" class="block"><span class="mb-1 block text-sm font-medium">Upload FASTA or text file (multiple entries supported)</span><input id="protein-file" class="block min-h-11 w-full text-sm" type="file" accept=".fasta,.fa,.faa,.txt,text/plain" onChange={async event => { const file = (event.target as HTMLInputElement).files?.[0]; if (file) set({ fasta: await file.text() }); }} /></label>
      <div class="grid gap-3 sm:grid-cols-2"><label for="protein-pka" class="block"><span class="mb-1 block text-sm font-medium">pKa scheme (summary, charge, and digest)</span><select id="protein-pka" class={FIELD} value={current.scheme} onChange={event => set({ scheme: (event.target as HTMLSelectElement).value as PKaScheme })}><option value="bjellqvist">Bjellqvist</option><option value="emboss">EMBOSS</option></select></label><label for="protein-half-life" class="block"><span class="mb-1 block text-sm font-medium">Half-life system</span><select id="protein-half-life" class={FIELD} value={current.organism} onChange={event => set({ organism: (event.target as HTMLSelectElement).value as Organism })}><option value="mammal">Mammalian reticulocytes in vitro</option><option value="yeast">Yeast in vivo</option><option value="ecoli">E. coli in vivo</option></select></label></div>
      <div><div class="flex items-center justify-between"><label for="protein-ph" class="text-sm font-medium">Charge pH</label><output class="mono" for="protein-ph">{current.pH.toFixed(1)}</output></div><input id="protein-ph" class="min-h-11 w-full accent-accent-600" type="range" min="0" max="14" step="0.1" value={current.pH} onInput={event => set({ pH: Number((event.target as HTMLInputElement).value) })} /></div>
      <ProfileControls state={current} set={set} />
      <FeatureControls state={current} set={set} />
      <label for="protein-domains" class="block"><span class="mb-1 block text-sm font-medium">User domains (CSV: name,start,end)</span><textarea id="protein-domains" rows={3} class={`${FIELD} mono text-xs`} placeholder={'name,start,end\nCatalytic core,10,80'} value={current.domainCsv} onInput={event => set({ domainCsv: (event.target as HTMLTextAreaElement).value })} /></label>
      <label for="protein-domain-file" class="block"><span class="mb-1 block text-sm font-medium">Upload domain CSV</span><input id="protein-domain-file" class="block min-h-11 w-full text-sm" type="file" accept=".csv,text/csv" onChange={async event => { const file = (event.target as HTMLInputElement).files?.[0]; if (file) set({ domainCsv: await file.text() }); }} /></label>
      {domainResult.error && <p role="alert" class="text-sm text-red-600">{domainResult.error}</p>}
      <details class="rounded-xl border border-slate-200 p-3 dark:border-slate-700" open><summary class="cursor-pointer font-medium">Digest and mass matcher</summary><div class="mt-3 grid gap-3 sm:grid-cols-2"><label for="protein-protease" class="block"><span class="mb-1 block text-sm font-medium">Protease</span><select id="protein-protease" class={FIELD} value={current.protease} onChange={event => set({ protease: (event.target as HTMLSelectElement).value })}>{PROTEASES.map(protease => <option key={protease.name} value={protease.name}>{protease.name}</option>)}</select></label><NumberField id="protein-missed" label="Missed cleavages" value={current.missedCleavages} min={0} max={5} set={missedCleavages => set({ missedCleavages })} /></div><label for="protein-observed" class="mt-3 block"><span class="mb-1 block text-sm font-medium">Observed masses (comma, space, or line separated)</span><textarea id="protein-observed" rows={3} class={`${FIELD} mono`} value={current.observedMasses} onInput={event => set({ observedMasses: (event.target as HTMLTextAreaElement).value })} /></label><div class="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4"><NumberField id="protein-tolerance" label="Tolerance" value={current.massTolerance} min={0} step={0.1} set={massTolerance => set({ massTolerance })} /><label for="protein-tolerance-unit" class="block"><span class="mb-1 block text-sm font-medium">Tolerance unit</span><select id="protein-tolerance-unit" class={FIELD} value={current.massToleranceUnit} onChange={event => set({ massToleranceUnit: (event.target as HTMLSelectElement).value as MassToleranceUnit })}><option>ppm</option><option>Da</option></select></label><label for="protein-mass-mode" class="block"><span class="mb-1 block text-sm font-medium">Observed mass mode</span><select id="protein-mass-mode" class={FIELD} value={current.massMode} onChange={event => set({ massMode: (event.target as HTMLSelectElement).value as PeptideMassMode })}><option value="[M+H]+">[M+H]+</option><option value="M">Neutral M</option></select></label><NumberField id="protein-zmax" label="Maximum ESI charge" value={current.zmax} min={1} max={50} set={zmax => set({ zmax })} /></div></details>
    </>}
    results={<div class="space-y-4">{result.errors.map(error => <p role="alert" class="rounded-lg border border-red-300 p-3 text-red-700 dark:border-red-800 dark:text-red-300" key={error}>{error}</p>)}{result.analyses.map(analysis => <ProteinCard key={`${analysis.header}-${analysis.seq}`} analysis={analysis} state={current} />)}</div>}
    actions={<ActionBar onCopy={copyText} shareUrl={shareUrl} />}
    science={<SciencePanel science={SCIENCE} />}
  />;
}
