import { type GroupStats, type ParsedPlate } from './types';

/* ========================================================================= */
/* 5. Export & Integration Helpers (Curve Fitting, CSV)                     */
/* ========================================================================= */

/**
 * Format group mean +/- SD into a dose-response table ready to paste or send
 * directly into Curve Fitting (#/tool/fitting).
 */
export function formatForCurveFitting(
  groups: GroupStats[],
  options: {
    format?: 'multi-replicate' | 'mean-sd';
    useNormalized?: boolean;
  } = {},
): string {
  const format = options.format ?? 'multi-replicate';
  const useNorm = options.useNormalized ?? true;

  const doseGroups = groups.filter(g => g.sampleType === 'sample' || g.sampleType === 'standard');

  const sorted = [...doseGroups].sort((a, b) => {
    const concA = a.concentration ?? parseFloat(a.groupName.replace(/[^0-9.]/g, '')) ?? 0;
    const concB = b.concentration ?? parseFloat(b.groupName.replace(/[^0-9.]/g, '')) ?? 0;
    return concA - concB;
  });

  const lines: string[] = [
    '# Bio-Bench Plate Reader Dose-Response Export',
    '# Ready for Curve Fitting (#/tool/fitting)',
  ];

  if (format === 'multi-replicate') {
    lines.push('# Concentration\tReplicate_Values...');
    sorted.forEach((g, idx) => {
      const conc = g.concentration ?? (parseFloat(g.groupName.replace(/[^0-9.]/g, '')) || idx + 1);
      const vals = useNorm ? g.normalizedValues : g.rawValues;
      if (vals.length > 0) {
        lines.push(`${conc}\t${vals.map(v => v.toFixed(4)).join('\t')}`);
      }
    });
  } else {
    lines.push('# Concentration\tMean\tSD\tSEM\tN');
    sorted.forEach((g, idx) => {
      const conc = g.concentration ?? (parseFloat(g.groupName.replace(/[^0-9.]/g, '')) || idx + 1);
      const m = useNorm ? g.mean : g.rawMean;
      const s = useNorm ? g.sd : g.rawSd;
      const se = useNorm ? g.sem : g.rawSem;
      lines.push(`${conc}\t${m.toFixed(4)}\t${s.toFixed(4)}\t${se.toFixed(4)}\t${g.nValid}`);
    });
  }

  return lines.join('\n');
}

/** Export plate as a 2D matrix CSV (96 or 384 wells) */
export function exportNormalizedMatrixCsv(plate: ParsedPlate, mode: 'normalized' | 'raw' = 'normalized'): string {
  const lines: string[] = [];
  lines.push(',' + plate.cols.join(','));

  for (const r of plate.rows) {
    const rowCells: string[] = [r];
    for (const c of plate.cols) {
      const well = plate.wells[`${r}${c}`];
      const val = mode === 'normalized' ? well?.normalized : well?.raw;
      rowCells.push(val !== null && val !== undefined ? String(val) : '');
    }
    lines.push(rowCells.join(','));
  }
  return lines.join('\n');
}

/** Export group statistics summary table as CSV */
export function exportSummaryCsv(groups: GroupStats[]): string {
  const headers = [
    'Group_ID',
    'Group_Name',
    'Sample_Type',
    'Concentration',
    'Unit',
    'N_Total',
    'N_Valid',
    'N_Excluded',
    'Raw_Mean',
    'Raw_SD',
    'Raw_CV_Pct',
    'Normalized_Mean',
    'Normalized_SD',
    'Normalized_SEM',
    'Normalized_CV_Pct',
    'Median',
    'MAD',
    'Min',
    'Max',
    'Outliers_Count',
    'QC_Status',
  ];

  const lines: string[] = [headers.join(',')];

  for (const g of groups) {
    const row = [
      g.groupId,
      `"${g.groupName.replace(/"/g, '""')}"`,
      g.sampleType,
      g.concentration !== undefined ? String(g.concentration) : '',
      g.concentrationUnit ?? '',
      g.nTotal,
      g.nValid,
      g.nExcluded,
      g.rawMean.toFixed(4),
      g.rawSd.toFixed(4),
      g.rawCv.toFixed(2),
      g.mean.toFixed(4),
      g.sd.toFixed(4),
      g.sem.toFixed(4),
      g.cv.toFixed(2),
      g.median.toFixed(4),
      g.mad.toFixed(4),
      g.min.toFixed(4),
      g.max.toFixed(4),
      g.outlierWellIds.length,
      g.qcFlags.status.toUpperCase(),
    ];
    lines.push(row.join(','));
  }

  return lines.join('\n');
}
