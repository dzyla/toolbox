import type { Science } from '@/app/components/SciencePanel';

export const SCIENCE: Science = {
  title: 'Ultrafiltration & Dialysis Buffer Exchange Physics',
  formulas: [
    'CN = C_buffer + (C0 - C_buffer) × (V_concentrate / V_initial)^N ; Ultrafiltration solute dilution per cycle',
    'DFV = N × V_wash / V_retentate ; Diafiltration volumes (5 DFV >99.3% clearance, 7 DFV >99.9%)',
    'C_eq = (C_prev × V_sample + C_bath × V_bath) / (V_sample + V_bath) ; Equilibrium dialysis partition',
    'MW_protein ≥ 3 × MWCO ; Millipore/Cytiva safety rule for >95% protein retention',
  ],
  assumptions: [
    'Microsolutes are freely permeable and do not tightly bind to the protein (unbound equilibrium).',
    'Centrifugation adheres to rotor speed limits (swinging bucket ~4,000 × g; fixed angle ~14,000 × g).',
    'Dialysis allows sufficient equilibration time (>4–6 hours per bath change or overnight at 4°C with stirring).',
  ],
  references: [
    { text: 'Cheryan M. Ultrafiltration and Microfiltration Handbook. CRC Press (1998).' },
    { text: 'MilliporeSigma Technical Guide: Protein Concentration and Diafiltration by Centrifugal Ultrafiltration (2019)', url: 'https://www.sigmaaldrich.com' },
  ],
  verified: '2026-09-03',
};
