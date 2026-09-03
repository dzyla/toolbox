import type { Science } from '@/app/components/SciencePanel';

export const SCIENCE: Science = {
  title: 'Hemocytometer cell counting and viability',
  formulas: [
    'Concentration (cells/mL) = (Total cells counted / N squares) × Dilution factor × 10⁴',
    'Viability (%) = [Live cells / (Live cells + Dead cells)] × 100',
    'Seeding volume (mL) = Target cell count / Viable cells per mL',
  ],
  assumptions: [
    'A standard Neubauer hemocytometer large square is 1.0 mm × 1.0 mm with depth 0.1 mm, giving a volume of 0.1 mm³ (10⁻⁴ mL).',
    'Trypan Blue exclusion assumes non-viable (dead) cells take up dye due to compromised membrane integrity, whereas viable cells remain unstained.',
    'Cells touching the top and left borders of a square are typically included, while cells touching the bottom and right borders are excluded to prevent duplicate counting.',
  ],
  references: [
    { text: 'Neubauer Improved Hemocytometer Specifications and Best Practices', url: 'https://www.insdc.org' },
    { text: 'Strober W. (2015) Trypan Blue Exclusion Test of Cell Viability. Curr Protoc Immunol. 111:A3.B.1-A3.B.3', url: 'https://doi.org/10.1002/0471142735.ima03bs111' },
  ],
  verified: '2026-09-03',
};
