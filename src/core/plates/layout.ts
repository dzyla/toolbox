/**
 * Plate layout grid generator, well mapping, serial dilution, and CSV serialization.
 */

export type PlateFormat = 6 | 12 | 24 | 48 | 96 | 384;

export interface PlateDimension {
  format: PlateFormat;
  rows: number;
  cols: number;
  rowLabels: string[];
}

export const PLATE_DIMENSIONS: Record<PlateFormat, PlateDimension> = {
  6: {
    format: 6,
    rows: 2,
    cols: 3,
    rowLabels: ['A', 'B'],
  },
  12: {
    format: 12,
    rows: 3,
    cols: 4,
    rowLabels: ['A', 'B', 'C'],
  },
  24: {
    format: 24,
    rows: 4,
    cols: 6,
    rowLabels: ['A', 'B', 'C', 'D'],
  },
  48: {
    format: 48,
    rows: 6,
    cols: 8,
    rowLabels: ['A', 'B', 'C', 'D', 'E', 'F'],
  },
  96: {
    format: 96,
    rows: 8,
    cols: 12,
    rowLabels: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'],
  },
  384: {
    format: 384,
    rows: 16,
    cols: 24,
    rowLabels: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P'],
  },
};

export interface WellData {
  id: string; // e.g. 'A1'
  row: string; // 'A'
  col: number; // 1
  sampleGroupId: string; // group ID
  sampleName: string;
  replicateIndex?: number;
  value?: number; // e.g. concentration, absorbance
  unit?: string;
  notes?: string;
}

export interface SampleGroup {
  id: string;
  name: string;
  color: string;
  type: 'sample' | 'standard' | 'pos-ctrl' | 'neg-ctrl' | 'blank';
}

export const DEFAULT_SAMPLE_GROUPS: SampleGroup[] = [
  { id: 'blank', name: 'Blank / Media', color: '#94a3b8', type: 'blank' },
  { id: 'neg-ctrl', name: 'Negative Control', color: '#64748b', type: 'neg-ctrl' },
  { id: 'pos-ctrl', name: 'Positive Control', color: '#10b981', type: 'pos-ctrl' },
  { id: 'std', name: 'Standard Curve', color: '#8b5cf6', type: 'standard' },
  { id: 'sample-1', name: 'Sample 1', color: '#3b82f6', type: 'sample' },
  { id: 'sample-2', name: 'Sample 2', color: '#ec4899', type: 'sample' },
  { id: 'sample-3', name: 'Sample 3', color: '#f59e0b', type: 'sample' },
  { id: 'sample-4', name: 'Sample 4', color: '#06b6d4', type: 'sample' },
];

/** Generate empty well map for a given plate format */
export function generateEmptyPlate(format: PlateFormat): Record<string, WellData> {
  const dim = PLATE_DIMENSIONS[format];
  const wells: Record<string, WellData> = {};
  for (let r = 0; r < dim.rows; r++) {
    const rowChar = dim.rowLabels[r]!;
    for (let c = 1; c <= dim.cols; c++) {
      const id = `${rowChar}${c}`;
      wells[id] = {
        id,
        row: rowChar,
        col: c,
        sampleGroupId: '',
        sampleName: '',
      };
    }
  }
  return wells;
}

export interface DilutionSeriesConfig {
  groupId: string;
  startConc: number;
  dilutionFactor: number; // e.g. 2 for 1:2
  unit: string;
  direction: 'row' | 'col';
  startRow: string;
  startCol: number;
  length: number;
  replicates: number;
  includeBlank: boolean;
}

/** Apply serial dilution values and groups across rows or columns */
export function applyDilutionSeries(
  wells: Record<string, WellData>,
  config: DilutionSeriesConfig,
  dim: PlateDimension,
  sampleNamePrefix = 'Std',
): Record<string, WellData> {
  const updated = { ...wells };
  const startRowIdx = dim.rowLabels.indexOf(config.startRow);
  if (startRowIdx === -1) return wells;

  for (let rep = 0; rep < config.replicates; rep++) {
    for (let step = 0; step < config.length; step++) {
      let rIdx = startRowIdx;
      let cNum = config.startCol;

      if (config.direction === 'row') {
        rIdx = startRowIdx + rep;
        cNum = config.startCol + step;
      } else {
        rIdx = startRowIdx + step;
        cNum = config.startCol + rep;
      }

      if (rIdx >= dim.rows || cNum > dim.cols) continue;

      const rowChar = dim.rowLabels[rIdx]!;
      const wellId = `${rowChar}${cNum}`;

      const isBlankStep = config.includeBlank && step === config.length - 1;
      const conc = isBlankStep ? 0 : config.startConc / Math.pow(config.dilutionFactor, step);

      updated[wellId] = {
        id: wellId,
        row: rowChar,
        col: cNum,
        sampleGroupId: isBlankStep ? 'blank' : config.groupId,
        sampleName: isBlankStep ? 'Blank' : `${sampleNamePrefix} ${step + 1}`,
        replicateIndex: config.replicates > 1 ? rep + 1 : undefined,
        value: conc,
        unit: config.unit,
      };
    }
  }

  return updated;
}

/** Format concentration value cleanly without trailing decimals */
export function formatWellConcentration(val: number | undefined): string {
  if (val === undefined) return '';
  if (val === 0) return '0';
  if (val >= 1000) return val >= 1e5 ? val.toExponential(1) : Math.round(val).toString();
  if (val >= 100) return (Math.round(val * 10) / 10).toString();
  if (val >= 1) {
    const s = val.toPrecision(3);
    return parseFloat(s).toString();
  }
  if (val >= 0.0001) {
    const s = val.toPrecision(2);
    return parseFloat(s).toString();
  }
  return val.toExponential(1);
}

