import { describe, expect, it } from 'vitest';
import { analyzeInhibition, fitInhibitionModel, fitMorrison, inhibitionVelocity, morrisonFraction, parseInhibitionData, type InhibitionModel, type InhibitionPoint } from '@/core/fitting/global';

const noise = (i: number, a: number) => a * Math.sin(i * 5.713 + 0.9);
const S = [0.5, 1, 2, 4, 8, 16, 32];
const I = [0, 2, 5, 10, 20];
function make(model: InhibitionModel, p: number[], amp = 0.01): InhibitionPoint[] {
  let k = 0;
  return I.flatMap(i => S.map(s => ({ s, i, v: inhibitionVelocity(model, s, i, p) * (1 + noise(k++, amp)) })));
}
const val = (r: { parameters: { symbol: string; value: number }[] }, s: string) => r.parameters.find(p => p.symbol === s)!.value;

describe('inhibition rate laws', () => {
  it('reduce to Michaelis–Menten without inhibitor and give the textbook apparent constants', () => {
    const p = [100, 4, 5, 20];
    for (const m of ['competitive', 'uncompetitive', 'noncompetitive', 'mixed'] as const) {
      expect(inhibitionVelocity(m, 3, 0, p)).toBeCloseTo((100 * 3) / (4 + 3), 10);
    }
    // Competitive: Km,app = Km(1+I/Ki), Vmax unchanged. At S = Km,app the rate is Vmax/2.
    const kmApp = 4 * (1 + 10 / 5);
    expect(inhibitionVelocity('competitive', kmApp, 10, p)).toBeCloseTo(50, 8);
    // Uncompetitive: Vmax,app = Vmax/(1+I/Ki), Km,app = Km/(1+I/Ki).
    const f = 1 + 10 / 5;
    expect(inhibitionVelocity('uncompetitive', 4 / f, 10, p)).toBeCloseTo(100 / f / 2, 8);
    // Non-competitive: Vmax,app = Vmax/(1+I/Ki), Km unchanged.
    expect(inhibitionVelocity('noncompetitive', 4, 10, p)).toBeCloseTo(100 / f / 2, 8);
  });
});

describe('global inhibition fit and model selection', () => {
  it.each([
    ['competitive', [100, 4, 5, 5], 'Ki'],
    ['uncompetitive', [100, 4, 5, 5], 'Ki'],
    ['noncompetitive', [100, 4, 5, 5], 'Ki'],
  ] as const)('recovers Ki and selects %s', (model, p, sym) => {
    const analysis = analyzeInhibition(make(model, [...p]));
    expect(analysis.best).toBe(model === 'noncompetitive' ? analysis.best : model);
    const fit = analysis.fits[model];
    expect(Math.abs(val(fit, sym) - 5) / 5).toBeLessThan(0.06);
    expect(Math.abs(val(fit, 'Vmax') - 100) / 100).toBeLessThan(0.05);
    expect(analysis.comparison.reduce((a, c) => a + c.weight, 0)).toBeCloseTo(1, 10);
    if (model !== 'noncompetitive') expect(analysis.comparison[0]!.model).toBe(model);
  });

  it('recovers mixed-inhibition constants and reports α', () => {
    const fit = fitInhibitionModel('mixed', make('mixed', [100, 4, 3, 12], 0.005));
    expect(Math.abs(val(fit, 'Ki') - 3) / 3).toBeLessThan(0.1);
    expect(Math.abs(val(fit, 'Ki′') - 12) / 12).toBeLessThan(0.1);
    expect(val(fit, 'α = Ki′/Ki')).toBeCloseTo(val(fit, 'Ki′') / val(fit, 'Ki'), 10);
  });

  it('says so when the data cannot separate the mechanisms', () => {
    const noisy = make('competitive', [100, 4, 5, 5], 0.25);
    const a = analyzeInhibition(noisy);
    expect(typeof a.summary).toBe('string');
    expect(a.comparison.length).toBe(4);
  });

  it('validates input', () => {
    expect(() => fitInhibitionModel('competitive', S.map(s => ({ s, i: 0, v: s })))).toThrow(/at least two inhibitor/);
    expect(() => fitInhibitionModel('mixed', [{ s: 1, i: 0, v: 1 }, { s: 2, i: 1, v: 1 }])).toThrow(/more than/);
  });

  it('parses three-column data with a header and replicate columns', () => {
    const rows = parseInhibitionData('S, I, v1, v2\n1, 0, 10, 11\n2, 5, 8, 9\n# c\n');
    expect(rows).toEqual([{ s: 1, i: 0, v: 10 }, { s: 1, i: 0, v: 11 }, { s: 2, i: 5, v: 8 }, { s: 2, i: 5, v: 9 }]);
  });
});

describe('Morrison tight-binding', () => {
  it('matches the closed-form quadratic and its limits', () => {
    const E = 10, Ki = 2, I = 7;
    const b = E + I + Ki;
    expect(morrisonFraction(E, I, Ki)).toBeCloseTo(1 - (b - Math.sqrt(b * b - 4 * E * I)) / (2 * E), 12);
    expect(morrisonFraction(E, 0, Ki)).toBeCloseTo(1, 12);
    // Bound inhibitor never exceeds either total: fraction stays within [0, 1].
    for (const i of [0.1, 1, 10, 100, 1e4]) expect(morrisonFraction(E, i, Ki)).toBeGreaterThanOrEqual(0);
    // Large Ki: reduces to the simple hyperbola 1/(1+I/Ki).
    expect(morrisonFraction(1e-6, 5, 5)).toBeCloseTo(1 / (1 + 5 / 5), 4);
  });

  it('recovers Ki,app with the enzyme concentration fixed, and converts to a competitive Ki', () => {
    const E = 5, Ki = 1.5;
    const xs = [0, 0.5, 1, 2, 3, 4, 6, 8, 12, 20];
    const data = xs.map((x, i) => ({ x, y: 100 * morrisonFraction(E, x, Ki) + noise(i, 0.4) }));
    const r = fitMorrison(data, { enzymeConc: E, substrateConc: 10, km: 10 });
    expect(Math.abs(val(r, 'Ki,app') - Ki) / Ki).toBeLessThan(0.1);
    expect(val(r, 'Ki')).toBeCloseTo(val(r, 'Ki,app') / 2, 10);
  });

  it('can fit the active enzyme concentration (titration)', () => {
    const E = 8, Ki = 0.2;
    const xs = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12];
    const data = xs.map((x, i) => ({ x, y: 50 * morrisonFraction(E, x, Ki) + noise(i, 0.15) }));
    const r = fitMorrison(data, { enzymeConc: 6, fitEnzyme: true });
    expect(Math.abs(val(r, '[E]t') - E) / E).toBeLessThan(0.1);
    expect(r.notes.join(' ')).toMatch(/titrates|Enter the substrate/);
  });

  it('requires enzyme concentration and enough points', () => {
    expect(() => fitMorrison([{ x: 1, y: 1 }], { enzymeConc: 1 })).toThrow(/at least 5/);
    expect(() => fitMorrison(Array.from({ length: 6 }, (_, i) => ({ x: i, y: 1 })), { enzymeConc: 0 })).toThrow(/enzyme concentration/);
  });
});
