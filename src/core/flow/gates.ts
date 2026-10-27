/*
 * Gates and population statistics. A gate is tested in display space (it stores the scales it was drawn
 * on), so changing the plot scale later never moves which events a gate contains. Gates name their
 * parameters by $PnN, so one gate tree applies to many files whose columns are in different orders.
 */
import { forward, type ScaleSpec } from './scales';

/** A parameter: its $PnN name (matched across samples) or a zero-based column index. */
export type ParamRef = string | number;

interface GateBase { id: string; name: string; /** Parent gate id, or null for a gate on all events. */ parent: string | null }
export interface RangeGate extends GateBase { type: 'range'; param: ParamRef; scale: ScaleSpec; min: number; max: number }
export interface RectGate extends GateBase {
  type: 'rect'; xParam: ParamRef; yParam: ParamRef; xScale: ScaleSpec; yScale: ScaleSpec;
  xMin: number; xMax: number; yMin: number; yMax: number;
}
export interface PolygonGate extends GateBase {
  type: 'polygon'; xParam: ParamRef; yParam: ParamRef; xScale: ScaleSpec; yScale: ScaleSpec; points: [number, number][];
}
/**
 * One half of a split (threshold) gate: "left" holds x < threshold, "right" holds x >= threshold.
 * The two halves are siblings that share `pair` and always carry the same threshold.
 */
export interface SplitGate extends GateBase {
  type: 'split'; param: ParamRef; scale: ScaleSpec; threshold: number; side: 'left' | 'right'; pair: string;
}
export type Gate = RangeGate | RectGate | PolygonGate | SplitGate;

/** The parameters a gate tests (x first). */
export const gateParams = (g: Gate): ParamRef[] => (g.type === 'range' || g.type === 'split' ? [g.param] : [g.xParam, g.yParam]);

/** Short marker name for split-gate halves: the first word of the $PnS label, else the $PnN name. */
export function splitBaseName(param: { name: string; label?: string }): string {
  const word = (param.label ?? '').trim().split(/\s+/)[0];
  return word || param.name;
}

/** The two halves of a split gate at `threshold` (display units of `scale`), named "<base>−" and "<base>+". */
export function makeSplitGates(
  ids: [string, string], base: string, parent: string | null, param: ParamRef, scale: ScaleSpec, threshold: number,
): [SplitGate, SplitGate] {
  const pair = ids[0];
  return [
    { id: ids[0], name: `${base}−`, parent, type: 'split', param, scale, threshold, side: 'left', pair },
    { id: ids[1], name: `${base}+`, parent, type: 'split', param, scale, threshold, side: 'right', pair },
  ];
}

/** Move a split gate's threshold: every half sharing `pair` moves together. */
export function setSplitThreshold(gates: Gate[], pair: string, threshold: number): Gate[] {
  return gates.map(g => (g.type === 'split' && g.pair === pair ? { ...g, threshold } : g));
}

/** A gate refers to a parameter the sample does not have. */
export class GateParamError extends Error {}

