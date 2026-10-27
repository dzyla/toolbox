/**
 * Colony detection on a plate photo. Pure: works on any RGBA buffer, so it runs the same in a test,
 * on the main thread or on live camera frames.
 *
 * 1. Find the dish (RANSAC circle on the rim) and search its interior minus an edge margin.
 * 2. Agar background: a box blur over dish pixels, then a second one that leaves out everything
 *    far from the first (colonies, marker ink, glare), so neither pulls the background.
 * 3. Colony size: the median radius of clearly separate, round blobs in the background-subtracted
 *    image (or the size the user gives).
 * 4. Colonies are peaks of a difference-of-Gaussians filter tuned to that size (run on the colony
 *    side of the residual only), above k × its robust noise (k follows the sensitivity). Touching
 *    colonies give separate peaks.
 * 5. Peaks on lines (marker pen, the rim, scratches) are rejected by their Hessian: a colony is
 *    curved the same way in every direction, a line only across it.
 * With polarity 'auto', light or dark colonies are chosen by which side has more round blobs.
 */
import { detectPetriDishBoundary, type DishBoundary } from './dish';
import type { ColonySpot } from './index';

export interface RgbaImage { width: number; height: number; data: Uint8ClampedArray | Uint8Array }
export type Polarity = 'auto' | 'light' | 'dark';

export interface DetectOptions {
  /** 0 (only obvious colonies) … 1 (faint ones too); default 0.5. */
  sensitivity?: number;
  polarity?: Polarity;
  /** Fraction of the dish radius excluded at the rim (plastic wall, glare, meniscus); default 0.08. */
  edgeMargin?: number;
  /** Typical colony diameter in px; 0 or absent: estimated from the photo. */
  colonyDiameter?: number;
  /** Colonies smaller than this diameter (px) are dropped; default 0 (none). */
  minDiameter?: number;
  /** Use this dish instead of finding it. */
  dish?: DishBoundary;
}

export interface DetectResult {
  colonies: ColonySpot[];
  dish: DishBoundary;
  /** Inner radius actually searched (dish radius minus the edge margin). */
  searchRadius: number;
  polarity: 'light' | 'dark';
  /** Radius (px) of a typical colony, as used for the filter. */
  typicalRadius: number;
}

/** Box blur over `m`-masked pixels, normalised by the covered count (integral images). */
function maskedBoxBlur(v: Float32Array, m: Uint8Array, w: number, h: number, r: number): Float32Array {
  const W = w + 1;
  const sv = new Float64Array(W * (h + 1));
  const sm = new Float64Array(W * (h + 1));
  for (let y = 0; y < h; y++) {
    let rv = 0, rm = 0;
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (m[i]) { rv += v[i]!; rm += 1; }
      sv[(y + 1) * W + x + 1] = sv[y * W + x + 1]! + rv;
      sm[(y + 1) * W + x + 1] = sm[y * W + x + 1]! + rm;
    }
  }
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - r), y1 = Math.min(h, y + r + 1);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - r), x1 = Math.min(w, x + r + 1);
      const n = sm[y1 * W + x1]! - sm[y0 * W + x1]! - sm[y1 * W + x0]! + sm[y0 * W + x0]!;
      const s = sv[y1 * W + x1]! - sv[y0 * W + x1]! - sv[y1 * W + x0]! + sv[y0 * W + x0]!;
      out[y * w + x] = n > 0 ? s / n : 0;
    }
  }
  return out;
}

/** Gaussian blur (σ) approximated by three box blurs, over masked pixels. */
function gaussian(v: Float32Array, m: Uint8Array, w: number, h: number, sigma: number): Float32Array {
  // Box radius whose three-fold repetition has variance σ²: 3 × ((2r+1)² − 1) / 12 = σ².
  const r = Math.max(1, Math.round((Math.sqrt(4 * sigma * sigma + 1) - 1) / 2));
  let out = v;
  for (let k = 0; k < 3; k++) out = maskedBoxBlur(out, m, w, h, r);
  return out;
}

/** Robust scale (1.4826 × median |v|) over masked pixels, sampled every `step`. */
function robustSigma(v: Float32Array, m: Uint8Array, step: number): number {
  const xs: number[] = [];
  for (let i = 0; i < v.length; i += step) if (m[i]) xs.push(Math.abs(v[i]!));
  if (xs.length === 0) return 1;
  xs.sort((a, b) => a - b);
  return Math.max(1e-3, 1.4826 * xs[Math.floor(xs.length / 2)]!);
}

