import { type AnnotationToken, type NormalizationConfig, type ParsedLayoutAnnotation, type ParsedPlate, type PlateFormat, ROW_LABELS_384, ROW_LABELS_96, type SampleGroup, type SampleType, type WellValue } from './types';
import { mean } from './stats';
import { detectDelimiter, isListExport, parseWellId, splitLine } from './parse';

/* ========================================================================= */
/* 3. Layout Presets & Normalization Engine                                  */
/* ========================================================================= */

/** Standard Dose-Response layout generator */
export function applyDoseResponsePreset(
  plate: ParsedPlate,
): { wells: Record<string, WellValue>; groups: SampleGroup[] } {
  const wells = { ...plate.wells };
  const groups: SampleGroup[] = [
    { id: 'blank', name: 'Media Blank', color: '#94a3b8', type: 'blank' },
    { id: 'pos-ctrl', name: 'Positive Control (Lysis 100%)', color: '#10b981', type: 'pos-ctrl' },
    { id: 'neg-ctrl', name: 'Negative Control (Vehicle)', color: '#64748b', type: 'neg-ctrl' },
  ];

  const concs = [100, 31.6, 10.0, 3.16, 1.0, 0.316, 0.10, 0.0316];
  const concColors = [
    '#3b82f6', '#2563eb', '#1d4ed8', '#4f46e5',
    '#7c3aed', '#9333ea', '#c026d3', '#db2777',
  ];

  concs.forEach((c, idx) => {
    groups.push({
      id: `conc-${idx + 1}`,
      name: `${c} µM`,
      color: concColors[idx] ?? '#3b82f6',
      type: 'sample',
      concentration: c,
      concentrationUnit: 'µM',
    });
  });

  const rowList = plate.format === 96 ? ROW_LABELS_96 : ROW_LABELS_384;
  const maxCols = plate.format === 96 ? 12 : 24;

  for (const r of rowList) {
    const isEdgeRow = plate.format === 96 ? (r === 'A' || r === 'H') : (r === 'A' || r === 'P');

    for (let c = 1; c <= maxCols; c++) {
      const wellId = `${r}${c}`;
      const current = wells[wellId];
      if (!current) continue;

      if (isEdgeRow) {
        wells[wellId] = {
          ...current,
          sampleGroupId: 'blank',
          sampleName: 'Media Blank',
          sampleType: 'blank',
        };
      } else if (c <= 8) {
        const g = groups[3 + (c - 1)]!;
        wells[wellId] = {
          ...current,
          sampleGroupId: g.id,
          sampleName: g.name,
          sampleType: 'sample',
          concentration: g.concentration,
          concentrationUnit: 'µM',
        };
      } else if (c === 9) {
        wells[wellId] = {
          ...current,
          sampleGroupId: 'pos-ctrl',
          sampleName: 'Positive Control',
          sampleType: 'pos-ctrl',
        };
      } else if (c === 10) {
        wells[wellId] = {
          ...current,
          sampleGroupId: 'neg-ctrl',
          sampleName: 'Negative Control',
          sampleType: 'neg-ctrl',
        };
      } else {
        wells[wellId] = {
          ...current,
          sampleGroupId: 'blank',
          sampleName: 'Media Blank',
          sampleType: 'blank',
        };
      }
    }
  }

  return { wells, groups };
}

