import { describe, it, expect } from 'vitest';
import {
  morrison, solveSingleStep, singleStep, solveStepwise, adairCoefficients, speciesAtFreeLigand,
  targetLigandSingleStep, targetLigandStepwise, speciesTable, deltaG, deltaGSingleStep, kdFromDeltaG, chengPrusoff,
  titrationGrid, titration, hillSeries, kdFromRates, kObs, tHalfObs, tHalfDissociation, associationCourse, dissociationCourse,
  mixRecipe, serialDilutionPlan, autoDilutionFactor, massToNM, nmToMass, BindingError, R_GAS,
} from '@/core/binding/equilibrium';

const rel = (a: number, b: number) => Math.abs(a - b) / Math.max(1e-300, Math.abs(b));
const binom = (n: number, k: number) => { let r = 1; for (let i = 1; i <= k; i++) r = r * (n - i + 1) / i; return r; };

describe('1:1 and single-step n-mer', () => {
  it('Morrison closed form: P = 10, L = 50, Kd = 100 nM gives 3.1885 nM', () => {
    // x = [(P+L+Kd) − sqrt((P+L+Kd)² − 4PL)]/2 = [160 − sqrt(25600 − 2000)]/2 = (160 − 153.6229)/2 = 3.18854 (hand derivation)
    expect(morrison(10, 50, 100)).toBeCloseTo(3.18854, 4);
    expect(morrison(0, 50, 100)).toBe(0);
  });
  it('bisection matches Morrison to 1e-6 relative across regimes (tight, weak, stoichiometric)', () => {
    for (const [P, L, Kd] of [[10, 50, 100], [100, 5, 0.01], [1, 1, 1], [1000, 10, 5], [1e-3, 1e-3, 1e6], [5, 5, 1e-6]]) {
      expect(rel(solveSingleStep(P!, L!, Kd!, 1), morrison(P!, L!, Kd!))).toBeLessThan(1e-6);
    }
  });
  it('n-mer complex satisfies its mass-action law', () => {
    const P1 = 10, P2 = 50, Kd = 1e4, n = 2; // Kd in nM²
    const x = solveSingleStep(P1, P2, Kd, n);
    expect((P1 - x) * (P2 - n * x) ** n / x).toBeCloseTo(Kd, 6);
    const r = singleStep(P1, P2, Kd, n);
    expect(r.concs).toEqual([P1 - x, 0, x]);
    expect(r.p2Free).toBeCloseTo(P2 - 2 * x, 12);
    expect(r.probs[0]! + r.probs[2]!).toBeCloseTo(1, 12);
  });
  it('rejects bad input with a typed error', () => {
    expect(() => morrison(10, 50, 0)).toThrow(BindingError);
    expect(() => solveSingleStep(10, 50, 100, 1.5)).toThrow(/integer/);
  });
});

describe('stepwise Adair model', () => {
  it('α = 1 reduces to the binomial distribution for n = 1..4', () => {
    for (const n of [1, 2, 3, 4]) {
      const r = solveStepwise(10, 50, 100, n, 1);
      for (let k = 0; k <= n; k++) expect(r.probs[k]).toBeCloseTo(binom(n, k) * r.theta ** k * (1 - r.theta) ** (n - k), 9);
      expect(r.L + r.boundSites * 10).toBeCloseTo(50, 8); // mass balance
      // free ligand and θ obey the single-site isotherm θ = L/(Kd + L)
      expect(r.theta).toBeCloseTo(r.L / (100 + r.L), 9);
    }
  });
  it('α = 0.1, n = 2, P = 10, L = 50, Kd = 100 nM: P0 = 0.307, P2 = 0.456 (audit reference, closed-form Adair)', () => {
    const r = solveStepwise(10, 50, 100, 2, 0.1);
    expect(r.probs[0]).toBeCloseTo(0.307, 3);
    expect(r.probs[2]).toBeCloseTo(0.456, 3);
    expect(Math.abs(r.probs[0]! - (1 - r.theta) ** 2)).toBeGreaterThan(1e-2); // not binomial
    expect(r.anyBound).toBeCloseTo(10 * (1 - r.probs[0]!), 12);
    expect(r.fullyBound).toBeCloseTo(r.concs[2]!, 12);
  });
  it('n = 1 stepwise equals Morrison', () => {
    const r = solveStepwise(10, 50, 100, 1, 1);
    expect(r.concs[1]).toBeCloseTo(morrison(10, 50, 100), 9);
  });
  it('coefficients: β1 = n/Kd, β2 = n(n−1)/(2·Kd²·α)', () => {
    const b = adairCoefficients(100, 2, 0.1);
    expect(b[1]).toBeCloseTo(2 / 100, 12);
    expect(b[2]).toBeCloseTo(1 / (100 * 100 * 0.1), 12);
    expect(speciesAtFreeLigand(b, 0)).toEqual([1, 0, 0]);
  });
  it('no protein: free ligand equals total and fractions follow the free-ligand isotherm', () => {
    const r = solveStepwise(0, 50, 100, 2, 1);
    expect(r.L).toBe(50);
    expect(r.probs[0]).toBeCloseTo((100 / 150) ** 2, 12);
  });
});

