import { useState, useMemo, useRef } from 'preact/hooks';
import { ToolLayout } from '@/app/components/ToolLayout';
import { ActionBar } from '@/app/components/ActionBar';
import { SciencePanel, scienceText } from '@/app/components/SciencePanel';
import { useUrlState } from '@/lib/url-state';
import { downloadSvg, svgToPngBlob, downloadBlob, toCsv } from '@/lib/export';
import {
  type DsfEffectClassification,
  type DsfChannelType,
  parseDsfCsv,
  analyzeDsfDataset,
  generateLysozymeDemoDataset,
  generateNanoDsfDemoDataset,
  generatePrometheusDemoDataset,
  formatDsfToCsv,
  getNiceTicks,
} from '@/core/dsf';
import { SCIENCE } from './science';

interface State {
  presetKey: 'lysozyme' | 'nanodsf' | 'prometheus' | 'custom';
  tmMethod: 'derivative' | 'boltzmann';
  windowSize: number;
  normalizeFluorescence: boolean;
  normMode: 'raw' | 'normalized' | 'fraction_unfolded';
  showBoltzmannOverlay: boolean;
  showResiduals: boolean;
  selectedConditionId: string;
  referenceConditionId: string;
  selectedTraceIds: string[] | null;
  searchQuery: string;
  channelFilter: 'all' | 'ratio' | 'f330' | 'f350' | 'raw';
  tempMinCrop: number | null;
  tempMaxCrop: number | null;
  yScaleMode: 'auto_visible' | 'global' | 'zero_baseline';
  chartLayout: 'stacked' | 'side_by_side';
  transitionDirection: 'both' | 'auto' | 'positive' | 'negative';
  peakProminenceRatio: number;
  maxPeaks: number;
  removedPeakKeys: string[];
}

const DEFAULTS: State = {
  presetKey: 'lysozyme',
  tmMethod: 'derivative',
  windowSize: 7,
  normalizeFluorescence: false,
  normMode: 'raw',
  showBoltzmannOverlay: true,
  showResiduals: false,
  selectedConditionId: '',
  referenceConditionId: '',
  selectedTraceIds: null,
  searchQuery: '',
  channelFilter: 'all',
  tempMinCrop: null,
  tempMaxCrop: null,
  yScaleMode: 'auto_visible',
  chartLayout: 'stacked',
  transitionDirection: 'auto',
  peakProminenceRatio: 0.15,
  maxPeaks: 4,
  removedPeakKeys: [],
};

const PALETTE = [
  '#2563eb', // blue
  '#059669', // emerald
  '#d97706', // amber
  '#7c3aed', // violet
  '#dc2626', // red
  '#0891b2', // cyan
  '#db2777', // pink
  '#475569', // slate
  '#ea580c', // orange
  '#16a34a', // green
  '#6366f1', // indigo
  '#0d9488', // teal
  '#9333ea', // purple
  '#ca8a04', // yellow-gold
  '#e11d48', // rose
  '#0284c7', // sky
];

