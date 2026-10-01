import type { Science } from '@/app/components/SciencePanel';

export const SCIENCE: Science = {
  title: 'Bland–Altman method comparison: bias and 95% limits of agreement',
  formulas: [
    'dᵢ = Aᵢ − Bᵢ ; Difference of each pair (method A minus method B); x-axis is the pair mean (Aᵢ + Bᵢ)/2',
    'bias = d̄ = Σdᵢ / n ; Mean difference',
    's = √[Σ(dᵢ − d̄)² / (n − 1)] ; Standard deviation of the differences',
    'Limits of agreement = d̄ ± 1.96 s ; About 95% of differences are expected between these limits if they are roughly normal',
    'CI(bias) = d̄ ± t(0.975, n − 1) · s/√n ; SE(bias) = s/√n',
    'CI(limit) = limit ± t(0.975, n − 1) · s √(1/n + 1.96²/(2(n − 1))) ; Approximate SE of each limit (Bland & Altman 1999)',
    'Percent variant: dᵢ = 100 (Aᵢ − Bᵢ) / ((Aᵢ + Bᵢ)/2) ; Differences relative to the pair mean',
    'Log variant: dᵢ = ln Aᵢ − ln Bᵢ, back-transformed with exp() ; Bias and limits are then ratios A/B (e.g. 1.05 means A reads 5% higher)',
    'Proportional bias: dᵢ = a + b·mᵢ by least squares, t = b / SE(b), df = n − 2 ; Two-sided p-value for b ≠ 0, with mᵢ the pair mean',
  ],
  assumptions: [
    'Each row is the same sample measured once by both methods; pairs are independent of each other. Repeated measurements on the same subject need a different (repeated-measures) method.',
    'The differences are roughly normally distributed and their spread does not depend on the size of the measurement. If the spread grows with the mean, use the percent or log-transformed variant.',
    'The limits of agreement describe how far apart two methods can be; whether that is acceptable is a scientific or clinical decision that must be set beforehand. Neither a small bias nor a significant slope test proves agreement.',
    'The confidence intervals use the approximate standard errors of Bland & Altman (1999) and are imprecise with few pairs. Twenty pairs or fewer gives very wide intervals around the limits.',
    'The proportional-bias test is an ordinary regression of the difference on the pair mean. It has little power with few pairs, so a non-significant slope does not rule out proportional bias.',
    'The log variant needs strictly positive measurements; the percent variant needs a non-zero mean for every pair.',
  ],
  references: [
    { text: 'Bland JM, Altman DG. Statistical methods for assessing agreement between two methods of clinical measurement. Lancet 1986;327:307-310.', url: 'https://doi.org/10.1016/S0140-6736(86)90837-8' },
    { text: 'Bland JM, Altman DG. Measuring agreement in method comparison studies. Stat Methods Med Res 1999;8:135-160.', url: 'https://doi.org/10.1177/096228029900800204' },
  ],
  verified: '2026-09-30 (hand-computed fixtures, tabulated t critical values)',
};
