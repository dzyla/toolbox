/* End-to-end on synthetic gels with known truth: lane finding, band detection, quantification, saturation, polarity,
 * and sampling through a rotated working frame. Tolerances from the plan: lanes ≤ 2 px, peaks ≤ 1 px, net ≤ 5 %. */
import { describe, it, expect } from 'vitest';
import { renderSyntheticGel, demoGel } from '@/core/gel/synthetic';
import { autoLanes, equalLanes, laneCentreAt } from '@/core/gel/lanes';
import { sampleLane, laneProfile, detectBands } from '@/core/gel/profile';
import { rollingBaseline, valleyBaseline } from '@/core/gel/background';
import { quantifyBands, percentOfLane, detectPolarity, SATURATION_WARN } from '@/core/gel/quant';
import { rawToWorking, workingToRaw, apply, frameSize } from '@/core/gel/transform';
import type { Lane, Polarity } from '@/core/gel/types';

const W = 400, H = 300;
const LANES = [60, 130, 200, 270, 340].map(x => ({ x, width: 40 }));
const BANDS = [
  [{ y: 60, sigma: 3, amplitude: 0.5 }, { y: 150, sigma: 4, amplitude: 0.3 }, { y: 230.4, sigma: 3, amplitude: 0.6 }],
  [{ y: 60, sigma: 3, amplitude: 0.25 }, { y: 150, sigma: 4, amplitude: 0.6 }],
  [{ y: 100, sigma: 5, amplitude: 0.4 }, { y: 150, sigma: 4, amplitude: 0.15 }, { y: 200, sigma: 3, amplitude: 0.35 }],
  [{ y: 150, sigma: 4, amplitude: 0.45 }],
  [{ y: 60, sigma: 3, amplitude: 0.5 }, { y: 150, sigma: 4, amplitude: 0.3 }, { y: 230.4, sigma: 3, amplitude: 0.6 }],
];
function gel(polarity: Polarity = 'dark', noise = 0.01, edgeSoftness = 0) {
  return renderSyntheticGel({ width: W, height: H, lanes: LANES.map((l, i) => ({ ...l, bands: BANDS[i]! })), backgroundTop: 0.05, backgroundBottom: 0.2, noise, polarity, seed: 3, edgeSoftness });
}

