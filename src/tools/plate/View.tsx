import { type ComponentChildren } from 'preact';
import { useState, useMemo, useRef } from 'preact/hooks';
import { route } from '@/app/router';
import { PlateChassis } from './PlateChassis';
import PlateReaderView from '@/tools/plate-reader/View';
import { type AnnotationToken, type SampleType as ReaderSampleType } from '@/core/plates/reader';
import {
  type PlateFormat,
  type WellData,
  type SampleGroup,
  PLATE_DIMENSIONS,
  ASSAY_PRESETS,
  generateEmptyPlate,
  applyDilutionSeries,
  generatePipettingScheme,
  formatWellConcentration,
  plateToMatrixCsv,
  plateToMatrixTsv,
  plateToListCsv,
  plateToMarkdown,
  parseMatrixText,
} from '@/core/plates/layout';
import { DecimalInput } from '@/app/components/DecimalInput';
import { ToolLayout } from '@/app/components/ToolLayout';
import { SciencePanel, scienceText } from '@/app/components/SciencePanel';
import { ActionBar } from '@/app/components/ActionBar';
import { useUrlState } from '@/lib/url-state';
import { SCIENCE } from './science';

interface State {
  format: PlateFormat;
  activeGroupId: string;
  viewTab: 'map' | 'pipetting';
  displayMode: 'labels' | 'concentrations' | 'samples' | 'shading';
  toolMode: 'brush' | 'inspect' | 'eraser';
  // Dilution Series
  dilutionDirection: 'row' | 'col';
  dilutionStartRow: string;
  dilutionStartCol: number;
  dilutionLength: number;
  dilutionStartConc: number;
  dilutionFactor: number;
  dilutionUnit: string;
  dilutionReplicates: number;
  dilutionIncludeBlank: boolean;
  stockConc: number;
  // Pipetting parameters
  workingVolumeUl: number;
  transferVolumeUl: number;
  pipetteType: 'single' | '8-channel' | '12-channel';
}

const DEFAULTS: State = {
  format: 96,
  activeGroupId: 'sample-1',
  viewTab: 'map',
  displayMode: 'labels',
  toolMode: 'brush',
  dilutionDirection: 'row',
  dilutionStartRow: 'B',
  dilutionStartCol: 1,
  dilutionLength: 8,
  dilutionStartConc: 100,
  dilutionFactor: 2,
  dilutionUnit: 'µM',
  dilutionReplicates: 2,
  dilutionIncludeBlank: true,
  stockConc: 340,
  workingVolumeUl: 100,
  transferVolumeUl: 50,
  pipetteType: '8-channel',
};

