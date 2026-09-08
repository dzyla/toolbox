import type { Science } from '@/app/components/SciencePanel';

export const SCIENCE: Science = {
  title: 'qPCR / RT-qPCR Quantification and Relative Expression',
  formulas: [
    'Amplification efficiency: E = 10^(−1/slope) − 1; calculated from the slope of a log10(template amount) versus Cq standard curve',
    'Efficiency acceptance: 90–110% efficiency corresponds to a standard-curve slope of approximately −3.58 to −3.10',
    'Within-sample normalization: ΔCq = Cq(target) − Cq(reference)',
    'Comparative Cq: ΔΔCq = ΔCq(sample) − ΔCq(calibrator)',
    'Relative expression (comparative Cq): fold change = 2^(−ΔΔCq); valid when target and reference amplification efficiencies are approximately equal',
    'Pfaffl relative expression ratio = (1 + E_target)^(Cq_target,calibrator − Cq_target,sample) / (1 + E_reference)^(Cq_reference,calibrator − Cq_reference,sample); accommodates unequal, assay-specific efficiencies',
  ],
  assumptions: [
    'Cq is called during the exponential amplification phase after a consistent thresholding method; baseline, threshold, and Cq settings must be reported and applied consistently.',
    'No-template controls are negative and reverse-transcription minus controls are used where genomic DNA contamination is plausible.',
    'Reference genes are stable across the experimental conditions. Multiple validated reference genes are preferable to a single unvalidated normalizer.',
    'Technical replicates represent the same biological material and should be assessed for agreement before averaging; biological replicates are required for biological inference.',
    'The 2^(−ΔΔCq) method assumes matched target and reference efficiencies. Use standard curves or the efficiency-corrected Pfaffl method when this assumption is not met.',
  ],
  references: [
    {
      text: 'Bustin SA et al. (2009) The MIQE Guidelines: Minimum Information for Publication of Quantitative Real-Time PCR Experiments. Clin Chem 55(4):611–622.',
      url: 'https://doi.org/10.1373/clinchem.2008.112797',
    },
    {
      text: 'Livak KJ, Schmittgen TD (2001) Analysis of Relative Gene Expression Data Using Real-Time Quantitative PCR and the 2^(−ΔΔCT) Method. Methods 25(4):402–408.',
      url: 'https://doi.org/10.1006/meth.2001.1262',
    },
    {
      text: 'Pfaffl MW (2001) A new mathematical model for relative quantification in real-time RT-PCR. Nucleic Acids Res 29(9):e45.',
      url: 'https://doi.org/10.1093/nar/29.9.e45',
    },
  ],
  verified: '2026-09-07',
};
