/** Whole-structure metrics over one model. */
import type { StructureModel } from './model';

export interface StructureMetrics {
  atomCount: number; heavyAtomCount: number; residueCount: number; radiusOfGyration: number;
  center: [number, number, number];
  bounds: { min: [number, number, number]; max: [number, number, number] };
}

const WATER = new Set(['HOH', 'DOD', 'WAT']);

export function computeMetrics(m: StructureModel, modelIndex: number): StructureMetrics {
  const t = m.models[modelIndex];
  let residueCount = 0;
  for (const c of m.chains) for (const r of c.residues) if (r.modelled) residueCount++;
  const min: [number, number, number] = [0, 0, 0];
  const max: [number, number, number] = [0, 0, 0];
  if (!t) {
    return { atomCount: 0, heavyAtomCount: 0, residueCount, radiusOfGyration: 0, center: [0, 0, 0], bounds: { min, max } };
  }
  let heavy = 0, n = 0, sx = 0, sy = 0, sz = 0;
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  const used: number[] = [];
  for (let i = 0; i < t.count; i++) {
    if (t.isHydrogen[i]) continue;
    heavy++;
    if (WATER.has(t.compId[i]!)) continue;
    const x = t.xyz[3 * i]!, y = t.xyz[3 * i + 1]!, z = t.xyz[3 * i + 2]!;
    n++; sx += x; sy += y; sz += z;
    if (x < lo[0]!) lo[0] = x; if (x > hi[0]!) hi[0] = x;
    if (y < lo[1]!) lo[1] = y; if (y > hi[1]!) hi[1] = y;
    if (z < lo[2]!) lo[2] = z; if (z > hi[2]!) hi[2] = z;
    used.push(i);
  }
  if (n === 0) {
    return { atomCount: t.count, heavyAtomCount: heavy, residueCount, radiusOfGyration: 0, center: [0, 0, 0], bounds: { min, max } };
  }
  const cx = sx / n, cy = sy / n, cz = sz / n;
  let sq = 0;
  for (const i of used) {
    const dx = t.xyz[3 * i]! - cx, dy = t.xyz[3 * i + 1]! - cy, dz = t.xyz[3 * i + 2]! - cz;
    sq += dx * dx + dy * dy + dz * dz;
  }
  return {
    atomCount: t.count, heavyAtomCount: heavy, residueCount, radiusOfGyration: Math.sqrt(sq / n),
    center: [cx, cy, cz],
    bounds: { min: [lo[0]!, lo[1]!, lo[2]!], max: [hi[0]!, hi[1]!, hi[2]!] },
  };
}