/** Standard Column-wise Replicates layout */
export function applyColumnReplicatesPreset(
  plate: ParsedPlate,
): { wells: Record<string, WellValue>; groups: SampleGroup[] } {
  const wells = { ...plate.wells };
  const groups: SampleGroup[] = [
    { id: 'blank', name: 'Blank (Col 1)', color: '#94a3b8', type: 'blank' },
    { id: 'neg-ctrl', name: 'Vehicle Ctrl (Col 2)', color: '#64748b', type: 'neg-ctrl' },
    { id: 'pos-ctrl', name: 'Pos Ctrl (Col 3)', color: '#10b981', type: 'pos-ctrl' },
  ];

  const maxCols = plate.format === 96 ? 12 : 24;
  const sampleColors = ['#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#06b6d4', '#14b8a6', '#f97316', '#a855f7', '#6366f1'];

  for (let c = 4; c <= maxCols; c++) {
    const sIdx = c - 3;
    groups.push({
      id: `sample-${sIdx}`,
      name: `Sample ${sIdx} (Col ${c})`,
      color: sampleColors[(sIdx - 1) % sampleColors.length] ?? '#3b82f6',
      type: 'sample',
    });
  }

  for (const wellId of Object.keys(wells)) {
    const w = wells[wellId]!;
    if (w.col === 1) {
      wells[wellId] = { ...w, sampleGroupId: 'blank', sampleName: 'Blank', sampleType: 'blank' };
    } else if (w.col === 2) {
      wells[wellId] = { ...w, sampleGroupId: 'neg-ctrl', sampleName: 'Vehicle Ctrl', sampleType: 'neg-ctrl' };
    } else if (w.col === 3) {
      wells[wellId] = { ...w, sampleGroupId: 'pos-ctrl', sampleName: 'Pos Ctrl', sampleType: 'pos-ctrl' };
    } else {
      const g = groups[3 + (w.col - 4)];
      if (g) {
        wells[wellId] = { ...w, sampleGroupId: g.id, sampleName: g.name, sampleType: 'sample' };
      }
    }
  }

  return { wells, groups };
}

/** Standard 384-well HTS layout */
export function applyHts384Preset(
  plate: ParsedPlate,
): { wells: Record<string, WellValue>; groups: SampleGroup[] } {
  const wells = { ...plate.wells };
  const groups: SampleGroup[] = [
    { id: 'pos-ctrl', name: 'Positive Control (Max Signal)', color: '#10b981', type: 'pos-ctrl' },
    { id: 'neg-ctrl', name: 'Negative Control (Vehicle)', color: '#64748b', type: 'neg-ctrl' },
    { id: 'screen-samples', name: 'Screening Compounds', color: '#3b82f6', type: 'sample' },
  ];

  for (const wellId of Object.keys(wells)) {
    const w = wells[wellId]!;
    if (w.col <= 2) {
      wells[wellId] = { ...w, sampleGroupId: 'pos-ctrl', sampleName: 'Pos Ctrl', sampleType: 'pos-ctrl' };
    } else if (w.col >= 23) {
      wells[wellId] = { ...w, sampleGroupId: 'neg-ctrl', sampleName: 'Neg Ctrl', sampleType: 'neg-ctrl' };
    } else {
      wells[wellId] = { ...w, sampleGroupId: 'screen-samples', sampleName: 'Screening Sample', sampleType: 'sample' };
    }
  }

  return { wells, groups };
}

/** Standard ELISA Sandwich Layout Generator (Standards in cols 1-2, Unknowns in duplicate) */
export function applyElisaPreset(
  plate: ParsedPlate,
): { wells: Record<string, WellValue>; groups: SampleGroup[] } {
  const wells = { ...plate.wells };
  const groups: SampleGroup[] = [];

  const stdConcs = [1000, 500, 250, 125, 62.5, 31.25, 15.6, 0];
  const rows = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

  // Standards in columns 1 and 2 (duplicate)
  stdConcs.forEach((conc, idx) => {
    const isZero = conc === 0;
    const g: SampleGroup = {
      id: `std-${conc}`,
      name: isZero ? 'Standard 0 pg/mL (Zero)' : `Standard ${conc} pg/mL`,
      color: isZero ? '#94a3b8' : '#8b5cf6',
      type: 'standard',
      concentration: conc,
      concentrationUnit: 'pg/mL',
    };
    groups.push(g);

    const r = rows[idx]!;
    for (const c of [1, 2]) {
      const wid = `${r}${c}`;
      if (wells[wid]) {
        wells[wid] = {
          ...wells[wid]!,
          sampleGroupId: g.id,
          sampleName: g.name,
          sampleType: g.type,
          concentration: conc,
          concentrationUnit: 'pg/mL',
        };
      }
    }
  });

  // Unknown Samples in duplicate across columns 3 to 11
  const sampleColors = ['#3b82f6', '#ec4899', '#f59e0b', '#06b6d4', '#10b981', '#6366f1', '#14b8a6', '#f97316'];
  let sampleCount = 1;

  for (let c = 3; c <= 10; c += 2) {
    for (let rIdx = 0; rIdx < 8; rIdx += 2) {
      const sName = `Serum Sample ${sampleCount}`;
      const sId = `sample-${sampleCount}`;
      const sColor = sampleColors[(sampleCount - 1) % sampleColors.length] ?? '#3b82f6';
      groups.push({
        id: sId,
        name: sName,
        color: sColor,
        type: 'sample',
        concentrationUnit: 'pg/mL',
      });

      for (let dr = 0; dr < 2; dr++) {
        for (let dc = 0; dc < 2; dc++) {
          const r = rows[rIdx + dr];
          const col = c + dc;
          if (r && col <= 12) {
            const wid = `${r}${col}`;
            if (wells[wid]) {
              wells[wid] = {
                ...wells[wid]!,
                sampleGroupId: sId,
                sampleName: sName,
                sampleType: 'sample',
                dilutionFactor: 10,
              };
            }
          }
        }
      }
      sampleCount++;
    }
  }

  // Column 12: Media Blanks
  groups.push({
    id: 'blank-buffer',
    name: 'Buffer Blank',
    color: '#94a3b8',
    type: 'blank',
  });
  for (const r of rows) {
    const wid = `${r}12`;
    if (wells[wid]) {
      wells[wid] = {
        ...wells[wid]!,
        sampleGroupId: 'blank-buffer',
        sampleName: 'Buffer Blank',
        sampleType: 'blank',
      };
    }
  }

  return { wells, groups };
}

