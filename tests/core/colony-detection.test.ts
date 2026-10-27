import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import jpeg from 'jpeg-js';
import { detectColonies, detectPetriDishBoundary, type RgbaImage } from '@/core/counting';

/** Synthetic plate photo: agar disc, darker rim ring, round colonies (dark or light), a marker stroke. */
function plate(size: number, colonies: Array<{ x: number; y: number; r: number }>, opts: { colony?: number; stroke?: boolean } = {}): RgbaImage {
  const data = new Uint8ClampedArray(size * size * 4);
  const c = size / 2, R = size * 0.46;
  let seed = 7;
  const noise = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return (seed % 7) - 3; };
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x - c, y - c);
      let v = 40;                                          // background outside the dish
      if (d <= R) v = 180 - 30 * (x / size);               // agar, unevenly lit
      if (d > R - 3 && d <= R) v = 120;                    // plastic rim
      if (opts.stroke && Math.abs(y - (x - 40)) < 2 && x > 70 && x < 130 && d < R) v = 20; // marker pen
      // Colonies are domed: full contrast at the centre, fading to the agar at the edge.
      for (const col of colonies) {
        const dc = Math.hypot(x - col.x, y - col.y);
        if (dc <= col.r) v += ((opts.colony ?? 70) - v) * Math.sqrt(1 - (dc / col.r) ** 2);
      }
      const i = (y * size + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = Math.max(0, Math.min(255, v + noise())); data[i + 3] = 255;
    }
  }
  return { data, width: size, height: size };
}

const COLONIES = [
  { x: 90, y: 100, r: 6 }, { x: 150, y: 110, r: 6 }, { x: 110, y: 160, r: 6 }, { x: 160, y: 170, r: 6 },
  { x: 120, y: 80, r: 6 }, { x: 175, y: 135, r: 6 }, { x: 85, y: 140, r: 6 },
];

describe('petri dish and colony detection on a synthetic plate', () => {
  const img = plate(256, COLONIES);

  it('finds the dish centre and radius close to the drawn disc', () => {
    const b = detectPetriDishBoundary(img);
    expect(Math.abs(b.cx - 128)).toBeLessThan(4);
    expect(Math.abs(b.cy - 128)).toBeLessThan(4);
    expect(Math.abs(b.radius - 256 * 0.46)).toBeLessThan(6);
  });

  it('detects each drawn colony once, inside it, and nothing else (dark colonies)', () => {
    const { colonies, polarity } = detectColonies(img);
    expect(polarity).toBe('dark');
    expect(colonies).toHaveLength(COLONIES.length);
    for (const col of COLONIES) expect(Math.min(...colonies.map(f => Math.hypot(f.x - col.x, f.y - col.y)))).toBeLessThan(col.r);
  });

  it('light colonies on darker agar are found the same way', () => {
    const { colonies, polarity } = detectColonies(plate(256, COLONIES, { colony: 235 }));
    expect(polarity).toBe('light');
    expect(colonies).toHaveLength(COLONIES.length);
  });

  it('two touching colonies count as two', () => {
    const pair = [{ x: 110, y: 128, r: 6 }, { x: 122, y: 128, r: 6 }, ...COLONIES.slice(3)];
    expect(detectColonies(plate(256, pair)).colonies).toHaveLength(pair.length);
  });

  it('a marker-pen stroke is not a colony', () => {
    expect(detectColonies(plate(256, COLONIES, { stroke: true })).colonies).toHaveLength(COLONIES.length);
  });

  it('returns no colonies on an empty plate', () => {
    expect(detectColonies(plate(256, [])).colonies).toEqual([]);
  });

  it('honours an explicit dish, so colonies outside it are ignored', () => {
    // A 45 px circle around (100, 110) holds the colonies at (90, 100), (120, 80) and (85, 140).
    const { colonies } = detectColonies(img, { dish: { cx: 100, cy: 110, radius: 45 }, edgeMargin: 0, colonyDiameter: 12 });
    expect(colonies).toHaveLength(3);
  });
});

describe('a real plate photo (white colonies on clear agar, marker writing, lid reflections)', () => {
  const file = readFileSync(join(__dirname, '..', 'fixtures', 'colonies', 'white-on-clear-1200.jpg'));
  const img = jpeg.decode(file, { useTArray: true });

  it('finds the dish rim, not the image frame', () => {
    const b = detectPetriDishBoundary(img);
    expect(Math.abs(b.cx - 614)).toBeLessThan(10);
    expect(Math.abs(b.cy - 424)).toBeLessThan(10);
    expect(Math.abs(b.radius - 400)).toBeLessThan(10);
  });

  it('counts the sharp colonies (about 190), and nothing on the marker "B" or the rim', () => {
    const r = detectColonies(img);
    expect(r.polarity).toBe('light');
    expect(r.colonies.length).toBeGreaterThan(170);
    expect(r.colonies.length).toBeLessThan(205);
    // Inside the loops of the written "B" (x 605–690, y 615–745) there are no colonies.
    expect(r.colonies.filter(c => c.x > 615 && c.x < 680 && c.y > 625 && c.y < 690)).toHaveLength(0);
    // Nothing on the plastic rim (outside the searched circle).
    expect(r.colonies.every(c => Math.hypot(c.x - r.dish.cx, c.y - r.dish.cy) <= r.searchRadius)).toBe(true);
  });

  it('sensitivity orders the counts: fewer when strict, more when lenient', () => {
    const strict = detectColonies(img, { sensitivity: 0.2 }).colonies.length;
    const lenient = detectColonies(img, { sensitivity: 0.8 }).colonies.length;
    expect(strict).toBeLessThan(lenient);
  });
});