describe('target solvers', () => {
  it('stepwise: round trip through the exact model for both definitions (α = 0.1)', () => {
    for (const mode of ['any_bound', 'fully_bound'] as const) {
      const L = targetLigandStepwise(10, 100, 2, 0.1, mode, 0.5);
      const r = solveStepwise(10, L, 100, 2, 0.1);
      expect(mode === 'any_bound' ? 1 - r.probs[0]! : r.probs[2]!).toBeCloseTo(0.5, 6);
    }
  });
  it('single-step: closed form round trip', () => {
    const L = targetLigandSingleStep(10, 1e4, 2, 0.9);
    expect(singleStep(10, L, 1e4, 2).fractionBound).toBeCloseTo(0.9, 9);
    const L1 = targetLigandSingleStep(10, 100, 1, 0.5);
    expect(morrison(10, L1, 100)).toBeCloseTo(5, 9);
  });
  it('rejects unreachable targets', () => {
    expect(() => targetLigandStepwise(10, 100, 2, 1, 'any_bound', 1)).toThrow(BindingError);
    expect(() => targetLigandSingleStep(10, 100, 1, 0)).toThrow(BindingError);
  });
});

describe('species table', () => {
  it('mass concentration uses MW of the complex: 10 nM of 150 + 25 kDa = 1.75e-3 mg/mL', () => {
    const rows = speciesTable({ probs: [0.5, 0.5], concs: [10, 10] }, 150, 25);
    expect(rows[1]!.mw_kDa).toBe(175);
    expect(rows[1]!.massConc_mg_per_mL).toBeCloseTo(1.75e-3, 9);
    expect(speciesTable({ probs: [1], concs: [1] })[0]!.massConc_mg_per_mL).toBeNull();
  });
});

describe('thermodynamics', () => {
  it('ΔG(100 nM, 25 °C) = −39.96 kJ/mol = −9.55 kcal/mol (R = 8.314462618, T = 298.15 K)', () => {
    // RT ln(1e-7) = 8.314462618 × 298.15 × (−16.1181) = −39 956 J/mol; ÷ 4.184 = −9.5497 kcal/mol
    const g = deltaG(100, 25);
    expect(g.kJ).toBeCloseTo(-39.96, 2);
    expect(g.kcal).toBeCloseTo(-9.55, 2);
    expect(g.T_K).toBe(298.15);
    expect(R_GAS).toBe(8.314462618);
  });
  it('Kd ↔ ΔG round trip and the n-mer overall/per-site split', () => {
    expect(kdFromDeltaG(deltaG(37, 20).kJ, 20)).toBeCloseTo(37, 9);
    const g = deltaGSingleStep(1e4, 2, 25); // Kd = 1e4 nM² = 1e-14 M²
    expect(g.total.kJ).toBeCloseTo(R_GAS * 298.15 * Math.log(1e-14) / 1000, 9);
    expect(g.perSite.kJ).toBeCloseTo(g.total.kJ / 2, 9);
  });
  it('Cheng–Prusoff: IC50 50 nM, [L] 10 nM, Kd 5 nM → Ki = 50/(1 + 2) = 16.67 nM; Ki = IC50 when [L] = 0', () => {
    expect(chengPrusoff(50, 10, 5)).toBeCloseTo(16.6667, 3);
    expect(chengPrusoff(50, 0, 5)).toBe(50);
    expect(() => chengPrusoff(0, 10, 5)).toThrow(BindingError);
  });
});

describe('titration and Hill analysis', () => {
  it('grids', () => {
    expect(titrationGrid(0, 10, 3, false)).toEqual([0, 5, 10]);
    expect(titrationGrid(1, 100, 3, true)).toEqual([1, 10, 100]);
    expect(() => titrationGrid(0, 10, 3, true)).toThrow(/start > 0/);
  });
  it('species sum to P1 at every point in both models', () => {
    for (const model of ['single_step', 'stepwise'] as const) {
      const t = titration({ model, P1: 10, Kd: 100, n: 2, alpha: 0.5, start: 0.1, end: 1000, points: 20, log: true });
      for (let i = 0; i < 20; i++) expect(t.species.reduce((a, s) => a + s[i]!, 0)).toBeCloseTo(10, 9);
      expect(t.fullyBound[19]).toBeGreaterThan(t.fullyBound[0]!);
    }
  });
  it('Hill slope of a non-cooperative curve is 1.00 ± 0.01 even with strong depletion (P1 = 100, Kd = 10 nM)', () => {
    const t = titration({ model: 'stepwise', P1: 100, Kd: 10, n: 2, alpha: 1, start: 1, end: 1e4, points: 200, log: true });
    const h = hillSeries(t.Lfree, t.theta);
    expect(Math.abs(h.slope - 1)).toBeLessThan(0.01);
    expect(h.r2).toBeGreaterThan(0.9999);
    expect(h.used).toBeGreaterThan(10);
    // total ligand would bias the slope here
    expect(Math.abs(hillSeries(t.Ltot, t.theta).slope - 1)).toBeGreaterThan(0.05);
  });
  it('positive cooperativity gives nH > 1 and negative gives nH < 1', () => {
    const pos = titration({ model: 'stepwise', P1: 1, Kd: 100, n: 2, alpha: 0.01, start: 0.1, end: 1e4, points: 200, log: true });
    const neg = titration({ model: 'stepwise', P1: 1, Kd: 100, n: 2, alpha: 100, start: 0.01, end: 1e5, points: 200, log: true });
    expect(hillSeries(pos.Lfree, pos.theta).slope).toBeGreaterThan(1.3);
    expect(hillSeries(neg.Lfree, neg.theta).slope).toBeLessThan(0.8);
  });
  it('too few points gives NaN slope, never throws', () => {
    expect(Number.isNaN(hillSeries([1], [0.5]).slope)).toBe(true);
  });
});