/** Parse free-text label into structured annotation (Role, Concentration, Dilution, Group) */
export function inferAnnotationFromLabel(token: string): ParsedLayoutAnnotation {
  const clean = token.trim();
  if (!clean || clean === '-' || clean.toLowerCase() === 'empty' || clean.toLowerCase() === 'unassigned') {
    return {
      id: '',
      label: clean,
      sampleName: '',
      sampleGroupId: '',
      sampleType: 'empty',
    };
  }

  const lower = clean.toLowerCase();
  let sampleType: SampleType = 'sample';
  if (/^(blank|blk|buffer|media|bg|background)/i.test(lower)) {
    sampleType = 'blank';
  } else if (/^(pos|pos-ctrl|pos_ctrl|positive|ctrl\+|control\+|max|lysis|100%)/i.test(lower)) {
    sampleType = 'pos-ctrl';
  } else if (/^(neg|neg-ctrl|neg_ctrl|negative|ctrl-|control-|min|vehicle|dmso|untreated|0%)/i.test(lower)) {
    sampleType = 'neg-ctrl';
  } else if (/^(std|standard|cal|calibrator)/i.test(lower)) {
    sampleType = 'standard';
  }

  // Check dilution: e.g. 1:100, 1/100, 1:2
  let dilutionFactor: number | undefined;
  const dilMatch = clean.match(/1[:/]([0-9]+(?:\.[0-9]+)?)/);
  if (dilMatch && dilMatch[1]) {
    dilutionFactor = parseFloat(dilMatch[1]);
  }

  // Check concentration: e.g. 1000 pg/mL, 10 µM, 0.5 mg/mL, 50 nM, 10uM
  let concentration: number | undefined;
  let concentrationUnit: string | undefined;
  const concMatch = clean.match(/([0-9]+(?:\.[0-9]+)?)\s*(µM|uM|nM|pM|mM|M|mg\/ml|µg\/ml|ug\/ml|ng\/ml|pg\/ml|%)/i);
  if (concMatch && concMatch[1]) {
    concentration = parseFloat(concMatch[1]);
    concentrationUnit = concMatch[2];
  } else {
    // Check trailing number in standards, e.g. Std_1000, Std-100
    const trailingNum = clean.match(/[_\s-]([0-9]+(?:\.[0-9]+)?)$/);
    if (trailingNum && trailingNum[1] && (sampleType === 'standard' || lower.startsWith('std'))) {
      concentration = parseFloat(trailingNum[1]);
    }
  }

  let sampleName = clean;
  if (sampleType === 'blank') {
    sampleName = 'Blank';
  } else if (sampleType === 'pos-ctrl') {
    sampleName = 'Positive Control';
  } else if (sampleType === 'neg-ctrl') {
    sampleName = 'Negative Control';
  } else if (sampleType === 'standard') {
    sampleName = concentration !== undefined
      ? `Standard ${concentration}${concentrationUnit ? ` ${concentrationUnit}` : ''}`
      : 'Standard';
  }

  const baseGroupSlug = sampleName.toLowerCase().replace(/[^a-z0-9_-]/g, '-').replace(/-+/g, '-');
  const sampleGroupId = sampleType === 'blank'
    ? 'blank'
    : sampleType === 'pos-ctrl'
    ? 'pos-ctrl'
    : sampleType === 'neg-ctrl'
    ? 'neg-ctrl'
    : concentration !== undefined
    ? `${baseGroupSlug}-${concentration}`
    : dilutionFactor !== undefined
    ? `${baseGroupSlug}-dil-${dilutionFactor}`
    : baseGroupSlug;

  return {
    id: '',
    label: clean,
    sampleName,
    sampleGroupId,
    sampleType,
    concentration,
    concentrationUnit,
    dilutionFactor,
  };
}

