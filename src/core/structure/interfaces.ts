/** Polymer-polymer interface residues: heavy atoms closer than a cutoff, found with a uniform grid. */
import type { ResidueRef, StructureModel } from './model';

export interface InterfaceSide { labelAsymId: string; authAsymId: string; residues: ResidueRef[] }
export interface InterfacePair { a: InterfaceSide; b: InterfaceSide }

export function computeInterfaces(m: StructureModel, modelIndex: number, cutoff = 4.5): InterfacePair[] {
  const t = m.models[modelIndex];
  if (!t || m.chains.length < 2) return [];
  const chainIndex = new Map<string, number>();
  const authOf: string[] = [];
  m.chains.forEach((c, i) => {
    if (!chainIndex.has(c.labelAsymId)) {
      chainIndex.set(c.labelAsymId, i);
      authOf[i] = c.authAsymId;
    }
  });

  // Candidate atoms: heavy polymer atoms.
  const atoms: number[] = [];
  const chainOf = new Int32Array(t.count).fill(-1);
  for (let i = 0; i < t.count; i++) {
    if (t.isHydrogen[i] || t.labelSeqId[i]! <= 0) continue;
    const ci = chainIndex.get(t.labelAsymId[i]!);
    if (ci === undefined) continue;
    chainOf[i] = ci;
    atoms.push(i);
  }
  if (atoms.length === 0) return [];

  const xyz = t.xyz;
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  for (const i of atoms) {
    minX = Math.min(minX, xyz[3 * i]!);
    minY = Math.min(minY, xyz[3 * i + 1]!);
    minZ = Math.min(minZ, xyz[3 * i + 2]!);
  }
  const cell = (v: number, min: number) => Math.floor((v - min) / cutoff);
  const grid = new Map<string, number[]>();
  const key = (cx: number, cy: number, cz: number) => `${cx},${cy},${cz}`;
  for (const i of atoms) {
    const k = key(cell(xyz[3 * i]!, minX), cell(xyz[3 * i + 1]!, minY), cell(xyz[3 * i + 2]!, minZ));
    const list = grid.get(k);
    if (list) list.push(i); else grid.set(k, [i]);
  }

  // Per chain pair (lo < hi chain index): residues touched, keyed by atom index of first atom seen.
  const pairs = new Map<string, { lo: number; hi: number; a: Map<number, number>; b: Map<number, number> }>();
  const c2 = cutoff * cutoff;
  const resKey = (i: number) => t.labelSeqId[i]!;
  for (const i of atoms) {
    const x = xyz[3 * i]!, y = xyz[3 * i + 1]!, z = xyz[3 * i + 2]!;
    const cx = cell(x, minX), cy = cell(y, minY), cz = cell(z, minZ);
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
      const list = grid.get(key(cx + dx, cy + dy, cz + dz));
      if (!list) continue;
      for (const j of list) {
        if (j <= i || chainOf[j] === chainOf[i]) continue;
        const ddx = xyz[3 * j]! - x, ddy = xyz[3 * j + 1]! - y, ddz = xyz[3 * j + 2]! - z;
        if (ddx * ddx + ddy * ddy + ddz * ddz > c2) continue;
        const ci = chainOf[i]!, cj = chainOf[j]!;
        const [lo, hi, ai, aj] = ci < cj ? [ci, cj, i, j] : [cj, ci, j, i];
        const pk = `${lo}:${hi}`;
        let p = pairs.get(pk);
        if (!p) pairs.set(pk, (p = { lo, hi, a: new Map(), b: new Map() }));
        if (!p.a.has(resKey(ai))) p.a.set(resKey(ai), ai);
        if (!p.b.has(resKey(aj))) p.b.set(resKey(aj), aj);
      }
    }
  }

  const side = (ci: number, res: Map<number, number>): InterfaceSide => ({
    labelAsymId: m.chains[ci]!.labelAsymId,
    authAsymId: authOf[ci]!,
    residues: [...res.entries()].sort((p, q) => p[0] - q[0]).map(([, ai]) => ({
      authAsymId: t.authAsymId[ai]!, authSeqId: t.authSeqId[ai]!, insCode: t.insCode[ai]!,
    })),
  });
  return [...pairs.values()]
    .sort((p, q) => p.lo - q.lo || p.hi - q.hi)
    .map((p) => ({ a: side(p.lo, p.a), b: side(p.hi, p.b) }));
}
