import type { Science } from '@/app/components/SciencePanel';

export const SCIENCE: Science = {
  title: 'Gel and blot densitometry and molecular-weight calibration',
  formulas: [
    'Signal: S = 1 − I/Imax for dark bands on light background; S = I/Imax for fluorescent/chemiluminescent light bands on dark',
    'Net band intensity: Inet = Σ (S(x, y) − B(y)) over the band region [y0, y1] × [x0, x1]',
    'Percent of lane: % = 100 × max(0, Inet) / Σ max(0, Inet,j) over all bands in the lane',
    'Normalised ratio: R = Inet / Iref (relative to reference band or loading control)',
    'Log-linear calibration: log10(MW) = intercept + slope · y (Weber & Osborn 1969)',
    'Natural cubic spline: piecewise cubic S_i(y) with continuous 1st and 2nd derivatives, S\'\'(y0) = S\'\'(yn) = 0',
    'Rolling-ball baseline: B = opening(profile, radius) = maxFilter(minFilter(profile, r), r) (Sternberg 1983)',
    'Valley-to-valley baseline: linear interpolation of profile between band boundary minima',
  ],
  assumptions: [
    'Quantification is valid only within the detector linear dynamic range. Saturation warning is triggered if > 1 % of pixels in a band are clipped at 0 or 255 (or bit-depth limits).',
    'Gel quantification is strictly relative: comparing band intensities is meaningful only within the same gel or blot under identical imaging conditions.',
    'Molecular weight calibration assumes constant electric field and uniform gel percentage. Extrapolation beyond the highest and lowest ladder standards should be interpreted with caution.',
    'Image adjustments (brightness, contrast, gamma, display inversion) affect screen presentation only; all densitometry calculations operate on raw image pixels.',
  ],
  references: [
    { text: 'Weber K, Osborn M (1969) The reliability of molecular weight determinations by dodecyl sulfate-polyacrylamide gel electrophoresis. J Biol Chem 244:4406–4412', url: 'https://doi.org/10.1016/S0021-9258(18)94333-4' },
    { text: 'Helling RB, Goodman HM, Boyer HW (1974) Analysis of endonuclease R·EcoRI fragments of DNA from lambdoid bacteriophages and other viruses by agarose-gel electrophoresis. J Virol 14:1235–1244', url: 'https://doi.org/10.1128/jvi.14.5.1235-1244.1974' },
    { text: 'Sternberg SR (1983) Biomedical image processing. Computer 16(1):22–34 (morphological opening / rolling ball baseline)', url: 'https://doi.org/10.1109/MC.1983.1654163' },
    { text: 'Gassmann M, Grenacher B, Rohde B, Vogel J (2009) Quantifying Western blots: pitfalls of densitometry. Electrophoresis 30:1845–1855', url: 'https://doi.org/10.1002/elps.200800720' },
  ],
  verified: '2026-09-03',
};