/** Parse an 8x12 (or 16x24) layout grid or list text into annotations */
export function parseLayoutGrid(
  text: string,
  options: { format?: PlateFormat; delimiter?: string } = {},
): {
  format: PlateFormat;
  annotations: Record<string, ParsedLayoutAnnotation>;
  uniqueLabels: string[];
} {
  const trimmed = text.trim();
  const format: PlateFormat = options.format ?? 96;
  const rows = format === 96 ? [...ROW_LABELS_96] : [...ROW_LABELS_384];
  const maxCols = format === 96 ? 12 : 24;

  const annotations: Record<string, ParsedLayoutAnnotation> = {};
  const labelSet = new Set<string>();

  if (!trimmed) {
    return { format, annotations, uniqueLabels: [] };
  }

  const rawLines = trimmed.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const delimiter = options.delimiter ?? detectDelimiter(rawLines);

  if (isListExport(rawLines, delimiter)) {
    for (const line of rawLines) {
      if (line.startsWith('#')) continue;
      const tokens = splitLine(line, delimiter);
      if (tokens.length === 0) continue;
      const wellCoord = parseWellId(tokens[0] ?? '');
      if (!wellCoord) continue;
      const label = (tokens[1] ?? '').trim();
      if (!label) continue;
      labelSet.add(label);

      const parsed = inferAnnotationFromLabel(label);
      if (tokens[2] && !isNaN(parseFloat(tokens[2]))) {
        parsed.concentration = parseFloat(tokens[2]);
      }
      if (tokens[3]) {
        const rLower = tokens[3].toLowerCase();
        if (['blank', 'standard', 'pos-ctrl', 'neg-ctrl', 'sample', 'empty'].includes(rLower)) {
          parsed.sampleType = rLower as SampleType;
        }
      }
      parsed.id = wellCoord.id;
      annotations[wellCoord.id] = parsed;
    }
  } else {
    let startIdx = -1;
    let isRowLabeled = false;

    for (let i = 0; i < rawLines.length; i++) {
      const line = rawLines[i]!;
      const tokens = splitLine(line, delimiter);
      const first = tokens[0]?.trim() ?? '';
      if (/^(?:row\s*)?A:?$/i.test(first)) {
        startIdx = i;
        isRowLabeled = true;
        break;
      }
    }

    if (startIdx === -1) {
      for (let i = 0; i < rawLines.length; i++) {
        const line = rawLines[i]!;
        const tokens = splitLine(line, delimiter);
        const first = tokens[0]?.trim() ?? '';
        if (first === '<>' || first.toLowerCase() === 'row' || /^[0-9]+$/.test(first) || /^(layout|sample|plate|wells)/i.test(first)) {
          continue;
        }
        startIdx = i;
        break;
      }
    }

    if (startIdx === -1) startIdx = 0;

    let rPointer = 0;
    for (let i = startIdx; i < rawLines.length && rPointer < rows.length; i++) {
      const line = rawLines[i]!;
      const tokens = splitLine(line, delimiter);
      if (tokens.length === 0) continue;

      const first = tokens[0]?.trim() ?? '';
      if (first === '<>' || first.toLowerCase() === 'row' || /^[0-9]+$/.test(first) || /^(layout|sample|plate|wells)/i.test(first)) {
        continue;
      }

      const expectedRowChar = rows[rPointer]!;
      let valTokens: string[] = [];

      if (isRowLabeled) {
        const rowMatch = first.match(/^(?:row\s*)?([A-P]):?$/i);
        if (!rowMatch) continue;
        const rowChar = rowMatch[1]!.toUpperCase();
        if (rowChar !== expectedRowChar) {
          const targetRIdx = rows.findIndex(r => r === rowChar);
          if (targetRIdx !== -1) {
            rPointer = targetRIdx;
          }
        }
        valTokens = tokens.slice(1);
      } else {
        valTokens = tokens;
      }

      for (let c = 1; c <= maxCols && c <= valTokens.length; c++) {
        const token = valTokens[c - 1] ?? '';
        const wellId = `${rows[rPointer]}${c}`;
        if (token.trim()) {
          labelSet.add(token.trim());
          const parsed = inferAnnotationFromLabel(token);
          parsed.id = wellId;
          annotations[wellId] = parsed;
        }
      }
      rPointer++;
    }
  }

  return {
    format,
    annotations,
    uniqueLabels: Array.from(labelSet),
  };
}

