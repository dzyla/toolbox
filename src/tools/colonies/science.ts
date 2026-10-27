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
    'Detection: the dish is found by a RANSAC circle fit to rim edges; the photo is analysed at up to 1200 px (live camera frames at 640 px). The agar background is a local average that leaves out colonies, ink and glare; colonies are peaks of a difference-of-Gaussians filter tuned to the typical colony size, above k × the robust (MAD) noise, where sensitivity sets k from 9 to 3. Peaks shaped like lines (marker pen, the rim, scratches) are rejected by the Hessian eigenvalue ratio, and touching colonies count separately when each has its own peak.',
    'Faint, blurred copies of colonies (reflections in the lid) and colonies within the edge margin are not counted at the default sensitivity; check the rings and add or remove pins by hand. Fused colonies without separate peaks count as one.',
    'Sizes in mm assume the detected dish circle is the chosen dish diameter.',
  ],
  references: [
    { text: 'Breed, R. S., & Dotterrer, W. D. (1916). The Number of Colonies Allowable on Satisfactory Agar Plates. J Bacteriol, 1(3), 321–331.', url: 'https://doi.org/10.1128/jb.1.3.321-331.1916' },
  ],
  verified: '2026-10-27',
};
