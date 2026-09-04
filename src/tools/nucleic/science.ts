import type { Science } from '@/app/components/SciencePanel';

export const SCIENCE: Science = {
  title: 'Nucleic acid conversions, copy number, oligo mass and melting temperature',
  formulas: [
    'Mass to molar concentration: M = c (g/L) / MW (g/mol); average MW per bp: dsDNA 650 g/mol/bp, ssDNA 330 g/mol/nt, ssRNA 340 g/mol/nt (includes sodium counter-ions)',
    'A260 concentration: c (µg/mL) = A260 × Factor × Dilution / path_length (cm), where Factor = 50 for dsDNA, 40 for ssRNA, 33 for ssDNA',
    'Copy number: Copies = (mass_ng × 10⁻⁹ / MW) × N_A, where N_A = 6.02214076 × 10²³ mol⁻¹',
    'Oligo anhydrous mass: MW (g/mol) = Σ (residue_masses) − 61.96 g/mol (5′-OH and 3′-OH end correction)',
    'Wallace rule (<14 nt): Tm (°C) = 2(wA + xT) + 4(yG + zC)',
    'Marmur-Schildkraut-Doty basic (>13 nt): Tm (°C) = 64.9 + 41 × (yG + zC − 16.4) / N',
    'Nearest-neighbour Tm (SantaLucia 1998): Tm = ΔH° / (ΔS° + R·ln(C_T / x)) − 273.15 + Salt_correction, where x = 1 for self-complementary and 4 for non-self-complementary',
    'Oligo extinction coefficient ε₂₆₀ (Cavaluzzi & Borer 2004, Puglisi & Tinoco 1989): ε₂₆₀ = Σ ε_dimer − Σ ε_monomer (nearest-neighbour model accounting for base-stacking hypochromicity)',
  ],
  assumptions: [
    'Average molecular weights include sodium counter-ions as recommended by NEB and Thermo Fisher. Anhydrous free acids without counter-ions are approximately 5% lower (617.96 g/mol/bp dsDNA).',
    'A260 extinction for long polymers assumes standard duplex or random-coil single strands (50 µg/mL/OD dsDNA, 40 µg/mL/OD ssRNA, 33 µg/mL/OD ssDNA).',
    'Short oligonucleotides use sequence-specific nearest-neighbour extinction coefficients at 260 nm (Cavaluzzi & Borer 2004) for highest precision.',
    'Nearest-neighbour thermodynamics use the unified SantaLucia 1998 parameters with initiation and terminal AT penalties.',
    'Salt correction defaults to the Owczarzy 2004 monovalent model or Owczarzy 2008 divalent magnesium model.',
  ],
  references: [
    { text: 'SantaLucia J Jr (1998) A unified view of polymer, dumbbell, and oligonucleotide DNA nearest-neighbor thermodynamics. Proc Natl Acad Sci USA 95:1460–1465', url: 'https://doi.org/10.1073/pnas.95.4.1460' },
    { text: 'Owczarzy R et al. (2004) Effects of sodium ions on DNA duplex oligomers: improved predictions of melting temperatures. Biochemistry 43:3537–3554', url: 'https://doi.org/10.1021/bi034621r' },
    { text: 'Owczarzy R et al. (2008) Predicting stability of DNA duplexes in solutions containing magnesium and monovalent cations. Biochemistry 47:5336–5353', url: 'https://doi.org/10.1021/bi702363u' },
    { text: 'Cavaluzzi MJ, Borer PN (2004) Revised UV extinction coefficients for nucleoside-5′-monophosphates and unpaired DNA species. Nucleic Acids Res 32:e13', url: 'https://doi.org/10.1093/nar/gnh013' },
    { text: 'Puglisi JD, Tinoco I Jr (1989) Absorbance melting contours of RNA. Methods Enzymol 180:304–325', url: 'https://doi.org/10.1016/0076-6879(89)80108-9' },
    { text: 'Wallace RB et al. (1979) Hybridization of synthetic oligodeoxyribonucleotides to phi chi 174 DNA: the effect of single base pair mismatch. Nucleic Acids Res 6:3543–3557', url: 'https://doi.org/10.1093/nar/6.11.3543' },
  ],
  verified: '2026-09-04',
};
