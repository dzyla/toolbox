import { useState, useMemo } from 'preact/hooks';
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
const FIELD = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900';
const CHECK = 'h-4 w-4 rounded border-slate-300 text-accent-600 focus:ring-accent-500';

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
  scheme: 'bjellqvist',
  pH: 7,
  organism: 'mammal',
  hydroWindow: 9,
  chargeWindow: 9,
  foldWindow: 51,
  momentWindow: 11,
  helixWindow: 6,
  sheetWindow: 5,
  showHydro: true,
  showCharge: true,
  showFold: true,
  showMoment: true,
  showSecondary: true,
  showTags: true,
  showMotifs: true,
  showTm: true,
  showSignal: true,
  showDomains: true,
  tmWindow: 19,
  tmThreshold: 1.6,
  largeTagIdentity: 90,
  domainCsv: '',
  protease: 'Trypsin',
  missedCleavages: 0,
  observedMasses: '',
  massTolerance: 10,
  massToleranceUnit: 'ppm',
  massMode: '[M+H]+',
  zmax: 8,
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

function NumberField({
  id,
  label,
  value,
  set,
  min,
  max,
  step = 1,
}: {
  id: string;
  label: string;
  value: number;
  set: (value: number) => void;
  min?: number;
  max?: number;
  step?: number | string;
}) {
  return (
    <label for={id} class="block">
      <span class="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">{label}</span>
      <input
        id={id}
        class={`${FIELD} mono`}
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        onInput={event => {
          const val = parseFloat((event.target as HTMLInputElement).value);
          if (Number.isFinite(val)) set(val);
        }}
      />
    </label>
  );
}

function ProfileControls({ state, set }: { state: State; set: (patch: Partial<State>) => void }) {
  return (
    <details class="rounded-xl border border-slate-200 p-3 dark:border-slate-800">
      <summary class="cursor-pointer text-xs font-semibold uppercase tracking-wider text-slate-500">
        Profile Plots and Smoothing Windows
      </summary>
      <div class="mt-3 space-y-3">
        <label class="flex items-center gap-2 text-xs font-medium">
          <input class={CHECK} type="checkbox" checked={state.showHydro} onChange={e => set({ showHydro: (e.target as HTMLInputElement).checked })} />
          Kyte-Doolittle hydropathy
        </label>
        <NumberField id="protein-hydro-win" label="Hydropathy window" value={state.hydroWindow} min={1} step={2} set={hydroWindow => set({ hydroWindow })} />

        <label class="flex items-center gap-2 text-xs font-medium">
          <input class={CHECK} type="checkbox" checked={state.showCharge} onChange={e => set({ showCharge: (e.target as HTMLInputElement).checked })} />
          Per-residue charge at pH
        </label>
        <NumberField id="protein-charge-win" label="Charge window" value={state.chargeWindow} min={1} step={2} set={chargeWindow => set({ chargeWindow })} />

        <label class="flex items-center gap-2 text-xs font-medium">
          <input class={CHECK} type="checkbox" checked={state.showFold} onChange={e => set({ showFold: (e.target as HTMLInputElement).checked })} />
          FoldIndex
        </label>
        <NumberField id="protein-fold-win" label="FoldIndex window" value={state.foldWindow} min={1} step={2} set={foldWindow => set({ foldWindow })} />

        <label class="flex items-center gap-2 text-xs font-medium">
          <input class={CHECK} type="checkbox" checked={state.showMoment} onChange={e => set({ showMoment: (e.target as HTMLInputElement).checked })} />
          Hydrophobic moment
        </label>
        <NumberField id="protein-moment-win" label="Moment window" value={state.momentWindow} min={1} step={2} set={momentWindow => set({ momentWindow })} />

        <label class="flex items-center gap-2 text-xs font-medium">
          <input class={CHECK} type="checkbox" checked={state.showSecondary} onChange={e => set({ showSecondary: (e.target as HTMLInputElement).checked })} />
          Chou-Fasman helix and sheet
        </label>
        <div class="grid grid-cols-2 gap-2">
          <NumberField id="protein-helix-win" label="Helix window" value={state.helixWindow} min={1} set={helixWindow => set({ helixWindow })} />
          <NumberField id="protein-sheet-win" label="Sheet window" value={state.sheetWindow} min={1} set={sheetWindow => set({ sheetWindow })} />
        </div>
      </div>
    </details>
  );
}

function FeatureControls({ state, set }: { state: State; set: (patch: Partial<State>) => void }) {
  return (
    <details class="rounded-xl border border-slate-200 p-3 dark:border-slate-800">
      <summary class="cursor-pointer text-xs font-semibold uppercase tracking-wider text-slate-500">
        Feature Map Track Visibility
      </summary>
      <div class="mt-3 space-y-2 text-xs">
        <label class="flex items-center gap-2">
          <input class={CHECK} type="checkbox" checked={state.showTags} onChange={e => set({ showTags: (e.target as HTMLInputElement).checked })} />
          Affinity and epitope tags
        </label>
        <label class="flex items-center gap-2">
          <input class={CHECK} type="checkbox" checked={state.showMotifs} onChange={e => set({ showMotifs: (e.target as HTMLInputElement).checked })} />
          Motifs (nuclear localization, ER)
        </label>
        <label class="flex items-center gap-2">
          <input class={CHECK} type="checkbox" checked={state.showTm} onChange={e => set({ showTm: (e.target as HTMLInputElement).checked })} />
          Transmembrane segments
        </label>
        <label class="flex items-center gap-2">
          <input class={CHECK} type="checkbox" checked={state.showSignal} onChange={e => set({ showSignal: (e.target as HTMLInputElement).checked })} />
          Signal peptide candidates
        </label>
        <label class="flex items-center gap-2">
          <input class={CHECK} type="checkbox" checked={state.showDomains} onChange={e => set({ showDomains: (e.target as HTMLInputElement).checked })} />
          User-supplied domains
        </label>
      </div>
    </details>
  );
}

