/*
 * Gate definitions as a portable JSON document. Parameters are written by $PnN name and coordinates in
 * data units (scale values, before the display transform), together with each axis's display scale, so
 * a gate set re-applies to other files and reproduces the same events. Import never throws on a bad gate:
 * it is skipped with a warning. Only an unreadable document (not JSON, wrong format or version) is an error.
 */
import { forward, inverse, DEFAULT_COFACTOR, DEFAULT_LOG_FLOOR, type ScaleKind, type ScaleSpec } from './scales';
import type { Gate, ParamRef } from './gates';

export const GATE_FORMAT = 'bio-bench-flow-gates';
export const GATE_FORMAT_VERSION = 1;

export interface GateScaleJson { kind: ScaleKind; cofactor: number; floor: number }
interface GateJsonBase { id: string; name: string; parent: string | null }
export type GateJson = GateJsonBase & (
  | { type: 'range'; param: string; scale: GateScaleJson; min: number; max: number }
  | { type: 'rect'; xParam: string; yParam: string; xScale: GateScaleJson; yScale: GateScaleJson; xMin: number; xMax: number; yMin: number; yMax: number }
  | { type: 'polygon'; xParam: string; yParam: string; xScale: GateScaleJson; yScale: GateScaleJson; points: [number, number][] }
  | { type: 'split'; param: string; scale: GateScaleJson; threshold: number; side: 'left' | 'right'; pair: string }
);
export interface GateDocument { format: typeof GATE_FORMAT; version: typeof GATE_FORMAT_VERSION; gates: GateJson[] }

/** The document itself cannot be used (not JSON, not a gate file, unsupported version). */
export class GateImportError extends Error {}

const scaleJson = (s: ScaleSpec): GateScaleJson => ({ kind: s.kind, cofactor: s.cofactor, floor: s.floor });

/** Gates to a versioned document. Numeric parameter references are resolved through `names` ($PnN by column). */
export function exportGates(gates: Gate[], names: readonly string[] = []): GateDocument {
  const nm = (r: ParamRef) => (typeof r === 'number' ? names[r] ?? `P${r + 1}` : r);
  const out = gates.map((g): GateJson => {
    const base = { id: g.id, name: g.name, parent: g.parent };
    if (g.type === 'range') return { ...base, type: 'range', param: nm(g.param), scale: scaleJson(g.scale), min: inverse(g.min, g.scale), max: inverse(g.max, g.scale) };
    if (g.type === 'split') return { ...base, type: 'split', param: nm(g.param), scale: scaleJson(g.scale), threshold: inverse(g.threshold, g.scale), side: g.side, pair: g.pair };
    const axes = { xParam: nm(g.xParam), yParam: nm(g.yParam), xScale: scaleJson(g.xScale), yScale: scaleJson(g.yScale) };
    if (g.type === 'rect') {
      return {
        ...base, type: 'rect', ...axes,
        xMin: inverse(g.xMin, g.xScale), xMax: inverse(g.xMax, g.xScale), yMin: inverse(g.yMin, g.yScale), yMax: inverse(g.yMax, g.yScale),
      };
    }
    return { ...base, type: 'polygon', ...axes, points: g.points.map(([x, y]) => [inverse(x, g.xScale), inverse(y, g.yScale)]) };
  });
  return { format: GATE_FORMAT, version: GATE_FORMAT_VERSION, gates: out };
}

