import { describe, expect, it } from 'vitest';
import { fitSprGlobal, parseSensorgrams, type Sensorgram } from '@/core/fitting/spr';

const noise = (i: number, a: number) => a * Math.sin(i * 4.313 + 0.2);
const KON = 2e5, KOFF = 1e-3, RMAX = 100, TD = 300;
function curve(cM: number, label: string, seed: number, rmax = RMAX, amp = 0.15): Sensorgram {
  const t = Array.from({ length: 121 }, (_, i) => i * 8); // 0–960 s
  const kobs = KON * cM + KOFF, req = (rmax * KON * cM) / kobs;
  const r = t.map((x, i) => (x <= TD ? req * (1 - Math.exp(-kobs * x)) : req * (1 - Math.exp(-kobs * TD)) * Math.exp(-KOFF * (x - TD))) + noise(i + seed, amp));
  return { label, conc: cM, t, r };
}
const concs = [1.5625e-9, 3.125e-9, 6.25e-9, 12.5e-9, 25e-9, 50e-9].map((c, i) => curve(c, `${(c * 1e9).toFixed(2)} nM`, i * 17));
const get = (f: { parameters: { symbol: string; value: number }[] }, s: string) => f.parameters.find(p => p.symbol === s)!.value;

describe('SPR/BLI table parser', () => {
  it('reads concentrations with units from the header and skips empty cells', () => {
    const c = parseSensorgrams('Time\t12.5 nM\t100nM\t0.5 µM\n0\t1\t2\t3\n1\t2\t3\t4\n2\t\t4\t5\n3\t4\t5\t6\n', 'nM');
    [12.5e-9, 100e-9, 0.5e-6].forEach((v, i) => expect(c[i]!.conc! / v).toBeCloseTo(1, 12));
    expect(c[0]!.t).toEqual([0, 1, 3]);
  });
  it('uses the default unit for bare numbers and leaves unlabeled columns without a concentration', () => {
    const c = parseSensorgrams('t,10,20,ref\n0,1,2,3\n1,2,3,4\n2,3,4,5\n', 'uM');
    expect(c[0]!.conc).toBeCloseTo(10e-6, 12);
    expect(c[2]!.conc).toBeUndefined();
  });
  it('returns nothing for empty input', () => expect(parseSensorgrams('')).toEqual([]));
});

describe('global 1:1 kinetic fit', () => {
  it('recovers kon, koff, Rmax and KD from six concentrations', () => {
    const f = fitSprGlobal(concs, { tDissStart: TD });
    expect(Math.abs(Math.log10(f.kon) - Math.log10(KON))).toBeLessThan(0.03);
    expect(Math.abs(Math.log10(f.koff) - Math.log10(KOFF))).toBeLessThan(0.03);
    expect(Math.abs(get(f, 'Rmax') - RMAX) / RMAX).toBeLessThan(0.02);
    expect(get(f, 'KD')).toBeCloseTo((f.koff / f.kon) * 1e9, 8);
    expect(Math.abs(get(f, 'KD') - 5) / 5).toBeLessThan(0.08);
    expect(get(f, 't1/2')).toBeCloseTo(Math.LN2 / f.koff, 8);
    expect(f.r2).toBeGreaterThan(0.999);
    expect(f.series.length).toBe(6);
    // Slow association: low-concentration curves never reach equilibrium, so no steady-state KD is offered.
    expect(f.KDsteadyState).toBeUndefined();
  });

  it('offers a steady-state KD that agrees with the kinetic KD when curves reach equilibrium', () => {
    const kon = 1e6, koff = 1e-2, td = 300;
    const mk = (c: number, seed: number): Sensorgram => {
      const t = Array.from({ length: 101 }, (_, i) => i * 6);
      const kobs = kon * c + koff, req = (80 * kon * c) / kobs;
      return { label: `${c * 1e9} nM`, conc: c, t, r: t.map((x, i) => (x <= td ? req * (1 - Math.exp(-kobs * x)) : req * (1 - Math.exp(-kobs * td)) * Math.exp(-koff * (x - td))) + noise(i + seed, 0.1)) };
    };
    const f = fitSprGlobal([5, 10, 20, 40, 80, 160].map((n, i) => mk(n * 1e-9, i * 11)), { tDissStart: td });
    expect(f.KDsteadyState).toBeDefined();
    expect(f.KDsteadyState! / f.KD).toBeGreaterThan(0.85);
    expect(f.KDsteadyState! / f.KD).toBeLessThan(1.18);
    expect(Math.abs(f.KD * 1e9 - 10) / 10).toBeLessThan(0.05);
  });

  it('fits per-curve Rmax and baseline offsets when asked', () => {
    const varied = concs.map((c, i) => ({ ...curve(c.conc!, c.label, i * 17, RMAX * (0.9 + 0.04 * i)), }));
    const shifted = varied.map((c, i) => ({ ...c, r: c.r.map(v => v + (i - 2) * 0.8) }));
    const f = fitSprGlobal(shifted, { tDissStart: TD, globalRmax: false, fitBaseline: true });
    expect(Math.abs(Math.log10(f.koff) - Math.log10(KOFF))).toBeLessThan(0.08);
    expect(f.rmax.length).toBe(6);
    expect(f.rmax[5]! / f.rmax[0]!).toBeCloseTo(1.2 / 0.9, 0);
  });

  it('warns when the series is too narrow or too far above KD', () => {
    const high = [200e-9, 300e-9, 400e-9, 500e-9].map((c, i) => curve(c, `${c * 1e9} nM`, i));
    const f = fitSprGlobal(high, { tDissStart: TD });
    expect(f.notes.join(' ')).toMatch(/above KD|spans less than 5-fold/);
  });

  it('gives readable errors', () => {
    expect(() => fitSprGlobal([concs[0]!], { tDissStart: TD })).toThrow(/at least two curves/);
    expect(() => fitSprGlobal(concs, { tDissStart: 5000 })).toThrow(/no points after/);
    expect(() => fitSprGlobal(concs, { tDissStart: 10 })).toThrow(/fewer than 4 points/);
  });
});
