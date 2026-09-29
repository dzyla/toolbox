import type { Science } from '@/app/components/SciencePanel';

export const SCIENCE: Science = {
  title: 'Gel and blot densitometry and molecular-weight calibration',
  formulas: [
    'Signal: S = 1 − I/Imax for dark bands on light background; S = I/Imax for fluorescent/chemiluminescent light bands on dark',
    'Net band intensity: Inet = Σ (S(x, y) − B(y)) over the band region [y0, y1] × [x0, x1]',
    'Percent of lane: % = 100 × max(0, Inet) / Σ max(0, Inet,j) over all bands in the lane',
    'Normalised ratio: R = Inet / Iref (relative to reference band or loading control)',
    'Log-linear calibration: log10(MW) = intercept + slope · y (Weber & Osborn 1969)',
    'Calibration models: log-linear fit, piecewise-linear interpolation, or monotone cubic (piecewise cubic Hermite interpolant of log10(size) vs migration with Fritsch-Carlson slope limiting, 1980; no overshoot between ladder bands)',
    'Ladder matching: detected peaks are aligned to ladder sizes allowing missed or extra bands; score = residual SD of a quadratic (≥ 5 pairs) or linear fit of log10(size) + 0.01 per avoidable skip; any ladder band can be pinned or excluded manually',
    'Rolling-ball baseline: B = Gaussian(opening(profile, ball of radius r), σ = r/10), where the ball height is 0.1 × the profile intensity range (Sternberg 1983); shared baseline = 25th percentile across lanes per row, then opening',
    'Detection limits from mass standards: LOD = 3.3σ, LOQ = 10σ, with σ the residual SD of the mass fit (n − p degrees of freedom) (ICH Q2(R1))',
    'Group statistics: mean, sample SD (n − 1), SEM = SD/√n, t-based 95 % CI = mean ± t(0.975, n − 1) · SEM, CV = SD/mean, fold change = group mean / control mean',
    'Welch t-test vs control: t = (m1 − m2)/√(s1²/n1 + s2²/n2) with Welch-Satterthwaite df; p-values across comparisons adjusted by Holm step-down',
    'Valley-to-valley baseline: linear interpolation of profile between band boundary minima',
  ],
  assumptions: [
    'Quantification is valid only within the detector linear dynamic range. A band is flagged saturated if > 1 % of its pixels sit at the detector limits (0 or 255, or the bit-depth limits). Saturation is reported as not assessable for 32-bit float TIFFs, which are min–max rescaled on import.',
    'Gel quantification is strictly relative: comparing band intensities is meaningful only within the same gel or blot under identical imaging conditions.',
    'Molecular weight calibration assumes constant electric field and uniform gel percentage. Extrapolation beyond the highest and lowest ladder standards should be interpreted with caution.',
    'Ladder matching and the rolling-ball baseline are heuristics: check the matched ladder pairs, and increase the rolling-ball radius when bands are wider than the rolling-ball diameter (2 × radius; they are flagged), otherwise the baseline follows the band and signal is underestimated.',
    'Absolute mass from standards is reported only within the standards\' signal range: results outside it are flagged "extrapolated", results below LOQ are flagged "<LOQ", and bands without an assigned mass are excluded rather than assigned an invented value.',
    'Lanes on one blot are technical replicates (they share transfer, antibody and exposure). Treat n ≥ 3 independent biological replicates as the minimum for inference; the Welch test is offered only when both groups have n ≥ 2, and with small n the p-values and CIs are very uncertain.',
    'Image adjustments (brightness, contrast, gamma, display inversion) affect screen presentation only; all densitometry calculations operate on raw image pixels.',
  ],
  references: [
    { text: 'Weber K, Osborn M (1969) The reliability of molecular weight determinations by dodecyl sulfate-polyacrylamide gel electrophoresis. J Biol Chem 244:4406–4412', url: 'https://doi.org/10.1016/S0021-9258(18)94333-4' },
    { text: 'Helling RB, Goodman HM, Boyer HW (1974) Analysis of endonuclease R·EcoRI fragments of DNA from lambdoid bacteriophages and other viruses by agarose-gel electrophoresis. J Virol 14:1235–1244', url: 'https://doi.org/10.1128/jvi.14.5.1235-1244.1974' },
    { text: 'Fritsch FN, Carlson RE (1980) Monotone piecewise cubic interpolation. SIAM J Numer Anal 17:238–246', url: 'https://doi.org/10.1137/0717021' },
    { text: 'ICH Q2(R1) (2005) Validation of analytical procedures: text and methodology (LOD = 3.3σ/S, LOQ = 10σ/S)', url: 'https://www.ich.org/page/quality-guidelines' },
    { text: 'Welch BL (1947) The generalization of "Student\'s" problem when several different population variances are involved. Biometrika 34:28–35', url: 'https://doi.org/10.1093/biomet/34.1-2.28' },
    { text: 'Holm S (1979) A simple sequentially rejective multiple test procedure. Scand J Statist 6:65–70', url: 'https://www.jstor.org/stable/4615733' },
    { text: 'Sternberg SR (1983) Biomedical image processing. Computer 16(1):22–34 (morphological opening / rolling ball baseline)', url: 'https://doi.org/10.1109/MC.1983.1654163' },
    { text: 'Gassmann M, Grenacher B, Rohde B, Vogel J (2009) Quantifying Western blots: pitfalls of densitometry. Electrophoresis 30:1845–1855', url: 'https://doi.org/10.1002/elps.200800720' },
  ],
  verified: '2026-09-29',
};
