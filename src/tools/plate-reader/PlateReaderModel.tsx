import { useUrlState } from '@/lib/url-state';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { useDraftText } from '@/lib/drafts';
import { DEMO_384_BIOTEK_HTS, DEMO_96_ELISA_STANDARD, DEMO_96_LIST_EXPORT, DEMO_96_RAW_ONLY, DEMO_96_TECAN_DOSE_RESPONSE, applyDoseResponsePreset, applyElisaPreset, applyHts384Preset, applyLayoutAnnotations, computeAssayQc, computeDoseResponseSeries, computeGroupStatistics, computeStandardCurveQuantification, formatForCurveFitting, generateSerialDilution, normalizePlate, parseLayoutGrid, parsePlateData, type AnnotationToken, type NormalizationMode, type OutlierMethod, type SampleGroup, type SampleType, type WellValue } from '@/core/plates/reader';
import { interpolateBlues, interpolatePlasma, interpolateTurbo, interpolateViridis } from 'd3-scale-chromatic';
import { importErrorMessage, readTextFile } from '@/lib/file-import';
import { scienceText } from '@/app/components/SciencePanel';
import { SCIENCE } from './science';

export interface State {
  normalizationMode: NormalizationMode;
  blankMethod: 'global' | 'row' | 'column' | 'wells' | 'none';
  minMethod: 'blank' | 'neg-ctrl' | 'lowest' | 'wells' | 'custom';
  maxMethod: 'pos-ctrl' | 'highest' | 'wells' | 'custom';
  customMinValue: number;
  customMaxValue: number;
  outlierMethod: OutlierMethod;
  cvThreshold: number;
  autoExcludeOutliers: boolean;
  colorPalette: 'viridis' | 'plasma' | 'turbo' | 'blues';
  displayMode: 'raw' | 'normalized';
  activeTab: 'heatmap' | 'layout' | 'table' | 'elisa' | 'curve-fitting' | 'qc' | 'csv';
  curveFittingFormat: 'multi-replicate' | 'mean-sd';
  presetKey: string;
}
export const DEFAULTS: State = {
  normalizationMode: 'percent-control',
  blankMethod: 'global',
  minMethod: 'blank',
  maxMethod: 'pos-ctrl',
  customMinValue: 0,
  customMaxValue: 100,
  outlierMethod: 'grubbs',
  cvThreshold: 15,
  autoExcludeOutliers: false,
  colorPalette: 'viridis',
  displayMode: 'raw',
  activeTab: 'heatmap',
  curveFittingFormat: 'multi-replicate',
  presetKey: 'tecan_96',
};
export interface PlateReaderViewProps {
  projectId?: string;
  onSwitchToGenerator?: () => void;
  externalLayoutAnnotations?: Record<string, AnnotationToken>;
  onSyncLayoutToGenerator?: (ann: Record<string, AnnotationToken>) => void;
  isEmbedded?: boolean;
}

