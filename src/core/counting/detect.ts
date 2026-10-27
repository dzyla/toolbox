/**
 * Colony detection on a plate photo. Pure: works on any RGBA buffer, so it runs the same in a test,
 * on the main thread or on live camera frames.
 *
 * 1. Find the dish (RANSAC circle on the rim), then the agar's own edge inside the plastic wall
 *    (its own circle, where brightness leaves the agar level); search inside it.
 * 2. Agar background: a box blur over dish pixels, then a second one that leaves out everything
 *    far from the first (colonies, marker ink, glare), so neither pulls the background.
 * 3. Colony size: the median radius of clearly separate, round blobs in the background-subtracted
 *    image (or the size the user gives).
 * 4. Colonies are peaks of a difference-of-Gaussians scale space around that size (run on the
 *    colony side of the residual only, each scale in units of its own robust noise), above k
 *    (k follows the sensitivity). Small and large colonies are found at their own size; touching
 *    colonies give separate peaks.
 * 5. Peaks on lines (marker pen, the rim, scratches) are rejected by their Hessian: a colony is
 *    curved the same way in every direction, a line only across it. A line's end, which looks
 *    round up close, is rejected because the region around it runs on long and thin.
 * With polarity 'auto', light or dark colonies are chosen by which side has more round blobs.
 */
import { detectAgarEdge, detectPetriDishBoundary, type DishBoundary } from './dish';
import type { ColonySpot } from './index';

export interface RgbaImage { width: number; height: number; data: Uint8ClampedArray | Uint8Array }
export type Polarity = 'auto' | 'light' | 'dark';

export interface DetectOptions {
  /** 0 (only obvious colonies) … 1 (faint ones too); default 0.5. */
  sensitivity?: number;
  polarity?: Polarity;
  /** Extra margin inside the agar edge, as a fraction of the dish radius; default 0.02. */
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
  /** Radius actually searched: the agar edge minus the edge margin. */
  searchRadius: number;
  /** The circle actually searched (the agar edge, shrunk by the margin; centred on the agar). */
  searchCircle: DishBoundary;
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

/** Local maxima of `d` above `t` inside the dish, strict within a (2·win+1)² window. */
function localMaxima(d: Float32Array, inside: Uint8Array, w: number, h: number, t: number, win: number): { x: number; y: number; value: number }[] {
  const out: { x: number; y: number; value: number }[] = [];
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
      if (top) out.push({ x, y, value: v });
    }
  }
  return out;
}

/**
 * Ratio of the Hessian eigenvalues of `d` at (x, y), central differences at step `hs`: near 1 for
 * a round peak, near 0 on a line; 0 when the point is not a maximum in both directions.
 */
function curvatureRatio(d: Float32Array, w: number, h: number, x: number, y: number, hs: number): number {
  const at = (xx: number, yy: number) => d[Math.min(h - 1, Math.max(0, yy)) * w + Math.min(w - 1, Math.max(0, xx))]!;
  const v = at(x, y);
  const dxx = at(x + hs, y) + at(x - hs, y) - 2 * v;
  const dyy = at(x, y + hs) + at(x, y - hs) - 2 * v;
  const dxy = (at(x + hs, y + hs) + at(x - hs, y - hs) - at(x + hs, y - hs) - at(x - hs, y + hs)) / 4;
  const tr = (dxx + dyy) / 2, root = Math.sqrt(((dxx - dyy) / 2) ** 2 + dxy * dxy);
  const l1 = tr - root, l2 = tr + root;                    // l1 ≤ l2; a blob has both < 0
  return l2 < 0 ? l2 / l1 : 0;
}

/**
 * Length-to-width ratio of the region around (x, y) where `s` stays above half its value there,
 * within 4r. A colony (even three touching in a row) stays under about 3; the end of a pen stroke
 * runs on into a long, thin region.
 */
