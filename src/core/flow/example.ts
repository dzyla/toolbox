/*
 * Synthetic multi-sample example (not real cells): seeded, so the same events every time. Four samples share
 * one panel: debris, doublets and lymphocytes / monocytes / granulocytes on scatter, a viability dye, and
 * CD3 / CD4 / CD8 on the lymphocytes. Dead cells and the CD4+ share of T cells rise across the time course.
 */
import { applyCompensation, type CompensationMatrix, type FcsData, type FcsParameter } from './fcs';

function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return (s + 0.5) / 4294967296; };
}

export interface ExampleSampleSpec {
  name: string;
  /** False for the unstained control: every fluorescence channel shows autofluorescence only. */
  stained: boolean;
  /** Fraction of cells (not debris) that are dead. */
  dead: number;
  /** Fraction of CD3+ T cells that are CD4+ (most of the rest are CD8+). */
  cd4: number;
}

export const EXAMPLE_SAMPLES: readonly ExampleSampleSpec[] = [
  { name: 'Unstained', stained: false, dead: 0.05, cd4: 0.55 },
  { name: 'Stim 0 h', stained: true, dead: 0.04, cd4: 0.55 },
  { name: 'Stim 6 h', stained: true, dead: 0.09, cd4: 0.63 },
  { name: 'Stim 24 h', stained: true, dead: 0.18, cd4: 0.72 },
];

const NAMES = ['FSC-A', 'FSC-H', 'SSC-A', 'FL1-A', 'FL2-A', 'FL3-A', 'FL4-A', 'Time'];
const LABELS = ['', '', '', 'CD3 FITC', 'CD4 PE', 'CD8 PerCP', 'Viability APC', ''];
/** Spillover (rows: dye, columns: detector): 8% FITC into FL2, 5% PE into FL3. */
const SPILL: CompensationMatrix = {
  source: '$SPILLOVER',
  names: ['FL1-A', 'FL2-A', 'FL3-A'],
  matrix: [[1, 0.08, 0], [0, 1, 0.05], [0, 0, 1]],
};

/** One example sample. `compensate` false returns what the instrument recorded (spillover included). */
export function exampleSample(spec: ExampleSampleSpec, index: number, events = 20_000, seed = 7, compensate = true): FcsData {
  const rand = rng(seed + 7919 * index);
  const normal = () => Math.sqrt(-2 * Math.log(rand())) * Math.cos(2 * Math.PI * rand());
  const logn = (log10Mean: number, sd: number) => 10 ** (log10Mean + normal() * sd);
  const parameters: FcsParameter[] = NAMES.map((name, i) => ({
    index: i, name, label: LABELS[i]!, range: 262144, bits: 32, log: false, decades: 0, offset: 0, gain: 1,
  }));
  const cols = NAMES.map(() => new Float32Array(events));
  const [fscA, fscH, ssc, cd3, cd4, cd8, via, time] = cols as [Float32Array, Float32Array, Float32Array, Float32Array, Float32Array, Float32Array, Float32Array, Float32Array];
  // Unstained channels: autofluorescence plus symmetric electronic noise, so some values are negative.
  const neg = (auto: number) => auto + normal() * 45;
  for (let e = 0; e < events; e++) {
    const u = rand();
    let fsc: number, side: number, auto: number;
    let m3 = 0, m4 = 0, m8 = 0, dead = false;
    if (u < 0.06) {
      // debris: small, dim, dye-permeable
      fsc = Math.max(300, 9_000 + normal() * 5_000); side = Math.max(200, 6_000 + normal() * 4_000); auto = 20; dead = rand() < 0.6;
    } else {
      const kind = rand();
      if (kind < 0.6) {
        fsc = 65_000 + normal() * 7_000; side = 18_000 + normal() * 3_500; auto = 40;
        if (rand() < 0.72) {
          m3 = logn(3.7, 0.18);
          const t = rand();
          if (t < spec.cd4) m4 = logn(3.9, 0.17);
          else if (t < spec.cd4 + (1 - spec.cd4) * 0.88) m8 = logn(3.8, 0.2);
        }
      } else if (kind < 0.72) {
        fsc = 105_000 + normal() * 11_000; side = 55_000 + normal() * 8_000; auto = 90;
        m4 = logn(2.9, 0.18); // monocytes are CD4 dim
      } else {
        fsc = 122_000 + normal() * 13_000; side = 140_000 + normal() * 20_000; auto = 140;
      }
      dead = rand() < spec.dead;
      if (dead) { fsc *= 0.72; side *= 1.15; }
    }
    // FSC-H tracks FSC-A for single cells; a doublet doubles the area but barely raises the height.
    const doublet = u >= 0.06 && rand() < 0.04;
    const area = doublet ? fsc * 2 : fsc;
    fscA[e] = Math.max(1, area);
    fscH[e] = Math.max(1, (doublet ? fsc * 1.05 : fsc * 0.86) * (1 + normal() * 0.03));
    ssc[e] = Math.max(1, doublet ? side * 1.6 : side);
    const mul = doublet ? 2 : 1;
    if (spec.stained) {
      cd3[e] = neg(auto) + m3 * mul; cd4[e] = neg(auto) + m4 * mul; cd8[e] = neg(auto) + m8 * mul;
      via[e] = dead ? logn(3.9, 0.2) : neg(auto);
    } else {
      cd3[e] = neg(auto); cd4[e] = neg(auto); cd8[e] = neg(auto); via[e] = neg(auto);
    }
    time[e] = (e / events) * 600 + rand() * 0.01;
  }
  // What the detectors saw: observed = true x S.
  const observed = cols.slice();
  observed[4] = Float32Array.from(cd4, (v, e) => v + 0.08 * cd3[e]!);
  observed[5] = Float32Array.from(cd8, (v, e) => v + 0.05 * cd4[e]!);
  const columns = compensate ? applyCompensation(observed, parameters, SPILL) : observed;
  const slug = spec.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  return {
    version: 'FCS3.1', parameters, columns, eventCount: events, keywords: { $SMNO: spec.name },
    meta: { cytometer: 'Synthetic example', date: '', beginTime: '', endTime: '', fileName: `example-${slug}.fcs` },
    compensation: SPILL, compensationApplied: compensate,
    warnings: ['Synthetic data generated in your browser: not from a real instrument or sample.'],
  };
}

/** The four example samples (Unstained, Stim 0 h, 6 h, 24 h). */
export function exampleSamples(events = 20_000, seed = 7, compensate = true): FcsData[] {
  return EXAMPLE_SAMPLES.map((spec, i) => exampleSample(spec, i, events, seed, compensate));
}
