/*
 * Gates and population statistics. A gate is tested in display space (it stores the scales it was drawn
 * on), so changing the plot scale later never moves which events a gate contains.
 */
import { forward, type ScaleSpec } from './scales';

interface GateBase { id: string; name: string; /** Parent gate id, or null for a gate on all events. */ parent: string | null }
export interface RangeGate extends GateBase { type: 'range'; param: number; scale: ScaleSpec; min: number; max: number }
export interface RectGate extends GateBase {
  type: 'rect'; xParam: number; yParam: number; xScale: ScaleSpec; yScale: ScaleSpec;
  xMin: number; xMax: number; yMin: number; yMax: number;
}
export interface PolygonGate extends GateBase {
  type: 'polygon'; xParam: number; yParam: number; xScale: ScaleSpec; yScale: ScaleSpec; points: [number, number][];
}
export type Gate = RangeGate | RectGate | PolygonGate;

/** Ray-casting point-in-polygon (even-odd rule). Points exactly on an edge may fall either way. */
export function pointInPolygon(x: number, y: number, poly: readonly [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]!, [xj, yj] = poly[j]!;
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Does the gate itself (ignoring its parent) contain event `e`? */
function gateTest(gate: Gate, columns: ArrayLike<number>[]): (e: number) => boolean {
  if (gate.type === 'range') {
    const c = columns[gate.param]!;
    const { min, max, scale } = gate;
    return e => { const v = forward(c[e]!, scale); return v >= min && v <= max; };
  }
  const cx = columns[gate.xParam]!, cy = columns[gate.yParam]!;
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

/** Membership mask (1 = inside) for every gate, honouring the parent hierarchy. Cycles and unknown parents are errors. */
export function evaluateGates(columns: ArrayLike<number>[], gates: Gate[], eventCount: number): Record<string, Uint8Array> {
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
    const test = gateTest(g, columns);
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

/** Stats for the whole sample plus every gate, for one parameter. */
export function allGateStats(
  columns: ArrayLike<number>[], gates: Gate[], eventCount: number, param: number,
  masks: Record<string, Uint8Array> = evaluateGates(columns, gates, eventCount),
): GateStatsRow[] {
  const col = columns[param]!;
  const rows: GateStatsRow[] = [{ id: null, name: 'All events', parent: null, stats: populationStats(col, null, eventCount, eventCount) }];
  const counts: Record<string, number> = {};
  for (const g of gates) counts[g.id] = maskCount(masks[g.id]!);
  for (const g of gates) {
    const parentCount = g.parent === null ? eventCount : counts[g.parent]!;
    rows.push({ id: g.id, name: g.name, parent: g.parent, stats: populationStats(col, masks[g.id]!, parentCount, eventCount) });
  }
  return rows;
}
