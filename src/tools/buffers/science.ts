import type { Science } from '@/app/components/SciencePanel';

export const SCIENCE: Science = {
  title: 'Buffer and media recipes',
  formulas: [
    'solid mass (g) = target (mol/L) × final volume (L) × formula MW (g/mol)',
    '% w/v mass (g) = target (%) × final volume (mL) / 100',
    'stock volume = target concentration × final volume / stock concentration',
    'fraction of species k = ∏(j≤k) 10^(pH − pKa′_j) / Σ(…); m = Σ k·f_k is the mean number of protons removed',
    'pKa′ = pKa(25 °C) + (dpKa/dT)(T − 25 °C) + (2z − 1)·A·f(I); f(I) = √I/(1+√I) − 0.3·I, A ≈ 0.511 at 25 °C, z = charge of the acid species',
    'titrant equivalents per mole of buffer = m(pH) − (protons removed in the weighed form); positive = base, negative = acid',
    'mixing two forms: x(base) = (m − s_acid)/(s_base − s_acid)',
    'pH at the working temperature: solve Σ f_k(pH, pKa′(T_use))·z_k = Q, with the net charge Q fixed at preparation',
  ],
  assumptions: [
    'Molecular weight is for the exact salt or hydrate selected. Additional waters are ignored when the selected entry is already a named hydrate.',
    'Percentage solids are interpreted as % w/v; percentage stock liquids are interpreted as % v/v.',
    'Volumes are additive and stock and target units describe the same concentration basis.',
    'Adjust pH experimentally after dissolving components, then bring the solution to final volume.',
    'Activity coefficients follow the Davies equation (valid to about 0.5 M ionic strength and 0–50 °C); above that the pH prediction is flagged as approximate.',
    'Counter-ions are monovalent (Na⁺ or Cl⁻) and ionic strength counts the buffer species plus the listed salts (NaCl, KCl, NH₄Cl, MgCl₂, CaCl₂, MgSO₄, (NH₄)₂SO₄, sodium acetate); other components are listed as not counted.',
    'Water ionisation is ignored, so a pH more than about 1.5 units from every pKa is not a buffer and the working-temperature prediction is unreliable there.',
    'Temperature dependence is linear about 25 °C; steps without a published coefficient are not temperature-corrected.',
    'Titrant volumes are estimates; finish with a calibrated pH meter at the temperature the pH is specified for.',
  ],
  references: [
    { text: 'Good et al. (1966), Hydrogen Ion Buffers for Biological Research', url: 'https://doi.org/10.1021/bi00866a011' },
    { text: 'Cold Spring Harbor Protocols recipe index', url: 'https://cshprotocols.cshlp.org/site/recipes/nav_t.dtl' },
    { text: 'Sigma-Aldrich TAE and TBE recipes', url: 'https://www.sigmaaldrich.com/US/en/technical-documents/protocol/protein-biology/gel-electrophoresis/tae-and-tbe-running-buffers-recipe' },
    { text: 'Ferguson et al. (1980), Anal. Biochem. 104:300–310, Good-buffer pKa values and their temperature dependence' },
    { text: 'Davies (1938), J. Chem. Soc. 2093–2098, an equation for the mean ionic activity coefficient of an electrolyte' },
  ],
  verified: '2026-10-01',
};