export interface PipettingSchemeStep {
  stepNumber: number;
  description: string;
  volumeUl: number;
  reagent: string;
  source: string;
  destination: string;
  pipetteType: 'single' | '8-channel' | '12-channel';
}

export interface SampleReagentSummary {
  sampleName: string;
  type: string;
  wellCount: number;
  wells: string[];
  stockVolumeNeededUl: number;
  diluentVolumeNeededUl: number;
  isDilution: boolean;
}

export interface DilutionSeriesWellStep {
  wellId: string;
  targetConc?: number;
  unit?: string;
  action: string;
  prefillBufferUl: number;
  addStockUl?: number;
  transferInUl?: number;
  transferOutUl?: number;
  finalVolumeUl: number;
  fromWellId?: string;
  toWellId?: string;
  isDiscard?: boolean;
}

export interface DilutionSeriesPlan {
  groupName: string;
  stockConc?: number;
  unit: string;
  initialWellIds: string[];
  initialTargetConc: number;
  initialTotalVolumeUl: number;
  stockVolumePerInitialWellUl: number;
  bufferVolumePerInitialWellUl: number;
  transferVolumeUl: number;
  discardVolumeUl: number;
  workingVolumeUl: number;
  wellsInOrder: DilutionSeriesWellStep[];
}

export interface PipettingPlan {
  totalAssignedWells: number;
  workingVolumeUl: number;
  transferVolumeUl: number;
  totalDiluentNeededUl: number;
  totalStockNeededUl: number;
  stockConc?: number;
  reagentSummaries: SampleReagentSummary[];
  steps: PipettingSchemeStep[];
  dilutionSeriesPlans: DilutionSeriesPlan[];
}

function partitionReplicateSeries(wells: WellData[]): WellData[][] {
  if (wells.length <= 1) return [wells];

  // 1. If replicateIndex is explicitly defined on wells
  const hasReplicateIndex = wells.some(w => w.replicateIndex !== undefined);
  if (hasReplicateIndex) {
    const map = new Map<number, WellData[]>();
    for (const w of wells) {
      const rep = w.replicateIndex ?? 1;
      if (!map.has(rep)) map.set(rep, []);
      map.get(rep)!.push(w);
    }
    return Array.from(map.values());
  }

  // 2. Check if grouping by row creates multiple rows with varying concentrations
  const rowMap = new Map<string, WellData[]>();
  for (const w of wells) {
    if (!rowMap.has(w.row)) rowMap.set(w.row, []);
    rowMap.get(w.row)!.push(w);
  }
  if (rowMap.size > 1) {
    const allRowsHaveMultipleConcs = Array.from(rowMap.values()).every(
      rowWells => rowWells.length > 1 && new Set(rowWells.map(w => w.value)).size > 1
    );
    if (allRowsHaveMultipleConcs) {
      return Array.from(rowMap.values());
    }
  }

  // 3. Check if grouping by col creates multiple columns with varying concentrations
  const colMap = new Map<number, WellData[]>();
  for (const w of wells) {
    if (!colMap.has(w.col)) colMap.set(w.col, []);
    colMap.get(w.col)!.push(w);
  }
  if (colMap.size > 1) {
    const allColsHaveMultipleConcs = Array.from(colMap.values()).every(
      colWells => colWells.length > 1 && new Set(colWells.map(w => w.value)).size > 1
    );
    if (allColsHaveMultipleConcs) {
      return Array.from(colMap.values());
    }
  }

  return [wells];
}

