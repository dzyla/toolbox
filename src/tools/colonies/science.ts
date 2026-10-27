import type { Science } from '@/app/components/SciencePanel';

export const SCIENCE: Science = {
  title: 'Colony forming units (CFU) and serial dilution plating',
  formulas: [
    'CFU/mL = (Colonies counted / Volume plated in mL) × Dilution factor',
    'Total CFU = Colonies counted × Dilution factor',
  ],
  assumptions: [
    'Statistically valid counts typically range from 30 to 300 colonies per standard 100 mm agar plate.',
    'Assumes each visible colony arises from a single viable bacterial cell or fungal spore (or uniform clump).',
    'Dilution factor represents the reciprocal of the dilution (e.g. 10⁻⁴ dilution = 10,000 dilution factor).',
    'Detection: the dish is found by a RANSAC circle fit to rim edges and the agar by a second circle fit to the first sharp brightness steps inside the wall (it may be off-centre in a tilted photo); the photo is analysed at up to 1200 px (live camera frames at 640 px). The agar background is a local average that leaves out colonies, ink and glare; colonies are scale-space maxima of a difference-of-Gaussians filter at radii from half the typical colony radius up to it, above k × each scale’s robust (MAD) noise, where sensitivity sets k from 9 to 3; a weaker peak within 0.7 × (sum of radii) of a stronger one is the same colony. Peaks shaped like lines (marker pen, the rim, scratches) are rejected by the Hessian eigenvalue ratio, and touching colonies count separately when each has its own peak.',
    'Colonies on the plastic wall or within the edge margin, and fused colonies without separate peaks, are not counted; curls of coloured marker can be mistaken for colonies. Check the rings and add or remove pins by hand.',
    'Sizes in mm assume the detected dish circle is the chosen dish diameter.',
  ],
  references: [
    { text: 'Breed, R. S., & Dotterrer, W. D. (1916). The Number of Colonies Allowable on Satisfactory Agar Plates. J Bacteriol, 1(3), 321–331.', url: 'https://doi.org/10.1128/jb.1.3.321-331.1916' },
  ],
  verified: '2026-10-27',
};
