import { useState, useMemo, useCallback } from 'preact/hooks';
import { useUrlState } from '@/lib/url-state';
import {
  TAG_DATABASE,
  PROTEASE_DATABASE,
  CONSTRUCT_PRESETS,
  findCleavageSites,
  simulateCleavage,
  getVirtualGelLanes,
  buildFusionConstruct,
  type CleavageSimulationResult,
  type VirtualGelBand,
  type VirtualGelLane,
} from '@/core/protein/tags';
import { ToolLayout } from '@/app/components/ToolLayout';
import { SciencePanel, scienceText } from '@/app/components/SciencePanel';
import { ActionBar } from '@/app/components/ActionBar';
import { SCIENCE } from './science';

const FIELD = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900';
const SELECT = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900';

interface State {
  sequence: string;
  proteaseId: string;
  relaxedTev: boolean;
  selectedSiteIndex: number | null;
  gelTheme: 'dark' | 'classic';
  tab: 'simulator' | 'builder' | 'library';
  // Builder state
  builderTag: string;
  builderProtease: string;
  builderTargetSeq: string;
  builderOrientation: 'N-term' | 'C-term';
  builderLinker: string;
}

const DEFAULTS: State = {
  sequence: CONSTRUCT_PRESETS[0]!.sequence,
  proteaseId: 'tev',
  relaxedTev: false,
  selectedSiteIndex: null,
  gelTheme: 'dark',
  tab: 'simulator',
  builderTag: 'his6',
  builderProtease: 'tev',
  builderTargetSeq:
    'MVSKGEELFTGVVPILVELDGDVNGHKFSVSGEGEGDATYGKLTLKFICTTGKLPVPWPTLVTTLTYGVQCFSRYPDHMKQHDFFKSAMPEGYVQERTIFFKDDGNYKTRAEVKFEGDTLVNRIELKGIDFKEDGNILGHKLEYNYNSHNVYIMADKQKNGIKVNFKIRHNIEDGSVQLADHYQQNTPIGDGPVLLPDNHYLSTQSALSKDPNEKRDHMVLLEFVTAAGITLGMDELYK',
  builderOrientation: 'N-term',
  builderLinker: 'SSG',
};

