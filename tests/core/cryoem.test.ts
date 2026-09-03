import { describe, it, expect } from 'vitest';
import {
  nyquist, boxWidth, isGoodBox, nextGoodBox, requiredBoxForNyquist,
  cropBoxForBin, binnedPixelSize, compareBoxes,
  dosePerFrame, totalDose, dosePlan, exposureForDose,
  pixelSizeFromMag, magFromPixelSize, CryoEmError,
} from '@/core/cryoem';

describe('cryo-em geometry and sampling', () => {
  it('computes Nyquist as 2 × pixel size', () => {
    expect(nyquist(1.0)).toBe(2.0);
    expect(nyquist(0.825)).toBe(1.65);
    expect(() => nyquist(0)).toThrow(CryoEmError);
  });

  it('computes physical box width in Ångströms', () => {
    expect(boxWidth(1.05, 256)).toBe(268.8);
  });

  it('identifies 2·3·5·7-smooth even box sizes', () => {
    expect(isGoodBox(256)).toBe(true); // 2^8
    expect(isGoodBox(300)).toBe(true); // 2^2 * 3 * 5^2
    expect(isGoodBox(384)).toBe(true); // 2^7 * 3
    expect(isGoodBox(250)).toBe(true); // 2 * 5^3
    expect(isGoodBox(254)).toBe(false); // 2 * 127
    expect(isGoodBox(257)).toBe(false); // odd
    expect(isGoodBox(0)).toBe(false);
  });

  it('finds the next good box', () => {
    expect(nextGoodBox(250)).toBe(250);
    expect(nextGoodBox(251)).toBe(252);
    expect(nextGoodBox(253)).toBe(256);
  });

  it('determines required box size for target Nyquist and binning', () => {
    // 1.0 Å/px, 400 px box -> width 400 Å. Target Nyquist 4.0 Å requires (400 * 2) / 4 = 200 px box.
    const req = requiredBoxForNyquist(1.0, 400, 4.0);
    expect(req).toBe(200);

    const binned = cropBoxForBin(400, 2);
    expect(binned).toBe(200);
    expect(binnedPixelSize(1.0, 400, 200)).toBe(2.0);

    const cmp = compareBoxes(1.0, 400, 200);
    expect(cmp.raw.nyquist).toBe(2.0);
    expect(cmp.binned.nyquist).toBe(4.0);
    expect(cmp.binned.bin).toBe(2.0);
  });
});

describe('cryo-em electron dose', () => {
  it('calculates dose per frame and total dose', () => {
    // 15 e/px/s, exposure 2s, pixel size 1.0 Å -> total dose = 30 e/Å²
    expect(totalDose(15, 2, 1.0)).toBe(30);
    expect(dosePerFrame(15, 0.05, 1.0)).toBeCloseTo(0.75, 4);
    // with 40 frames -> 0.75 e/Å²/frame
    const plan = dosePlan(15, 1.0, 2, 40);
    expect(plan.totalDose).toBe(30);
    expect(plan.dosePerFrame).toBe(0.75);
    expect(plan.frameTime).toBe(0.05);

    // Target dose 40 e/Å² at 10 e/px/s and 1 Å/px -> 4 seconds
    expect(exposureForDose(10, 1.0, 40)).toBe(4);
  });
});

describe('detector magnification and pixel size', () => {
  it('converts between physical detector pixel, magnification and pixel size in Å', () => {
    // K3: 5 µm pixel at 105,000x -> 5 * 10000 / 105000 = 0.47619 Å
    const px = pixelSizeFromMag(5, 105000);
    expect(px).toBeCloseTo(0.47619, 4);
    expect(magFromPixelSize(5, px)).toBeCloseTo(105000, 1);
  });
});