describe('synthetic gel pipeline', () => {
  it('finds lane centres within 2 px and sensible widths', () => {
    const { plane } = gel();
    const lanes = autoLanes(plane, { x: 0, y: 0, w: W, h: H }, 'dark');
    expect(lanes.length).toBe(5);
    lanes.forEach((l, i) => {
      expect(Math.abs(l.x - LANES[i]!.x)).toBeLessThanOrEqual(2);
      expect(l.width).toBeGreaterThanOrEqual(28); expect(l.width).toBeLessThanOrEqual(46);
    });
    const eq = equalLanes(5, { x: 30, y: 0, w: 340, h: H });
    expect(eq.map(l => l.x)).toEqual([64, 132, 200, 268, 336]);
    expect(laneCentreAt({ id: 'a', x: 10, y0: 0, y1: 100, width: 5, tilt: 10 }, 50)).toBe(15);
  });

  it('detects band peaks within 1 px, in both polarities', () => {
    for (const pol of ['dark', 'light'] as Polarity[]) {
      const { plane } = gel(pol);
      expect(detectPolarity(plane)).toBe(pol);
      LANES.forEach((l, i) => {
        const lane: Lane = { id: `l${i}`, x: l.x, y0: 0, y1: H, width: l.width, tilt: 0 };
        const prof = laneProfile(sampleLane(plane, lane, pol));
        const peaks = detectBands(prof);
        expect(peaks.length).toBe(BANDS[i]!.length);
        peaks.forEach((p, j) => expect(Math.abs(p.index + 0.5 - BANDS[i]![j]!.y)).toBeLessThanOrEqual(1));
      });
    }
  });

  it('quantifies net intensity within 5 % of truth with rolling-ball and valley baselines', () => {
    const { plane, truth } = gel('dark', 0.005);
    const errors: number[] = [];
    LANES.forEach((l, i) => {
      const lane: Lane = { id: `l${i}`, x: l.x, y0: 0, y1: H, width: l.width, tilt: 0 };
      const s = sampleLane(plane, lane, 'dark');
      const prof = laneProfile(s);
      const bands = detectBands(prof).map((p, j) => ({ id: `b${j}`, y0: p.y0, y1: p.y1, peakY: p.index }));
      for (const [name, base] of [['rolling', rollingBaseline(prof, 30)], ['valley', valleyBaseline(prof, bands)]] as const) {
        const m = quantifyBands(s, bands, base);
        m.forEach((q, j) => {
          const t = truth.lanes[i]!.bands[j]!.integral;
          const err = Math.abs(q.net - t) / t;
          errors.push(err);
          const maxErr = name === 'valley' ? 0.05 : 0.10;
          expect(err, `${name} lane ${i} band ${j}: net ${q.net.toFixed(1)} vs truth ${t.toFixed(1)}`).toBeLessThan(maxErr);
          expect(q.saturation).toBe(0);
        });
      }
      const shares = percentOfLane(quantifyBands(s, bands, rollingBaseline(prof, 30)));
      expect(shares.reduce((t, x) => t + x.percentOfLane, 0)).toBeCloseTo(100, 6);
    });
    expect(Math.max(...errors)).toBeLessThan(0.10);
  });

  it('flags saturated bands', () => {
    const { plane, truth } = renderSyntheticGel({ width: 100, height: 120, lanes: [{ x: 50, width: 30, bands: [{ y: 40, sigma: 4, amplitude: 1.5 }, { y: 90, sigma: 4, amplitude: 0.4 }] }], backgroundTop: 0.1, backgroundBottom: 0.1, noise: 0, seed: 1 });
    expect(truth.lanes[0]!.bands[0]!.clipped).toBe(true);
    const lane: Lane = { id: 'l', x: 50, y0: 0, y1: 120, width: 30, tilt: 0 };
    const s = sampleLane(plane, lane, 'dark');
    const prof = laneProfile(s);
    const bands = detectBands(prof).map((p, j) => ({ id: `b${j}`, y0: p.y0, y1: p.y1 }));
    const m = quantifyBands(s, bands, rollingBaseline(prof, 30));
    expect(m[0]!.saturation).toBeGreaterThan(SATURATION_WARN);
    expect(m[1]!.saturation).toBe(0);
  });

  it('samples a tilted lane through a rotated working frame', () => {
    const { plane } = gel('dark', 0.005);
    const g = { rotation: 6, flipH: false, flipV: false };
    const toRaw = workingToRaw(W, H, g), toWork = rawToWorking(W, H, g);
    const size = frameSize(W, H, g);
    expect(size.w).toBeGreaterThan(W);
    // The raw lane at x = 200 becomes a tilted line in the working frame.
    const [x0, y0] = apply(toWork, 200, 0), [x1, y1] = apply(toWork, 200, H);
    const lane: Lane = { id: 't', x: x0, y0, y1, width: 40, tilt: x1 - x0 };
    const prof = laneProfile(sampleLane(plane, lane, 'dark', toRaw));
    const peaks = detectBands(prof);
    expect(peaks.length).toBe(3);
    const len = Math.hypot(x1 - x0, y1 - y0);
    BANDS[2]!.forEach((b, j) => expect(Math.abs((peaks[j]!.index + 0.5) - b.y * len / H)).toBeLessThanOrEqual(1));
  });

  it('demo gel renders with a ladder lane', () => {
    const d = demoGel();
    expect(d.plane.width).toBe(640);
    expect(autoLanes(d.plane, { x: 0, y: 0, w: 640, h: 480 }, 'dark').length).toBe(8);
  });
});