export default function DsfView() {
  const [stateSig, shareUrl] = useUrlState<State>('dsf', DEFAULTS);
  const s = stateSig.value;
  const set = (patch: Partial<State>) => {
    stateSig.value = { ...stateSig.value, ...patch };
  };

  const [rawText, setRawText] = useState<string>(() => {
    return formatDsfToCsv(generateLysozymeDemoDataset());
  });

  const [hoverData, setHoverData] = useState<{
    temperature: number;
    condName?: string;
    fl?: number;
    dFdT?: number;
    xPx: number;
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const meltSvgRef = useRef<SVGSVGElement>(null);
  const derivSvgRef = useRef<SVGSVGElement>(null);
  const residSvgRef = useRef<SVGSVGElement>(null);

  // Load Presets
  function handleLoadPreset(preset: 'lysozyme' | 'nanodsf' | 'prometheus') {
    if (preset === 'lysozyme') {
      const data = generateLysozymeDemoDataset();
      setRawText(formatDsfToCsv(data));
      set({
        presetKey: 'lysozyme',
        selectedConditionId: '',
        referenceConditionId: '',
        selectedTraceIds: null,
        normalizeFluorescence: false,
        normMode: 'raw',
        channelFilter: 'all',
        tempMinCrop: null,
        tempMaxCrop: null,
        removedPeakKeys: [],
      });
    } else if (preset === 'nanodsf') {
      const data = generateNanoDsfDemoDataset();
      setRawText(formatDsfToCsv(data));
      set({
        presetKey: 'nanodsf',
        selectedConditionId: '',
        referenceConditionId: '',
        selectedTraceIds: null,
        normalizeFluorescence: false,
        normMode: 'raw',
        channelFilter: 'all',
        tempMinCrop: null,
        tempMaxCrop: null,
        removedPeakKeys: [],
      });
    } else {
      const data = generatePrometheusDemoDataset();
      setRawText(formatDsfToCsv(data));
      // For Prometheus multi-channel, default to selecting the Ratio channel
      const ratioIds = data.conditions
        .map((c, idx) => (c.channel === 'ratio' ? `cond_${idx + 1}` : null))
        .filter((id): id is string => id !== null);

      set({
        presetKey: 'prometheus',
        selectedConditionId: 'cond_1',
        referenceConditionId: 'cond_1',
        selectedTraceIds: ratioIds,
        normalizeFluorescence: false,
        normMode: 'raw',
        channelFilter: 'ratio',
        tempMinCrop: null,
        tempMaxCrop: null,
        removedPeakKeys: [],
      });
    }
  }

  function handleFileUpload(file: File) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      if (content) {
        setRawText(content);
        set({
          presetKey: 'custom',
          selectedConditionId: '',
          referenceConditionId: '',
          selectedTraceIds: null,
          tempMinCrop: null,
          tempMaxCrop: null,
          removedPeakKeys: [],
        });
      }
    };
    reader.readAsText(file);
  }

  // Parse Raw Tabular Data
  const parsedData = useMemo(() => {
    try {
      if (!rawText.trim()) return null;
      return parseDsfCsv(rawText);
    } catch (err) {
      return { error: (err as Error).message };
    }
  }, [rawText]);

  // Available Channels in parsed dataset
  const availableChannels = useMemo(() => {
    if (!parsedData || 'error' in parsedData) return [];
    const chs = new Set<DsfChannelType>();
    for (const c of parsedData.conditions) {
      if (c.channel) chs.add(c.channel);
    }
    return Array.from(chs);
  }, [parsedData]);

  // Master list of all candidate conditions in parsed dataset
  const allConditionsList = useMemo(() => {
    if (!parsedData || 'error' in parsedData) return [];
    return parsedData.conditions.map((cond, idx) => ({
      id: `cond_${idx + 1}`,
      name: cond.name,
      channel: cond.channel,
      capillary: cond.capillary,
      idx,
    }));
  }, [parsedData]);

  // Active / selected condition IDs for plotting and analysis
  const effectiveSelectedIds = useMemo(() => {
    if (!parsedData || 'error' in parsedData) return [];
    if (s.selectedTraceIds !== null) {
      // User explicitly defined trace selection (could be empty [])
      const valid = new Set(allConditionsList.map(c => c.id));
      return s.selectedTraceIds.filter(id => valid.has(id));
    }

    // Default: If Prometheus format with ratio channels, default to selecting all ratio traces
    if (parsedData.format === 'prometheus' && availableChannels.includes('ratio')) {
      return allConditionsList.filter(c => c.channel === 'ratio').map(c => c.id);
    }

    // Otherwise default to all
    return allConditionsList.map(c => c.id);
  }, [parsedData, s.selectedTraceIds, allConditionsList, availableChannels]);

  // Execute DSF Multi-Condition Analysis on selected traces
  const analysis = useMemo(() => {
    if (!parsedData || 'error' in parsedData) return null;
    try {
      const tempRange: [number, number] | undefined =
        s.tempMinCrop != null && s.tempMaxCrop != null
          ? [s.tempMinCrop, s.tempMaxCrop]
          : undefined;

      return analyzeDsfDataset(parsedData, {
        referenceNameOrIndex: s.referenceConditionId || undefined,
        windowSize: s.windowSize,
        tmMethod: s.tmMethod,
        selectedConditionIds: effectiveSelectedIds,
        tempRange,
        direction: s.transitionDirection,
        peakProminenceRatio: s.peakProminenceRatio,
        maxPeaks: s.maxPeaks,
        removedPeakKeys: s.removedPeakKeys,
      });
    } catch (err) {
      return { error: (err as Error).message };
    }
  }, [parsedData, s.referenceConditionId, s.windowSize, s.tmMethod, effectiveSelectedIds, s.tempMinCrop, s.tempMaxCrop, s.transitionDirection, s.peakProminenceRatio, s.maxPeaks, s.removedPeakKeys]);

  // Inspected / Focused Active Condition
  const activeCondition = useMemo(() => {
    if (!analysis || 'error' in analysis || analysis.conditions.length === 0) return null;
    if (s.selectedConditionId) {
      const found = analysis.conditions.find(c => c.id === s.selectedConditionId);
      if (found) return found;
    }
    return analysis.rankedConditions[0] || analysis.conditions[0];
  }, [analysis, s.selectedConditionId]);

  const referenceCondition = useMemo(() => {
    if (!analysis || 'error' in analysis || analysis.conditions.length === 0) return null;
    return analysis.conditions.find(c => c.id === analysis.referenceConditionId) || analysis.conditions[0];
  }, [analysis]);

  // Normalization helper
  function normalizeVal(val: number, points: { fluorescence: number }[]): number {
    const vals = points.map(p => p.fluorescence);
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    if (max <= min) return 0;
    return ((val - min) / (max - min)) * 100;
  }

  function getDisplayedFl(val: number, points: { fluorescence: number }[]): number {
    if (s.normalizeFluorescence || s.normMode === 'normalized') {
      return normalizeVal(val, points);
    }
    return val;
  }

  // Dynamic Autoscale Bounds & Scientific Nice Ticks
  const bounds = useMemo(() => {
    if (!analysis || 'error' in analysis || analysis.conditions.length === 0) {
      const defaultXTicks = getNiceTicks(20, 95, 6);
      const defaultYTicks = getNiceTicks(0, 100, 5);
      const defaultDTicks = getNiceTicks(0, 100, 5);
      return {
        minT: defaultXTicks.min,
        maxT: defaultXTicks.max,
        xTicks: defaultXTicks,
        minFl: defaultYTicks.min,
        maxFl: defaultYTicks.max,
        yFlTicks: defaultYTicks,
        minD: defaultDTicks.min,
        maxD: defaultDTicks.max,
        yDTicks: defaultDTicks,
      };
    }

    const temps = analysis.temperatures;
    const minTData = Math.min(...temps);
    const maxTData = Math.max(...temps);
    const xTicks = getNiceTicks(minTData, maxTData, 6);

    // Y bounds (Fluorescence / Ratio)
    let minFlData = Infinity;
    let maxFlData = -Infinity;
    let minDData = Infinity;
    let maxDData = -Infinity;

    // Evaluate over visible conditions
    for (const cond of analysis.conditions) {
      for (let i = 0; i < cond.rawPoints.length; i++) {
        const y = getDisplayedFl(cond.rawPoints[i]!.fluorescence, cond.rawPoints);
        if (y < minFlData) minFlData = y;
        if (y > maxFlData) maxFlData = y;
      }
      for (let i = 0; i < cond.derivativePoints.length; i++) {
        const d = cond.derivativePoints[i]!.dFdT;
        if (d < minDData) minDData = d;
        if (d > maxDData) maxDData = d;
      }
    }

    if (!isFinite(minFlData)) minFlData = 0;
    if (!isFinite(maxFlData)) maxFlData = 100;
    if (!isFinite(minDData)) minDData = 0;
    if (!isFinite(maxDData)) maxDData = 10;

    // Apply zero baseline if selected
    if (s.yScaleMode === 'zero_baseline') {
      if (minFlData > 0) minFlData = 0;
    }

    const flPad = (maxFlData - minFlData) * 0.05 || (Math.abs(maxFlData) * 0.1 || 1);
    const dPad = (maxDData - minDData) * 0.08 || (Math.abs(maxDData) * 0.1 || 1);

    const yFlTicks = getNiceTicks(minFlData - flPad, maxFlData + flPad, 5);
    const yDTicks = getNiceTicks(minDData - dPad, maxDData + dPad, 5);

    return {
      minT: xTicks.min,
      maxT: xTicks.max,
      xTicks,
      minFl: yFlTicks.min,
      maxFl: yFlTicks.max,
      yFlTicks,
      minD: yDTicks.min,
      maxD: yDTicks.max,
      yDTicks,
    };
  }, [analysis, s.normalizeFluorescence, s.normMode, s.yScaleMode]);

  // SVG Geometry Settings
  const plotWidth = 650;
  const meltHeight = 270;
  const derivHeight = 230;
  const residHeight = 160;
  const padLeft = 62;
  const padRight = 30;
  const padTop = 26;
  const padBottom = 40;

  const innerWidth = plotWidth - padLeft - padRight;
  const innerMeltHeight = meltHeight - padTop - padBottom;
  const innerDerivHeight = derivHeight - padTop - padBottom;
  const innerResidHeight = residHeight - padTop - padBottom;

  function scaleX(t: number): number {
    const span = Math.max(1e-4, bounds.maxT - bounds.minT);
    return padLeft + ((t - bounds.minT) / span) * innerWidth;
  }

  function invScaleX(xPx: number): number {
    const frac = (xPx - padLeft) / innerWidth;
    return bounds.minT + frac * (bounds.maxT - bounds.minT);
  }

  function scaleMeltY(fl: number): number {
    const span = Math.max(1e-4, bounds.maxFl - bounds.minFl);
    return meltHeight - padBottom - ((fl - bounds.minFl) / span) * innerMeltHeight;
  }

  function scaleDerivY(d: number): number {
    const span = Math.max(1e-4, bounds.maxD - bounds.minD);
    return derivHeight - padBottom - ((d - bounds.minD) / span) * innerDerivHeight;
  }

  // Interactive Hover Handler
  function handleSvgMouseMove(e: MouseEvent, svgElement: SVGSVGElement | null) {
    if (!svgElement || !analysis || 'error' in analysis || analysis.temperatures.length === 0) return;
    const rect = svgElement.getBoundingClientRect();
    const xCoord = ((e.clientX - rect.left) / rect.width) * plotWidth;
    if (xCoord < padLeft || xCoord > plotWidth - padRight) {
      setHoverData(null);
      return;
    }

    const t = invScaleX(xCoord);
    const temps = analysis.temperatures;
    let closestIdx = 0;
    let minDist = Infinity;
    for (let i = 0; i < temps.length; i++) {
      const dist = Math.abs(temps[i]! - t);
      if (dist < minDist) {
        minDist = dist;
        closestIdx = i;
      }
    }

    const activeCond = activeCondition || analysis.conditions[0]!;
    const curFl = activeCond.smoothedPoints[closestIdx]?.fluorescence;
    const curD = activeCond.derivativePoints[closestIdx]?.dFdT;

    setHoverData({
      temperature: temps[closestIdx]!,
      condName: activeCond.name,
      fl: curFl,
      dFdT: curD,
      xPx: scaleX(temps[closestIdx]!),
    });
  }

  // Selection Action Helpers
  function handleSelectAll() {
    set({ selectedTraceIds: allConditionsList.map(c => c.id) });
  }

  function handleDeselectAll() {
    set({ selectedTraceIds: [] });
  }

  function handleSoloTrace(id: string) {
    set({ selectedTraceIds: [id], selectedConditionId: id });
  }

  function handleInvertSelection() {
    const currentSet = new Set(effectiveSelectedIds);
    const inverted = allConditionsList.filter(c => !currentSet.has(c.id)).map(c => c.id);
    set({ selectedTraceIds: inverted });
  }

  function handleChannelFilter(ch: 'all' | 'ratio' | 'f330' | 'f350' | 'raw') {
    set({ channelFilter: ch });
    if (ch === 'all') {
      set({ selectedTraceIds: allConditionsList.map(c => c.id) });
    } else {
      const matching = allConditionsList.filter(c => c.channel === ch).map(c => c.id);
      set({ selectedTraceIds: matching });
    }
  }

  function handleToggleTrace(id: string) {
    const currentSet = new Set(effectiveSelectedIds);
    if (currentSet.has(id)) {
      currentSet.delete(id);
    } else {
      currentSet.add(id);
    }
    set({ selectedTraceIds: Array.from(currentSet) });
  }

  // Peak Curation Helpers (False Peak Removal)
  function handleRemovePeak(condId: string, p: { sign: string; temperature: number; label: string }) {
    const key1 = `${condId}:${p.sign}:${p.temperature.toFixed(1)}`;
    const key2 = `${condId}:${p.sign}${p.temperature.toFixed(1)}`;
    const key3 = `${condId}:${p.label}`;
    set({
      removedPeakKeys: Array.from(new Set([...s.removedPeakKeys, key1, key2, key3])),
    });
  }

  function handleRestorePeaksForCondition(condId: string) {
    const updated = s.removedPeakKeys.filter(k => !k.startsWith(`${condId}:`));
    set({ removedPeakKeys: updated });
  }

  function handleRestoreAllPeaks() {
    set({ removedPeakKeys: [] });
  }

  function handleResetView() {
    set({
      tempMinCrop: null,
      tempMaxCrop: null,
      yScaleMode: 'auto_visible',
    });
  }

  // Export Handlers
  function handleExportCsv() {
    if (!analysis || 'error' in analysis) return;
    const rows = [
      ['# Thermal Shift Assay (DSF / nanoDSF) Screening Results'],
      ['# Reference Condition', referenceCondition?.name ?? ''],
      ['# Reference Tm (°C)', analysis.referenceTm.toFixed(2)],
      ['# Method', s.tmMethod === 'derivative' ? '1st Derivative Peak Inflection' : 'Two-State Boltzmann Sigmoid'],
      [],
      [
        'Rank',
        'Condition',
        'Channel',
        'Capillary',
        'Tm Sign',
        'Tm (°C)',
        'Delta Tm (°C)',
        'Transition Peaks (+/-)',
        'Peak dF/dT',
        'Boltzmann R²',
        'Apparent ΔH_unf (kJ/mol)',
        'Effect Classification',
      ],
      ...analysis.rankedConditions.map((c, idx) => [
        idx + 1,
        c.name,
        c.channel ?? 'raw',
        c.capillary ?? '',
        c.tmSign,
        c.tm.toFixed(2),
        c.deltaTm > 0 ? `+${c.deltaTm.toFixed(2)}` : c.deltaTm.toFixed(2),
        c.peaks.map(p => `${p.label}:${p.sign}${p.temperature.toFixed(2)}°C(h=${p.height.toFixed(2)})`).join('; '),
        c.primaryPeak ? c.primaryPeak.height.toFixed(4) : '',
        c.boltzmannFit ? c.boltzmannFit.r2.toFixed(4) : '',
        c.boltzmannFit ? c.boltzmannFit.deltaHunf_kJ.toFixed(1) : '',
        formatEffectLabel(c.effect),
      ]),
    ];

    const csvContent = toCsv(rows);
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    downloadBlob(blob, `dsf_thermal_shift_analysis.csv`);
  }

  function handleExportMeltSvg() {
    if (meltSvgRef.current) {
      downloadSvg(meltSvgRef.current, `dsf_melt_curves.svg`);
    }
  }

  async function handleExportMeltPng() {
    if (meltSvgRef.current) {
      const blob = await svgToPngBlob(meltSvgRef.current, 2);
      downloadBlob(blob, `dsf_melt_curves.png`);
    }
  }

  function handleExportDerivSvg() {
    if (derivSvgRef.current) {
      downloadSvg(derivSvgRef.current, `dsf_derivative_curves.svg`);
    }
  }

  async function handleExportDerivPng() {
    if (derivSvgRef.current) {
      const blob = await svgToPngBlob(derivSvgRef.current, 2);
      downloadBlob(blob, `dsf_derivative_curves.png`);
    }
  }

  function formatEffectLabel(effect: DsfEffectClassification): string {
    switch (effect) {
      case 'strong_stabilizer':
        return 'Strong Stabilizer (ΔTm ≥ +4°C)';
      case 'moderate_stabilizer':
        return 'Moderate Stabilizer (ΔTm ≥ +2°C)';
      case 'neutral':
        return 'Neutral (-2°C < ΔTm < +2°C)';
      case 'destabilizer':
        return 'Destabilizer (ΔTm ≤ -2°C)';
    }
  }

  const copyText = !analysis || 'error' in analysis
    ? (analysis?.error || 'No analysis available')
    : [
        `Thermal Shift Assay (DSF / nanoDSF) Screen Report`,
        `Reference Condition: ${referenceCondition?.name} (Tm = ${analysis.referenceTm.toFixed(2)} °C)`,
        `Method: ${s.tmMethod === 'derivative' ? '1st Derivative Inflection' : 'Two-State Boltzmann Model'}`,
        `Selected Traces: ${analysis.conditions.length} of ${allConditionsList.length}`,
        analysis.summary.topHit
          ? `Top Stabilizing Hit: ${analysis.summary.topHit.name} (ΔTm = +${analysis.summary.topHit.deltaTm.toFixed(2)} °C, Tm = ${analysis.summary.topHit.tm.toFixed(2)} °C)`
          : `No stabilizing hits detected`,
        `Stabilizers (ΔTm ≥ +2°C): ${analysis.summary.stabilizersCount} | Destabilizers: ${analysis.summary.destabilizersCount}`,
        '',
        'Condition Ranking:',
        ...analysis.rankedConditions.map((c, i) =>
          `  ${i + 1}. ${c.name}: Tm = ${c.tm.toFixed(2)} °C (ΔTm = ${c.deltaTm > 0 ? `+${c.deltaTm.toFixed(2)}` : c.deltaTm.toFixed(2)} °C) [${c.effect}]${c.boltzmannFit ? ` R²=${c.boltzmannFit.r2.toFixed(3)} ΔH=${c.boltzmannFit.deltaHunf_kJ.toFixed(0)} kJ/mol` : ''}`,
        ),
        '',
        scienceText(SCIENCE),
      ].join('\n');

  // Filtered conditions for search in trace selection panel
  const filteredConditionsForDrawer = useMemo(() => {
    const query = s.searchQuery.trim().toLowerCase();
    if (!query) return allConditionsList;
    return allConditionsList.filter(
      c => c.name.toLowerCase().includes(query) || (c.capillary && c.capillary.toLowerCase().includes(query)),
    );
  }, [allConditionsList, s.searchQuery]);

  return (
    <ToolLayout
      icon="🔥"
      title="Thermal Shift Assay (DSF / nanoDSF)"
      blurb="Analyze protein thermal denaturation, determine melting temperatures (Tm) via Savitzky-Golay 1st derivative or two-state Boltzmann sigmoid fits, selectively render and process traces, and screen ligand stabilization (ΔTm)."
      wide={true}
      mobileResultSummary={
        analysis && !('error' in analysis) ? (
          <span>
            Ref Tm: <strong class="font-mono text-accent-700 dark:text-accent-300">{analysis.referenceTm.toFixed(1)}°C</strong> |{' '}
            Top Hit: <strong class="text-emerald-600 dark:text-emerald-400">
              {analysis.summary.topHit ? `+${analysis.summary.topHit.deltaTm.toFixed(1)}°C` : '—'}
            </strong>
          </span>
        ) : analysis && 'error' in analysis ? (
          <span class="text-rose-600 font-semibold">{analysis.error}</span>
        ) : null
      }
      inputs={
        <div class="space-y-4">
          {/* Preset Selector */}
          <div class="space-y-2 rounded-xl border border-slate-200 bg-white p-3.5 dark:border-slate-800 dark:bg-slate-900">
            <span class="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
              Benchmark Demo Datasets
            </span>
            <div class="grid grid-cols-1 gap-1.5">
              <button
                type="button"
                onClick={() => handleLoadPreset('lysozyme')}
                class={`w-full text-left p-2.5 rounded-lg text-xs font-medium transition ${s.presetKey === 'lysozyme' ? 'bg-accent-50 text-accent-700 dark:bg-accent-950/40 dark:text-accent-300 border border-accent-300 dark:border-accent-700 font-semibold' : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'}`}
              >
                <div class="font-semibold">Lysozyme + NAG Screen (SYPRO Orange)</div>
                <div class="text-[11px] text-slate-500 mt-0.5">Literature benchmark: Niesen et al. (2007) Nat Protoc</div>
              </button>
              <button
                type="button"
                onClick={() => handleLoadPreset('nanodsf')}
                class={`w-full text-left p-2.5 rounded-lg text-xs font-medium transition ${s.presetKey === 'nanodsf' ? 'bg-accent-50 text-accent-700 dark:bg-accent-950/40 dark:text-accent-300 border border-accent-300 dark:border-accent-700 font-semibold' : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'}`}
              >
                <div class="font-semibold">mAb Fab Screening (nanoDSF Ratio F350/F330)</div>
                <div class="text-[11px] text-slate-500 mt-0.5">Label-free intrinsic tryptophan ratio screening</div>
              </button>
              <button
                type="button"
                onClick={() => handleLoadPreset('prometheus')}
                class={`w-full text-left p-2.5 rounded-lg text-xs font-medium transition ${s.presetKey === 'prometheus' ? 'bg-accent-50 text-accent-700 dark:bg-accent-950/40 dark:text-accent-300 border border-accent-300 dark:border-accent-700 font-semibold' : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'}`}
              >
                <div class="font-semibold flex items-center justify-between">
                  <span>Prometheus 24-Capillary High-Density Screen</span>
                  <span class="text-[10px] px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300 font-bold">
                    Prometheus NT.48
                  </span>
                </div>
                <div class="text-[11px] text-slate-500 mt-0.5">Multi-channel: Ratio (350/330nm), 330nm, 350nm channels</div>
              </button>
            </div>
          </div>

          {/* Trace Selection & Management Panel */}
          <div class="space-y-3 rounded-xl border border-slate-200 bg-white p-3.5 dark:border-slate-800 dark:bg-slate-900 text-xs">
            <div class="flex items-center justify-between">
              <span class="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                Select Traces to Render & Fit
              </span>
              <span class="text-[11px] font-mono px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                {effectiveSelectedIds.length} / {allConditionsList.length} active
              </span>
            </div>

            {/* Channel Filters (if multiple channels present, e.g. Prometheus) */}
            {availableChannels.length > 1 && (
              <div class="space-y-1">
                <span class="text-[11px] font-semibold text-slate-500">Channel Filter:</span>
                <div class="flex flex-wrap gap-1">
                  <button
                    type="button"
                    onClick={() => handleChannelFilter('all')}
                    class={`px-2 py-0.5 rounded text-[11px] font-medium border transition ${s.channelFilter === 'all' ? 'bg-slate-800 text-white dark:bg-slate-200 dark:text-slate-900' : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700'}`}
                  >
                    All Channels
                  </button>
                  {availableChannels.includes('ratio') && (
                    <button
                      type="button"
                      onClick={() => handleChannelFilter('ratio')}
                      class={`px-2 py-0.5 rounded text-[11px] font-medium border transition ${s.channelFilter === 'ratio' ? 'bg-accent-600 text-white' : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700'}`}
                    >
                      Ratio (350/330)
                    </button>
                  )}
                  {availableChannels.includes('f330') && (
                    <button
                      type="button"
                      onClick={() => handleChannelFilter('f330')}
                      class={`px-2 py-0.5 rounded text-[11px] font-medium border transition ${s.channelFilter === 'f330' ? 'bg-accent-600 text-white' : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700'}`}
                    >
                      330 nm
                    </button>
                  )}
                  {availableChannels.includes('f350') && (
                    <button
                      type="button"
                      onClick={() => handleChannelFilter('f350')}
                      class={`px-2 py-0.5 rounded text-[11px] font-medium border transition ${s.channelFilter === 'f350' ? 'bg-accent-600 text-white' : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700'}`}
                    >
                      350 nm
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Quick Batch Actions */}
            <div class="flex flex-wrap gap-1.5 pt-0.5">
              <button
                type="button"
                onClick={handleSelectAll}
                class="px-2 py-1 text-[11px] font-semibold rounded border border-slate-300 dark:border-slate-700 bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition"
              >
                Select All
              </button>
              <button
                type="button"
                onClick={handleDeselectAll}
                class="px-2 py-1 text-[11px] font-semibold rounded border border-slate-300 dark:border-slate-700 bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition"
              >
                Deselect All
              </button>
              <button
                type="button"
                onClick={handleInvertSelection}
                class="px-2 py-1 text-[11px] font-semibold rounded border border-slate-300 dark:border-slate-700 bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition"
              >
                Invert
              </button>
            </div>

            {/* Search / Filter Input */}
            <input
              type="text"
              placeholder="Search traces (e.g. Capillary 1, NAG, Hit)..."
              value={s.searchQuery}
              onInput={(e) => set({ searchQuery: (e.target as HTMLInputElement).value })}
              class="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 placeholder-slate-400"
            />

            {/* Scrollable Trace Checklist */}
            <div class="max-h-56 overflow-y-auto space-y-1 pr-1 divide-y divide-slate-100 dark:divide-slate-800/60">
              {filteredConditionsForDrawer.map((cond) => {
                const isChecked = effectiveSelectedIds.includes(cond.id);
                const isFocused = s.selectedConditionId === cond.id;
                const color = PALETTE[cond.idx % PALETTE.length]!;

                return (
                  <div
                    key={cond.id}
                    class={`flex items-center justify-between gap-2 p-1.5 rounded-lg transition ${isFocused ? 'bg-accent-50 dark:bg-accent-950/40' : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'}`}
                  >
                    <label class="flex items-center gap-2 min-w-0 flex-1 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => handleToggleTrace(cond.id)}
                        class="rounded text-accent-600 accent-accent-600"
                      />
                      <span class="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
                      <span class="truncate text-xs font-medium text-slate-800 dark:text-slate-200">
                        {cond.name}
                      </span>
                    </label>

                    <div class="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        title="Solo this trace (isolate only this condition)"
                        onClick={() => handleSoloTrace(cond.id)}
                        class="px-1.5 py-0.5 text-[10px] rounded font-semibold border border-slate-200 dark:border-slate-700 hover:bg-amber-100 hover:text-amber-900 dark:hover:bg-amber-950 dark:hover:text-amber-300 text-slate-500 transition"
                      >
                        Solo
                      </button>
                      <button
                        type="button"
                        title="Inspect condition detail"
                        onClick={() => set({ selectedConditionId: cond.id })}
                        class={`px-1.5 py-0.5 text-[10px] rounded font-mono transition ${isFocused ? 'bg-accent-600 text-white font-bold' : 'text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}
                      >
                        {isFocused ? 'FOCUS' : 'Inspect'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Analysis & Fitting Parameters */}
          <div class="space-y-3 rounded-xl border border-slate-200 bg-white p-3.5 dark:border-slate-800 dark:bg-slate-900 text-xs">
            <span class="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
              Tm Analysis & Processing Parameters
            </span>

            {/* Reference Condition Dropdown */}
            <div>
              <label for="ref-cond-select" class="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                Reference / Control Condition (for ΔTm)
              </label>
              <select
                id="ref-cond-select"
                value={s.referenceConditionId || (analysis && !('error' in analysis) ? analysis.referenceConditionId : '')}
                onChange={(e) => set({ referenceConditionId: (e.target as HTMLSelectElement).value })}
                class="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-950"
              >
                {analysis && !('error' in analysis) ? (
                  analysis.conditions.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.name} (Tm: {c.tm.toFixed(1)} °C)
                    </option>
                  ))
                ) : (
                  <option value="">Auto-detect control</option>
                )}
              </select>
            </div>

            {/* Primary Tm Method */}
            <div>
              <label for="tm-method-select" class="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                Melting Temperature (Tm) Method
              </label>
              <select
                id="tm-method-select"
                value={s.tmMethod}
                onChange={(e) => set({ tmMethod: (e.target as HTMLSelectElement).value as 'derivative' | 'boltzmann' })}
                class="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-950"
              >
                <option value="derivative">1st Derivative Peak Inflection (dF/dT max)</option>
                <option value="boltzmann">Two-State Boltzmann Sigmoid Midpoint (Tm)</option>
              </select>
            </div>

            {/* Transition Direction */}
            <div>
              <label for="dir-select" class="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                Transition Direction & Sign Detection
              </label>
              <select
                id="dir-select"
                value={s.transitionDirection}
                onChange={(e) => set({ transitionDirection: (e.target as HTMLSelectElement).value as 'both' | 'auto' | 'positive' | 'negative' })}
                class="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-950"
              >
                <option value="both">Both Signs (+ Melting Peaks & − Troughs)</option>
                <option value="auto">Auto-Detect Dominant Direction</option>
                <option value="positive">Positive Only (+ Upward Melt / SYPRO Orange)</option>
                <option value="negative">Negative Only (− Downward Transition / Blue Shift)</option>
              </select>
            </div>

            {/* Peak Detection Sensitivity */}
            <div>
              <label for="prominence-select" class="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                Peak Detection Sensitivity
              </label>
              <select
                id="prominence-select"
                value={s.peakProminenceRatio.toString()}
                onChange={(e) => set({ peakProminenceRatio: parseFloat((e.target as HTMLSelectElement).value) })}
                class="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-950"
              >
                <option value="0.30">Very Strict (0.30 prominence · dominant primary transitions only)</option>
                <option value="0.20">Strict Filtering (0.20 prominence · suppresses minor wiggles)</option>
                <option value="0.15">Standard Sensitivity (0.15 prominence · recommended default)</option>
                <option value="0.08">High Sensitivity (0.08 prominence · finds small shoulders)</option>
              </select>
            </div>

            {/* Max Transition Peaks to Detect */}
            <div>
              <label for="max-peaks-select" class="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                Max Peaks to Detect per Trace
              </label>
              <select
                id="max-peaks-select"
                value={s.maxPeaks.toString()}
                onChange={(e) => set({ maxPeaks: parseInt((e.target as HTMLSelectElement).value, 10) })}
                class="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-950"
              >
                <option value="1">1 Peak (Single primary transition only · cleanest)</option>
                <option value="2">Up to 2 Peaks (e.g. Fab + Fc antibody domains)</option>
                <option value="3">Up to 3 Peaks (Multi-domain proteins)</option>
                <option value="4">Up to 4 Peaks (Recommended default)</option>
                <option value="8">Up to 8 Peaks (High complexity)</option>
              </select>
            </div>

            {/* Removed False Peaks Status & Reset */}
            {s.removedPeakKeys.length > 0 && (
              <div class="p-2 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 flex items-center justify-between text-[11px]">
                <span class="text-amber-800 dark:text-amber-300 font-medium">
                  {s.removedPeakKeys.length} false peak{s.removedPeakKeys.length > 1 ? 's' : ''} removed
                </span>
                <button
                  type="button"
                  onClick={handleRestoreAllPeaks}
                  class="font-bold text-accent-700 dark:text-accent-300 hover:underline"
                >
                  Restore All
                </button>
              </div>
            )}

            {/* Savitzky-Golay Smoothing Window */}
            <div>
              <label for="window-select" class="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                Savitzky-Golay Smoothing Window
              </label>
              <select
                id="window-select"
                value={s.windowSize}
                onChange={(e) => set({ windowSize: parseInt((e.target as HTMLSelectElement).value, 10) })}
                class="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-950"
              >
                <option value="5">5 points (Minimal smoothing, sharpest peaks)</option>
                <option value="7">7 points (Recommended default for 0.5 - 1.0 °C steps)</option>
                <option value="9">9 points (Moderate noise suppression)</option>
                <option value="11">11 points (High noise suppression)</option>
                <option value="15">15 points (Very noisy instrumental data)</option>
              </select>
            </div>

            {/* Temperature Cropping Window */}
            <div>
              <div class="flex items-center justify-between mb-1">
                <span class="block text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                  Temperature Crop Window (°C)
                </span>
                {(s.tempMinCrop != null || s.tempMaxCrop != null) && (
                  <button
                    type="button"
                    onClick={() => set({ tempMinCrop: null, tempMaxCrop: null })}
                    class="text-[10px] text-rose-600 font-semibold hover:underline"
                  >
                    Reset Crop
                  </button>
                )}
              </div>
              <div class="grid grid-cols-2 gap-2">
                <div>
                  <input
                    type="number"
                    step="1"
                    placeholder="Min T (e.g. 30)"
                    value={s.tempMinCrop ?? ''}
                    onChange={(e) => {
                      const v = (e.target as HTMLInputElement).value;
                      set({ tempMinCrop: v ? parseFloat(v) : null });
                    }}
                    class="w-full px-2 py-1 text-xs rounded border border-slate-300 dark:border-slate-700 dark:bg-slate-950"
                  />
                </div>
                <div>
                  <input
                    type="number"
                    step="1"
                    placeholder="Max T (e.g. 85)"
                    value={s.tempMaxCrop ?? ''}
                    onChange={(e) => {
                      const v = (e.target as HTMLInputElement).value;
                      set({ tempMaxCrop: v ? parseFloat(v) : null });
                    }}
                    class="w-full px-2 py-1 text-xs rounded border border-slate-300 dark:border-slate-700 dark:bg-slate-950"
                  />
                </div>
              </div>
            </div>

            {/* Normalization & Overlay Toggles */}
            <div class="space-y-1.5 pt-1">
              <label class="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={s.normalizeFluorescence}
                  onChange={(e) => {
                    const checked = (e.target as HTMLInputElement).checked;
                    set({ normalizeFluorescence: checked, normMode: checked ? 'normalized' : 'raw' });
                  }}
                  class="rounded text-accent-600 accent-accent-600"
                />
                <span>Normalize Fluorescence (0 - 100%)</span>
              </label>

              <label class="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={s.showBoltzmannOverlay}
                  onChange={(e) => set({ showBoltzmannOverlay: (e.target as HTMLInputElement).checked })}
                  class="rounded text-accent-600 accent-accent-600"
                />
                <span>Show Boltzmann Sigmoid Fit Curves</span>
              </label>

              <label class="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={s.showResiduals}
                  onChange={(e) => set({ showResiduals: (e.target as HTMLInputElement).checked })}
                  class="rounded text-accent-600 accent-accent-600"
                />
                <span>Show Fit Residuals Plot (Obs - Fit)</span>
              </label>
            </div>
          </div>

          {/* Raw CSV / Tabular Data Input */}
          <div class="space-y-2 rounded-xl border border-slate-200 bg-white p-3.5 dark:border-slate-800 dark:bg-slate-900">
            <div class="flex items-center justify-between">
              <label for="dsf-data-input" class="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                Raw Thermal Cycler Data
              </label>
              <span class="text-[11px] text-slate-400 font-mono">
                {parsedData && !('error' in parsedData)
                  ? `${parsedData.temperatures.length} pts · ${parsedData.conditions.length} wells (${parsedData.format ?? 'standard'})`
                  : 'Empty'}
              </span>
            </div>
            <textarea
              id="dsf-data-input"
              rows={8}
              value={rawText}
              onInput={(e) => {
                setRawText((e.target as HTMLTextAreaElement).value);
                set({
                  presetKey: 'custom',
                  selectedConditionId: '',
                  referenceConditionId: '',
                  selectedTraceIds: null,
                  tempMinCrop: null,
                  tempMaxCrop: null,
                  removedPeakKeys: [],
                });
              }}
              placeholder={`Temperature,Control,Ligand_1,Ligand_2\n25.0,120,115,125\n26.0,122,117,128...`}
              class="w-full p-2.5 font-mono text-[11px] rounded-lg border border-slate-300 dark:border-slate-700 dark:bg-slate-950 leading-relaxed resize-y"
            />
            <div class="flex gap-2">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                class="flex-1 py-1.5 text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
              >
                Upload CSV / TSV
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.tsv,.txt"
                class="hidden"
                onChange={(e) => {
                  const file = (e.target as HTMLInputElement).files?.[0];
                  if (file) handleFileUpload(file);
                }}
              />
              <button
                type="button"
                onClick={() => setRawText('')}
                class="px-3 py-1.5 text-xs font-medium rounded-lg text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 border border-rose-200 dark:border-rose-900 transition"
              >
                Clear
              </button>
            </div>
            <p class="text-[11px] text-slate-500">
              💡 Supports Bio-Rad CFX, QuantStudio, Roche LightCycler, and NanoTemper Prometheus nanoDSF exported CSV/TSV matrices.
            </p>
          </div>
        </div>
      }
      results={
        <div class="space-y-4">
          {!analysis ? (
            <p class="text-xs text-slate-500 py-8 text-center">Please paste or upload thermal shift assay data to begin analysis.</p>
          ) : 'error' in analysis ? (
            <div role="alert" class="rounded-xl border border-red-200 bg-red-50 p-4 text-xs text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
              <strong>Analysis error:</strong> {analysis.error}
            </div>
          ) : analysis.conditions.length === 0 ? (
            <div class="rounded-2xl border border-slate-200 bg-white p-8 text-center dark:border-slate-800 dark:bg-slate-900 space-y-3">
              <div class="text-3xl">📉</div>
              <h3 class="text-sm font-bold text-slate-900 dark:text-slate-100">No Traces Selected</h3>
              <p class="text-xs text-slate-500 max-w-sm mx-auto">
                All traces are currently deselected. Check individual traces in the left panel, click "Solo" on any trace, or click below to restore all traces.
              </p>
              <button
                type="button"
                onClick={handleSelectAll}
                class="px-4 py-2 text-xs font-semibold rounded-lg bg-accent-600 text-white hover:bg-accent-700 transition"
              >
                Select All Traces ({allConditionsList.length})
              </button>
            </div>
          ) : (
            <>
              {/* Executive Screening Summary Cards */}
              <div class="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 space-y-3">
                <div class="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
                  <div>
                    <h2 class="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                      <span>Thermal Shift Assay Results</span>
                      <span class="text-xs px-2 py-0.5 rounded-full bg-accent-100 text-accent-700 dark:bg-accent-950 dark:text-accent-300 font-mono font-medium">
                        {analysis.conditions.length} of {allConditionsList.length} traces active
                      </span>
                    </h2>
                    <p class="text-xs text-slate-500 mt-0.5">
                      Reference: <strong class="text-slate-700 dark:text-slate-300">{referenceCondition?.name}</strong> (Tm = {analysis.referenceTm.toFixed(2)} °C) · Method: {s.tmMethod === 'derivative' ? 'Savitzky-Golay 1st Derivative' : 'Two-State Boltzmann Sigmoid'}
                    </p>
                  </div>
                  <div class="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleResetView}
                      class="px-2.5 py-1.5 text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                      title="Reset plot scaling and temperature bounds"
                    >
                      Autoscale View
                    </button>
                    <button
                      type="button"
                      onClick={handleExportCsv}
                      class="px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                    >
                      Export CSV
                    </button>
                  </div>
                </div>

                {/* Stat Badges */}
                <div class="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
                  <div class="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
                    <span class="text-slate-500 block text-[11px]">Reference Tm</span>
                    <span data-testid="reference-tm" class="font-mono text-lg font-bold text-slate-900 dark:text-slate-100">
                      {analysis.referenceTm.toFixed(2)} °C
                    </span>
                    <span class="text-[10px] text-slate-400 block mt-0.5 truncate">{referenceCondition?.name}</span>
                  </div>

                  <div class="p-2.5 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/40">
                    <span class="text-emerald-800 dark:text-emerald-300 block text-[11px]">Top Stabilizer Hit</span>
                    <span data-testid="top-hit-shift" class="font-mono text-lg font-bold text-emerald-600 dark:text-emerald-400">
                      {analysis.summary.topHit ? `+${analysis.summary.topHit.deltaTm.toFixed(2)} °C` : '—'}
                    </span>
                    <span class="text-[10px] text-emerald-700 dark:text-emerald-400 block mt-0.5 truncate">
                      {analysis.summary.topHit?.name || 'No stabilizer'}
                    </span>
                  </div>

                  <div class="p-2.5 rounded-xl bg-blue-50/70 dark:bg-blue-950/20 border border-blue-100 dark:border-blue-900/40">
                    <span class="text-blue-800 dark:text-blue-300 block text-[11px]">Stabilizers (ΔTm ≥ +2°C)</span>
                    <span class="font-mono text-lg font-bold text-blue-600 dark:text-blue-400">
                      {analysis.summary.stabilizersCount}
                    </span>
                    <span class="text-[10px] text-blue-700 dark:text-blue-400 block mt-0.5">
                      of {analysis.conditions.length - 1} screened
                    </span>
                  </div>

                  <div class="p-2.5 rounded-xl bg-rose-50/70 dark:bg-rose-950/20 border border-rose-100 dark:border-rose-900/40">
                    <span class="text-rose-800 dark:text-rose-300 block text-[11px]">Destabilizers (ΔTm ≤ -2°C)</span>
                    <span class="font-mono text-lg font-bold text-rose-600 dark:text-rose-400">
                      {analysis.summary.destabilizersCount}
                    </span>
                    <span class="text-[10px] text-rose-700 dark:text-rose-400 block mt-0.5">
                      Max: {analysis.summary.maxDestabilization < 0 ? `${analysis.summary.maxDestabilization.toFixed(1)} °C` : '0.0 °C'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Chart 1: Fluorescence Thermal Melt Curves F(T) */}
              <div class="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 space-y-2">
                <div class="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 class="font-bold text-sm text-slate-900 dark:text-slate-100">
                      Thermal Denaturation Melt Curves F(T)
                    </h3>
                    <p class="text-xs text-slate-500 mt-0.5">
                      {s.normalizeFluorescence ? 'Normalized emission intensity (0 - 100%)' : 'Emission intensity / ratiometric signal'} vs temperature (°C)
                    </p>
                  </div>
                  <div class="flex items-center gap-2">
                    {hoverData && (
                      <span class="text-xs font-mono bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded text-slate-700 dark:text-slate-300">
                        {hoverData.temperature.toFixed(1)} °C: {hoverData.fl != null ? (hoverData.fl < 10 ? hoverData.fl.toFixed(3) : hoverData.fl.toFixed(1)) : '—'}
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={handleExportMeltSvg}
                      class="px-2.5 py-1 text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                    >
                      SVG
                    </button>
                    <button
                      type="button"
                      onClick={handleExportMeltPng}
                      class="px-2.5 py-1 text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                    >
                      PNG
                    </button>
                  </div>
                </div>

                <div class="overflow-x-auto flex justify-center">
                  <svg
                    ref={meltSvgRef}
                    viewBox={`0 0 ${plotWidth} ${meltHeight}`}
                    class="w-full max-w-3xl h-auto select-none"
                    role="img"
                    aria-label="Thermal denaturation fluorescence curves"
                    onMouseMove={(e) => handleSvgMouseMove(e, meltSvgRef.current)}
                    onMouseLeave={() => setHoverData(null)}
                  >
                    {/* Background */}
                    <rect x={padLeft} y={padTop} width={innerWidth} height={innerMeltHeight} fill="#f8fafc" rx="4" />

                    {/* Grid lines (Y axis) from scientific nice ticks */}
                    {bounds.yFlTicks.ticks.map((val) => {
                      const y = scaleMeltY(val);
                      if (y < padTop - 2 || y > meltHeight - padBottom + 2) return null;
                      return (
                        <g key={val}>
                          <line x1={padLeft} y1={y} x2={plotWidth - padRight} y2={y} stroke="#e2e8f0" stroke-width="1" />
                          <text
                            x={padLeft - 8}
                            y={y}
                            font-size="10"
                            font-family="monospace"
                            fill="#94a3b8"
                            text-anchor="end"
                            dominant-baseline="central"
                          >
                            {val < 10 ? val.toFixed(bounds.yFlTicks.decimals) : val.toFixed(0)}
                          </text>
                        </g>
                      );
                    })}

                    {/* Grid lines (X axis) from scientific nice ticks */}
                    {bounds.xTicks.ticks.map((t) => {
                      const x = scaleX(t);
                      if (x < padLeft - 2 || x > plotWidth - padRight + 2) return null;
                      return (
                        <g key={t}>
                          <line x1={x} y1={padTop} x2={x} y2={meltHeight - padBottom} stroke="#e2e8f0" stroke-width="1" />
                          <text
                            x={x}
                            y={meltHeight - padBottom + 14}
                            font-size="10"
                            font-family="monospace"
                            fill="#94a3b8"
                            text-anchor="middle"
                          >
                            {t.toFixed(0)}°C
                          </text>
                        </g>
                      );
                    })}

                    {/* Vertical reference line at Reference Condition Tm */}
                    {referenceCondition && referenceCondition.tm >= bounds.minT && referenceCondition.tm <= bounds.maxT && (
                      <g>
                        <line
                          x1={scaleX(referenceCondition.tm)}
                          y1={padTop}
                          x2={scaleX(referenceCondition.tm)}
                          y2={meltHeight - padBottom}
                          stroke="#94a3b8"
                          stroke-width="1.5"
                          stroke-dasharray="4 3"
                        />
                        <text
                          x={scaleX(referenceCondition.tm)}
                          y={padTop - 6}
                          font-size="9"
                          font-family="monospace"
                          font-weight="bold"
                          fill="#64748b"
                          text-anchor="middle"
                        >
                          Ref: {referenceCondition.tm.toFixed(1)}°C
                        </text>
                      </g>
                    )}

                    {/* Curves for all active conditions */}
                    {analysis.conditions.map((cond, idx) => {
                      const color = PALETTE[idx % PALETTE.length]!;
                      const isInspected = activeCondition?.id === cond.id;
                      const strokeOpacity = isInspected ? 1.0 : 0.65;
                      const strokeWidth = isInspected ? 3.0 : 1.8;

                      // Generate path
                      const pts: string[] = [];
                      for (let i = 0; i < cond.smoothedPoints.length; i++) {
                        const pt = cond.smoothedPoints[i]!;
                        const yVal = getDisplayedFl(pt.fluorescence, cond.smoothedPoints);
                        const px = scaleX(pt.temperature);
                        const py = scaleMeltY(yVal);
                        pts.push(`${i === 0 ? 'M' : 'L'} ${px.toFixed(1)} ${py.toFixed(1)}`);
                      }

                      return (
                        <g key={cond.id}>
                          <path
                            d={pts.join(' ')}
                            fill="none"
                            stroke={color}
                            stroke-width={strokeWidth}
                            stroke-opacity={strokeOpacity}
                            stroke-linecap="round"
                          />

                          {/* Boltzmann Sigmoid Overlay if selected and enabled */}
                          {s.showBoltzmannOverlay && cond.boltzmannFit && isInspected && (
                            <path
                              d={(() => {
                                const bPts: string[] = [];
                                for (let i = 0; i < cond.rawPoints.length; i++) {
                                  const t = cond.rawPoints[i]!.temperature;
                                  const bY = cond.boltzmannFit!.predict(t);
                                  const yNorm = getDisplayedFl(bY, cond.rawPoints);
                                  bPts.push(`${i === 0 ? 'M' : 'L'} ${scaleX(t).toFixed(1)} ${scaleMeltY(yNorm).toFixed(1)}`);
                                }
                                return bPts.join(' ');
                              })()}
                              fill="none"
                              stroke="#0f172a"
                              stroke-width="1.8"
                              stroke-dasharray="3 3"
                            />
                          )}
                        </g>
                      );
                    })}

                    {/* Hover cursor line */}
                    {hoverData && (
                      <line
                        x1={hoverData.xPx}
                        y1={padTop}
                        x2={hoverData.xPx}
                        y2={meltHeight - padBottom}
                        stroke="#0284c7"
                        stroke-width="1.5"
                        stroke-dasharray="3 2"
                      />
                    )}

                    {/* Axes borders */}
                    <line x1={padLeft} y1={meltHeight - padBottom} x2={plotWidth - padRight} y2={meltHeight - padBottom} stroke="#64748b" stroke-width="1.5" />
                    <line x1={padLeft} y1={padTop} x2={padLeft} y2={meltHeight - padBottom} stroke="#64748b" stroke-width="1.5" />

                    {/* Axis Labels */}
                    <text x={padLeft + innerWidth / 2} y={meltHeight - 10} font-size="11" font-family="sans-serif" font-weight="600" fill="#475569" text-anchor="middle">
                      Temperature (°C)
                    </text>
                    <text
                      transform={`rotate(-90 ${15} ${padTop + innerMeltHeight / 2})`}
                      x={15}
                      y={padTop + innerMeltHeight / 2}
                      font-size="11"
                      font-family="sans-serif"
                      font-weight="600"
                      fill="#475569"
                      text-anchor="middle"
                    >
                      {s.normalizeFluorescence ? 'Normalized Fluorescence (%)' : 'Fluorescence / Ratio (AU)'}
                    </text>
                  </svg>
                </div>
              </div>

              {/* Chart 2: First Derivative dF/dT (Peak Tm Inflection) */}
              <div class="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 space-y-2">
                <div class="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 class="font-bold text-sm text-slate-900 dark:text-slate-100">
                      Numerical First Derivative dF/dT
                    </h3>
                    <p class="text-xs text-slate-500 mt-0.5">
                      Savitzky-Golay smoothed dF/dT (or dRatio/dT); extrema identify transition midpoints (Tm)
                    </p>
                  </div>
                  <div class="flex items-center gap-2">
                    {hoverData && (
                      <span class="text-xs font-mono bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded text-slate-700 dark:text-slate-300">
                        {hoverData.temperature.toFixed(1)} °C: dF/dT = {hoverData.dFdT?.toFixed(3)}
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={handleExportDerivSvg}
                      class="px-2.5 py-1 text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                    >
                      SVG
                    </button>
                    <button
                      type="button"
                      onClick={handleExportDerivPng}
                      class="px-2.5 py-1 text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                    >
                      PNG
                    </button>
                  </div>
                </div>

                <div class="overflow-x-auto flex justify-center">
                  <svg
                    ref={derivSvgRef}
                    viewBox={`0 0 ${plotWidth} ${derivHeight}`}
                    class="w-full max-w-3xl h-auto select-none"
                    role="img"
                    aria-label="Numerical first derivative curves dF/dT"
                    onMouseMove={(e) => handleSvgMouseMove(e, derivSvgRef.current)}
                    onMouseLeave={() => setHoverData(null)}
                  >
                    {/* Background */}
                    <rect x={padLeft} y={padTop} width={innerWidth} height={innerDerivHeight} fill="#f8fafc" rx="4" />

                    {/* Zero-reference line if spans across 0 */}
                    {bounds.minD < 0 && bounds.maxD > 0 && (
                      <line
                        x1={padLeft}
                        y1={scaleDerivY(0)}
                        x2={plotWidth - padRight}
                        y2={scaleDerivY(0)}
                        stroke="#cbd5e1"
                        stroke-width="1.5"
                        stroke-dasharray="4 4"
                      />
                    )}

                    {/* Grid lines (Y axis) */}
                    {bounds.yDTicks.ticks.map((val) => {
                      const y = scaleDerivY(val);
                      if (y < padTop - 2 || y > derivHeight - padBottom + 2) return null;
                      return (
                        <g key={val}>
                          <line x1={padLeft} y1={y} x2={plotWidth - padRight} y2={y} stroke="#e2e8f0" stroke-width="1" />
                          <text
                            x={padLeft - 8}
                            y={y}
                            font-size="10"
                            font-family="monospace"
                            fill="#94a3b8"
                            text-anchor="end"
                            dominant-baseline="central"
                          >
                            {val < 10 && val > -10 ? val.toFixed(bounds.yDTicks.decimals) : val.toFixed(0)}
                          </text>
                        </g>
                      );
                    })}

                    {/* Grid lines (X axis) */}
                    {bounds.xTicks.ticks.map((t) => {
                      const x = scaleX(t);
                      if (x < padLeft - 2 || x > plotWidth - padRight + 2) return null;
                      return (
                        <g key={t}>
                          <line x1={x} y1={padTop} x2={x} y2={derivHeight - padBottom} stroke="#e2e8f0" stroke-width="1" />
                          <text
                            x={x}
                            y={derivHeight - padBottom + 14}
                            font-size="10"
                            font-family="monospace"
                            fill="#94a3b8"
                            text-anchor="middle"
                          >
                            {t.toFixed(0)}°C
                          </text>
                        </g>
                      );
                    })}

                    {/* Derivative Curves */}
                    {analysis.conditions.map((cond, idx) => {
                      const color = PALETTE[idx % PALETTE.length]!;
                      const isInspected = activeCondition?.id === cond.id;
                      const strokeOpacity = isInspected ? 1.0 : 0.65;
                      const strokeWidth = isInspected ? 2.8 : 1.6;

                      const pts: string[] = [];
                      for (let i = 0; i < cond.derivativePoints.length; i++) {
                        const pt = cond.derivativePoints[i]!;
                        const px = scaleX(pt.temperature);
                        const py = scaleDerivY(pt.dFdT);
                        pts.push(`${i === 0 ? 'M' : 'L'} ${px.toFixed(1)} ${py.toFixed(1)}`);
                      }

                      return (
                        <g key={cond.id}>
                          <path
                            d={pts.join(' ')}
                            fill="none"
                            stroke={color}
                            stroke-width={strokeWidth}
                            stroke-opacity={strokeOpacity}
                            stroke-linecap="round"
                          />

                          {/* Detected Peak & Trough Markers for Inspected Condition */}
                          {isInspected && cond.peaks.map((p, pIdx) => {
                            const cx = scaleX(p.temperature);
                            const cy = scaleDerivY(p.height);
                            if (cx < padLeft || cx > plotWidth - padRight) return null;
                            const isPos = p.sign === '+';
                            const textY = isPos ? Math.max(padTop + 10, cy - 9) : Math.min(derivHeight - padBottom - 6, cy + 16);

                            return (
                              <g key={pIdx} data-testid={`peak-marker-${p.label}`}>
                                {isPos ? (
                                  <polygon
                                    points={`${cx},${cy - 7} ${cx - 5.5},${cy + 3.5} ${cx + 5.5},${cy + 3.5}`}
                                    fill={color}
                                    stroke="#ffffff"
                                    stroke-width={p.isPrimary ? '2' : '1.5'}
                                  />
                                ) : (
                                  <polygon
                                    points={`${cx},${cy + 7} ${cx - 5.5},${cy - 3.5} ${cx + 5.5},${cy - 3.5}`}
                                    fill={color}
                                    stroke="#ffffff"
                                    stroke-width={p.isPrimary ? '2' : '1.5'}
                                  />
                                )}
                                <circle
                                  cx={cx}
                                  cy={cy}
                                  r={p.isPrimary ? 2.5 : 2}
                                  fill="#ffffff"
                                />
                                <text
                                  x={cx}
                                  y={textY}
                                  font-size={p.isPrimary ? '10' : '9'}
                                  font-family="monospace"
                                  font-weight={p.isPrimary ? 'bold' : 'normal'}
                                  fill={color}
                                  text-anchor="middle"
                                >
                                  {p.label}: {p.temperature.toFixed(1)}°C
                                </text>
                              </g>
                            );
                          })}
                        </g>
                      );
                    })}

                    {/* Hover cursor line */}
                    {hoverData && (
                      <line
                        x1={hoverData.xPx}
                        y1={padTop}
                        x2={hoverData.xPx}
                        y2={derivHeight - padBottom}
                        stroke="#0284c7"
                        stroke-width="1.5"
                        stroke-dasharray="3 2"
                      />
                    )}

                    {/* Axes borders */}
                    <line x1={padLeft} y1={derivHeight - padBottom} x2={plotWidth - padRight} y2={derivHeight - padBottom} stroke="#64748b" stroke-width="1.5" />
                    <line x1={padLeft} y1={padTop} x2={padLeft} y2={derivHeight - padBottom} stroke="#64748b" stroke-width="1.5" />

                    {/* Axis Labels */}
                    <text x={padLeft + innerWidth / 2} y={derivHeight - 10} font-size="11" font-family="sans-serif" font-weight="600" fill="#475569" text-anchor="middle">
                      Temperature (°C)
                    </text>
                    <text
                      transform={`rotate(-90 ${15} ${padTop + innerDerivHeight / 2})`}
                      x={15}
                      y={padTop + innerDerivHeight / 2}
                      font-size="11"
                      font-family="sans-serif"
                      font-weight="600"
                      fill="#475569"
                      text-anchor="middle"
                    >
                      dF / dT
                    </text>
                  </svg>
                </div>
              </div>

              {/* Chart 3: Fit Residuals Plot (Observed - Fitted) */}
              {s.showResiduals && activeCondition?.boltzmannFit && (
                <div class="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 space-y-2">
                  <div class="flex items-center justify-between">
                    <div>
                      <h3 class="font-bold text-sm text-slate-900 dark:text-slate-100">
                        Boltzmann Sigmoid Fit Residuals ({activeCondition.name})
                      </h3>
                      <p class="text-xs text-slate-500 mt-0.5">
                        Residual = Observed - Fitted (R² = {activeCondition.boltzmannFit.r2.toFixed(4)}, RMSE = {activeCondition.boltzmannFit.rmse.toFixed(2)})
                      </p>
                    </div>
                  </div>

                  <div class="overflow-x-auto flex justify-center">
                    <svg
                      ref={residSvgRef}
                      viewBox={`0 0 ${plotWidth} ${residHeight}`}
                      class="w-full max-w-3xl h-auto select-none"
                    >
                      <rect x={padLeft} y={padTop} width={innerWidth} height={innerResidHeight} fill="#f8fafc" rx="4" />

                      {(() => {
                        const resids = activeCondition.boltzmannFit!.fittedPoints.map(p => p.residual);
                        const maxAbsResid = Math.max(1e-3, ...resids.map(Math.abs)) * 1.15;
                        const scaleResidY = (r: number) =>
                          padTop + innerResidHeight / 2 - (r / maxAbsResid) * (innerResidHeight / 2);

                        return (
                          <>
                            {/* Zero line */}
                            <line
                              x1={padLeft}
                              y1={padTop + innerResidHeight / 2}
                              x2={plotWidth - padRight}
                              y2={padTop + innerResidHeight / 2}
                              stroke="#64748b"
                              stroke-width="1.5"
                            />

                            {/* Residual points */}
                            {activeCondition.boltzmannFit!.fittedPoints.map((p, idx) => (
                              <circle
                                key={idx}
                                cx={scaleX(p.temperature)}
                                cy={scaleResidY(p.residual)}
                                r="2.5"
                                fill="#4f46e5"
                                opacity="0.8"
                              />
                            ))}

                            {/* Axis labels */}
                            <text
                              x={padLeft - 8}
                              y={padTop + 4}
                              font-size="9"
                              font-family="monospace"
                              fill="#94a3b8"
                              text-anchor="end"
                            >
                              +{maxAbsResid.toFixed(2)}
                            </text>
                            <text
                              x={padLeft - 8}
                              y={residHeight - padBottom}
                              font-size="9"
                              font-family="monospace"
                              fill="#94a3b8"
                              text-anchor="end"
                            >
                              -{maxAbsResid.toFixed(2)}
                            </text>
                          </>
                        );
                      })()}
                    </svg>
                  </div>
                </div>
              )}

              {/* Interactive Legend Bar */}
              <div class="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
                <div class="flex items-center justify-between mb-2">
                  <span class="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Active Condition Series:
                  </span>
                  <span class="text-[11px] text-slate-500">
                    Click to inspect · {analysis.conditions.length} rendered
                  </span>
                </div>
                <div class="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto pr-1">
                  {analysis.conditions.map((cond, idx) => {
                    const color = PALETTE[idx % PALETTE.length]!;
                    const isInspected = activeCondition?.id === cond.id;
                    return (
                      <button
                        key={cond.id}
                        type="button"
                        onClick={() => set({ selectedConditionId: cond.id })}
                        class={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border transition ${isInspected ? 'ring-2 ring-accent-500 bg-accent-50 dark:bg-accent-950/40 font-bold border-accent-300 dark:border-accent-700' : 'hover:bg-slate-50 dark:hover:bg-slate-800 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300'}`}
                      >
                        <span class="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
                        <span class="truncate max-w-[140px]">{cond.name}</span>
                        <span class="text-slate-500 font-mono text-[11px]">({cond.tm.toFixed(1)}°C)</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Condition Ranking & Hit Summary Table */}
              <div class="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 space-y-3">
                <div class="flex items-center justify-between">
                  <h3 class="font-bold text-xs text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                    Condition Ranking Table (Sorted by Stabilization ΔTm)
                  </h3>
                  <span class="text-[11px] text-slate-400 font-mono">
                    ΔTm = Tm(sample) - Tm(ref)
                  </span>
                </div>

                <div class="overflow-x-auto">
                  <table class="w-full text-xs text-left">
                    <thead>
                      <tr class="border-b border-slate-200 dark:border-slate-700 text-slate-500 font-semibold">
                        <th class="py-2 px-1">Rank</th>
                        <th class="py-2 px-2">Condition</th>
                        <th class="py-2 px-2 text-right">Tm (°C)</th>
                        <th class="py-2 px-2 text-right">ΔTm (°C)</th>
                        <th class="py-2 px-2 text-left">Transition Peaks (+/−)</th>
                        <th class="py-2 px-2 text-right">Peak dF/dT</th>
                        <th class="py-2 px-2 text-right">Boltzmann R²</th>
                        <th class="py-2 px-2 text-right">Apparent ΔH (kJ/mol)</th>
                        <th class="py-2 px-2 text-center">Effect</th>
                        <th class="py-2 px-1 text-center">Ref</th>
                      </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-100 dark:divide-slate-800">
                      {analysis.rankedConditions.map((cond, idx) => {
                        const isRef = cond.id === analysis.referenceConditionId;
                        const isInspected = activeCondition?.id === cond.id;
                        const isTop = idx === 0 && cond.deltaTm > 0;

                        return (
                          <tr
                            key={cond.id}
                            onClick={() => set({ selectedConditionId: cond.id })}
                            class={`cursor-pointer transition ${isInspected ? 'bg-accent-50/70 dark:bg-accent-950/30' : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'}`}
                          >
                            <td class="py-2 px-1 font-mono font-semibold text-slate-400">
                              {isTop ? '🏆 1' : `#${idx + 1}`}
                            </td>
                            <td class="py-2 px-2 font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                              <span class="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: PALETTE[idx % PALETTE.length] }} />
                              <span class="truncate max-w-xs">{cond.name}</span>
                              {isRef && (
                                <span class="text-[10px] px-1.5 py-0.2 rounded bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 font-mono">
                                  REF
                                </span>
                              )}
                            </td>
                            <td class="py-2 px-2 font-mono font-bold text-right text-slate-900 dark:text-slate-100 whitespace-nowrap">
                              <span
                                class={`inline-block text-[10px] font-extrabold mr-1 px-1 rounded ${
                                  cond.tmSign === '-'
                                    ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                                    : 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300'
                                }`}
                                title={cond.tmSign === '+' ? 'Positive Melting Peak (+)' : 'Negative Trough / Blue Shift (−)'}
                              >
                                {cond.tmSign}
                              </span>
                              {cond.tm.toFixed(2)}
                            </td>
                            <td class="py-2 px-2 font-mono font-bold text-right">
                              {isRef ? (
                                <span class="text-slate-400">0.00</span>
                              ) : cond.deltaTm >= 2.0 ? (
                                <span class="text-emerald-600 dark:text-emerald-400 font-bold">
                                  +{cond.deltaTm.toFixed(2)}
                                </span>
                              ) : cond.deltaTm <= -2.0 ? (
                                <span class="text-rose-600 dark:text-rose-400 font-bold">
                                  {cond.deltaTm.toFixed(2)}
                                </span>
                              ) : (
                                <span class="text-slate-600 dark:text-slate-400">
                                  {cond.deltaTm > 0 ? `+${cond.deltaTm.toFixed(2)}` : cond.deltaTm.toFixed(2)}
                                </span>
                              )}
                            </td>
                            <td class="py-2 px-2">
                              <div class="flex flex-wrap gap-1 items-center max-w-xs">
                                {cond.peaks.map((p, pIdx) => (
                                  <span
                                    key={pIdx}
                                    class={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono border ${
                                      p.sign === '+'
                                        ? 'bg-sky-50 text-sky-800 border-sky-200 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-800'
                                        : 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800'
                                    } ${p.isPrimary ? 'ring-1 ring-accent-500 font-bold' : 'font-medium'}`}
                                    title={`${p.label} (${p.direction}): ${p.temperature.toFixed(2)}°C, height: ${p.height.toFixed(2)} · Click × to remove false peak`}
                                  >
                                    <span class="font-extrabold">{p.sign}</span>
                                    <span>{p.label.replace(/^[+-]/, '')}:</span>
                                    <span>{p.temperature.toFixed(1)}°C</span>
                                    <button
                                      type="button"
                                      title="Remove this false peak"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleRemovePeak(cond.id, p);
                                      }}
                                      class="ml-0.5 text-slate-400 hover:text-rose-600 font-bold leading-none cursor-pointer"
                                      aria-label={`Remove false peak ${p.label} from ${cond.name}`}
                                    >
                                      ×
                                    </button>
                                  </span>
                                ))}
                                {cond.peaks.length === 0 && (
                                  <span class="text-slate-400 italic text-[11px]">No peaks</span>
                                )}
                              </div>
                            </td>
                            <td class="py-2 px-2 font-mono text-right text-slate-500">
                              {cond.primaryPeak ? cond.primaryPeak.height.toFixed(2) : '—'}
                            </td>
                            <td class="py-2 px-2 font-mono text-right text-slate-500">
                              {cond.boltzmannFit ? cond.boltzmannFit.r2.toFixed(3) : '—'}
                            </td>
                            <td class="py-2 px-2 font-mono text-right text-slate-500">
                              {cond.boltzmannFit ? cond.boltzmannFit.deltaHunf_kJ.toFixed(0) : '—'}
                            </td>
                            <td class="py-2 px-2 text-center">
                              {isRef ? (
                                <span class="inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                                  Reference
                                </span>
                              ) : cond.effect === 'strong_stabilizer' ? (
                                <span class="inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                                  Strong Stabilizer (≥ +4°C)
                                </span>
                              ) : cond.effect === 'moderate_stabilizer' ? (
                                <span class="inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
                                  Moderate (+2 to +4°C)
                                </span>
                              ) : cond.effect === 'destabilizer' ? (
                                <span class="inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300">
                                  Destabilizer (≤ -2°C)
                                </span>
                              ) : (
                                <span class="inline-block px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                                  Neutral
                                </span>
                              )}
                            </td>
                            <td class="py-2 px-1 text-center" onClick={(e) => e.stopPropagation()}>
                              <input
                                type="radio"
                                name="ref-condition-radio"
                                checked={isRef}
                                onChange={() => set({ referenceConditionId: cond.id })}
                                class="text-accent-600 accent-accent-600 cursor-pointer"
                                title="Set as reference condition"
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Single Condition Inspector Card */}
              {activeCondition && (
                <div class="rounded-2xl border border-slate-200 bg-slate-50/60 p-4 dark:border-slate-800 dark:bg-slate-900/40 space-y-3">
                  <div class="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-2.5">
                    <div>
                      <h4 class="font-bold text-xs uppercase tracking-wider text-slate-800 dark:text-slate-200">
                        Condition Detail: {activeCondition.name}
                      </h4>
                      <p class="text-[11px] text-slate-500 mt-0.5">
                        {activeCondition.channel ? `Channel: ${activeCondition.channel.toUpperCase()} · ` : ''}
                        Transition statistics and thermodynamics
                      </p>
                    </div>
                    {activeCondition.id !== analysis.referenceConditionId && (
                      <button
                        type="button"
                        onClick={() => set({ referenceConditionId: activeCondition.id })}
                        class="text-[11px] font-semibold px-2.5 py-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                      >
                        Set as Reference
                      </button>
                    )}
                  </div>

                  <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                    <div class="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                      <div class="text-slate-500 flex items-center justify-between text-[11px] mb-0.5">
                        <span>1st Deriv Tm</span>
                        <span class={`text-[10px] px-1 py-0.2 rounded font-bold ${activeCondition.tmSign === '-' ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300' : 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300'}`}>
                          {activeCondition.tmSign === '+' ? '+ Melt Peak' : '− Trough'}
                        </span>
                      </div>
                      <span class="font-mono text-base font-bold text-slate-900 dark:text-slate-100">
                        {activeCondition.tmDerivative !== null ? `${activeCondition.tmSign}${activeCondition.tmDerivative.toFixed(2)} °C` : '—'}
                      </span>
                      <span class="text-[10px] text-slate-400 block mt-0.5">Parabolic peak vertex</span>
                    </div>

                    <div class="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                      <span class="text-slate-500 block text-[11px]">Boltzmann Midpoint</span>
                      <span class="font-mono text-base font-bold text-slate-900 dark:text-slate-100">
                        {activeCondition.tmBoltzmann !== null ? `${activeCondition.tmBoltzmann.toFixed(2)} °C` : '—'}
                      </span>
                      <span class="text-[10px] text-slate-400 block mt-0.5">
                        {activeCondition.boltzmannFit ? `R² = ${activeCondition.boltzmannFit.r2.toFixed(3)}` : 'No fit'}
                      </span>
                    </div>

                    <div class="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                      <span class="text-slate-500 block text-[11px]">Slope Factor (a)</span>
                      <span class="font-mono text-base font-bold text-slate-900 dark:text-slate-100">
                        {activeCondition.boltzmannFit ? `${activeCondition.boltzmannFit.a.toFixed(2)} °C` : '—'}
                      </span>
                      <span class="text-[10px] text-slate-400 block mt-0.5">Transition width</span>
                    </div>

                    <div class="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                      <span class="text-slate-500 block text-[11px]">Apparent ΔH_unf</span>
                      <span class="font-mono text-base font-bold text-indigo-600 dark:text-indigo-400">
                        {activeCondition.boltzmannFit ? `${activeCondition.boltzmannFit.deltaHunf_kJ.toFixed(0)} kJ/mol` : '—'}
                      </span>
                      <span class="text-[10px] text-slate-400 block mt-0.5">van 't Hoff enthalpy</span>
                    </div>
                  </div>

                  {activeCondition.peaks.length > 0 ? (
                    <div class="pt-2 space-y-1.5">
                      <div class="flex items-center justify-between">
                        <span class="block text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                          Detected Transition Peaks & Troughs ({activeCondition.peaks.length}):
                        </span>
                        <div class="flex items-center gap-2">
                          {s.removedPeakKeys.some(k => k.startsWith(`${activeCondition.id}:`)) && (
                            <button
                              type="button"
                              onClick={() => handleRestorePeaksForCondition(activeCondition.id)}
                              class="text-[11px] text-accent-600 dark:text-accent-400 hover:underline font-semibold"
                            >
                              ↺ Restore Removed Peaks
                            </button>
                          )}
                          <span class="text-[10px] text-slate-400">
                            (+) Upward melt · (−) Downward trough
                          </span>
                        </div>
                      </div>
                      <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                        {activeCondition.peaks.map((p, pIdx) => (
                          <div
                            key={pIdx}
                            class={`p-2.5 rounded-lg border text-xs flex flex-col justify-between ${
                              p.sign === '+'
                                ? 'bg-sky-50/60 border-sky-200 text-sky-900 dark:bg-sky-950/20 dark:border-sky-800 dark:text-sky-200'
                                : 'bg-amber-50/60 border-amber-200 text-amber-900 dark:bg-amber-950/20 dark:border-amber-800 dark:text-amber-200'
                            } ${p.isPrimary ? 'ring-2 ring-accent-500 shadow-sm' : ''}`}
                          >
                            <div class="flex items-center justify-between font-mono font-bold">
                              <span class="flex items-center gap-1">
                                <span class={`px-1.5 py-0.2 rounded text-[10px] font-extrabold ${p.sign === '+' ? 'bg-sky-200 text-sky-800 dark:bg-sky-900 dark:text-sky-200' : 'bg-amber-200 text-amber-800 dark:bg-amber-900 dark:text-amber-200'}`}>
                                  {p.sign}
                                </span>
                                <span>{p.label}</span>
                              </span>
                              <div class="flex items-center gap-1.5">
                                <span class="text-sm">{p.temperature.toFixed(1)} °C</span>
                                <button
                                  type="button"
                                  title="Remove this false peak"
                                  onClick={() => handleRemovePeak(activeCondition.id, p)}
                                  class="p-0.5 rounded hover:bg-rose-100 dark:hover:bg-rose-900/50 text-slate-400 hover:text-rose-600 transition"
                                  aria-label={`Remove false peak ${p.label}`}
                                >
                                  ✕
                                </button>
                              </div>
                            </div>
                            <div class="text-[10px] text-slate-500 dark:text-slate-400 flex items-center justify-between mt-1 pt-1 border-t border-slate-200/50 dark:border-slate-700/50">
                              <span>Height: {p.height.toFixed(2)}</span>
                              <span>Prominence: {p.prominence.toFixed(2)}</span>
                              {p.isPrimary && <span class="font-bold text-accent-600 dark:text-accent-400 uppercase text-[9px]">Primary</span>}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div class="pt-2 p-2.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-xs text-slate-500 flex items-center justify-between">
                      <span>No transition peaks detected (or false peaks were removed).</span>
                      {s.removedPeakKeys.some(k => k.startsWith(`${activeCondition.id}:`)) && (
                        <button
                          type="button"
                          onClick={() => handleRestorePeaksForCondition(activeCondition.id)}
                          class="text-xs font-semibold text-accent-600 dark:text-accent-400 hover:underline"
                        >
                          ↺ Restore Removed Peaks
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      }
      actions={<ActionBar onCopy={() => copyText} shareUrl={shareUrl} />}
      science={<SciencePanel science={SCIENCE} />}
    />
  );
}
