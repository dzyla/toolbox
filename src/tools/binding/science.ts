import type { Science } from '@/app/components/SciencePanel';

export const SCIENCE: Science = {
  title: 'Binding equilibria, thermodynamics and kinetics',
  formulas: [
    '1:1 (Morrison): [PL] = [(P + L + Kd) − √((P + L + Kd)² − 4PL)] / 2, with P and L the totals',
    'Single-step n-mer: P1 + n·P2 ⇌ P1·(P2)n, Kd = [P1][P2]^n / [P1·(P2)n] (units of concentration^n); solved by bisection on mass balance',
    'Stepwise (Adair), n identical sites, cooperativity α: micro-Kd of step k = Kd·α^(k−1); βk = Π (n−j+1)/(j·Kd_j); fraction with k ligands = βk·[L]^k / Σ βj·[L]^j; free [L] from L + P·ν̄(L) = Ltot',
    'Site saturation θ = ν̄ / n; linear signal = Σ k·[P1·(P2)k]; threshold signal = [P1·(P2)n]',
    'Target solver: bisection on total P2 through the same model (single-step: [P2]free = (Kd·x/(P1 − x))^(1/n), Ltot = n·x + [P2]free)',
    'ΔG° = RT·ln(Kd / 1 M), R = 8.314462618 J·mol⁻¹·K⁻¹, T = °C + 273.15; 1 kcal = 4.184 kJ',
    'Cheng–Prusoff: Ki = IC50 / (1 + [L]/Kd) for a competitive inhibitor',
    'Hill: log(θ/(1−θ)) = nH·log[L]free + const; nH by least squares over 0.1 < θ < 0.9',
    'Kinetics: Kd = koff/kon; kobs = kon·[L] + koff; t½(assoc) = ln2/kobs; t½(dissoc) = ln2/koff; θ(t) = θeq·(1 − e^(−kobs·t)), θeq = [L]/([L] + Kd)',
    'Mixing: V(stock) = C(final)·V(final)/C(stock); serial dilution: 1 volume + (f − 1) volumes buffer per step',
  ],
  assumptions: [
    'All species are at equilibrium in an ideal dilute solution; activities equal concentrations. Ligand depletion is accounted for in every model (totals in, free concentrations out).',
    'Stepwise model: the n sites on P1 are identical; α is the factor by which the intrinsic Kd changes at each successive step. α = 1 independent sites (binomial occupancy), α < 1 positive cooperativity (later steps bind tighter), α > 1 negative cooperativity. The Kd you enter is the intrinsic per-site Kd of the first event, not a macroscopic constant.',
    'Single-step model: intermediates do not exist; use it only for true one-step assemblies. Its Kd has units of concentration to the power n (nM^n internally), so the number is not comparable to a per-site Kd.',
    'Result tiles, the species table and the target solver all come from the exact model with cooperativity; nothing uses an independent-site shortcut.',
    'Hill plot uses the free ligand concentration and θ from the solver. Under ligand depletion a plot against total ligand overestimates apparent cooperativity. It is not shown in threshold mode because a fully-bound-only signal is not a site-saturation function.',
    'Cheng–Prusoff applies to competitive inhibition only; [L] and Kd must be in the same unit and Ki takes the unit of IC50. Non-competitive or tight-binding cases need other equations (Morrison IC50).',
    'Kinetics assume pseudo-first-order conditions (ligand in large excess, constant) and a single-step binding mechanism.',
    'Mass concentrations use the molecular weights entered in kDa; a molecular weight of zero blocks mass units instead of silently giving zero.',
    'ΔG° is the standard free energy at 1 M standard state; it does not include heat-capacity or enthalpy/entropy decomposition.',
  ],
  references: [
    { text: 'Morrison JF (1969) Kinetics of the reversible inhibition of enzyme-catalysed reactions by tight-binding inhibitors. Biochim Biophys Acta 185:269–286', url: 'https://doi.org/10.1016/0005-2744(69)90420-3' },
    { text: 'Adair GS (1925) The hemoglobin system VI. The oxygen dissociation curve of hemoglobin. J Biol Chem 63:529–545', url: 'https://doi.org/10.1016/S0021-9258(18)85018-9' },
    { text: 'Wyman J, Gill SJ (1990) Binding and Linkage: Functional Chemistry of Biological Macromolecules. University Science Books (binding polynomial)' },
    { text: 'Cheng Y, Prusoff WH (1973) Relationship between the inhibition constant (Ki) and the concentration of inhibitor which causes 50 per cent inhibition (I50) of an enzymatic reaction. Biochem Pharmacol 22:3099–3108', url: 'https://doi.org/10.1016/0006-2952(73)90196-2' },
    { text: 'Hill AV (1910) The possible effects of the aggregation of the molecules of haemoglobin on its dissociation curves. J Physiol 40:iv–vii' },
    { text: 'Pollard TD (2010) A guide to simple and informative binding assays. Mol Biol Cell 21:4061–4067 (kobs = kon[L] + koff, depletion)', url: 'https://doi.org/10.1091/mbc.e10-08-0683' },
    { text: 'CODATA 2018: molar gas constant R = 8.314462618 J·mol⁻¹·K⁻¹ (exact)', url: 'https://physics.nist.gov/cgi-bin/cuu/Value?r' },
  ],
  verified: '2026-09-03',
};
