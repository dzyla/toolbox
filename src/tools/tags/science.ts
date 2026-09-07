import type { Science } from '@/app/components/SciencePanel';

export const SCIENCE: Science = {
  title: 'Tag Library & Protease Cleavage Simulator',
  formulas: [
    'MW = sum(residue masses) + H₂O; monoisotopic MW uses most abundant stable isotope masses',
    'Abs 0.1% (1 g/L) = ε₂₈₀ / MW (cm⁻¹), where ε₂₈₀ = 5500 n(Trp) + 1490 n(Tyr) + 125 n(cystine) [Pace et al. 1995]',
    'Isoelectric point (pI): pH at which net charge = 0 computed iteratively via the Bjellqvist pKa scheme',
    'SDS-PAGE mobility: distance migrated y(MW) ∝ (log₁₀ MW_top − log₁₀ MW) / (log₁₀ MW_top − log₁₀ MW_bot) [Weber & Osborn 1969]',
    'TEV P1\' relative efficiency (%) = Kapust et al. (2002) empirical tolerance rates: Gly (100%), Ser (89%), Ala (82%), Cys (65%), Met (57%), Pro (<0.1%)',
    'Peptide bond hydrolysis mass balance: M_intact + M(H₂O) = M(N-fragment) + M(C-fragment)',
  ],
  assumptions: [
    'Cleavage modeling assumes accessible linker conformation without steric occlusion from adjacent tertiary folds.',
    'Subtractive affinity depletion assumes the recombinant protease carries the corresponding affinity handle (e.g. 6xHis-TEV) and that the target protein lacks unexpected affinity-binding epitopes.',
    'Virtual SDS-PAGE assumes standard SDS-denaturing conditions with uniform negative charge density (~1.4 g SDS per g protein). Peptides < 3–5 kDa run at or near the dye front in conventional Tris-Glycine gels.',
    'Native extinction coefficient assumes all Cys pairs form disulfide bonds; reduced coefficient considers zero disulfides.',
  ],
  references: [
    {
      text: 'Waugh DS (2011) An overview of tools for the cleavage of fusion proteins by site-specific proteases. Protein Expr Purif 80:283–293',
      url: 'https://doi.org/10.1016/j.pep.2011.06.012',
    },
    {
      text: 'Kapust RB et al. (2002) The P1\' tolerance of tobacco etch virus protease and implications for the removal of affinity tags from recombinant proteins. Protein Eng 15:871–874',
      url: 'https://doi.org/10.1093/protein/15.12.871',
    },
    {
      text: 'Weber K & Osborn M (1969) The reliability of molecular weight determinations by dodecyl sulfate-polyacrylamide gel electrophoresis. J Biol Chem 244:4406–4412',
      url: 'https://doi.org/10.1016/S0021-9258(18)94333-4',
    },
    {
      text: 'Bjellqvist B et al. (1993) The focusing positions of polypeptides in immobilized pH gradients can be predicted from their amino acid sequences. Electrophoresis 14:1023–1031',
      url: 'https://doi.org/10.1002/elps.11501401163',
    },
    {
      text: 'Pace CN et al. (1995) How to measure and predict the molar absorption coefficient of a protein. Protein Sci 4:2411–2423',
      url: 'https://doi.org/10.1002/pro.5560041120',
    },
  ],
  verified: '2026-09-05',
};