export function usePlateReaderModel({
  onSwitchToGenerator,
  externalLayoutAnnotations,
  onSyncLayoutToGenerator,
}: PlateReaderViewProps = {}) {
  const [stateSig, shareUrl] = useUrlState<State>('plate-reader', DEFAULTS);
  const s = stateSig.value;
  const set = (patch: Partial<State>) => {
    stateSig.value = { ...stateSig.value, ...patch };
  };

  // Plate visual density
  const [density, setDensity] = useState<'normal' | 'compact'>('normal');

  // Raw text input state
  const [rawText, setRawText] = useDraftText(
    'plate-reader:raw',
    () => DEMO_96_TECAN_DOSE_RESPONSE.rawText,
    () => set({ presetKey: 'custom', displayMode: 'raw' }),
  );

  // Layout states
  const [hasLayout, setHasLayout] = useState<boolean>(true);
  const [layoutText, setLayoutText] = useState<string>('');
  const [layoutAnnotations, setLayoutAnnotations] = useState<Record<string, AnnotationToken>>(() => {
    if (externalLayoutAnnotations && Object.keys(externalLayoutAnnotations).length > 0) {
      return externalLayoutAnnotations;
    }
    return {};
  });
  const [labelOverrides, setLabelOverrides] = useState<Record<string, Partial<AnnotationToken>>>({});

  // Sync external layout annotations if updated from Generator
  useEffect(() => {
    if (externalLayoutAnnotations && Object.keys(externalLayoutAnnotations).length > 0) {
      setLayoutAnnotations(externalLayoutAnnotations);
      setHasLayout(true);
    }
  }, [externalLayoutAnnotations]);

  // Layout painter state
  const [selectedWells, setSelectedWells] = useState<Set<string>>(new Set());
  const [painterRole, setPainterRole] = useState<SampleType>('sample');
  const [painterLabel, setPainterLabel] = useState<string>('Sample A');
  const [painterConc, setPainterConc] = useState<string>('');
  const [painterUnit, setPainterUnit] = useState<string>('µM');
  const [painterDilution, setPainterDilution] = useState<string>('1');

  // Serial dilution wizard state
  const [dilutionStartConc, setDilutionStartConc] = useState<number>(1000);
  const [dilutionFactor, setDilutionFactor] = useState<number>(2);
  const [dilutionRole, setDilutionRole] = useState<SampleType>('standard');
  const [dilutionUnit, setDilutionUnit] = useState<string>('pg/mL');

  // Well overrides & Custom References
  const [excludedWellIds, setExcludedWellIds] = useState<Set<string>>(new Set());
  const [selectedWellId, setSelectedWellId] = useState<string | null>('D4');
  const [customBlankWells, setCustomBlankWells] = useState<Set<string>>(new Set());
  const [customMinWells, setCustomMinWells] = useState<Set<string>>(new Set());
  const [customMaxWells, setCustomMaxWells] = useState<Set<string>>(new Set());
  const [toastMsg, setToastMsg] = useState<string>('');
  const [importError, setImportError] = useState('');
  const [layoutImportError, setLayoutImportError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const layoutFileInputRef = useRef<HTMLInputElement>(null);

  const flashToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(''), 2500);
  };

  // 1. Parse raw text into structured plate data
  const parsedPlate = useMemo(() => {
    return parsePlateData(rawText);
  }, [rawText]);

  // 2. Synchronize layout onto wells
  const assignedWells = useMemo(() => {
    let wells: Record<string, WellValue> = {};

    if (!hasLayout) {
      // Unannotated plate stays purely raw without synthetic layout
      for (const [id, w] of Object.entries(parsedPlate.wells)) {
        wells[id] = {
          ...w,
          sampleType: 'unassigned',
          sampleName: undefined,
          sampleGroupId: undefined,
          isExcluded: excludedWellIds.has(id),
        };
      }
      return wells;
    }

    // If user provided layout annotations or painter overrides
    if (Object.keys(layoutAnnotations).length > 0 || Object.keys(labelOverrides).length > 0) {
      const annotated = applyLayoutAnnotations(parsedPlate, layoutAnnotations, labelOverrides);
      wells = { ...annotated.wells };
      for (const id of Object.keys(wells)) {
        if (excludedWellIds.has(id)) {
          wells[id] = { ...wells[id]!, isExcluded: true };
        }
      }
      return wells;
    }

    // Default preset layouts
    if (s.presetKey === 'elisa_96') {
      const elisa = applyElisaPreset(parsedPlate);
      wells = { ...elisa.wells };
    } else if (s.presetKey === 'biotek_384' || parsedPlate.format === 384) {
      const hts = applyHts384Preset(parsedPlate);
      wells = { ...hts.wells };
    } else if (s.presetKey === 'tecan_96') {
      const dr = applyDoseResponsePreset(parsedPlate);
      wells = { ...dr.wells };
    } else {
      wells = { ...parsedPlate.wells };
    }

    for (const [id, w] of Object.entries(wells)) {
      if (excludedWellIds.has(id)) {
        wells[id] = { ...w, isExcluded: true };
      }
    }

    return wells;
  }, [parsedPlate, hasLayout, layoutAnnotations, labelOverrides, excludedWellIds, s.presetKey]);

  // 3. Extract sample groups from assigned wells
  const derivedGroups = useMemo<SampleGroup[]>(() => {
    if (!hasLayout) return [];

    if (Object.keys(layoutAnnotations).length === 0 && Object.keys(labelOverrides).length === 0) {
      if (s.presetKey === 'tecan_96') return applyDoseResponsePreset(parsedPlate).groups;
      if (s.presetKey === 'elisa_96') return applyElisaPreset(parsedPlate).groups;
      if (s.presetKey === 'biotek_384') return applyHts384Preset(parsedPlate).groups;
    }

    const groupMap = new Map<string, { name: string; type: SampleType; color?: string; concentration?: number; concentrationUnit?: string; unit?: string }>();
    const palette = ['#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#06b6d4', '#6366f1', '#14b8a6', '#f97316', '#84cc16'];
    let colorIdx = 0;

    for (const w of Object.values(assignedWells)) {
      if (!w.sampleGroupId && !w.sampleName) continue;
      const gId = w.sampleGroupId || w.sampleName || 'unassigned';
      if (w.sampleType === 'empty') continue;

      if (!groupMap.has(gId)) {
        const type: SampleType = w.sampleType || 'sample';
        let color = '#3b82f6';
        if (type === 'blank') color = '#94a3b8';
        else if (type === 'pos-ctrl') color = '#10b981';
        else if (type === 'neg-ctrl') color = '#0284c7';
        else if (type === 'standard') color = '#8b5cf6';
        else {
          color = palette[colorIdx % palette.length]!;
          colorIdx++;
        }
        groupMap.set(gId, {
          name: w.sampleName || gId,
          type,
          color,
          concentration: w.concentration,
          concentrationUnit: w.concentrationUnit,
          unit: w.concentrationUnit,
        });
      }
    }

    return Array.from(groupMap.entries()).map(([id, info]) => ({
      id,
      name: info.name,
      type: info.type,
      color: info.color || '#3b82f6',
      concentration: info.concentration,
      concentrationUnit: info.concentrationUnit,
      unit: info.unit,
    }));
  }, [hasLayout, layoutAnnotations, labelOverrides, s.presetKey, parsedPlate, assignedWells]);

  // 4. Normalization Engine with flexible Min/Max/Blank references
  const {
    normalizedWells,
    blankMean,
    posMean,
    negMean,
    effectiveMin: minRef,
    effectiveMax: maxRef,
  } = useMemo(() => {
    const plateToNormalize = { ...parsedPlate, wells: assignedWells };
    return normalizePlate(
      plateToNormalize,
      {
        mode: s.normalizationMode,
        blankMethod: s.blankMethod,
        minMethod: s.minMethod,
        maxMethod: s.maxMethod,
        customMinValue: s.customMinValue,
        customMaxValue: s.customMaxValue,
        blankWellIds: Array.from(customBlankWells),
        minWellIds: Array.from(customMinWells),
        maxWellIds: Array.from(customMaxWells),
        excludedWellIds: Array.from(excludedWellIds),
      },
      derivedGroups,
    );
  }, [
    parsedPlate,
    assignedWells,
    s.normalizationMode,
    s.blankMethod,
    s.minMethod,
    s.maxMethod,
    s.customMinValue,
    s.customMaxValue,
    customBlankWells,
    customMinWells,
    customMaxWells,
    excludedWellIds,
    derivedGroups,
  ]);

  // 5. Replicate Group Statistics & Outlier Testing
  const groupStats = useMemo(() => {
    if (!hasLayout || derivedGroups.length === 0) return [];
    return computeGroupStatistics(normalizedWells, derivedGroups, {
      method: s.outlierMethod,
      cvThreshold: s.cvThreshold,
      autoExcludeOutliers: s.autoExcludeOutliers,
    });
  }, [hasLayout, normalizedWells, derivedGroups, s.outlierMethod, s.cvThreshold, s.autoExcludeOutliers]);

  // 6. Screening Assay QC Metrics (Z'-factor, S/B, S/N)
  const assayQc = useMemo(() => {
    return computeAssayQc(groupStats);
  }, [groupStats]);

  // 7. ELISA Standard Curve Quantification
  const standardCurve = useMemo(() => {
    if (!hasLayout) return null;
    return computeStandardCurveQuantification(normalizedWells, groupStats);
  }, [hasLayout, normalizedWells, groupStats]);

  // 8. Dose-Response Series
  const doseResponseSeries = useMemo(() => {
    if (!hasLayout) return [];
    return computeDoseResponseSeries(groupStats);
  }, [hasLayout, groupStats]);

  // 9. Detected Unique Layout Labels for role mapping
  const detectedLabels = useMemo(() => {
    const labelCounts = new Map<string, { count: number; currentRole: SampleType; conc?: number; unit?: string; dilution?: number }>();

    for (const w of Object.values(assignedWells)) {
      if (!w.sampleName) continue;
      const lbl = w.sampleName;
      const existing = labelCounts.get(lbl);
      if (existing) {
        existing.count++;
      } else {
        labelCounts.set(lbl, {
          count: 1,
          currentRole: w.sampleType || 'sample',
          conc: w.concentration,
          unit: w.concentrationUnit,
          dilution: w.dilutionFactor,
        });
      }
    }

    return Array.from(labelCounts.entries()).map(([label, meta]) => ({
      label,
      ...meta,
    }));
  }, [assignedWells]);

  // Heatmap Min/Max range
  const { minVal, maxVal } = useMemo(() => {
    const vals: number[] = [];
    for (const w of Object.values(normalizedWells)) {
      const v = s.displayMode === 'normalized' ? w.normalized : w.raw;
      if (v !== null && v !== undefined && !isNaN(v)) {
        vals.push(v);
      }
    }
    if (vals.length === 0) return { minVal: 0, maxVal: 1 };
    return {
      minVal: Math.min(...vals),
      maxVal: Math.max(...vals),
    };
  }, [normalizedWells, s.displayMode]);

  // Interpolate color for a well
  const getWellColor = (val: number | null | undefined): string => {
    if (val === null || val === undefined || isNaN(val)) {
      return '#e2e8f0'; // slate-200
    }
    const range = maxVal - minVal;
    const t = range > 1e-12 ? Math.max(0, Math.min(1, (val - minVal) / range)) : 0.5;

    switch (s.colorPalette) {
      case 'plasma':
        return interpolatePlasma(t);
      case 'turbo':
        return interpolateTurbo(t);
      case 'blues':
        return interpolateBlues(t);
      case 'viridis':
      default:
        return interpolateViridis(t);
    }
  };

  // Toggle exclusion of a single well
  const handleToggleExclude = (wellId: string) => {
    const next = new Set(excludedWellIds);
    if (next.has(wellId)) {
      next.delete(wellId);
      flashToast(`Well ${wellId} included in statistics`);
    } else {
      next.add(wellId);
      flashToast(`Well ${wellId} excluded from statistics`);
    }
    setExcludedWellIds(next);
  };

  // Load Presets
  const loadPreset = (key: 'tecan_96' | 'elisa_96' | 'biotek_384' | 'raw_96' | 'list_96') => {
    setExcludedWellIds(new Set());
    setSelectedWellId(null);
    setLayoutAnnotations({});
    setLabelOverrides({});
    setCustomBlankWells(new Set());
    setCustomMinWells(new Set());
    setCustomMaxWells(new Set());
    setSelectedWells(new Set());

    if (key === 'tecan_96') {
      setRawText(DEMO_96_TECAN_DOSE_RESPONSE.rawText, { persist: false });
      setHasLayout(true);
      set({ presetKey: key, normalizationMode: 'percent-control', blankMethod: 'global', minMethod: 'blank', maxMethod: 'pos-ctrl' });
      setSelectedWellId('D4');
      flashToast('Loaded 96-well Dose-Response Assay (Tecan)');
    } else if (key === 'elisa_96') {
      setRawText(DEMO_96_ELISA_STANDARD.rawText, { persist: false });
      setHasLayout(true);
      set({ presetKey: key, normalizationMode: 'blank-subtracted', blankMethod: 'global', minMethod: 'blank', maxMethod: 'highest', activeTab: 'elisa' });
      setSelectedWellId('A1');
      flashToast('Loaded 96-well ELISA Standard Curve & Unknowns');
    } else if (key === 'biotek_384') {
      setRawText(DEMO_384_BIOTEK_HTS.rawText, { persist: false });
      setHasLayout(true);
      set({ presetKey: key, normalizationMode: 'percent-control', blankMethod: 'global', minMethod: 'blank', maxMethod: 'pos-ctrl' });
      setSelectedWellId('E8');
      flashToast('Loaded 384-well HTS Kinase Screen (BioTek)');
    } else if (key === 'raw_96') {
      setRawText(DEMO_96_RAW_ONLY.rawText, { persist: false });
      setHasLayout(false);
      set({ presetKey: key, normalizationMode: 'raw', displayMode: 'raw', activeTab: 'heatmap' });
      setSelectedWellId('A1');
      flashToast('Loaded 96-well Unannotated Plate (Raw Signal Only)');
    } else if (key === 'list_96') {
      setRawText(DEMO_96_LIST_EXPORT.rawText, { persist: false });
      setHasLayout(true);
      set({ presetKey: key, normalizationMode: 'raw', displayMode: 'raw' });
      setSelectedWellId('C1');
      flashToast('Loaded 3-Column List CSV');
    }
  };

  // Upload raw plate data
  const handleFileUpload = (e: Event) => {
    const target = e.target as HTMLInputElement;
    const file = target.files?.[0];
    if (!file) return;

    target.value = '';
    setImportError('');
    readTextFile(file)
      .then(content => {
        setRawText(content);
        setExcludedWellIds(new Set());
        setSelectedWellId(null);
        setHasLayout(false);
        setLayoutAnnotations({});
        setLabelOverrides({});
        set({ presetKey: 'custom', displayMode: 'raw' });
        flashToast(`Imported ${file.name} (Raw Plate - Define Layout in Layout Tab)`);
      })
      .catch(err => setImportError(importErrorMessage(err, file.name)));
  };

  // Upload layout annotation matrix/list
  const handleLayoutFileUpload = (e: Event) => {
    const target = e.target as HTMLInputElement;
    const file = target.files?.[0];
    if (!file) return;

    target.value = '';
    setLayoutImportError('');
    readTextFile(file)
      .then(content => {
        setLayoutText(content);
        const parsed = parseLayoutGrid(content, { format: parsedPlate.format });
        setLayoutAnnotations(parsed.annotations);
        setHasLayout(true);
        flashToast(`Imported layout annotations (${Object.keys(parsed.annotations).length} wells annotated)`);
      })
      .catch(err => setLayoutImportError(importErrorMessage(err, file.name)));
  };

  // Apply pasted layout annotations
  const handleApplyPastedLayout = () => {
    if (!layoutText.trim()) return;
    const parsed = parseLayoutGrid(layoutText, { format: parsedPlate.format });
    setLayoutAnnotations(parsed.annotations);
    setHasLayout(true);
    flashToast(`Applied layout annotations to ${Object.keys(parsed.annotations).length} wells`);
  };

  // Update a detected label override
  const handleUpdateLabelOverride = (label: string, patch: Partial<AnnotationToken>) => {
    setLabelOverrides(prev => ({
      ...prev,
      [label]: {
        ...(prev[label] || {}),
        ...patch,
      },
    }));
    setHasLayout(true);
    flashToast(`Updated mapping for "${label}"`);
  };

  // Painter: Apply to selected wells
  const handlePaintSelectedWells = () => {
    if (selectedWells.size === 0) {
      flashToast('Please select one or more wells first');
      return;
    }

    const nextAnnotations: Record<string, AnnotationToken> = { ...layoutAnnotations };
    const numConc = painterConc.trim() !== '' ? parseFloat(painterConc) : undefined;
    const numDilution = painterDilution.trim() !== '' ? parseFloat(painterDilution) : 1;

    for (const wellId of selectedWells) {
      nextAnnotations[wellId] = {
        label: painterLabel || painterRole,
        role: painterRole,
        concentration: numConc !== undefined && !isNaN(numConc) ? numConc : undefined,
        unit: painterUnit || undefined,
        dilutionFactor: !isNaN(numDilution) && numDilution > 0 ? numDilution : 1,
      };
    }

    setLayoutAnnotations(nextAnnotations);
    setHasLayout(true);
    flashToast(`Painted ${selectedWells.size} wells as ${painterRole} (${painterLabel})`);
  };

  // Serial Dilution Wizard execution
  const handleExecuteSerialDilution = () => {
    if (selectedWells.size === 0) {
      flashToast('Please select wells for the dilution series');
      return;
    }

    const sortedWells = Array.from(selectedWells).sort((a, b) => {
      const rowA = a.charAt(0);
      const rowB = b.charAt(0);
      const colA = parseInt(a.slice(1), 10);
      const colB = parseInt(b.slice(1), 10);
      return rowA === rowB ? colA - colB : rowA.localeCompare(rowB);
    });

    const series = generateSerialDilution(sortedWells, {
      startConcentration: dilutionStartConc,
      dilutionFactor: dilutionFactor,
      role: dilutionRole,
      unit: dilutionUnit,
    });

    const nextAnnotations = { ...layoutAnnotations, ...series };
    setLayoutAnnotations(nextAnnotations);
    setHasLayout(true);
    flashToast(`Generated ${sortedWells.length}-point serial dilution (${dilutionRole})`);
  };

  // Painter Selection Helpers
  const handleToggleWellSelection = (wellId: string) => {
    const next = new Set(selectedWells);
    if (next.has(wellId)) next.delete(wellId);
    else next.add(wellId);
    setSelectedWells(next);
  };

  const handleSelectRow = (r: string) => {
    const next = new Set(selectedWells);
    for (const c of parsedPlate.cols) {
      next.add(`${r}${c}`);
    }
    setSelectedWells(next);
  };

  const handleSelectCol = (c: number) => {
    const next = new Set(selectedWells);
    for (const r of parsedPlate.rows) {
      next.add(`${r}${c}`);
    }
    setSelectedWells(next);
  };

  const handleSelectAll = () => {
    const next = new Set<string>();
    for (const r of parsedPlate.rows) {
      for (const c of parsedPlate.cols) {
        next.add(`${r}${c}`);
      }
    }
    setSelectedWells(next);
  };

  const handleClearSelection = () => {
    setSelectedWells(new Set());
  };

  // Curve Fitting Table Generation
  const curveFittingTable = useMemo(() => {
    return formatForCurveFitting(groupStats, {
      format: s.curveFittingFormat,
      useNormalized: s.normalizationMode !== 'raw',
    });
  }, [groupStats, s.curveFittingFormat, s.normalizationMode]);

  // Copy Curve Fitting Data & Redirect
  const handleOpenInCurveFitting = async () => {
    try {
      if (typeof sessionStorage !== 'undefined') {
        sessionStorage.setItem('biobench_fitting_input', curveFittingTable);
      }
      await navigator.clipboard.writeText(curveFittingTable);
      flashToast('Dose-response table loaded! Redirecting to Curve Fitting...');
      setTimeout(() => {
        location.hash = '#/t/fitting';
      }, 400);
    } catch {
      flashToast('Failed to copy to clipboard');
      location.hash = '#/t/fitting';
    }
  };

  // Selected well details
  const selectedWell: WellValue | undefined = selectedWellId ? normalizedWells[selectedWellId] : undefined;
  const selectedGroup = selectedWell ? derivedGroups.find(g => g.id === selectedWell.sampleGroupId || g.name === selectedWell.sampleName) : undefined;
  const selectedGroupStats = selectedWell ? groupStats.find(g => g.groupId === selectedWell.sampleGroupId || g.groupName === selectedWell.sampleName) : undefined;

  // Hovered well details for live readout
  const [hoveredWellId, setHoveredWellId] = useState<string | null>(null);
  const hoveredWell: WellValue | undefined = hoveredWellId ? normalizedWells[hoveredWellId] : undefined;

  const handleGoToGenerator = () => {
    if (onSwitchToGenerator) {
      onSwitchToGenerator();
    } else {
      window.location.hash = '#/t/plate';
    }
  };

  // Markdown report for ActionBar copy
  const copyReport = () => {
    const lines = [
      `# Bio-Bench Plate Reader & Normalization Report`,
      `Format: ${parsedPlate.format}-Well Plate (${parsedPlate.vendorHint.toUpperCase()})`,
      `Layout Defined: ${hasLayout ? 'YES' : 'NO (Raw Data Only)'}`,
      `Normalization Mode: ${s.normalizationMode.toUpperCase()}`,
      `Blank Reference: ${blankMean.toFixed(4)} | Min Ref: ${minRef.toFixed(4)} | Max Ref: ${maxRef.toFixed(4)}`,
      '',
    ];

    if (assayQc.zPrime !== null) {
      lines.push(`## Assay Quality Control`);
      lines.push(`Z'-Factor: ${assayQc.zPrime.toFixed(3)} (${assayQc.zFactorInterpretation?.toUpperCase()})`);
      lines.push(`Signal-to-Noise (S/N): ${assayQc.signalToNoise?.toFixed(2) ?? 'N/A'}`);
      lines.push(`Signal-to-Background (S/B): ${assayQc.signalToBackground?.toFixed(2) ?? 'N/A'}`);
      lines.push('');
    }

    if (standardCurve && standardCurve.hasStandards) {
      lines.push(`## ELISA Standard Curve Fit`);
      lines.push(`Equation: ${standardCurve.equation}`);
      lines.push(`R²: ${standardCurve.rSquared.toFixed(4)} | Calibration Model: ${standardCurve.fitType.toUpperCase()}`);
      lines.push('');
      lines.push(`## Quantified Unknown Samples`);
      lines.push(`Sample\tReplicates\tMean Signal\tCalculated Conc\tDilution\tFinal Conc\t%CV`);
      for (const smp of standardCurve.quantifiedSamples) {
        lines.push(`${smp.sampleName}\t${smp.n}\t${smp.meanSignal.toFixed(3)}\t${smp.calculatedConc !== null ? smp.calculatedConc.toFixed(2) : 'N/A'}\t${smp.dilutionFactor}x\t${smp.finalConc !== null ? smp.finalConc.toFixed(2) : 'N/A'}\t${smp.concCv !== null ? smp.concCv.toFixed(1) : smp.cvSignal.toFixed(1)}%`);
      }
      lines.push('');
    }

    if (groupStats.length > 0) {
      lines.push(`## Replicate Group Statistics`);
      lines.push(`Group\tType\tN\tMean\tSD\tSEM\t%CV\tQC`);
      for (const g of groupStats) {
        lines.push(`${g.groupName}\t${g.sampleType}\t${g.nValid}\t${g.mean.toFixed(3)}\t${g.sd.toFixed(3)}\t${g.sem.toFixed(3)}\t${g.cv.toFixed(1)}%\t${g.qcFlags.status.toUpperCase()}`);
      }
      lines.push('');
    }

    lines.push(scienceText(SCIENCE));
    return lines.join('\n');
  };

  const is384 = parsedPlate.format === 384;

  return {
    onSwitchToGenerator,
    externalLayoutAnnotations,
    onSyncLayoutToGenerator,
    stateSig,
    shareUrl,
    s,
    set,
    density,
    setDensity,
    rawText,
    setRawText,
    hasLayout,
    setHasLayout,
    layoutText,
    setLayoutText,
    layoutAnnotations,
    setLayoutAnnotations,
    labelOverrides,
    setLabelOverrides,
    selectedWells,
    setSelectedWells,
    painterRole,
    setPainterRole,
    painterLabel,
    setPainterLabel,
    painterConc,
    setPainterConc,
    painterUnit,
    setPainterUnit,
    painterDilution,
    setPainterDilution,
    dilutionStartConc,
    setDilutionStartConc,
    dilutionFactor,
    setDilutionFactor,
    dilutionRole,
    setDilutionRole,
    dilutionUnit,
    setDilutionUnit,
    excludedWellIds,
    setExcludedWellIds,
    selectedWellId,
    setSelectedWellId,
    customBlankWells,
    setCustomBlankWells,
    customMinWells,
    setCustomMinWells,
    customMaxWells,
    setCustomMaxWells,
    toastMsg,
    setToastMsg,
    importError,
    setImportError,
    layoutImportError,
    setLayoutImportError,
    fileInputRef,
    layoutFileInputRef,
    flashToast,
    parsedPlate,
    assignedWells,
    derivedGroups,
    normalizedWells,
    blankMean,
    posMean,
    negMean,
    minRef,
    maxRef,
    groupStats,
    assayQc,
    standardCurve,
    doseResponseSeries,
    detectedLabels,
    minVal,
    maxVal,
    getWellColor,
    handleToggleExclude,
    loadPreset,
    handleFileUpload,
    handleLayoutFileUpload,
    handleApplyPastedLayout,
    handleUpdateLabelOverride,
    handlePaintSelectedWells,
    handleExecuteSerialDilution,
    handleToggleWellSelection,
    handleSelectRow,
    handleSelectCol,
    handleSelectAll,
    handleClearSelection,
    curveFittingTable,
    handleOpenInCurveFitting,
    selectedWell,
    selectedGroup,
    selectedGroupStats,
    hoveredWellId,
    setHoveredWellId,
    hoveredWell,
    handleGoToGenerator,
    copyReport,
    is384,
  };
}

export type PlateReaderModel = ReturnType<typeof usePlateReaderModel>;
