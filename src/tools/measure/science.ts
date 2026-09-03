import type { Science } from '@/app/components/SciencePanel';

export const SCIENCE: Science = {
  title: 'Image scale calibration, distance, and area measurements',
  formulas: [
    'Scale ratio S = Known real length / Distance in pixels',
    'Calibrated length = Distance in pixels × S',
    'Calibrated area = Pixel area × S²',
    'Angle θ = arccos[(u · v) / (|u| |v|)]',
  ],
  assumptions: [
    'Assumes square, isotropic pixels without optical barrel or pincushion distortion.',
    'Scale bar calibration must lie in the same focal plane as the measured objects.',
  ],
  references: [
    { text: 'Schneider, C. A., Rasband, W. S., & Eliceiri, K. W. (2012). NIH Image to ImageJ: 25 years of image analysis. Nature Methods, 9(7), 671–675.', url: 'https://doi.org/10.1038/nmeth.2089' },
  ],
  verified: '2026-09-03',
};