export interface GateImportSample { name: string; parameters: readonly string[] }
export interface GateImportResult { gates: Gate[]; warnings: string[] }

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Throws a plain message describing what is wrong with one gate entry. */
function readScale(v: unknown, what: string): ScaleSpec {
  if (!isObj(v) || !['linear', 'log', 'asinh'].includes(v.kind as string)) throw new Error(`${what} has no valid scale kind (linear, log or asinh)`);
  const cofactor = v.cofactor === undefined ? DEFAULT_COFACTOR : v.cofactor;
  const floor = v.floor === undefined ? DEFAULT_LOG_FLOOR : v.floor;
  if (!finite(cofactor) || cofactor <= 0) throw new Error(`${what} has an invalid arcsinh cofactor`);
  if (!finite(floor) || floor <= 0) throw new Error(`${what} has an invalid log floor`);
  return { kind: v.kind as ScaleKind, cofactor, floor };
}
function readParam(v: unknown, what: string): string {
  if (typeof v !== 'string' || v.trim() === '') throw new Error(`${what} is not a parameter name`);
  return v;
}
function readNum(v: unknown, what: string): number {
  if (!finite(v)) throw new Error(`${what} is not a finite number`);
  return v;
}
/**
 * A gate coordinate in data units to display units. Unlike event values, a log coordinate below the floor is
 * not clipped (it was exported from a display position below the floor), and one at or below zero has no position.
 */
function toDisplay(v: number, s: ScaleSpec, what: string): number {
  const d = s.kind === 'log' ? (v > 0 ? Math.log10(v) : NaN) : forward(v, s);
  if (!Number.isFinite(d)) throw new Error(`${what} cannot be placed on a ${s.kind} scale`);
  return d;
}

function readGate(raw: Record<string, unknown>): Gate {
  const base = { id: raw.id as string, name: raw.name as string, parent: (raw.parent ?? null) as string | null };
  switch (raw.type) {
    case 'range': {
      const scale = readScale(raw.scale, 'scale');
      const min = readNum(raw.min, 'min'), max = readNum(raw.max, 'max');
      if (min > max) throw new Error('min is greater than max');
      return { ...base, type: 'range', param: readParam(raw.param, 'param'), scale, min: toDisplay(min, scale, 'min'), max: toDisplay(max, scale, 'max') };
    }
    case 'split': {
      const scale = readScale(raw.scale, 'scale');
      if (raw.side !== 'left' && raw.side !== 'right') throw new Error('side must be "left" or "right"');
      if (typeof raw.pair !== 'string' || raw.pair === '') throw new Error('pair is missing');
      const threshold = toDisplay(readNum(raw.threshold, 'threshold'), scale, 'threshold');
      return { ...base, type: 'split', param: readParam(raw.param, 'param'), scale, threshold, side: raw.side, pair: raw.pair };
    }
    case 'rect':
    case 'polygon': {
      const xScale = readScale(raw.xScale, 'xScale'), yScale = readScale(raw.yScale, 'yScale');
      const axes = { xParam: readParam(raw.xParam, 'xParam'), yParam: readParam(raw.yParam, 'yParam'), xScale, yScale };
      if (raw.type === 'rect') {
        const [xMin, xMax, yMin, yMax] = (['xMin', 'xMax', 'yMin', 'yMax'] as const).map(k => readNum(raw[k], k)) as [number, number, number, number];
        if (xMin > xMax || yMin > yMax) throw new Error('a minimum is greater than its maximum');
        return {
          ...base, type: 'rect', ...axes,
          xMin: toDisplay(xMin, xScale, 'xMin'), xMax: toDisplay(xMax, xScale, 'xMax'), yMin: toDisplay(yMin, yScale, 'yMin'), yMax: toDisplay(yMax, yScale, 'yMax'),
        };
      }
      if (!Array.isArray(raw.points) || raw.points.length < 3) throw new Error('a polygon needs at least 3 points');
      const points = raw.points.map((pt, i): [number, number] => {
        if (!Array.isArray(pt) || pt.length !== 2 || !finite(pt[0]) || !finite(pt[1])) throw new Error(`point ${i + 1} is not a pair of numbers`);
        return [toDisplay(pt[0], xScale, `point ${i + 1}`), toDisplay(pt[1], yScale, `point ${i + 1}`)];
      });
      return { ...base, type: 'polygon', ...axes, points };
    }
    default:
      throw new Error(`unknown gate type ${JSON.stringify(raw.type)}`);
  }
}

const paramsOf = (g: Gate): string[] => (g.type === 'range' || g.type === 'split' ? [g.param] : [g.xParam, g.yParam]).map(String);

