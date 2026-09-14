import { describe, expect, it } from 'vitest';
import {
  calculateDyeLabeling,
  correctA280ForScatter,
  fitLogScatter,
  parseSpectrum,
} from '@/core/chromatography';

describe('UV-Vis spectra', () => {
  it('fits a known inverse-square scattering signal and extrapolates it to A280', () => {
    const fit = fitLogScatter([
      { wavelengthNm: 300, absorbance: 1 / 300 ** 2 },
      { wavelengthNm: 320, absorbance: 1 / 320 ** 2 },
      { wavelengthNm: 340, absorbance: 1 / 340 ** 2 },
    ], 300, 340);

    expect(fit.slope).toBeCloseTo(-2, 6);
    expect(correctA280ForScatter(1, fit).correctedA280).toBeGreaterThan(1);
  });

  it('uses the requested log-space subtraction for the A280 adjustment', () => {
    const fit = fitLogScatter([
      { wavelengthNm: 300, absorbance: 0.3 },
      { wavelengthNm: 320, absorbance: 0.25 },
      { wavelengthNm: 340, absorbance: 0.22 },
    ]);

    const correction = correctA280ForScatter(1, fit);
    const expected = 10 ** (Math.log10(1) - (fit.slope! * Math.log10(280) + fit.intercept!));

    expect(correction.predictedScatterLogA280).toBeCloseTo(fit.slope! * Math.log10(280) + fit.intercept!, 10);
    expect(correction.correctedA280).toBeCloseTo(expected, 10);
  });

  it('calculates DOL from user-supplied manufacturer coefficients', () => {
    const result = calculateDyeLabeling({
      a280: 0.8,
      dyeAbsorbance: 0.4,
      dyeEpsilon: 100000,
      correctionFactor280: 0.1,
      proteinEpsilon: 50000,
      pathCm: 1,
    });

    expect(result).toMatchObject({ status: 'derived', proteinA280: 0.76 });
    // (0.4 / 100000) / ((0.8 - 0.1 * 0.4) / 50000)
    expect(result.dol).toBeCloseTo(0.2632, 4);
  });

  it('parses TSV spectra and retains the first measurement at duplicate wavelengths', () => {
    const parsed = parseSpectrum('Wavelength (nm)\tAbsorbance\tSample ID\n280\t0.8\tA\n300\t0.2\tA\n300\t0.3\tA\n');

    expect(parsed.points).toEqual([
      { wavelengthNm: 280, absorbance: 0.8 },
      { wavelengthNm: 300, absorbance: 0.2 },
    ]);
    expect(parsed.notices).toContain('Row 4: duplicate wavelength 300 skipped.');
  });

  it('requires an ascending finite range and excludes nonpositive fit points', () => {
    expect(() => fitLogScatter([], 340, 300)).toThrow('Scatter fit bounds must be finite and ascending.');

    const fit = fitLogScatter([
      { wavelengthNm: 300, absorbance: 0 },
      { wavelengthNm: 320, absorbance: -0.1 },
      { wavelengthNm: 340, absorbance: 0.2 },
    ], 300, 340);

    expect(fit.pointCount).toBe(1);
    expect(fit.warnings).toContain('Two or more positive finite points are required for a scatter fit.');
    expect(fit.warnings).toContain('Excluded 2 nonpositive or nonfinite point(s) from the scatter fit.');
  });

  it('does not apply scatter correction unless it is explicitly supplied to the DOL calculation', () => {
    const withoutScatter = calculateDyeLabeling({
      a280: 0.8,
      dyeAbsorbance: 0.4,
      dyeEpsilon: 100000,
      correctionFactor280: 0,
      proteinEpsilon: 50000,
      pathCm: 1,
    });
    const scatterFit = fitLogScatter([
      { wavelengthNm: 300, absorbance: 1 / 300 ** 2 },
      { wavelengthNm: 320, absorbance: 1 / 320 ** 2 },
      { wavelengthNm: 340, absorbance: 1 / 340 ** 2 },
    ], 300, 340);
    const withScatter = calculateDyeLabeling({
      a280: 0.8,
      dyeAbsorbance: 0.4,
      dyeEpsilon: 100000,
      correctionFactor280: 0,
      proteinEpsilon: 50000,
      pathCm: 1,
      scatterFit,
    });

    expect(withoutScatter.a280AfterScatter).toBe(0.8);
    expect(withScatter.a280AfterScatter).toBeGreaterThan(0.8);
    expect(withScatter.dol).toBeLessThan(withoutScatter.dol!);
  });

  it('blocks DOL when input is nonpositive or its corrected protein A280 is nonpositive', () => {
    const invalid = calculateDyeLabeling({
      a280: 0,
      dyeAbsorbance: 0.4,
      dyeEpsilon: 100000,
      correctionFactor280: 0.1,
      proteinEpsilon: 50000,
      pathCm: 1,
    });
    const correctedAway = calculateDyeLabeling({
      a280: 0.02,
      dyeAbsorbance: 0.4,
      dyeEpsilon: 100000,
      correctionFactor280: 0.1,
      proteinEpsilon: 50000,
      pathCm: 1,
    });

    expect(invalid).toMatchObject({ status: 'blocked' });
    expect(invalid.blockers).toContain('a280');
    expect(correctedAway).toMatchObject({ status: 'blocked' });
    expect(correctedAway.blockers).toContain('proteinA280');
  });
});