/** Generate a realistic step-by-step pipetting scheme for plate preparation */
export function generatePipettingScheme(
  wells: Record<string, WellData>,
  options: {
    workingVolumeUl: number;
    transferVolumeUl: number;
    pipetteType: 'single' | '8-channel' | '12-channel';
    stockConc?: number;
  },
  groups: SampleGroup[] = [],
): PipettingPlan {
  const { workingVolumeUl, transferVolumeUl, pipetteType, stockConc } = options;
  const assigned = Object.values(wells).filter(w => !!w.sampleGroupId || !!w.sampleName);
  const diluentVolPerWell = workingVolumeUl;
  const steps: PipettingSchemeStep[] = [];
  const dilutionSeriesPlans: DilutionSeriesPlan[] = [];

  const groupNameMap = new Map<string, string>(groups.map(g => [g.id, g.name]));
  const groupTypeMap = new Map<string, string>(groups.map(g => [g.id, g.type]));

  // Group wells by sampleGroupId or sampleName
  const groupWells = new Map<string, WellData[]>();
  for (const w of assigned) {
    const gKey = w.sampleGroupId || w.sampleName;
    if (!groupWells.has(gKey)) groupWells.set(gKey, []);
    groupWells.get(gKey)!.push(w);
  }

  // Identify blank wells, dilution series tracks, and initial wells
  const blankWells: WellData[] = [];
  const initialDilutionWells: WellData[] = [];
  const downstreamDilutionWells: WellData[] = [];
  let totalStockNeededUl = 0;
  let totalInitialBufferNeededUl = 0;

  // Pre-analyze groups to determine exact diluent requirements
  for (const [gKey, sWells] of groupWells.entries()) {
    const gType = groupTypeMap.get(gKey) || (gKey === 'blank' ? 'blank' : 'sample');
    if (gType === 'blank' || gKey === 'blank') {
      blankWells.push(...sWells);
      continue;
    }
    const distinctValues = new Set(sWells.map(w => w.value).filter(v => v !== undefined && v > 0));
    const isDilution = distinctValues.size > 1;
    if (isDilution) {
      const tracks = partitionReplicateSeries(sWells);
      for (const track of tracks) {
        const sorted = [...track].sort((a, b) => (b.value ?? 0) - (a.value ?? 0) || a.row.localeCompare(b.row) || a.col - b.col);
        if (sorted.length > 0) {
          initialDilutionWells.push(sorted[0]!);
          downstreamDilutionWells.push(...sorted.slice(1));
        }
      }
    }
  }

  // Step 1: Pre-fill diluent into downstream dilution wells and blank wells
  // (Initial wells receive customized buffer+stock mixtures in subsequent step)
  const prefillWells = [...blankWells, ...downstreamDilutionWells];
  let stepCounter = 1;

  if (prefillWells.length > 0) {
    steps.push({
      stepNumber: stepCounter++,
      description: `Pre-fill assay buffer / diluent (${diluentVolPerWell} µL/well) into ${prefillWells.length} destination wells (${prefillWells.map(w => w.id).join(', ')}). Note: initial dilution wells and neat samples are excluded from this step.`,
      volumeUl: diluentVolPerWell * prefillWells.length,
      reagent: 'Assay Buffer / Diluent',
      source: 'Reagent Reservoir',
      destination: `${prefillWells.length} active wells`,
      pipetteType,
    });
  }

  const reagentSummaries: SampleReagentSummary[] = [];

  // For each sample group:
  for (const [gKey, sWells] of groupWells.entries()) {
    const gType = groupTypeMap.get(gKey) || (gKey === 'blank' ? 'blank' : 'sample');
    const sampleName = groupNameMap.get(gKey) || sWells[0]?.sampleName || gKey;

    if (gType === 'blank' || gKey === 'blank') {
      reagentSummaries.push({
        sampleName: sampleName || 'Blank / Media',
        type: 'blank',
        wellCount: sWells.length,
        wells: sWells.map(w => w.id),
        stockVolumeNeededUl: 0,
        diluentVolumeNeededUl: diluentVolPerWell * sWells.length,
        isDilution: false,
      });
      continue;
    }

    // Check if it has varying values (dilution series)
    const distinctValues = new Set(sWells.map(w => w.value).filter(v => v !== undefined && v > 0));
    const isDilution = distinctValues.size > 1;

    if (isDilution) {
      const tracks = partitionReplicateSeries(sWells);
      const maxVal = Math.max(0, ...sWells.map(w => w.value || 0));
      const unit = sWells[0]?.unit || 'µM';
      const initialTotalVolPerWell = workingVolumeUl + transferVolumeUl;

      // Calculate stock and buffer split for initial well if stockConc is provided
      let stockVolPerWell = initialTotalVolPerWell;
      let bufferVolPerWell = 0;
      const effectiveStock = stockConc && stockConc > 0 ? stockConc : undefined;

      if (effectiveStock && effectiveStock >= maxVal && maxVal > 0) {
        stockVolPerWell = (maxVal / effectiveStock) * initialTotalVolPerWell;
        bufferVolPerWell = Math.max(0, initialTotalVolPerWell - stockVolPerWell);
      }

      const allStartWells: WellData[] = [];
      const sortedTracks: WellData[][] = [];

      for (const track of tracks) {
        const sorted = [...track].sort((a, b) => (b.value ?? 0) - (a.value ?? 0) || a.row.localeCompare(b.row) || a.col - b.col);
        if (sorted.length > 0) {
          allStartWells.push(sorted[0]!);
          sortedTracks.push(sorted);
        }
      }

      const totalStockForStartWells = stockVolPerWell * allStartWells.length;
      totalStockNeededUl += totalStockForStartWells;
      totalInitialBufferNeededUl += bufferVolPerWell * allStartWells.length;

      const groupDiluentNeededUl =
        (sWells.length - allStartWells.length) * diluentVolPerWell + bufferVolPerWell * allStartWells.length;

      reagentSummaries.push({
        sampleName,
        type: gType,
        wellCount: sWells.length,
        wells: sWells.map(w => w.id),
        stockVolumeNeededUl: totalStockForStartWells,
        diluentVolumeNeededUl: groupDiluentNeededUl,
        isDilution: true,
      });

      if (bufferVolPerWell > 0 && effectiveStock) {
        steps.push({
          stepNumber: stepCounter++,
          description: `Prepare Initial Well(s) ${allStartWells.map(w => w.id).join(', ')}: Add ${bufferVolPerWell.toFixed(1)} µL Diluent Buffer + ${stockVolPerWell.toFixed(1)} µL of ${sampleName} Stock (${effectiveStock} ${unit}) per well to reach ${maxVal} ${unit} (Total: ${initialTotalVolPerWell} µL/well).`,
          volumeUl: totalStockForStartWells + (bufferVolPerWell * allStartWells.length),
          reagent: `${sampleName} Concentrated Stock (${effectiveStock} ${unit}) + Buffer`,
          source: `${sampleName} Stock Tube & Buffer`,
          destination: allStartWells.map(w => w.id).join(', '),
          pipetteType: allStartWells.length >= 8 && pipetteType !== 'single' ? pipetteType : 'single',
        });
      } else {
        steps.push({
          stepNumber: stepCounter++,
          description: `Load ${initialTotalVolPerWell} µL ${sampleName} stock solution into initial well(s) ${allStartWells.map(w => w.id).join(', ')}.`,
          volumeUl: initialTotalVolPerWell * allStartWells.length,
          reagent: `${sampleName} Stock`,
          source: `${sampleName} Tube`,
          destination: allStartWells.map(w => w.id).join(', '),
          pipetteType: allStartWells.length >= 8 && pipetteType !== 'single' ? pipetteType : 'single',
        });
      }

      // Build dilution plan for each replicate series track
      for (let tIdx = 0; tIdx < sortedTracks.length; tIdx++) {
        const trackWells = sortedTracks[tIdx]!;
        const seriesSteps: DilutionSeriesWellStep[] = [];

        for (let i = 0; i < trackWells.length; i++) {
          const cur = trackWells[i]!;
          const isStart = i === 0;
          const isEnd = i === trackWells.length - 1;
          const next = !isEnd ? trackWells[i + 1] : undefined;
          const prev = i > 0 ? trackWells[i - 1] : undefined;

          let action = '';
          if (isStart) {
            action = effectiveStock && bufferVolPerWell > 0
              ? `Add ${bufferVolPerWell.toFixed(1)} µL Buffer + ${stockVolPerWell.toFixed(1)} µL Stock (${effectiveStock} ${unit})`
              : `Load ${initialTotalVolPerWell} µL Stock solution`;
          } else if (isEnd) {
            action = `Mix 3-5×; Discard ${transferVolumeUl} µL to waste (retains ${workingVolumeUl} µL)`;
          } else {
            action = `Mix 3-5×; Transfer ${transferVolumeUl} µL ➔ ${next?.id}`;
          }

          seriesSteps.push({
            wellId: cur.id,
            targetConc: cur.value,
            unit: cur.unit || unit,
            action,
            prefillBufferUl: isStart ? bufferVolPerWell : workingVolumeUl,
            addStockUl: isStart ? stockVolPerWell : 0,
            transferInUl: isStart ? 0 : transferVolumeUl,
            transferOutUl: transferVolumeUl,
            finalVolumeUl: workingVolumeUl,
            fromWellId: prev?.id,
            toWellId: next?.id,
            isDiscard: isEnd,
          });
        }

        dilutionSeriesPlans.push({
          groupName: sortedTracks.length > 1 ? `${sampleName} (Replicate ${tIdx + 1})` : sampleName,
          stockConc: effectiveStock,
          unit,
          initialWellIds: [trackWells[0]!.id],
          initialTargetConc: maxVal,
          initialTotalVolumeUl: initialTotalVolPerWell,
          stockVolumePerInitialWellUl: stockVolPerWell,
          bufferVolumePerInitialWellUl: bufferVolPerWell,
          transferVolumeUl,
          discardVolumeUl: transferVolumeUl,
          workingVolumeUl,
          wellsInOrder: seriesSteps,
        });
      }

      // Generate the transfer protocol step
      if (sortedTracks.length > 1) {
        const transferChains = sortedTracks.map(t => t.map(w => w.id).join(' ➔ ')).join('; ');
        steps.push({
          stepNumber: stepCounter++,
          description: `Serial dilution for ${sampleName} (${sortedTracks.length} replicate series in parallel): transfer ${transferVolumeUl} µL across consecutive wells in each series (${transferChains}), mixing 3–5× at each step. Discard ${transferVolumeUl} µL from the final well of each series.`,
          volumeUl: transferVolumeUl * (sWells.length - sortedTracks.length),
          reagent: `${sampleName} Transfer`,
          source: 'Preceding well',
          destination: 'Next dilution well',
          pipetteType: allStartWells.length >= 8 && pipetteType !== 'single' ? pipetteType : 'single',
        });
      } else {
        steps.push({
          stepNumber: stepCounter++,
          description: `Serial dilution for ${sampleName}: transfer ${transferVolumeUl} µL across consecutive wells (${sortedTracks[0]?.map(w => w.id).join(' ➔ ')}), mixing 3–5× at each step. Discard ${transferVolumeUl} µL from the final dilution well.`,
          volumeUl: transferVolumeUl * (sWells.length - 1),
          reagent: `${sampleName} Transfer`,
          source: 'Preceding well',
          destination: 'Next dilution well',
          pipetteType: 'single',
        });
      }
    } else {
      // Fixed concentration sample
      const sampleVol = workingVolumeUl * sWells.length;
      totalStockNeededUl += sampleVol;

      reagentSummaries.push({
        sampleName,
        type: gType,
        wellCount: sWells.length,
        wells: sWells.map(w => w.id),
        stockVolumeNeededUl: sampleVol,
        diluentVolumeNeededUl: 0,
        isDilution: false,
      });

      steps.push({
        stepNumber: stepCounter++,
        description: `Add ${workingVolumeUl} µL of ${sampleName} into destination well(s) ${sWells.map(w => w.id).join(', ')}.`,
        volumeUl: sampleVol,
        reagent: sampleName,
        source: `${sampleName} Sample`,
        destination: sWells.map(w => w.id).join(', '),
        pipetteType: sWells.length >= 8 && pipetteType !== 'single' ? pipetteType : 'single',
      });
    }
  }

  // Final step
  steps.push({
    stepNumber: stepCounter++,
    description: 'Centrifuge microplate briefly (500 × g, 30 s) or tap lightly to eliminate bubbles and ensure a uniform meniscus before reading.',
    volumeUl: 0,
    reagent: 'Plate Spinner',
    source: 'Plate Centrifuge',
    destination: 'Plate Reader',
    pipetteType: 'single',
  });

  const totalDiluentNeededUl = diluentVolPerWell * prefillWells.length + totalInitialBufferNeededUl;

  return {
    totalAssignedWells: assigned.length,
    workingVolumeUl,
    transferVolumeUl,
    totalDiluentNeededUl,
    totalStockNeededUl,
    reagentSummaries,
    steps,
    dilutionSeriesPlans,
  };
}