/** Apply layout annotations and optional label role overrides to a parsed plate */
export function applyLayoutAnnotations(
  plate: ParsedPlate,
  annotations: Record<string, Partial<WellValue> & Pick<AnnotationToken, 'label'>>,
  labelOverrides?: Record<string, {
    role?: SampleType;
    concentration?: number;
    unit?: string;
    dilutionFactor?: number;
    customName?: string;
  }>,
): {
  wells: Record<string, WellValue>;
  groups: SampleGroup[];
} {
  const wells = { ...plate.wells };
  const groupsMap = new Map<string, SampleGroup>();

  const colorPalette = [
    '#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#06b6d4',
    '#10b981', '#6366f1', '#14b8a6', '#f97316', '#a855f7',
    '#0284c7', '#d946ef', '#eab308', '#84cc16', '#0ea5e9',
    '#ef4444', '#14b8a6', '#64748b', '#e11d48', '#8b5cf6',
  ];
  let colorIdx = 0;

  for (const [id, w] of Object.entries(wells)) {
    const ann = annotations[id];
    if (!ann || ann.sampleType === 'empty') {
      wells[id] = {
        ...w,
        sampleGroupId: '',
        sampleName: '',
        sampleType: 'empty',
        concentration: undefined,
        concentrationUnit: undefined,
        dilutionFactor: undefined,
      };
      continue;
    }

    const labelKey = ann.label || ann.sampleName || '';
    const override = labelOverrides ? (labelOverrides[labelKey] || labelOverrides[ann.sampleName || '']) : undefined;

    const sampleType = override?.role ?? ann.sampleType ?? 'sample';
    const sampleName = override?.customName ?? ann.sampleName ?? labelKey;
    const concentration = override?.concentration !== undefined ? override.concentration : ann.concentration;
    const concentrationUnit = override?.unit ?? ann.concentrationUnit;
    const dilutionFactor = override?.dilutionFactor !== undefined ? override.dilutionFactor : ann.dilutionFactor;

    let sampleGroupId = ann.sampleGroupId;
    if (!sampleGroupId || override) {
      if (sampleType === 'blank') sampleGroupId = 'blank';
      else if (sampleType === 'pos-ctrl') sampleGroupId = 'pos-ctrl';
      else if (sampleType === 'neg-ctrl') sampleGroupId = 'neg-ctrl';
      else if (sampleType === 'standard' && concentration !== undefined) {
        sampleGroupId = `std-${concentration}`;
      } else if (concentration !== undefined) {
        sampleGroupId = `${sampleName.toLowerCase().replace(/[^a-z0-9_-]/g, '-')}-${concentration}`;
      } else if (dilutionFactor !== undefined) {
        sampleGroupId = `${sampleName.toLowerCase().replace(/[^a-z0-9_-]/g, '-')}-dil-${dilutionFactor}`;
      } else {
        sampleGroupId = sampleName.toLowerCase().replace(/[^a-z0-9_-]/g, '-');
      }
    }

    wells[id] = {
      ...w,
      sampleGroupId,
      sampleName,
      sampleType,
      concentration,
      concentrationUnit,
      dilutionFactor,
    };

    if (sampleGroupId && !groupsMap.has(sampleGroupId) && sampleType !== 'empty') {
      let color = '#3b82f6';
      if (sampleType === 'blank') color = '#94a3b8';
      else if (sampleType === 'neg-ctrl') color = '#64748b';
      else if (sampleType === 'pos-ctrl') color = '#10b981';
      else if (sampleType === 'standard') color = '#8b5cf6';
      else {
        color = colorPalette[colorIdx % colorPalette.length]!;
        colorIdx++;
      }

      groupsMap.set(sampleGroupId, {
        id: sampleGroupId,
        name: sampleName,
        color,
        type: sampleType,
        concentration,
        concentrationUnit,
        unit: concentrationUnit,
      });
    }
  }

  return {
    wells,
    groups: Array.from(groupsMap.values()),
  };
}

