import type { Science } from '@/app/components/SciencePanel';

export const SCIENCE: Science = {
  title: 'Primer QC & PCR Suite: Thermodynamics, Secondary Structures, and Annealing Temperature',
  formulas: [
    'Nearest-neighbour duplex melting temperature (SantaLucia 1998): Tm = ΔH° / (ΔS° + R·ln(k)) − 273.15 + ΔT_salt, where k = [primer] − [template]/2 (non-self-complementary) or k = [primer] (self-complementary with symmetry term)',
    'Divalent Mg²⁺ and monovalent salt corrections (Owczarzy 2008, 2004): 1/Tm(Mg²⁺, Mon⁺) = 1/Tm(1 M) + Δ(1/Tm) with competitive dNTP binding Ka = 3.0×10⁴ M⁻¹ to determine free [Mg²⁺]',
    '3′ Terminal stability (SantaLucia 1998, Dieffenbach 1993): ΔG°₃₇ = Σ ΔG°_stack = ΔH° − (310.15 K)·ΔS°/1000 for the terminal 5 bases; ΔG°₃₇ ≤ −9.0 kcal/mol flagged as risky for non-specific priming',
    'GC clamp (Innis 1990, Dieffenbach 1993): count of G/C residues in the 3′ terminal 5 bases (optimal: 1–3 G/C; >3 high risk of mispriming; 0 poor stability)',
    'Hairpin secondary structure (SantaLucia & Hicks 2004): ΔG°_hairpin = ΔG°_stem + ΔG°_loop(N) + ΔG°_closingAT; loop size ≥ 3 nt; ΔG°₃₇ ≤ −3.0 kcal/mol flagged as significant hairpin',
    'Primer dimer stability (AutoDimer, SantaLucia 1998): sliding antiparallel duplex ΔG°₃₇ = ΔH° − (310.15 K)·ΔS°/1000 + ΔG°_init; 3′ end dimer flagged if ΔG°₃₇ ≤ −5.0 kcal/mol, internal dimer flagged if ΔG°₃₇ ≤ −6.0 kcal/mol',
    'Annealing temperature Ta (Taq / Standard): Ta = min(Tm1, Tm2) − 5.0 °C',
    'Annealing temperature Ta (Phusion / Q5 High-Fidelity): Ta = 0.893 × min(Tm1, Tm2) − 4.49 °C',
    'Primer pair compatibility: |Tm1 − Tm2| ≤ 3.0 °C optimal for balanced hybridization efficiency',
  ],
  assumptions: [
    'Thermodynamic calculations utilize unified DNA/DNA nearest-neighbor parameters (SantaLucia 1998 Table 2) with initiation and terminal AT penalties.',
    'Salt corrections dynamically switch between Owczarzy 2008 (divalent magnesium with competitive dNTP binding) and Owczarzy 2004 (monovalent sodium, potassium, and Tris/2).',
    'Hairpins with loops smaller than 3 nucleotides are sterically prohibited in double-helical B-DNA.',
    '3′ End dimers are substantially more deleterious than 5′ or internal dimers because thermostable DNA polymerases can utilize paired 3′ termini as priming sites to amplify artifactual primer-dimer concatemer bands.',
    'Optimal PCR primers are 18–25 nt in length, 40–60% GC, 55–65 °C Tm, with 1–3 GC bases in the terminal 5 nt.',
  ],
  references: [
    {
      text: 'SantaLucia J Jr (1998) A unified view of polymer, dumbbell, and oligonucleotide DNA nearest-neighbor thermodynamics. Proc Natl Acad Sci USA 95:1460–1465',
      url: 'https://doi.org/10.1073/pnas.95.4.1460',
    },
    {
      text: 'SantaLucia J Jr, Hicks D (2004) The thermodynamics of DNA structural motifs. Annu Rev Biophys Biomol Struct 33:415–440',
      url: 'https://doi.org/10.1146/annurev.biophys.32.110601.141800',
    },
    {
      text: 'Owczarzy R et al. (2008) Predicting stability of DNA duplexes in solutions containing magnesium and monovalent cations. Biochemistry 47:5336–5353',
      url: 'https://doi.org/10.1021/bi702363u',
    },
    {
      text: 'Owczarzy R et al. (2004) Effects of sodium ions on DNA duplex oligomers: improved predictions of melting temperatures. Biochemistry 43:3537–3554',
      url: 'https://doi.org/10.1021/bi034621r',
    },
    {
      text: 'Dieffenbach CW, Lowe TM, Dveksler GS (1993) General concepts for PCR primer design. PCR Methods Appl 3:S30–S37',
      url: 'https://doi.org/10.1101/gr.3.3.s30',
    },
    {
      text: 'Vallone PM, Butler JM (2004) AutoDimer: a screening tool for primer-dimer and hairpin structures. Biotechniques 37:226–231',
      url: 'https://doi.org/10.2144/04372st03',
    },
  ],
  verified: '2026-09-05',
};
