import { describe, expect, it } from 'vitest';
import { mapQpcrColumns, parseQpcrTable } from '@/core/qpcr';

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
