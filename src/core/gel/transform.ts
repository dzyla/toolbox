/* Affine transforms between the raw image and the working frame (rotated, flipped, cropped view). */
import type { Affine, Plane, Polarity } from './types';

export const IDENTITY: Affine = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };

export function apply(m: Affine, x: number, y: number): [number, number] {
  return [m.a * x + m.c * y + m.e, m.b * x + m.d * y + m.f];
}
/** m1 ∘ m2: apply m2 first, then m1. */
export function compose(m1: Affine, m2: Affine): Affine {
  return {
    a: m1.a * m2.a + m1.c * m2.b, b: m1.b * m2.a + m1.d * m2.b,
    c: m1.a * m2.c + m1.c * m2.d, d: m1.b * m2.c + m1.d * m2.d,
    e: m1.a * m2.e + m1.c * m2.f + m1.e, f: m1.b * m2.e + m1.d * m2.f + m1.f,
  };
}
export function invert(m: Affine): Affine {
  const det = m.a * m.d - m.b * m.c;
  if (Math.abs(det) < 1e-12) throw new Error('Singular transform');
  const a = m.d / det, b = -m.b / det, c = -m.c / det, d = m.a / det;
  return { a, b, c, d, e: -(a * m.e + c * m.f), f: -(b * m.e + d * m.f) };
}
export const translate = (tx: number, ty: number): Affine => ({ ...IDENTITY, e: tx, f: ty });
export const scale = (sx: number, sy: number = sx): Affine => ({ ...IDENTITY, a: sx, d: sy });
export function rotate(deg: number): Affine {
  const r = deg * Math.PI / 180, cs = Math.cos(r), sn = Math.sin(r);
  return { a: cs, b: sn, c: -sn, d: cs, e: 0, f: 0 };
}
export const toCss = (m: Affine) => `matrix(${m.a} ${m.b} ${m.c} ${m.d} ${m.e} ${m.f})`;

export interface Geometry {
  /** Degrees, counter-clockwise positive as seen on screen (y down): the raw image is rotated by this to straighten it. */
  rotation: number;
  flipH: boolean; flipV: boolean;
  /** Crop in the un-cropped working frame (after rotation and flips). Absent = whole rotated frame. */
  crop?: { x: number; y: number; w: number; h: number };
}

/** Size of the axis-aligned bounding box of the raw image rotated by `deg`. */
export function rotatedSize(w: number, h: number, deg: number): { w: number; h: number } {
  const r = deg * Math.PI / 180, cs = Math.abs(Math.cos(r)), sn = Math.abs(Math.sin(r));
  return { w: Math.ceil(w * cs + h * sn), h: Math.ceil(w * sn + h * cs) };
}

/** Working frame size for a raw image under a geometry. */
export function frameSize(rawW: number, rawH: number, g: Geometry): { w: number; h: number } {
  if (g.crop) return { w: Math.max(1, Math.round(g.crop.w)), h: Math.max(1, Math.round(g.crop.h)) };
  return rotatedSize(rawW, rawH, g.rotation);
}

/** Map raw pixel coordinates to the working frame. */
export function rawToWorking(rawW: number, rawH: number, g: Geometry): Affine {
  const rs = rotatedSize(rawW, rawH, g.rotation);
  // centre the raw image, rotate, move to the rotated box, flip within the box, then crop.
  let m = compose(rotate(g.rotation), translate(-rawW / 2, -rawH / 2));
  m = compose(translate(rs.w / 2, rs.h / 2), m);
  if (g.flipH) m = compose({ ...IDENTITY, a: -1, e: rs.w }, m);
  if (g.flipV) m = compose({ ...IDENTITY, d: -1, f: rs.h }, m);
  if (g.crop) m = compose(translate(-g.crop.x, -g.crop.y), m);
  return m;
}
export const workingToRaw = (rawW: number, rawH: number, g: Geometry): Affine => invert(rawToWorking(rawW, rawH, g));

/** Rotation (degrees) that makes the line p1→p2 horizontal: drag along the well row or dye front, apply this. */
export function rotationFromLine(x1: number, y1: number, x2: number, y2: number): number {
  const deg = -Math.atan2(y2 - y1, x2 - x1) * 180 / Math.PI;
  // Normalise to (-90, 90] so a right-to-left drag straightens too.
  let d = deg;
  while (d >= 90) d -= 180;
  while (d < -90) d += 180;
  return d;
}

