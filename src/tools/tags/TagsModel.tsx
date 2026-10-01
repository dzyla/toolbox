import { useUrlState } from '@/lib/url-state';
import { useCallback, useMemo, useState } from 'preact/hooks';
import { CONSTRUCT_PRESETS, PROTEASE_DATABASE, buildFusionConstruct, findCleavageSites, getVirtualGelLanes, simulateCleavage, type CleavageSimulationResult, type VirtualGelBand, type VirtualGelLane } from '@/core/protein/tags';
import { scienceText } from '@/app/components/SciencePanel';
import { SCIENCE } from './science';

export const FIELD = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900';
export const SELECT = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900';
export interface State {
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
export const DEFAULTS: State = {
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

export function useTagsModel() {
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

  return {
    state,
    shareUrl,
    current,
    set,
    hoveredBand,
    setHoveredBand,
    seqDisplayMode,
    setSeqDisplayMode,
    toastMessage,
    setToastMessage,
    isSumoBuilder,
    builderProtease,
    builderOrientation,
    builderLinker,
    builderProteases,
    copyFinalProduct,
    simulation,
    gelLanes,
    availableSites,
    copyResultText,
    loadPreset,
    setBuilderTag,
    applyBuilderConstruct,
  };
}

export type TagsModel = ReturnType<typeof useTagsModel>;