/** Serialize plate data to a tabular matrix CSV format */
export function plateToMatrixCsv(format: PlateFormat, wells: Record<string, WellData>): string {
  const dim = PLATE_DIMENSIONS[format];
  const header = ['Row', ...Array.from({ length: dim.cols }, (_, i) => (i + 1).toString())];
  const rows = [header.join(',')];

  for (let r = 0; r < dim.rows; r++) {
    const rowChar = dim.rowLabels[r]!;
    const rowCells = [rowChar];
    for (let c = 1; c <= dim.cols; c++) {
      const well = wells[`${rowChar}${c}`];
      const cellVal = well?.sampleName || well?.sampleGroupId || '';
      rowCells.push(`"${cellVal.replace(/"/g, '""')}"`);
    }
    rows.push(rowCells.join(','));
  }

  return rows.join('\n');
}

/** Serialize plate data to list CSV */
export function plateToListCsv(wells: Record<string, WellData>, groups: SampleGroup[]): string {
  const groupMap = new Map(groups.map(g => [g.id, g]));
  const header = ['Well', 'Row', 'Column', 'Group_Name', 'Group_Type', 'Sample_Name', 'Replicate', 'Value', 'Unit'];
  const rows = [header.join(',')];

  for (const well of Object.values(wells)) {
    if (!well.sampleGroupId && !well.sampleName) continue;
    const g = groupMap.get(well.sampleGroupId);
    rows.push([
      well.id,
      well.row,
      well.col,
      `"${(g?.name || '').replace(/"/g, '""')}"`,
      g?.type || '',
      `"${well.sampleName.replace(/"/g, '""')}"`,
      well.replicateIndex !== undefined ? well.replicateIndex : '',
      well.value !== undefined ? well.value : '',
      well.unit || '',
    ].join(','));
  }

  return rows.join('\n');
}