function FeatureMap({
  features,
  length,
  zoom = 1,
  hoveredFeature,
  onHoverFeature,
}: {
  features: ProteinFeature[];
  length: number;
  zoom?: number;
  hoveredFeature?: ProteinFeature | null;
  onHoverFeature?: (f: ProteinFeature | null) => void;
}) {
  if (!features.length) return <p class="text-sm text-slate-500 py-3">No matching features found with current filters.</p>;
  const baseWidth = 800;
  const width = Math.round(baseWidth * zoom);
  const trackStart = 32;
  const trackWidth = width - 64;
  const x = (position: number) => trackStart + ((position - 1) / Math.max(1, length - 1)) * trackWidth;

  // Stagger overlapping features across tracks
  const tracks: { end: number }[] = [];
  const featureTracks = features.map(feature => {
    for (let i = 0; i < tracks.length; i++) {
      if (feature.start > tracks[i]!.end + 2) {
        tracks[i]!.end = feature.end;
        return i;
      }
    }
    const assignedTrack = tracks.length;
    tracks.push({ end: feature.end });
    return assignedTrack;
  });

  const numTracks = Math.max(1, Math.min(10, tracks.length));
  const svgHeight = 55 + numTracks * 22;

  return (
    <div class="overflow-x-auto rounded-xl border border-slate-200 bg-slate-50/50 p-3 dark:border-slate-800 dark:bg-slate-900/50">
      <svg
        viewBox={`0 0 ${width} ${svgHeight}`}
        style={{ minWidth: `${Math.max(36, 36 * zoom)}rem` }}
        class="h-auto w-full select-none"
        role="img"
        aria-label="Protein feature map"
      >
        <line x1={trackStart} x2={trackStart + trackWidth} y1="20" y2="20" stroke="#94a3b8" stroke-width="4" stroke-linecap="round" />
        <text x={trackStart} y="12" font-size="10" font-family="monospace" fill="#64748b" font-weight="600">1</text>
        <text x={trackStart + trackWidth} y="12" text-anchor="end" font-size="10" font-family="monospace" fill="#64748b" font-weight="600">{length} aa</text>
        {features.map((feature, index) => {
          const trackIdx = featureTracks[index]! % 10;
          const y = 32 + trackIdx * 20;
          const fx = x(feature.start);
          const fw = Math.max(6, x(feature.end) - fx + 2);
          const isHovered = hoveredFeature?.name === feature.name && hoveredFeature?.start === feature.start;

          return (
            <g
              key={`${feature.kind}-${feature.name}-${feature.start}-${index}`}
              class="cursor-pointer transition-all"
              onMouseEnter={() => onHoverFeature?.(feature)}
              onMouseLeave={() => onHoverFeature?.(null)}
            >
              <rect
                x={fx}
                y={y}
                width={fw}
                height="14"
                rx="3"
                fill={feature.color}
                stroke={isHovered ? '#38bdf8' : 'rgba(0,0,0,0.15)'}
                stroke-width={isHovered ? 2 : 0.8}
              >
                <title>{feature.name} ({feature.kind}): {feature.start}–{feature.end} ({feature.end - feature.start + 1} aa)</title>
              </rect>
              {fw > 30 && (
                <text
                  x={fx + fw / 2}
                  y={y + 10}
                  font-size="9"
                  font-weight="bold"
                  text-anchor="middle"
                  fill="#ffffff"
                  pointer-events="none"
                >
                  {feature.name.length * 6 > fw ? `${feature.name.slice(0, Math.floor(fw / 6))}…` : feature.name}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function filteredFeatures(features: ProteinFeature[], state: State): ProteinFeature[] {
  return features.filter(feature =>
    feature.kind === 'tag' || feature.kind === 'large-tag'
      ? state.showTags
      : feature.kind === 'motif'
        ? state.showMotifs
        : feature.kind === 'transmembrane'
          ? state.showTm
          : feature.kind === 'signal-peptide'
            ? state.showSignal
            : state.showDomains
  );
}

function methodCsv(rows: (string | number)[][]): string {
  return `${scienceText(SCIENCE).split('\n').map(line => `# ${line}`).join('\n')}\n${toCsv(rows)}`;
}

function ProteinCard({
  analysis,
  state,
}: {
  analysis: Analysis;
  state: State;
}) {
  const [featureSearch, setFeatureSearch] = useState('');
  const [featureZoom, setFeatureZoom] = useState<number>(1);
  const [hoveredFeature, setHoveredFeature] = useState<ProteinFeature | null>(null);
  const [peptideSearch, setPeptideSearch] = useState('');

  const positions = Array.from({ length: analysis.seq.length }, (_, index) => index + 1);
  const secondary = secondaryStructureProfiles(analysis.seq, state.helixWindow, state.sheetWindow);
  const shownFeatures = filteredFeatures(analysis.features, state);
  const searchedFeatures = shownFeatures.filter(f =>
    f.name.toLowerCase().includes(featureSearch.toLowerCase()) ||
    `${f.start}-${f.end}`.includes(featureSearch)
  );

  const observed = state.observedMasses.split(/[\s,;]+/).map(Number).filter(value => Number.isFinite(value) && value > 0);
  const matches = matchPeptideMasses(analysis.peptides, observed, state.massTolerance, state.massToleranceUnit, state.massMode);
  const ladder = esiChargeLadder(analysis.summary.mono, state.zmax);
  const removed = Object.entries(analysis.clean.removed).filter(([, count]) => count > 0);

  const searchedPeptides = analysis.peptides.filter(p =>
    p.seq.toLowerCase().includes(peptideSearch.toLowerCase()) ||
    `${p.start}-${p.end}`.includes(peptideSearch) ||
    p.mw.toFixed(1).includes(peptideSearch)
  );

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

  const digestRows: (string | number)[][] = [
    ['Start', 'End', 'Sequence', 'Missed_cleavages', 'Average_mass_Da', 'Monoisotopic_mass_Da', `pI_${state.scheme}`],
    ...analysis.peptides.map(peptide => [peptide.start, peptide.end, peptide.seq, peptide.missed, peptide.mw, peptide.mono, isoelectricPoint(countAA(peptide.seq), state.scheme, peptide.seq)]),
  ];

  return (
    <article class="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900" data-testid="protein-card">
      {/* Header & Quick Summary Banner */}
      <div class="border-b border-slate-200 pb-4 dark:border-slate-800">
        <div class="flex flex-wrap items-baseline justify-between gap-2">
          <h2 class="text-xl font-bold text-slate-900 dark:text-slate-100 break-words">{analysis.header}</h2>
          <span class="rounded-full bg-accent-50 px-3 py-1 text-xs font-semibold text-accent-700 dark:bg-accent-950 dark:text-accent-300">
            {analysis.seq.length} aa · {analysis.summary.mw.toFixed(1)} Da
          </span>
        </div>
        <p class="mono mt-1 break-all text-xs text-slate-500 max-h-16 overflow-y-auto">{analysis.seq}</p>

        {/* Net Charge & pI Quick Display */}
        <div class="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-slate-50 px-4 py-2.5 dark:bg-slate-800/60 text-xs">
          <div class="flex items-center gap-2">
            <span class="text-slate-500">Net charge at pH {state.pH.toFixed(1)}:</span>{' '}
            <strong class={`mono text-sm ${analysis.charge > 0 ? 'text-blue-600 dark:text-blue-400' : analysis.charge < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
              {analysis.charge > 0 ? '+' : ''}{analysis.charge.toFixed(3)} e
            </strong>
          </div>
          <div class="flex items-center gap-2">
            <span class="text-slate-500">pI:</span>{' '}
            <strong class="mono text-sm text-slate-900 dark:text-slate-100">{analysis.summary.pI.toFixed(2)}</strong>
          </div>
        </div>

        {analysis.clean.ambiguous.length > 0 && (
          <p role="alert" class="mt-2 rounded-lg border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100">
            Ambiguous residues: {analysis.clean.ambiguous.join(', ')}. Approximate masses may be used; atom counts and extinction contributions are omitted.
          </p>
        )}
        {removed.length > 0 && (
          <div class="mt-2 rounded-lg bg-slate-50 p-2.5 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            <strong>Sequence cleaning report:</strong> {removed.map(([kind, count]) => `${count} ${kind}`).join(', ')}
          </div>
        )}
      </div>

      {/* Overview Parameters Grid */}
      <dl class="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        <div class="rounded-xl border border-slate-200 p-3 dark:border-slate-800">
          <dt class="text-xs font-medium text-slate-500 uppercase tracking-wider">Length</dt>
          <dd class="mono text-lg font-bold text-slate-900 dark:text-slate-100">{analysis.seq.length} aa</dd>
        </div>
        <div class="rounded-xl border border-slate-200 p-3 dark:border-slate-800">
          <dt class="text-xs font-medium text-slate-500 uppercase tracking-wider">Average molecular weight</dt>
          <dd class="mono text-lg font-bold text-slate-900 dark:text-slate-100">{analysis.summary.mw.toFixed(2)} Da</dd>
        </div>
        <div class="rounded-xl border border-slate-200 p-3 dark:border-slate-800">
          <dt class="text-xs font-medium text-slate-500 uppercase tracking-wider">Monoisotopic molecular weight</dt>
          <dd class="mono text-lg font-bold text-slate-900 dark:text-slate-100">{analysis.summary.mono.toFixed(4)} Da</dd>
        </div>
        <div class="rounded-xl border border-slate-200 p-3 dark:border-slate-800">
          <dt class="text-xs font-medium text-slate-500 uppercase tracking-wider">Theoretical pI ({state.scheme === 'bjellqvist' ? 'Bjellqvist' : 'EMBOSS'})</dt>
          <dd class="mono text-lg font-bold text-accent-600 dark:text-accent-400">{analysis.summary.pI.toFixed(3)}</dd>
        </div>
        <div class="rounded-xl border border-slate-200 p-3 dark:border-slate-800">
          <dt class="text-xs font-medium text-slate-500 uppercase tracking-wider">Net charge at pH {state.pH.toFixed(1)}</dt>
          <dd class="mono text-lg font-bold text-slate-900 dark:text-slate-100">{analysis.charge.toFixed(3)} e</dd>
        </div>
        <div class="rounded-xl border border-slate-200 p-3 dark:border-slate-800">
          <dt class="text-xs font-medium text-slate-500 uppercase tracking-wider">Instability index</dt>
          <dd class="mono text-lg font-bold">
            {analysis.summary.instability.toFixed(2)}{' '}
            <span class={`text-xs px-2 py-0.5 rounded font-medium ${analysis.summary.instability < 40 ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'}`}>
              {analysis.summary.instability < 40 ? 'stable' : 'unstable'}
            </span>
          </dd>
        </div>
        <div class="rounded-xl border border-slate-200 p-3 dark:border-slate-800">
          <dt class="text-xs font-medium text-slate-500 uppercase tracking-wider">Aliphatic index</dt>
          <dd class="mono text-lg font-bold text-slate-900 dark:text-slate-100">{analysis.summary.aliphatic.toFixed(2)}</dd>
        </div>
        <div class="rounded-xl border border-slate-200 p-3 dark:border-slate-800">
          <dt class="text-xs font-medium text-slate-500 uppercase tracking-wider">GRAVY (Kyte–Doolittle)</dt>
          <dd class="mono text-lg font-bold text-slate-900 dark:text-slate-100">{analysis.summary.gravy.toFixed(3)}</dd>
        </div>
        <div class="rounded-xl border border-slate-200 p-3 dark:border-slate-800">
          <dt class="text-xs font-medium text-slate-500 uppercase tracking-wider">Estimated half-life</dt>
          <dd class="mono text-lg font-bold text-slate-900 dark:text-slate-100">{halfLife(analysis.seq, state.organism)}</dd>
        </div>
        <div class="sm:col-span-2 lg:col-span-3 rounded-xl border border-slate-200 p-3 dark:border-slate-800">
          <dt class="text-xs font-medium text-slate-500 uppercase tracking-wider">Atomic formula</dt>
          <dd class="mono text-sm font-semibold break-all text-slate-900 dark:text-slate-100">{analysis.summary.formula || 'Unavailable'}</dd>
        </div>
      </dl>

      {/* Extinction and Composition */}
      <div class="grid gap-4 lg:grid-cols-2">
        <section class="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
          <h3 class="font-semibold text-sm text-slate-900 dark:text-slate-100">Extinction at 280 nm</h3>
          <div class="mt-2 overflow-x-auto">
            <table class="w-full text-left text-xs sm:text-sm">
              <thead>
                <tr class="border-b border-slate-200 text-slate-500 dark:border-slate-700">
                  <th class="pb-2 font-medium">State</th>
                  <th class="pb-2 text-right font-medium">ε₂₈₀ (M⁻¹cm⁻¹)</th>
                  <th class="pb-2 text-right font-medium">Abs 0.1% (1 g/L)</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100 dark:divide-slate-800">
                {extRows.map(row => (
                  <tr key={row[0]}>
                    <td class="py-2 text-slate-700 dark:text-slate-300">{row[0]}</td>
                    <td class="mono py-2 text-right font-semibold">{row[1].toFixed(0)}</td>
                    <td class="mono py-2 text-right">{row[2].toFixed(3)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <details class="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
          <summary class="cursor-pointer font-semibold text-sm text-slate-900 dark:text-slate-100">
            Residue composition ({analysis.seq.length} residues)
          </summary>
          <div class="mt-2 overflow-x-auto max-h-64">
            <table class="w-full text-xs">
              <thead class="sticky top-0 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 text-slate-500">
                <tr>
                  <th class="pb-1 text-left font-medium">Residue</th>
                  <th class="pb-1 text-right font-medium">Count</th>
                  <th class="pb-1 text-right font-medium">Percent</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100 dark:divide-slate-800">
                {[...ACCEPTED_AA].map(residue => (
                  <tr key={residue}>
                    <td class="mono py-1">{residue}{STANDARD_AA.includes(residue) ? '' : ' (ambiguous)'}</td>
                    <td class="mono py-1 text-right font-medium">{analysis.summary.counts[residue] ?? 0}</td>
                    <td class="mono py-1 text-right">{(100 * (analysis.summary.counts[residue] ?? 0) / analysis.seq.length).toFixed(2)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </div>

      {/* Property Profiles Section */}
      {analysis.seq.length > 1 && (
        <details open class="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
          <summary class="cursor-pointer font-bold text-sm text-slate-900 dark:text-slate-100 mb-3 select-none flex items-center justify-between">
            <span>Property profiles (Hydropathy, Charge, FoldIndex, Moment, Secondary)</span>
            <span class="text-xs font-normal text-slate-400">Click to collapse</span>
          </summary>
          <div class="space-y-4">
            <div class="grid gap-4 lg:grid-cols-2">
              {state.showHydro && (
                <div class="rounded-xl border border-slate-200 p-3 dark:border-slate-800 bg-white dark:bg-slate-900">
                  <LineChart
                    title="Kyte-Doolittle hydropathy"
                    xLabel="Residue"
                    yLabel={`Mean KD (${state.hydroWindow}-residue window)`}
                    series={[{ name: 'Hydropathy', x: positions, y: hydropathyProfile(analysis.seq, state.hydroWindow) }]}
                    exportName="protein-hydropathy"
                  />
                </div>
              )}
              {state.showCharge && (
                <div class="rounded-xl border border-slate-200 p-3 dark:border-slate-800 bg-white dark:bg-slate-900">
                  <LineChart
                    title={`Per-residue charge at pH ${state.pH.toFixed(1)} (${state.scheme})`}
                    xLabel="Residue"
                    yLabel={`Mean charge / e (${state.chargeWindow}-residue window)`}
                    hLines={[{ y: 0 }]}
                    series={[{ name: 'Charge', x: positions, y: chargeProfile(analysis.seq, state.pH, state.chargeWindow, state.scheme) }]}
                    exportName="protein-charge"
                  />
                </div>
              )}
              {state.showFold && (
                <div class="rounded-xl border border-slate-200 p-3 dark:border-slate-800 bg-white dark:bg-slate-900">
                  <LineChart
                    title="FoldIndex: positive folded, negative disordered"
                    xLabel="Residue"
                    yLabel={`FoldIndex (${state.foldWindow}-residue window)`}
                    hLines={[{ y: 0, label: 'folded / disordered' }]}
                    series={[{ name: 'FoldIndex', x: positions, y: foldIndexProfile(analysis.seq, state.foldWindow) }]}
                    exportName="protein-foldindex"
                  />
                </div>
              )}
              {state.showMoment && (
                <div class="rounded-xl border border-slate-200 p-3 dark:border-slate-800 bg-white dark:bg-slate-900">
                  <LineChart
                    title="Hydrophobic moment (α-helix 100°, Kyte-Doolittle scale)"
                    xLabel="Residue"
                    yLabel={`µH (${state.momentWindow}-residue window)`}
                    series={[{ name: 'Hydrophobic moment', x: positions, y: hydrophobicMomentProfile(analysis.seq, state.momentWindow) }]}
                    exportName="protein-hydrophobic-moment"
                  />
                </div>
              )}
              {state.showSecondary && (
                <div class="lg:col-span-2 rounded-xl border border-slate-200 p-3 dark:border-slate-800 bg-white dark:bg-slate-900">
                  <LineChart
                    title="Chou-Fasman secondary-structure propensity"
                    xLabel="Residue"
                    yLabel="Relative propensity (/100)"
                    hLines={[{ y: 1, label: 'neutral propensity' }]}
                    series={[
                      { name: `Helix (${state.helixWindow})`, x: positions, y: secondary.helix },
                      { name: `Sheet (${state.sheetWindow})`, x: positions, y: secondary.sheet },
                    ]}
                    exportName="protein-secondary-structure"
                  />
                </div>
              )}
            </div>
          </div>
        </details>
      )}

      {/* Feature Map Section */}
      <details open class="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
        <summary class="cursor-pointer font-bold text-sm text-slate-900 dark:text-slate-100 mb-3 select-none flex items-center justify-between">
          <span>Feature map ({shownFeatures.length} detected features)</span>
          <span class="text-xs font-normal text-slate-400">Click to collapse</span>
        </summary>
        <div class="space-y-3">
          {/* Zoom & Active Feature Banner */}
          <div class="flex flex-wrap items-center justify-between gap-2 text-xs">
            <div class="text-slate-500">
              {hoveredFeature ? (
                <span class="font-medium text-sky-600 dark:text-sky-400">
                  Active: <strong>{hoveredFeature.name}</strong> ({hoveredFeature.kind}) · Residues {hoveredFeature.start}–{hoveredFeature.end} ({hoveredFeature.end - hoveredFeature.start + 1} aa)
                </span>
              ) : (
                <span>Hover a feature or table row to inspect</span>
              )}
            </div>
            <div class="flex items-center gap-1">
              <span class="text-slate-400 text-[11px] mr-1">Scale:</span>
              {[1, 1.5, 2, 3].map(z => (
                <button
                  key={z}
                  type="button"
                  onClick={() => setFeatureZoom(z)}
                  class={`px-2 py-0.5 rounded text-[11px] font-semibold transition ${
                    featureZoom === z
                      ? 'bg-accent-600 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'
                  }`}
                >
                  {z}×
                </button>
              ))}
            </div>
          </div>

          <FeatureMap
            features={shownFeatures}
            length={analysis.seq.length}
            zoom={featureZoom}
            hoveredFeature={hoveredFeature}
            onHoverFeature={setHoveredFeature}
          />

          <div class="flex items-center justify-between gap-3 pt-2">
            <span class="text-xs font-semibold text-slate-500 uppercase tracking-wider">Features Details</span>
            <input
              type="search"
              placeholder="Search features..."
              value={featureSearch}
              onInput={e => setFeatureSearch((e.target as HTMLInputElement).value)}
              class={`${FIELD} w-48 text-xs py-1`}
            />
          </div>

          <div class="overflow-y-auto max-h-64 rounded-xl border border-slate-200 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800 text-xs">
            {searchedFeatures.length === 0 ? (
              <p class="p-3 text-slate-500 text-center">No features match current filter or search.</p>
            ) : (
              searchedFeatures.map((f, i) => {
                const isHovered = hoveredFeature?.name === f.name && hoveredFeature?.start === f.start;
                return (
                  <div
                    key={`${f.name}-${f.start}-${i}`}
                    onMouseEnter={() => setHoveredFeature(f)}
                    onMouseLeave={() => setHoveredFeature(null)}
                    class={`p-2.5 flex items-center justify-between transition cursor-pointer ${
                      isHovered
                        ? 'bg-sky-50 dark:bg-sky-950/50 border-l-2 border-sky-500'
                        : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                    }`}
                  >
                    <div class="flex items-center gap-2">
                      <span class="inline-block w-2.5 h-2.5 rounded-full" style={{ backgroundColor: f.color }} />
                      <strong class="text-slate-900 dark:text-slate-100">{f.name}</strong>
                      <span class="text-slate-400 capitalize">({f.kind})</span>
                      {f.identity !== undefined && (
                        <span class="text-emerald-600 dark:text-emerald-400 font-semibold">
                          {(f.identity * 100).toFixed(1)}% id
                        </span>
                      )}
                    </div>
                    <div class="mono text-slate-500">
                      Residues {f.start}–{f.end} ({f.end - f.start + 1} aa)
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </details>

      {/* Protease Digest & Mass Matching */}
      <details open class="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
        <summary class="cursor-pointer font-bold text-sm text-slate-900 dark:text-slate-100 mb-3 select-none flex items-center justify-between">
          <span>Digest and mass matching ({analysis.peptides.length} peptides)</span>
          <span class="text-xs font-normal text-slate-400">Click to collapse</span>
        </summary>
        <div class="space-y-4">
          {matches.length > 0 && (
            <div class="rounded-xl border border-accent-500 bg-accent-50/30 p-3 text-xs dark:bg-accent-950/30">
              <strong class="font-semibold text-accent-800 dark:text-accent-300">Mass matches ({matches.length})</strong>
              <ul class="mt-1 space-y-1">
                {matches.map((match, index) => (
                  <li key={`${match.observed}-${match.peptide.start}-${index}`} class="mono">
                    <strong>{match.observed.toFixed(4)}</strong> → {match.peptide.seq} ({match.peptide.start}–{match.peptide.end}), Δ {match.errorDa.toFixed(5)} Da / {match.errorPpm.toFixed(2)} ppm
                  </li>
                ))}
              </ul>
            </div>
          )}

          {observed.length > 0 && matches.length === 0 && (
            <p class="text-xs text-slate-500">No digest peptides match the observed masses at this tolerance.</p>
          )}

          <div class="flex items-center justify-between gap-3">
            <span class="text-xs font-semibold text-slate-500 uppercase tracking-wider">Peptides Table</span>
            <input
              type="search"
              placeholder="Search sequence / mass..."
              value={peptideSearch}
              onInput={e => setPeptideSearch((e.target as HTMLInputElement).value)}
              class={`${FIELD} w-48 text-xs py-1`}
            />
          </div>

          <div class="overflow-x-auto max-h-72 rounded-xl border border-slate-200 dark:border-slate-800">
            <table class="w-full min-w-[44rem] text-left text-xs">
              <thead class="sticky top-0 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 text-slate-500">
                <tr>
                  <th class="py-2 px-3 font-medium">Residues</th>
                  <th class="py-2 px-3 font-medium">Peptide</th>
                  <th class="py-2 px-3 text-right font-medium">Missed</th>
                  <th class="py-2 px-3 text-right font-medium">Average Da</th>
                  <th class="py-2 px-3 text-right font-medium">Monoisotopic Da</th>
                  <th class="py-2 px-3 text-right font-medium">pI ({state.scheme})</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100 dark:divide-slate-800">
                {searchedPeptides.map((peptide, index) => (
                  <tr key={`${peptide.start}-${peptide.end}-${index}`} class="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <td class="mono py-1.5 px-3">{peptide.start}–{peptide.end}</td>
                    <td class="mono py-1.5 px-3 font-medium">{peptide.seq}</td>
                    <td class="mono py-1.5 px-3 text-right">{peptide.missed}</td>
                    <td class="mono py-1.5 px-3 text-right">{peptide.mw.toFixed(3)}</td>
                    <td class="mono py-1.5 px-3 text-right">{peptide.mono.toFixed(4)}</td>
                    <td class="mono py-1.5 px-3 text-right">{isoelectricPoint(countAA(peptide.seq), state.scheme, peptide.seq).toFixed(3)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div>
            <h4 class="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
              ESI charge ladder for intact monoisotopic mass
            </h4>
            <div class="flex flex-wrap gap-2">
              {ladder.map(item => (
                <span key={item.charge} class="rounded-lg bg-slate-100 px-2 py-1 text-xs dark:bg-slate-800">
                  <strong class="text-accent-600 dark:text-accent-400">{item.charge}+</strong>{' '}
                  <span class="mono">{item.mz.toFixed(4)} m/z</span>
                </span>
              ))}
            </div>
          </div>

          <div class="flex flex-wrap gap-2 pt-1">
            <button
              type="button"
              class="min-h-9 rounded-lg border border-slate-300 px-3 text-xs font-semibold hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800 transition"
              onClick={() => downloadText(methodCsv(summaryRows), `${analysis.header.replace(/[^a-z0-9_-]+/gi, '_')}-summary.csv`, 'text/csv;charset=utf-8')}
            >
              Export summary CSV
            </button>
            <button
              type="button"
              class="min-h-9 rounded-lg border border-slate-300 px-3 text-xs font-semibold hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800 transition"
              onClick={() => downloadText(methodCsv(digestRows), `${analysis.header.replace(/[^a-z0-9_-]+/gi, '_')}-digest.csv`, 'text/csv;charset=utf-8')}
            >
              Export digest CSV
            </button>
          </div>
        </div>
      </details>
    </article>
  );
}

function analyse(state: State, domains: ProteinFeature[]): { analyses: Analysis[]; errors: string[] } {
  const records = parseFasta(state.fasta);
  if (!records.length) return { analyses: [], errors: ['Enter at least one protein sequence or FASTA entry.'] };
  const protease = PROTEASES.find(candidate => candidate.name === state.protease) ?? PROTEASES[0]!;
  const analyses: Analysis[] = [];
  const errors: string[] = [];

  for (const record of records) {
    const clean = sanitize(record.seq);
    if (!clean.seq) {
      errors.push(`${record.header}: no accepted protein residues remain after cleaning.`);
      continue;
    }
    try {
      const summary = summarize(clean.seq, state.scheme);
      const detected = mergeFeatures([
        ...scanFeatures(clean.seq, state.largeTagIdentity),
        ...transmembraneCandidates(clean.seq, state.tmWindow, state.tmThreshold),
        ...signalPeptideCandidates(clean.seq),
        ...domains.filter(domain => domain.start <= clean.seq.length).map(domain => ({ ...domain, end: Math.min(domain.end, clean.seq.length) })),
      ]);
      analyses.push({
        header: record.header,
        raw: record.seq,
        seq: clean.seq,
        clean,
        summary,
        charge: netCharge(summary.counts, state.pH, state.scheme, clean.seq),
        nativeExt: extinctionCoefficients(summary.counts, summary.mw, 'native'),
        denaturedExt: extinctionCoefficients(summary.counts, summary.mw, 'denatured'),
        features: detected,
        peptides: digest(clean.seq, protease, state.missedCleavages),
      });
    } catch (error) {
      errors.push(`${record.header}: ${error instanceof Error ? error.message : 'Analysis failed.'}`);
    }
  }
  return { analyses, errors };
}

export default function View() {
  const [state, shareUrl] = useUrlState<State>('protein', DEFAULTS);
  const current = state.value;
  const set = (patch: Partial<State>) => { state.value = { ...state.value, ...patch }; };

  const domainResult = useMemo(() => {
    try {
      return { domains: parseDomainCsv(current.domainCsv), error: '' };
    } catch (error) {
      return { domains: [] as ProteinFeature[], error: error instanceof Error ? error.message : 'Could not parse domain CSV.' };
    }
  }, [current.domainCsv]);

  const result = useMemo(() => analyse(current, domainResult.domains), [current, domainResult.domains]);

  const copyText = () => {
    const rows = result.analyses.map(item =>
      `${item.header}: ${item.seq.length} aa; average MW ${item.summary.mw.toFixed(2)} Da; monoisotopic MW ${item.summary.mono.toFixed(4)} Da; pI ${item.summary.pI.toFixed(3)} (${current.scheme}); charge ${item.charge.toFixed(3)} e at pH ${current.pH.toFixed(1)}; ε280 ${item.nativeExt.cystines} M⁻¹cm⁻¹ (native, all cystines); instability ${item.summary.instability.toFixed(2)} (${item.summary.instability < 40 ? 'stable' : 'unstable'} prediction).`
    );
    return `${rows.join('\n')}\n\n${scienceText(SCIENCE)}`;
  };

  return (
    <ToolLayout
      icon="🧬"
      title="Protein Workbench"
      blurb="Auditable protein parameters, profiles, sequence features, digestion, and mass matching."
      wide={true}
      inputs={
        <>
          <label for="protein-fasta" class="block">
            <span class="mb-1 block text-sm font-medium">Protein sequence or FASTA</span>
            <textarea
              id="protein-fasta"
              rows={8}
              class={`${FIELD} mono text-xs`}
              value={current.fasta}
              onInput={event => set({ fasta: (event.target as HTMLTextAreaElement).value })}
            />
          </label>

          <label for="protein-file" class="block">
            <span class="mb-1 block text-xs font-medium text-slate-500">
              Upload FASTA or text file (multiple entries supported)
            </span>
            <input
              id="protein-file"
              class="block min-h-11 w-full text-xs"
              type="file"
              accept=".fasta,.fa,.faa,.txt,text/plain"
              onChange={async event => {
                const file = (event.target as HTMLInputElement).files?.[0];
                if (file) set({ fasta: await file.text() });
              }}
            />
          </label>

          <div class="grid gap-3 sm:grid-cols-2">
            <label for="protein-pka" class="block">
              <span class="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">pKa scheme</span>
              <select
                id="protein-pka"
                class={FIELD}
                value={current.scheme}
                onChange={event => set({ scheme: (event.target as HTMLSelectElement).value as PKaScheme })}
              >
                <option value="bjellqvist">Bjellqvist (ExPASy)</option>
                <option value="emboss">EMBOSS</option>
              </select>
            </label>
            <label for="protein-half-life" class="block">
              <span class="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Half-life system</span>
              <select
                id="protein-half-life"
                class={FIELD}
                value={current.organism}
                onChange={event => set({ organism: (event.target as HTMLSelectElement).value as Organism })}
              >
                <option value="mammal">Mammalian reticulocytes</option>
                <option value="yeast">Yeast in vivo</option>
                <option value="ecoli">E. coli in vivo</option>
              </select>
            </label>
          </div>

          <div class="rounded-xl border border-slate-200 bg-slate-50/50 p-3 dark:border-slate-800 dark:bg-slate-800/40">
            <div class="flex items-center justify-between mb-1.5">
              <label for="protein-ph" class="text-xs font-medium text-slate-600 dark:text-slate-400">
                Charge pH
              </label>
              <output class="mono text-xs font-bold text-accent-600 dark:text-accent-400" for="protein-ph">
                {current.pH.toFixed(1)}
              </output>
            </div>
            <input
              id="protein-ph"
              class="min-h-11 w-full accent-accent-600"
              type="range"
              min="0"
              max="14"
              step="0.1"
              value={current.pH}
              onInput={event => set({ pH: Number((event.target as HTMLInputElement).value) })}
            />
          </div>

          <ProfileControls state={current} set={set} />
          <FeatureControls state={current} set={set} />

          <details class="rounded-xl border border-slate-200 p-3 dark:border-slate-800">
            <summary class="cursor-pointer text-xs font-semibold uppercase tracking-wider text-slate-500">
              User Custom Domains (CSV)
            </summary>
            <div class="mt-3 space-y-2">
              <textarea
                id="protein-domains"
                rows={3}
                class={`${FIELD} mono text-xs`}
                placeholder={'name,start,end\nCatalytic domain,10,80'}
                value={current.domainCsv}
                onInput={event => set({ domainCsv: (event.target as HTMLTextAreaElement).value })}
              />
              <input
                id="protein-domain-file"
                class="block w-full text-xs"
                type="file"
                accept=".csv,text/csv"
                onChange={async event => {
                  const file = (event.target as HTMLInputElement).files?.[0];
                  if (file) set({ domainCsv: await file.text() });
                }}
              />
              {domainResult.error && <p role="alert" class="text-xs text-red-600">{domainResult.error}</p>}
            </div>
          </details>

          <details class="rounded-xl border border-slate-200 p-3 dark:border-slate-800" open>
            <summary class="cursor-pointer text-xs font-semibold uppercase tracking-wider text-slate-500">
              Digest and Mass Matcher
            </summary>
            <div class="mt-3 space-y-3">
              <div class="grid gap-2 sm:grid-cols-2">
                <label for="protein-protease" class="block">
                  <span class="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Protease</span>
                  <select
                    id="protein-protease"
                    class={FIELD}
                    value={current.protease}
                    onChange={event => set({ protease: (event.target as HTMLSelectElement).value })}
                  >
                    {PROTEASES.map(protease => (
                      <option key={protease.name} value={protease.name}>
                        {protease.name}
                      </option>
                    ))}
                  </select>
                </label>
                <NumberField
                  id="protein-missed"
                  label="Missed cleavages"
                  value={current.missedCleavages}
                  min={0}
                  max={5}
                  set={missedCleavages => set({ missedCleavages })}
                />
              </div>

              <label for="protein-observed" class="block">
                <span class="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
                  Observed masses (comma, space, or line separated)
                </span>
                <textarea
                  id="protein-observed"
                  rows={2}
                  class={`${FIELD} mono text-xs`}
                  placeholder="e.g. 1024.52, 1432.71"
                  value={current.observedMasses}
                  onInput={event => set({ observedMasses: (event.target as HTMLTextAreaElement).value })}
                />
              </label>

              <div class="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <NumberField
                  id="protein-tolerance"
                  label="Tolerance"
                  value={current.massTolerance}
                  min={0}
                  step="any"
                  set={massTolerance => set({ massTolerance })}
                />
                <label for="protein-tolerance-unit" class="block">
                  <span class="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Unit</span>
                  <select
                    id="protein-tolerance-unit"
                    class={FIELD}
                    value={current.massToleranceUnit}
                    onChange={event => set({ massToleranceUnit: (event.target as HTMLSelectElement).value as MassToleranceUnit })}
                  >
                    <option>ppm</option>
                    <option>Da</option>
                  </select>
                </label>
                <label for="protein-mass-mode" class="block">
                  <span class="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Mode</span>
                  <select
                    id="protein-mass-mode"
                    class={FIELD}
                    value={current.massMode}
                    onChange={event => set({ massMode: (event.target as HTMLSelectElement).value as PeptideMassMode })}
                  >
                    <option value="[M+H]+">[M+H]+</option>
                    <option value="M">Neutral M</option>
                  </select>
                </label>
                <NumberField
                  id="protein-zmax"
                  label="Max charge"
                  value={current.zmax}
                  min={1}
                  max={50}
                  set={zmax => set({ zmax })}
                />
              </div>
            </div>
          </details>
        </>
      }
      results={
        <div class="space-y-4">
          {result.errors.map(error => (
            <p role="alert" class="rounded-lg border border-red-300 p-3 text-red-700 dark:border-red-800 dark:text-red-300" key={error}>
              {error}
            </p>
          ))}
          {result.analyses.map(analysis => (
            <ProteinCard
              key={`${analysis.header}-${analysis.seq}`}
              analysis={analysis}
              state={current}
            />
          ))}
        </div>
      }
      actions={<ActionBar onCopy={copyText} shareUrl={shareUrl} />}
      science={<SciencePanel science={SCIENCE} />}
    />
  );
}