/** Ray-casting point-in-polygon (even-odd rule). Points exactly on an edge may fall either way. */
export function pointInPolygon(x: number, y: number, poly: readonly [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]!, [xj, yj] = poly[j]!;
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function column(columns: ArrayLike<number>[], names: readonly string[] | undefined, ref: ParamRef, gate: Gate): ArrayLike<number> {
  const i = typeof ref === 'number' ? ref : names ? names.indexOf(ref) : -1;
  const c = i >= 0 ? columns[i] : undefined;
  if (!c) throw new GateParamError(`Gate "${gate.name}" uses parameter ${typeof ref === 'number' ? ref + 1 : `"${ref}"`}, which this sample does not have.`);
  return c;
}

/** Does the gate itself (ignoring its parent) contain event `e`? */
function gateTest(gate: Gate, columns: ArrayLike<number>[], names?: readonly string[]): (e: number) => boolean {
  if (gate.type === 'range') {
    const c = column(columns, names, gate.param, gate);
    const { min, max, scale } = gate;
    return e => { const v = forward(c[e]!, scale); return v >= min && v <= max; };
  }
  if (gate.type === 'split') {
    const c = column(columns, names, gate.param, gate);
    const { threshold, scale } = gate;
    // NaN fails both comparisons, so an unreadable value falls in neither half.
    return gate.side === 'left' ? e => forward(c[e]!, scale) < threshold : e => forward(c[e]!, scale) >= threshold;
  }
  const cx = column(columns, names, gate.xParam, gate), cy = column(columns, names, gate.yParam, gate);
  if (gate.type === 'rect') {
    const { xMin, xMax, yMin, yMax, xScale, yScale } = gate;
    return e => {
      const x = forward(cx[e]!, xScale), y = forward(cy[e]!, yScale);
      return x >= xMin && x <= xMax && y >= yMin && y <= yMax;
    };
  }
  const { points, xScale, yScale } = gate;
  return e => pointInPolygon(forward(cx[e]!, xScale), forward(cy[e]!, yScale), points);
}

/**
 * Membership mask (1 = inside) for every gate, honouring the parent hierarchy. Cycles, unknown parents and
 * parameters missing from the sample are errors. `names` (the sample's $PnN names) resolves name references.
 */
export function evaluateGates(
  columns: ArrayLike<number>[], gates: Gate[], eventCount: number, names?: readonly string[],
): Record<string, Uint8Array> {
  const byId = new Map(gates.map(g => [g.id, g]));
  const masks: Record<string, Uint8Array> = {};
  const visiting = new Set<string>();
  const run = (g: Gate): Uint8Array => {
    const done = masks[g.id];
    if (done) return done;
    if (visiting.has(g.id)) throw new Error(`Gate "${g.name}" is its own ancestor.`);
    visiting.add(g.id);
    let parentMask: Uint8Array | null = null;
    if (g.parent !== null) {
      const p = byId.get(g.parent);
      if (!p) throw new Error(`Gate "${g.name}" has a parent that does not exist.`);
      parentMask = run(p);
    }
    const test = gateTest(g, columns, names);
    const m = new Uint8Array(eventCount);
    for (let e = 0; e < eventCount; e++) if ((parentMask === null || parentMask[e] === 1) && test(e)) m[e] = 1;
    visiting.delete(g.id);
    masks[g.id] = m;
    return m;
  };
  for (const g of gates) run(g);
  return masks;
}

export function maskCount(mask: Uint8Array): number {
  let n = 0;
  for (let i = 0; i < mask.length; i++) n += mask[i]!;
  return n;
}

/** Linear-interpolated percentile (p in 0..100) of an ascending-sorted array. */
export function percentileSorted(sorted: ArrayLike<number>, p: number): number {
  const n = sorted.length;
  if (n === 0) return NaN;
  const h = ((n - 1) * p) / 100;
  const lo = Math.floor(h), hi = Math.ceil(h);
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (h - lo);
}

export interface PopulationStats {
  count: number;
  /** Percent of the parent population (all events for a root gate). */
  pctParent: number;
  pctTotal: number;
  mean: number;
  median: number;
  geoMean: number;
  /** Standard CV: sample SD / mean x 100. */
  cv: number;
  /** Robust CV: 0.5 x (P84.13 - P15.87) / median x 100. */
  robustCv: number;
}

/** Statistics of `values` (a parameter column) over the events where `mask` is 1 (all events when null). */
export function populationStats(
  values: ArrayLike<number>, mask: Uint8Array | null, parentCount: number, totalCount: number,
): PopulationStats {
  const picked: number[] = [];
  let count = 0;
  for (let i = 0; i < values.length; i++) {
    if (mask !== null && mask[i] !== 1) continue;
    count++;
    const v = values[i]!;
    if (Number.isFinite(v)) picked.push(v);
  }
  const pct = (a: number, b: number) => (b > 0 ? (a / b) * 100 : NaN);
  const n = picked.length;
  if (n === 0) return { count, pctParent: pct(count, parentCount), pctTotal: pct(count, totalCount), mean: NaN, median: NaN, geoMean: NaN, cv: NaN, robustCv: NaN };
  let sum = 0;
  for (const v of picked) sum += v;
  const mean = sum / n;
  let ss = 0, lnSum = 0, pos = 0;
  for (const v of picked) { ss += (v - mean) ** 2; if (v > 0) { lnSum += Math.log(v); pos++; } }
  const sd = n > 1 ? Math.sqrt(ss / (n - 1)) : 0;
  const sorted = Float64Array.from(picked).sort();
  const median = percentileSorted(sorted, 50);
  const spread = 0.5 * (percentileSorted(sorted, 84.13) - percentileSorted(sorted, 15.87));
  return {
    count,
    pctParent: pct(count, parentCount),
    pctTotal: pct(count, totalCount),
    mean,
    median,
    geoMean: pos > 0 ? Math.exp(lnSum / pos) : NaN,
    cv: mean !== 0 ? (sd / mean) * 100 : NaN,
    robustCv: median !== 0 ? (spread / median) * 100 : NaN,
  };
}

export interface GateStatsRow { id: string | null; name: string; parent: string | null; stats: PopulationStats }

/**
 * Stats for the whole sample plus every gate, for one parameter. Gates with no mask (not evaluated on
 * this sample, see evaluateSampleGates) are left out.
 */
export function allGateStats(
  columns: ArrayLike<number>[], gates: Gate[], eventCount: number, param: number,
  masks: Record<string, Uint8Array | null> = evaluateGates(columns, gates, eventCount),
): GateStatsRow[] {
  const col = columns[param]!;
  const rows: GateStatsRow[] = [{ id: null, name: 'All events', parent: null, stats: populationStats(col, null, eventCount, eventCount) }];
  for (const g of gates) {
    const mask = masks[g.id];
    if (!mask) continue;
    const parentMask = g.parent === null ? null : masks[g.parent];
    const parentCount = g.parent === null ? eventCount : parentMask ? maskCount(parentMask) : NaN;
    rows.push({ id: g.id, name: g.name, parent: g.parent, stats: populationStats(col, mask, parentCount, eventCount) });
  }
  return rows;
}

export interface SampleGateResult {
  /** Mask per gate id, or null where the gate (or an ancestor) uses a parameter the sample lacks. */
  masks: Record<string, Uint8Array | null>;
  /** Missing $PnN names per gate id that could not be evaluated (ancestors' included). */
  missing: Record<string, string[]>;
}

/** The parts of a parsed file that gating needs. */
export interface GateSample { columns: ArrayLike<number>[]; parameters: readonly { name: string }[]; eventCount: number }

/**
 * Evaluate a name-referenced gate tree on one sample. A gate whose parameter (or whose ancestor's
 * parameter) the sample lacks gets a null mask instead of an error, so one tree serves every file.
 */
export function evaluateSampleGates(sample: GateSample, gates: Gate[]): SampleGateResult {
  const names = sample.parameters.map(p => p.name);
  const byId = new Map(gates.map(g => [g.id, g]));
  const missing: Record<string, string[]> = {};
  const lacking = (g: Gate, depth = 0): string[] => {
    if (missing[g.id]) return missing[g.id]!;
    const own = gateParams(g).filter(r => (typeof r === 'number' ? r >= sample.columns.length : !names.includes(r))).map(String);
    const parent = g.parent !== null && depth < gates.length ? byId.get(g.parent) : undefined;
    const up = parent ? lacking(parent, depth + 1) : [];
    return [...new Set([...up, ...own])];
  };
  for (const g of gates) { const m = lacking(g); if (m.length) missing[g.id] = m; }
  const ok = gates.filter(g => !missing[g.id]);
  const evaluated = evaluateGates(sample.columns, ok, sample.eventCount, names);
  const masks: Record<string, Uint8Array | null> = {};
  for (const g of gates) masks[g.id] = evaluated[g.id] ?? null;
  return { masks, missing };
}

/**
 * Statistics of one population (a gate id, or null for all events) on one sample, with the statistic
 * taken over `statParam` (NaN statistics when the sample lacks it). Null when the gate cannot be evaluated.
 */
export function sampleGateStats(
  sample: GateSample, gates: Gate[], gateId: string | null, statParam: string,
  masks: Record<string, Uint8Array | null> = evaluateSampleGates(sample, gates).masks,
): PopulationStats | null {
  const si = sample.parameters.findIndex(p => p.name === statParam);
  const col = si >= 0 ? sample.columns[si]! : new Float32Array(sample.eventCount).fill(NaN);
  const n = sample.eventCount;
  if (gateId === null) return populationStats(col, null, n, n);
  const g = gates.find(x => x.id === gateId);
  const mask = masks[gateId];
  if (!g || !mask) return null;
  const parentMask = g.parent === null ? null : masks[g.parent];
  return populationStats(col, mask, g.parent === null ? n : parentMask ? maskCount(parentMask) : NaN, n);
}