/** Bilinear sample of a plane at fractional coordinates; outside the image returns NaN. */
export function sampleBilinear(p: Plane, x: number, y: number): number {
  if (x < 0 || y < 0 || x > p.width - 1 || y > p.height - 1) return NaN;
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const x1 = Math.min(x0 + 1, p.width - 1), y1 = Math.min(y0 + 1, p.height - 1);
  const fx = x - x0, fy = y - y0;
  const d = p.data, w = p.width;
  const v00 = d[y0 * w + x0]!, v10 = d[y0 * w + x1]!, v01 = d[y1 * w + x0]!, v11 = d[y1 * w + x1]!;
  return (v00 * (1 - fx) + v10 * fx) * (1 - fy) + (v01 * (1 - fx) + v11 * fx) * fy;
}
/** Nearest-neighbour sample; NaN outside. Used for saturation checks where interpolation would hide clipping. */
export function sampleNearest(p: Plane, x: number, y: number): number {
  const xi = Math.round(x), yi = Math.round(y);
  if (xi < 0 || yi < 0 || xi >= p.width || yi >= p.height) return NaN;
  return p.data[yi * p.width + xi]!;
}

/** Resample a plane under a geometry (rotation, flips, and crop) into a new Plane. */
export function transformPlane(raw: Plane, g: Geometry): Plane {
  const size = frameSize(raw.width, raw.height, g);
  const w = size.w, h = size.h;
  const out = new Float32Array(w * h);
  const w2r = workingToRaw(raw.width, raw.height, g);
  for (let y = 0; y < h; y++) {
    const rowOffset = y * w;
    for (let x = 0; x < w; x++) {
      const [rx, ry] = apply(w2r, x, y);
      const val = sampleBilinear(raw, rx, ry);
      out[rowOffset + x] = Number.isNaN(val) ? 1 : val;
    }
  }
  return { width: w, height: h, data: out };
}

export interface GelCropSuggestion {
  /** Suggested deskew rotation angle in degrees to straighten the gel. */
  rotation: number;
  /** Suggested crop box in pixels [x, y, w, h]. */
  crop: { x: number; y: number; w: number; h: number };
  /** Confidence score between 0 and 1. */
  confidence: number;
}

/** Median of a number array (robust centre, used for border/background estimation). */
function medianOf(a: number[]): number {
  const s = [...a].sort((x, y) => x - y);
  const m = s.length >> 1;
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

/**
 * Content-based crop: the gel is the largest contiguous block of rows/columns that carry ink
 * (pixels far from the scanner background). The background level is estimated from the image border,
 * which is robust because a gel occupies the central bulk of the frame — measuring distance from the
 * median instead fails (the gel IS the majority, so the median sits inside it).
 * Returns the crop box in image pixels, or null if no clear content block exists.
 */
export function contentCropBox(plane: Plane, polarity: Polarity = 'dark'): { x: number; y: number; w: number; h: number } | null {
  const w = plane.width, h = plane.height;
  if (w < 40 || h < 40) return null;

  // Scanner background: median of the outer border ring (a couple of pixel rings thick).
  const ring: number[] = [];
  const rt = Math.max(1, Math.round(Math.min(w, h) * 0.02));
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const onBorder = x < rt || x >= w - rt || y < rt || y >= h - rt;
      if (onBorder) ring.push(plane.data[y * w + x]!);
    }
  }
  const bg = medianOf(ring);

  // Ink = deviation from the background, in the polarity direction (works for dark and light gels).
  const ink = (v: number): number => {
    if (Number.isNaN(v)) return 0;
    return polarity === 'dark' ? Math.max(0, bg - v) : Math.max(0, v - bg);
  };

  // Per-row and per-column ink fractions, sampled sparsely along the other axis.
  const colStep = Math.max(1, Math.floor(w / 240));
  const rowStep = Math.max(1, Math.floor(h / 240));
  const rowFrac = new Float64Array(h), rowTot = new Float64Array(h);
  for (let y = 0; y < h; y++) {
    let cnt = 0, tot = 0;
    for (let x = 0; x < w; x += colStep) { if (ink(plane.data[y * w + x]!) > 0.03) cnt++; tot++; }
    rowFrac[y] = tot > 0 ? cnt / tot : 0; rowTot[y] = tot;
  }
  const colFrac = new Float64Array(w), colTot = new Float64Array(w);
  for (let x = 0; x < w; x++) {
    let cnt = 0, tot = 0;
    for (let y = 0; y < h; y += rowStep) { if (ink(plane.data[y * w + x]!) > 0.03) cnt++; tot++; }
    colFrac[x] = tot > 0 ? cnt / tot : 0; colTot[x] = tot;
  }

  const longest = (frac: Float64Array): [number, number] | null => {
    let best: [number, number] | null = null;
    let i = 0;
    while (i < frac.length) {
      if (frac[i]! < 0.3) { i++; continue; }
      const start = i;
      while (i < frac.length && frac[i]! >= 0.3) i++;
      const len = i - start;
      if (!best || len > best[1] - best[0]) best = [start, i];
    }
    return best;
  };

  const ry = longest(rowFrac);
  const cx = longest(colFrac);
  if (!ry || !cx) return null;
  if ((ry[1] - ry[0]) < h * 0.1 || (cx[1] - cx[0]) < w * 0.1) return null; // degenerate: not a gel block

  const padY = Math.round(h * 0.015), padX = Math.round(w * 0.015);
  const x = Math.max(0, cx[0] - padX);
  const y = Math.max(0, ry[0] - padY);
  const cw = Math.min(w - x, (cx[1] - cx[0]) + padX * 2);
  const ch = Math.min(h - y, (ry[1] - ry[0]) + padY * 2);
  return { x, y, w: Math.max(20, cw), h: Math.max(20, ch) };
}