function elongationAt(s: Float32Array, w: number, h: number, x: number, y: number, r: number): number {
  const t = s[y * w + x]! / 2, lim = Math.ceil(4 * r);
  const seen = new Set<number>([y * w + x]);
  const stack = [y * w + x];
  let n = 0, sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0;
  while (stack.length) {
    const i = stack.pop()!;
    const px = i % w, py = (i - px) / w;
    n++; sx += px; sy += py; sxx += px * px; syy += py * py; sxy += px * py;
    for (const j of [i - 1, i + 1, i - w, i + w]) {
      const jx = j % w, jy = (j - jx) / w;
      if (j < 0 || j >= s.length || seen.has(j) || Math.abs(jx - x) > lim || Math.abs(jy - y) > lim || s[j]! <= t) continue;
      seen.add(j);
      stack.push(j);
    }
  }
  const mx = sx / n, my = sy / n;
  const a = sxx / n - mx * mx, b = syy / n - my * my, c = sxy / n - mx * my;
  const root = Math.sqrt(((a - b) / 2) ** 2 + c * c);
  const l1 = (a + b) / 2 + root, l2 = Math.max(1e-6, (a + b) / 2 - root);
  return Math.sqrt(l1 / l2);
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
  const edgeMargin = Math.max(0, Math.min(0.5, options.edgeMargin ?? 0.02));

  const gray = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) gray[i] = 0.299 * data[i * 4]! + 0.587 * data[i * 4 + 1]! + 0.114 * data[i * 4 + 2]!;
  // Search the agar only: its own edge (inside the plastic wall), minus the user's margin.
  const edge = options.dish ? options.dish : detectAgarEdge(gray, w, h, dish);
  const searchRadius = Math.max(1, edge.radius - edgeMargin * dish.radius);
  const agarCircle = { cx: edge.cx, cy: edge.cy, radius: searchRadius };
  const inside = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if ((x - edge.cx) ** 2 + (y - edge.cy) ** 2 <= searchRadius * searchRadius) inside[y * w + x] = 1;
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

  // Scale space: a difference of Gaussians at radii from half the typical one up to it
  // (σ = r/√2 maximises the response to a disc; DoG is close to the scale-normalised Laplacian,
  // so responses compare across scales). Larger scales are left out on purpose: they pick up
  // broad, faint blobs such as colony reflections in the lid, and larger colonies still respond
  // at the typical scale. A peak must exceed k × its scale's robust noise and be at least as
  // strong as the neighbouring scales at the same pixel (a scale-space maximum), so a small
  // scale's bumps inside a large colony do not count.
  const radii = [0.5, 0.71, 1].map(f => Math.max(1.2, radius * f))
    .filter((r, i, all) => i === 0 || r > all[i - 1]! * 1.15);
  const threshold = 9 - 6 * sensitivity;                  // in noise units: 0 → 9σ, 0.5 → 6σ, 1 → 3σ
  const dogs = radii.map(r => {
    const sigma = r / Math.SQRT2;
    const fine = gaussian(s, inside, w, h, sigma);
    const coarse = gaussian(s, inside, w, h, sigma * 1.6);
    const dog = new Float32Array(w * h);
    for (let i = 0; i < dog.length; i++) dog[i] = fine[i]! - coarse[i]!;
    return dog;
  });
  const candidates2: { x: number; y: number; response: number; z: number; r: number; curvature: number }[] = [];
  dogs.forEach((dog, k) => {
    const r = radii[k]!;
    const n = robustSigma(dog, agar, 3);
    for (const p of localMaxima(dog, inside, w, h, threshold * n, Math.max(1, Math.round(r * 0.8)))) {
      const i = p.y * w + p.x;
      if ((k > 0 && dogs[k - 1]![i]! > p.value) || (k < dogs.length - 1 && dogs[k + 1]![i]! > p.value)) continue;
      const curvature = curvatureRatio(dog, w, h, p.x, p.y, Math.max(1, Math.round(r / 2)));
      if (curvature <= 0.25) continue;                      // lines: ink, rim, scratches
      if (elongationAt(s, w, h, p.x, p.y, r) > 4) continue;  // the end of a line
      candidates2.push({ x: p.x, y: p.y, response: p.value, z: p.value / n, r, curvature });
    }
  });

  // One colony, one peak: the strongest response wins, and a weaker peak closer than
  // 0.7 × (sum of radii) is the same colony seen at another scale (e.g. its rim at a small one).
  // Touching colonies, 2r apart, stay separate.
  const kept: typeof candidates2 = [];
  for (const p of candidates2.sort((a, b) => b.response - a.response)) {
    if (!kept.some(q => Math.hypot(q.x - p.x, q.y - p.y) < 0.7 * (q.r + p.r))) kept.push(p);
  }

  const colonies: ColonySpot[] = [];
  const minR = (options.minDiameter ?? 0) / 2;
  for (const p of kept) {
    const r = measuredRadius(s, w, h, p.x, p.y, Math.ceil(p.r * 3));
    if (r < minR) continue;
    // Confidence: how far above the threshold (full at twice it) and how round the peak is.
    const strength = Math.min(1, p.z / threshold - 1);
    const certainty = Math.min(0.99, Math.max(0.05, 0.5 + 0.3 * strength + 0.2 * p.curvature));
    colonies.push({
      id: `auto-${colonies.length + 1}`,
      x: p.x, y: p.y, radius: Math.round(r * 10) / 10,
      certainty,
      category: certainty >= 0.75 ? 'cat-1' : certainty >= 0.5 ? 'cat-2' : 'cat-3',
      isManual: false,
    });
  }
  return { colonies, dish, searchRadius, searchCircle: agarCircle, polarity, typicalRadius: radius };
}
