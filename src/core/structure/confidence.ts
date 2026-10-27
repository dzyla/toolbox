/** B-factor column statistics, and whether that column holds pLDDT (a predicted model). */
import type { StructureModel } from './model';

export interface BFactorStats {
  min: number; max: number;
  /** 2nd and 98th percentiles: the colour scale's ends, so a few outliers do not flatten it. */
  low: number; high: number;
}

export interface PlddtInfo {
  /** Multiply the B-factor column by this to get pLDDT on 0–100 (100 when the file stores 0–1). */
  scale: 1 | 100;
  /** Why the file was taken for a predicted model, for the UI. */
  reason: string;
}

const WATER = new Set(['HOH', 'DOD', 'WAT']);
const PREDICTED_METHOD = /PREDICT|THEORETICAL|COMPUTATIONAL|IN SILICO/i;
const PREDICTOR_TITLE = /alphafold|colabfold|boltz|chai-?1|protenix|esmfold|rosettafold|openfold|helixfold/i;

/** Over the non-water atoms of one model; null when there are none or every value is the same. */
export function bFactorStats(m: StructureModel, modelIndex: number): BFactorStats | null {
  const t = m.models[modelIndex];
  if (!t) return null;
  const values: number[] = [];
  for (let i = 0; i < t.count; i++) if (!WATER.has(t.compId[i]!)) values.push(t.bFactor[i]!);
  if (values.length === 0) return null;
  const sorted = Float32Array.from(values).sort();
  const min = sorted[0]!, max = sorted[sorted.length - 1]!;
  if (min === max) return null;
  const at = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(q * (sorted.length - 1)))]!;
  const low = at(0.02), high = at(0.98);
  return low < high ? { min, max, low, high } : { min, max, low: min, high: max };
}

const hasWater = (m: StructureModel) => m.models.some(t => t.compId.some(c => WATER.has(c)));

/**
 * Predicted models (AlphaFold, Boltz, Chai, ESMFold, …) store per-atom or per-residue pLDDT in the
 * B-factor column. A file counts as predicted when it carries ModelCIF categories, names a
 * computational method, or names a predictor in its title; or when it records no method at all,
 * has no water and every B-factor lies in 0–100. Values all within 0–1 are read as pLDDT / 100.
 */
export function detectPlddt(m: StructureModel, stats: BFactorStats | null): PlddtInfo | null {
  if (!stats || stats.min < 0 || stats.max > 100) return null;
  const h = m.header;
  let reason = '';
  if (h.modelCif) reason = 'ModelCIF file';
  else if (h.method && PREDICTED_METHOD.test(h.method)) reason = `method: ${h.method}`;
  else if (h.title && PREDICTOR_TITLE.test(h.title)) reason = 'predictor named in the title';
  else if (!h.method && !hasWater(m)) reason = 'no experimental method or water; B-factors within 0–100';
  if (!reason) return null;
  return { scale: stats.max <= 1 ? 100 : 1, reason };
}
