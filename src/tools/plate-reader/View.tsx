import { useState, useMemo, useRef, useEffect } from 'preact/hooks';
import { PlateChassis } from '@/tools/plate/PlateChassis';
import {
  interpolateViridis,
  interpolatePlasma,
  interpolateTurbo,
  interpolateBlues,
} from 'd3-scale-chromatic';
import {
  type WellValue,
  type SampleGroup,
  type SampleType,
  type NormalizationMode,
  type OutlierMethod,
  type AnnotationToken,
  parsePlateData,
  parseLayoutGrid,
  applyLayoutAnnotations,
  applyDoseResponsePreset,
  applyHts384Preset,
  applyElisaPreset,
  generateSerialDilution,
  normalizePlate,
  computeGroupStatistics,
  computeAssayQc,
  computeStandardCurveQuantification,
  computeDoseResponseSeries,
  exportQuantifiedSamplesCsv,
  formatForCurveFitting,
  exportNormalizedMatrixCsv,
  exportSummaryCsv,
  DEMO_96_TECAN_DOSE_RESPONSE,
  DEMO_384_BIOTEK_HTS,
  DEMO_96_LIST_EXPORT,
  DEMO_96_ELISA_STANDARD,
  DEMO_96_RAW_ONLY,
} from '@/core/plates/reader';
import { ToolLayout } from '@/app/components/ToolLayout';
import { SciencePanel, scienceText } from '@/app/components/SciencePanel';
import { ActionBar } from '@/app/components/ActionBar';
import { useUrlState } from '@/lib/url-state';
import { SCIENCE } from './science';

