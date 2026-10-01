import { useUrlState } from '@/lib/url-state';
import { useDraftText } from '@/lib/drafts';
import { formatDsfToCsv, generateLysozymeDemoDataset, generateNanoDsfDemoDataset, generatePrometheusDemoDataset, getNiceTicks, parseDsfCsv, type DsfChannelType, type DsfEffectClassification, type DsfScreeningResult } from '@/core/dsf';
import { useMemo, useRef, useState } from 'preact/hooks';
import { importErrorMessage, readTextFile } from '@/lib/file-import';
import { makeDsfWorker, runDsfJob, type DsfJob } from './job';
import { useWorkerCompute } from '@/lib/use-worker-compute';
import { downloadBlob, downloadSvg, svgToPngBlob, toCsv } from '@/lib/export';
import { scienceText } from '@/app/components/SciencePanel';
import { SCIENCE } from './science';

export interface State {
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
export const DEFAULTS: State = {
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
export const PALETTE = [
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

export function useDsfModel() {
  const [stateSig, shareUrl] = useUrlState<State>('dsf', DEFAULTS);
  const s = stateSig.value;
  const set = (patch: Partial<State>) => {
    stateSig.value = { ...stateSig.value, ...patch };
  };

  const [rawText, setRawText] = useDraftText(
    'dsf:raw',
    () => formatDsfToCsv(generateLysozymeDemoDataset()),
    () => set({ presetKey: 'custom' }),
  );

  const [hoverData, setHoverData] = useState<{
    temperature: number;
    condName?: string;
    fl?: number;
    dFdT?: number;
    xPx: number;
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const [importError, setImportError] = useState('');
  const meltSvgRef = useRef<SVGSVGElement>(null);
  const derivSvgRef = useRef<SVGSVGElement>(null);
  const residSvgRef = useRef<SVGSVGElement>(null);

  // Load Presets
  function handleLoadPreset(preset: 'lysozyme' | 'nanodsf' | 'prometheus') {
    if (preset === 'lysozyme') {
      const data = generateLysozymeDemoDataset();
      setRawText(formatDsfToCsv(data), { persist: false });
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
      setRawText(formatDsfToCsv(data), { persist: false });
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
      setRawText(formatDsfToCsv(data), { persist: false });
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

  async function handleFileUpload(file: File) {
    setImportError('');
    try {
      const content = await readTextFile(file);
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
    } catch (err) {
      setImportError(importErrorMessage(err, file.name));
    }
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
  const dsfJob = useMemo<DsfJob | null>(() => {
    if (!parsedData || 'error' in parsedData) return null;
    const tempRange: [number, number] | undefined =
      s.tempMinCrop != null && s.tempMaxCrop != null
        ? [s.tempMinCrop, s.tempMaxCrop]
        : undefined;
    return {
      parsed: parsedData,
      options: {
        referenceNameOrIndex: s.referenceConditionId || undefined,
        windowSize: s.windowSize,
        tmMethod: s.tmMethod,
        selectedConditionIds: effectiveSelectedIds,
        tempRange,
        direction: s.transitionDirection,
        peakProminenceRatio: s.peakProminenceRatio,
        maxPeaks: s.maxPeaks,
        removedPeakKeys: s.removedPeakKeys,
      },
    };
  }, [parsedData, s.referenceConditionId, s.windowSize, s.tmMethod, effectiveSelectedIds, s.tempMinCrop, s.tempMaxCrop, s.transitionDirection, s.peakProminenceRatio, s.maxPeaks, s.removedPeakKeys]);
  // Smoothing, peak finding and sigmoid fits for a full plate can take a few hundred ms; run them in a worker.
  // The previous analysis stays on screen while a new one computes.
  const dsfCompute = useWorkerCompute<DsfJob, DsfScreeningResult>(makeDsfWorker, runDsfJob, dsfJob);
  const analysis = useMemo(
    () => (dsfCompute.error ? { error: dsfCompute.error } : dsfCompute.result),
    [dsfCompute.error, dsfCompute.result],
  );

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

  return {
    stateSig,
    shareUrl,
    s,
    set,
    rawText,
    setRawText,
    hoverData,
    setHoverData,
    fileInputRef,
    importError,
    setImportError,
    meltSvgRef,
    derivSvgRef,
    residSvgRef,
    handleLoadPreset,
    handleFileUpload,
    parsedData,
    availableChannels,
    allConditionsList,
    effectiveSelectedIds,
    dsfJob,
    dsfCompute,
    analysis,
    activeCondition,
    referenceCondition,
    normalizeVal,
    getDisplayedFl,
    bounds,
    plotWidth,
    meltHeight,
    derivHeight,
    residHeight,
    padLeft,
    padRight,
    padTop,
    padBottom,
    innerWidth,
    innerMeltHeight,
    innerDerivHeight,
    innerResidHeight,
    scaleX,
    invScaleX,
    scaleMeltY,
    scaleDerivY,
    handleSvgMouseMove,
    handleSelectAll,
    handleDeselectAll,
    handleSoloTrace,
    handleInvertSelection,
    handleChannelFilter,
    handleToggleTrace,
    handleRemovePeak,
    handleRestorePeaksForCondition,
    handleRestoreAllPeaks,
    handleResetView,
    handleExportCsv,
    handleExportMeltSvg,
    handleExportMeltPng,
    handleExportDerivSvg,
    handleExportDerivPng,
    formatEffectLabel,
    copyText,
    filteredConditionsForDrawer,
  };
}

export type DsfModel = ReturnType<typeof useDsfModel>;
