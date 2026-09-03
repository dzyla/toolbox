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

/** Serialize plate data to a tabular CSV format */
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
