/* Per-lane study metadata: which condition and replicate a lane is, and whether it is left out of statistics. */
export interface LaneMeta { condition: string; replicate: number | null; excluded: boolean }
export type LaneRole = 'ladder' | 'standard' | 'sample' | 'excluded';

export function laneRole(laneId: string, meta: LaneMeta | undefined, ladderLaneId: string, massLaneId: string): LaneRole {
  if (laneId === ladderLaneId) return 'ladder';
  if (laneId === massLaneId) return 'standard';
  return meta?.excluded ? 'excluded' : 'sample';
}

export function effectiveMeta(laneId: string, meta: Record<string, LaneMeta>, label: string): LaneMeta {
  const m = meta[laneId];
  return { condition: m?.condition.trim() || label, replicate: m?.replicate ?? null, excluded: m?.excluded ?? false };
}

/** Lanes in order get condition 1 × replicates, then condition 2 × replicates, … Extra lanes are not touched. */
export function assignByPattern(laneIds: string[], conditions: string[], replicates: number): Record<string, LaneMeta> {
  const out: Record<string, LaneMeta> = {};
  const r = Math.max(1, Math.floor(replicates));
  conditions.forEach((c, ci) => {
    for (let k = 0; k < r; k++) {
      const id = laneIds[ci * r + k];
      if (id) out[id] = { condition: c, replicate: k + 1, excluded: false };
    }
  });
  return out;
}
