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

export interface PipettingSchemeStep {
  stepNumber: number;
  description: string;
  volumeUl: number;
  reagent: string;
  source: string;
  destination: string;
  pipetteType: 'single' | '8-channel' | '12-channel';
}

export interface PipettingPlan {
  totalAssignedWells: number;
  workingVolumeUl: number;
  transferVolumeUl: number;
  totalDiluentNeededUl: number;
  totalStockNeededUl: number;
  steps: PipettingSchemeStep[];
}

/** Generate a realistic step-by-step pipetting scheme for plate preparation */
export function generatePipettingScheme(
  wells: Record<string, WellData>,
  options: {
    workingVolumeUl: number;
    transferVolumeUl: number;
    pipetteType: 'single' | '8-channel' | '12-channel';
  },
): PipettingPlan {
  const { workingVolumeUl, transferVolumeUl, pipetteType } = options;
  const assigned = Object.values(wells).filter(w => !!w.sampleGroupId);
  const diluentVolPerWell = workingVolumeUl;
  const steps: PipettingSchemeStep[] = [];

  // Step 1: Pre-fill diluent/buffer into destination wells
  steps.push({
    stepNumber: 1,
    description: `Dispense ${diluentVolPerWell} µL assay buffer / diluent into all ${assigned.length} destination wells.`,
    volumeUl: diluentVolPerWell * assigned.length,
    reagent: 'Assay Buffer / Media',
    source: 'Reagent Reservoir',
    destination: `${assigned.length} active wells`,
    pipetteType,
  });

  // Step 2: Load highest concentration stock
  const stockWells = assigned.filter(w => w.value !== undefined && w.value > 0);
  const maxVal = Math.max(0, ...stockWells.map(w => w.value || 0));
  const highestWells = stockWells.filter(w => w.value === maxVal);

  if (highestWells.length > 0) {
    const stockLoadVol = workingVolumeUl + transferVolumeUl;
    steps.push({
      stepNumber: 2,
      description: `Add ${stockLoadVol} µL concentrated stock solution into initial well(s) ${highestWells.map(w => w.id).join(', ')}.`,
      volumeUl: stockLoadVol * highestWells.length,
      reagent: 'Stock Sample / Standard',
      source: 'Stock Tube',
      destination: highestWells.map(w => w.id).join(', '),
      pipetteType: pipetteType === 'single' ? 'single' : '8-channel',
    });

    // Step 3: Serial transfer instructions
    steps.push({
      stepNumber: 3,
      description: `Perform serial transfer: transfer ${transferVolumeUl} µL sequentially across wells, mixing 3–5× by pipetting up and down at each step. Discard ${transferVolumeUl} µL from the final dilution well before the blank.`,
      volumeUl: transferVolumeUl,
      reagent: 'Serial Transfer',
      source: 'Preceding column/row',
      destination: 'Succeeding column/row',
      pipetteType,
    });
  }

  // Step 4: Final verification and incubation
  steps.push({
    stepNumber: steps.length + 1,
    description: `Ensure uniform meniscus: centrifuge plate briefly (500 × g, 30 s) or tap gently to remove bubbles before plate reading.`,
    volumeUl: 0,
    reagent: 'None',
    source: 'Benchtop plate spinner',
    destination: 'Plate Reader',
    pipetteType: 'single',
  });

  const totalDiluent = diluentVolPerWell * assigned.length;
  const totalStock = (workingVolumeUl + transferVolumeUl) * Math.max(1, highestWells.length);

  return {
    totalAssignedWells: assigned.length,
    workingVolumeUl,
    transferVolumeUl,
    totalDiluentNeededUl: totalDiluent,
    totalStockNeededUl: totalStock,
    steps,
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

