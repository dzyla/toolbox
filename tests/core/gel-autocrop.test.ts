import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { transformPlane, suggestGelCropAndTilt, contentCropBox, deskewAngle, type Plane } from '@/core/gel';

function loadFixture(): Plane {
  const f32 = readFileSync(join(__dirname, '../fixtures/serum-prec.f32'));
  const data = new Float32Array(f32.buffer, f32.byteOffset, f32.byteLength / 4);
  const meta = JSON.parse(readFileSync(join(__dirname, '../fixtures/serum-prec.json'), 'utf8'));
  return { width: meta.width, height: meta.height, data };
}

// A clean gel: light background, dark vertical lanes + dark horizontal bands.
function makeGel(w = 200, h = 300): Plane {
  const data = new Float32Array(w * h).fill(0.88);
  for (let x = 0; x < w; x++) for (let y = 0; y < h; y++) {
    let v = 0.88;
    if (Math.sin((x / w) * Math.PI * 6) > 0.5) v = 0.45;
    if (Math.sin((y / h) * Math.PI * 9) > 0.4) v = 0.4;
    data[y * w + x] = v;
  }
  return { width: w, height: h, data };
}

// Row-projection variance (high = bands aligned to rows = gel is straight).
function rowVar(p: Plane): number {
  const prof = new Float64Array(p.height); let mean = 0;
  for (let y = 0; y < p.height; y++) { let s = 0; for (let x = 0; x < p.width; x++) s += p.data[y * p.width + x]!; prof[y] = s / p.width; mean += prof[y]!; }
  mean /= p.height; let v = 0; for (let y = 0; y < p.height; y++) v += (prof[y]! - mean) ** 2;
  return v / p.height;
}

describe('auto-crop & tilt (transform core)', () => {
  it('crops the gel body, not a text blob, on the real serum sample fixture', () => {
    const p = loadFixture();
    const sug = suggestGelCropAndTilt(p, 'dark');
    // The gel occupies the central bulk of the frame; a text-blob crop would be a small fraction.
    const frac = (sug.crop.w * sug.crop.h) / (p.width * p.height);
    expect(frac).toBeGreaterThan(0.5);
    expect(sug.crop.w).toBeGreaterThan(p.width * 0.55);
    expect(sug.crop.h).toBeGreaterThan(p.height * 0.55);
    expect(sug.confidence).toBeGreaterThan(0.1);
  }, 60000);

  it('contentCropBox finds the central gel block on the real fixture', () => {
    const p = loadFixture();
    const box = contentCropBox(p, 'dark');
    expect(box).not.toBeNull();
    // The gel is a large central block: it spans most of the frame, not a tiny text blob.
    expect(box!.w).toBeGreaterThan(p.width * 0.5);
    expect(box!.h).toBeGreaterThan(p.height * 0.5);
    // Its centre sits near the frame centre.
    const cx = box!.x + box!.w / 2;
    const cy = box!.y + box!.h / 2;
    expect(Math.abs(cx - p.width / 2)).toBeLessThan(p.width * 0.25);
    expect(Math.abs(cy - p.height / 2)).toBeLessThan(p.height * 0.25);
  }, 60000);

  it('suggests a rotation that straightens a tilted gel (correct sign)', () => {
    const base = makeGel();
    for (const tilt of [4, -4, 6, -6]) {
      const tilted = transformPlane(base, { rotation: tilt, flipH: false, flipV: false });
      const sug = suggestGelCropAndTilt(tilted, 'dark');
      const applied = transformPlane(tilted, { rotation: sug.rotation, flipH: false, flipV: false });
      expect(rowVar(applied)).toBeGreaterThan(rowVar(tilted));
    }
  }, 120000);

  it('does not rotate a flat/noisy image (peaked gate)', () => {
    // A uniform image has no structure: deskew should not report a peaked winner.
    const flat: Plane = { width: 120, height: 120, data: new Float32Array(120 * 120).fill(0.85) };
    const d = deskewAngle(flat, 'dark');
    expect(d.peaked).toBe(false);
    const sug = suggestGelCropAndTilt(flat, 'dark');
    expect(sug.rotation).toBe(0);
  }, 30000);
});
