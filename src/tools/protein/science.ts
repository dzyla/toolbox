import type { Science } from '@/app/components/SciencePanel';

export const SCIENCE: Science = {
  title: 'Protein parameters',
  formulas: [
    'MW = sum(residue masses) + H₂O; monoisotopic MW uses the most abundant isotope masses',
    'net charge = sum Henderson–Hasselbalch fractional charges; pI is the pH where charge = 0',
    'titration curve: q(pH) = Σ basic n/(1 + 10^(pH − pKa)) − Σ acidic n/(1 + 10^(pKa − pH)), summed over K, R, H and the N-terminus (+) and D, E, C, Y and the C-terminus (−), evaluated at pH 0–14 in 0.1 steps; pI by bisection of q = 0',
    'ε₂₈₀ = 5500 n(Trp) + 1490 n(Tyr) + 125 n(cystine), native-water values',
    'FoldIndex = 2.785 × mean[(KD + 4.5) / 9] − |mean(integer K/R/D/E charge)| − 1.151',
    'hydrophobic moment = |sum hᵢ(cos iδ, sin iδ)| / window, δ = 100°, Kyte–Doolittle hᵢ',
    'ESI m/z = (M + z × 1.007276) / z',
  ],
  assumptions: [
    'Unmodified, linear polypeptide unless a listed mass delta is applied separately.',
    'Charge and titration curve use fixed, context-free pKa values (the bundled ExPASy/Bjellqvist set or the EMBOSS set; the Bjellqvist set adjusts terminal pKa by the first and last residue). The two sets differ in side-chain and terminal pKa values, so pI and charge at a given pH differ between them; the overlay shows the spread.',
    'No neighbour, burial, salt, temperature, ligand/metal or post-translational effects are modelled; the curve is for the free denatured chain, and charge does not predict binding or ion-exchange behaviour.',
    'Native ε assumes all cysteines form cystines; reduced ε excludes cystine contribution. Denatured values use 6 M guanidine hydrochloride coefficients.',
    'Ambiguous residues are reported; their approximate average masses may contribute, but unknown atoms and extinction are omitted.',
    'FoldIndex, signal peptides, transmembrane segments, motifs, and secondary-structure propensities are screening heuristics, not structural predictions.',
    'Feature coordinates are 1-based and inclusive. Digest masses include one water molecule.',
  ],
  references: [
    { text: 'ExPASy ProtParam documentation', url: 'https://web.expasy.org/protparam/protparam-doc.html' },
    { text: 'Kyte & Doolittle 1982, J Mol Biol 157:105–132', url: 'https://doi.org/10.1016/0022-2836(82)90515-0' },
    { text: 'Prilusky et al. 2005, Bioinformatics 21:3435–3438', url: 'https://doi.org/10.1093/bioinformatics/bti537' },
    { text: 'Eisenberg et al. 1984, PNAS 81:140–144', url: 'https://doi.org/10.1073/pnas.81.1.140' },
    { text: 'Chou & Fasman 1978, Adv Enzymol 47:45–148', url: 'https://doi.org/10.1002/9780470122921.ch2' },
    { text: 'Unimod modification database', url: 'https://www.unimod.org/modifications_list.php' },
  ],
  verified: '2026-09-03',
};
