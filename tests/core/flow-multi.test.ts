import { describe, it, expect } from 'vitest';
import {
  defaultScale, forward, evaluateGates, evaluateSampleGates, sampleGateStats, allGateStats, pooledGateStats, maskCount,
  makeSplitGates, setSplitThreshold, splitBaseName, parseFcs, exampleSamples, exampleSample, EXAMPLE_SAMPLES,
  commonParameters, samplesLacking, sampleName, uniqueNames, paramIndex, sharedRange, autoRange,
  exportGates, importGates, GateImportError, GATE_FORMAT,
  type Gate, type FcsData,
} from '@/core/flow';
import { buildFcs } from './fcs-builder';

const lin = defaultScale('linear');
const asinh = defaultScale('asinh');
const log = defaultScale('log');

describe('split gate', () => {
  const xs = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  const [left, right] = makeSplitGates(['a', 'b'], 'CD4', null, 0, lin, 5);
  it('splits at the threshold: left is x < t, right is x >= t, and the halves cover every event once', () => {
    const m = evaluateGates([xs], [left, right], xs.length);
    expect(maskCount(m.a!)).toBe(4);
    expect(maskCount(m.b!)).toBe(6);
    for (let e = 0; e < xs.length; e++) expect(m.a![e]! + m.b![e]!).toBe(1);
    expect(left.name).toBe('CD4−');
    expect(right.name).toBe('CD4+');
    expect(left.pair).toBe(right.pair);
  });
  it('is tested on its own display scale and leaves NaN in neither half', () => {
    const [l, r] = makeSplitGates(['l', 'r'], 'x', null, 0, log, 1.5); // threshold 10^1.5 = 31.6
    const m = evaluateGates([[1, 10, 31, 32, 1000]], [l, r], 5);
    expect(Array.from(m.l!)).toEqual([1, 1, 1, 0, 0]);
    expect(Array.from(m.r!)).toEqual([0, 0, 0, 1, 1]);
    const [ln, rn] = makeSplitGates(['l', 'r'], 'x', null, 0, asinh, 0);
    const n = evaluateGates([[-5, NaN, 5]], [ln, rn], 3);
    expect(Array.from(n.l!)).toEqual([1, 0, 0]);
    expect(Array.from(n.r!)).toEqual([0, 0, 1]);
  });
  it('moves both halves together and respects a parent', () => {
    const parent: Gate = { id: 'p', name: 'p', parent: null, type: 'range', param: 0, scale: lin, min: 3, max: 8 };
    const [l, r] = makeSplitGates(['l', 'r'], 'x', 'p', 0, lin, 5);
    const moved = setSplitThreshold([parent, l, r], l.pair, 7);
    expect(moved.filter(g => g.type === 'split').map(g => (g as { threshold: number }).threshold)).toEqual([7, 7]);
    const m = evaluateGates([xs], moved, xs.length);
    expect(maskCount(m.l!)).toBe(4); // 3..6
    expect(maskCount(m.r!)).toBe(2); // 7, 8
    expect(moved[0]).toBe(parent);
  });
  it('names halves from the marker label when there is one', () => {
    expect(splitBaseName({ name: 'FL2-A', label: 'CD4 PE' })).toBe('CD4');
    expect(splitBaseName({ name: 'FL2-A', label: '' })).toBe('FL2-A');
    expect(splitBaseName({ name: 'SSC-A' })).toBe('SSC-A');
  });
});

describe('range gate on a histogram axis', () => {
  it('is inclusive at both ends on its display scale', () => {
    const g: Gate = { id: 'r', name: 'r', parent: null, type: 'range', param: 'FL1-A', scale: asinh, min: forward(100, asinh), max: forward(1000, asinh) };
    const m = evaluateGates([[50, 100, 500, 1000, 1001]], [g], 5, ['FL1-A']);
    expect(Array.from(m.r!)).toEqual([0, 1, 1, 1, 0]);
  });
});