/** Separate, round blobs above `t`: how many, and their median equivalent radius (null under 5). */
function roundBlobs(s: Float32Array, inside: Uint8Array, w: number, h: number, t: number): { count: number; radius: number | null } {
  const seen = new Uint8Array(w * h);
  const radii: number[] = [];
  const stack: number[] = [];
  for (let start = 0; start < s.length; start++) {
    if (seen[start] || !inside[start] || s[start]! <= t) continue;
    let n = 0, sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0;
    seen[start] = 1;
    stack.push(start);
    while (stack.length) {
      const i = stack.pop()!;
      const x = i % w, y = (i - x) / w;
      n++; sx += x; sy += y; sxx += x * x; syy += y * y; sxy += x * y;
      for (const j of [i - 1, i + 1, i - w, i + w]) {
        if (j >= 0 && j < s.length && !seen[j] && inside[j] && s[j]! > t) { seen[j] = 1; stack.push(j); }
      }
    }
    if (n < 9 || n > 40000) continue;
    const mx = sx / n, my = sy / n;
    const a = sxx / n - mx * mx, b = syy / n - my * my, c = sxy / n - mx * my;
    const root = Math.sqrt(((a - b) / 2) ** 2 + c * c);
    const l1 = (a + b) / 2 + root, l2 = (a + b) / 2 - root;
    if (l2 <= 0 || l1 / l2 > 1.6) continue;              // not round: touching colonies, ink, rim
    radii.push(Math.sqrt(n / Math.PI));
  }
  if (radii.length < 5) return { count: radii.length, radius: null };
  radii.sort((a, b) => a - b);
  return { count: radii.length, radius: radii[Math.floor(radii.length / 2)]! };
}

interface Peak { x: number; y: number; value: number; curvatureRatio: number }

/** Local maxima of `d` above `t` within `win` px, with the Hessian eigenvalue ratio at each. */
function peaks(d: Float32Array, inside: Uint8Array, w: number, h: number, t: number, win: number, hs: number): Peak[] {
  const out: Peak[] = [];
  const at = (xx: number, yy: number) => d[Math.min(h - 1, Math.max(0, yy)) * w + Math.min(w - 1, Math.max(0, xx))]!;
  for (let y = win; y < h - win; y++) {
    for (let x = win; x < w - win; x++) {
      const i = y * w + x, v = d[i]!;
      if (v <= t || !inside[i]) continue;
      let top = true;
      for (let dy = -win; dy <= win && top; dy++) {
        const row = (y + dy) * w;
        for (let dx = -win; dx <= win; dx++) {
          const u = d[row + x + dx]!;
          if (u > v || (u === v && (dy < 0 || (dy === 0 && dx < 0)))) { top = false; break; }
        }
      }
      if (!top) continue;
      // Hessian by central differences at step hs; both eigenvalues are negative at a blob.
      const dxx = at(x + hs, y) + at(x - hs, y) - 2 * v;
      const dyy = at(x, y + hs) + at(x, y - hs) - 2 * v;
      const dxy = (at(x + hs, y + hs) + at(x - hs, y - hs) - at(x + hs, y - hs) - at(x - hs, y + hs)) / 4;
      const tr = (dxx + dyy) / 2, root = Math.sqrt(((dxx - dyy) / 2) ** 2 + dxy * dxy);
      const l1 = tr - root, l2 = tr + root;                // l1 ≤ l2; a blob has both < 0
      out.push({ x, y, value: v, curvatureRatio: l2 < 0 ? l2 / l1 : 0 });
    }
  }
  return out;
}

/** Radius where the signal falls to half its centre value, averaged over 8 directions. */
function measuredRadius(s: Float32Array, w: number, h: number, x: number, y: number, rMax: number): number {
  const c = s[y * w + x]!;
  let sum = 0;
  for (let k = 0; k < 8; k++) {
    const a = (k * Math.PI) / 4, ca = Math.cos(a), sa = Math.sin(a);
    let r = 1;
    for (; r < rMax; r++) {
      const xx = Math.round(x + r * ca), yy = Math.round(y + r * sa);
      if (xx < 0 || yy < 0 || xx >= w || yy >= h || s[yy * w + xx]! < c / 2) break;
    }
    sum += r;
  }
  return sum / 8;
}

