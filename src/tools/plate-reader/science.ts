import type { Science } from '@/app/components/SciencePanel';

export const SCIENCE: Science = {
  title: 'Microplate Reader Data Normalization, Replicate Statistics, and Outlier Analysis',
  formulas: [
    'Blank Subtraction: x_norm = x - x̄_blank',
    'Percent of Control (POC): POC (%) = 100 × (x - x̄_blank) / (x̄_pos - x̄_blank)',
    'Normalized Percent Inhibition (NPI): NPI (%) = 100 × [1 - (x - x̄_blank) / (x̄_pos - x̄_blank)]',
    'Fold Change: FC = (x - x̄_blank) / (x̄_ctrl - x̄_blank)',
    'Sample Standard Deviation: s = √[ (1 / (N - 1)) × ∑ (x_i - x̄)² ]',
    'Standard Error of the Mean: SEM = s / √N',
    'Coefficient of Variation: %CV = (s / |x̄|) × 100',
    'Grubbs Outlier Statistic: G = max|x_i - x̄| / s  (reject H0 if G > [(N - 1) / √N] × √[t² / (N - 2 + t²)])',
    'Screening Z\'-Factor: Z\' = 1 - [3(s_pos + s_neg) / |x̄_pos - x̄_neg|]',
    'Signal-to-Background: S/B = x̄_pos / x̄_neg  |  Signal-to-Noise: S/N = |x̄_pos - x̄_neg| / s_neg',
  ],
  assumptions: [
    'Replicate measurements within each well group are assumed to follow a normal (Gaussian) distribution for Grubbs\' test and standard parametric variance calculations.',
    'Background and optical path length variability are assumed to be uniform across the plate, or corrected using dedicated row/column blank references to mitigate spatial drift.',
    'Z\'-factor ≥ 0.5 defines an excellent high-throughput screening (HTS) window capable of robust single-replicate active hit separation (Zhang et al. 1999).',
    'Replicate variability with %CV ≤ 15% is standard bioassay quality control acceptance threshold in ELISA, luminescence, and cytotoxicity assays.',
  ],
  references: [
    {
      text: 'Birmingham A et al. (2009) Statistical methods for analysis of high-throughput RNA interference screens. Nat Methods 6:569-575.',
      url: 'https://doi.org/10.1038/nmeth.1351',
    },
    {
      text: 'Malo N et al. (2006) Statistical practice in high-throughput screening data analysis. Nat Biotechnol 24:167-175.',
      url: 'https://doi.org/10.1038/nbt1186',
    },
    {
      text: 'Zhang JH, Chung TD, Oldenburg KR (1999) A Simple Statistical Parameter for Use in Evaluation and Validation of High Throughput Screening Assays. J Biomol Screen 4:67-73.',
      url: 'https://doi.org/10.1177/108705719900400206',
    },
    {
      text: 'ASTM E178-02 Standard Practice for Dealing With Outlying Observations. ASTM International, West Conshohocken, PA.',
      url: 'https://www.astm.org/e0178-02.html',
    },
  ],
  verified: '2026-09-05',
};