/** Two files with the same parameters in different column orders, and a third without FL2-A. */
function threeFiles(): FcsData[] {
  const a = parseFcs(buildFcs({ datatype: 'F', params: [{ name: 'FSC-A' }, { name: 'FL1-A' }, { name: 'FL2-A' }], events: [[10, 1, 100], [20, 2, 200], [30, 3, 300], [40, 4, 400]] }));
  const b = parseFcs(buildFcs({ datatype: 'F', params: [{ name: 'FL2-A' }, { name: 'FSC-A' }, { name: 'FL1-A' }], events: [[100, 10, 1], [400, 40, 4]] }));
  const c = parseFcs(buildFcs({ datatype: 'F', params: [{ name: 'FL1-A' }, { name: 'FSC-A' }], events: [[1, 10], [2, 20], [3, 30]] }));
  return [a, b, c];
}

describe('gates across samples', () => {
  const gates: Gate[] = [
    { id: 'big', name: 'big', parent: null, type: 'range', param: 'FSC-A', scale: lin, min: 15, max: 100 },
    ...makeSplitGates(['lo', 'hi'], 'FL2', 'big', 'FL2-A', lin, 250),
  ];
  it('matches parameters by $PnN name whatever the column order', () => {
    const [a, b] = threeFiles();
    const ra = evaluateSampleGates(a!, gates), rb = evaluateSampleGates(b!, gates);
    expect(Array.from(ra.masks.big!)).toEqual([0, 1, 1, 1]);
    expect(Array.from(ra.masks.hi!)).toEqual([0, 0, 1, 1]);
    expect(Array.from(rb.masks.big!)).toEqual([0, 1]);
    expect(Array.from(rb.masks.hi!)).toEqual([0, 1]);
    expect(ra.missing).toEqual({});
  });
  it('gives a null mask (not an error) where a gate or its parent uses a missing parameter', () => {
    const c = threeFiles()[2]!;
    const r = evaluateSampleGates(c, gates);
    expect(maskCount(r.masks.big!)).toBe(2);
    expect(r.masks.lo).toBeNull();
    expect(r.missing.hi).toEqual(['FL2-A']);
    const child: Gate = { id: 'kid', name: 'kid', parent: 'hi', type: 'range', param: 'FSC-A', scale: lin, min: 0, max: 1e9 };
    expect(evaluateSampleGates(c, [...gates, child]).missing.kid).toEqual(['FL2-A']);
    expect(() => evaluateGates(c.columns, gates, c.eventCount, c.parameters.map(p => p.name))).toThrow(/does not have/);
    // allGateStats leaves out gates with no mask
    expect(allGateStats(c.columns, gates, c.eventCount, 0, r.masks).map(x => x.name)).toEqual(['All events', 'big']);
  });
  it('per-sample stats: count, % of parent, % of total and the chosen statistic', () => {
    const [a, b, c] = threeFiles();
    const sa = sampleGateStats(a!, gates, 'hi', 'FSC-A')!;
    expect(sa).toMatchObject({ count: 2, pctTotal: 50, median: 35, mean: 35 });
    expect(sa.pctParent).toBeCloseTo((2 / 3) * 100, 10);
    expect(sampleGateStats(b!, gates, 'hi', 'FL1-A')).toMatchObject({ count: 1, pctParent: 100, pctTotal: 50, mean: 4 });
    expect(sampleGateStats(c!, gates, 'hi', 'FSC-A')).toBeNull();
    expect(sampleGateStats(c!, gates, null, 'FSC-A')).toMatchObject({ count: 3, pctTotal: 100, mean: 20 });
    const noParam = sampleGateStats(c!, gates, 'big', 'FL2-A')!;
    expect(noParam.count).toBe(2);
    expect(noParam.mean).toBeNaN();
    expect(sampleGateStats(a!, gates, 'nope', 'FSC-A')).toBeNull();
  });
  it('finds common parameters, the samples lacking one, and shared ranges', () => {
    const files = threeFiles();
    expect(commonParameters(files)).toEqual(['FSC-A', 'FL1-A']);
    expect(commonParameters(files.slice(0, 2))).toEqual(['FSC-A', 'FL1-A', 'FL2-A']);
    expect(commonParameters([])).toEqual([]);
    expect(samplesLacking(files, 'FL2-A')).toEqual([2]);
    expect(paramIndex(files[1]!, 'FSC-A')).toBe(1);
    const r = sharedRange([files[0]!.columns[0]!, Float32Array.from([500])], lin);
    expect(r.min).toBeLessThanOrEqual(autoRange(files[0]!.columns[0]!, lin).min);
    expect(r.max).toBeGreaterThan(500);
    expect(sharedRange([], lin)).toEqual({ min: 0, max: 1 });
  });
  it('names samples from the file, then $SMNO, then $FIL, and de-duplicates', () => {
    const d = { keywords: { $SMNO: 'Tube 3' }, meta: { cytometer: '', date: '', beginTime: '', endTime: '', fileName: 'run.fcs' } };
    expect(sampleName(d, 'a.fcs')).toBe('a.fcs');
    expect(sampleName(d)).toBe('Tube 3');
    expect(sampleName({ ...d, keywords: {} })).toBe('run.fcs');
    expect(sampleName({ ...d, keywords: {}, meta: { ...d.meta, fileName: '' } }, '', 'Sample 2')).toBe('Sample 2');
    expect(uniqueNames(['a', 'b', 'a', 'a'])).toEqual(['a', 'b', 'a (2)', 'a (3)']);
  });
});

