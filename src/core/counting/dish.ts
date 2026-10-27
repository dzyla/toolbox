/** Finding the petri dish in a plate photo. */

export interface DishBoundary {
  cx: number;
  cy: number;
  radius: number;
}

interface RgbaLike { width: number; height: number; data: Uint8ClampedArray | Uint8Array }

/**
 * Circle of the dish in a photo taken roughly from above (the dish contains the image centre).
 *
 * Along 72 rays from the centre, the strongest brightness steps (up to four per ray) are edge
 * candidates: the dish wall, the rim, but also marker pen and colonies. A RANSAC circle fit keeps
 * the circle that the most candidates (on different rays) agree with, refined by least squares on
 * its inliers, so writing and colonies near the rim cannot pull it off. Falls back to the largest
 * circle centred in the image when no circle is supported by at least a third of the rays.
 */
export function detectPetriDishBoundary(img: RgbaLike): DishBoundary {
  const { width: w, height: h, data } = img;
  const fallback = { cx: w / 2, cy: h / 2, radius: Math.min(w, h) / 2 };
  const lum = (x: number, y: number) => {
    const i = (Math.min(h - 1, Math.max(0, Math.round(y))) * w + Math.min(w - 1, Math.max(0, Math.round(x)))) * 4;
    return 0.299 * data[i]! + 0.587 * data[i + 1]! + 0.114 * data[i + 2]!;
  };

  const rays = 72;
  const maxR = Math.hypot(w, h) / 2;
  const step = Math.max(1, maxR / 400);
  const gap = Math.max(2, Math.round(maxR / 150));
  const points: { x: number; y: number; ray: number }[] = [];
  for (let k = 0; k < rays; k++) {
    const a = (k / rays) * 2 * Math.PI, ca = Math.cos(a), sa = Math.sin(a);
    const grads: { r: number; g: number }[] = [];
    for (let r = Math.min(w, h) * 0.15; r < maxR; r += step) {
      const x = w / 2 + r * ca, y = h / 2 + r * sa;
      if (x < 1 || y < 1 || x > w - 2 || y > h - 2) break;
      grads.push({ r, g: Math.abs(lum(x - gap * ca, y - gap * sa) - lum(x + gap * ca, y + gap * sa)) });
    }
    // Local maxima of the step, strongest first, at least `gap` apart.
    const peaks = grads.filter((p, i) => p.g > 20 && (i === 0 || p.g >= grads[i - 1]!.g) && (i === grads.length - 1 || p.g >= grads[i + 1]!.g))
      .sort((p, q) => q.g - p.g);
    const kept: number[] = [];
    for (const p of peaks) {
      if (kept.length >= 4) break;
      if (kept.every(r => Math.abs(r - p.r) > gap * 2)) kept.push(p.r);
    }
    for (const r of kept) points.push({ x: w / 2 + r * ca, y: h / 2 + r * sa, ray: k });
  }
  if (points.length < 3) return fallback;

  // Deterministic RANSAC (a fixed LCG), so the same photo always gives the same circle.
  let seed = 12345;
  const rand = (n: number) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
  const minR = Math.min(w, h) * 0.2;
  let best: { c: DishBoundary; rays: number } | null = null;
  for (let it = 0; it < 800; it++) {
    const p = points[rand(points.length)]!, q = points[rand(points.length)]!, s = points[rand(points.length)]!;
    if (p.ray === q.ray || q.ray === s.ray || p.ray === s.ray) continue;
    const c = circleThrough(p, q, s);
    if (!c || c.radius < minR || c.radius > maxR) continue;
    const tol = Math.max(2, c.radius * 0.015);
    const hit = new Set<number>();
    for (const t of points) if (Math.abs(Math.hypot(t.x - c.cx, t.y - c.cy) - c.radius) < tol) hit.add(t.ray);
    // More supporting rays wins; on a tie the larger circle (the dish edge, not an inner ring).
    if (!best || hit.size > best.rays || (hit.size === best.rays && c.radius > best.c.radius)) best = { c, rays: hit.size };
  }
  if (!best || best.rays < rays / 3) return fallback;
  const tol = Math.max(2, best.c.radius * 0.015);
  const inliers = points.filter(t => Math.abs(Math.hypot(t.x - best!.c.cx, t.y - best!.c.cy) - best!.c.radius) < tol);
  return fitCircle(inliers) ?? best.c;
}

function circleThrough(a: { x: number; y: number }, b: { x: number; y: number }, c: { x: number; y: number }): DishBoundary | null {
  const d = 2 * (a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y));
  if (Math.abs(d) < 1e-9) return null;
  const a2 = a.x * a.x + a.y * a.y, b2 = b.x * b.x + b.y * b.y, c2 = c.x * c.x + c.y * c.y;
  const cx = (a2 * (b.y - c.y) + b2 * (c.y - a.y) + c2 * (a.y - b.y)) / d;
  const cy = (a2 * (c.x - b.x) + b2 * (a.x - c.x) + c2 * (b.x - a.x)) / d;
  return { cx, cy, radius: Math.hypot(a.x - cx, a.y - cy) };
}

/** Algebraic (Kåsa) least-squares circle; null when the points are degenerate. */
function fitCircle(pts: { x: number; y: number }[]): DishBoundary | null {
  if (pts.length < 3) return null;
  let sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0, sz = 0, sxz = 0, syz = 0;
  for (const { x, y } of pts) {
    const z = x * x + y * y;
    sx += x; sy += y; sxx += x * x; syy += y * y; sxy += x * y; sz += z; sxz += x * z; syz += y * z;
  }
  const n = pts.length;
  // Solve [sxx sxy sx; sxy syy sy; sx sy n] [A B C]' = -[sxz syz sz]' for x²+y²+Ax+By+C = 0.
  const m = [[sxx, sxy, sx], [sxy, syy, sy], [sx, sy, n]];
  const v = [-sxz, -syz, -sz];
  const det3 = (a: number[][]) => a[0]![0]! * (a[1]![1]! * a[2]![2]! - a[1]![2]! * a[2]![1]!)
    - a[0]![1]! * (a[1]![0]! * a[2]![2]! - a[1]![2]! * a[2]![0]!)
    + a[0]![2]! * (a[1]![0]! * a[2]![1]! - a[1]![1]! * a[2]![0]!);
  const D = det3(m);
  if (Math.abs(D) < 1e-9) return null;
  const col = (j: number) => det3(m.map((row, i) => row.map((x, k) => (k === j ? v[i]! : x)))) / D;
  const A = col(0), B = col(1), C = col(2);
  const cx = -A / 2, cy = -B / 2, r2 = cx * cx + cy * cy - C;
  return r2 > 0 ? { cx, cy, radius: Math.sqrt(r2) } : null;
}
