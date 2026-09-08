import type { Science } from '@/app/components/SciencePanel';

export const SCIENCE: Science = {
  title: 'Unit conversion by dimensional analysis',
  formulas: [
    'x_to = x_from × (factor_from / factor_to)',
    '1 Ci = 3.7 × 10¹⁰ Bq (exact, historical definition from ²²⁶Ra); 1 rem = 0.01 Sv (exact); 1 atm = 101325 Pa (exact); 1 bar = 10⁵ Pa (exact); 1 Torr = 101325/760 Pa ≈ 133.322 Pa; 1 psi = 6894.757 Pa',
    'T(K) = T(°C) + 273.15; T(°F) = T(°C) × 9/5 + 32. US liquid gallon = 3.785411784 L; avoirdupois pound = 453.59237 g; inch = 25.4 mm.',
  ],
  assumptions: [
    'Conversions are exact except where noted (psi, mmHg are conventional definitions).',
    'Dose units Gy and Sv share a factor table here: converting 1 Gy to Sv is a unit rename, not a physical equivalence — the radiation weighting factor is a property of the exposure, not the unit.',
    'Prefixes are SI: k 10³, m 10⁻³, µ 10⁻⁶, n 10⁻⁹, p 10⁻¹². US volume units are US liquid measures; ton means the US short ton; calorie and BTU use thermochemical and International Table definitions.',
  ],
  references: [
    { text: 'BIPM: The International System of Units (SI), 9th edition, Table 8 (radioactivity) and Table 4 (SI prefixes)', url: 'https://www.bipm.org/en/publications/si-brochure' },
    { text: 'ICRU Report 85: Conversion of quantities in radiation protection', url: 'https://www.icru.org' },
    { text: 'NIST: Guide for the Use of the International System of Units (SP 811), conversion factors', url: 'https://physics.nist.gov/cuu/pdf/sp811.pdf' },
  ],
  verified: '2026-09-04',
};