describe('gate JSON', () => {
  const gates: Gate[] = [
    { id: 'cells', name: 'Cells', parent: null, type: 'rect', xParam: 'FSC-A', yParam: 'SSC-A', xScale: lin, yScale: lin, xMin: 30000, xMax: 200000, yMin: 0, yMax: 100000 },
    { id: 'poly', name: 'Lymphs', parent: 'cells', type: 'polygon', xParam: 'FSC-A', yParam: 'SSC-A', xScale: lin, yScale: log, points: [[40000, 3], [90000, 3], [90000, 4.5], [40000, 4.5]] },
    { id: 'r', name: 'Bright', parent: 'poly', type: 'range', param: 'FL1-A', scale: { ...asinh, cofactor: 5 }, min: 2, max: 9 },
    ...makeSplitGates(['s1', 's2'], 'CD4', 'poly', 'FL2-A', asinh, forward(1000, asinh)),
    { id: 'lowlog', name: 'Below floor', parent: null, type: 'range', param: 'FL1-A', scale: log, min: -0.5, max: 2 },
  ];
  const samples = [{ name: 'A', parameters: ['FSC-A', 'SSC-A', 'FL1-A', 'FL2-A'] }];

  it('round-trips every gate type through JSON text', () => {
    const doc = exportGates(gates);
    expect(doc.format).toBe(GATE_FORMAT);
    expect(doc.version).toBe(1);
    const back = importGates(JSON.stringify(doc), samples);
    expect(back.warnings).toEqual([]);
    expect(back.gates.map(g => g.id)).toEqual(gates.map(g => g.id));
    back.gates.forEach((g, i) => {
      const o = gates[i]!;
      expect(g.type).toBe(o.type);
      expect(g.name).toBe(o.name);
      expect(g.parent).toBe(o.parent);
      const nums = (x: Gate) => JSON.stringify(x).match(/-?\d+(\.\d+)?(e[-+]?\d+)?/g)!.map(Number);
      const a = nums(g), b = nums(o);
      expect(a.length).toBe(b.length);
      a.forEach((v, k) => expect(v).toBeCloseTo(b[k]!, 6));
    });
    // and reproduces the same events
    const data = exampleSample(EXAMPLE_SAMPLES[1]!, 1, 2000);
    const named = (gs: Gate[]) => gs.map(g => (g.type === 'rect' || g.type === 'polygon' ? { ...g, yParam: 'SSC-A' } : g));
    const m1 = evaluateSampleGates(data, named(gates)).masks, m2 = evaluateSampleGates(data, named(back.gates)).masks;
    for (const g of gates) expect(maskCount(m2[g.id]!)).toBe(maskCount(m1[g.id]!));
  });

  it('writes parameter names and data-unit coordinates', () => {
    const doc = exportGates([{ id: 'x', name: 'x', parent: null, type: 'range', param: 1, scale: log, min: 1, max: 3 }], ['FSC-A', 'FL1-A']);
    expect(doc.gates[0]).toMatchObject({ type: 'range', param: 'FL1-A', min: 10, max: 1000, scale: { kind: 'log', cofactor: 150, floor: 1 } });
    expect(exportGates([{ id: 'x', name: 'x', parent: null, type: 'range', param: 4, scale: lin, min: 1, max: 3 }]).gates[0]).toMatchObject({ param: 'P5' });
  });

  it('rejects unreadable documents with a clear error', () => {
    expect(() => importGates('{not json', samples)).toThrow(GateImportError);
    expect(() => importGates('{not json', samples)).toThrow(/not valid JSON/);
    expect(() => importGates({ format: 'other', version: 1, gates: [] }, samples)).toThrow(/not a Bio-Bench gate file/);
    expect(() => importGates([], samples)).toThrow(/not a Bio-Bench gate file/);
    expect(() => importGates({ format: GATE_FORMAT, version: 2, gates: [] }, samples)).toThrow(/version 2 is not supported/);
    expect(() => importGates({ format: GATE_FORMAT, version: 1 }, samples)).toThrow(/no "gates" list/);
  });

  it('skips malformed gates with a warning per gate, never throwing', () => {
    const good = exportGates(gates.slice(0, 1)).gates[0]!;
    const bad = [
      null,
      { ...good, id: '' },
      { ...good, id: 'cells' },
      { ...good, id: 'n1', name: 7 },
      { ...good, id: 'p1', parent: 5 },
      { ...good, id: 'k', name: 'kind', type: 'ellipse' },
      { ...good, id: 'm', name: 'minmax', xMin: 5, xMax: 1 },
      { ...good, id: 'nan', name: 'nanny', yMax: 'big' },
      { ...good, id: 's', name: 'scaly', xScale: { kind: 'logicle' } },
      { ...good, id: 'cf', name: 'cof', xScale: { kind: 'asinh', cofactor: -1 } },
      { ...good, id: 'fl', name: 'flo', xScale: { kind: 'log', floor: 0 } },
      { ...good, id: 'xp', name: 'xparam', xParam: '' },
      { id: 'pg', name: 'tri', parent: null, type: 'polygon', xParam: 'FSC-A', yParam: 'SSC-A', xScale: lin, yScale: lin, points: [[1, 2], [3, 4]] },
      { id: 'pg2', name: 'pts', parent: null, type: 'polygon', xParam: 'FSC-A', yParam: 'SSC-A', xScale: lin, yScale: lin, points: [[1, 2], [3, 4], [5]] },
      { id: 'rg', name: 'rng', parent: null, type: 'range', param: 'FL1-A', scale: lin, min: 9, max: 1 },
      { id: 'lg', name: 'neglog', parent: null, type: 'range', param: 'FL1-A', scale: log, min: -1, max: 10 },
      { id: 'sp', name: 'side', parent: null, type: 'split', param: 'FL1-A', scale: lin, threshold: 1, side: 'up', pair: 'x' },
      { id: 'sp2', name: 'nopair', parent: null, type: 'split', param: 'FL1-A', scale: lin, threshold: 1, side: 'left' },
    ];
    const r = importGates({ format: GATE_FORMAT, version: 1, gates: [good, ...bad] }, samples);
    expect(r.gates.map(g => g.id)).toEqual(['cells']);
    expect(r.warnings.length).toBe(bad.length);
    expect(r.warnings.join('\n')).toMatch(/gate 2: it is not an object/);
    expect(r.warnings.join('\n')).toMatch(/used twice/);
    expect(r.warnings.join('\n')).toMatch(/"kind": unknown gate type "ellipse"/);
    expect(r.warnings.join('\n')).toMatch(/"minmax": a minimum is greater/);
    expect(r.warnings.join('\n')).toMatch(/"neglog": min cannot be placed on a log scale/);
  });

  it('skips gates whose parameters no sample has (and their children), and warns about partial coverage', () => {
    const doc = exportGates(gates);
    const r = importGates(doc, [{ name: 'A', parameters: ['FSC-A', 'SSC-A', 'FL1-A'] }, { name: 'B', parameters: ['FSC-A', 'SSC-A'] }]);
    expect(r.gates.map(g => g.id)).toEqual(['cells', 'poly', 'r', 'lowlog']);
    const w = r.warnings.join('\n');
    expect(w).toMatch(/Skipped 2 gates on parameters that no loaded sample has: "CD4−" \(FL2-A\); "CD4\+" \(FL2-A\)/);
    expect(w).toMatch(/FL1-A is missing from B/);
    const orphan = importGates({ format: GATE_FORMAT, version: 1, gates: [{ ...doc.gates[2], parent: 'ghost' }] }, samples);
    expect(orphan.gates).toEqual([]);
    expect(orphan.warnings[0]).toMatch(/parent gate "ghost" was not imported/);
    const loop = importGates({ format: GATE_FORMAT, version: 1, gates: [{ ...doc.gates[0], parent: 'poly' }, doc.gates[1]] }, samples);
    expect(loop.gates).toEqual([]);
    expect(loop.warnings[0]).toMatch(/loop/);
  });
});

