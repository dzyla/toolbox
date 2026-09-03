import type { Science } from '@/app/components/SciencePanel';

export const SCIENCE: Science = {
  title: 'Centrifuge conversions and k-factor',
  formulas: [
    'RCF = 1.118 × 10⁻⁶ × radius(mm) × RPM²',
    'RPM = √(RCF / (1.118 × 10⁻⁶ × radius(mm)))',
    'k = 2.53 × 10¹¹ × ln(rmax/rmin) / RPM²',
    'pelleting time (h) = k / sedimentation coefficient (S)',
  ],
  assumptions: [
    'Radius is measured from the axis of rotation to the sample position specified by the rotor manufacturer.',
    'The k-factor estimate uses matching units for rmax and rmin and ignores viscosity and temperature corrections.',
    'Pelleting time is an estimate for ideal sedimentation under the stated rotor conditions.',
  ],
  references: [
    { text: 'Beckman Coulter: Using k-Factor to Compare Rotor Efficiency', url: 'https://www.beckman.com/resources/reading-material/application-notes/using-k-factor-to-compare-rotor-efficiency' },
    { text: 'Beckman Coulter Ultracentrifuge reference formulas', url: 'https://www.beckman.com/resources/technologies/centrifugation/principles/calculations' },
  ],
  verified: '2026-09-03',
};