/** Generate a serial dilution across a list of well IDs */
export function generateSerialDilution(
  wellIds: string[],
  options: {
    baseName?: string;
    startConc?: number;
    startConcentration?: number;
    factor?: number;
    dilutionFactor?: number;
    unit?: string;
    role?: SampleType;
  },
): Record<string, Partial<WellValue>> {
  const result: Record<string, Partial<WellValue>> = {};
  const baseName = (options.baseName ?? 'Dilution Series').trim() || 'Dilution Series';
  const startConc = options.startConcentration ?? options.startConc ?? 1000;
  const factor = options.dilutionFactor ?? options.factor ?? 2;
  const unit = options.unit || 'µM';
  const role = options.role || 'sample';

  wellIds.forEach((wellId, idx) => {
    const rawVal = startConc / Math.pow(factor, idx);
    const conc = Number(rawVal.toPrecision(4));
    const sName = `${baseName} ${conc} ${unit}`;
    const sId = `${baseName.toLowerCase().replace(/[^a-z0-9_-]/g, '-')}-${conc}`;

    result[wellId] = {
      id: wellId,
      sampleName: sName,
      sampleGroupId: sId,
      sampleType: role,
      concentration: conc,
      concentrationUnit: unit,
    };
  });

  return result;
}

/**
 * Normalization Engine supporting flexible Blank, Min, and Max reference definitions
 */
