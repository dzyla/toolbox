/*
 * Many files at once: parameters are matched across samples by $PnN name (never by column position),
 * and plot ranges are shared so every sample is drawn on the same axes.
 */
import { autoRange, type Range } from './bin';
import type { ScaleSpec } from './scales';
import type { FcsData } from './fcs';

/** Display name of a sample: the file name it was opened from, else $SMNO, else $FIL, else `fallback`. */
export function sampleName(data: Pick<FcsData, 'keywords' | 'meta'>, fileName = '', fallback = 'Sample'): string {
  const pick = [fileName, data.keywords['$SMNO'] ?? '', data.meta.fileName].map(s => s.trim()).find(s => s !== '');
  return pick ?? fallback;
}

/** Make names unique by appending " (2)", " (3)", ... to repeats, keeping order. */
export function uniqueNames(names: string[]): string[] {
  const seen = new Map<string, number>();
  return names.map(n => {
    const k = (seen.get(n) ?? 0) + 1;
    seen.set(n, k);
    return k === 1 ? n : `${n} (${k})`;
  });
}

type ParamHolder = { parameters: readonly { name: string }[] };

/** $PnN names present in every sample, in the first sample's order. */
export function commonParameters(samples: readonly ParamHolder[]): string[] {
  if (samples.length === 0) return [];
  const sets = samples.slice(1).map(s => new Set(s.parameters.map(p => p.name)));
  const out: string[] = [];
  for (const p of samples[0]!.parameters) if (!out.includes(p.name) && sets.every(set => set.has(p.name))) out.push(p.name);
  return out;
}

/** Indices (into `samples`) of the samples that have no parameter called `name`. */
export function samplesLacking(samples: readonly ParamHolder[], name: string): number[] {
  const out: number[] = [];
  samples.forEach((s, i) => { if (!s.parameters.some(p => p.name === name)) out.push(i); });
  return out;
}

/** Zero-based column of parameter `name`, or -1. */
export const paramIndex = (s: ParamHolder, name: string): number => s.parameters.findIndex(p => p.name === name);

/** One display-space range covering every column (the union of their auto ranges), so samples are comparable. */
export function sharedRange(cols: readonly ArrayLike<number>[], scale: ScaleSpec): Range {
  if (cols.length === 0) return { min: 0, max: 1 };
  let min = Infinity, max = -Infinity;
  for (const c of cols) {
    if (c.length === 0) continue;
    const r = autoRange(c, scale);
    if (r.min < min) min = r.min;
    if (r.max > max) max = r.max;
  }
  return min < max ? { min, max } : { min: 0, max: 1 };
}