/**
 * Read a gate document (JSON text or an already-parsed value) and fit it to the loaded samples.
 * Malformed gates, gates on a parameter no sample has, and children of skipped gates are skipped with a
 * warning; a parameter missing from only some samples is kept with a warning naming them.
 */
export function importGates(input: string | unknown, samples: readonly GateImportSample[]): GateImportResult {
  let doc: unknown = input;
  if (typeof input === 'string') {
    try { doc = JSON.parse(input); } catch { throw new GateImportError('This file is not valid JSON, so no gates were read.'); }
  }
  if (!isObj(doc) || doc.format !== GATE_FORMAT) throw new GateImportError(`This is not a Bio-Bench gate file (expected "format": "${GATE_FORMAT}").`);
  if (doc.version !== GATE_FORMAT_VERSION) throw new GateImportError(`Gate file version ${JSON.stringify(doc.version)} is not supported; this app reads version ${GATE_FORMAT_VERSION}.`);
  if (!Array.isArray(doc.gates)) throw new GateImportError('The gate file has no "gates" list.');

  const warnings: string[] = [];
  const known = new Set(samples.flatMap(s => s.parameters));
  const read: Gate[] = [];
  const ids = new Set<string>();
  doc.gates.forEach((raw, i) => {
    const label = isObj(raw) && typeof raw.name === 'string' && raw.name !== '' ? `"${raw.name}"` : `gate ${i + 1}`;
    try {
      if (!isObj(raw)) throw new Error('it is not an object');
      if (typeof raw.id !== 'string' || raw.id === '') throw new Error('it has no id');
      if (ids.has(raw.id)) throw new Error(`its id "${raw.id}" is used twice`);
      if (typeof raw.name !== 'string') throw new Error('it has no name');
      if (raw.parent !== undefined && raw.parent !== null && typeof raw.parent !== 'string') throw new Error('its parent is not a gate id');
      const g = readGate(raw);
      ids.add(g.id);
      read.push(g);
    } catch (e) {
      warnings.push(`Skipped ${label}: ${e instanceof Error ? e.message : String(e)}.`);
    }
  });

  // Parameters no loaded sample has.
  const absent: string[] = [];
  let kept = read.filter(g => {
    const miss = paramsOf(g).filter(p => !known.has(p));
    if (miss.length) absent.push(`"${g.name}" (${miss.join(', ')})`);
    return miss.length === 0;
  });
  if (absent.length) warnings.push(`Skipped ${absent.length} gate${absent.length === 1 ? '' : 's'} on parameters that no loaded sample has: ${absent.join('; ')}.`);

  // Parents that were skipped, never defined, or form a cycle: drop the child (and so its own children).
  for (let changed = true; changed;) {
    changed = false;
    const have = new Set(kept.map(g => g.id));
    const next = kept.filter(g => {
      if (g.parent === null || have.has(g.parent)) return true;
      warnings.push(`Skipped "${g.name}": its parent gate "${g.parent}" was not imported.`);
      changed = true;
      return false;
    });
    kept = next;
  }
  const byId = new Map(kept.map(g => [g.id, g]));
  const cyclic = new Set<string>();
  for (const g of kept) {
    const seen = new Set<string>();
    for (let cur: Gate | undefined = g; cur && cur.parent !== null; cur = byId.get(cur.parent)) {
      if (seen.has(cur.id)) { cyclic.add(g.id); break; }
      seen.add(cur.id);
    }
  }
  if (cyclic.size) {
    warnings.push(`Skipped ${[...cyclic].map(id => `"${byId.get(id)!.name}"`).join(', ')}: their parents form a loop.`);
    kept = kept.filter(g => !cyclic.has(g.id));
  }

  // Parameters only some samples have: the gate stays but cannot be evaluated there.
  const partial = new Map<string, string[]>();
  for (const p of new Set(kept.flatMap(paramsOf))) {
    const lacking = samples.filter(s => !s.parameters.includes(p)).map(s => s.name);
    if (lacking.length) partial.set(p, lacking);
  }
  for (const [p, lacking] of partial) warnings.push(`${p} is missing from ${lacking.join(', ')}; gates on it are not evaluated there.`);

  return { gates: kept, warnings };
}