describe('multi-sample example', () => {
  const samples = exampleSamples(6000);
  it('is deterministic, labelled synthetic, and keeps the spillover demonstration', () => {
    const again = exampleSamples(6000);
    expect(samples.map(s => s.keywords.$SMNO)).toEqual(['Unstained', 'Stim 0 h', 'Stim 6 h', 'Stim 24 h']);
    samples.forEach((s, i) => {
      expect(s.eventCount).toBe(6000);
      expect(Array.from(s.columns[4]!.subarray(0, 20))).toEqual(Array.from(again[i]!.columns[4]!.subarray(0, 20)));
      expect(s.warnings[0]).toMatch(/Synthetic/);
      expect(s.compensationApplied).toBe(true);
    });
    expect(exampleSamples().every(s => s.eventCount === 20_000)).toBe(true);
    const raw = exampleSamples(6000, 7, false);
    expect(raw[1]!.compensationApplied).toBe(false);
    // FITC spills into FL2: uncompensated CD3+ events read brighter in FL2.
    const cd3 = samples[1]!.columns[3]!;
    let diff = 0;
    for (let e = 0; e < 6000; e++) if (cd3[e]! > 2000) diff += raw[1]!.columns[4]![e]! - samples[1]!.columns[4]![e]!;
    expect(diff).toBeGreaterThan(0);
  });

  it('has debris, three scatter populations, doublets, dead cells and a CD4+ fraction that rises over time', () => {
    const t = (v: number) => forward(v, asinh);
    const gates: Gate[] = [
      { id: 'cells', name: 'Cells', parent: null, type: 'rect', xParam: 'FSC-A', yParam: 'SSC-A', xScale: lin, yScale: lin, xMin: 30_000, xMax: 262_144, yMin: 0, yMax: 262_144 },
      { id: 'single', name: 'Singlets', parent: 'cells', type: 'polygon', xParam: 'FSC-A', yParam: 'FSC-H', xScale: lin, yScale: lin, points: [[0, 0], [262_144, 262_144 * 0.74], [262_144, 262_144], [0, 50_000]] },
      ...makeSplitGates(['live', 'deadg'], 'Viability', 'single', 'FL4-A', asinh, t(1000)),
      { id: 'lym', name: 'Lymphocytes', parent: 'live', type: 'rect', xParam: 'FSC-A', yParam: 'SSC-A', xScale: lin, yScale: lin, xMin: 40_000, xMax: 90_000, yMin: 5_000, yMax: 32_000 },
      { id: 'gran', name: 'Granulocytes', parent: 'live', type: 'rect', xParam: 'FSC-A', yParam: 'SSC-A', xScale: lin, yScale: lin, xMin: 80_000, xMax: 200_000, yMin: 90_000, yMax: 262_144 },
      ...makeSplitGates(['cd3n', 'cd3p'], 'CD3', 'lym', 'FL1-A', asinh, t(1000)),
      ...makeSplitGates(['cd4n', 'cd4p'], 'CD4', 'cd3p', 'FL2-A', asinh, t(1000)),
    ];
    const pct = samples.map(s => {
      const m = evaluateSampleGates(s, gates).masks;
      const n = (id: string) => maskCount(m[id]!);
      return { cells: n('cells') / s.eventCount, single: n('single') / n('cells'), dead: n('deadg') / n('single'), lym: n('lym') / n('live'), gran: n('gran') / n('live'), cd3: n('cd3p') / n('lym'), cd4: n('cd4p') / n('cd3p') };
    });
    for (const p of pct) {
      expect(p.cells).toBeGreaterThan(0.9); // ~6% debris
      expect(p.cells).toBeLessThan(0.97);
      expect(p.single).toBeGreaterThan(0.93); // ~4% doublets
      expect(p.single).toBeLessThan(0.99);
      expect(p.lym).toBeGreaterThan(0.5);
      expect(p.gran).toBeGreaterThan(0.2);
    }
    const [un, h0, h6, h24] = pct as [typeof pct[0], typeof pct[0], typeof pct[0], typeof pct[0]];
    expect(un.cd3).toBeLessThan(0.02); // unstained: nothing is positive
    expect(un.dead).toBeLessThan(0.02);
    for (const p of [h0, h6, h24]) { expect(p.cd3).toBeGreaterThan(0.6); expect(p.cd3).toBeLessThan(0.85); }
    expect(h0.cd4).toBeGreaterThan(0.48);
    expect(h6.cd4).toBeGreaterThan(h0.cd4 + 0.03);
    expect(h24.cd4).toBeGreaterThan(h6.cd4 + 0.03);
    expect(h24.cd4).toBeLessThan(0.8);
    expect(h24.dead).toBeGreaterThan(h6.dead);
    expect(h6.dead).toBeGreaterThan(h0.dead);
  });
});