export function detectColonies(img: RgbaImage, options: DetectOptions = {}): DetectResult {
  const { width: w, height: h, data } = img;
  const dish = options.dish ?? detectPetriDishBoundary(img);
  const sensitivity = Math.max(0, Math.min(1, options.sensitivity ?? 0.5));
  const edgeMargin = Math.max(0, Math.min(0.5, options.edgeMargin ?? 0.08));
  const searchRadius = dish.radius * (1 - edgeMargin);

  const gray = new Float32Array(w * h);
  const inside = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    gray[i] = 0.299 * data[i * 4]! + 0.587 * data[i * 4 + 1]! + 0.114 * data[i * 4 + 2]!;
    if ((x - dish.cx) ** 2 + (y - dish.cy) ** 2 <= searchRadius * searchRadius) inside[i] = 1;
  }

  // Agar background: first pass over the dish, second pass without the outliers of the first.
  // The background window must be well wider than a colony; a known colony size sets a floor.
  const bgRadius = Math.max(4, Math.round(searchRadius / 12), Math.round((options.colonyDiameter ?? 0) * 2));
  const bg1 = maskedBoxBlur(gray, inside, w, h, bgRadius);
  const d1 = new Float32Array(w * h);
  for (let i = 0; i < d1.length; i++) d1[i] = gray[i]! - bg1[i]!;
  const s1 = robustSigma(d1, inside, 5);
  const agar = new Uint8Array(w * h);
  for (let i = 0; i < agar.length; i++) if (inside[i] && Math.abs(d1[i]!) < 2.5 * s1) agar[i] = 1;
  const bg = maskedBoxBlur(gray, agar, w, h, bgRadius);
  const resid = new Float32Array(w * h);
  for (let i = 0; i < resid.length; i++) resid[i] = inside[i] ? gray[i]! - bg[i]! : 0;
  const noise = robustSigma(resid, agar, 3);

  // Light or dark colonies: whichever side has more separate round blobs (marker strokes, the
  // rim and gaps between colonies are not round). The filter then sees only that side of the
  // residual, so ink (for light colonies) or glare (for dark ones) cannot make the agar beside it
  // look like a colony.
  const side = (sign: 1 | -1) => {
    const v = new Float32Array(w * h);
    for (let i = 0; i < v.length; i++) v[i] = Math.max(0, sign * resid[i]!);
    return v;
  };
  const candidates = (options.polarity === 'light' || options.polarity === 'dark' ? [options.polarity] : ['light', 'dark'] as const)
    .map(polarity => {
      const s = side(polarity === 'light' ? 1 : -1);
      return { polarity, s, blobs: roundBlobs(gaussian(s, inside, w, h, 1), inside, w, h, 4 * noise) };
    });
  const { polarity, s, blobs } = candidates.reduce((a, b) => (b.blobs.count > a.blobs.count ? b : a));

  const radius = options.colonyDiameter && options.colonyDiameter > 0
    ? options.colonyDiameter / 2
    : blobs.radius ?? Math.max(3, searchRadius / 80);

  // Difference of Gaussians tuned to that radius (σ = r/√2 maximises the response to a disc).
  const sigma = Math.max(0.8, radius / Math.SQRT2);
  const fine = gaussian(s, inside, w, h, sigma);
  const coarse = gaussian(s, inside, w, h, sigma * 1.6);
  const dog = new Float32Array(w * h);
  for (let i = 0; i < dog.length; i++) dog[i] = fine[i]! - coarse[i]!;
  const dogNoise = robustSigma(dog, agar, 3);
  const threshold = dogNoise * (9 - 6 * sensitivity);     // 0 → 9σ, 0.5 → 6σ, 1 → 3σ

  const win = Math.max(1, Math.round(radius * 0.8));
  const found = peaks(dog, inside, w, h, threshold, win, Math.max(1, Math.round(radius / 2)))
    .filter(p => p.curvatureRatio > 0.25)                   // lines: ink, rim, scratches
    .sort((a, b) => b.value - a.value);

  const colonies: ColonySpot[] = [];
  const minR = (options.minDiameter ?? 0) / 2;
  for (const p of found) {
    const r = measuredRadius(s, w, h, p.x, p.y, Math.ceil(radius * 3));
    if (r < minR) continue;
    // Confidence: how far above the threshold (full at twice it) and how round the peak is.
    const strength = Math.min(1, p.value / threshold - 1);
    const certainty = Math.min(0.99, Math.max(0.05, 0.5 + 0.3 * strength + 0.2 * p.curvatureRatio));
    colonies.push({
      id: `auto-${colonies.length + 1}`,
      x: p.x, y: p.y, radius: Math.round(r * 10) / 10,
      certainty,
      category: certainty >= 0.75 ? 'cat-1' : certainty >= 0.5 ? 'cat-2' : 'cat-3',
      isManual: false,
    });
  }
  return { colonies, dish, searchRadius, polarity, typicalRadius: radius };
}