describe('kinetics', () => {
  it('kon 1e5 M⁻¹s⁻¹, koff 1e-3 s⁻¹: Kd = 10 nM; at 100 nM ligand kobs = 0.011 s⁻¹, t½ = 63.0 s; t½(diss) = 693.1 s', () => {
    expect(kdFromRates(1e5, 1e-3)).toBeCloseTo(1e-8, 15);
    expect(kObs(1e5, 1e-3, 1e-7)).toBeCloseTo(0.011, 12);
    expect(tHalfObs(1e5, 1e-3, 1e-7)).toBeCloseTo(Math.LN2 / 0.011, 9); // 63.01 s
    expect(tHalfDissociation(1e-3)).toBeCloseTo(693.147, 2);
  });
  it('time courses hit their half-times and plateaus', () => {
    const a = associationCourse(1e5, 1e-3, 1e-7, 1000, 1001); // 1 s steps
    expect(a.fraction[0]).toBe(0);
    expect(a.fraction[1000]).toBeCloseTo(1e-7 / (1e-7 + 1e-8), 4); // θeq = 0.909
    const tHalf = tHalfObs(1e5, 1e-3, 1e-7);
    expect(a.fraction[63]! / a.fraction[1000]!).toBeCloseTo(1 - Math.exp(-Math.LN2 * 63 / tHalf), 3);
    const d = dissociationCourse(1e-3, 2000, 2001);
    expect(d.fraction[693]).toBeCloseTo(0.5, 3);
  });
});

describe('bench helpers', () => {
  it('mixing: 10 nM P1 and 50 nM P2 from 100 µM stocks into 50 µL', () => {
    const r = mixRecipe({ p1Total: 10, p2Total: 50, p1Stock: 1e5, p2Stock: 1e5, finalVolume: 50 });
    expect(r.v1).toBeCloseTo(0.005, 12); expect(r.v2).toBeCloseTo(0.025, 12); expect(r.buffer).toBeCloseTo(49.97, 12);
    expect(() => mixRecipe({ p1Total: 10, p2Total: 50, p1Stock: 5, p2Stock: 5, finalVolume: 50 })).toThrow(/too dilute/);
  });
  it('serial dilution uses the chosen factor for concentrations and recipes', () => {
    expect(autoDilutionFactor(1000, 0.1)).toBe(10);
    expect(autoDilutionFactor(100, 1)).toBe(3);
    expect(autoDilutionFactor(10, 1)).toBe(2);
    const p10 = serialDilutionPlan({ high: 1000, low: 0.1 });
    expect(p10.factor).toBe(10);
    expect(p10.tubes.map(t => t.conc)).toEqual([1000, 100, 10, 1, 0.1]);
    expect(p10.tubes[1]!.recipe).toMatch(/9 vol buffer \(10-fold\)/);
    const p2 = serialDilutionPlan({ high: 100, low: 10, factor: 2, stock: 1000 });
    expect(p2.tubes.map(t => t.conc)).toEqual([100, 50, 25, 12.5]);
    expect(p2.tubes[0]!.recipe).toMatch(/1 part stock \+ 9(\.000)? parts buffer/);
    expect(serialDilutionPlan({ high: 100, low: 10, factor: 2, stock: 50 }).tubes[0]!.recipe).toMatch(/too dilute/);
    expect(serialDilutionPlan({ high: 1, low: 1e-9, factor: 2 }).tubes.length).toBe(20);
  });
  it('mass ↔ molar through MW: 1 mg/mL of a 150 kDa protein = 6666.7 nM', () => {
    expect(massToNM(1, 150)).toBeCloseTo(6666.667, 3);
    expect(nmToMass(massToNM(1, 150), 150)).toBeCloseTo(1, 12);
    expect(() => massToNM(1, 0)).toThrow(/Molecular weight/);
  });
});