describe('pooled statistics over samples', () => {
  // Two samples with the same parameter in different column orders, and a third without it.
  const a = { name: 'A', parameters: [{ name: 'X' }, { name: 'Y' }], columns: [Float32Array.from([1, 2, 3, 4]), Float32Array.from([0, 0, 0, 0])], eventCount: 4 };
  const b = { name: 'B', parameters: [{ name: 'Y' }, { name: 'X' }], columns: [Float32Array.from([0, 0]), Float32Array.from([10, 20])], eventCount: 2 };
  const c = { name: 'C', parameters: [{ name: 'Y' }], columns: [Float32Array.from([5, 5, 5])], eventCount: 3 };
  const [lo, hi] = makeSplitGates(['lo', 'hi'], 'X', null, 'X', lin, 2.5);

  it('sums counts and percentages over the samples and takes statistics over their events together', () => {
    const { rows, skipped } = pooledGateStats([a, b], [lo, hi], 'X');
    expect(rows[0]!.stats.count).toBe(6);
    const rHi = rows.find(r => r.id === 'hi')!.stats;
    expect(rHi.count).toBe(4);                       // 3, 4 from A; 10, 20 from B
    expect(rHi.pctParent).toBeCloseTo(100 * 4 / 6, 6);
    expect(rHi.median).toBeCloseTo(7, 6);            // median of 3, 4, 10, 20
    expect(skipped).toEqual({});
  });

  it('leaves out, and names, a sample where the gate cannot be evaluated', () => {
    const { rows, skipped } = pooledGateStats([a, b, c], [lo, hi], 'X');
    expect(rows[0]!.stats.count).toBe(6);            // C lacks the statistics parameter
    expect(rows.find(r => r.id === 'hi')!.stats.pctTotal).toBeCloseTo(100 * 4 / 6, 6);
    expect(skipped.hi).toEqual(['C']);
  });
});
