/*
 * Display scales. Arcsinh (with a cofactor) is used for the bi-exponential axis instead of logicle:
 * it is the standard CyTOF / spectral-cytometry transform and has a single, explicit parameter.
 */

export type ScaleKind = 'linear' | 'log' | 'asinh';

export interface ScaleSpec {
  kind: ScaleKind;
  /** arcsinh cofactor: display = asinh(x / cofactor). 150 is a common fluorescence value (5 for CyTOF). */
  cofactor: number;
  /** log floor: values below it are shown at log10(floor). */
  floor: number;
}

export const DEFAULT_COFACTOR = 150;
export const DEFAULT_LOG_FLOOR = 1;

export const defaultScale = (kind: ScaleKind = 'linear'): ScaleSpec => ({ kind, cofactor: DEFAULT_COFACTOR, floor: DEFAULT_LOG_FLOOR });

export function sameScale(a: ScaleSpec, b: ScaleSpec): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'asinh') return a.cofactor === b.cofactor;
  if (a.kind === 'log') return a.floor === b.floor;
  return true;
}

export function forward(v: number, s: ScaleSpec): number {
  if (s.kind === 'log') return Math.log10(v > s.floor ? v : s.floor);
  if (s.kind === 'asinh') return Math.asinh(v / (s.cofactor > 0 ? s.cofactor : DEFAULT_COFACTOR));
  return v;
}

export function inverse(d: number, s: ScaleSpec): number {
  if (s.kind === 'log') return 10 ** d;
  if (s.kind === 'asinh') return Math.sinh(d) * (s.cofactor > 0 ? s.cofactor : DEFAULT_COFACTOR);
  return d;
}

/** Display-scale values of a column. */
export function transformColumn(col: ArrayLike<number>, s: ScaleSpec): Float32Array {
  const out = new Float32Array(col.length);
  for (let i = 0; i < col.length; i++) out[i] = forward(col[i]!, s);
  return out;
}

export interface Tick { value: number; label: string }

function formatTick(v: number): string {
  const a = Math.abs(v);
  if (a >= 1e6) return `${+(v / 1e6).toPrecision(3)}M`;
  if (a >= 1e3) return `${+(v / 1e3).toPrecision(3)}k`;
  return `${+v.toPrecision(3)}`;
}

/** Tick positions (display values) and labels (data values) for an axis spanning [lo, hi] in display space. */
export function axisTicks(s: ScaleSpec, lo: number, hi: number, target = 6): Tick[] {
  if (!(hi > lo)) return [];
  if (s.kind === 'linear') {
    const raw = (hi - lo) / target;
    const mag = 10 ** Math.floor(Math.log10(raw));
    const step = [1, 2, 5, 10].map(m => m * mag).find(st => st >= raw) ?? raw;
    const out: Tick[] = [];
    for (let v = Math.ceil(lo / step) * step; v <= hi + step * 1e-9; v += step) out.push({ value: v, label: formatTick(Math.abs(v) < step * 1e-9 ? 0 : v) });
    return out;
  }
  const out: Tick[] = [];
  if (s.kind === 'log') {
    const stride = Math.max(1, Math.ceil((hi - lo) / target));
    for (let e = Math.ceil(lo); e <= hi; e += stride) out.push({ value: e, label: formatTick(10 ** e) });
    return out;
  }
  // arcsinh: 0 and signed powers of ten that fall inside the axis
  const dataLo = inverse(lo, s), dataHi = inverse(hi, s);
  const cands: number[] = [0];
  for (let e = 0; e <= 9; e++) { cands.push(10 ** e, -(10 ** e)); }
  const inside = cands.filter(v => v >= dataLo && v <= dataHi).sort((a, b) => a - b);
  const stride = Math.max(1, Math.ceil(inside.length / (target + 2)));
  inside.forEach((v, i) => { if (v === 0 || i % stride === 0) out.push({ value: forward(v, s), label: formatTick(v) }); });
  return out;
}
