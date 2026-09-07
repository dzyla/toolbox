import { describe, expect, it } from 'vitest';
import {
  buildQpcrQc,
  computeRelativeExpression,
  fitQpcrStandardCurve,
  mapQpcrColumns,
  parseQpcrTable,
  summarizeTechnicalReplicates,
} from '@/core/qpcr';

describe('qPCR table parser', () => {
  it('recognizes Sample Name, Target Name, Ct, Well and Quantity aliases', () => {
    const imported = parseQpcrTable('Sample Name,Target Name,Ct,Well,Quantity\nS1,GAPDH,20.1,A1,100\n');

    expect(imported.observations[0]).toMatchObject({
      sample: 'S1', target: 'GAPDH', cq: 20.1, well: 'A1', standardQuantity: 100,
    });
  });

  it('keeps undetermined Cq as null and reports it', () => {
    const imported = parseQpcrTable('sample\ttarget\tCq\nS1\tACTB\tUndetermined');

    expect(imported.observations[0]!.cq).toBeNull();
    expect(imported.notices.join(' ')).toMatch(/undetermined/i);
  });

  it('parses tab-separated rows with decimal Cq values', () => {
    const imported = parseQpcrTable(' sample \t gene \t C(t) \n S1 \t ACTB \t 19.75 ');

    expect(imported.observations).toHaveLength(1);
    expect(imported.observations[0]).toMatchObject({ sample: 'S1', target: 'ACTB', cq: 19.75 });
    expect(imported.sourceHeaders).toEqual([' sample ', ' gene ', ' C(t) ']);
    expect(imported.rows).toEqual([[' S1 ', ' ACTB ', ' 19.75 ']]);
  });

  it('keeps blank Cq as null and reports it', () => {
    const imported = parseQpcrTable('sample,target,cq\nS1,ACTB,');

    expect(imported.observations[0]!.cq).toBeNull();
    expect(imported.notices.join(' ')).toMatch(/blank/i);
  });

  it('keeps nonnumeric Cq as null and reports it', () => {
    const imported = parseQpcrTable('sample,target,cq\nS1,ACTB,not-a-number');

    expect(imported.observations[0]!.cq).toBeNull();
    expect(imported.notices.join(' ')).toMatch(/numeric/i);
  });

  it('uses the first duplicate header and reports the duplicate', () => {
    const imported = parseQpcrTable('sample,target,cq,Ct\nS1,ACTB,20.1,25.4');

    expect(imported.observations[0]!.cq).toBe(20.1);
    expect(imported.notices.join(' ')).toMatch(/duplicate/i);
  });

  it('rejects tables without a mappable sample, target, and Cq combination', () => {
    expect(() => parseQpcrTable('plate,fluorescence\nA,1200')).toThrow(/sample.*target.*cq/i);
  });

  it('maps manually selected columns without changing raw cells', () => {
    const rows = [['S1', 'ACTB', '21.4', 'B2', '250']];

    expect(mapQpcrColumns(rows, { sample: 0, target: 1, cq: 2, well: 3, quantity: 4 })).toMatchObject([
      { sample: 'S1', target: 'ACTB', cq: 21.4, well: 'B2', standardQuantity: 250 },
    ]);
    expect(rows).toEqual([['S1', 'ACTB', '21.4', 'B2', '250']]);
  });
});

