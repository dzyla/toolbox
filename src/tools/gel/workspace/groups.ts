import { useMemo } from 'preact/hooks';
import { normalizeLaneValue, summarizeGroups, type GroupSummary, type NormMode } from '@/core/gel/groups';
import { isSaturated } from '@/core/gel/quant';
import { computeTargetBandClusters, findTargetBandInLane, type LaneAnalysisItem, type TargetBandCluster } from '../analysis';
import { effectiveMeta, laneRole, type LaneMeta, type LaneRole } from '../lane-meta';
import { dataQualityIssues, type QualityIssue } from '../quality';
import type { BandRef } from '../workspace-model';
import type { GelCore, GelAnalysis, GelLadders } from '../workspace';

export interface LaneGroupRow { laneId: string; laneIdx: number; label: string; role: LaneRole; condition: string; replicate: number | null;
  targetNet: number | null; controlNet: number | null; value: number | null; reason: string | null; flags: string[] }

/** Nearest cluster to a stored band reference, using the same tolerances as findTargetBandInLane; null when none is close enough. */
export function matchCluster(ref: BandRef | null, clusters: TargetBandCluster[], marginPct: number): TargetBandCluster | null {
  if (!ref) return null;
  let best: TargetBandCluster | null = null, bestDiff = Infinity;
  for (const c of clusters) {
    let diff: number;
    if (ref.size !== null && c.avgSize !== null && ref.size > 0) {
      diff = Math.abs(c.avgSize - ref.size) / ref.size;
      if (diff > marginPct / 100) continue;
    } else {
      diff = Math.abs(c.avgRf - ref.rf);
      if (diff > Math.max(0.03, (marginPct / 100) * 0.45)) continue;
    }
    if (diff < bestDiff) { bestDiff = diff; best = c; }
  }
  return best;
}

export function resolveLaneValues(analysis: LaneAnalysisItem[], o: {
  ladderLaneId: string; massLaneId: string; laneMeta: Record<string, LaneMeta>; labels: Record<string, string>;
  target: BandRef | null; control: BandRef | null; mode: NormMode; marginPct: number;
}): LaneGroupRow[] {
  const rows: LaneGroupRow[] = [];
  for (const item of analysis) {
    const id = item.lane.id;
    const label = o.labels[id] || `Lane ${item.laneIdx + 1}`;
    const role = laneRole(id, o.laneMeta[id], o.ladderLaneId, o.massLaneId);
    if (role === 'ladder' || role === 'standard') continue;
    const meta = effectiveMeta(id, o.laneMeta, label);
    const t = o.target ? findTargetBandInLane(item, o.target.size, o.target.rf, o.marginPct) : null;
    let c = o.mode === 'control-band' && o.control ? findTargetBandInLane(item, o.control.size, o.control.rf, o.marginPct) : null;
    // Never divide a band by itself: a control that resolves to the target band counts as missing.
    const controlIsTarget = !!(t && c && c.bandId === t.bandId);
    if (controlIsTarget) c = null;
    const flags: string[] = [];
    if ((t && isSaturated(t.saturation)) || (c && isSaturated(c.saturation))) flags.push('saturated');
    if (t?.baselineWarning || c?.baselineWarning) flags.push('baseline');
    if (t?.massFlags?.extrapolated) flags.push('extrapolated');
    if (t?.massFlags?.belowLoq) flags.push('below LOQ');
    let nv = o.target ? normalizeLaneValue(o.mode, t ? t.net : null, c ? c.net : null, item.totalLaneSignal) : { value: null, reason: 'no target selected' };
    if (controlIsTarget) nv = { value: null, reason: 'no control band in this lane (control matches the target band)' };
    rows.push({ laneId: id, laneIdx: item.laneIdx, label, role, condition: meta.condition, replicate: meta.replicate,
      targetNet: t?.net ?? null, controlNet: c?.net ?? null,
      value: role === 'excluded' ? null : nv.value, reason: role === 'excluded' ? 'excluded' : nv.reason, flags });
  }
  return rows;
}

export function useGelGroups(core: GelCore, ladders: GelLadders, analysis: GelAnalysis, deskewAngle: number) {
  const { s, laneMeta, laneLabels, sourceInfo, appliedTransforms } = core;
  const { allLanesAnalysis, effectiveLadderLaneId } = analysis;
  const targetClusters: TargetBandCluster[] = useMemo(
    () => computeTargetBandClusters(allLanesAnalysis, s.groupMarginPct, ladders.activeLadder.kind),
    [allLanesAnalysis, s.groupMarginPct, ladders.activeLadder.kind]);
  const groupRows = useMemo(() => resolveLaneValues(allLanesAnalysis, {
    ladderLaneId: effectiveLadderLaneId, massLaneId: s.massLaneId, laneMeta, labels: laneLabels,
    target: s.groupTarget, control: s.groupControl, mode: s.groupNorm, marginPct: s.groupMarginPct,
  }), [allLanesAnalysis, effectiveLadderLaneId, s.massLaneId, laneMeta, laneLabels, s.groupTarget, s.groupControl, s.groupNorm, s.groupMarginPct]);
  const controlCondition = s.groupControlCondition || groupRows[0]?.condition || '';
  const groupSummaries: GroupSummary[] = useMemo(
    () => summarizeGroups(groupRows.map(r => ({ laneId: r.laneId, condition: r.condition, replicate: r.replicate, value: r.value, flags: r.flags })), controlCondition, { welch: s.groupWelch }),
    [groupRows, controlCondition, s.groupWelch]);
  const qualityIssues: QualityIssue[] = useMemo(() => dataQualityIssues({
    sourceInfo, appliedTransforms, deskewAngle,
    saturatedBands: allLanesAnalysis.reduce((n, a) => n + a.metrics.filter(m => isSaturated(m.saturation)).length, 0),
    baselineWarnings: allLanesAnalysis.reduce((n, a) => n + a.metrics.filter(m => m.baselineWarning).length, 0),
  }), [sourceInfo, appliedTransforms, deskewAngle, allLanesAnalysis]);
  return { targetClusters, groupRows, groupSummaries, groupControlCondition: controlCondition, qualityIssues };
}
export type GelGroups = ReturnType<typeof useGelGroups>;