/** Serialize plate layout to Markdown format */
export function plateToMarkdown(
  format: PlateFormat,
  wells: Record<string, WellData>,
  groups: SampleGroup[]
): string {
  const dim = PLATE_DIMENSIONS[format];

  const lines: string[] = [];
  lines.push(`# ${format}-Well Microplate Layout\n`);

  // Matrix table
  const colHeaders = ['Row', ...Array.from({ length: dim.cols }, (_, i) => `${i + 1}`)];
  lines.push(`| ${colHeaders.join(' | ')} |`);
  lines.push(`| ${colHeaders.map(() => '---').join(' | ')} |`);

  for (let r = 0; r < dim.rows; r++) {
    const rowChar = dim.rowLabels[r]!;
    const cells = [rowChar];
    for (let c = 1; c <= dim.cols; c++) {
      const well = wells[`${rowChar}${c}`];
      if (!well || (!well.sampleGroupId && !well.sampleName)) {
        cells.push('—');
      } else {
        const valStr = well.value !== undefined ? ` (${well.value} ${well.unit || ''})` : '';
        cells.push(`${well.sampleName || well.sampleGroupId}${valStr}`);
      }
    }
    lines.push(`| ${cells.join(' | ')} |`);
  }

  // Summary of sample groups
  lines.push('\n## Sample Legend\n');
  lines.push('| Group / Sample | Color | Assigned Wells |');
  lines.push('| --- | --- | --- |');
  for (const g of groups) {
    const wellList = Object.values(wells)
      .filter(w => w.sampleGroupId === g.id)
      .map(w => w.id);
    if (wellList.length > 0) {
      lines.push(`| **${g.name}** | \`${g.color}\` | ${wellList.join(', ')} (${wellList.length}) |`);
    }
  }

  return lines.join('\n');
}

/**
 * Parse an 8x12 (or any plate dimension) matrix from TSV/CSV copied from Excel or Google Sheets.
 * Supports:
 * - Direct 8x12 values without headers
 * - Headers with row labels (A, B, C...) and column numbers (1, 2, 3...)
 * - Cell values with embedded concentrations, e.g. "Sample 1 (100 µM)" or "Std 50 ng/mL" or just numbers/strings
 */
