import { describe, expect, it } from 'vitest';
import { baranyi, fitModel, gompertz, logistic } from '@/core/fitting';
import type { DataPoint } from '@/core/fitting';

const noise = (i: number, a: number) => a * Math.sin(i * 9.173 + 1.3);
const val = (r: ReturnType<typeof fitModel>, s: string) => r.parameters.find(p => p.symbol === s)!.value;
const times = Array.from({ length: 49 }, (_, i) => i * 0.5); // 0–24 h

describe('growth model definitions', () => {
  it('Gompertz and logistic have maximum slope µmax and the stated lag intercept', () => {
    for (const f of [gompertz, logistic]) {
      const A = 3, mu = 0.45, lag = 4;
      const dt = 1e-4;
      let best = 0, tBest = 0;
      for (let t = 0; t < 30; t += 0.01) {
        const s = (f(t + dt, A, mu, lag) - f(t - dt, A, mu, lag)) / (2 * dt);
        if (s > best) { best = s; tBest = t; }
      }
      expect(best).toBeCloseTo(mu, 2);
      // Tangent at the inflection crosses y = 0 at t = lag.
      expect(tBest - f(tBest, A, mu, lag) / best).toBeCloseTo(lag, 1);
    }
  });
  it('Baranyi approaches ymax and has slope µ in the exponential phase', () => {
    expect(baranyi(80, 0, 4, 0.6, 3)).toBeCloseTo(4, 3);
    // With a far-away asymptote the exponential phase has slope exactly µ (after the lag).
    const y = (t: number) => baranyi(t, 0, 40, 0.6, 3);
    expect((y(14.01) - y(14)) / 0.01).toBeCloseTo(0.6, 2);
    // Before the lag the slope is much smaller.
    expect((y(0.51) - y(0.5)) / 0.01).toBeLessThan(0.15);
  });
});

describe('growth fits recover known parameters', () => {
  it.each([
    ['gompertz_growth', (t: number) => gompertz(t, 3.2, 0.42, 3.5)],
    ['logistic_growth', (t: number) => logistic(t, 3.2, 0.42, 3.5)],
  ] as const)('%s on ln(OD/OD0) from OD data', (model, f) => {
    const od0 = 0.02;
    const data: DataPoint[] = times.map((t, i) => ({ x: t, y: od0 * Math.exp(f(t) + noise(i, 0.02)) }));
    const r = fitModel(model, data);
    expect(Math.abs(val(r, 'µmax') - 0.42) / 0.42).toBeLessThan(0.05);
    expect(Math.abs(val(r, 'λ') - 3.5)).toBeLessThan(0.5);
    expect(Math.abs(val(r, 'A (ln)') - 3.2) / 3.2).toBeLessThan(0.05);
    expect(val(r, 'Td')).toBeCloseTo(Math.LN2 / val(r, 'µmax'), 8);
    expect(r.notes?.join(' ')).toMatch(/ln\(y/);
    expect(r.r2).toBeGreaterThan(0.99);
  });

  it('Baranyi–Roberts recovers µ and lag', () => {
    const data: DataPoint[] = times.map((t, i) => ({ x: t, y: 0.02 * Math.exp(baranyi(t, 0, 3.3, 0.5, 2.5) + noise(i, 0.015)) }));
    const r = fitModel('baranyi_growth', data);
    expect(Math.abs(val(r, 'µmax') - 0.5) / 0.5).toBeLessThan(0.08);
    expect(Math.abs(val(r, 'λ') - 2.5)).toBeLessThan(0.7);
  });

  it('raw-scale Gompertz fits a baseline offset and reports a slope in y units', () => {
    const data: DataPoint[] = times.map((t, i) => ({ x: t, y: 0.05 + gompertz(t, 1.2, 0.2, 5) + noise(i, 0.005) }));
    const r = fitModel('gompertz_growth', data, { logTransform: false });
    expect(val(r, 'y0')).toBeCloseTo(0.05, 1);
    expect(Math.abs(val(r, 'µmax') - 0.2) / 0.2).toBeLessThan(0.05);
  });

  it('refuses non-positive readings in ln mode and flat curves, with readable messages', () => {
    expect(() => fitModel('gompertz_growth', times.map(t => ({ x: t, y: t === 0 ? 0 : 1 })))).toThrow(/strictly positive/);
    expect(() => fitModel('logistic_growth', times.map(t => ({ x: t, y: 1 })))).toThrow(/flat/);
    expect(() => fitModel('logistic_growth', times.slice(0, 4).map(t => ({ x: t, y: 1 + t })))).toThrow(/at least 6/);
  });
});

describe('Hill equation', () => {
  it('recovers Bmax, K0.5 and the Hill coefficient', () => {
    const xs = Array.from({ length: 16 }, (_, i) => 10 ** (-1 + (i * 3.5) / 15));
    const data: DataPoint[] = xs.map((x, i) => ({ x, y: (80 * x ** 1.8) / (2.5 ** 1.8 + x ** 1.8) + noise(i, 0.5) }));
    const r = fitModel('hill', data);
    expect(Math.abs(val(r, 'Bmax') - 80) / 80).toBeLessThan(0.03);
    expect(Math.abs(val(r, 'K0.5') - 2.5) / 2.5).toBeLessThan(0.05);
    expect(Math.abs(val(r, 'n') - 1.8)).toBeLessThan(0.15);
    expect(r.parameters.every(p => p.standardError !== undefined)).toBe(true);
  });
  it('reduces to a rectangular hyperbola (Michaelis–Menten) when n = 1', () => {
    const xs = [0.2, 0.5, 1, 2, 4, 8, 16, 32];
    const data: DataPoint[] = xs.map(x => ({ x, y: (50 * x) / (3 + x) }));
    const h = fitModel('hill', data);
    const mm = fitModel('michaelis_menten', data);
    expect(val(h, 'n')).toBeCloseTo(1, 2);
    expect(val(h, 'K0.5')).toBeCloseTo(val(mm, 'Km'), 1);
  });
  it('rejects negative x', () => {
    expect(() => fitModel('hill', [{ x: -1, y: 1 }, { x: 1, y: 2 }, { x: 2, y: 3 }, { x: 3, y: 3 }])).toThrow(/non-negative/);
  });
});