export default function PlateView() {
  const [stateSig, shareUrl] = useUrlState<State>('plate', DEFAULTS);
  const s = stateSig.value;
  const set = (patch: Partial<State>) => { stateSig.value = { ...stateSig.value, ...patch }; };

  // Main Mode: Default Layout Generator vs Plate Reader Processor
  const [mainMode, setMainMode] = useState<'generator' | 'reader'>(() => {
    if (route.value.name === 'tool' && route.value.toolId === 'plate-reader') {
      return 'reader';
    }
    return 'generator';
  });

  const [wells, setWells] = useState<Record<string, WellData>>(() => {
    const w = generateEmptyPlate(96);
    // Row A: Blanks
    for (let c = 1; c <= 12; c++) {
      w[`A${c}`] = { id: `A${c}`, row: 'A', col: c, sampleGroupId: 'blank', sampleName: 'Blank' };
    }
    // Rows B & C: Dilution series (duplicates)
    const dim = PLATE_DIMENSIONS[96];
    return applyDilutionSeries(w, {
      groupId: 'std',
      startConc: 100,
      dilutionFactor: 2,
      unit: 'ng/mL',
      direction: 'row',
      startRow: 'B',
      startCol: 1,
      length: 8,
      replicates: 2,
      includeBlank: true,
    }, dim, 'Std');
  });

  const [groups, setGroups] = useState<SampleGroup[]>(() => [
    { id: 'blank', name: 'Blank / Media', color: '#94a3b8', type: 'blank' },
    { id: 'neg-ctrl', name: 'Negative Control', color: '#64748b', type: 'neg-ctrl' },
    { id: 'pos-ctrl', name: 'Positive Control', color: '#10b981', type: 'pos-ctrl' },
    { id: 'std', name: 'Standard Curve', color: '#8b5cf6', type: 'standard' },
    { id: 'sample-1', name: 'Sample 1', color: '#3b82f6', type: 'sample' },
  ]);

  const [hoveredWell, setHoveredWell] = useState<WellData | null>(null);
  const [selectedWellId, setSelectedWellId] = useState<string | null>('B1');
  const [dragStart, setDragStart] = useState<{ rowIdx: number; col: number } | null>(null);
  const [dragCurrent, setDragCurrent] = useState<{ rowIdx: number; col: number } | null>(null);
  const [_isDragging, setIsDragging] = useState(false);
  const didDragRef = useRef(false);

  const [density, setDensity] = useState<'normal' | 'compact'>('normal');
  const [showPasteModal, setShowPasteModal] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [pasteError, setPasteError] = useState('');
  const [tsvCopied, setTsvCopied] = useState(false);

  // Convert current Generator plate layout into Reader AnnotationTokens
  const generatorAnnotations = useMemo<Record<string, AnnotationToken>>(() => {
    const ann: Record<string, AnnotationToken> = {};
    for (const [id, w] of Object.entries(wells)) {
      const grp = groups.find(g => g.id === w.sampleGroupId);
      if (!grp && !w.sampleName) continue;
      let role: ReaderSampleType = 'sample';
      if (grp?.type === 'blank') role = 'blank';
      else if (grp?.type === 'pos-ctrl') role = 'pos-ctrl';
      else if (grp?.type === 'neg-ctrl') role = 'neg-ctrl';
      else if (grp?.type === 'standard') role = 'standard';

      ann[id] = {
        label: w.sampleName || grp?.name || 'Sample',
        role,
        sampleName: w.sampleName || grp?.name || 'Sample',
        sampleType: role,
        concentration: w.value,
        unit: w.unit,
        dilutionFactor: 1,
      };
    }
    return ann;
  }, [wells, groups]);

  // Sync annotations back from reader into generator
  const handleSyncReaderAnnotationsToGenerator = (annotations: Record<string, AnnotationToken>) => {
    const nextWells = { ...wells };
    const nextGroups = [...groups];

    for (const [wellId, token] of Object.entries(annotations)) {
      if (!token.sampleName && !token.role && !token.label) continue;
      const groupName = token.sampleName || token.label || token.role || 'Sample';
      let grp = nextGroups.find(g => g.name === groupName);
      if (!grp) {
        let type: SampleGroup['type'] = 'sample';
        let color = '#3b82f6';
        if (token.role === 'blank') { type = 'blank'; color = '#94a3b8'; }
        else if (token.role === 'pos-ctrl') { type = 'pos-ctrl'; color = '#10b981'; }
        else if (token.role === 'neg-ctrl') { type = 'neg-ctrl'; color = '#64748b'; }
        else if (token.role === 'standard') { type = 'standard'; color = '#8b5cf6'; }

        grp = {
          id: `grp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          name: groupName,
          type,
          color,
        };
        nextGroups.push(grp);
      }

      nextWells[wellId] = {
        id: wellId,
        row: wellId.charAt(0),
        col: parseInt(wellId.slice(1), 10),
        sampleGroupId: grp.id,
        sampleName: groupName,
        value: token.concentration,
        unit: token.unit,
      };
    }

    setGroups(nextGroups);
    setWells(nextWells);
  };

  function handleRenameGroup(id: string, newName: string) {
    setGroups(prev => prev.map(g => g.id === id ? { ...g, name: newName } : g));
    setWells(prev => {
      const updated = { ...prev };
      let changed = false;
      for (const key of Object.keys(updated)) {
        if (updated[key]?.sampleGroupId === id) {
          updated[key] = { ...updated[key]!, sampleName: newName };
          changed = true;
        }
      }
      return changed ? updated : prev;
    });
  }

  function handleAddSample() {
    const existingNums = groups
      .map(g => {
        const m = g.name.match(/Sample\s+(\d+)/i);
        return m ? parseInt(m[1]!, 10) : 0;
      })
      .filter(n => !isNaN(n));
    const nextNum = existingNums.length > 0 ? Math.max(...existingNums) + 1 : groups.length + 1;
    const newId = `sample-${Date.now()}`;
    const paletteColors = [
      '#ec4899', '#f59e0b', '#06b6d4', '#8b5cf6', '#ef4444',
      '#10b981', '#14b8a6', '#f97316', '#6366f1', '#84cc16'
    ];
    const color = paletteColors[groups.length % paletteColors.length]!;
    const newGroup: SampleGroup = {
      id: newId,
      name: `Sample ${nextNum}`,
      color,
      type: 'sample',
    };
    setGroups(prev => [...prev, newGroup]);
    set({ activeGroupId: newId });
  }

  function handleDeleteGroup(id: string) {
    if (groups.length <= 1) return;
    setGroups(prev => prev.filter(g => g.id !== id));
    setWells(prev => {
      const updated = { ...prev };
      for (const key of Object.keys(updated)) {
        if (updated[key]?.sampleGroupId === id) {
          updated[key] = {
            ...updated[key]!,
            sampleGroupId: '',
            sampleName: '',
            value: undefined,
            unit: undefined,
          };
        }
      }
      return updated;
    });
    if (s.activeGroupId === id) {
      const remaining = groups.filter(g => g.id !== id);
      set({ activeGroupId: remaining[0]?.id || '' });
    }
  }

  const dim = useMemo(() => PLATE_DIMENSIONS[s.format], [s.format]);

  // Compute min and max values per sample group to scale color shading
  const groupValueRanges = useMemo(() => {
    const ranges: Record<string, { min: number; max: number }> = {};
    for (const w of Object.values(wells)) {
      if (w.sampleGroupId && w.value !== undefined && w.value > 0) {
        if (!ranges[w.sampleGroupId]) {
          ranges[w.sampleGroupId] = { min: w.value, max: w.value };
        } else {
          ranges[w.sampleGroupId]!.min = Math.min(ranges[w.sampleGroupId]!.min, w.value);
          ranges[w.sampleGroupId]!.max = Math.max(ranges[w.sampleGroupId]!.max, w.value);
        }
      }
    }
    return ranges;
  }, [wells]);

  const pipettingPlan = useMemo(() => {
    return generatePipettingScheme(
      wells,
      {
        workingVolumeUl: s.workingVolumeUl,
        transferVolumeUl: s.transferVolumeUl,
        pipetteType: s.pipetteType,
        stockConc: s.stockConc,
      },
      groups,
    );
  }, [wells, s.workingVolumeUl, s.transferVolumeUl, s.pipetteType, s.stockConc, groups]);

  function hexToRgba(hexColor: string, alpha: number): string {
    const hex = hexColor.replace('#', '');
    const r = parseInt(hex.substring(0, 2), 16) || 128;
    const g = parseInt(hex.substring(2, 4), 16) || 128;
    const b = parseInt(hex.substring(4, 6), 16) || 128;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  function getWellTextColor(hexColor: string): string {
    const hex = hexColor.replace('#', '');
    const r = parseInt(hex.substring(0, 2), 16) || 128;
    const g = parseInt(hex.substring(2, 4), 16) || 128;
    const b = parseInt(hex.substring(4, 6), 16) || 128;
    const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    if (lum > 0.55) {
      return 'text-slate-950 font-extrabold';
    }
    return 'text-white font-extrabold drop-shadow-xs';
  }

  function handleFormatChange(fmt: PlateFormat) {
    set({ format: fmt });
    setWells(generateEmptyPlate(fmt));
    setSelectedWellId(null);
  }

  function handleLoadPreset(presetId: string) {
    const preset = ASSAY_PRESETS.find(p => p.id === presetId);
    if (!preset) return;
    if (s.format !== preset.format) {
      set({ format: preset.format });
    }
    const { wells: newWells, groups: newGroups } = preset.build();
    setWells(newWells);
    setGroups(newGroups);
    if (newGroups.length > 0) {
      set({ activeGroupId: newGroups[0]!.id });
    }
    setSelectedWellId('B1');
  }

  function handleWellClick(wellId: string) {
    if (didDragRef.current) return;
    setSelectedWellId(wellId);

    if (s.toolMode === 'eraser') {
      handleClearSingleWell(wellId);
      return;
    }

    if (s.toolMode === 'brush') {
      setWells(prev => {
        const current = prev[wellId];
        if (!current) return prev;
        const newGroupId = current.sampleGroupId === s.activeGroupId ? '' : s.activeGroupId;
        const g = groups.find(item => item.id === newGroupId);
        return {
          ...prev,
          [wellId]: {
            ...current,
            sampleGroupId: newGroupId,
            sampleName: g ? g.name : '',
            value: undefined,
            unit: undefined,
          },
        };
      });
    }
  }

  function handleSetWellGroup(wellId: string, groupId: string) {
    const g = groups.find(item => item.id === groupId);
    setWells(prev => {
      const cur = prev[wellId];
      if (!cur) return prev;
      return {
        ...prev,
        [wellId]: {
          ...cur,
          sampleGroupId: groupId,
          sampleName: g ? g.name : '',
        },
      };
    });
  }

  function handleSetWellValue(wellId: string, val: number) {
    setWells(prev => {
      const cur = prev[wellId];
      if (!cur) return prev;
      return {
        ...prev,
        [wellId]: {
          ...cur,
          value: isNaN(val) ? undefined : val,
        },
      };
    });
  }

  function handleSetWellUnit(wellId: string, unit: string) {
    setWells(prev => {
      const cur = prev[wellId];
      if (!cur) return prev;
      return {
        ...prev,
        [wellId]: {
          ...cur,
          unit,
        },
      };
    });
  }

  function handleClearSingleWell(wellId: string) {
    setWells(prev => {
      const cur = prev[wellId];
      if (!cur) return prev;
      return {
        ...prev,
        [wellId]: {
          ...cur,
          sampleGroupId: '',
          sampleName: '',
          value: undefined,
          unit: undefined,
        },
      };
    });
  }

  function handlePaintWellWithActive(wellId: string) {
    const g = groups.find(item => item.id === s.activeGroupId);
    setWells(prev => {
      const cur = prev[wellId];
      if (!cur) return prev;
      return {
        ...prev,
        [wellId]: {
          ...cur,
          sampleGroupId: s.activeGroupId,
          sampleName: g ? g.name : '',
        },
      };
    });
  }

  function handlePaintRow(rowChar: string) {
    setWells(prev => {
      const updated = { ...prev };
      const g = groups.find(item => item.id === s.activeGroupId);
      for (let c = 1; c <= dim.cols; c++) {
        const id = `${rowChar}${c}`;
        if (updated[id]) {
          updated[id] = { ...updated[id], sampleGroupId: s.activeGroupId, sampleName: g ? g.name : '' };
        }
      }
      return updated;
    });
  }

  function handlePaintCol(colNum: number) {
    setWells(prev => {
      const updated = { ...prev };
      const g = groups.find(item => item.id === s.activeGroupId);
      for (let r = 0; r < dim.rows; r++) {
        const rowChar = dim.rowLabels[r]!;
        const id = `${rowChar}${colNum}`;
        if (updated[id]) {
          updated[id] = { ...updated[id], sampleGroupId: s.activeGroupId, sampleName: g ? g.name : '' };
        }
      }
      return updated;
    });
  }

  // Box drag selection
  function handleMouseDown(rIdx: number, cNum: number) {
    setDragStart({ rowIdx: rIdx, col: cNum });
    setDragCurrent({ rowIdx: rIdx, col: cNum });
    setIsDragging(false);
  }

  function handleMouseEnter(rIdx: number, cNum: number) {
    if (dragStart) {
      if (rIdx !== dragStart.rowIdx || cNum !== dragStart.col) {
        setIsDragging(true);
      }
      setDragCurrent({ rowIdx: rIdx, col: cNum });
    }
  }

  function handleMouseUp() {
    if (dragStart && dragCurrent) {
      const rMin = Math.min(dragStart.rowIdx, dragCurrent.rowIdx);
      const rMax = Math.max(dragStart.rowIdx, dragCurrent.rowIdx);
      const cMin = Math.min(dragStart.col, dragCurrent.col);
      const cMax = Math.max(dragStart.col, dragCurrent.col);
      const isMultiWell = rMin !== rMax || cMin !== cMax;

      if (isMultiWell) {
        didDragRef.current = true;
        setTimeout(() => { didDragRef.current = false; }, 80);

        if (s.toolMode === 'eraser') {
          setWells(prev => {
            const updated = { ...prev };
            for (let r = rMin; r <= rMax; r++) {
              const rowChar = dim.rowLabels[r]!;
              for (let c = cMin; c <= cMax; c++) {
                const id = `${rowChar}${c}`;
                if (updated[id]) {
                  updated[id] = {
                    ...updated[id]!,
                    sampleGroupId: '',
                    sampleName: '',
                    value: undefined,
                    unit: undefined,
                  };
                }
              }
            }
            return updated;
          });
        } else if (s.toolMode === 'brush') {
          setWells(prev => {
            const updated = { ...prev };
            const g = groups.find(item => item.id === s.activeGroupId);
            for (let r = rMin; r <= rMax; r++) {
              const rowChar = dim.rowLabels[r]!;
              for (let c = cMin; c <= cMax; c++) {
                const id = `${rowChar}${c}`;
                if (updated[id]) {
                  updated[id] = {
                    ...updated[id]!,
                    sampleGroupId: s.activeGroupId,
                    sampleName: g ? g.name : '',
                  };
                }
              }
            }
            return updated;
          });
        }
      }
    }
    setDragStart(null);
    setDragCurrent(null);
    setIsDragging(false);
  }

  function handleGenerateDilution() {
    setWells(prev => {
      return applyDilutionSeries(prev, {
        groupId: s.activeGroupId,
        startConc: s.dilutionStartConc,
        dilutionFactor: s.dilutionFactor,
        unit: s.dilutionUnit,
        direction: s.dilutionDirection,
        startRow: s.dilutionStartRow,
        startCol: s.dilutionStartCol,
        length: s.dilutionLength,
        replicates: s.dilutionReplicates,
        includeBlank: s.dilutionIncludeBlank,
      }, dim, 'Dilution');
    });
  }

  function handleClearPlate() {
    setWells(generateEmptyPlate(s.format));
    setSelectedWellId(null);
  }

  function handleExportMatrix() {
    const csv = plateToMatrixCsv(s.format, wells);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `plate_${s.format}well_matrix.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleExportList() {
    const csv = plateToListCsv(wells, groups);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `plate_${s.format}well_samples.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleExportMarkdown() {
    const md = plateToMarkdown(s.format, wells, groups);
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `plate_${s.format}well_layout.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handlePrintPdf() {
    window.print();
  }

  function handleCopyTsv() {
    const tsv = plateToMatrixTsv(s.format, wells);
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(tsv);
    }
    setTsvCopied(true);
    setTimeout(() => setTsvCopied(false), 2000);
  }

  function handleImportMatrix() {
    if (!pasteText.trim()) {
      setPasteError('Please paste matrix cells from Excel, Google Sheets, or CSV.');
      return;
    }
    try {
      const { wells: newWells, groups: newGroups } = parseMatrixText(pasteText, s.format, groups);
      setWells(newWells);
      setGroups(newGroups);
      if (newGroups.length > 0) {
        set({ activeGroupId: newGroups[0]!.id });
      }
      setShowPasteModal(false);
      setPasteText('');
      setPasteError('');
    } catch (err) {
      setPasteError(err instanceof Error ? err.message : 'Failed to parse table');
    }
  }

  const assignedCount = Object.values(wells).filter(w => !!w.sampleGroupId).length;
  const totalWells = dim.rows * dim.cols;
  const selectedWell = selectedWellId ? wells[selectedWellId] : null;
  const selectedGroup = selectedWell ? groups.find(g => g.id === selectedWell.sampleGroupId) : null;
  const activeGroup = groups.find(g => g.id === s.activeGroupId);

  const copyText = [
    `Microplate Layout: ${s.format}-well format`,
    `Assigned Wells: ${assignedCount} / ${totalWells} (${((assignedCount / totalWells) * 100).toFixed(1)}% occupied)`,
    `Total Diluent Buffer Required: ${(pipettingPlan.totalDiluentNeededUl / 1000).toFixed(2)} mL`,
    `Total Concentrated Stock Required: ${(pipettingPlan.totalStockNeededUl / 1000).toFixed(2)} mL`,
    ...groups.map(g => {
      const count = Object.values(wells).filter(w => w.sampleGroupId === g.id).length;
      return count > 0 ? `  - ${g.name}: ${count} wells` : null;
    }).filter(Boolean),
    '',
    scienceText(SCIENCE),
  ].join('\n');

  if (mainMode === 'reader') {
    return (
      <PlateReaderView
        isEmbedded={true}
        externalLayoutAnnotations={generatorAnnotations}
        onSwitchToGenerator={() => setMainMode('generator')}
        onSyncLayoutToGenerator={handleSyncReaderAnnotationsToGenerator}
      />
    );
  }

  return (
    <>
      <ToolLayout
      icon="🟦"
      title="Plate Layout Designer"
      blurb="Multi-well plate maps (6 to 384 wells), box drag selection, serial dilution color shades, and pipetting scheme generator."
      wide={true}
      mobileResultSummary={
        <span>{s.format}-well map · <strong class="text-accent-700 dark:text-accent-300 font-mono">{assignedCount} / {s.format}</strong> wells filled</span>
      }
      inputs={
        <div class="space-y-4">
          {/* Format Selector */}
          <div class="space-y-2 rounded-xl border border-slate-200 bg-white p-3.5 dark:border-slate-800 dark:bg-slate-900">
            <span class="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
              Plate Format
            </span>
            <div class="grid grid-cols-3 gap-1.5 text-xs">
              {([6, 12, 24, 48, 96, 384] as PlateFormat[]).map(fmt => (
                <button
                  key={fmt}
                  type="button"
                  onClick={() => handleFormatChange(fmt)}
                  class={`py-1.5 rounded-lg font-semibold transition ${s.format === fmt ? 'bg-accent-600 text-white' : 'border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'}`}
                >
                  {fmt} Wells
                </button>
              ))}
            </div>
          </div>

          {/* Active Tool Mode */}
          <div class="space-y-2 rounded-xl border border-slate-200 bg-white p-3.5 dark:border-slate-800 dark:bg-slate-900">
            <span class="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
              Tool Mode
            </span>
            <div class="grid grid-cols-3 gap-1.5 text-xs">
              <button
                type="button"
                onClick={() => set({ toolMode: 'brush' })}
                class={`py-1.5 rounded-lg font-semibold transition flex flex-col items-center gap-0.5 ${s.toolMode === 'brush' ? 'bg-accent-600 text-white shadow-xs' : 'border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300'}`}
              >
                <span>🖌️</span>
                <span>Brush</span>
              </button>
              <button
                type="button"
                onClick={() => set({ toolMode: 'inspect' })}
                class={`py-1.5 rounded-lg font-semibold transition flex flex-col items-center gap-0.5 ${s.toolMode === 'inspect' ? 'bg-accent-600 text-white shadow-xs' : 'border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300'}`}
              >
                <span>🔍</span>
                <span>Inspect</span>
              </button>
              <button
                type="button"
                onClick={() => set({ toolMode: 'eraser' })}
                class={`py-1.5 rounded-lg font-semibold transition flex flex-col items-center gap-0.5 ${s.toolMode === 'eraser' ? 'bg-rose-600 text-white shadow-xs' : 'border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300'}`}
              >
                <span>🧹</span>
                <span>Eraser</span>
              </button>
            </div>
          </div>

          {/* Sample Groups Palette */}
          <div class="space-y-2 rounded-xl border border-slate-200 bg-white p-3.5 dark:border-slate-800 dark:bg-slate-900">
            <div class="flex items-center justify-between">
              <span class="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                Sample Palette (Active Paint)
              </span>
              <span class="text-[11px] text-slate-400">Click to paint</span>
            </div>
            <div class="space-y-1.5">
              {groups.map(g => {
                const count = Object.values(wells).filter(w => w.sampleGroupId === g.id).length;
                const isSelected = s.activeGroupId === g.id;
                return (
                  <div
                    key={g.id}
                    onClick={() => set({ activeGroupId: g.id })}
                    class={`w-full p-1.5 rounded-lg text-xs font-semibold flex items-center justify-between border cursor-pointer transition ${isSelected ? 'border-accent-500 bg-accent-50/40 dark:border-accent-600 dark:bg-accent-950/40 ring-1 ring-accent-500/20' : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'}`}
                  >
                    <div class="flex items-center gap-2 flex-1 min-w-0 mr-1">
                      <span class="w-3.5 h-3.5 rounded-full shrink-0 shadow-2xs" style={{ backgroundColor: g.color }} />
                      <input
                        type="text"
                        value={g.name}
                        onClick={e => e.stopPropagation()}
                        onChange={e => handleRenameGroup(g.id, (e.target as HTMLInputElement).value)}
                        class="bg-transparent border-none p-0 text-xs font-semibold text-slate-900 dark:text-slate-100 focus:outline-none flex-1 truncate"
                      />
                    </div>
                    <div class="flex items-center gap-1.5 shrink-0 text-slate-400">
                      <span class="font-mono text-[11px] font-normal">{count} wells</span>
                      {groups.length > 1 && (
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); handleDeleteGroup(g.id); }}
                          class="hover:text-rose-500 transition px-1"
                          title="Delete sample group"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <button
              type="button"
              onClick={handleAddSample}
              class="w-full py-1.5 px-2 rounded-lg border border-dashed border-slate-300 dark:border-slate-700 hover:border-accent-500 hover:text-accent-600 text-xs font-semibold flex items-center justify-center gap-1 text-slate-600 dark:text-slate-400 transition"
            >
              <span>+ Add Sample</span>
            </button>
          </div>

          {/* Serial Dilution Generator Accordion */}
          <details class="rounded-xl border border-slate-200 bg-white p-3.5 dark:border-slate-800 dark:bg-slate-900 text-xs space-y-2.5">
            <summary class="cursor-pointer font-semibold text-slate-800 dark:text-slate-200 select-none">
              ⚡ Serial Dilution Generator
            </summary>

            <div class="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              {/* Direction: Row vs Column */}
              <div>
                <label class="block text-[10px] text-slate-400 mb-1 font-semibold uppercase">Dilution Direction</label>
                <div class="grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    onClick={() => set({ dilutionDirection: 'row' })}
                    class={`py-1 rounded text-xs font-semibold transition ${s.dilutionDirection === 'row' ? 'bg-accent-600 text-white' : 'border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'}`}
                  >
                    Across Rows (Horiz)
                  </button>
                  <button
                    type="button"
                    onClick={() => set({ dilutionDirection: 'col' })}
                    class={`py-1 rounded text-xs font-semibold transition ${s.dilutionDirection === 'col' ? 'bg-accent-600 text-white' : 'border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'}`}
                  >
                    Down Columns (Vert)
                  </button>
                </div>
              </div>

              <div class="grid grid-cols-2 gap-2">
                <div>
                  <label class="block text-[10px] text-slate-400">Start Row</label>
                  <select
                    value={s.dilutionStartRow}
                    onChange={(e) => set({ dilutionStartRow: (e.target as HTMLSelectElement).value })}
                    class="w-full rounded border border-slate-300 dark:border-slate-700 p-1 text-xs dark:bg-slate-950 font-semibold"
                  >
                    {dim.rowLabels.map(r => <option key={r} value={r}>Row {r}</option>)}
                  </select>
                </div>
                <div>
                  <label class="block text-[10px] text-slate-400">Start Column</label>
                  <input
                    type="number"
                    min="1"
                    max={dim.cols}
                    value={s.dilutionStartCol}
                    onInput={(e) => set({ dilutionStartCol: parseInt((e.target as HTMLInputElement).value) || 1 })}
                    class="w-full rounded border border-slate-300 dark:border-slate-700 p-1 text-xs dark:bg-slate-950 font-semibold"
                  />
                </div>
              </div>

              <div class="grid grid-cols-2 gap-2">
                <div>
                  <label class="block text-[10px] text-slate-400">Number of Steps (Wells)</label>
                  <input
                    type="number"
                    min="2"
                    max={s.dilutionDirection === 'row' ? dim.cols : dim.rows}
                    value={s.dilutionLength}
                    onInput={(e) => set({ dilutionLength: parseInt((e.target as HTMLInputElement).value) || 8 })}
                    class="w-full rounded border border-slate-300 dark:border-slate-700 p-1 text-xs dark:bg-slate-950 font-semibold"
                  />
                </div>
                <div>
                  <label class="block text-[10px] text-slate-400">
                    {s.dilutionDirection === 'row' ? 'Replicate Rows' : 'Replicate Columns'}
                  </label>
                  <input
                    type="number"
                    min="1"
                    max={s.dilutionDirection === 'row' ? dim.rows : dim.cols}
                    value={s.dilutionReplicates}
                    onInput={(e) => set({ dilutionReplicates: parseInt((e.target as HTMLInputElement).value) || 1 })}
                    class="w-full rounded border border-slate-300 dark:border-slate-700 p-1 text-xs dark:bg-slate-950 font-semibold"
                  />
                </div>
              </div>

              <div class="grid grid-cols-2 gap-2">
                <div>
                  <label class="block text-[10px] text-slate-400">Start Concentration</label>
                  <DecimalInput
                    value={s.dilutionStartConc}
                    onChange={dilutionStartConc => set({ dilutionStartConc })}
                    min={0.000001}
                    class="w-full rounded border border-slate-300 dark:border-slate-700 p-1 text-xs dark:bg-slate-950 font-semibold font-mono"
                  />
                </div>
                <div>
                  <label class="block text-[10px] text-slate-400">Unit</label>
                  <input
                    type="text"
                    value={s.dilutionUnit}
                    onInput={(e) => set({ dilutionUnit: (e.target as HTMLInputElement).value })}
                    class="w-full rounded border border-slate-300 dark:border-slate-700 p-1 text-xs dark:bg-slate-950 font-semibold"
                  />
                </div>
              </div>

              <div>
                <label class="block text-[10px] text-slate-400">Dilution Factor (e.g. 2 for 1:2, 10 for 1:10)</label>
                <DecimalInput
                  value={s.dilutionFactor}
                  onChange={dilutionFactor => set({ dilutionFactor })}
                  min={1.01}
                  class="w-full rounded border border-slate-300 dark:border-slate-700 p-1 text-xs dark:bg-slate-950 font-semibold font-mono"
                />
              </div>

              <div>
                <label class="block text-[10px] text-slate-400">Stock Concentration (Initial Well Prep)</label>
                <DecimalInput
                  value={s.stockConc}
                  onChange={stockConc => set({ stockConc })}
                  min={0.0001}
                  class="w-full rounded border border-slate-300 dark:border-slate-700 p-1 text-xs dark:bg-slate-950 font-semibold font-mono"
                  placeholder="e.g. 340"
                />
              </div>

              <label class="flex items-center gap-1.5 cursor-pointer text-slate-600 dark:text-slate-400 select-none">
                <input
                  type="checkbox"
                  checked={s.dilutionIncludeBlank}
                  onChange={(e) => set({ dilutionIncludeBlank: (e.target as HTMLInputElement).checked })}
                  class="rounded text-accent-600 accent-accent-600"
                />
                <span>Include final Blank well (conc = 0)</span>
              </label>

              <button
                type="button"
                onClick={handleGenerateDilution}
                class="w-full py-2 bg-accent-600 hover:bg-accent-700 text-white font-semibold rounded-lg transition shadow-xs"
              >
                Apply Serial Dilution ({s.dilutionLength} steps, 1:{s.dilutionFactor})
              </button>
            </div>
          </details>

          {/* Excel / Google Sheets Sync */}
          <div class="space-y-2 rounded-xl border border-indigo-200 bg-indigo-50/40 p-3.5 dark:border-indigo-900/40 dark:bg-indigo-950/20">
            <span class="block text-xs font-semibold text-indigo-900 dark:text-indigo-300 uppercase tracking-wider">
              Spreadsheet Sync (Excel / Sheets)
            </span>
            <div class="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={handleCopyTsv}
                class="py-1.5 px-2 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white transition flex items-center justify-center gap-1 shadow-xs"
              >
                {tsvCopied ? '✓ Copied TSV!' : '📋 Copy (Excel TSV)'}
              </button>
              <button
                type="button"
                onClick={() => setShowPasteModal(true)}
                class="py-1.5 px-2 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white transition flex items-center justify-center gap-1 shadow-xs"
              >
                📥 Paste Matrix
              </button>
            </div>
            <p class="text-[11px] text-slate-500 dark:text-slate-400 leading-tight">
              Copy/paste 8×12 well grid directly between Excel or Google Sheets and the designer.
            </p>
          </div>

          <div class="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={handleExportMatrix}
              class="py-1.5 text-xs font-semibold rounded-lg bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-white transition"
            >
              Matrix CSV
            </button>
            <button
              type="button"
              onClick={handleExportList}
              class="py-1.5 text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
            >
              List CSV
            </button>
            <button
              type="button"
              onClick={handleExportMarkdown}
              class="py-1.5 text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
            >
              Markdown (.md)
            </button>
            <button
              type="button"
              onClick={handlePrintPdf}
              class="py-1.5 text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 transition flex items-center justify-center gap-1"
            >
              Print / Save PDF
            </button>
          </div>

          <button
            type="button"
            onClick={handleClearPlate}
            class="w-full py-1.5 text-xs font-medium rounded-lg text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 border border-rose-200 dark:border-rose-900 transition"
          >
            Clear All Wells
          </button>
        </div>
      }
      results={
        <div class="space-y-4" onMouseUp={handleMouseUp}>
          {/* Main Mode Toggle: Generator vs Plate Reader */}
          <div class="flex flex-wrap items-center justify-between gap-3 p-3 rounded-2xl bg-linear-to-r from-slate-100 to-indigo-50/40 dark:from-slate-800/80 dark:to-indigo-950/20 border border-slate-200 dark:border-slate-700 shadow-xs">
            <div class="inline-flex p-1 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 shadow-2xs">
              <button
                type="button"
                onClick={() => setMainMode('generator')}
                class="px-3.5 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-2 bg-accent-600 text-white shadow-xs"
              >
                <span>🟦</span>
                <span>Plate Layout Generator</span>
              </button>
              <button
                type="button"
                onClick={() => setMainMode('reader')}
                class="px-3.5 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-2 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100"
              >
                <span>📊</span>
                <span>Plate Reader Processor</span>
              </button>
            </div>

            <button
              type="button"
              onClick={() => setMainMode('reader')}
              class="px-3.5 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs shadow-xs transition flex items-center gap-1.5"
            >
              <span>📊</span>
              <span>Process Plate Reader Data with this Layout ➔</span>
            </button>
          </div>

          {/* Quick Assay Templates / Presets Bar */}
          <div class="flex flex-wrap items-center justify-between gap-2 p-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xs">
            <div class="flex flex-wrap items-center gap-2">
              <span class="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                <span>📋</span>
                <span>Assay Presets:</span>
              </span>
              <div class="flex flex-wrap items-center gap-1.5">
                {ASSAY_PRESETS.map(preset => (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => handleLoadPreset(preset.id)}
                    class="px-2.5 py-1 rounded-lg text-xs font-semibold border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:border-accent-500 hover:text-accent-600 dark:hover:text-accent-400 hover:bg-accent-50/50 dark:hover:bg-accent-950/40 transition flex items-center gap-1.5"
                    title={preset.description}
                  >
                    <span>{preset.name}</span>
                    <span class="text-[10px] px-1 py-0.2 rounded bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-400 font-mono">
                      {preset.badge}
                    </span>
                  </button>
                ))}
              </div>
            </div>
            <button
              type="button"
              onClick={handleClearPlate}
              class="px-2.5 py-1 text-xs font-medium rounded-lg text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 border border-rose-200 dark:border-rose-900 transition flex items-center gap-1"
            >
              <span>🧹</span>
              <span>Clear Plate</span>
            </button>
          </div>

          {/* Header Tabs & Display Controls */}
          <div class="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 dark:border-slate-800 pb-2.5">
            <div class="flex flex-wrap items-center gap-2">
              <div class="flex gap-2">
                <button
                  type="button"
                  onClick={() => set({ viewTab: 'map' })}
                  class={`px-4 py-1.5 rounded-full text-xs font-semibold transition ${s.viewTab === 'map' ? 'bg-accent-600 text-white' : 'border border-slate-300 dark:border-slate-700'}`}
                >
                  {s.format}-Well Plate Grid
                </button>
                <button
                  type="button"
                  onClick={() => set({ viewTab: 'pipetting' })}
                  class={`px-4 py-1.5 rounded-full text-xs font-semibold transition ${s.viewTab === 'pipetting' ? 'bg-accent-600 text-white' : 'border border-slate-300 dark:border-slate-700'}`}
                >
                  Pipetting Scheme &amp; Volumes
                </button>
              </div>

              {s.viewTab === 'map' && (
                <div class="flex flex-wrap items-center gap-2">
                  <div class="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-0.5 rounded-lg text-xs">
                    <button
                      type="button"
                      onClick={() => set({ displayMode: 'labels' })}
                      class={`px-2.5 py-1 rounded-md text-xs font-medium transition ${s.displayMode === 'labels' ? 'bg-white dark:bg-slate-700 shadow-2xs text-slate-900 dark:text-slate-100 font-semibold' : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-200'}`}
                      title="Show well ID, sample name, and concentration"
                    >
                      Labels &amp; Values
                    </button>
                    <button
                      type="button"
                      onClick={() => set({ displayMode: 'concentrations' })}
                      class={`px-2.5 py-1 rounded-md text-xs font-medium transition ${s.displayMode === 'concentrations' ? 'bg-white dark:bg-slate-700 shadow-2xs text-slate-900 dark:text-slate-100 font-semibold' : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-200'}`}
                      title="Show large prominent concentration values"
                    >
                      Concentrations
                    </button>
                    <button
                      type="button"
                      onClick={() => set({ displayMode: 'samples' })}
                      class={`px-2.5 py-1 rounded-md text-xs font-medium transition ${s.displayMode === 'samples' ? 'bg-white dark:bg-slate-700 shadow-2xs text-slate-900 dark:text-slate-100 font-semibold' : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-200'}`}
                      title="Show sample names and role tags"
                    >
                      Sample Groups
                    </button>
                    <button
                      type="button"
                      onClick={() => set({ displayMode: 'shading' })}
                      class={`px-2.5 py-1 rounded-md text-xs font-medium transition ${s.displayMode === 'shading' ? 'bg-white dark:bg-slate-700 shadow-2xs text-slate-900 dark:text-slate-100 font-semibold' : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-200'}`}
                      title="Heatmap gradient color shading"
                    >
                      Color Shading
                    </button>
                  </div>

                  <div class="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-0.5 rounded-lg text-xs">
                    <button
                      type="button"
                      onClick={() => setDensity('normal')}
                      class={`px-2 py-1 rounded-md text-xs font-medium transition ${density === 'normal' ? 'bg-white dark:bg-slate-700 shadow-2xs text-slate-900 dark:text-slate-100 font-semibold' : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-200'}`}
                    >
                      Normal
                    </button>
                    <button
                      type="button"
                      onClick={() => setDensity('compact')}
                      class={`px-2 py-1 rounded-md text-xs font-medium transition ${density === 'compact' ? 'bg-white dark:bg-slate-700 shadow-2xs text-slate-900 dark:text-slate-100 font-semibold' : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-200'}`}
                    >
                      📱 Compact
                    </button>
                  </div>
                </div>
              )}
            </div>

            {s.viewTab === 'map' && (
              <div class="h-8 min-h-[32px] flex items-center px-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/60 text-xs font-mono transition-colors">
                {hoveredWell ? (
                  <div class="flex items-center gap-2 truncate">
                    <span class="font-bold text-accent-600 dark:text-accent-400">{hoveredWell.id}</span>
                    <span class="text-slate-400">|</span>
                    <span class="text-slate-800 dark:text-slate-200 truncate">{hoveredWell.sampleName || 'Empty'}</span>
                    {hoveredWell.value !== undefined && (
                      <span class="text-slate-500 font-semibold">
                        ({hoveredWell.value >= 0.01 ? hoveredWell.value.toFixed(2) : hoveredWell.value.toExponential(2)} {hoveredWell.unit || ''})
                      </span>
                    )}
                  </div>
                ) : (
                  <span class="text-slate-400 text-xs italic">
                    Hover over any well for live readout &bull; Click to inspect &amp; edit
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Selected Well Inspector & Inline Editor Card */}
          {selectedWell && s.viewTab === 'map' && (
            <div class="rounded-2xl border border-sky-200 dark:border-sky-800 bg-sky-50/50 dark:bg-sky-950/30 p-3.5 space-y-2.5 transition shadow-xs">
              <div class="flex flex-wrap items-center justify-between gap-2">
                <div class="flex items-center gap-2.5">
                  <span
                    class="w-6 h-6 rounded-full border border-black/20 shadow-xs flex items-center justify-center font-mono font-bold text-[10px]"
                    style={{
                      backgroundColor: selectedGroup ? selectedGroup.color : '#e2e8f0',
                      color: selectedGroup ? (selectedGroup.color === '#ffffff' ? '#0f172a' : '#ffffff') : '#64748b'
                    }}
                  >
                    {selectedWell.id}
                  </span>
                  <div>
                    <div class="flex items-center gap-2">
                      <h4 class="font-bold text-xs sm:text-sm text-slate-900 dark:text-slate-100">
                        Well {selectedWell.id}
                      </h4>
                      <span class="text-[11px] text-slate-500 font-mono">
                        (Row {selectedWell.row}, Col {selectedWell.col})
                      </span>
                      {selectedGroup && (
                        <span class="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-sky-200/80 dark:bg-sky-900/60 text-sky-800 dark:text-sky-300">
                          {selectedGroup.type}
                        </span>
                      )}
                    </div>
                    <p class="text-xs text-slate-600 dark:text-slate-400">
                      {selectedWell.sampleName || 'Unassigned / Empty Well'}
                      {selectedWell.value !== undefined ? ` · ${formatWellConcentration(selectedWell.value)} ${selectedWell.unit || ''}` : ''}
                    </p>
                  </div>
                </div>

                <div class="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => handlePaintWellWithActive(selectedWell.id)}
                    class="px-2.5 py-1 text-xs font-semibold rounded-lg bg-sky-600 hover:bg-sky-700 text-white transition shadow-2xs flex items-center gap-1"
                  >
                    <span>🖌️ Paint with {activeGroup?.name || 'Active'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleClearSingleWell(selectedWell.id)}
                    class="px-2.5 py-1 text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition"
                  >
                    Clear Well
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedWellId(null)}
                    class="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                    title="Dismiss Inspector"
                  >
                    ✕
                  </button>
                </div>
              </div>

              {/* Quick In-Place Editor Fields */}
              <div class="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-2 border-t border-sky-200/60 dark:border-sky-800/60">
                <div>
                  <label class="block text-[10px] font-semibold text-slate-500 uppercase mb-1">Assign Group</label>
                  <select
                    value={selectedWell.sampleGroupId || ''}
                    onChange={(e) => handleSetWellGroup(selectedWell.id, (e.target as HTMLSelectElement).value)}
                    class="w-full text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 p-1.5 font-medium"
                  >
                    <option value="">(Empty / Unassigned)</option>
                    {groups.map(g => (
                      <option key={g.id} value={g.id}>{g.name} ({g.type})</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label class="block text-[10px] font-semibold text-slate-500 uppercase mb-1">Concentration / Value</label>
                  <input
                    type="number"
                    step="any"
                    value={selectedWell.value ?? ''}
                    placeholder="e.g. 10"
                    onInput={(e) => handleSetWellValue(selectedWell.id, parseFloat((e.target as HTMLInputElement).value))}
                    class="w-full text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 p-1.5 font-mono font-medium"
                  />
                </div>
                <div>
                  <label class="block text-[10px] font-semibold text-slate-500 uppercase mb-1">Unit</label>
                  <input
                    type="text"
                    value={selectedWell.unit ?? ''}
                    placeholder="e.g. µM, ng/mL, OD600"
                    onInput={(e) => handleSetWellUnit(selectedWell.id, (e.target as HTMLInputElement).value)}
                    class="w-full text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 p-1.5 font-medium"
                  />
                </div>
              </div>
            </div>
          )}

          {s.viewTab === 'map' ? (
            <PlateChassis
              format={dim.format}
              rows={dim.rows}
              cols={dim.cols}
              rowLabels={dim.rowLabels}
              density={density}
              selectedWellId={selectedWellId}
              onRowClick={handlePaintRow}
              onColClick={handlePaintCol}
              onWellClick={handleWellClick}
              onWellMouseDown={handleMouseDown}
              onWellMouseEnter={(rIdx, colNum) => {
                handleMouseEnter(rIdx, colNum);
                const rowChar = dim.rowLabels[rIdx]!;
                setHoveredWell(wells[`${rowChar}${colNum}`] || null);
              }}
              onWellMouseLeave={() => setHoveredWell(null)}
              subtitle={`${dim.rows} × ${dim.cols} Grid · ${assignedCount} / ${totalWells} Wells Filled`}
              getWellData={(wellId, rowChar, colNum, rIdx) => {
                const well = wells[wellId];
                const group = groups.find(g => g.id === well?.sampleGroupId);
                const isOccupied = !!group;
                const isSelected = selectedWellId === wellId;

                let isDragSelected = false;
                if (dragStart && dragCurrent) {
                  const rMin = Math.min(dragStart.rowIdx, dragCurrent.rowIdx);
                  const rMax = Math.max(dragStart.rowIdx, dragCurrent.rowIdx);
                  const cMin = Math.min(dragStart.col, dragCurrent.col);
                  const cMax = Math.max(dragStart.col, dragCurrent.col);
                  isDragSelected = rIdx >= rMin && rIdx <= rMax && colNum >= cMin && colNum <= cMax;
                }

                let opacity = 1.0;
                if (isOccupied && well?.value !== undefined && well.value > 0) {
                  const range = groupValueRanges[group.id];
                  if (range && range.max > range.min) {
                    const minLog = Math.log10(Math.max(1e-6, range.min));
                    const maxLog = Math.log10(Math.max(1e-6, range.max));
                    const curLog = Math.log10(Math.max(1e-6, well.value));
                    const frac = maxLog > minLog ? (curLog - minLog) / (maxLog - minLog) : 1;
                    opacity = 0.25 + 0.75 * Math.max(0, Math.min(1, frac));
                  }
                }

                const isCompact = density === 'compact' || dim.format > 96;
                let content: ComponentChildren = undefined;
                if (isCompact) {
                  content = isOccupied ? (
                    <span class="text-[9px] font-mono font-extrabold leading-none">{wellId}</span>
                  ) : (
                    <span class="text-[8px] font-mono text-slate-300 dark:text-slate-600 leading-none">{wellId}</span>
                  );
                } else {
                  if (s.displayMode === 'labels') {
                    content = (
                      <div class="flex flex-col items-center justify-between w-full h-full py-0.5">
                        <span class="text-[8px] font-mono leading-none font-bold opacity-75">{wellId}</span>
                        <span class="text-[9px] sm:text-[10px] leading-tight font-extrabold truncate w-full text-center px-0.5">
                          {well?.sampleName || (isOccupied ? group.name : '—')}
                        </span>
                        <span class="text-[8px] font-mono leading-none font-bold truncate w-full text-center opacity-90">
                          {well?.value !== undefined ? `${formatWellConcentration(well.value)} ${well.unit || ''}` : ''}
                        </span>
                      </div>
                    );
                  } else if (s.displayMode === 'concentrations') {
                    content = (
                      <div class="flex flex-col items-center justify-center w-full h-full">
                        <span class="text-[8px] font-mono leading-none opacity-60 mb-0.5">{wellId}</span>
                        <span class="text-[11px] sm:text-xs font-mono font-black tracking-tight leading-tight">
                          {well?.value !== undefined ? formatWellConcentration(well.value) : (isOccupied ? '—' : '')}
                        </span>
                        {well?.unit && (
                          <span class="text-[8px] font-mono leading-none opacity-80 mt-0.5">{well.unit}</span>
                        )}
                      </div>
                    );
                  } else if (s.displayMode === 'samples') {
                    content = (
                      <div class="flex flex-col items-center justify-center w-full h-full px-0.5">
                        <span class="text-[8px] font-mono leading-none opacity-60 mb-0.5">{wellId}</span>
                        <span class="text-[10px] font-extrabold leading-tight text-center truncate w-full">
                          {well?.sampleName || (isOccupied ? group.name : 'Empty')}
                        </span>
                        {group && (
                          <span class="text-[7px] uppercase font-bold tracking-wider opacity-75 mt-0.5">
                            {group.type}
                          </span>
                        )}
                      </div>
                    );
                  } else if (s.displayMode === 'shading') {
                    content = (
                      <div class="flex flex-col items-center justify-center">
                        <span class={`text-[10px] font-mono font-bold ${isOccupied ? 'opacity-90' : 'text-slate-400 dark:text-slate-600'}`}>
                          {wellId}
                        </span>
                        {well?.value !== undefined && (
                          <span class="text-[8px] font-mono opacity-75">
                            {formatWellConcentration(well.value)}
                          </span>
                        )}
                      </div>
                    );
                  }
                }

                return {
                  id: wellId,
                  row: rowChar,
                  col: colNum,
                  bgColor: isOccupied ? hexToRgba(group.color, s.displayMode === 'shading' ? opacity : 0.92) : undefined,
                  textColor: isOccupied ? getWellTextColor(group.color) : undefined,
                  isSelected,
                  isDragSelected,
                  title: `${wellId}: ${well?.sampleName || 'Empty'} ${well?.value !== undefined ? `(${well.value} ${well.unit || ''})` : ''}`,
                  content,
                };
              }}
            />
          ) : (
            /* Pipetting Scheme & Reagent Planner */
            <div class="space-y-4">
              {/* Parameter Settings Card */}
              <div class="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 space-y-3">
                <div class="flex items-center justify-between">
                  <h3 class="font-bold text-sm text-slate-900 dark:text-slate-100">
                    Pipetting &amp; Reagent Parameters
                  </h3>
                  <span class="text-xs text-slate-500">
                    Adjust volumes and stock concentrations for automated calculations
                  </span>
                </div>
                <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div>
                    <label class="block text-xs font-medium text-slate-500 mb-1">Working Vol / Well (µL)</label>
                    <DecimalInput
                      value={s.workingVolumeUl}
                      onChange={workingVolumeUl => set({ workingVolumeUl: Math.max(1, workingVolumeUl) })}
                      min={1}
                      class="w-full rounded-lg border border-slate-300 dark:border-slate-700 p-1.5 text-xs dark:bg-slate-950 font-semibold font-mono"
                    />
                  </div>
                  <div>
                    <label class="block text-xs font-medium text-slate-500 mb-1">Transfer Vol (µL)</label>
                    <DecimalInput
                      value={s.transferVolumeUl}
                      onChange={transferVolumeUl => set({ transferVolumeUl: Math.max(1, transferVolumeUl) })}
                      min={1}
                      class="w-full rounded-lg border border-slate-300 dark:border-slate-700 p-1.5 text-xs dark:bg-slate-950 font-semibold font-mono"
                    />
                  </div>
                  <div>
                    <label class="block text-xs font-medium text-slate-500 mb-1">Stock Conc ({s.dilutionUnit || 'µM'})</label>
                    <DecimalInput
                      value={s.stockConc}
                      onChange={stockConc => set({ stockConc: Math.max(0.001, stockConc) })}
                      min={0.001}
                      class="w-full rounded-lg border border-slate-300 dark:border-slate-700 p-1.5 text-xs dark:bg-slate-950 font-semibold font-mono"
                      placeholder="e.g. 340"
                    />
                  </div>
                  <div>
                    <label class="block text-xs font-medium text-slate-500 mb-1">Pipette Type</label>
                    <select
                      value={s.pipetteType}
                      onChange={(e) => set({ pipetteType: (e.target as HTMLSelectElement).value as State['pipetteType'] })}
                      class="w-full rounded-lg border border-slate-300 dark:border-slate-700 p-1.5 bg-white dark:bg-slate-950 text-xs font-semibold"
                    >
                      <option value="single">Single Channel</option>
                      <option value="8-channel">8-Channel Multichannel</option>
                      <option value="12-channel">12-Channel Multichannel</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* KPI Summary Cards */}
              <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div class="p-3.5 rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
                  <span class="text-xs text-slate-500 block">Assigned Wells</span>
                  <span class="font-mono text-2xl font-bold text-slate-900 dark:text-slate-100">
                    {pipettingPlan.totalAssignedWells}
                  </span>
                  <span class="text-[11px] text-slate-400 block">out of {totalWells} wells</span>
                </div>

                <div class="p-3.5 rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
                  <span class="text-xs text-slate-500 block">Total Diluent Buffer</span>
                  <span class="font-mono text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                    {(pipettingPlan.totalDiluentNeededUl / 1000).toFixed(2)} mL
                  </span>
                  <span class="text-[11px] text-slate-400 block">{pipettingPlan.workingVolumeUl} µL / well</span>
                </div>

                <div class="p-3.5 rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
                  <span class="text-xs text-slate-500 block">Stock Reagents</span>
                  <span class="font-mono text-2xl font-bold text-accent-600 dark:text-accent-400">
                    {pipettingPlan.totalStockNeededUl >= 1000 ? `${(pipettingPlan.totalStockNeededUl / 1000).toFixed(2)} mL` : `${Math.round(pipettingPlan.totalStockNeededUl)} µL`}
                  </span>
                  <span class="text-[11px] text-slate-400 block">concentrated stocks</span>
                </div>

                <div class="p-3.5 rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
                  <span class="text-xs text-slate-500 block">Initial Well Prep</span>
                  <span class="font-mono text-sm font-bold text-indigo-600 dark:text-indigo-400 block mt-1">
                    {s.stockConc ? `${s.stockConc} ${s.dilutionUnit} Stock` : 'Direct Stock'}
                  </span>
                  <span class="text-[11px] text-slate-400 block">C₁V₁ = C₂V₂ dilution</span>
                </div>
              </div>

              {/* Visual Serial Dilution Transfer Flow Graph */}
              {(pipettingPlan.dilutionSeriesPlans?.length ?? 0) > 0 && (
                <div class="space-y-4">
                  {pipettingPlan.dilutionSeriesPlans!.map((dsp, dIdx) => (
                    <div key={dIdx} class="rounded-2xl border border-indigo-200 dark:border-indigo-900/60 bg-gradient-to-br from-indigo-50/40 to-slate-50 dark:from-indigo-950/20 dark:to-slate-900 p-4 space-y-3">
                      <div class="flex flex-wrap items-center justify-between gap-2 border-b border-indigo-100 dark:border-indigo-900/40 pb-2.5">
                        <div class="flex items-center gap-2">
                          <span class="px-2 py-0.5 rounded text-xs font-bold bg-indigo-600 text-white">
                            Dilution Series Graph
                          </span>
                          <h4 class="font-bold text-sm text-slate-900 dark:text-slate-100">
                            {dsp.groupName} ({dsp.wellsInOrder.length} wells)
                          </h4>
                        </div>
                        <div class="flex items-center gap-2 text-xs font-mono text-slate-600 dark:text-slate-400">
                          <span>Target Range: <strong>{dsp.wellsInOrder[dsp.wellsInOrder.length - 1]?.targetConc !== undefined ? formatWellConcentration(dsp.wellsInOrder[dsp.wellsInOrder.length - 1]!.targetConc) : '0'} – {formatWellConcentration(dsp.initialTargetConc)} {dsp.unit}</strong></span>
                        </div>
                      </div>

                      {/* Stock Solution Prep Callout */}
                      {dsp.stockConc && dsp.stockVolumePerInitialWellUl > 0 && (
                        <div class="rounded-xl border border-amber-200 dark:border-amber-900/60 bg-amber-50/60 dark:bg-amber-950/20 p-3 text-xs space-y-1">
                          <div class="flex items-center gap-2 font-bold text-amber-900 dark:text-amber-200">
                            <span>🧪 Step 1: Initial Well Preparation (from {dsp.stockConc} {dsp.unit} Stock)</span>
                          </div>
                          <p class="text-amber-800 dark:text-amber-300">
                            To generate the initial well target of <strong>{dsp.initialTargetConc} {dsp.unit}</strong> in <strong>{dsp.initialTotalVolumeUl} µL</strong> (working volume + transfer excess) per replicate well ({dsp.initialWellIds.join(', ')}):
                          </p>
                          <div class="flex flex-wrap gap-2 pt-1 font-mono text-[11px]">
                            <span class="px-2 py-1 rounded bg-white dark:bg-slate-900 border border-amber-300 dark:border-amber-700 text-amber-900 dark:text-amber-200">
                              Buffer to Add: <strong>{dsp.bufferVolumePerInitialWellUl.toFixed(1)} µL</strong>
                            </span>
                            <span class="px-2 py-1 rounded bg-white dark:bg-slate-900 border border-amber-300 dark:border-amber-700 text-amber-900 dark:text-amber-200">
                              + Stock ({dsp.stockConc} {dsp.unit}) to Add: <strong>{dsp.stockVolumePerInitialWellUl.toFixed(1)} µL</strong>
                            </span>
                            <span class="px-2 py-1 rounded bg-white dark:bg-slate-900 border border-amber-300 dark:border-amber-700 text-emerald-700 dark:text-emerald-400 font-bold">
                              = Total Initial Vol: <strong>{dsp.initialTotalVolumeUl} µL</strong> ({dsp.initialTargetConc} {dsp.unit})
                            </span>
                          </div>
                        </div>
                      )}

                      {/* Transfer Flow Diagram */}
                      <div class="overflow-x-auto pb-2">
                        <div class="flex items-center gap-1.5 min-w-max py-2">
                          {dsp.wellsInOrder.map((w, idx) => {
                            const isFirst = idx === 0;
                            const isLast = idx === dsp.wellsInOrder.length - 1;
                            return (
                              <div key={w.wellId} class="flex items-center gap-1.5">
                                {/* Well Node Card */}
                                <div class={`rounded-xl border p-2.5 w-32 shrink-0 space-y-1 shadow-2xs ${isFirst ? 'border-accent-400 bg-accent-50/60 dark:bg-accent-950/40 dark:border-accent-700' : isLast && w.targetConc === 0 ? 'border-slate-300 bg-slate-100/60 dark:bg-slate-800/40 dark:border-slate-700' : 'border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900'}`}>
                                  <div class="flex items-center justify-between">
                                    <span class="font-mono font-bold text-xs text-slate-900 dark:text-slate-100">
                                      Well {w.wellId}
                                    </span>
                                    <span class="text-[10px] font-semibold px-1 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                                      #{idx + 1}
                                    </span>
                                  </div>
                                  <div class="font-mono font-extrabold text-sm text-accent-700 dark:text-accent-300 truncate">
                                    {w.targetConc !== undefined ? `${formatWellConcentration(w.targetConc)} ${w.unit || ''}` : 'Blank'}
                                  </div>
                                  <div class="text-[10px] text-slate-500 leading-tight">
                                    {isFirst ? (
                                      <span>Start: {dsp.initialTotalVolumeUl} µL ➔ retains {dsp.workingVolumeUl} µL</span>
                                    ) : isLast ? (
                                      <span>Final: {dsp.workingVolumeUl} µL ({dsp.transferVolumeUl} µL to waste)</span>
                                    ) : (
                                      <span>Pre-fill: {w.prefillBufferUl} µL ➔ retains {w.finalVolumeUl} µL</span>
                                    )}
                                  </div>
                                </div>

                                {/* Directed Transfer Arrow */}
                                {!isLast && (
                                  <div class="flex flex-col items-center justify-center shrink-0 px-1 text-center">
                                    <span class="text-[10px] font-mono font-bold text-indigo-600 dark:text-indigo-400 whitespace-nowrap">
                                      {dsp.transferVolumeUl} µL ➔
                                    </span>
                                    <span class="text-[9px] text-slate-400 whitespace-nowrap">
                                      Mix 3-5×
                                    </span>
                                  </div>
                                )}

                                {isLast && (
                                  <div class="flex flex-col items-center justify-center shrink-0 px-1 text-center">
                                    <span class="text-[10px] font-mono font-bold text-rose-600 dark:text-rose-400 whitespace-nowrap">
                                      ➔ Waste
                                    </span>
                                    <span class="text-[9px] text-slate-400 whitespace-nowrap">
                                      Discard {dsp.transferVolumeUl} µL
                                    </span>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Reagent Requirement Breakdown Table */}
              <div class="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 space-y-3">
                <div class="flex items-center justify-between">
                  <h3 class="font-bold text-sm text-slate-900 dark:text-slate-100">
                    Reagent &amp; Sample Requirements Breakdown
                  </h3>
                  <span class="text-xs text-slate-500">
                    Calculated for {pipettingPlan.workingVolumeUl} µL/well (+ {pipettingPlan.transferVolumeUl} µL transfer excess)
                  </span>
                </div>
                <div class="overflow-x-auto">
                  <table class="w-full text-left text-xs">
                    <thead>
                      <tr class="border-b border-slate-200 dark:border-slate-800 text-slate-400 font-semibold">
                        <th class="pb-2">Sample / Reagent</th>
                        <th class="pb-2">Role</th>
                        <th class="pb-2 text-center">Assigned Wells</th>
                        <th class="pb-2 text-right">Stock Solution Needed</th>
                        <th class="pb-2 text-right">Diluent / Buffer Needed</th>
                        <th class="pb-2 text-center">Loading Mode</th>
                      </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-100 dark:divide-slate-800/60 font-medium">
                      {pipettingPlan.reagentSummaries.map((item, i) => (
                        <tr key={i} class="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                          <td class="py-2.5 font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                            <span>{item.sampleName}</span>
                          </td>
                          <td class="py-2.5 capitalize text-slate-500">{item.type}</td>
                          <td class="py-2.5 text-center font-mono">{item.wellCount} wells ({item.wells.slice(0, 4).join(', ')}{item.wells.length > 4 ? '…' : ''})</td>
                          <td class="py-2.5 text-right font-mono font-bold text-accent-600 dark:text-accent-400">
                            {item.stockVolumeNeededUl > 0 ? `${item.stockVolumeNeededUl >= 1000 ? `${(item.stockVolumeNeededUl / 1000).toFixed(2)} mL` : `${Math.round(item.stockVolumeNeededUl)} µL`}` : '—'}
                          </td>
                          <td class="py-2.5 text-right font-mono font-bold text-emerald-600 dark:text-emerald-400">
                            {item.diluentVolumeNeededUl > 0 ? `${item.diluentVolumeNeededUl >= 1000 ? `${(item.diluentVolumeNeededUl / 1000).toFixed(2)} mL` : `${Math.round(item.diluentVolumeNeededUl)} µL`}` : '—'}
                          </td>
                          <td class="py-2.5 text-center">
                            <span class={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${item.isDilution ? 'bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-200' : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'}`}>
                              {item.isDilution ? 'Serial Transfer' : 'Direct Add'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Step-by-Step Multichannel Loading Protocol */}
              <div class="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 space-y-3">
                <h3 class="font-bold text-sm text-slate-900 dark:text-slate-100">
                  Step-by-Step Multichannel Loading Protocol
                </h3>
                <div class="space-y-2">
                  {pipettingPlan.steps.map(step => (
                    <div
                      key={step.stepNumber}
                      class="p-3 rounded-xl border border-slate-200 dark:border-slate-800 flex items-start gap-3 bg-slate-50/50 dark:bg-slate-950/40"
                    >
                      <span class="w-6 h-6 rounded-full bg-accent-600 text-white font-bold text-xs flex items-center justify-center shrink-0 shadow-xs">
                        {step.stepNumber}
                      </span>
                      <div class="flex-1 text-xs space-y-1">
                        <p class="font-semibold text-slate-900 dark:text-slate-100">
                          {step.description}
                        </p>
                        <div class="flex flex-wrap items-center gap-3 text-[11px] text-slate-500 dark:text-slate-400">
                          {step.volumeUl > 0 && (
                            <span>Vol: <strong>{step.volumeUl >= 1000 ? `${(step.volumeUl / 1000).toFixed(2)} mL` : `${step.volumeUl.toFixed(1)} µL`}</strong></span>
                          )}
                          <span>Source: <strong>{step.source}</strong></span>
                          <span>Dest: <strong>{step.destination}</strong></span>
                          <span class="px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-800 text-[10px] font-mono">
                            {step.pipetteType}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

        </div>
      }
      actions={<ActionBar onCopy={() => copyText} shareUrl={shareUrl} />}
      science={<SciencePanel science={SCIENCE} />}
    />

    {/* Paste Matrix from Excel Modal */}
    {showPasteModal && (
      <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
        <div class="w-full max-w-2xl rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-900 space-y-4">
          <div class="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
            <div>
              <h3 class="text-base font-bold text-slate-900 dark:text-slate-100">
                Paste Plate Matrix from Excel / Google Sheets
              </h3>
              <p class="text-xs text-slate-500">
                Copy an 8×12 (or matching) block from Excel and paste it below.
              </p>
            </div>
            <button
              type="button"
              onClick={() => { setShowPasteModal(false); setPasteError(''); }}
              class="rounded-lg p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-base"
            >
              ✕
            </button>
          </div>
          <div>
            <label class="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Matrix Data (TSV / CSV):
            </label>
            <textarea
              rows={10}
              value={pasteText}
              onInput={e => { setPasteText((e.target as HTMLTextAreaElement).value); setPasteError(''); }}
              placeholder={`Example copied from Excel:\nSample 1\tSample 1\tSample 2\tSample 2\t...\nStd (100 µM)\tStd (50 µM)\tStd (25 µM)\t...\nBlank\tBlank\tNegative\tPositive\t...`}
              class="w-full font-mono text-xs p-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 dark:text-slate-100 focus:border-accent-500 focus:outline-none"
            />
            <p class="text-[11px] text-slate-400 mt-1">
              Optional row labels (A–H) and column headers (1–12) are auto-detected and parsed. Sample names and concentrations e.g. "Std (100 nM)" or "50 µM" will be automatically extracted into groups and values.
            </p>
          </div>
          {pasteError && (
            <p class="text-xs text-rose-600 dark:text-rose-400 font-semibold">{pasteError}</p>
          )}
          <div class="flex items-center justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
            <button
              type="button"
              onClick={() => { setShowPasteModal(false); setPasteError(''); }}
              class="px-4 py-2 text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleImportMatrix}
              class="px-4 py-2 text-xs font-semibold rounded-lg bg-accent-600 text-white hover:bg-accent-700 transition shadow-xs"
            >
              Apply to Plate Layout
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}
