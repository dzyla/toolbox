import { describe, it, expect } from 'vitest';
import { resolveLaneValues } from '@/tools/gel/workspace/groups';
import type { LaneAnalysisItem } from '@/tools/gel/analysis';

const metric = (id: string, peakY: number, net: number, sizeEst: number | null, sat = 0) => ({
  bandId: id, raw: net, background: 0, net, area: 10, saturation: sat, peakY, y0: peakY - 3, y1: peakY + 3,
  number: 1, share: 0, ratio: null, sizeEst, massEst: null, massFlags: null, ladderAssigned: null, sizeResidualPct: null, baselineWarning: false,
});
const lane = (id: string, x: number, metrics: ReturnType<typeof metric>[], total = 100): LaneAnalysisItem => ({
  lane: { id, x, y0: 0, y1: 100, width: 10, tilt: 0 }, laneIdx: x, profile: new Float32Array(100), baseline: new Float32Array(100),
  netProfile: new Float32Array(100), metrics, totalNet: 0, totalBandsSignal: 0, totalLaneSignal: total, loadingRatio: 1, loadingDeviationPct: 0, normFactor: 1,
});

describe('resolveLaneValues', () => {
  const analysis = [
    lane('L', 0, []),                                              // ladder
    lane('a', 1, [metric('a1', 30, 20, 50), metric('a2', 60, 10, 42)]),
    lane('b', 2, [metric('b1', 31, 30, 49, 0.2), metric('b2', 61, 10, 42)]),
    lane('c', 3, [metric('c2', 60, 10, 42)]),                      // no target
  ];
  const opts = { ladderLaneId: 'L', massLaneId: '', laneMeta: {}, labels: { a: 'ctrl', b: 'drug', c: 'drug' },
    target: { size: 50, rf: 0.3 }, control: { size: 42, rf: 0.6 }, mode: 'control-band' as const, marginPct: 10 };
  const rows = resolveLaneValues(analysis, opts);
  it('skips ladder and standard lanes', () => expect(rows.map(r => r.laneId)).toEqual(['a', 'b', 'c']));
  it('normalizes the target by the control band', () => {
    expect(rows[0]!.value).toBeCloseTo(2);
    expect(rows[1]!.value).toBeCloseTo(3);
  });
  it('propagates saturation and gives a reason for missing targets', () => {
    expect(rows[1]!.flags).toContain('saturated');
    expect(rows[2]!.value).toBeNull();
    expect(rows[2]!.reason).toMatch(/target/);
  });
  it('matches by Rf on an uncalibrated gel', () => {
    const unc = analysis.map(a => ({ ...a, metrics: a.metrics.map(m => ({ ...m, sizeEst: null })) }));
    const r = resolveLaneValues(unc, { ...opts, target: { size: null, rf: 0.3 }, control: { size: null, rf: 0.6 } });
    expect(r[0]!.value).toBeCloseTo(2);
  });
  it('treats the control as missing when it resolves to the target band', () => {
    const r = resolveLaneValues(analysis, { ...opts, control: { size: 50, rf: 0.3 } });
    expect(r[0]!.value).toBeNull();
    expect(r[0]!.controlNet).toBeNull();
    expect(r[0]!.reason).toMatch(/control/);
    expect(r[0]!.reason).toMatch(/target/);
  });
});