interface State {
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

const DEFAULTS: State = {
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

function getContrastingTextColor(colorStr: string): string {
  let r = 0, g = 0, b = 0;
  if (colorStr.startsWith('#')) {
    const hex = colorStr.slice(1);
    r = parseInt(hex.slice(0, 2), 16) || 0;
    g = parseInt(hex.slice(2, 4), 16) || 0;
    b = parseInt(hex.slice(4, 6), 16) || 0;
  } else if (colorStr.startsWith('rgb')) {
    const match = colorStr.match(/\d+/g);
    if (match) {
      r = parseInt(match[0] || '0', 10);
      g = parseInt(match[1] || '0', 10);
      b = parseInt(match[2] || '0', 10);
    }
  }
  const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
  return luminance > 140 ? '#0f172a' : '#ffffff';
}

export interface PlateReaderViewProps {
  onSwitchToGenerator?: () => void;
  externalLayoutAnnotations?: Record<string, AnnotationToken>;
  onSyncLayoutToGenerator?: (ann: Record<string, AnnotationToken>) => void;
  isEmbedded?: boolean;
}

export default function PlateReaderView({
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
  const [rawText, setRawText] = useState<string>(() => DEMO_96_TECAN_DOSE_RESPONSE.rawText);

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
      setRawText(DEMO_96_TECAN_DOSE_RESPONSE.rawText);
      setHasLayout(true);
      set({ presetKey: key, normalizationMode: 'percent-control', blankMethod: 'global', minMethod: 'blank', maxMethod: 'pos-ctrl' });
      setSelectedWellId('D4');
      flashToast('Loaded 96-well Dose-Response Assay (Tecan)');
    } else if (key === 'elisa_96') {
      setRawText(DEMO_96_ELISA_STANDARD.rawText);
      setHasLayout(true);
      set({ presetKey: key, normalizationMode: 'blank-subtracted', blankMethod: 'global', minMethod: 'blank', maxMethod: 'highest', activeTab: 'elisa' });
      setSelectedWellId('A1');
      flashToast('Loaded 96-well ELISA Standard Curve & Unknowns');
    } else if (key === 'biotek_384') {
      setRawText(DEMO_384_BIOTEK_HTS.rawText);
      setHasLayout(true);
      set({ presetKey: key, normalizationMode: 'percent-control', blankMethod: 'global', minMethod: 'blank', maxMethod: 'pos-ctrl' });
      setSelectedWellId('E8');
      flashToast('Loaded 384-well HTS Kinase Screen (BioTek)');
    } else if (key === 'raw_96') {
      setRawText(DEMO_96_RAW_ONLY.rawText);
      setHasLayout(false);
      set({ presetKey: key, normalizationMode: 'raw', displayMode: 'raw', activeTab: 'heatmap' });
      setSelectedWellId('A1');
      flashToast('Loaded 96-well Unannotated Plate (Raw Signal Only)');
    } else if (key === 'list_96') {
      setRawText(DEMO_96_LIST_EXPORT.rawText);
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

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (content) {
        setRawText(content);
        setExcludedWellIds(new Set());
        setSelectedWellId(null);
        setHasLayout(false);
        setLayoutAnnotations({});
        setLabelOverrides({});
        set({ presetKey: 'custom', displayMode: 'raw' });
        flashToast(`Imported ${file.name} (Raw Plate - Define Layout in Layout Tab)`);
      }
    };
    reader.readAsText(file);
  };

  // Upload layout annotation matrix/list
  const handleLayoutFileUpload = (e: Event) => {
    const target = e.target as HTMLInputElement;
    const file = target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (content) {
        setLayoutText(content);
        const parsed = parseLayoutGrid(content, { format: parsedPlate.format });
        setLayoutAnnotations(parsed.annotations);
        setHasLayout(true);
        flashToast(`Imported layout annotations (${Object.keys(parsed.annotations).length} wells annotated)`);
      }
    };
    reader.readAsText(file);
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

  return (
    <ToolLayout
      icon="🧪"
      title="Plate Reader CSV Processor & Normalization"
      blurb="Scientific microplate data processor for Tecan, BMG, BioTek & SoftMax exports. Flexible layout definitions, ELISA standard curve regression, dose-response analysis, and customizable Min/Max references."
      wide={true}
      mobileResultSummary={
        <span>
          {parsedPlate.format}-well · Display: <strong class="font-mono text-accent-700 dark:text-accent-300">{s.displayMode.toUpperCase()}</strong> · {hasLayout ? `${derivedGroups.length} groups` : 'No layout'}
        </span>
      }
      inputs={
        <div class="space-y-4">
          {/* Preset Loaders & File Input */}
          <div class="rounded-xl border border-slate-200 bg-white p-3.5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
            <div class="flex items-center justify-between mb-2">
              <span class="text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                Load Plate Data
              </span>
              <span class="text-[11px] font-mono text-slate-500">
                {`${parsedPlate.format}-Well · ${parsedPlate.vendorHint.toUpperCase()}`}
              </span>
            </div>

            <div class="grid grid-cols-2 gap-1.5 mb-2.5 text-xs font-medium">
              <button
                type="button"
                onClick={() => loadPreset('tecan_96')}
                class={`p-2 rounded-lg text-left transition border ${s.presetKey === 'tecan_96' ? 'border-accent-500 bg-accent-50 text-accent-800 dark:bg-accent-950/40 dark:text-accent-300' : 'border-slate-200 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800'}`}
              >
                <div class="flex items-center gap-1.5">
                  <span>🧪</span>
                  <span class="font-semibold">Tecan 96</span>
                </div>
                <div class="text-[10px] text-slate-500">Dose-Response Assay</div>
              </button>

              <button
                type="button"
                onClick={() => loadPreset('elisa_96')}
                class={`p-2 rounded-lg text-left transition border ${s.presetKey === 'elisa_96' ? 'border-accent-500 bg-accent-50 text-accent-800 dark:bg-accent-950/40 dark:text-accent-300' : 'border-slate-200 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800'}`}
              >
                <div class="flex items-center gap-1.5">
                  <span>🧬</span>
                  <span class="font-semibold">ELISA 96</span>
                </div>
                <div class="text-[10px] text-slate-500">Standards &amp; Unknowns</div>
              </button>

              <button
                type="button"
                onClick={() => loadPreset('biotek_384')}
                class={`p-2 rounded-lg text-left transition border ${s.presetKey === 'biotek_384' ? 'border-accent-500 bg-accent-50 text-accent-800 dark:bg-accent-950/40 dark:text-accent-300' : 'border-slate-200 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800'}`}
              >
                <div class="flex items-center gap-1.5">
                  <span>🔬</span>
                  <span class="font-semibold">BioTek 384</span>
                </div>
                <div class="text-[10px] text-slate-500">HTS Kinase Screen</div>
              </button>

              <button
                type="button"
                onClick={() => loadPreset('raw_96')}
                class={`p-2 rounded-lg text-left transition border ${s.presetKey === 'raw_96' ? 'border-accent-500 bg-accent-50 text-accent-800 dark:bg-accent-950/40 dark:text-accent-300' : 'border-slate-200 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800'}`}
              >
                <div class="flex items-center gap-1.5">
                  <span>📋</span>
                  <span class="font-semibold">Raw 96 Only</span>
                </div>
                <div class="text-[10px] text-slate-500">No Layout Attached</div>
              </button>
            </div>

            {/* Paste / Edit Textarea */}
            <div class="space-y-1.5">
              <div class="flex items-center justify-between text-xs text-slate-600 dark:text-slate-400">
                <span>Raw Signal CSV / Matrix</span>
                <div class="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    class="font-semibold text-accent-600 hover:text-accent-700 dark:text-accent-400 cursor-pointer"
                  >
                    📂 Upload File
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv,.tsv,.txt"
                    onChange={handleFileUpload}
                    class="hidden"
                  />
                  <span>·</span>
                  <button
                    type="button"
                    onClick={() => {
                      setRawText('');
                      setExcludedWellIds(new Set());
                      setHasLayout(false);
                      flashToast('Cleared data');
                    }}
                    class="text-rose-600 hover:text-rose-700 dark:text-rose-400 cursor-pointer"
                  >
                    Clear
                  </button>
                </div>
              </div>

              <textarea
                rows={4}
                value={rawText}
                onInput={(e) => {
                  setRawText((e.target as HTMLTextAreaElement).value);
                  set({ presetKey: 'custom', displayMode: 'raw' });
                }}
                placeholder="Paste Tecan, BMG, BioTek, SoftMax, or CSV matrix text..."
                class="w-full rounded-lg border border-slate-300 p-2 font-mono text-[11px] leading-snug dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 focus:border-accent-500 focus:outline-none"
              />
            </div>
          </div>

          {/* Layout Status & Quick Toggle */}
          <div class="rounded-xl border border-slate-200 bg-white p-3.5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
            <div class="flex items-center justify-between mb-2">
              <span class="text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                Plate Layout &amp; Annotations
              </span>
              <span class={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${hasLayout ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'}`}>
                {hasLayout ? 'Layout Defined' : 'No Layout (Raw Only)'}
              </span>
            </div>

            <p class="text-xs text-slate-500 dark:text-slate-400 mb-2.5">
              {hasLayout
                ? `${derivedGroups.length} groups assigned. Adjust labels, dilutions, or standard curves in the Layout tab.`
                : 'Showing pure raw measurements. Click below to upload annotations, define serial dilutions, or paint wells.'}
            </p>

            <div class="flex gap-2">
              <button
                type="button"
                onClick={() => set({ activeTab: 'layout' })}
                class="flex-1 py-1.5 px-2.5 rounded-lg bg-accent-600 hover:bg-accent-700 text-white font-semibold text-xs transition shadow-xs text-center"
              >
                ✏️ {hasLayout ? 'Edit Layout &amp; Labels' : 'Define Plate Layout'}
              </button>
              {hasLayout && (
                <button
                  type="button"
                  onClick={() => {
                    setHasLayout(false);
                    setLayoutAnnotations({});
                    setLabelOverrides({});
                    set({ displayMode: 'raw' });
                    flashToast('Plate converted to unannotated raw mode');
                  }}
                  class="py-1.5 px-2.5 rounded-lg border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-medium dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  Clear Layout
                </button>
              )}
            </div>
          </div>

          {/* Normalization Mode & Scientific Min/Max References */}
          <div class="rounded-xl border border-slate-200 bg-white p-3.5 shadow-xs dark:border-slate-800 dark:bg-slate-900 space-y-3">
            <span class="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300">
              Normalization Engine
            </span>

            <div class="grid grid-cols-1 gap-1 text-xs">
              {[
                { id: 'percent-control', label: '% of Control (POC)', formula: '100 × (val - min) / (max - min)', icon: '📈' },
                { id: 'percent-inhibition', label: '% Inhibition (NPI)', formula: '100 × [1 - (val - min) / (max - min)]', icon: '⚡' },
                { id: 'blank-subtracted', label: 'Blank Subtracted', formula: 'val - blank_mean', icon: '🧪' },
                { id: 'fold-change', label: 'Fold Change', formula: '(val - blank) / (control - blank)', icon: '🔄' },
                { id: 'raw', label: 'Raw Optical Density / RLU', formula: 'No normalization (Direct raw signal)', icon: '📊' },
              ].map(m => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => set({ normalizationMode: m.id as NormalizationMode })}
                  class={`flex items-start gap-2 p-2 rounded-lg text-left transition border ${s.normalizationMode === m.id ? 'border-accent-500 bg-accent-50/80 text-accent-900 dark:border-accent-600 dark:bg-accent-950/40 dark:text-accent-200' : 'border-transparent hover:bg-slate-100 dark:hover:bg-slate-800/60 text-slate-700 dark:text-slate-300'}`}
                >
                  <span class="text-sm mt-0.5">{m.icon}</span>
                  <div class="min-w-0 flex-1">
                    <div class="font-semibold">{m.label}</div>
                    <div class="text-[10px] text-slate-500 dark:text-slate-400 font-mono truncate">{m.formula}</div>
                  </div>
                </button>
              ))}
            </div>

            {/* Expanded Min/Max Reference Controls */}
            {s.normalizationMode !== 'raw' && (
              <div class="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-2.5 text-xs">
                <span class="block font-bold text-[11px] uppercase tracking-wider text-slate-600 dark:text-slate-400">
                  Reference Controls Selection
                </span>

                {/* Blank Subtraction Method */}
                <div>
                  <label class="block text-slate-600 dark:text-slate-400 mb-1">Blank Reference (0-Signal)</label>
                  <select
                    value={s.blankMethod}
                    onChange={(e) => set({ blankMethod: (e.target as HTMLSelectElement).value as State['blankMethod'] })}
                    class="w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-800"
                  >
                    <option value="global">Global Blank Wells Mean ({blankMean.toFixed(3)})</option>
                    <option value="row">Row-Specific Blanks</option>
                    <option value="column">Column-Specific Blanks</option>
                    <option value="wells">Custom Selected Wells ({customBlankWells.size} wells)</option>
                    <option value="none">No Blank Subtraction</option>
                  </select>
                </div>

                {/* Min Baseline Reference */}
                <div>
                  <label class="block text-slate-600 dark:text-slate-400 mb-1">0% / Baseline Reference (Min)</label>
                  <div class="flex gap-2">
                    <select
                      value={s.minMethod}
                      onChange={(e) => set({ minMethod: (e.target as HTMLSelectElement).value as State['minMethod'] })}
                      class="flex-1 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-800"
                    >
                      <option value="blank">Blank Wells Mean ({blankMean.toFixed(3)})</option>
                      <option value="neg-ctrl">Negative Control Mean ({negMean.toFixed(3)})</option>
                      <option value="lowest">Lowest Plate Value ({minVal.toFixed(3)})</option>
                      <option value="wells">Custom Selected Wells ({customMinWells.size} wells)</option>
                      <option value="custom">Fixed Numeric Value</option>
                    </select>
                    {s.minMethod === 'custom' && (
                      <input
                        type="number"
                        step="any"
                        value={s.customMinValue}
                        onChange={(e) => set({ customMinValue: parseFloat((e.target as HTMLInputElement).value) || 0 })}
                        class="w-20 rounded-md border border-slate-300 px-2 py-1 font-mono text-xs text-right dark:border-slate-700 dark:bg-slate-800"
                        placeholder="Min val"
                      />
                    )}
                  </div>
                </div>

                {/* Max Top Reference */}
                <div>
                  <label class="block text-slate-600 dark:text-slate-400 mb-1">100% / Top Reference (Max)</label>
                  <div class="flex gap-2">
                    <select
                      value={s.maxMethod}
                      onChange={(e) => set({ maxMethod: (e.target as HTMLSelectElement).value as State['maxMethod'] })}
                      class="flex-1 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-800"
                    >
                      <option value="pos-ctrl">Positive Control Mean ({posMean.toFixed(3)})</option>
                      <option value="highest">Highest Plate Value ({maxVal.toFixed(3)})</option>
                      <option value="wells">Custom Selected Wells ({customMaxWells.size} wells)</option>
                      <option value="custom">Fixed Numeric Value</option>
                    </select>
                    {s.maxMethod === 'custom' && (
                      <input
                        type="number"
                        step="any"
                        value={s.customMaxValue}
                        onChange={(e) => set({ customMaxValue: parseFloat((e.target as HTMLInputElement).value) || 100 })}
                        class="w-20 rounded-md border border-slate-300 px-2 py-1 font-mono text-xs text-right dark:border-slate-700 dark:bg-slate-800"
                        placeholder="Max val"
                      />
                    )}
                  </div>
                </div>

                {/* Live reference values */}
                <div class="pt-2 grid grid-cols-3 gap-1.5 text-center font-mono text-[11px]">
                  <div class="rounded-md bg-slate-50 p-1 dark:bg-slate-800">
                    <span class="block text-[9px] uppercase text-slate-500">Blank</span>
                    <span class="font-bold">{blankMean.toFixed(2)}</span>
                  </div>
                  <div class="rounded-md bg-slate-50 p-1 dark:bg-slate-800">
                    <span class="block text-[9px] uppercase text-slate-500">Min Ref</span>
                    <span class="font-bold">{minRef.toFixed(2)}</span>
                  </div>
                  <div class="rounded-md bg-emerald-50 p-1 dark:bg-emerald-950/40">
                    <span class="block text-[9px] uppercase text-emerald-600 dark:text-emerald-400">Max Ref</span>
                    <span class="font-bold text-emerald-700 dark:text-emerald-300">{maxRef.toFixed(2)}</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Quality Control & Outlier Testing */}
          <div class="rounded-xl border border-slate-200 bg-white p-3.5 shadow-xs dark:border-slate-800 dark:bg-slate-900 space-y-3">
            <span class="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300">
              QC &amp; Outlier Detection (Malo 2006)
            </span>

            <div class="space-y-2 text-xs">
              <div>
                <label class="block text-slate-600 dark:text-slate-400 mb-1">Outlier Method</label>
                <div class="grid grid-cols-4 gap-1 font-medium text-[11px]">
                  {(['grubbs', 'sd-cutoff', 'both', 'none'] as OutlierMethod[]).map(m => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => set({ outlierMethod: m })}
                      class={`py-1 px-1.5 rounded-lg border text-center transition ${s.outlierMethod === m ? 'border-accent-500 bg-accent-600 text-white shadow-xs' : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'}`}
                    >
                      {m === 'grubbs' ? "Grubbs'" : m === 'sd-cutoff' ? '> 2.5×SD' : m === 'both' ? 'Both' : 'Off'}
                    </button>
                  ))}
                </div>
              </div>

              <div class="flex items-center justify-between gap-3 pt-1">
                <div>
                  <label class="block text-slate-600 dark:text-slate-400">Replicate %CV Warning</label>
                  <span class="text-[10px] text-slate-400">Standard assay threshold 15%</span>
                </div>
                <div class="flex items-center gap-1">
                  <input
                    type="number"
                    min="1"
                    max="100"
                    step="any"
                    value={s.cvThreshold}
                    onChange={(e) => set({ cvThreshold: parseFloat((e.target as HTMLInputElement).value) || 15 })}
                    class="w-16 rounded-md border border-slate-300 px-2 py-1 text-right font-mono text-xs dark:border-slate-700 dark:bg-slate-800"
                  />
                  <span class="text-xs text-slate-500">%</span>
                </div>
              </div>

              <div class="pt-2 border-t border-slate-100 dark:border-slate-800">
                <label class="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={s.autoExcludeOutliers}
                    onChange={(e) => set({ autoExcludeOutliers: (e.target as HTMLInputElement).checked })}
                    class="rounded border-slate-300 text-accent-600 focus:ring-accent-500"
                  />
                  <span class="text-xs text-slate-700 dark:text-slate-300 font-medium">
                    Auto-exclude flagged outliers from group mean &amp; SD
                  </span>
                </label>
              </div>
            </div>
          </div>

        </div>
      }
      results={
        <div class="space-y-4">
          {/* Main Mode Toggle: Generator vs Plate Reader */}
          <div class="flex flex-wrap items-center justify-between gap-3 p-3 rounded-2xl bg-linear-to-r from-slate-100 to-indigo-50/40 dark:from-slate-800/80 dark:to-indigo-950/20 border border-slate-200 dark:border-slate-700 shadow-xs">
            <div class="inline-flex p-1 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 shadow-2xs">
              <button
                type="button"
                onClick={handleGoToGenerator}
                class="px-3.5 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-2 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100"
              >
                <span>🟦</span>
                <span>Plate Layout Generator</span>
              </button>
              <button
                type="button"
                class="px-3.5 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-2 bg-purple-600 text-white shadow-xs"
              >
                <span>📊</span>
                <span>Plate Reader Processor</span>
              </button>
            </div>

            <div class="flex items-center gap-2 text-xs">
              <span class="text-slate-500 font-medium">
                {externalLayoutAnnotations && Object.keys(externalLayoutAnnotations).length > 0 ? (
                  <span>Layout: <strong>{Object.keys(externalLayoutAnnotations).length} wells defined in Generator</strong></span>
                ) : (
                  <span>{hasLayout ? `${Object.keys(layoutAnnotations).length} wells annotated` : 'Raw Ingestion Mode'}</span>
                )}
              </span>
              <button
                type="button"
                onClick={handleGoToGenerator}
                class="px-3 py-1.5 rounded-xl border border-accent-300 dark:border-accent-700 bg-accent-50 dark:bg-accent-950/40 text-accent-700 dark:text-accent-300 font-bold hover:bg-accent-100 transition flex items-center gap-1 shadow-2xs"
              >
                <span>✏️</span> Return to Generator
              </button>
            </div>
          </div>

          {/* Assay QC Overview Dashboard Banner */}
          <div class="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            {/* Z'-Factor Card */}
            <div class="rounded-xl border border-slate-200 bg-white p-3 shadow-xs dark:border-slate-800 dark:bg-slate-900">
              <div class="flex items-center justify-between text-xs text-slate-500 mb-1">
                <span>Z'-Factor (HTS Window)</span>
                <span title="Zhang et al. 1999: >= 0.5 is an excellent screening assay">ℹ️</span>
              </div>
              <div class="flex items-baseline gap-2">
                <span class={`text-xl font-extrabold font-mono ${assayQc.zPrime !== null && assayQc.zPrime >= 0.5 ? 'text-emerald-600 dark:text-emerald-400' : assayQc.zPrime !== null && assayQc.zPrime >= 0 ? 'text-amber-600 dark:text-amber-400' : 'text-rose-600 dark:text-rose-400'}`}>
                  {assayQc.zPrime !== null ? assayQc.zPrime.toFixed(3) : 'N/A'}
                </span>
                {assayQc.zFactorInterpretation && (
                  <span class={`text-[10px] px-1.5 py-0.5 rounded-full font-bold uppercase ${assayQc.zFactorInterpretation === 'excellent' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' : assayQc.zFactorInterpretation === 'marginal' ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300' : 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'}`}>
                    {assayQc.zFactorInterpretation}
                  </span>
                )}
              </div>
            </div>

            {/* Signal-to-Background */}
            <div class="rounded-xl border border-slate-200 bg-white p-3 shadow-xs dark:border-slate-800 dark:bg-slate-900">
              <span class="block text-xs text-slate-500 mb-1">Signal-to-Background (S/B)</span>
              <span class="text-xl font-extrabold font-mono text-slate-800 dark:text-slate-100">
                {assayQc.signalToBackground !== null ? `${assayQc.signalToBackground.toFixed(1)}×` : 'N/A'}
              </span>
            </div>

            {/* Signal-to-Noise */}
            <div class="rounded-xl border border-slate-200 bg-white p-3 shadow-xs dark:border-slate-800 dark:bg-slate-900">
              <span class="block text-xs text-slate-500 mb-1">Signal-to-Noise (S/N)</span>
              <span class="text-xl font-extrabold font-mono text-slate-800 dark:text-slate-100">
                {assayQc.signalToNoise !== null ? assayQc.signalToNoise.toFixed(1) : 'N/A'}
              </span>
            </div>

            {/* Plate Mean %CV */}
            <div class="rounded-xl border border-slate-200 bg-white p-3 shadow-xs dark:border-slate-800 dark:bg-slate-900">
              <span class="block text-xs text-slate-500 mb-1">Plate Mean %CV</span>
              <div class="flex items-baseline gap-2">
                <span class={`text-xl font-extrabold font-mono ${assayQc.plateMeanCv !== null && assayQc.plateMeanCv <= s.cvThreshold ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>
                  {assayQc.plateMeanCv !== null ? `${assayQc.plateMeanCv.toFixed(1)}%` : 'N/A'}
                </span>
                {assayQc.outlierCount > 0 && (
                  <span class="text-[10px] px-1.5 py-0.5 rounded-full bg-rose-100 text-rose-800 font-bold dark:bg-rose-950 dark:text-rose-300">
                    {assayQc.outlierCount} Outlier{assayQc.outlierCount > 1 ? 's' : ''}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Navigation Tabs */}
          <div class="flex items-center justify-between border-b border-slate-200 pb-1.5 dark:border-slate-800">
            <div class="flex flex-wrap gap-1 text-xs font-semibold">
              {[
                { id: 'heatmap', label: '🗺️ Plate Heatmap' },
                { id: 'layout', label: '📐 Layout & Annotations' },
                { id: 'table', label: '📊 Replicate Statistics' },
                { id: 'elisa', label: '🧪 ELISA & Standard Curve' },
                { id: 'curve-fitting', label: '📈 Curve Fitting Export' },
                { id: 'qc', label: '🎯 HTS Screen QC' },
                { id: 'csv', label: '📋 CSV Matrix Export' },
              ].map(tab => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => set({ activeTab: tab.id as State['activeTab'] })}
                  class={`px-3 py-1.5 rounded-lg transition ${s.activeTab === tab.id ? 'bg-accent-600 text-white shadow-xs' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800'}`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {toastMsg && (
              <span role="status" class="text-xs font-medium text-accent-600 dark:text-accent-400 animate-pulse">
                {toastMsg}
              </span>
            )}
          </div>

          {/* TAB 1: INTERACTIVE PLATE HEATMAP GRID */}
          {s.activeTab === 'heatmap' && (
            <div class="space-y-3">
              {/* Heatmap Controls Bar */}
              <div class="flex flex-wrap items-center justify-between gap-2 p-2 rounded-xl bg-slate-50 dark:bg-slate-800/60 text-xs border border-slate-200 dark:border-slate-700">
                <div class="flex items-center gap-3">
                  <div class="flex items-center gap-1.5">
                    <span class="text-slate-500 font-medium">Display:</span>
                    <div class="inline-flex rounded-lg bg-slate-200 p-0.5 dark:bg-slate-700">
                      <button
                        type="button"
                        onClick={() => set({ displayMode: 'raw' })}
                        class={`px-2 py-0.5 rounded-md font-semibold ${s.displayMode === 'raw' ? 'bg-white shadow-xs text-slate-900 dark:bg-slate-900 dark:text-slate-100' : 'text-slate-500'}`}
                      >
                        Raw Signal
                      </button>
                      <button
                        type="button"
                        onClick={() => set({ displayMode: 'normalized' })}
                        class={`px-2 py-0.5 rounded-md font-semibold ${s.displayMode === 'normalized' ? 'bg-white shadow-xs text-slate-900 dark:bg-slate-900 dark:text-slate-100' : 'text-slate-500'}`}
                      >
                        Normalized
                      </button>
                    </div>
                  </div>

                  <div class="flex items-center gap-1.5">
                    <span class="text-slate-500 font-medium">Palette:</span>
                    <select
                      value={s.colorPalette}
                      onChange={(e) => set({ colorPalette: (e.target as HTMLSelectElement).value as State['colorPalette'] })}
                      class="rounded-md border border-slate-300 bg-white px-2 py-0.5 text-xs dark:border-slate-600 dark:bg-slate-800"
                    >
                      <option value="viridis">Viridis (Perceptually Uniform)</option>
                      <option value="plasma">Plasma (Vibrant High-Contrast)</option>
                      <option value="turbo">Turbo (Full Rainbow)</option>
                      <option value="blues">Blues (Absorbance Density)</option>
                    </select>
                  </div>

                  <div class="flex items-center gap-1.5">
                    <span class="text-slate-500 font-medium">Density:</span>
                    <div class="inline-flex rounded-lg bg-slate-200 p-0.5 dark:bg-slate-700">
                      <button
                        type="button"
                        onClick={() => setDensity('normal')}
                        class={`px-2 py-0.5 rounded-md font-semibold ${density === 'normal' ? 'bg-white shadow-xs text-slate-900 dark:bg-slate-900 dark:text-slate-100' : 'text-slate-500'}`}
                      >
                        Normal
                      </button>
                      <button
                        type="button"
                        onClick={() => setDensity('compact')}
                        class={`px-2 py-0.5 rounded-md font-semibold ${density === 'compact' ? 'bg-white shadow-xs text-slate-900 dark:bg-slate-900 dark:text-slate-100' : 'text-slate-500'}`}
                      >
                        Compact
                      </button>
                    </div>
                  </div>

                  {onSwitchToGenerator && (
                    <button
                      type="button"
                      onClick={onSwitchToGenerator}
                      class="px-2.5 py-1 rounded-lg border border-accent-300 dark:border-accent-700 bg-accent-50 dark:bg-accent-950/40 text-accent-700 dark:text-accent-300 font-bold hover:bg-accent-100 transition flex items-center gap-1"
                      title="Open Layout Generator to edit plate arrangement"
                    >
                      <span>✏️</span> Generator
                    </button>
                  )}
                </div>

                {/* Heatmap Legend */}
                <div class="flex items-center gap-2">
                  <span class="font-mono text-[11px] text-slate-500">{minVal.toFixed(2)}</span>
                  <div
                    class="h-3 w-28 rounded-sm shadow-inner"
                    style={{
                      background:
                        s.colorPalette === 'plasma'
                          ? 'linear-gradient(to right, #0d0887, #6a00a8, #b12a90, #e16462, #fca636, #f0f921)'
                          : s.colorPalette === 'turbo'
                          ? 'linear-gradient(to right, #30123b, #4145ab, #467dfa, #1ae4b6, #a2fc3c, #faba39, #e4460a, #7a0403)'
                          : s.colorPalette === 'blues'
                          ? 'linear-gradient(to right, #f7fbff, #6baed6, #08519c)'
                          : 'linear-gradient(to right, #440154, #3b528b, #21918c, #5ec962, #fde725)',
                    }}
                  />
                  <span class="font-mono text-[11px] text-slate-500">{maxVal.toFixed(2)}</span>
                </div>
              </div>

              {/* Live Hover Readout Bar */}
              <div class="h-8 min-h-[32px] flex items-center px-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/60 text-xs font-mono transition-colors">
                {hoveredWell ? (
                  <div class="flex items-center gap-2 truncate">
                    <span class="font-bold text-accent-600 dark:text-accent-400">{hoveredWell.id}</span>
                    <span class="text-slate-400">|</span>
                    <span class="text-slate-800 dark:text-slate-200 truncate">{hoveredWell.sampleName || 'Unassigned'}</span>
                    {hoveredWell.raw !== null && hoveredWell.raw !== undefined && (
                      <span class="text-slate-500 font-semibold">
                        Raw: {hoveredWell.raw.toFixed(2)}
                      </span>
                    )}
                    {hoveredWell.normalized !== null && hoveredWell.normalized !== undefined && (
                      <span class="text-emerald-600 dark:text-emerald-400 font-semibold">
                        ({hoveredWell.normalized.toFixed(1)}%)
                      </span>
                    )}
                    {hoveredWell.concentration !== undefined && (
                      <span class="text-slate-500">
                        [{hoveredWell.concentration} {hoveredWell.concentrationUnit || ''}]
                      </span>
                    )}
                    {hoveredWell.isOutlier && (
                      <span class="text-rose-600 dark:text-rose-400 font-bold">
                        ⚠️ OUTLIER
                      </span>
                    )}
                  </div>
                ) : (
                  <span class="text-slate-400 text-xs italic">
                    Hover over any well for live signal readout • Click well to inspect &amp; exclude
                  </span>
                )}
              </div>

              {/* Selected Well Inspector Card */}
              {selectedWell && (
                <div class="rounded-xl border border-sky-200 dark:border-sky-800 bg-sky-50/50 dark:bg-sky-950/30 p-3.5 shadow-xs text-xs space-y-2.5 transition">
                  <div class="flex flex-wrap items-center justify-between gap-3">
                    <div class="flex items-center gap-3">
                      <div
                        class="flex h-10 w-10 items-center justify-center rounded-xl font-mono text-base font-black border border-black/10 shadow-xs"
                        style={{
                          backgroundColor: selectedGroup ? selectedGroup.color : '#e2e8f0',
                          color: selectedGroup ? getContrastingTextColor(selectedGroup.color) : '#64748b',
                        }}
                      >
                        {selectedWell.id}
                      </div>
                      <div>
                        <div class="flex items-center gap-2">
                          <span class="font-bold text-sm text-slate-800 dark:text-slate-100">
                            {selectedWell.sampleName || 'Unassigned Well'}
                          </span>
                          <span class="text-[11px] text-slate-500 font-mono">
                            (Row {selectedWell.row}, Col {selectedWell.col})
                          </span>
                          {selectedGroup && (
                            <span
                              class="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase"
                              style={{ backgroundColor: `${selectedGroup.color}25`, color: selectedGroup.color }}
                            >
                              {selectedGroup.type}
                            </span>
                          )}
                          {selectedWell.isOutlier && (
                            <span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300">
                              ⚠️ Outlier
                            </span>
                          )}
                          {selectedWell.isExcluded && (
                            <span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-300">
                              ✕ Excluded
                            </span>
                          )}
                        </div>
                        <div class="text-slate-500 font-mono mt-0.5 flex flex-wrap gap-3">
                          <span>Raw Signal: <strong>{selectedWell.raw ?? 'N/A'}</strong></span>
                          <span>Normalized: <strong>{selectedWell.normalized !== null ? `${selectedWell.normalized.toFixed(2)}%` : 'N/A'}</strong></span>
                          {selectedWell.concentration !== undefined && (
                            <span>Conc: <strong>{selectedWell.concentration} {selectedWell.concentrationUnit || ''}</strong></span>
                          )}
                          {selectedWell.dilutionFactor && selectedWell.dilutionFactor > 1 && (
                            <span>Dilution: <strong>{selectedWell.dilutionFactor}×</strong></span>
                          )}
                          {selectedGroupStats && (
                            <span>Group %CV: <strong>{selectedGroupStats.cv.toFixed(1)}%</strong></span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div class="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleToggleExclude(selectedWell.id)}
                        class={`px-3 py-1.5 rounded-lg font-semibold transition shadow-2xs ${selectedWell.isExcluded ? 'bg-emerald-600 text-white hover:bg-emerald-700' : 'bg-rose-100 text-rose-800 hover:bg-rose-200 dark:bg-rose-950 dark:text-rose-300'}`}
                      >
                        {selectedWell.isExcluded ? 'Include Well in Statistics' : 'Exclude Well'}
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          const next = new Set(customBlankWells);
                          if (next.has(selectedWell.id)) next.delete(selectedWell.id);
                          else next.add(selectedWell.id);
                          setCustomBlankWells(next);
                          set({ blankMethod: 'wells' });
                          flashToast(`Well ${selectedWell.id} set as custom blank`);
                        }}
                        class={`px-2.5 py-1.5 rounded-lg border text-xs font-semibold transition ${customBlankWells.has(selectedWell.id) ? 'bg-slate-800 text-white dark:bg-slate-200 dark:text-slate-900' : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200'}`}
                      >
                        {customBlankWells.has(selectedWell.id) ? '✓ Blank Ref' : '+ Set Blank'}
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          const next = new Set(customMinWells);
                          if (next.has(selectedWell.id)) next.delete(selectedWell.id);
                          else next.add(selectedWell.id);
                          setCustomMinWells(next);
                          set({ minMethod: 'wells' });
                          flashToast(`Well ${selectedWell.id} set as custom min (0%) reference`);
                        }}
                        class={`px-2.5 py-1.5 rounded-lg border text-xs font-semibold transition ${customMinWells.has(selectedWell.id) ? 'bg-slate-800 text-white dark:bg-slate-200 dark:text-slate-900' : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200'}`}
                      >
                        {customMinWells.has(selectedWell.id) ? '✓ Min (0%)' : '+ Set Min'}
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          const next = new Set(customMaxWells);
                          if (next.has(selectedWell.id)) next.delete(selectedWell.id);
                          else next.add(selectedWell.id);
                          setCustomMaxWells(next);
                          set({ maxMethod: 'wells' });
                          flashToast(`Well ${selectedWell.id} set as custom max (100%) reference`);
                        }}
                        class={`px-2.5 py-1.5 rounded-lg border text-xs font-semibold transition ${customMaxWells.has(selectedWell.id) ? 'bg-emerald-700 text-white dark:bg-emerald-400 dark:text-slate-900' : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200'}`}
                      >
                        {customMaxWells.has(selectedWell.id) ? '✓ Max (100%)' : '+ Set Max'}
                      </button>

                      <button
                        type="button"
                        onClick={() => setSelectedWellId(null)}
                        class="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition"
                        title="Dismiss Inspector"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Main Plate Heatmap via Unified PlateChassis */}
              <PlateChassis
                format={parsedPlate.format}
                rows={parsedPlate.rows.length}
                cols={parsedPlate.cols.length}
                rowLabels={parsedPlate.rows}
                density={density}
                selectedWellId={selectedWellId}
                onWellClick={(wellId) => setSelectedWellId(wellId)}
                onWellMouseEnter={(rIdx, colNum) => {
                  const rowChar = parsedPlate.rows[rIdx];
                  if (rowChar) {
                    setHoveredWellId(`${rowChar}${colNum}`);
                  }
                }}
                onWellMouseLeave={() => setHoveredWellId(null)}
                title={`ANSI / SLAS 1-2004 Microplate · ${parsedPlate.format} Wells`}
                subtitle={`${parsedPlate.rows.length} × ${parsedPlate.cols.length} Grid · ${parsedPlate.wells.length} Wells Recorded`}
                getWellData={(wellId) => {
                  const well = normalizedWells[wellId];
                  const val = s.displayMode === 'normalized' ? well?.normalized : well?.raw;
                  const bgColor = getWellColor(val);
                  const textColor = getContrastingTextColor(bgColor);
                  const isOutlier = !!well?.isOutlier;
                  const isExcluded = !!well?.isExcluded;

                  return {
                    id: wellId,
                    row: wellId.charAt(0),
                    col: parseInt(wellId.slice(1), 10),
                    bgColor: isExcluded ? '#cbd5e1' : bgColor,
                    textColor: isExcluded ? '#475569' : textColor,
                    isSelected: selectedWellId === wellId,
                    isOutlier,
                    isExcluded,
                    topLabel: wellId,
                    midLabel: val !== null && val !== undefined ? (is384 ? val.toFixed(0) : val.toFixed(2)) : '—',
                    botLabel: well?.sampleName ? well.sampleName.slice(0, 7) : '',
                    title: `Well ${wellId}: ${well?.sampleName || 'Unassigned'} | Raw: ${well?.raw ?? 'N/A'} | Norm: ${well?.normalized ?? 'N/A'}${isOutlier ? ' (OUTLIER)' : ''}`,
                  };
                }}
              />
            </div>
          )}

          {/* TAB 2: PLATE LAYOUT DEFINITION & ANNOTATIONS */}
          {s.activeTab === 'layout' && (
            <div class="space-y-4">
              {/* Layout Ingestion Section */}
              <div class="rounded-xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900 space-y-3">
                <div class="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 class="font-bold text-sm text-slate-800 dark:text-slate-100">
                      1. Upload or Paste Annotation Matrix (96/384 Format or 2-Col List)
                    </h3>
                    <p class="text-xs text-slate-500 dark:text-slate-400">
                      Supply well assignments matching your plate format (8×12 or 16×24 grid) or a 2-column CSV (Well, Label).
                    </p>
                  </div>

                  <div class="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => layoutFileInputRef.current?.click()}
                      class="px-3 py-1.5 rounded-lg bg-accent-50 text-accent-700 border border-accent-200 hover:bg-accent-100 text-xs font-bold dark:bg-accent-950/40 dark:border-accent-800 dark:text-accent-300"
                    >
                      📂 Upload Layout CSV
                    </button>
                    <input
                      ref={layoutFileInputRef}
                      type="file"
                      accept=".csv,.tsv,.txt"
                      onChange={handleLayoutFileUpload}
                      class="hidden"
                    />

                    <button
                      type="button"
                      onClick={handleApplyPastedLayout}
                      class="px-3 py-1.5 rounded-lg bg-accent-600 hover:bg-accent-700 text-white text-xs font-bold transition shadow-xs"
                    >
                      Apply Layout
                    </button>
                  </div>
                </div>

                <textarea
                  rows={4}
                  value={layoutText}
                  onInput={(e) => setLayoutText((e.target as HTMLTextAreaElement).value)}
                  placeholder="Paste 8x12 grid of labels (e.g. Blank, Std 1000, Std 500, Sample 1, Pos Ctrl) or list CSV..."
                  class="w-full rounded-lg border border-slate-300 p-2.5 font-mono text-xs leading-snug dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                />
              </div>

              {/* Detected Labels Mapping Table */}
              {detectedLabels.length > 0 && (
                <div class="rounded-xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900 space-y-3">
                  <div class="flex items-center justify-between">
                    <div>
                      <h3 class="font-bold text-sm text-slate-800 dark:text-slate-100">
                        2. Detected Labels &amp; Role Assignments
                      </h3>
                      <p class="text-xs text-slate-500 dark:text-slate-400">
                        Select role (Blank, Standard, Controls, Samples), enter nominal concentrations, and set dilution factors.
                      </p>
                    </div>
                    <span class="text-xs font-mono text-slate-500">
                      {detectedLabels.length} unique labels detected
                    </span>
                  </div>

                  <div class="overflow-x-auto">
                    <table class="w-full text-left text-xs">
                      <thead class="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold dark:bg-slate-800/80 dark:border-slate-700 dark:text-slate-300">
                        <tr>
                          <th class="p-2">Detected Label</th>
                          <th class="p-2 text-center">Wells</th>
                          <th class="p-2">Role / Type</th>
                          <th class="p-2">Nominal Conc</th>
                          <th class="p-2">Unit</th>
                          <th class="p-2">Dilution Factor</th>
                        </tr>
                      </thead>
                      <tbody class="divide-y divide-slate-100 dark:divide-slate-800 font-mono">
                        {detectedLabels.map(item => (
                          <tr key={item.label} class="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                            <td class="p-2 font-sans font-bold text-slate-800 dark:text-slate-200">
                              {item.label}
                            </td>
                            <td class="p-2 text-center text-slate-500">
                              {item.count}
                            </td>
                            <td class="p-2">
                              <select
                                value={item.currentRole}
                                onChange={(e) => handleUpdateLabelOverride(item.label, { role: (e.target as HTMLSelectElement).value as SampleType })}
                                class="rounded border border-slate-300 bg-white px-2 py-1 text-xs font-sans dark:border-slate-700 dark:bg-slate-800"
                              >
                                <option value="sample">Sample</option>
                                <option value="blank">Blank (Background)</option>
                                <option value="standard">Standard (Calibrator)</option>
                                <option value="pos-ctrl">Positive Control</option>
                                <option value="neg-ctrl">Negative Control</option>
                                <option value="empty">Empty Well</option>
                              </select>
                            </td>
                            <td class="p-2">
                              <input
                                type="number"
                                step="any"
                                value={item.conc !== undefined ? item.conc : ''}
                                placeholder="e.g. 1000"
                                onChange={(e) => {
                                  const val = (e.target as HTMLInputElement).value.trim();
                                  handleUpdateLabelOverride(item.label, { concentration: val !== '' ? parseFloat(val) : undefined });
                                }}
                                class="w-24 rounded border border-slate-300 px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-800"
                              />
                            </td>
                            <td class="p-2">
                              <input
                                type="text"
                                value={item.unit || ''}
                                placeholder="pg/mL"
                                onChange={(e) => handleUpdateLabelOverride(item.label, { unit: (e.target as HTMLInputElement).value })}
                                class="w-20 rounded border border-slate-300 px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-800"
                              />
                            </td>
                            <td class="p-2">
                              <input
                                type="number"
                                min="1"
                                step="any"
                                value={item.dilution || 1}
                                onChange={(e) => {
                                  const val = parseFloat((e.target as HTMLInputElement).value);
                                  handleUpdateLabelOverride(item.label, { dilutionFactor: !isNaN(val) && val > 0 ? val : 1 });
                                }}
                                class="w-20 rounded border border-slate-300 px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-800"
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Visual Plate Painter & Multi-Well Assignment */}
              <div class="rounded-xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900 space-y-3">
                <div class="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 class="font-bold text-sm text-slate-800 dark:text-slate-100">
                      3. Interactive Visual Plate Painter
                    </h3>
                    <p class="text-xs text-slate-500 dark:text-slate-400">
                      Click wells or row/col headers to select, then assign roles, concentrations, or generate serial dilutions.
                    </p>
                  </div>

                  <div class="flex items-center gap-1.5 text-xs font-semibold">
                    {onSwitchToGenerator && (
                      <button
                        type="button"
                        onClick={onSwitchToGenerator}
                        class="px-2.5 py-1 rounded-md bg-accent-50 text-accent-700 dark:bg-accent-950/50 dark:text-accent-300 border border-accent-300 dark:border-accent-700 hover:bg-accent-100 transition"
                      >
                        ✏️ Full Generator
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={handleSelectAll}
                      class="px-2.5 py-1 rounded-md border border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
                    >
                      Select All
                    </button>
                    <button
                      type="button"
                      onClick={handleClearSelection}
                      class="px-2.5 py-1 rounded-md border border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
                    >
                      Clear ({selectedWells.size})
                    </button>
                  </div>
                </div>

                {/* Painter Toolbar */}
                <div class="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 flex flex-wrap items-center justify-between gap-3 text-xs">
                  <div class="flex flex-wrap items-center gap-3">
                    <div>
                      <span class="block text-slate-500 text-[10px] uppercase font-bold mb-1">Role</span>
                      <select
                        value={painterRole}
                        onChange={(e) => setPainterRole((e.target as HTMLSelectElement).value as SampleType)}
                        class="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-800"
                      >
                        <option value="sample">Sample</option>
                        <option value="blank">Blank</option>
                        <option value="standard">Standard</option>
                        <option value="pos-ctrl">Pos Ctrl</option>
                        <option value="neg-ctrl">Neg Ctrl</option>
                        <option value="empty">Empty</option>
                      </select>
                    </div>

                    <div>
                      <span class="block text-slate-500 text-[10px] uppercase font-bold mb-1">Label / Group</span>
                      <input
                        type="text"
                        value={painterLabel}
                        onChange={(e) => setPainterLabel((e.target as HTMLInputElement).value)}
                        placeholder="Sample A"
                        class="w-28 rounded-md border border-slate-300 px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-800"
                      />
                    </div>

                    <div>
                      <span class="block text-slate-500 text-[10px] uppercase font-bold mb-1">Conc</span>
                      <input
                        type="number"
                        step="any"
                        value={painterConc}
                        onChange={(e) => setPainterConc((e.target as HTMLInputElement).value)}
                        placeholder="Conc"
                        class="w-20 rounded-md border border-slate-300 px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-800"
                      />
                    </div>

                    <div>
                      <span class="block text-slate-500 text-[10px] uppercase font-bold mb-1">Unit</span>
                      <input
                        type="text"
                        value={painterUnit}
                        onChange={(e) => setPainterUnit((e.target as HTMLInputElement).value)}
                        placeholder="µM"
                        class="w-16 rounded-md border border-slate-300 px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-800"
                      />
                    </div>

                    <div>
                      <span class="block text-slate-500 text-[10px] uppercase font-bold mb-1">Dilution</span>
                      <input
                        type="number"
                        min="1"
                        step="any"
                        value={painterDilution}
                        onChange={(e) => setPainterDilution((e.target as HTMLInputElement).value)}
                        placeholder="1"
                        class="w-16 rounded-md border border-slate-300 px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-800"
                      />
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handlePaintSelectedWells}
                    class="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold transition shadow-xs"
                  >
                    🎨 Paint Selected Wells ({selectedWells.size})
                  </button>
                </div>

                {/* Serial Dilution Wizard Accordion */}
                <div class="p-3 rounded-lg bg-purple-50/60 dark:bg-purple-950/20 border border-purple-200 dark:border-purple-900/40 text-xs space-y-2">
                  <div class="flex items-center justify-between">
                    <span class="font-bold text-purple-900 dark:text-purple-300 flex items-center gap-1.5">
                      <span>⚡</span>
                      <span>Serial Dilution Generator Wizard</span>
                    </span>
                    <span class="text-[11px] text-purple-700 dark:text-purple-400">
                      Calculates geometric concentrations across selected wells
                    </span>
                  </div>

                  <div class="flex flex-wrap items-center gap-3 pt-1">
                    <div>
                      <span class="block text-slate-500 text-[10px] uppercase font-bold mb-1">Start Conc</span>
                      <input
                        type="number"
                        step="any"
                        value={dilutionStartConc}
                        onChange={(e) => setDilutionStartConc(parseFloat((e.target as HTMLInputElement).value) || 1000)}
                        class="w-24 rounded-md border border-slate-300 px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-800"
                      />
                    </div>

                    <div>
                      <span class="block text-slate-500 text-[10px] uppercase font-bold mb-1">Dilution Factor</span>
                      <select
                        value={dilutionFactor}
                        onChange={(e) => setDilutionFactor(parseFloat((e.target as HTMLSelectElement).value) || 2)}
                        class="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-800"
                      >
                        <option value="2">2-Fold (1:2)</option>
                        <option value="3">3-Fold (1:3)</option>
                        <option value="4">4-Fold (1:4)</option>
                        <option value="5">5-Fold (1:5)</option>
                        <option value="10">10-Fold (1:10)</option>
                      </select>
                    </div>

                    <div>
                      <span class="block text-slate-500 text-[10px] uppercase font-bold mb-1">Role</span>
                      <select
                        value={dilutionRole}
                        onChange={(e) => setDilutionRole((e.target as HTMLSelectElement).value as SampleType)}
                        class="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-800"
                      >
                        <option value="standard">Standard Curve (Calibrator)</option>
                        <option value="sample">Sample Dose-Response</option>
                      </select>
                    </div>

                    <div>
                      <span class="block text-slate-500 text-[10px] uppercase font-bold mb-1">Unit</span>
                      <input
                        type="text"
                        value={dilutionUnit}
                        onChange={(e) => setDilutionUnit((e.target as HTMLInputElement).value)}
                        placeholder="pg/mL"
                        class="w-20 rounded-md border border-slate-300 px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-800"
                      />
                    </div>

                    <button
                      type="button"
                      onClick={handleExecuteSerialDilution}
                      class="mt-4 px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-700 text-white font-bold transition shadow-xs"
                    >
                      Generate Series on Selected Wells
                    </button>
                  </div>
                </div>

                {/* Visual Painter Grid via PlateChassis */}
                <PlateChassis
                  format={parsedPlate.format}
                  rows={parsedPlate.rows.length}
                  cols={parsedPlate.cols.length}
                  rowLabels={parsedPlate.rows}
                  density="compact"
                  title={`Layout Annotation Painter · ${parsedPlate.format}-Well Plate`}
                  subtitle={`${selectedWells.size} Wells Selected`}
                  headerRight={
                    <div class="flex items-center gap-2">
                      {onSwitchToGenerator && (
                        <button
                          type="button"
                          onClick={onSwitchToGenerator}
                          class="px-2.5 py-0.5 rounded-md bg-accent-600 hover:bg-accent-700 text-white text-[11px] font-bold shadow-2xs transition flex items-center gap-1"
                        >
                          <span>✏️</span> Generator
                        </button>
                      )}
                      {onSyncLayoutToGenerator && (
                        <button
                          type="button"
                          onClick={() => onSyncLayoutToGenerator(layoutAnnotations)}
                          class="px-2.5 py-0.5 rounded-md border border-slate-400 dark:border-slate-600 text-[11px] font-bold hover:bg-slate-200 dark:hover:bg-slate-700 transition flex items-center gap-1"
                        >
                          <span>🔄</span> Sync to Generator
                        </button>
                      )}
                    </div>
                  }
                  onRowClick={handleSelectRow}
                  onColClick={handleSelectCol}
                  onWellClick={handleToggleWellSelection}
                  getWellData={(wellId) => {
                    const well = assignedWells[wellId];
                    const isSelected = selectedWells.has(wellId);
                    const role = well?.sampleType || 'unassigned';

                    let roleBg = '#f1f5f9';
                    if (role === 'blank') roleBg = '#cbd5e1';
                    else if (role === 'pos-ctrl') roleBg = '#a7f3d0';
                    else if (role === 'neg-ctrl') roleBg = '#bae6fd';
                    else if (role === 'standard') roleBg = '#e9d5ff';
                    else if (role === 'sample') roleBg = '#fef08a';

                    return {
                      id: wellId,
                      row: wellId.charAt(0),
                      col: parseInt(wellId.slice(1), 10),
                      bgColor: roleBg,
                      textColor: 'text-slate-900 font-bold',
                      isSelected,
                      topLabel: wellId,
                      midLabel: well?.sampleName ? well.sampleName.slice(0, 5) : role === 'unassigned' ? '—' : role,
                      title: `Well ${wellId}: ${well?.sampleName || role}`,
                    };
                  }}
                />
              </div>
            </div>
          )}

          {/* TAB 2: GROUP REPLICATE STATISTICS TABLE */}
          {s.activeTab === 'table' && (
            <div class="space-y-3">
              <div class="flex items-center justify-between">
                <span class="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  Replicate Summary ({groupStats.length} groups)
                </span>
                <button
                  type="button"
                  onClick={async () => {
                    await navigator.clipboard.writeText(exportSummaryCsv(groupStats));
                    flashToast('Summary table CSV copied');
                  }}
                  class="px-2.5 py-1 rounded-lg border border-slate-300 hover:bg-slate-50 text-xs font-semibold dark:border-slate-700 dark:hover:bg-slate-800"
                >
                  📋 Copy Summary CSV
                </button>
              </div>

              <div class="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-xs dark:border-slate-800 dark:bg-slate-900">
                <table class="w-full text-left text-xs">
                  <thead class="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold dark:bg-slate-800/80 dark:border-slate-700 dark:text-slate-300">
                    <tr>
                      <th class="p-2.5">Sample / Group</th>
                      <th class="p-2.5">Type</th>
                      <th class="p-2.5 text-center">N (Valid)</th>
                      <th class="p-2.5 text-right">Mean ± SD</th>
                      <th class="p-2.5 text-right">SEM</th>
                      <th class="p-2.5 text-right">%CV</th>
                      <th class="p-2.5 text-right">Median [Min - Max]</th>
                      <th class="p-2.5 text-center">QC Status</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-slate-100 dark:divide-slate-800 font-mono">
                    {groupStats.map(g => (
                      <tr key={g.groupId} class="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                        <td class="p-2.5 font-medium flex items-center gap-2">
                          <span class="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: g.color }} />
                          <span class="font-sans font-bold text-slate-800 dark:text-slate-200">{g.groupName}</span>
                        </td>
                        <td class="p-2.5">
                          <span class="font-sans text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                            {g.sampleType}
                          </span>
                        </td>
                        <td class="p-2.5 text-center">
                          {g.nValid} / {g.nTotal}
                        </td>
                        <td class="p-2.5 text-right font-bold">
                          {g.mean.toFixed(3)} ± {g.sd.toFixed(3)}
                        </td>
                        <td class="p-2.5 text-right text-slate-500">
                          {g.sem.toFixed(3)}
                        </td>
                        <td class="p-2.5 text-right">
                          <span class={`px-1.5 py-0.5 rounded-md font-bold ${g.cv <= s.cvThreshold ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300' : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'}`}>
                            {g.cv.toFixed(1)}%
                          </span>
                        </td>
                        <td class="p-2.5 text-right text-slate-500 text-[11px]">
                          {g.median.toFixed(2)} [{g.min.toFixed(2)} - {g.max.toFixed(2)}]
                        </td>
                        <td class="p-2.5 text-center font-sans">
                          <span class={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${g.qcFlags.status === 'pass' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' : g.qcFlags.status === 'warning' ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300' : 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'}`}>
                            {g.qcFlags.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 4: ELISA STANDARD CURVE & QUANTIFICATION */}
          {s.activeTab === 'elisa' && (
            <div class="space-y-4">
              {standardCurve && standardCurve.hasStandards ? (
                <>
                  {/* Standard Curve Fit Overview Banner */}
                  <div class="rounded-xl border border-purple-200 bg-purple-50/50 p-4 shadow-xs dark:border-purple-900/50 dark:bg-purple-950/20 flex flex-wrap items-center justify-between gap-4">
                    <div>
                      <div class="flex items-center gap-2">
                        <span class="text-xl">🧬</span>
                        <h3 class="font-bold text-sm text-purple-950 dark:text-purple-200">
                          ELISA Standard Calibration Curve ({standardCurve.fitType.toUpperCase()})
                        </h3>
                      </div>
                      <p class="text-xs text-purple-800 dark:text-purple-300 mt-1 font-mono">
                        Equation: <strong>{standardCurve.equation}</strong>
                      </p>
                    </div>

                    <div class="flex items-center gap-3">
                      <div class="rounded-lg bg-white px-3 py-1.5 text-center shadow-xs border border-purple-200 dark:bg-slate-900 dark:border-purple-800">
                        <span class="block text-[10px] uppercase font-bold text-slate-500">R² Fit Quality</span>
                        <span class={`font-mono text-base font-extrabold ${standardCurve.rSquared >= 0.99 ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>
                          {standardCurve.rSquared.toFixed(4)}
                        </span>
                      </div>

                      <button
                        type="button"
                        onClick={async () => {
                          const csv = exportQuantifiedSamplesCsv(standardCurve);
                          await navigator.clipboard.writeText(csv);
                          flashToast('Quantified ELISA samples CSV copied');
                        }}
                        class="px-3 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs transition shadow-xs flex items-center gap-1.5"
                      >
                        <span>📋</span>
                        <span>Copy ELISA CSV</span>
                      </button>
                    </div>
                  </div>

                  {/* Standards Curve Calibration Table */}
                  <div class="rounded-xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900 space-y-2">
                    <h4 class="font-bold text-xs uppercase tracking-wider text-slate-700 dark:text-slate-300">
                      Standard Curve Calibrators ({standardCurve.points.length} Levels)
                    </h4>
                    <div class="overflow-x-auto">
                      <table class="w-full text-left text-xs">
                        <thead class="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold dark:bg-slate-800/80 dark:border-slate-700 dark:text-slate-300">
                          <tr>
                            <th class="p-2">Standard Level</th>
                            <th class="p-2 text-right">Nominal Conc</th>
                            <th class="p-2 text-center">N (Replicates)</th>
                            <th class="p-2 text-right">Mean Raw OD</th>
                            <th class="p-2 text-right">Blank-Subtracted OD</th>
                            <th class="p-2 text-right">%CV</th>
                          </tr>
                        </thead>
                        <tbody class="divide-y divide-slate-100 dark:divide-slate-800 font-mono">
                          {standardCurve.points.map((pt, idx) => (
                            <tr key={idx} class="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                              <td class="p-2 font-sans font-bold text-slate-800 dark:text-slate-200">
                                Standard {idx + 1}
                              </td>
                              <td class="p-2 text-right font-bold text-purple-700 dark:text-purple-300">
                                {pt.concentration} {standardCurve.unit}
                              </td>
                              <td class="p-2 text-center text-slate-500">
                                {pt.rawValues.length}
                              </td>
                              <td class="p-2 text-right">
                                {pt.meanSignal.toFixed(3)} ± {pt.sdSignal.toFixed(3)}
                              </td>
                              <td class="p-2 text-right font-bold">
                                {pt.meanSignal.toFixed(3)}
                              </td>
                              <td class="p-2 text-right">
                                <span class={`px-1.5 py-0.5 rounded-md font-bold ${pt.cvSignal <= s.cvThreshold ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300' : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'}`}>
                                  {pt.cvSignal.toFixed(1)}%
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Quantified Unknown Samples Table */}
                  <div class="rounded-xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900 space-y-2">
                    <div class="flex items-center justify-between">
                      <h4 class="font-bold text-xs uppercase tracking-wider text-slate-700 dark:text-slate-300">
                        Unknown Samples Quantified ({standardCurve.quantifiedSamples.length} Groups)
                      </h4>
                      <span class="text-[11px] text-slate-500">
                        Final Conc = Calculated Nominal × Dilution Factor
                      </span>
                    </div>

                    <div class="overflow-x-auto">
                      <table class="w-full text-left text-xs">
                        <thead class="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold dark:bg-slate-800/80 dark:border-slate-700 dark:text-slate-300">
                          <tr>
                            <th class="p-2">Sample ID</th>
                            <th class="p-2 text-center">N</th>
                            <th class="p-2 text-right">Raw OD</th>
                            <th class="p-2 text-right">Calculated Conc</th>
                            <th class="p-2 text-center">Dilution Factor</th>
                            <th class="p-2 text-right font-extrabold text-emerald-700 dark:text-emerald-300 text-sm">Final Adjusted Conc</th>
                            <th class="p-2 text-right">%CV</th>
                            <th class="p-2 text-center">Status</th>
                          </tr>
                        </thead>
                        <tbody class="divide-y divide-slate-100 dark:divide-slate-800 font-mono">
                          {standardCurve.quantifiedSamples.map(smp => (
                            <tr key={smp.groupId} class="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                              <td class="p-2 font-sans font-bold text-slate-800 dark:text-slate-200">
                                {smp.sampleName}
                              </td>
                              <td class="p-2 text-center text-slate-500">
                                {smp.n}
                              </td>
                              <td class="p-2 text-right">
                                {smp.meanSignal.toFixed(3)} ± {smp.sdSignal.toFixed(3)}
                              </td>
                              <td class="p-2 text-right">
                                {smp.calculatedConc !== null ? smp.calculatedConc.toFixed(2) : 'N/A'} {smp.unit}
                              </td>
                              <td class="p-2 text-center font-bold">
                                {smp.dilutionFactor}×
                              </td>
                              <td class="p-2 text-right font-extrabold text-emerald-700 dark:text-emerald-300 text-sm">
                                {smp.finalConc !== null ? smp.finalConc.toFixed(2) : 'N/A'} {smp.unit}
                              </td>
                              <td class="p-2 text-right">
                                <span class={`px-1.5 py-0.5 rounded-md font-bold ${(smp.concCv ?? smp.cvSignal) <= s.cvThreshold ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300' : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'}`}>
                                  {(smp.concCv ?? smp.cvSignal).toFixed(1)}%
                                </span>
                              </td>
                              <td class="p-2 text-center font-sans">
                                <span class={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${smp.status === 'in-range' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'}`}>
                                  {smp.status}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              ) : (
                <div class="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center dark:border-slate-700 dark:bg-slate-800/40 space-y-3">
                  <div class="text-3xl">🧬</div>
                  <h3 class="font-bold text-slate-700 dark:text-slate-200">
                    No ELISA Standards Detected
                  </h3>
                  <p class="text-xs text-slate-500 max-w-md mx-auto">
                    To compute an ELISA standard calibration curve, wells must be assigned role <strong>Standard</strong> with known nominal concentrations (e.g., 0 to 1000 pg/mL).
                  </p>
                  <div class="flex justify-center gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => loadPreset('elisa_96')}
                      class="px-3 py-1.5 rounded-lg bg-accent-600 hover:bg-accent-700 text-white text-xs font-bold transition"
                    >
                      Load ELISA 96 Demo Preset
                    </button>
                    <button
                      type="button"
                      onClick={() => set({ activeTab: 'layout' })}
                      class="px-3 py-1.5 rounded-lg border border-slate-300 hover:bg-white text-slate-700 text-xs font-medium dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700"
                    >
                      Go to Layout Painter
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 5: CURVE FITTING EXPORT & INTEGRATION */}
          {s.activeTab === 'curve-fitting' && (
            <div class="space-y-3">
              <div class="rounded-xl border border-indigo-200 bg-indigo-50/50 p-3.5 dark:border-indigo-900/50 dark:bg-indigo-950/20 text-xs">
                <div class="flex items-start justify-between gap-3">
                  <div>
                    <h3 class="font-bold text-indigo-900 dark:text-indigo-300 text-sm flex items-center gap-1.5">
                      <span>📈</span>
                      <span>Direct Pipeline to Non-Linear Curve Fitting</span>
                    </h3>
                    <p class="text-indigo-700 dark:text-indigo-400 mt-1">
                      Formatted multi-replicate dose-response data parsed directly from your plate. Click "Open in Curve Fitting" to copy and immediately model with 4PL sigmoidal curves, EC50/IC50 estimation, and Hill slope fitting.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={handleOpenInCurveFitting}
                    class="shrink-0 px-4 py-2 rounded-xl bg-indigo-600 font-bold text-white shadow-sm hover:bg-indigo-700 transition flex items-center gap-1.5 cursor-pointer"
                  >
                    <span>🚀 Open in Curve Fitting</span>
                    <span>→</span>
                  </button>
                </div>
              </div>

              {/* Dose Response Summary Series if Available */}
              {doseResponseSeries.length > 0 && (
                <div class="rounded-xl border border-slate-200 bg-white p-3.5 shadow-xs dark:border-slate-800 dark:bg-slate-900 space-y-2">
                  <h4 class="font-bold text-xs uppercase tracking-wider text-slate-700 dark:text-slate-300">
                    Detected Dose-Response Series ({doseResponseSeries.length})
                  </h4>
                  <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    {doseResponseSeries.map(ser => (
                      <div key={ser.seriesName} class="p-3 rounded-lg border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/60 space-y-1">
                        <div class="flex items-center justify-between">
                          <span class="font-bold text-slate-900 dark:text-slate-100">{ser.seriesName}</span>
                          <span class="font-mono text-slate-500">{ser.points.length} concentrations</span>
                        </div>
                        {ser.estimatedEc50 !== null && (
                          <div class="text-accent-600 dark:text-accent-400 font-mono font-semibold">
                            Est. Midpoint (EC50/IC50): ~{ser.estimatedEc50.toExponential(2)} {ser.unit || ''}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Table Preview and Format Options */}
              <div class="rounded-xl border border-slate-200 bg-white p-3.5 shadow-xs dark:border-slate-800 dark:bg-slate-900 space-y-2">
                <div class="flex items-center justify-between text-xs">
                  <div class="flex items-center gap-2">
                    <span class="font-semibold text-slate-700 dark:text-slate-300">Format:</span>
                    <button
                      type="button"
                      onClick={() => set({ curveFittingFormat: 'multi-replicate' })}
                      class={`px-2 py-1 rounded-md font-semibold ${s.curveFittingFormat === 'multi-replicate' ? 'bg-accent-600 text-white' : 'border border-slate-200 dark:border-slate-700'}`}
                    >
                      Multi-Replicates (X, Y1, Y2...)
                    </button>
                    <button
                      type="button"
                      onClick={() => set({ curveFittingFormat: 'mean-sd' })}
                      class={`px-2 py-1 rounded-md font-semibold ${s.curveFittingFormat === 'mean-sd' ? 'bg-accent-600 text-white' : 'border border-slate-200 dark:border-slate-700'}`}
                    >
                      Mean ± SD (X, Y, SD)
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={async () => {
                      await navigator.clipboard.writeText(curveFittingTable);
                      flashToast('Dose-response table copied to clipboard');
                    }}
                    class="px-3 py-1 rounded-lg border border-slate-300 hover:bg-slate-50 font-semibold text-xs dark:border-slate-700 dark:hover:bg-slate-800"
                  >
                    📋 Copy Table
                  </button>
                </div>

                <textarea
                  readOnly
                  rows={8}
                  value={curveFittingTable}
                  class="w-full rounded-lg border border-slate-200 bg-slate-50 p-2.5 font-mono text-[11px] leading-relaxed dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-200"
                />
              </div>
            </div>
          )}

          {/* TAB 6: HTS SCREENING QC DASHBOARD */}
          {s.activeTab === 'qc' && (
            <div class="space-y-4">
              <div class="rounded-xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900 space-y-3">
                <h3 class="font-bold text-sm text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <span>🎯</span>
                  <span>High-Throughput Screening Validation (Zhang et al. 1999)</span>
                </h3>

                <p class="text-xs text-slate-600 dark:text-slate-400">
                  The Z'-factor measures assay quality and statistical separation between positive and negative controls. An assay with Z' ≥ 0.5 has an excellent screening window where a single replicate can reliably detect hits without false positives.
                </p>

                {/* Visual Z-prime gauge */}
                <div class="space-y-1.5 pt-2">
                  <div class="flex items-center justify-between text-xs font-semibold">
                    <span>Z' Screening Window Metric</span>
                    <span class="font-mono text-sm">{assayQc.zPrime !== null ? assayQc.zPrime.toFixed(3) : 'N/A'}</span>
                  </div>

                  <div class="h-4 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden flex">
                    <div class="w-1/3 bg-rose-500/80" title="Unacceptable (< 0)" />
                    <div class="w-1/6 bg-amber-500/80" title="Marginal (0 to 0.5)" />
                    <div class="w-1/2 bg-emerald-500/80" title="Excellent (>= 0.5)" />
                  </div>

                  <div class="flex justify-between text-[10px] text-slate-400 font-mono">
                    <span>&lt; 0.0 (Failed)</span>
                    <span>0.0 (Marginal)</span>
                    <span>0.5 (HTS Ready)</span>
                    <span>1.0 (Ideal)</span>
                  </div>
                </div>
              </div>

              {/* Grubbs Outlier Details Table */}
              <div class="rounded-xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900 space-y-2">
                <h4 class="font-bold text-xs uppercase tracking-wider text-slate-700 dark:text-slate-300">
                  Detected Outliers &amp; Well Anomaly Flags
                </h4>
                {groupStats.some(g => g.outlierWellIds.length > 0) ? (
                  <div class="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                    {groupStats.filter(g => g.outlierWellIds.length > 0).map(g => (
                      <div key={g.groupId} class="py-2 flex items-center justify-between">
                        <div>
                          <span class="font-bold text-slate-800 dark:text-slate-200">{g.groupName}: </span>
                          <span class="font-mono text-rose-600 dark:text-rose-400 font-semibold">
                            {g.outlierWellIds.join(', ')}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            const next = new Set(excludedWellIds);
                            g.outlierWellIds.forEach(id => next.add(id));
                            setExcludedWellIds(next);
                            flashToast(`Excluded outliers from ${g.groupName}`);
                          }}
                          class="px-2.5 py-1 rounded-md bg-rose-50 text-rose-700 font-semibold hover:bg-rose-100 text-[11px] dark:bg-rose-950/50 dark:text-rose-300"
                        >
                          Exclude Group Outliers
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p class="text-xs text-emerald-600 dark:text-emerald-400 font-medium py-2">
                    ✓ No statistically significant outliers detected across any sample group.
                  </p>
                )}
              </div>
            </div>
          )}

          {/* TAB 7: CSV EXPORT */}
          {s.activeTab === 'csv' && (
            <div class="space-y-4">
              {/* Normalized Plate Matrix */}
              <div class="rounded-xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900 space-y-2">
                <div class="flex items-center justify-between text-xs">
                  <span class="font-bold text-slate-700 dark:text-slate-300">
                    Normalized 2D Plate Matrix CSV ({parsedPlate.format}-Well)
                  </span>
                  <button
                    type="button"
                    onClick={async () => {
                      const csv = exportNormalizedMatrixCsv({ ...parsedPlate, wells: normalizedWells }, 'normalized');
                      await navigator.clipboard.writeText(csv);
                      flashToast('Normalized matrix CSV copied');
                    }}
                    class="px-3 py-1 rounded-lg border border-slate-300 hover:bg-slate-50 font-semibold text-xs dark:border-slate-700 dark:hover:bg-slate-800"
                  >
                    📋 Copy Matrix CSV
                  </button>
                </div>

                <textarea
                  readOnly
                  rows={8}
                  value={exportNormalizedMatrixCsv({ ...parsedPlate, wells: normalizedWells }, 'normalized')}
                  class="w-full rounded-lg border border-slate-200 bg-slate-50 p-2.5 font-mono text-[11px] leading-relaxed dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-200"
                />
              </div>

              {/* Raw Plate Matrix */}
              <div class="rounded-xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900 space-y-2">
                <div class="flex items-center justify-between text-xs">
                  <span class="font-bold text-slate-700 dark:text-slate-300">
                    Raw 2D Plate Matrix CSV ({parsedPlate.format}-Well)
                  </span>
                  <button
                    type="button"
                    onClick={async () => {
                      const csv = exportNormalizedMatrixCsv({ ...parsedPlate, wells: normalizedWells }, 'raw');
                      await navigator.clipboard.writeText(csv);
                      flashToast('Raw matrix CSV copied');
                    }}
                    class="px-3 py-1 rounded-lg border border-slate-300 hover:bg-slate-50 font-semibold text-xs dark:border-slate-700 dark:hover:bg-slate-800"
                  >
                    📋 Copy Raw Matrix
                  </button>
                </div>

                <textarea
                  readOnly
                  rows={8}
                  value={exportNormalizedMatrixCsv({ ...parsedPlate, wells: normalizedWells }, 'raw')}
                  class="w-full rounded-lg border border-slate-200 bg-slate-50 p-2.5 font-mono text-[11px] leading-relaxed dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-200"
                />
              </div>
            </div>
          )}
        </div>
      }
      actions={
        <ActionBar
          onCopy={copyReport}
          shareUrl={shareUrl}
        />
      }
      science={<SciencePanel science={SCIENCE} />}
    />
  );
}
