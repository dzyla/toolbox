import { describe, expect, it } from 'vitest';
import { autoDetectColonies, detectPetriDishBoundary } from '@/core/counting';

/** Synthetic plate photo: bright agar disc, darker rim ring, and dark round colonies. */
function plate(size: number, colonies: Array<{ x: number; y: number; r: number }>) {
  const data = new Uint8ClampedArray(size * size * 4);
  const c = size / 2, R = size * 0.46;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x - c, y - c);
      let v = 40; // background outside the dish
      if (d <= R) v = 215; // agar
      if (d > R - 3 && d <= R) v = 120; // plastic rim
      for (const col of colonies) if (Math.hypot(x - col.x, y - col.y) <= col.r) v = 70;
      const i = (y * size + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = v; data[i + 3] = 255;
    }
  }
  return { data, width: size, height: size, colorSpace: 'srgb' } as unknown as ImageData;
}

describe('petri dish and colony detection on a synthetic plate', () => {
  const colonies = [{ x: 90, y: 100, r: 6 }, { x: 150, y: 110, r: 5 }, { x: 110, y: 160, r: 7 }, { x: 160, y: 170, r: 5 }];
  const img = plate(256, colonies);

  it('finds the dish centre and radius close to the drawn disc', () => {
    const b = detectPetriDishBoundary(img);
    expect(Math.abs(b.cx - 128)).toBeLessThan(8);
    expect(Math.abs(b.cy - 128)).toBeLessThan(8);
    expect(Math.abs(b.radius - 256 * 0.46)).toBeLessThan(14);
  });

  it('detects each drawn colony once, near its true centre, and nothing else', () => {
    const found = autoDetectColonies(img, { minRadius: 3, maxRadius: 12 });
    expect(found.length).toBe(colonies.length);
    for (const col of colonies) {
      const nearest = Math.min(...found.map(f => Math.hypot(f.x - col.x, f.y - col.y)));
      // The reported centre must fall inside the drawn colony.
      expect(nearest).toBeLessThan(col.r);
    }
  });

  it('returns no colonies on an empty plate', () => {
    expect(autoDetectColonies(plate(256, []), { minRadius: 3, maxRadius: 12 })).toEqual([]);
  });

  it('honours an explicit dish so colonies outside it are ignored', () => {
    const found = autoDetectColonies(img, { minRadius: 3, maxRadius: 12, dishCenterX: 90, dishCenterY: 100, dishRadius: 20 });
    expect(found.length).toBe(1);
  });
});
