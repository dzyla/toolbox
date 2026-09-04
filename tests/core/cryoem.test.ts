import { describe, it, expect } from 'vitest';
import {
  nyquist, boxWidth, isGoodBox, nextGoodBox, requiredBoxForNyquist,
  cropBoxForBin, binnedPixelSize, compareBoxes,
  dosePerFrame, totalDose, dosePlan, exposureForDose,
  pixelSizeFromMag, magFromPixelSize, CryoEmError,
  relativisticWavelength, waveAberration, ctfValue, firstCtfZero,
  generateCtfProfile, generateThonRingsMatrix,
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

describe('CTF and Thon rings physics', () => {
  it('computes relativistic electron de Broglie wavelengths accurately', () => {
    // 300 kV (Titan Krios) ~ 0.019687 Å
    expect(relativisticWavelength(300)).toBeCloseTo(0.019687, 4);
    // 200 kV (Talos Arctica / Glacios) ~ 0.025079 Å
    expect(relativisticWavelength(200)).toBeCloseTo(0.025079, 4);
    // 100 kV ~ 0.037014 Å
    expect(relativisticWavelength(100)).toBeCloseTo(0.037014, 4);
  });

  it('computes wave aberration and CTF values with envelope decay', () => {
    const lambdaA = relativisticWavelength(300);
    const dfA = 15000; // 1.5 µm underfocus
    const csA = 2.7 * 1e7; // 2.7 mm
    const s = 0.1; // 10 Å resolution

    const chi = waveAberration(s, dfA, csA, lambdaA);
    expect(Number.isFinite(chi)).toBe(true);

    const ctf = ctfValue(s, dfA, csA, lambdaA, 0.07, 50);
    expect(ctf).toBeGreaterThanOrEqual(-1);
    expect(ctf).toBeLessThanOrEqual(1);
  });

  it('determines first CTF zero correctly', () => {
    // For 1.5 µm underfocus at 300 kV (lambda ~ 0.019687 Å):
    // d1 ≈ sqrt(lambda * df) = sqrt(0.019687 * 15000) = sqrt(295.3) ≈ 17.18 Å
    const zero = firstCtfZero(1.5, 300, 2.7, 0.07);
    expect(zero.d1).toBeGreaterThan(15);
    expect(zero.d1).toBeLessThan(20);
    expect(zero.s1).toBeCloseTo(1 / zero.d1, 3);
  });

  it('generates 1D CTF profile and 2D Thon rings matrix', () => {
    const profile = generateCtfProfile(300, 2.7, 1.5, 1.0, 0.07, 50, 50);
    expect(profile.length).toBe(51);
    expect(profile[0]!.s).toBe(0);
    expect(profile[profile.length - 1]!.s).toBeCloseTo(0.5, 3); // Nyquist for 1.0 Å/px

    const matrix = generateThonRingsMatrix(64, 300, 2.7, 1.5, 1.5, 0, 1.0);
    expect(matrix.length).toBe(64 * 64);
    // Center DC frequency
    expect(matrix[32 * 64 + 32]).toBeGreaterThanOrEqual(0);

    // Diffraction artifact simulations (ice and graphene oxide)
    const iceMatrix = generateThonRingsMatrix(64, 300, 2.7, 1.5, 1.5, 0, 1.0, 0.07, 50, 'ice');
    expect(iceMatrix.length).toBe(64 * 64);
    const grapheneMatrix = generateThonRingsMatrix(64, 300, 2.7, 1.5, 1.5, 0, 1.0, 0.07, 50, 'graphene');
    expect(grapheneMatrix.length).toBe(64 * 64);

    const iceProfile = generateCtfProfile(300, 2.7, 1.5, 1.0, 0.07, 50, 50, 'ice');
    const peakAt3_66 = iceProfile.find(p => p.d >= 3.6 && p.d <= 3.75);
    expect(peakAt3_66?.diffraction).toBeGreaterThan(0);
  });
});
