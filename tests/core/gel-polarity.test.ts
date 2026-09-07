import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { detectPolarity, contentCropBox, suggestGelCropAndTilt, type Plane } from '@/core/gel';
import { demoGel, renderSyntheticGel } from '@/core/gel/synthetic';

function load(f = 'serum-prec'): Plane {
  const f32 = readFileSync(join(__dirname, '../fixtures', `${f}.f32`));
  const data = new Float32Array(f32.buffer, f32.byteOffset, f32.byteLength / 4);
  const meta = JSON.parse(readFileSync(join(__dirname, '../fixtures', `${f}.json`), 'utf8'));
  return { width: meta.width, height: meta.height, data };
}

// Signal-space gel: bands are ADDED to the background; the renderer inverts for 'dark'.
function syntheticGel(polarity: 'dark' | 'light'): Plane {
  const W = 240, H = 320;
  const { plane } = renderSyntheticGel({
    width: W, height: H,
    lanes: [40, 90, 140, 190].map((x, i) => ({ x, width: 30, bands: [
      { y: 80, sigma: 4, amplitude: 0.5 }, { y: 180 + i * 6, sigma: 4, amplitude: 0.4 }, { y: 250, sigma: 4, amplitude: 0.3 },
    ] })),
    backgroundTop: 0.05, backgroundBottom: 0.2, noise: 0.01, polarity, seed: 3,
  });
  return plane;
}

describe('polarity detection (border-plate based)', () => {
  it('detects the polarity of the real serum image as dark', () => {
    // Dark-band gel on a near-white background plate (border median ~0.98).
    expect(detectPolarity(load('serum-prec'))).toBe('dark');
  }, 60000);

  it('detects the demo gel and both synthetic polarities', () => {
    expect(detectPolarity(demoGel().plane)).toBe('dark');
    expect(detectPolarity(syntheticGel('dark'))).toBe('dark');
    expect(detectPolarity(syntheticGel('light'))).toBe('light');
  }, 30000);

  it('with the correct polarity the real image crops to the gel body, not the full frame', () => {
    const p = load('serum-prec');
    const sug = suggestGelCropAndTilt(p, detectPolarity(p));
    const frac = (sug.crop.w * sug.crop.h) / (p.width * p.height);
    // A real crop: clearly smaller than the frame and still a large central block.
    expect(frac).toBeGreaterThan(0.3);
    expect(frac).toBeLessThan(0.95);
    const box = contentCropBox(p, 'dark');
    expect(box).not.toBeNull();
    expect(box!.w).toBeGreaterThan(p.width * 0.5);
    expect(box!.h).toBeGreaterThan(p.height * 0.5);
  }, 60000);
});