export function parseMatrixText(
  text: string,
  format: PlateFormat = 96,
  existingGroups: SampleGroup[] = []
): { wells: Record<string, WellData>; groups: SampleGroup[] } {
  const dim = PLATE_DIMENSIONS[format];
  const emptyWells = generateEmptyPlate(format);

  const lines = text
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(l => l.length > 0);

  if (lines.length === 0) {
    return { wells: emptyWells, groups: existingGroups };
  }

  // Detect delimiter: tab, comma, or semicolon
  const firstFew = lines.slice(0, 3).join('\n');
  const tabCount = (firstFew.match(/\t/g) || []).length;
  const commaCount = (firstFew.match(/,/g) || []).length;
  const semiCount = (firstFew.match(/;/g) || []).length;

  let delimiter = '\t';
  if (commaCount > tabCount && commaCount > semiCount) delimiter = ',';
  else if (semiCount > tabCount && semiCount > commaCount) delimiter = ';';

  function parseLine(line: string): string[] {
    if (delimiter === '\t') {
      return line.split('\t').map(c => c.trim().replace(/^["']|["']$/g, ''));
    }
    const cells: string[] = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === delimiter && !inQuotes) {
        cells.push(cur.trim());
        cur = '';
      } else {
        cur += ch;
      }
    }
    cells.push(cur.trim());
    return cells;
  }

  const rawGrid = lines.map(parseLine);
  if (rawGrid.length === 0) return { wells: emptyWells, groups: existingGroups };

  // Check if first row is a header row (e.g. contains 1, 2, 3... or "Row" / empty first cell followed by numbers)
  let startRowIdx = 0;
  let startColIdx = 0;

  const firstRow = rawGrid[0]!;
  const numericCellsInFirstRow = firstRow.filter(c => /^\d+$/.test(c)).length;
  if (numericCellsInFirstRow >= Math.min(3, firstRow.length - 1)) {
    startRowIdx = 1;
  }

  // Check if first column has row labels (A, B, C...)
  let rowLabelsFound = 0;
  for (let r = startRowIdx; r < rawGrid.length; r++) {
    const firstCell = rawGrid[r]?.[0]?.toUpperCase();
    if (firstCell && /^[A-P]$/.test(firstCell)) {
      rowLabelsFound++;
    }
  }
  if (rowLabelsFound >= Math.min(3, rawGrid.length - startRowIdx)) {
    startColIdx = 1;
  }

  const groupMap = new Map<string, SampleGroup>();
  for (const g of existingGroups) {
    groupMap.set(g.name.toLowerCase(), g);
  }

  const paletteColors = [
    '#3b82f6', '#ec4899', '#f59e0b', '#06b6d4', '#8b5cf6',
    '#ef4444', '#10b981', '#14b8a6', '#f97316', '#6366f1', '#84cc16'
  ];
  let colorIdx = existingGroups.length;

  const wells: Record<string, WellData> = { ...emptyWells };

  for (let r = startRowIdx; r < rawGrid.length && (r - startRowIdx) < dim.rows; r++) {
    const rIdx = r - startRowIdx;
    const rowChar = dim.rowLabels[rIdx]!;
    const rowCells = rawGrid[r]!;

    for (let c = startColIdx; c < rowCells.length && (c - startColIdx) < dim.cols; c++) {
      const cIdx = c - startColIdx + 1;
      const wellId = `${rowChar}${cIdx}`;
      const cellText = rowCells[c]!.trim();

      if (!cellText || cellText === '-' || cellText === '—' || cellText.toLowerCase() === 'empty') {
        continue;
      }

      let sampleName = cellText;
      let value: number | undefined;
      let unit: string | undefined;

      const numOnlyMatch = cellText.match(/^([0-9.eE+-]+)\s*([a-zA-Zµ/%]+)?$/);
      const parenMatch = cellText.match(/^(.*?)\s*\(\s*([0-9.eE+-]+)\s*([a-zA-Zµ/%]+)?\s*\)$/);
      const spaceMatch = cellText.match(/^(.*?)\s+([0-9.eE+-]+)\s+([a-zA-Zµ/%]+)$/);

      if (parenMatch) {
        sampleName = parenMatch[1]!.trim();
        const parsedVal = parseFloat(parenMatch[2]!);
        if (!isNaN(parsedVal)) value = parsedVal;
        unit = parenMatch[3]?.trim();
      } else if (numOnlyMatch) {
        const parsedVal = parseFloat(numOnlyMatch[1]!);
        if (!isNaN(parsedVal)) {
          value = parsedVal;
          unit = numOnlyMatch[2]?.trim();
          sampleName = `Sample (${value}${unit ? ` ${unit}` : ''})`;
        }
      } else if (spaceMatch && isNaN(parseFloat(spaceMatch[1]!))) {
        sampleName = spaceMatch[1]!.trim();
        const parsedVal = parseFloat(spaceMatch[2]!);
        if (!isNaN(parsedVal)) value = parsedVal;
        unit = spaceMatch[3]?.trim();
      }

      const lowerName = sampleName.toLowerCase();
      let group = groupMap.get(lowerName);
      if (!group) {
        let type: SampleGroup['type'] = 'sample';
        let color = paletteColors[colorIdx % paletteColors.length]!;
        colorIdx++;

        if (lowerName.includes('blank') || lowerName.includes('media')) {
          type = 'blank';
          color = '#94a3b8';
        } else if (lowerName.includes('pos')) {
          type = 'pos-ctrl';
          color = '#10b981';
        } else if (lowerName.includes('neg')) {
          type = 'neg-ctrl';
          color = '#64748b';
        } else if (lowerName.includes('std') || lowerName.includes('calibrator')) {
          type = 'standard';
          color = '#8b5cf6';
        }

        const newId = `grp-${Date.now()}-${colorIdx}`;
        group = {
          id: newId,
          name: sampleName,
          color,
          type,
        };
        groupMap.set(lowerName, group);
      }

      wells[wellId] = {
        id: wellId,
        row: rowChar,
        col: cIdx,
        sampleGroupId: group.id,
        sampleName: sampleName,
        value,
        unit,
      };
    }
  }

  return {
    wells,
    groups: Array.from(groupMap.values()),
  };
}

/** Serialize plate data to TSV matrix format for direct pasting into Excel / Google Sheets */
export function plateToMatrixTsv(format: PlateFormat, wells: Record<string, WellData>): string {
  const dim = PLATE_DIMENSIONS[format];
  const header = ['Row', ...Array.from({ length: dim.cols }, (_, i) => (i + 1).toString())];
  const rows = [header.join('\t')];

  for (let r = 0; r < dim.rows; r++) {
    const rowChar = dim.rowLabels[r]!;
    const rowCells = [rowChar];
    for (let c = 1; c <= dim.cols; c++) {
      const well = wells[`${rowChar}${c}`];
      if (!well || (!well.sampleGroupId && !well.sampleName)) {
        rowCells.push('');
      } else {
        const valStr = well.value !== undefined ? ` (${well.value}${well.unit ? ` ${well.unit}` : ''})` : '';
        rowCells.push(`${well.sampleName || well.sampleGroupId}${valStr}`);
      }
    }
    rows.push(rowCells.join('\t'));
  }

  return rows.join('\n');
}

export interface AssayPreset {
  id: string;
  name: string;
  badge: string;
  description: string;
  format: PlateFormat;
  build: () => { wells: Record<string, WellData>; groups: SampleGroup[] };
}

export const ASSAY_PRESETS: AssayPreset[] = [
  {
    id: 'elisa',
    name: 'ELISA / Binding Standard Curve',
    badge: '8-pt 1:2',
    description: 'Blanks (Row A), Standard curve 1:2 dilution in duplicate (Rows B & C), Samples in duplicate (Rows D-G), Controls (Row H).',
    format: 96,
    build: () => {
      const wells = generateEmptyPlate(96);
      const dim = PLATE_DIMENSIONS[96];
      const groups: SampleGroup[] = [
        { id: 'blank', name: 'Blank / Media', color: '#94a3b8', type: 'blank' },
        { id: 'std', name: 'Standard Curve', color: '#8b5cf6', type: 'standard' },
        { id: 'pos-ctrl', name: 'Positive Control', color: '#10b981', type: 'pos-ctrl' },
        { id: 'neg-ctrl', name: 'Negative Control', color: '#ef4444', type: 'neg-ctrl' },
        { id: 'sample-1', name: 'Sample 1', color: '#3b82f6', type: 'sample' },
        { id: 'sample-2', name: 'Sample 2', color: '#ec4899', type: 'sample' },
      ];
      // Row A: Blanks
      for (let c = 1; c <= 12; c++) {
        wells[`A${c}`] = { id: `A${c}`, row: 'A', col: c, sampleGroupId: 'blank', sampleName: 'Blank' };
      }
      // Rows B & C: Std curve (8 steps, 1:2 dilution, 100 ng/mL)
      applyDilutionSeries(wells, {
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
      // Controls in cols 9-12 of B & C
      wells['B9'] = { id: 'B9', row: 'B', col: 9, sampleGroupId: 'pos-ctrl', sampleName: 'Pos Ctrl', value: 100, unit: 'ng/mL' };
      wells['C9'] = { id: 'C9', row: 'C', col: 9, sampleGroupId: 'pos-ctrl', sampleName: 'Pos Ctrl', value: 100, unit: 'ng/mL' };
      wells['B10'] = { id: 'B10', row: 'B', col: 10, sampleGroupId: 'pos-ctrl', sampleName: 'Pos Ctrl', value: 50, unit: 'ng/mL' };
      wells['C10'] = { id: 'C10', row: 'C', col: 10, sampleGroupId: 'pos-ctrl', sampleName: 'Pos Ctrl', value: 50, unit: 'ng/mL' };
      wells['B11'] = { id: 'B11', row: 'B', col: 11, sampleGroupId: 'neg-ctrl', sampleName: 'Neg Ctrl' };
      wells['C11'] = { id: 'C11', row: 'C', col: 11, sampleGroupId: 'neg-ctrl', sampleName: 'Neg Ctrl' };
      wells['B12'] = { id: 'B12', row: 'B', col: 12, sampleGroupId: 'blank', sampleName: 'Buffer Blank' };
      wells['C12'] = { id: 'C12', row: 'C', col: 12, sampleGroupId: 'blank', sampleName: 'Buffer Blank' };
      // Rows D & E: Sample 1 dilution
      applyDilutionSeries(wells, {
        groupId: 'sample-1',
        startConc: 50,
        dilutionFactor: 2,
        unit: 'ng/mL',
        direction: 'row',
        startRow: 'D',
        startCol: 1,
        length: 8,
        replicates: 2,
        includeBlank: false,
      }, dim, 'S1');
      // Rows F & G: Sample 2 dilution
      applyDilutionSeries(wells, {
        groupId: 'sample-2',
        startConc: 50,
        dilutionFactor: 2,
        unit: 'ng/mL',
        direction: 'row',
        startRow: 'F',
        startCol: 1,
        length: 8,
        replicates: 2,
        includeBlank: false,
      }, dim, 'S2');
      return { wells, groups };
    },
  },
  {
    id: 'ic50',
    name: '12-Point Dose-Response (IC50)',
    badge: '12-pt 1:3',
    description: '4 compounds across 12 serial concentrations in duplicate: 10 µM start with 1:3 dilution down to 0.056 nM.',
    format: 96,
    build: () => {
      const wells = generateEmptyPlate(96);
      const dim = PLATE_DIMENSIONS[96];
      const groups: SampleGroup[] = [
        { id: 'blank', name: 'Blank / Vehicle (DMSO)', color: '#94a3b8', type: 'blank' },
        { id: 'cpd-a', name: 'Compound A', color: '#3b82f6', type: 'sample' },
        { id: 'cpd-b', name: 'Compound B', color: '#10b981', type: 'sample' },
        { id: 'cpd-c', name: 'Compound C', color: '#f59e0b', type: 'sample' },
        { id: 'ref-inhibitor', name: 'Reference Inhibitor', color: '#8b5cf6', type: 'standard' },
      ];
      // A & B: Compound A
      applyDilutionSeries(wells, {
        groupId: 'cpd-a',
        startConc: 10,
        dilutionFactor: 3,
        unit: 'µM',
        direction: 'row',
        startRow: 'A',
        startCol: 1,
        length: 12,
        replicates: 2,
        includeBlank: true,
      }, dim, 'Cpd A');
      // C & D: Compound B
      applyDilutionSeries(wells, {
        groupId: 'cpd-b',
        startConc: 10,
        dilutionFactor: 3,
        unit: 'µM',
        direction: 'row',
        startRow: 'C',
        startCol: 1,
        length: 12,
        replicates: 2,
        includeBlank: true,
      }, dim, 'Cpd B');
      // E & F: Compound C
      applyDilutionSeries(wells, {
        groupId: 'cpd-c',
        startConc: 10,
        dilutionFactor: 3,
        unit: 'µM',
        direction: 'row',
        startRow: 'E',
        startCol: 1,
        length: 12,
        replicates: 2,
        includeBlank: true,
      }, dim, 'Cpd C');
      // G & H: Ref Inhibitor
      applyDilutionSeries(wells, {
        groupId: 'ref-inhibitor',
        startConc: 10,
        dilutionFactor: 3,
        unit: 'µM',
        direction: 'row',
        startRow: 'G',
        startCol: 1,
        length: 12,
        replicates: 2,
        includeBlank: true,
      }, dim, 'Ref');
      return { wells, groups };
    },
  },
  {
    id: 'qpcr',
    name: 'qPCR Gene Expression (Triplicates)',
    badge: '3 Replicates',
    description: 'Columns 1–3 Target 1, Columns 4–6 Target 2, Columns 7–9 GAPDH reference, Columns 10–12 NTC controls.',
    format: 96,
    build: () => {
      const wells = generateEmptyPlate(96);
      const groups: SampleGroup[] = [
        { id: 'gapdh', name: 'GAPDH (Ref Gene)', color: '#3b82f6', type: 'standard' },
        { id: 'actb', name: 'ACTB (Ref Gene)', color: '#06b6d4', type: 'standard' },
        { id: 'target-1', name: 'Target Gene 1', color: '#10b981', type: 'sample' },
        { id: 'target-2', name: 'Target Gene 2', color: '#ec4899', type: 'sample' },
        { id: 'ntc', name: 'NTC (No Template)', color: '#94a3b8', type: 'neg-ctrl' },
      ];
      const rows = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
      rows.forEach(r => {
        // Target 1 (cols 1-3)
        for (let c = 1; c <= 3; c++) {
          wells[`${r}${c}`] = { id: `${r}${c}`, row: r, col: c, sampleGroupId: 'target-1', sampleName: `T1 ${r}`, replicateIndex: c };
        }
        // Target 2 (cols 4-6)
        for (let c = 4; c <= 6; c++) {
          wells[`${r}${c}`] = { id: `${r}${c}`, row: r, col: c, sampleGroupId: 'target-2', sampleName: `T2 ${r}`, replicateIndex: c - 3 };
        }
        // GAPDH (cols 7-9)
        for (let c = 7; c <= 9; c++) {
          wells[`${r}${c}`] = { id: `${r}${c}`, row: r, col: c, sampleGroupId: 'gapdh', sampleName: `GAPDH ${r}`, replicateIndex: c - 6 };
        }
        // NTC and calibrators (cols 10-12)
        for (let c = 10; c <= 12; c++) {
          wells[`${r}${c}`] = { id: `${r}${c}`, row: r, col: c, sampleGroupId: 'ntc', sampleName: 'NTC Water', replicateIndex: c - 9 };
        }
      });
      return { wells, groups };
    },
  },
  {
    id: 'hts',
    name: 'HTS Screening Plate (80 Compounds)',
    badge: 'Cols 1 & 12 Ctrl',
    description: 'Column 1 DMSO negative control, Column 12 positive control, Columns 2–11 screening library test wells.',
    format: 96,
    build: () => {
      const wells = generateEmptyPlate(96);
      const groups: SampleGroup[] = [
        { id: 'neg-ctrl', name: 'Neg Ctrl (DMSO 0.1%)', color: '#64748b', type: 'neg-ctrl' },
        { id: 'pos-ctrl', name: 'Pos Ctrl (Staurosporine)', color: '#10b981', type: 'pos-ctrl' },
        { id: 'hts-compounds', name: 'Screening Library', color: '#3b82f6', type: 'sample' },
      ];
      const rows = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
      rows.forEach(r => {
        wells[`${r}1`] = { id: `${r}1`, row: r, col: 1, sampleGroupId: 'neg-ctrl', sampleName: 'DMSO Ctrl' };
        wells[`${r}12`] = { id: `${r}12`, row: r, col: 12, sampleGroupId: 'pos-ctrl', sampleName: 'Pos Ctrl' };
        for (let c = 2; c <= 11; c++) {
          wells[`${r}${c}`] = { id: `${r}${c}`, row: r, col: c, sampleGroupId: 'hts-compounds', sampleName: `Cpd ${r}${c}`, value: 10, unit: 'µM' };
        }
      });
      return { wells, groups };
    },
  },
];