/**
 * Automatically analyze the gel image plane to suggest a straightening rotation and a tight crop.
 *
 * - Crop: robust background-relative content block (see {@link contentCropBox}). Falls back to the
 *   whole frame when no clear gel block is detected, so a bad suggestion is always a no-op.
 * - Tilt: coarse-to-fine projection-variance deskew, gated so it only rotates when the winning
 *   angle is a clear local maximum that beats the un-rotated projection. On a flat/ambiguous profile
 *   it returns 0 rather than an artefact.
 *
 * The returned `crop` is in the UN-ROTATED working frame, and `rotation` is the angle to apply
 * (the sign that straightens the gel under {@link transformPlane}).
 */
export function suggestGelCropAndTilt(plane: Plane, polarity: Polarity = 'dark'): GelCropSuggestion {
  const w = plane.width;
  const h = plane.height;
  if (w < 10 || h < 10) {
    return { rotation: 0, crop: { x: 0, y: 0, w, h }, confidence: 0 };
  }

  const box = contentCropBox(plane, polarity);
  const crop = box ?? { x: 0, y: 0, w, h };

  const { angle, margin, peaked } = deskewAngle(plane, polarity);
  // Only rotate when the winning angle is a clear local maximum with a meaningful margin over 0°.
  // deskewAngle returns the rotation to APPLY (it finds the alignment-maximising rotation directly),
  // so we use `angle` as-is — no sign flip.
  const rotation = peaked && margin >= 0.01 && Math.abs(angle) >= 0.25 ? angle : 0;

  // Confidence: how decisively the content block is smaller than the frame (a real crop), plus the
  // deskew margin. A whole-frame fallback (cropFrac ~ 1) scores near 0, signalling "no crop needed".
  const cropFrac = (crop.w * crop.h) / (w * h);
  const confidence = Math.min(1, Math.max(0, (1 - cropFrac) * 1.3 + (peaked ? margin * 0.4 : 0)));

  return {
    rotation: Number(rotation.toFixed(1)),
    crop,
    confidence: Number(confidence.toFixed(3)),
  };
}

/**
 * Deskew estimate: the rotation whose combined row+column projection profile of the band signal is
 * most peaked (max variance of a lightly smoothed projection). Gels are straight when their lanes and
 * bands align with the axes, which maximises both the per-row and per-column projection variance.
 *
 * The search is coarse-to-fine over a small range around 0°. Returns the measured tilt `angle`, the
 * score margin of the best angle over 0°, and whether the best angle is a clear LOCAL maximum (not a
 * search-edge artefact) — callers gate on `peaked` so a flat/ambiguous profile never forces a rotation.
 */
