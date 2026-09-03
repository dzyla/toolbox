/* Synthetic gel renderer with known truth: Gaussian bands along the lane, flat across it, on a vertical gradient
 * background with Gaussian noise. Used by the tests and by the "demo gel" button. */
import type { Plane, Polarity } from './types';

export interface SyntheticBand { y: number; sigma: number; amplitude: number }
export interface SyntheticLane { x: number; width: number; bands: SyntheticBand[] }
export interface SyntheticSpec {
  width: number; height: number; lanes: SyntheticLane[];
  /** Background signal level (bands positive) at the top and bottom rows. */
  backgroundTop?: number; backgroundBottom?: number;
  noise?: number; polarity?: Polarity; seed?: number;
  /** Soft lane edges: Gaussian roll-off in px. 0 = hard edges. */
  edgeSoftness?: number;
}
export interface SyntheticTruth {
  /** Per lane, per band: exact integrated signal over the whole band (before clipping), and clipped fraction. */
  lanes: { x: number; width: number; bands: { y: number; sigma: number; amplitude: number; integral: number; clipped: boolean }[] }[];
}

/** mulberry32 PRNG, deterministic for tests. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function gaussianNoise(r: () => number): number {
  const u = Math.max(1e-12, r()), v = r();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export function renderSyntheticGel(spec: SyntheticSpec): { plane: Plane; truth: SyntheticTruth } {
  const { width, height } = spec;
  const bgTop = spec.backgroundTop ?? 0.1, bgBot = spec.backgroundBottom ?? 0.15;
  const polarity = spec.polarity ?? 'dark';
  const soft = spec.edgeSoftness ?? 1.5;
  const rand = rng(spec.seed ?? 1);
  const signal = new Float32Array(width * height);
  for (let y = 0; y < height; y++) {
    const bg = bgTop + (bgBot - bgTop) * y / Math.max(1, height - 1);
    for (let x = 0; x < width; x++) signal[y * width + x] = bg;
  }
  const truth: SyntheticTruth = { lanes: [] };
  for (const lane of spec.lanes) {
    const tl: SyntheticTruth['lanes'][number] = { x: lane.x, width: lane.width, bands: [] };
    const half = lane.width / 2;
    for (const b of lane.bands) {
      let integral = 0;
      let clipped = false;
      for (let y = 0; y < height; y++) {
        const g = Math.exp(-((y + 0.5 - b.y) ** 2) / (2 * b.sigma * b.sigma));
        if (g < 1e-6) continue;
        for (let x = 0; x < width; x++) {
          const dx = Math.abs(x + 0.5 - lane.x) - half;
          const across = dx <= 0 ? 1 : soft > 0 ? Math.exp(-(dx * dx) / (2 * soft * soft)) : 0;
          if (across < 1e-6) continue;
          const v = b.amplitude * g * across;
          const i = y * width + x;
          integral += v;
          signal[i] = signal[i]! + v;
          if (signal[i]! > 1) clipped = true;
        }
      }
      tl.bands.push({ ...b, integral, clipped });
    }
    truth.lanes.push(tl);
  }
  const data = new Float32Array(width * height);
  const noise = spec.noise ?? 0;
  for (let i = 0; i < data.length; i++) {
    const s = signal[i]! + (noise > 0 ? noise * gaussianNoise(rand) : 0);
    const v = polarity === 'dark' ? 1 - s : s;
    data[i] = Math.min(1, Math.max(0, v));
  }
  return { plane: { width, height, data }, truth };
}

/** A ready-made 8-lane protein gel (ladder in lane 1) for the demo button. Sizes follow a log-linear run. */
export function demoGel(): { plane: Plane; ladderSizes: number[]; laneCount: number } {
  const ladderSizes = [250, 150, 100, 75, 50, 37, 25, 20, 15, 10];
  const width = 640, height = 480;
  const yOf = (kda: number) => 40 + (Math.log10(250) - Math.log10(kda)) / (Math.log10(250) - Math.log10(10)) * 380;
  const lanes: SyntheticLane[] = [];
  const pitch = width / 8;
  lanes.push({ x: pitch * 0.5, width: 48, bands: ladderSizes.map(k => ({ y: yOf(k), sigma: 3, amplitude: k === 75 || k === 25 ? 0.7 : 0.45 })) });
  const r = rng(7);
  for (let i = 1; i < 8; i++) {
    const bands: SyntheticBand[] = [{ y: yOf(42), sigma: 3.5, amplitude: 0.55 + 0.05 * (r() - 0.5) }];
    bands.push({ y: yOf(28), sigma: 4, amplitude: 0.15 + 0.6 * (i / 7) });
    if (i % 2 === 0) bands.push({ y: yOf(130), sigma: 5, amplitude: 0.25 });
    lanes.push({ x: pitch * (i + 0.5), width: 50, bands });
  }
  const { plane } = renderSyntheticGel({ width, height, lanes, backgroundTop: 0.08, backgroundBottom: 0.16, noise: 0.012, seed: 42 });
  return { plane, ladderSizes, laneCount: 8 };
}
