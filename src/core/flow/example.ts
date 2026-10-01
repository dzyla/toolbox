/* Synthetic two-population example (not real cells): seeded, so the same events every time. */
import { applyCompensation, type CompensationMatrix, type FcsData, type FcsParameter } from './fcs';

function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return (s + 0.5) / 4294967296; };
}

export function syntheticExample(events = 20_000, seed = 7): FcsData {
  const rand = rng(seed);
  const normal = () => Math.sqrt(-2 * Math.log(rand())) * Math.cos(2 * Math.PI * rand());
  const names = ['FSC-A', 'SSC-A', 'FL1-A', 'FL2-A'];
  const labels = ['', '', 'CD4 FITC', 'CD8 PE'];
  const parameters: FcsParameter[] = names.map((name, index) => ({
    index, name, label: labels[index]!, range: 262144, bits: 32, log: false, decades: 0, offset: 0, gain: 1,
  }));
  const trueCols = names.map(() => new Float32Array(events));
  for (let e = 0; e < events; e++) {
    const pop2 = rand() < 0.35; // population 2: larger, brighter in FL1
    trueCols[0]![e] = Math.max(1, (pop2 ? 130_000 : 70_000) + normal() * (pop2 ? 18_000 : 12_000));
    trueCols[1]![e] = Math.max(1, (pop2 ? 60_000 : 25_000) + normal() * (pop2 ? 12_000 : 7_000));
    trueCols[2]![e] = 10 ** ((pop2 ? 3.6 : 1.9) + normal() * 0.28);
    trueCols[3]![e] = 10 ** (2.2 + normal() * 0.3);
  }
  // Spill 8% of FL1 into FL2 so the compensation toggle visibly matters.
  const compensation: CompensationMatrix = {
    source: '$SPILLOVER',
    names: ['FL1-A', 'FL2-A'],
    matrix: [[1, 0.08], [0, 1]],
  };
  const observed = trueCols.map(c => c.slice());
  for (let e = 0; e < events; e++) observed[3]![e] = trueCols[3]![e]! + 0.08 * trueCols[2]![e]!;
  const columns = applyCompensation(observed, parameters, compensation);
  return {
    version: 'FCS3.1', parameters, columns, eventCount: events, keywords: {},
    meta: { cytometer: 'Synthetic example', date: '', beginTime: '', endTime: '', fileName: 'synthetic-example.fcs' },
    compensation, compensationApplied: true,
    warnings: ['Synthetic data generated in your browser: not from a real instrument or sample.'],
  };
}

/** The uncompensated example columns (what an instrument would have recorded). */
export function syntheticObserved(events = 20_000, seed = 7): FcsData {
  const d = syntheticExample(events, seed);
  const inv = d.compensation!;
  // observed = true x S: FL2_obs = FL2_true + 0.08 * FL1_true
  const cols = d.columns.slice();
  const fl2 = new Float32Array(events);
  for (let e = 0; e < events; e++) fl2[e] = d.columns[3]![e]! + inv.matrix[0]![1]! * d.columns[2]![e]!;
  cols[3] = fl2;
  return { ...d, columns: cols, compensationApplied: false };
}
