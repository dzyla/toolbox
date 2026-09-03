import { describe, it, expect } from 'vitest';
import { apply, compose, invert, rotate, translate, rawToWorking, workingToRaw, frameSize, rotationFromLine, sampleBilinear, transformPlane, IDENTITY, type Geometry } from '@/core/gel/transform';

describe('gel transforms', () => {
  it('composes and inverts affine maps', () => {
    const m = compose(translate(10, 5), rotate(30));
    const inv = invert(m);
    const [x, y] = apply(m, 3, 4);
    const [bx, by] = apply(inv, x, y);
    expect(bx).toBeCloseTo(3, 9); expect(by).toBeCloseTo(4, 9);
    expect(apply(IDENTITY, 7, 8)).toEqual([7, 8]);
  });
  it('rotation from a dragged line straightens it', () => {
    expect(rotationFromLine(0, 0, 100, 0)).toBeCloseTo(0, 9);
    // line going down-right by 10 px over 100 px: needs a counter-clockwise rotation of ~5.7°
    expect(rotationFromLine(0, 0, 100, 10)).toBeCloseTo(-5.710593, 4);
    expect(rotationFromLine(100, 10, 0, 0)).toBeCloseTo(-5.710593, 4);
    expect(rotationFromLine(0, 0, 0, 100)).toBeCloseTo(-90, 6);
  });
  it('maps the raw image into a working frame that contains it, and back', () => {
    const g: Geometry = { rotation: 10, flipH: true, flipV: false };
    const size = frameSize(400, 300, g);
    expect(size.w).toBeGreaterThan(400); expect(size.h).toBeGreaterThan(300);
    const m = rawToWorking(400, 300, g), inv = workingToRaw(400, 300, g);
    for (const [x, y] of [[0, 0], [400, 0], [0, 300], [400, 300], [123, 45]] as const) {
      const [wx, wy] = apply(m, x, y);
      expect(wx).toBeGreaterThanOrEqual(-1e-6); expect(wy).toBeGreaterThanOrEqual(-1e-6);
      expect(wx).toBeLessThanOrEqual(size.w + 1); expect(wy).toBeLessThanOrEqual(size.h + 1);
      const [rx, ry] = apply(inv, wx, wy);
      expect(rx).toBeCloseTo(x, 8); expect(ry).toBeCloseTo(y, 8);
    }
  });
  it('flip mirrors within the frame and crop offsets the origin', () => {
    const flip = rawToWorking(100, 50, { rotation: 0, flipH: true, flipV: false });
    expect(apply(flip, 0, 10)).toEqual([100, 10]);
    const crop = rawToWorking(100, 50, { rotation: 0, flipH: false, flipV: false, crop: { x: 20, y: 5, w: 30, h: 30 } });
    expect(apply(crop, 20, 5)).toEqual([0, 0]);
    expect(frameSize(100, 50, { rotation: 0, flipH: false, flipV: false, crop: { x: 20, y: 5, w: 30, h: 30 } })).toEqual({ w: 30, h: 30 });
  });
  it('bilinear sampling interpolates and is NaN outside', () => {
    const p = { width: 2, height: 2, data: Float32Array.from([0, 1, 0, 1]) };
    expect(sampleBilinear(p, 0.5, 0.5)).toBeCloseTo(0.5, 9);
    expect(sampleBilinear(p, 0, 0)).toBe(0);
    expect(sampleBilinear(p, -1, 0)).toBeNaN();
  });
  it('resamples a plane with transformPlane (rotation and crop)', () => {
    const p = { width: 4, height: 4, data: new Float32Array(16).fill(0.5) };
    const cropped = transformPlane(p, { rotation: 0, flipH: false, flipV: false, crop: { x: 1, y: 1, w: 2, h: 2 } });
    expect(cropped.width).toBe(2);
    expect(cropped.height).toBe(2);
    expect(cropped.data[0]).toBeCloseTo(0.5, 4);
  });
});