export default function View() {
  const [state, shareUrl] = useUrlState<State>('tags', DEFAULTS);
  const current = state.value;
  const set = (patch: Partial<State>) => {
    state.value = { ...state.value, ...patch };
  };

  const [hoveredBand, setHoveredBand] = useState<VirtualGelBand | null>(null);
  const [seqDisplayMode, setSeqDisplayMode] = useState<'annotated' | 'product'>('annotated');
  const [toastMessage, setToastMessage] = useState<string>('');
  const isSumoBuilder = current.builderTag === 'sumo';
  const builderProtease = isSumoBuilder
    ? 'ulp1'
    : current.builderProtease === 'ulp1'
      ? 'tev'
      : current.builderProtease;
  const builderOrientation = isSumoBuilder ? 'N-term' : current.builderOrientation;
  const builderLinker = isSumoBuilder ? '' : current.builderLinker;
  const builderProteases = Object.values(PROTEASE_DATABASE).filter(protease =>
    isSumoBuilder ? protease.id === 'ulp1' : protease.id !== 'ulp1'
  );

  const copyFinalProduct = async (seq?: string) => {
    const s = seq || simulation.targetFragment?.seq;
    if (!s) return;
    try {
      await navigator.clipboard.writeText(s);
      setToastMessage(`Copied cleaved target product (${s.length} aa) to clipboard!`);
      setTimeout(() => setToastMessage(''), 2500);
    } catch {
      setToastMessage('Failed to copy to clipboard');
      setTimeout(() => setToastMessage(''), 2500);
    }
  };

  // Cleavage simulation memo
  const simulation: CleavageSimulationResult = useMemo(() => {
    return simulateCleavage(
      current.sequence,
      current.proteaseId,
      current.selectedSiteIndex ?? undefined,
      current.relaxedTev
    );
  }, [current.sequence, current.proteaseId, current.selectedSiteIndex, current.relaxedTev]);

  // Virtual gel lanes memo
  const gelLanes: VirtualGelLane[] = useMemo(() => {
    return getVirtualGelLanes(simulation);
  }, [simulation]);

  // Available cleavage sites for user selector
  const availableSites = useMemo(() => {
    return findCleavageSites(current.sequence, current.proteaseId, current.relaxedTev);
  }, [current.sequence, current.proteaseId, current.relaxedTev]);

  // Copy result text for ActionBar
  const copyResultText = useCallback(() => {
    if (!simulation.cleavageSite) {
      return `Intact Protein (${simulation.intact.mwKda.toFixed(2)} kDa, pI ${simulation.intact.pI.toFixed(2)}). No ${simulation.protease.name} cleavage sites detected.\n\n${scienceText(SCIENCE)}`;
    }
    const lines = [
      `=== Protease Cleavage & Tag Depletion Simulation ===`,
      `Protease: ${simulation.protease.name} (${simulation.protease.recognitionMotif})`,
      `Cleavage Site: After ${simulation.cleavageSite.p1Residue}${simulation.cleavageSite.position1Based}`,
      `Cleavage Scar: ${simulation.cleavageSite.scarOnTarget}`,
      ``,
      `1. Intact Fusion: ${simulation.intact.mwKda.toFixed(2)} kDa | pI ${simulation.intact.pI.toFixed(2)} | ε280 ${simulation.intact.extinction280} M⁻¹cm⁻¹ | Abs 0.1% ${simulation.intact.abs01Percent.toFixed(3)}`,
      `2. Cleaved Target: ${simulation.targetFragment?.mwKda.toFixed(2)} kDa | pI ${simulation.targetFragment?.pI.toFixed(2)} | ε280 ${simulation.targetFragment?.extinction280} M⁻¹cm⁻¹ | Abs 0.1% ${simulation.targetFragment?.abs01Percent.toFixed(3)}`,
      `3. Cut Tag: ${simulation.tagFragment?.mwKda.toFixed(2)} kDa | pI ${simulation.tagFragment?.pI.toFixed(2)} | Tags: ${simulation.tagFragment?.detectedTags.map(t => t.tag.shortName).join(', ')}`,
      ``,
      `Subtractive Depletion (Waugh 2011):`,
      `- Resin: ${simulation.subtractiveDepletion?.affinityResin}`,
      `- Retained on resin: Cut Tag (${simulation.tagFragment?.mwKda.toFixed(2)} kDa), Uncleaved Fusion, and Tagged Protease`,
      `- Flow-Through (Product): Pure Target Protein (${simulation.targetFragment?.mwKda.toFixed(2)} kDa)`,
    ];
    if (simulation.warnings.length > 0) {
      lines.push(`Warnings: ${simulation.warnings.join('; ')}`);
    }
    lines.push('', scienceText(SCIENCE));
    return lines.join('\n');
  }, [simulation]);

  const loadPreset = (presetId: string) => {
    const preset = CONSTRUCT_PRESETS.find(p => p.id === presetId);
    if (!preset) return;
    set({
      sequence: preset.sequence,
      proteaseId: preset.proteaseId,
      selectedSiteIndex: null,
    });
  };

  const setBuilderTag = (builderTag: string) => {
    if (builderTag === 'sumo') {
      set({
        builderTag,
        builderProtease: 'ulp1',
        builderOrientation: 'N-term',
        builderLinker: '',
      });
      return;
    }
    set({
      builderTag,
      builderProtease: builderProtease,
    });
  };

  const applyBuilderConstruct = () => {
    try {
      const constructed = buildFusionConstruct(
        current.builderTag,
        builderProtease,
        current.builderTargetSeq,
        builderOrientation,
        builderLinker
      );
      set({
        sequence: constructed,
        proteaseId: builderProtease,
        selectedSiteIndex: null,
        tab: 'simulator',
      });
    } catch (error) {
      setToastMessage(error instanceof Error ? error.message : 'Unable to assemble this fusion construct.');
      setTimeout(() => setToastMessage(''), 4000);
    }
  };

  return (
    <>
      <ToolLayout
      icon="✂️"
      title="Tag Library & Protease Cleavage Simulator"
      blurb="Design recombinant fusions, simulate protease cleavage, compute MW, pI, ε₂₈₀, and Abs 0.1%, evaluate subtractive affinity resin depletion (Waugh 2011), and inspect virtual SDS-PAGE band mobility (Weber & Osborn 1969)."
      mobileResultSummary={
        simulation.cleavageSite ? (
          <div class="flex items-center justify-between gap-2 text-xs">
            <div>
              <span class="text-[10px] text-slate-500 block">Target Protein</span>
              <strong class="font-mono text-accent-700 dark:text-accent-300">
                {simulation.targetFragment?.mwKda.toFixed(1)} kDa
              </strong>
            </div>
            <div class="text-center">
              <span class="text-[10px] text-slate-500 block">Cut Tag</span>
              <span class="font-mono text-slate-700 dark:text-slate-300">
                {simulation.tagFragment?.mwKda.toFixed(1)} kDa
              </span>
            </div>
            <div class="text-right">
              <span class="text-[10px] text-slate-500 block">Intact Fusion</span>
              <span class="font-mono text-slate-700 dark:text-slate-300">
                {simulation.intact.mwKda.toFixed(1)} kDa
              </span>
            </div>
          </div>
        ) : (
          <span class="text-amber-600 dark:text-amber-400 text-xs font-semibold">
            No cleavage site detected for {simulation.protease.shortName}
          </span>
        )
      }
      actions={<ActionBar onCopy={copyResultText} shareUrl={shareUrl} />}
      science={<SciencePanel science={SCIENCE} />}
      inputs={
        <div class="space-y-4">
          {/* Main Tab Navigation */}
          <div class="flex rounded-xl bg-slate-100 p-1 dark:bg-slate-800 text-xs font-semibold">
            <button
              type="button"
              class={`flex-1 rounded-lg py-1.5 transition ${current.tab === 'simulator' ? 'bg-white shadow-xs text-slate-900 dark:bg-slate-700 dark:text-slate-100' : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-200'}`}
              onClick={() => set({ tab: 'simulator' })}
            >
              🔬 Simulator
            </button>
            <button
              type="button"
              class={`flex-1 rounded-lg py-1.5 transition ${current.tab === 'builder' ? 'bg-white shadow-xs text-slate-900 dark:bg-slate-700 dark:text-slate-100' : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-200'}`}
              onClick={() => set({ tab: 'builder' })}
            >
              🧬 Construct Builder
            </button>
            <button
              type="button"
              class={`flex-1 rounded-lg py-1.5 transition ${current.tab === 'library' ? 'bg-white shadow-xs text-slate-900 dark:bg-slate-700 dark:text-slate-100' : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-200'}`}
              onClick={() => set({ tab: 'library' })}
            >
              📚 Tag &amp; Protease Library
            </button>
          </div>

          {current.tab === 'simulator' && (
            <>
              {/* Presets Bar */}
              <div>
                <span class="text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1.5 block">
                  Benchmark Constructs:
                </span>
                <div class="flex flex-wrap gap-1.5">
                  {CONSTRUCT_PRESETS.map(preset => (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => loadPreset(preset.id)}
                      class="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-medium text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                    >
                      {preset.name}
                    </button>
                  ))}
                </div>
              </div>

              {/* Protease Selection */}
              <div>
                <label for="protease-select" class="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Site-Specific Protease
                </label>
                <select
                  id="protease-select"
                  class={SELECT}
                  value={current.proteaseId}
                  onChange={e =>
                    set({
                      proteaseId: (e.target as HTMLSelectElement).value,
                      selectedSiteIndex: null,
                    })
                  }
                >
                  {Object.values(PROTEASE_DATABASE).map(p => (
                    <option key={p.id} value={p.id}>
                      {p.name} — {p.recognitionMotif}
                    </option>
                  ))}
                </select>
                <div class="mt-1 flex items-center justify-between text-[11px] text-slate-500">
                  <span>Rule: {simulation.protease.cleavageRule}</span>
                  <span>{simulation.protease.optimalTemp}</span>
                </div>
              </div>

              {/* Kapust Relaxed Mode for TEV */}
              {current.proteaseId === 'tev' && (
                <label class="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 p-2.5 dark:border-slate-800 dark:bg-slate-900/50 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={current.relaxedTev}
                    onChange={e => set({ relaxedTev: (e.target as HTMLInputElement).checked })}
                    class="h-4 w-4 rounded border-slate-300 text-accent-600 focus:ring-accent-500"
                  />
                  <div class="text-xs">
                    <span class="font-medium text-slate-700 dark:text-slate-300 block">
                      Include non-canonical P1' residues (Kapust 2002)
                    </span>
                    <span class="text-[11px] text-slate-500 block">
                      Screen non-optimal P1' residues (Asn, Tyr, His, etc.) with relative cleavage efficiencies.
                    </span>
                  </div>
                </label>
              )}

              {/* Cleavage Site Selector if multiple sites exist */}
              {availableSites.length > 1 && (
                <div>
                  <label for="site-select" class="block text-xs font-semibold text-amber-700 dark:text-amber-400 mb-1">
                    Multiple Sites ({availableSites.length}) — Select Primary Cut:
                  </label>
                  <select
                    id="site-select"
                    class={SELECT}
                    value={current.selectedSiteIndex ?? availableSites[0]!.siteIndex}
                    onChange={e => set({ selectedSiteIndex: Number((e.target as HTMLSelectElement).value) })}
                  >
                    {availableSites.map((site, i) => (
                      <option key={site.siteIndex} value={site.siteIndex}>
                        Site {i + 1}: After {site.p1Residue}{site.position1Based} ({site.motifSequence}) — {site.cleavageDescription}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Sequence Input */}
              <div>
                <div class="flex items-center justify-between mb-1">
                  <label for="sequence-input" class="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Fusion Protein Sequence
                  </label>
                  <span class="text-[11px] text-slate-500 font-mono">
                    {simulation.intact.length} amino acids
                  </span>
                </div>
                <textarea
                  id="sequence-input"
                  rows={7}
                  class={`${FIELD} mono text-xs uppercase leading-relaxed resize-y`}
                  value={current.sequence}
                  onInput={e =>
                    set({
                      sequence: (e.target as HTMLTextAreaElement).value,
                      selectedSiteIndex: null,
                    })
                  }
                  placeholder="Paste fusion amino acid sequence (e.g. MHHHHHHSSGRENLYFQG...)"
                />
              </div>

              {/* Quick Sequence Tools */}
              <div class="flex flex-wrap gap-2">
                <button
                  type="button"
                  class="rounded-md border border-slate-300 px-2.5 py-1 text-xs text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                  onClick={() => set({ sequence: '' })}
                >
                  Clear Sequence
                </button>
                <button
                  type="button"
                  class="rounded-md border border-slate-300 px-2.5 py-1 text-xs text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                  onClick={() =>
                    set({
                      sequence: current.sequence.replace(/[^A-Za-z]/g, '').toUpperCase(),
                    })
                  }
                >
                  Sanitize &amp; Strip Spaces
                </button>
              </div>
            </>
          )}

          {current.tab === 'builder' && (
            <div class="space-y-3 rounded-xl border border-slate-200 bg-slate-50/50 p-3 dark:border-slate-800 dark:bg-slate-900/50">
              <h3 class="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                Assemble Fusion Construct
              </h3>

              <div class="grid grid-cols-2 gap-2">
                <div>
                  <label for="builder-tag" class="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Affinity Tag
                  </label>
                  <select
                    id="builder-tag"
                    class={SELECT}
                    value={current.builderTag}
                    onChange={e => setBuilderTag((e.target as HTMLSelectElement).value)}
                  >
                    {Object.values(TAG_DATABASE).map(t => (
                      <option key={t.id} value={t.id}>
                        {t.shortName} ({t.name})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label for="builder-protease" class="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Protease Cleavage Site
                  </label>
                  <select
                    id="builder-protease"
                    class={SELECT}
                    value={builderProtease}
                    onChange={e => set({ builderProtease: (e.target as HTMLSelectElement).value })}
                  >
                    {builderProteases.map(p => (
                      <option key={p.id} value={p.id}>
                        {p.shortName} ({p.recognitionMotif})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div class="grid grid-cols-2 gap-2">
                <div>
                  <label for="builder-orientation" class="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Tag Orientation
                  </label>
                  <select
                    id="builder-orientation"
                    class={SELECT}
                    value={builderOrientation}
                    onChange={e =>
                      set({
                        builderOrientation: (e.target as HTMLSelectElement).value as 'N-term' | 'C-term',
                      })
                    }
                  >
                    <option value="N-term">N-terminal Fusion (Standard)</option>
                    <option value="C-term" disabled={isSumoBuilder}>C-terminal Fusion</option>
                  </select>
                </div>

                <div>
                  <label for="builder-linker" class="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Linker Sequence
                  </label>
                  <input
                    id="builder-linker"
                    type="text"
                    class={FIELD}
                    value={builderLinker}
                    disabled={isSumoBuilder}
                    onInput={e => set({ builderLinker: (e.target as HTMLInputElement).value })}
                    placeholder={isSumoBuilder ? 'Locked for native SUMO cleavage' : 'e.g. SSG or GSAGSA'}
                  />
                  {isSumoBuilder && (
                    <p class="mt-1 text-[11px] text-violet-700 dark:text-violet-300">
                      SUMO ends in GG↓ and must join the target directly for native N-terminal release.
                    </p>
                  )}
                </div>
              </div>

              <div>
                <label for="builder-target-sequence" class="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Target Protein Sequence
                </label>
                <textarea
                  id="builder-target-sequence"
                  rows={4}
                  class={`${FIELD} mono text-xs uppercase resize-y`}
                  value={current.builderTargetSeq}
                  onInput={e => set({ builderTargetSeq: (e.target as HTMLTextAreaElement).value })}
                  placeholder="Paste target protein sequence..."
                />
              </div>

              <button
                type="button"
                class="w-full rounded-lg bg-accent-600 py-2 text-xs font-semibold text-white transition hover:bg-accent-700"
                onClick={applyBuilderConstruct}
              >
                Assemble &amp; Load into Simulator
              </button>
            </div>
          )}

          {current.tab === 'library' && (
            <div class="space-y-3 text-xs">
              <p class="text-slate-600 dark:text-slate-300">
                Browse properties of common affinity tags and site-specific proteases curated from Waugh (2011) and Kapust (2002).
              </p>
              <div class="space-y-2">
                {Object.values(TAG_DATABASE).map(tag => (
                  <div
                    key={tag.id}
                    class="rounded-lg border border-slate-200 bg-white p-2.5 dark:border-slate-800 dark:bg-slate-900"
                  >
                    <div class="flex items-center justify-between mb-1">
                      <span class="font-bold text-slate-900 dark:text-slate-100">{tag.name}</span>
                      <span class="font-mono text-[11px] text-slate-500">{tag.approxMwDa >= 1000 ? `${(tag.approxMwDa / 1000).toFixed(1)} kDa` : `${tag.approxMwDa.toFixed(0)} Da`}</span>
                    </div>
                    <div class="text-[11px] text-slate-600 dark:text-slate-400 space-y-0.5">
                      <div><strong class="text-slate-700 dark:text-slate-300">Resin:</strong> {tag.resin}</div>
                      <div><strong class="text-slate-700 dark:text-slate-300">Elution:</strong> {tag.elution}</div>
                      <div class="text-slate-500 mt-1">{tag.description}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      }
      results={
        <div class="space-y-6">
          {/* Key Metric Tiles */}
          {simulation.cleavageSite ? (
            <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {/* Tile 1: Intact */}
              <div class="rounded-xl border border-slate-200 bg-white p-3 shadow-xs dark:border-slate-800 dark:bg-slate-900">
                <span class="text-[11px] font-medium text-slate-500 block">Intact Fusion</span>
                <strong class="font-mono text-lg text-slate-900 dark:text-slate-100 block">
                  {simulation.intact.mwKda.toFixed(1)} <span class="text-xs font-normal">kDa</span>
                </strong>
                <div class="text-[11px] text-slate-500 flex justify-between mt-1">
                  <span>pI {simulation.intact.pI.toFixed(2)}</span>
                  <span>{simulation.intact.length} aa</span>
                </div>
              </div>

              {/* Tile 2: Cleaved Target */}
              <div class="rounded-xl border border-emerald-200 bg-emerald-50/50 p-3 shadow-xs dark:border-emerald-900/50 dark:bg-emerald-950/20">
                <div class="flex items-center justify-between">
                  <span class="text-[11px] font-medium text-emerald-700 dark:text-emerald-400 block">
                    Pure Target Protein
                  </span>
                  <button
                    type="button"
                    onClick={() => copyFinalProduct(simulation.targetFragment?.seq)}
                    class="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-600 text-white hover:bg-emerald-700 transition cursor-pointer"
                    title="Copy final cleaved product sequence"
                  >
                    📋 Copy
                  </button>
                </div>
                <strong class="font-mono text-lg text-emerald-700 dark:text-emerald-300 block">
                  {simulation.targetFragment?.mwKda.toFixed(1)} <span class="text-xs font-normal">kDa</span>
                </strong>
                <div class="text-[11px] text-emerald-600 dark:text-emerald-400 flex justify-between mt-1">
                  <span>pI {simulation.targetFragment?.pI.toFixed(2)}</span>
                  <span>Abs 0.1%: {simulation.targetFragment?.abs01Percent.toFixed(2)}</span>
                </div>
              </div>

              {/* Tile 3: Cut Tag */}
              <div class="rounded-xl border border-pink-200 bg-pink-50/50 p-3 shadow-xs dark:border-pink-900/50 dark:bg-pink-950/20">
                <span class="text-[11px] font-medium text-pink-700 dark:text-pink-400 block">
                  Cut Affinity Tag
                </span>
                <strong class="font-mono text-lg text-pink-700 dark:text-pink-300 block">
                  {simulation.tagFragment?.mwKda.toFixed(1)} <span class="text-xs font-normal">kDa</span>
                </strong>
                <div class="text-[11px] text-pink-600 dark:text-pink-400 flex justify-between mt-1">
                  <span>pI {simulation.tagFragment?.pI.toFixed(2)}</span>
                  <span>{simulation.tagFragment?.length} aa</span>
                </div>
              </div>

              {/* Tile 4: Cleavage Site / Scar */}
              <div class="rounded-xl border border-slate-200 bg-white p-3 shadow-xs dark:border-slate-800 dark:bg-slate-900">
                <span class="text-[11px] font-medium text-slate-500 block">Cleavage Site</span>
                <strong class="font-mono text-sm text-accent-700 dark:text-accent-300 block truncate mt-1">
                  {simulation.cleavageSite.p1Residue}↓{simulation.cleavageSite.p1PrimeResidue}
                </strong>
                <span class="text-[11px] text-slate-500 block truncate mt-1">
                  Scar: {simulation.cleavageSite.scarOnTarget}
                </span>
              </div>
            </div>
          ) : (
            <div class="rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/50 dark:bg-amber-950/30">
              <div class="flex items-center gap-2">
                <span class="text-xl">⚠️</span>
                <div>
                  <h4 class="font-semibold text-amber-900 dark:text-amber-200 text-sm">
                    No {simulation.protease.name} Cleavage Site Found
                  </h4>
                  <p class="text-xs text-amber-700 dark:text-amber-400 mt-0.5">
                    The sequence does not contain the required recognition motif ({simulation.protease.recognitionMotif}).
                    Choose a matching protease or load a construct from the presets or Construct Builder.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Warnings Bar */}
          {simulation.warnings.length > 0 && (
            <div class="rounded-xl border border-amber-200 bg-amber-50/80 p-3 text-xs text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300 space-y-1">
              <div class="font-bold">Construct Warnings &amp; Quality Notes:</div>
              {simulation.warnings.map((w, idx) => (
                <div key={idx} class="flex items-start gap-1.5">
                  <span>•</span>
                  <span>{w}</span>
                </div>
              ))}
            </div>
          )}

          {/* SDS-PAGE Virtual Mobility Preview */}
          <div class="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 shadow-xs">
            <div class="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3 dark:border-slate-800">
              <div>
                <h3 class="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                  <span>🧪</span> Virtual SDS-PAGE Lane Mobility Preview
                </h3>
                <p class="text-xs text-slate-500">
                  Relative electrophoretic migration (Weber &amp; Osborn 1969; y ∝ log₁₀ MW)
                </p>
              </div>
              <div class="flex items-center gap-2 text-xs">
                <span class="text-slate-400">Theme:</span>
                <button
                  type="button"
                  class={`rounded-md px-2 py-1 transition ${current.gelTheme === 'dark' ? 'bg-slate-800 text-white font-semibold' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}
                  onClick={() => set({ gelTheme: 'dark' })}
                >
                  Coomassie Dark
                </button>
                <button
                  type="button"
                  class={`rounded-md px-2 py-1 transition ${current.gelTheme === 'classic' ? 'bg-blue-600 text-white font-semibold' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}
                  onClick={() => set({ gelTheme: 'classic' })}
                >
                  Classic Blue
                </button>
              </div>
            </div>

            {/* SVG Gel Cassette */}
            <div class="mt-4 flex flex-col items-center">
              <div class="relative w-full max-w-[540px] overflow-hidden rounded-xl border border-slate-300 dark:border-slate-700 shadow-md">
                <svg
                  viewBox="0 0 460 380"
                  class="w-full h-auto select-none"
                  style={{ background: current.gelTheme === 'dark' ? '#0f172a' : '#cbd5e1' }}
                >
                  <defs>
                    {/* Linear gradient for gel sheen */}
                    <linearGradient id="gel-gradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stop-color={current.gelTheme === 'dark' ? '#1e293b' : '#94a3b8'} stop-opacity="0.9" />
                      <stop offset="100%" stop-color={current.gelTheme === 'dark' ? '#0f172a' : '#64748b'} stop-opacity="0.95" />
                    </linearGradient>

                    {/* Band glows */}
                    <filter id="band-blur" x="-20%" y="-20%" width="140%" height="140%">
                      <feGaussianBlur stdDeviation="1.2" />
                    </filter>
                  </defs>

                  {/* Gel body */}
                  <rect x="0" y="0" width="460" height="380" fill="url(#gel-gradient)" />

                  {/* Wells Header Area */}
                  <rect x="0" y="0" width="460" height="35" fill={current.gelTheme === 'dark' ? '#090d16' : '#475569'} opacity="0.6" />

                  {/* Lanes rendering */}
                  {gelLanes.map((lane, lIdx) => {
                    const laneWidth = 60;
                    const lanePitch = 82;
                    const laneX = 25 + lIdx * lanePitch;
                    const centerX = laneX + laneWidth / 2;

                    return (
                      <g key={lane.id}>
                        {/* Well outline at top */}
                        <rect
                          x={laneX + 5}
                          y={8}
                          width={laneWidth - 10}
                          height={18}
                          rx={2}
                          fill={current.gelTheme === 'dark' ? '#020617' : '#334155'}
                          stroke={current.gelTheme === 'dark' ? '#334155' : '#64748b'}
                          stroke-width="1"
                        />

                        {/* Lane label */}
                        <text
                          x={centerX}
                          y={30}
                          text-anchor="middle"
                          fill="#f8fafc"
                          font-size="9"
                          font-weight="bold"
                          font-family="system-ui, sans-serif"
                        >
                          {lane.title}
                        </text>

                        {/* Faint lane track divider */}
                        {lIdx > 0 && (
                          <line
                            x1={laneX - 11}
                            y1={35}
                            x2={laneX - 11}
                            y2={355}
                            stroke={current.gelTheme === 'dark' ? '#1e293b' : '#94a3b8'}
                            stroke-width="1"
                            stroke-dasharray="2 4"
                            opacity="0.4"
                          />
                        )}

                        {/* Bands in this lane */}
                        {lane.bands.map(band => {
                          // Y coordinate in resolving gel: top = 45, bottom = 345
                          const yPixel = 42 + band.yNorm * 295;
                          const isHov = hoveredBand?.id === band.id;
                          const bandColor =
                            band.color ??
                            (current.gelTheme === 'dark'
                              ? band.isLadder
                                ? '#93c5fd'
                                : '#60a5fa'
                              : band.isLadder
                                ? '#1e3a8a'
                                : '#1d4ed8');

                          return (
                            <g
                              key={band.id}
                              class="cursor-pointer transition"
                              onMouseEnter={() => setHoveredBand(band)}
                              onMouseLeave={() => setHoveredBand(null)}
                            >
                              {/* Band rectangle */}
                              <rect
                                x={laneX + 8}
                                y={yPixel - 2.5}
                                width={laneWidth - 16}
                                height={isHov ? 6 : 4.5}
                                rx={2}
                                fill={bandColor}
                                opacity={isHov ? 1.0 : band.intensity}
                                filter="url(#band-blur)"
                              />
                              <rect
                                x={laneX + 9}
                                y={yPixel - 1.5}
                                width={laneWidth - 18}
                                height={isHov ? 4 : 2.5}
                                rx={1}
                                fill="#ffffff"
                                opacity={isHov ? 0.8 : band.intensity * 0.4}
                              />

                              {/* Ladder label annotation next to ladder bands */}
                              {band.isLadder && (
                                <text
                                  x={laneX - 3}
                                  y={yPixel + 3}
                                  text-anchor="end"
                                  fill={current.gelTheme === 'dark' ? '#94a3b8' : '#1e293b'}
                                  font-size="8"
                                  font-weight={band.mwKda === 75 || band.mwKda === 25 ? 'bold' : 'normal'}
                                  font-family="monospace"
                                >
                                  {band.mwKda}k
                                </text>
                              )}
                            </g>
                          );
                        })}
                      </g>
                    );
                  })}

                  {/* Dye Front at bottom (Bromophenol blue) */}
                  <line
                    x1="20"
                    y1="350"
                    x2="440"
                    y2="350"
                    stroke="#38bdf8"
                    stroke-width="2"
                    stroke-opacity="0.75"
                  />
                  <text
                    x="442"
                    y="353"
                    text-anchor="end"
                    fill="#38bdf8"
                    font-size="7.5"
                    font-family="system-ui, sans-serif"
                    opacity="0.8"
                  >
                    Dye Front
                  </text>
                </svg>
              </div>

              {/* Band Inspection Tooltip / Legend */}
              <div class="mt-2.5 flex flex-wrap items-center justify-between w-full max-w-[540px] px-2 text-xs">
                <div class="flex items-center gap-3">
                  <span class="flex items-center gap-1">
                    <span class="inline-block h-2.5 w-3.5 rounded-xs bg-emerald-500" /> Target
                  </span>
                  <span class="flex items-center gap-1">
                    <span class="inline-block h-2.5 w-3.5 rounded-xs bg-pink-500" /> Cut Tag
                  </span>
                  <span class="flex items-center gap-1">
                    <span class="inline-block h-2.5 w-3.5 rounded-xs bg-sky-400" /> Intact
                  </span>
                </div>
                {hoveredBand ? (
                  <span class="font-mono text-accent-600 dark:text-accent-400 font-semibold">
                    {hoveredBand.name} — MW: {hoveredBand.mwKda.toFixed(1)} kDa
                  </span>
                ) : (
                  <span class="text-slate-400 text-[11px]">Hover over any band to inspect MW</span>
                )}
              </div>
            </div>
          </div>

          {/* Sequence Display with Cleavage Site Marker */}
          <div class="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 shadow-xs">
            <div class="flex flex-wrap items-center justify-between gap-2 mb-3">
              <h3 class="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                <span>🧬</span> Sequence Map &amp; Cleavage Junction Marker
              </h3>
              <div class="flex flex-wrap items-center gap-1.5 text-xs">
                {simulation.targetFragment && (
                  <button
                    type="button"
                    onClick={() => copyFinalProduct(simulation.targetFragment?.seq)}
                    class="px-2.5 py-1 rounded-md text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs transition flex items-center gap-1 cursor-pointer"
                    title="Copy strictly the cleaved target protein sequence (final product) without fusion tags"
                  >
                    <span>📋 Copy Cleaved Product ({simulation.targetFragment.length} aa)</span>
                  </button>
                )}
                <div class="flex rounded-lg bg-slate-100 p-0.5 dark:bg-slate-800">
                  <button
                    type="button"
                    class={`px-2 py-0.5 rounded text-[11px] font-medium transition ${
                      seqDisplayMode === 'annotated'
                        ? 'bg-white shadow-xs text-slate-900 dark:bg-slate-700 dark:text-slate-100 font-semibold'
                        : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-200'
                    }`}
                    onClick={() => setSeqDisplayMode('annotated')}
                  >
                    Annotated Fusion ({simulation.sequence.length} aa)
                  </button>
                  <button
                    type="button"
                    class={`px-2 py-0.5 rounded text-[11px] font-medium transition ${
                      seqDisplayMode === 'product'
                        ? 'bg-white shadow-xs text-emerald-700 dark:bg-slate-700 dark:text-emerald-300 font-semibold'
                        : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-200'
                    }`}
                    onClick={() => setSeqDisplayMode('product')}
                  >
                    Final Product ({simulation.targetFragment?.length ?? 0} aa)
                  </button>
                </div>
              </div>
            </div>

            {/* Sequence with inline visual features or pure product */}
            {seqDisplayMode === 'product' ? (
              <div
                onClick={() => copyFinalProduct(simulation.targetFragment?.seq)}
                title="Click to copy cleaved final product sequence"
                class="group relative rounded-xl border border-emerald-300 bg-emerald-50/40 p-3.5 dark:border-emerald-800 dark:bg-emerald-950/20 font-mono text-xs leading-loose tracking-wider break-all select-all cursor-pointer hover:border-emerald-500 transition"
              >
                {simulation.targetFragment ? (
                  <>
                    <span class="text-slate-800 dark:text-slate-200">{simulation.targetFragment.seq}</span>
                    <span class="opacity-0 group-hover:opacity-100 transition absolute top-2 right-2 text-[10px] font-sans font-medium bg-emerald-700 text-white px-2 py-0.5 rounded shadow-xs pointer-events-none">
                      Click to copy final product
                    </span>
                  </>
                ) : (
                  <span class="text-amber-600">No cleaved product available</span>
                )}
              </div>
            ) : (
              <div class="rounded-xl border border-slate-200 bg-slate-50 p-3.5 dark:border-slate-800 dark:bg-slate-950 font-mono text-xs leading-loose tracking-wider break-all select-all">
                {simulation.cleavageSite ? (
                  (() => {
                    const cutIdx = simulation.cleavageSite.siteIndex;
                    const motifStart = simulation.cleavageSite.motifStart;
                    const motifEnd = simulation.cleavageSite.motifEnd;

                    // Pre-motif, motif N-part, cleavage scissor, motif C-part, post-motif
                    const preMotif = simulation.sequence.slice(0, motifStart);
                    const motifN = simulation.sequence.slice(motifStart, cutIdx);
                    const motifC = simulation.sequence.slice(cutIdx, motifEnd);
                    const postMotif = simulation.sequence.slice(motifEnd);

                    return (
                      <span>
                        <span class="text-slate-700 dark:text-slate-300">{preMotif}</span>
                        <span class="bg-rose-100 text-rose-800 px-1 py-0.5 rounded-l font-bold dark:bg-rose-950/80 dark:text-rose-300">
                          {motifN}
                        </span>
                        {/* Cleavage Marker */}
                        <span
                          class="inline-flex items-center px-1 py-0.5 bg-rose-600 text-white font-extrabold text-[11px] rounded shadow-xs mx-0.5 cursor-help"
                          title={`Cleavage site: between ${simulation.cleavageSite.p1Residue}${cutIdx} and ${simulation.cleavageSite.p1PrimeResidue}${cutIdx + 1}`}
                        >
                          ✂ {cutIdx}↓
                        </span>
                        <span class="bg-amber-100 text-amber-800 px-1 py-0.5 rounded-r font-bold dark:bg-amber-950/80 dark:text-amber-300">
                          {motifC}
                        </span>
                        <span class="text-slate-700 dark:text-slate-300">{postMotif}</span>
                      </span>
                    );
                  })()
                ) : (
                  <span class="text-slate-700 dark:text-slate-300">{simulation.sequence}</span>
                )}
              </div>
            )}

            {/* Legend & Details */}
            <div class="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
              {seqDisplayMode === 'product' ? (
                <div class="flex items-center gap-2 text-emerald-700 dark:text-emerald-400 font-medium">
                  <span>✓</span>
                  <span>Pure cleaved target protein ({simulation.targetFragment?.length} aa) · Scar on target: <strong>{simulation.cleavageSite?.scarOnTarget || 'None'}</strong></span>
                </div>
              ) : (
                <div class="flex flex-wrap items-center gap-3">
                  <span class="flex items-center gap-1">
                    <span class="inline-block h-3 w-3 rounded-xs bg-rose-100 dark:bg-rose-950 border border-rose-400" />
                    Recognition Motif
                  </span>
                  <span class="flex items-center gap-1">
                    <span class="inline-block px-1 rounded-xs bg-rose-600 text-white text-[9px] font-bold">✂</span>
                    Cleavage Site
                  </span>
                  <span class="flex items-center gap-1">
                    <span class="inline-block h-3 w-3 rounded-xs bg-amber-100 dark:bg-amber-950 border border-amber-400" />
                    Target Overhang / Scar
                  </span>
                </div>
              )}
              {simulation.cleavageSite && (
                <span class="font-mono text-slate-700 dark:text-slate-300">
                  Cut after residue {simulation.cleavageSite.position1Based} ({simulation.cleavageSite.p1Residue})
                </span>
              )}
            </div>
          </div>

          {/* Subtractive Affinity Resin Depletion (Waugh 2011) */}
          <div class="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 shadow-xs">
            <h3 class="text-sm font-bold text-slate-900 dark:text-slate-100 mb-1 flex items-center gap-1.5">
              <span>🔄</span> Subtractive Affinity Chromatography Depletion (Waugh 2011)
            </h3>
            <p class="text-xs text-slate-500 mb-4">
              Passing the cleaved mixture back over the affinity matrix eliminates both the excised fusion tag and tagged protease, yielding pure target protein in the flow-through.
            </p>

            <div class="grid gap-3 sm:grid-cols-2">
              {/* Box 1: Retained on Resin */}
              <div class="rounded-xl border border-pink-200 bg-pink-50/40 p-3.5 dark:border-pink-900/50 dark:bg-pink-950/20">
                <div class="flex items-center justify-between mb-2">
                  <span class="font-bold text-xs text-pink-900 dark:text-pink-300">
                    BOUND TO RESIN (Depleted)
                  </span>
                  <span class="rounded bg-pink-200 px-1.5 py-0.5 text-[10px] font-bold text-pink-800 dark:bg-pink-900 dark:text-pink-200">
                    DISCARD / RECYCLE
                  </span>
                </div>
                <div class="text-xs text-slate-700 dark:text-slate-300 space-y-1.5">
                  <div>
                    <strong>Resin:</strong> {simulation.subtractiveDepletion?.affinityResin ?? 'Affinity Matrix'}
                  </div>
                  <div>
                    <strong>Cut Tag Fragment:</strong> {simulation.tagFragment?.name} ({simulation.tagFragment?.mwKda.toFixed(1)} kDa)
                  </div>
                  <div>
                    <strong>Tagged Protease:</strong> Recombinant {simulation.protease.shortName} carries an affinity tag and is retained on the resin.
                  </div>
                  <div>
                    <strong>Residual Uncleaved:</strong> Any uncleaved fusion protein carries the affinity tag and remains bound.
                  </div>
                </div>
              </div>

              {/* Box 2: Flow-Through (Product) */}
              <div class="rounded-xl border border-emerald-200 bg-emerald-50/40 p-3.5 dark:border-emerald-900/50 dark:bg-emerald-950/20">
                <div class="flex items-center justify-between mb-2">
                  <span class="font-bold text-xs text-emerald-900 dark:text-emerald-300">
                    FLOW-THROUGH (Purified Target)
                  </span>
                  <span class="rounded bg-emerald-200 px-1.5 py-0.5 text-[10px] font-bold text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200">
                    PRODUCT
                  </span>
                </div>
                <div class="text-xs text-slate-700 dark:text-slate-300 space-y-1.5">
                  <div>
                    <strong>Target Fragment:</strong> {simulation.targetFragment?.name} ({simulation.targetFragment?.mwKda.toFixed(1)} kDa)
                  </div>
                  <div>
                    <strong>Terminal Scar:</strong> {simulation.cleavageSite?.scarOnTarget ?? 'None'}
                  </div>
                  <div>
                    <strong>Calculated pI:</strong> {simulation.targetFragment?.pI.toFixed(2)}
                  </div>
                  <div>
                    <strong>Absorbance (0.1%):</strong> {simulation.targetFragment?.abs01Percent.toFixed(3)} (1 mg/mL A₂₈₀)
                  </div>
                  {simulation.targetFragment && (
                    <button
                      type="button"
                      onClick={() => copyFinalProduct(simulation.targetFragment?.seq)}
                      class="mt-2.5 w-full py-1.5 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs transition flex items-center justify-center gap-1.5 shadow-xs cursor-pointer"
                    >
                      <span>📋 Copy Cleaved Product ({simulation.targetFragment.length} aa)</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Fragment Properties Comparison Table */}
          <div class="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 shadow-xs">
            <h3 class="text-sm font-bold text-slate-900 dark:text-slate-100 mb-3 flex items-center gap-1.5">
              <span>📊</span> Fragment Physicochemical Properties
            </h3>

            <div class="overflow-x-auto">
              <table class="w-full text-left text-xs border-collapse">
                <thead>
                  <tr class="border-b border-slate-200 dark:border-slate-800 text-slate-500 text-[11px]">
                    <th class="pb-2 font-medium">Species</th>
                    <th class="pb-2 font-medium">Position</th>
                    <th class="pb-2 font-medium">Length</th>
                    <th class="pb-2 font-medium">MW (kDa)</th>
                    <th class="pb-2 font-medium">pI</th>
                    <th class="pb-2 font-medium">ε₂₈₀ (M⁻¹cm⁻¹)</th>
                    <th class="pb-2 font-medium">Abs 0.1%</th>
                    <th class="pb-2 font-medium">Affinity Depletion</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-slate-100 dark:divide-slate-800 font-mono">
                  {/* Intact */}
                  <tr>
                    <td class="py-2.5 font-sans font-semibold text-slate-900 dark:text-slate-100">
                      {simulation.intact.name}
                    </td>
                    <td class="py-2.5 text-slate-500">1–{simulation.intact.length}</td>
                    <td class="py-2.5">{simulation.intact.length} aa</td>
                    <td class="py-2.5 font-bold text-slate-900 dark:text-slate-100">
                      {simulation.intact.mwKda.toFixed(2)}
                    </td>
                    <td class="py-2.5">{simulation.intact.pI.toFixed(2)}</td>
                    <td class="py-2.5">{simulation.intact.extinction280.toLocaleString()}</td>
                    <td class="py-2.5">{simulation.intact.abs01Percent.toFixed(3)}</td>
                    <td class="py-2.5 font-sans text-slate-500">Parent Fusion</td>
                  </tr>

                  {/* Target Fragment */}
                  {simulation.targetFragment && (
                    <tr class="bg-emerald-50/50 dark:bg-emerald-950/20">
                      <td class="py-2.5 font-sans font-semibold text-emerald-800 dark:text-emerald-300">
                        Cleaved Target ({simulation.targetFragment.name})
                      </td>
                      <td class="py-2.5 text-slate-500">
                        {simulation.targetFragment.start1Based}–{simulation.targetFragment.end1Based}
                      </td>
                      <td class="py-2.5">{simulation.targetFragment.length} aa</td>
                      <td class="py-2.5 font-bold text-emerald-700 dark:text-emerald-300">
                        {simulation.targetFragment.mwKda.toFixed(2)}
                      </td>
                      <td class="py-2.5">{simulation.targetFragment.pI.toFixed(2)}</td>
                      <td class="py-2.5">{simulation.targetFragment.extinction280.toLocaleString()}</td>
                      <td class="py-2.5">{simulation.targetFragment.abs01Percent.toFixed(3)}</td>
                      <td class="py-2.5 font-sans text-emerald-700 dark:text-emerald-400 font-semibold">
                        Flow-Through (Product)
                      </td>
                    </tr>
                  )}

                  {/* Tag Fragment */}
                  {simulation.tagFragment && (
                    <tr class="bg-pink-50/50 dark:bg-pink-950/20">
                      <td class="py-2.5 font-sans font-semibold text-pink-800 dark:text-pink-300">
                        Cut Tag ({simulation.tagFragment.name})
                      </td>
                      <td class="py-2.5 text-slate-500">
                        {simulation.tagFragment.start1Based}–{simulation.tagFragment.end1Based}
                      </td>
                      <td class="py-2.5">{simulation.tagFragment.length} aa</td>
                      <td class="py-2.5 font-bold text-pink-700 dark:text-pink-300">
                        {simulation.tagFragment.mwKda.toFixed(2)}
                      </td>
                      <td class="py-2.5">{simulation.tagFragment.pI.toFixed(2)}</td>
                      <td class="py-2.5">{simulation.tagFragment.extinction280.toLocaleString()}</td>
                      <td class="py-2.5">{simulation.tagFragment.abs01Percent.toFixed(3)}</td>
                      <td class="py-2.5 font-sans text-pink-700 dark:text-pink-400 font-semibold">
                        Retained on Resin ({simulation.tagFragment.depletionResin?.split('/')[0]?.trim()})
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      }
    />
    {toastMessage && (
      <div class="fixed bottom-4 right-4 z-50 rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white shadow-lg flex items-center gap-2">
        <span>✓</span>
        <span>{toastMessage}</span>
      </div>
    )}
    </>
  );
}
