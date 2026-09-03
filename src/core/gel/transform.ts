/* Affine transforms between the raw image and the working frame (rotated, flipped, cropped view). */
import type { Affine, Plane } from './types';

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
