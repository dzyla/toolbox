import { describe, expect, it } from 'vitest';
import type { ChromatogramImport } from '@/core/chromatography';
import {
  createFractionPool,
  fractionLabelsIntersectingRange,
  validateAxisRange,
} from '@/tools/sec/chromatogram-workspace';

const imported = {
  sourceHeaders: [],
  columnMapping: {},
  mappedHeaders: {},
  points: [],
  fractions: [],
  fractionEvents: [
    { label: 'F1', volumeMl: 1 },
    { label: 'F2', volumeMl: 2 },
    { label: 'F3', volumeMl: 3 },
    { label: 'F4', volumeMl: 4 },
  ],
  notices: [],
} satisfies ChromatogramImport;

describe('chromatogram workspace helpers', () => {
  it('rejects invalid Y limits before a controlled chart update', () => {
    expect(validateAxisRange('10', '250')).toEqual({ ok: true, range: [10, 250] });
    expect(validateAxisRange('250', '10')).toEqual({ ok: false, error: 'Y maximum must be greater than Y minimum.' });
    expect(validateAxisRange('nope', '10')).toEqual({ ok: false, error: 'Y limits must be finite numbers.' });
  });

  it('selects each fraction interval intersected by a display range', () => {
    expect(fractionLabelsIntersectingRange(imported, { startVolumeMl: 1.5, endVolumeMl: 3.2 }))
      .toEqual(['F1', 'F2', 'F3']);
  });

  it('creates an exportable pool with native bounds from selected fractions', () => {
    expect(createFractionPool({
      id: 'pool-1', name: 'Main peak', runId: 'run-1', imported, labels: ['F2', 'F3'],
    })).toEqual({
      id: 'pool-1', name: 'Main peak', runId: 'run-1', labels: ['F2', 'F3'], startVolumeMl: 2, endVolumeMl: 4,
    });
  });
});
