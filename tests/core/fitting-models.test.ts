import { describe, expect, it } from 'vitest';
import { computeEnzymeTransforms, fitModel, type DataPoint, type FitModelType, type FitResult } from '@/core/fitting';

/** Deterministic pseudo-noise so the tests never flake. */
function noise(i: number, amp: number) {
  return amp * Math.sin(i * 12.9898 + 4.1414) * 0.5;
}
const series = (xs: number[], f: (x: number) => number, amp = 0): DataPoint[] => xs.map((x, i) => ({ x, y: f(x) + noise(i, amp) }));
const val = (r: FitResult, symbol: string) => r.parameters.find(p => p.symbol === symbol)!.value;
const rel = (got: number, want: number) => Math.abs(got - want) / Math.abs(want);
const logSpace = (lo: number, hi: number, n: number) => Array.from({ length: n }, (_, i) => 10 ** (lo + ((hi - lo) * i) / (n - 1)));

describe('fit parameter recovery on synthetic data', () => {
  it('linear through the origin recovers the slope', () => {
    const r = fitModel('linear_origin', series([1, 2, 3, 4, 5, 6], x => 3.2 * x));
    expect(val(r, 'm')).toBeCloseTo(3.2, 6);
    expect(r.r2).toBeCloseTo(1, 6);
    expect(r.predict(10)).toBeCloseTo(32, 4);
  });

  it('5PL recovers bottom, top, EC50 and Hill slope (asymmetry 1 reduces to 4PL)', () => {
    const f = (x: number) => 5 + 95 / (1 + 10 ** ((Math.log10(2.5) - Math.log10(x)) * 1.4));
    const r = fitModel('5pl', series(logSpace(-2, 2, 14), f, 0.4));
    expect(rel(val(r, 'C'), 2.5)).toBeLessThan(0.15);
    expect(Math.abs(val(r, 'D') - 5)).toBeLessThan(2);
    expect(Math.abs(val(r, 'A') - 100)).toBeLessThan(3);
    expect(r.r2).toBeGreaterThan(0.995);
  });

  it('two-site binding recovers both Bmax and Kd when the sites are well separated', () => {
    const f = (x: number) => (40 * x) / (0.5 + x) + (60 * x) / (200 + x);
    const r = fitModel('two_site_binding', series(logSpace(-2, 4, 30), f, 0.2));
    const [k1, k2] = [val(r, 'Kd1'), val(r, 'Kd2')];
    expect(rel(Math.min(k1, k2), 0.5)).toBeLessThan(0.3);
    expect(rel(Math.max(k1, k2), 200)).toBeLessThan(0.3);
    expect(r.r2).toBeGreaterThan(0.999);
  });

  it('exponential growth recovers rate and initial size, and reports the doubling time ln2/k', () => {
    const r = fitModel('exp_growth', series(Array.from({ length: 12 }, (_, i) => i), x => 3 * Math.exp(0.35 * x), 0.05));
    expect(rel(val(r, 'k (µ)'), 0.35)).toBeLessThan(0.02);
    expect(rel(val(r, 'y0'), 3)).toBeLessThan(0.05);
    expect(val(r, 'Td')).toBeCloseTo(Math.LN2 / val(r, 'k (µ)'), 6);
  });

  it('Gaussian recovers centre, amplitude, baseline and FWHM = 2·sqrt(2 ln2)·width', () => {
    const f = (x: number) => 2 + 10 * Math.exp(-0.5 * ((x - 6) / 1.5) ** 2);
    const r = fitModel('gaussian', series(Array.from({ length: 41 }, (_, i) => i * 0.25), f, 0.1));
    expect(Math.abs(val(r, 'µ / Tm') - 6)).toBeLessThan(0.05);
    expect(rel(val(r, 'Amp'), 10)).toBeLessThan(0.03);
    expect(Math.abs(val(r, 'Base') - 2)).toBeLessThan(0.1);
    expect(rel(val(r, 'FWHM'), 2 * Math.sqrt(2 * Math.LN2) * 1.5)).toBeLessThan(0.03);
  });

  it('substrate inhibition recovers Vmax, Km, Ki and the optimum sqrt(Km·Ki)', () => {
    const f = (s: number) => (100 * s) / (4 + s + (s * s) / 80);
    const r = fitModel('substrate_inhibition', series(logSpace(-1, 3, 24), f, 0.2));
    expect(rel(val(r, 'Vmax'), 100)).toBeLessThan(0.08);
    expect(rel(val(r, 'Km'), 4)).toBeLessThan(0.15);
    expect(rel(val(r, 'Ki'), 80)).toBeLessThan(0.15);
    expect(rel(val(r, '[S]opt'), Math.sqrt(4 * 80))).toBeLessThan(0.1);
  });

  it('SPR association recovers kobs, Req and the half-time ln2/kobs', () => {
    const r = fitModel('spr_association', series(Array.from({ length: 40 }, (_, i) => i * 5), t => 2 + 80 * (1 - Math.exp(-0.03 * t)), 0.2));
    expect(rel(val(r, 'kobs'), 0.03)).toBeLessThan(0.05);
    expect(rel(val(r, 'Req'), 80)).toBeLessThan(0.03);
    expect(val(r, 't1/2')).toBeCloseTo(Math.LN2 / val(r, 'kobs'), 6);
  });

  it('SPR dissociation recovers koff and the half-life ln2/koff', () => {
    const r = fitModel('spr_dissociation', series(Array.from({ length: 40 }, (_, i) => i * 10), t => 5 + 60 * Math.exp(-0.006 * t), 0.2));
    expect(rel(val(r, 'koff (kd)'), 0.006)).toBeLessThan(0.1);
    expect(val(r, 't1/2')).toBeCloseTo(Math.LN2 / val(r, 'koff (kd)'), 6);
  });

  it('SPR sensorgram recovers kobs and koff across both phases', () => {
    const f = (t: number) => {
      const assoc = (x: number) => 80 * (1 - Math.exp(-0.04 * x));
      return t <= 120 ? assoc(t) : assoc(120) * Math.exp(-0.01 * (t - 120));
    };
    const r = fitModel('spr_sensorgram', series(Array.from({ length: 80 }, (_, i) => i * 4), f, 0.2));
    expect(rel(val(r, 'kobs'), 0.04)).toBeLessThan(0.15);
    expect(rel(val(r, 'koff (kd)'), 0.01)).toBeLessThan(0.25);
    expect(r.r2).toBeGreaterThan(0.99);
  });

  it('unknown model types fall back to a linear fit instead of throwing', () => {
    const r = fitModel('nonsense' as FitModelType, series([0, 1, 2, 3], x => 2 * x + 1));
    expect(r.modelType).toBe('linear');
  });
});

describe('enzyme diagnostic transforms', () => {
  it('builds Lineweaver-Burk, Eadie-Hofstee and Hanes-Woolf coordinates and skips non-positive points', () => {
    const t = computeEnzymeTransforms([{ x: 2, y: 4 }, { x: 0, y: 1 }, { x: 5, y: -1 }, { x: 10, y: 5 }]);
    expect(t.lineweaverBurk).toEqual([{ invS: 0.5, invV: 0.25 }, { invS: 0.1, invV: 0.2 }]);
    expect(t.eadieHofstee).toEqual([{ vOverS: 2, v: 4 }, { vOverS: 0.5, v: 5 }]);
    expect(t.hanesWoolf).toEqual([{ s: 2, sOverV: 0.5 }, { s: 10, sOverV: 2 }]);
  });
});