export function normalizePlate(
  plate: ParsedPlate,
  config: NormalizationConfig,
  _groups: SampleGroup[] = [],
): {
  normalizedWells: Record<string, WellValue>;
  blankMean: number;
  posMean: number;
  negMean: number;
  effectiveMin: number;
  effectiveMax: number;
} {
  const normalizedWells: Record<string, WellValue> = {};
  const blankId = config.blankGroupId ?? 'blank';
  const posId = config.posControlGroupId ?? 'pos-ctrl';
  const negId = config.negControlGroupId ?? 'neg-ctrl';

  const blankVals: number[] = [];
  const posVals: number[] = [];
  const negVals: number[] = [];
  const allValidRaw: number[] = [];

  const rowBlankVals: Record<string, number[]> = {};
  const colBlankVals: Record<number, number[]> = {};

  const minWellSet = new Set(config.minWellIds ?? []);
  const maxWellSet = new Set(config.maxWellIds ?? []);
  const blankWellSet = new Set(config.blankWellIds ?? []);
  const excludedWellSet = new Set(config.excludedWellIds ?? []);

  for (const well of Object.values(plate.wells)) {
    if (well.raw === null || well.isExcluded || excludedWellSet.has(well.id)) continue;
    allValidRaw.push(well.raw);

    const isBlank = well.sampleType === 'blank' || well.sampleGroupId === blankId || blankWellSet.has(well.id);
    const isPos = well.sampleType === 'pos-ctrl' || well.sampleGroupId === posId || maxWellSet.has(well.id);
    const isNeg = well.sampleType === 'neg-ctrl' || well.sampleGroupId === negId || minWellSet.has(well.id);

    if (isBlank) {
      blankVals.push(well.raw);
      if (!rowBlankVals[well.row]) rowBlankVals[well.row] = [];
      rowBlankVals[well.row]!.push(well.raw);

      if (!colBlankVals[well.col]) colBlankVals[well.col] = [];
      colBlankVals[well.col]!.push(well.raw);
    }
    if (isPos) posVals.push(well.raw);
    if (isNeg) negVals.push(well.raw);
  }

  // 1. Resolve Blank Baseline
  let globalBlankMean = 0;
  if (config.blankMethod === 'custom' && config.customBlankValue !== undefined) {
    globalBlankMean = config.customBlankValue;
  } else if (config.blankMethod === 'none') {
    globalBlankMean = 0;
  } else if (blankVals.length > 0) {
    globalBlankMean = mean(blankVals);
  } else if (config.customBlankValue !== undefined) {
    globalBlankMean = config.customBlankValue;
  }

  // 2. Resolve Control References
  const posMean = config.customControlValue ?? (posVals.length > 0 ? mean(posVals) : (allValidRaw.length > 0 ? Math.max(...allValidRaw) : 1));
  const negMean = negVals.length > 0 ? mean(negVals) : globalBlankMean;

  // 3. Resolve Effective Min (0% reference)
  let effectiveMin = globalBlankMean;
  if (config.minMethod === 'custom' && config.customMinValue !== undefined) {
    effectiveMin = config.customMinValue;
  } else if (config.minMethod === 'wells' && config.minWellIds && config.minWellIds.length > 0) {
    const picked = config.minWellIds.map(id => plate.wells[id]?.raw).filter((v): v is number => v !== null && v !== undefined);
    if (picked.length > 0) effectiveMin = mean(picked);
  } else if (config.minMethod === 'neg-ctrl') {
    effectiveMin = negVals.length > 0 ? negMean : globalBlankMean;
  } else if (config.minMethod === 'lowest') {
    effectiveMin = allValidRaw.length > 0 ? Math.min(...allValidRaw) : 0;
  } else if (config.minMethod === 'blank') {
    effectiveMin = globalBlankMean;
  } else if (config.customMinValue !== undefined) {
    effectiveMin = config.customMinValue;
  } else {
    // Default baseline for POC: if minMethod is not specified, use blankMean
    effectiveMin = globalBlankMean;
  }

  // 4. Resolve Effective Max (100% reference)
  let effectiveMax = posMean;
  if (config.maxMethod === 'custom' && config.customMaxValue !== undefined) {
    effectiveMax = config.customMaxValue;
  } else if (config.maxMethod === 'wells' && config.maxWellIds && config.maxWellIds.length > 0) {
    const picked = config.maxWellIds.map(id => plate.wells[id]?.raw).filter((v): v is number => v !== null && v !== undefined);
    if (picked.length > 0) effectiveMax = mean(picked);
  } else if (config.maxMethod === 'highest') {
    effectiveMax = allValidRaw.length > 0 ? Math.max(...allValidRaw) : 1;
  } else if (config.customMaxValue !== undefined) {
    effectiveMax = config.customMaxValue;
  }

  for (const [id, well] of Object.entries(plate.wells)) {
    if (well.raw === null) {
      normalizedWells[id] = { ...well, normalized: null };
      continue;
    }

    let bMean = globalBlankMean;
    if (config.blankMethod === 'row') {
      const rVals = rowBlankVals[well.row];
      if (rVals && rVals.length > 0) bMean = mean(rVals);
    } else if (config.blankMethod === 'col' || config.blankMethod === 'column') {
      const cVals = colBlankVals[well.col];
      if (cVals && cVals.length > 0) bMean = mean(cVals);
    }

    let normVal: number | null = well.raw;

    switch (config.mode) {
      case 'raw':
        normVal = well.raw;
        break;

      case 'blank-subtracted':
        normVal = well.raw - bMean;
        break;

      case 'percent-control': {
        const denom = effectiveMax - effectiveMin;
        if (Math.abs(denom) > 1e-12) {
          normVal = (100 * (well.raw - effectiveMin)) / denom;
        } else {
          normVal = 0;
        }
        break;
      }

      case 'percent-inhibition': {
        const denom = effectiveMax - effectiveMin;
        if (Math.abs(denom) > 1e-12) {
          normVal = 100 * (1 - (well.raw - effectiveMin) / denom);
        } else {
          normVal = 0;
        }
        break;
      }

      case 'fold-change': {
        const ctrlRef = negVals.length > 0 ? negMean : (effectiveMin !== bMean ? effectiveMin : posMean);
        const denom = ctrlRef - bMean;
        if (Math.abs(denom) > 1e-12) {
          normVal = (well.raw - bMean) / denom;
        } else if (Math.abs(ctrlRef) > 1e-12) {
          normVal = well.raw / ctrlRef;
        } else {
          normVal = 1;
        }
        break;
      }
    }

    normalizedWells[id] = {
      ...well,
      normalized: normVal !== null ? Number(normVal.toFixed(4)) : null,
    };
  }

  return {
    normalizedWells,
    blankMean: globalBlankMean,
    posMean,
    negMean,
    effectiveMin,
    effectiveMax,
  };
}
