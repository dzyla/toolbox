import { describe, it, expect } from 'vitest';
import { groupSummaryRows, methodsText, calibrationRows } from '@/tools/gel/export-tables';
import { summarizeGroups } from '@/core/gel/groups';
import { fitCalibration } from '@/core/gel/calibration';

describe('export tables', () => {
  it('group summary has one header and one row per condition, with empty cells for nulls', () => {
    const s = summarizeGroups([{ laneId: 'a', condition: 'ctrl', replicate: 1, value: 1, flags: [] }], 'ctrl');
    const rows = groupSummaryRows(s, 'ctrl');
    expect(rows[0]).toContain('Mean');
    expect(rows).toHaveLength(2);
    expect(rows[1]![rows[0]!.indexOf('SD')]).toBe('');
  });
  it('calibration rows include fit parameters and ladder points', () => {
    const cal = fitCalibration([{ y: 10, size: 100 }, { y: 50, size: 50 }, { y: 90, size: 25 }], 'linear');
    const rows = calibrationRows({ calibration: cal, ladderRows: [{ y: 10, assigned: 100, fitted: 100, residualPct: 0 }], mass: null, sizeUnit: 'kDa' });
    expect(rows.flat().join(' ')).toMatch(/R2/);
    expect(rows.flat()).toContain(100);
  });
  it('methods text states every setting that affects the numbers', () => {
    const t = methodsText({ source: { format: 'tiff', bitDepth: 16, lossy: false, rescaled: false }, transforms: ['crop (exact)'], deskewAngle: 0,
      laneWidths: [20, 22], bgMethod: 'rolling', radius: 40, prominence: 0.05, calibModel: 'monotone', calibR2: 0.998, massModel: null, massR2: null,
      norm: 'control-band', welch: true, version: '0.1.0' });
    for (const k of ['16-bit TIFF', 'rolling', '40', 'monotone', '0.998', 'control', 'Welch', 'Holm', '0.1.0', 'crop']) expect(t).toContain(k);
  });
});