describe('qPCR analysis core', () => {
  it('fits a standard curve and calculates efficiency from its slope', () => {
    const curve = fitQpcrStandardCurve([{ logQuantity: 0, cq: 30 }, { logQuantity: 1, cq: 26.678 }]);

    expect(curve).not.toBeNull();
    expect(curve!.efficiency).toBeCloseTo(1, 3);
    expect(curve!.slope).toBeCloseTo(-3.322, 3);
    expect(curve!.rSquared).toBeCloseTo(1);
  });

  it('calculates 2^-ΔΔCq when comparable efficiency is explicitly confirmed', () => {
    const result = computeRelativeExpression({
      targetCq: 24,
      refCqs: [20, 20],
      calibratorTargetCq: 26,
      calibratorRefCqs: [20, 20],
      method: 'delta-delta',
      comparableEfficiencyConfirmed: true,
    });

    expect(result.status).toBe('derived');
    expect(result.foldChange).toBeCloseTo(4);
  });

  it('requires explicit comparable-efficiency confirmation for 2^-ΔΔCq', () => {
    expect(() => computeRelativeExpression({
      targetCq: 24,
      refCqs: [20],
      calibratorTargetCq: 26,
      calibratorRefCqs: [20],
      method: 'delta-delta',
      comparableEfficiencyConfirmed: false,
    })).toThrow(/efficien/i);
  });

  it('uses a geometric mean for multiple reference genes', () => {
    const result = computeRelativeExpression({
      targetCq: 24,
      refCqs: [20, 21],
      calibratorTargetCq: 26,
      calibratorRefCqs: [20, 20],
      method: 'delta-delta',
      comparableEfficiencyConfirmed: true,
    });

    expect(result.foldChange).toBeCloseTo(Math.sqrt(32));
  });

  it('calculates the efficiency-corrected relative-expression path', () => {
    const result = computeRelativeExpression({
      targetCq: 24,
      refCqs: [20, 20],
      calibratorTargetCq: 26,
      calibratorRefCqs: [20, 20],
      method: 'efficiency-corrected',
      targetEfficiency: 2,
      referenceEfficiencies: [2, 2],
    });

    expect(result.foldChange).toBeCloseTo(4);
  });

  it('returns a blocked result for invalid relative-expression inputs', () => {
    expect(computeRelativeExpression({
      targetCq: 24,
      refCqs: [20],
      calibratorTargetCq: 26,
      calibratorRefCqs: [],
      method: 'delta-delta',
      comparableEfficiencyConfirmed: true,
    })).toMatchObject({ status: 'blocked' });
  });

  it('summarizes included technical replicates and flags wide ranges without excluding them', () => {
    const summaries = summarizeTechnicalReplicates([
      { id: 'a', sample: 'S1', target: 'ACTB', cq: 20 },
      { id: 'b', sample: 'S1', target: 'ACTB', cq: 20.8 },
      { id: 'c', sample: 'S1', target: 'ACTB', cq: 40, excluded: true },
    ], { technicalReplicateRangeThreshold: 0.5 });

    expect(summaries[0]).toMatchObject({
      sample: 'S1', target: 'ACTB', count: 2, mean: 20.4,
      candidateFlags: [expect.stringMatching(/range/i)],
    });
    expect(summaries[0]!.range).toBeCloseTo(0.8);
  });

  it('reports no-template and no-RT control amplification as QC concerns', () => {
    const qc = buildQpcrQc([
      { id: 'ntc', sample: 'NTC', target: 'ACTB', cq: 34, role: 'no-template' },
      { id: 'nort', sample: 'No RT', target: 'ACTB', cq: 32, role: 'no-rt' },
    ], {});

    expect(qc.status).toBe('blocked');
    expect(qc.blockers.join(' ')).toMatch(/no.template/i);
    expect(qc.warnings.join(' ')).toMatch(/no.rt/i);
  });

  it('reports insufficient standard points and preserves explicit exclusion decisions in QC', () => {
    const qc = buildQpcrQc([
      { id: 'standard', sample: 'std', target: 'ACTB', cq: 25, role: 'standard', standardQuantity: 10 },
      { id: 'excluded', sample: 'S1', target: 'ACTB', cq: 19, excluded: true },
    ], { minStandardPoints: 2 });

    expect(qc.status).toBe('blocked');
    expect(qc.blockers.join(' ')).toMatch(/standard/i);
    expect(qc.exclusions).toEqual([{ id: 'excluded', decision: 'exclude' }]);
  });
});