export function deskewAngle(plane: Plane, polarity: Polarity = 'dark', range = 8, steps = 32): { angle: number; margin: number; peaked: boolean } {
  const w = plane.width, h = plane.height;
  if (w < 16 || h < 16) return { angle: 0, margin: 0, peaked: false };

  // Band signal: high where there is ink. For a dark gel (light bg) ink is dark pixels (1 - v);
  // for a light gel (dark bg) ink is bright pixels (v).
  const sig = (v: number): number => (Number.isNaN(v) ? 0 : (polarity === 'dark' ? 1 - v : v));

  // Combined projection score at a candidate rotation: variance of the per-row and per-column
  // band-signal means, dimension-normalised so the two axes are comparable.
  const project = (deg: number): { score: number; rowVar: number; colVar: number } => {
    const rad = deg * Math.PI / 180;
    const cs = Math.cos(rad), sn = Math.sin(rad);
    const rowStep = Math.max(1, Math.floor(h / 72));
    const colStep = Math.max(1, Math.floor(w / 72));
    const rowSums = new Float64Array(h), rowCnt = new Float64Array(h);
    const colSums = new Float64Array(w), colCnt = new Float64Array(w);
    for (let y = 0; y < h; y += rowStep) {
      for (let x = 0; x < w; x += colStep) {
        const v = sampleBilinear(plane, x, y);
        if (Number.isNaN(v)) continue;
        const s = sig(v);
        // Map the pixel to its coordinates after a test rotation by `deg` about the centre.
        const dx = x - w / 2, dy = y - h / 2;
        const rx = dx * cs - dy * sn + w / 2;
        const ry = dx * sn + dy * cs + h / 2;
        const r = Math.round(ry), c = Math.round(rx);
        if (r >= 0 && r < h) { rowSums[r]! += s; rowCnt[r]! += 1; }
        if (c >= 0 && c < w) { colSums[c]! += s; colCnt[c]! += 1; }
      }
    }
    const rowProf = new Float32Array(h), colProf = new Float32Array(w);
    for (let i = 0; i < h; i++) rowProf[i] = rowCnt[i]! > 0 ? rowSums[i]! / rowCnt[i]! : 0;
    for (let j = 0; j < w; j++) colProf[j] = colCnt[j]! > 0 ? colSums[j]! / colCnt[j]! : 0;
    // Light box smoothing (±2 bins) to suppress single-pixel jitter.
    const smooth = (a: Float32Array): Float32Array => {
      const b = new Float32Array(a.length);
      for (let i = 0; i < a.length; i++) {
        let sum = 0, k = 0;
        for (let j = Math.max(0, i - 2); j <= Math.min(a.length - 1, i + 2); j++) { sum += a[j]!; k++; }
        b[i] = sum / k;
      }
      return b;
    };
    const variance = (a: Float32Array): number => {
      const m = a.reduce((x, y) => x + y, 0) / a.length;
      return a.reduce((x, y) => x + (y - m) * (y - m), 0) / a.length;
    };
    const rowVar = variance(smooth(rowProf)) * h;
    const colVar = variance(smooth(colProf)) * w;
    return { score: rowVar + colVar, rowVar, colVar };
  };

  const base = project(0);
  const baseScore = base.score;

  let bestAngle = 0, bestScore = baseScore;
  // Coarse pass.
  const coarse: number[] = [];
  for (let i = 0; i <= steps; i++) {
    const deg = -range + (2 * range * i) / steps;
    coarse.push(deg);
    const p = project(deg);
    if (p.score > bestScore) { bestScore = p.score; bestAngle = deg; }
  }
  // Fine pass around the coarse winner.
  const lo = Math.max(-range, bestAngle - 0.6), hi = Math.min(range, bestAngle + 0.6);
  let prevScore = 0, nextScore = 0, fineBest = bestAngle;
  for (let i = 0; i <= 24; i++) {
    const deg = lo + ((hi - lo) * i) / 24;
    const p = project(deg);
    if (p.score > bestScore) { bestScore = p.score; fineBest = deg; }
  }
  bestAngle = fineBest;
  // Local-maximum check: the best must beat both neighbours and the un-rotated baseline.
  const step = (hi - lo) / 24;
  const left = project(bestAngle - step), right = project(bestAngle + step);
  prevScore = left.score; nextScore = right.score;
  const peaked = bestScore > prevScore && bestScore > nextScore && bestScore > baseScore;

  const margin = baseScore > 0 ? (bestScore - baseScore) / baseScore : 0;
  return { angle: Number(bestAngle.toFixed(2)), margin: Number(margin.toFixed(4)), peaked };
}

