import { describe, expect, it } from 'vitest';
import { fitItcOneSite, itcHeats, GAS_CONSTANT_CAL, type ItcExperiment } from '@/core/fitting/itc';

const noise = (i: number, a: number) => a * Math.sin(i * 3.917 + 0.4);

function experiment(n: number, K: number, dHkcal: number, opts: { cellUm?: number; synUm?: number; noiseUcal?: number; unit?: ItcExperiment['heatUnit'] } = {}): ItcExperiment {
  const cellUm = opts.cellUm ?? 20, synUm = opts.synUm ?? 200;
  const volumes = [0.4, ...Array.from({ length: 19 }, () => 2)];
  const base = { cellVolumeUl: 200, cellConcUm: cellUm, syringeConcUm: synUm, volumesUl: volumes };
  const dQ = itcHeats(base, n, K, dHkcal * 1000).dQ;
  const heats = dQ.map((q, i) => {
    const ucal = q * 1e6 + noise(i, opts.noiseUcal ?? 0);
    const unit = opts.unit ?? 'ucal';
    return unit === 'ucal' ? ucal : unit === 'uJ' ? ucal * 4.184 : (ucal * 1e-6) / (volumes[i]! * 1e-6 * synUm * 1e-6) / 1000;
  });
  return { ...base, temperatureC: 25, volumesUl: volumes, heats, heatUnit: opts.unit ?? 'ucal' };
}

describe('ITC one-site heat model', () => {
  it('satisfies the law of mass action at every injection', () => {
    const n = 1, K = 5e6, dH = -9000; // cal/mol
    const e = { cellVolumeUl: 200, cellConcUm: 20, syringeConcUm: 200, volumesUl: Array(12).fill(3) };
    // Rebuild the cumulative heat Q_i and the bound complex concentration from it.
    const { Xt, Mt } = itcHeats(e, n, K, dH);
    let ok = 0;
    for (let i = 0; i < Xt.length; i++) {
      const b = 1 + Xt[i]! / Mt[i]! + 1 / (K * Mt[i]!);
      const ML = (Mt[i]! / 2) * (b - Math.sqrt(b * b - 4 * Xt[i]! / Mt[i]!));
      const free = (Mt[i]! - ML) * (Xt[i]! - ML) / ML;
      expect(free * K).toBeCloseTo(1, 8);
      ok++;
    }
    expect(ok).toBe(12);
  });

  it('gives ΔH per mole of injectant when binding is essentially stoichiometric (first injections, huge K)', () => {
    const e = { cellVolumeUl: 200, cellConcUm: 20, syringeConcUm: 200, volumesUl: [2, 2, 2] };
    const { dQ } = itcHeats(e, 1, 1e12, -10000);
    const molInj = 2e-6 * 200e-6;
    expect(dQ[0]! / molInj).toBeCloseTo(-10000, -1);
  });

  it('heats fall to the offset once the macromolecule is saturated', () => {
    const e = { cellVolumeUl: 200, cellConcUm: 10, syringeConcUm: 300, volumesUl: Array(30).fill(2) };
    const { dQ } = itcHeats(e, 1, 1e7, -8000, 3e-7);
    expect(Math.abs(dQ[29]! - 3e-7)).toBeLessThan(2e-7);
  });
});

describe('ITC fit', () => {
  it('recovers n, K and ΔH, and derives ΔG, −TΔS and KD consistently', () => {
    const fit = fitItcOneSite(experiment(1.05, 2e6, -12, { noiseUcal: 0.15 }));
    expect(Math.abs(fit.n - 1.05)).toBeLessThan(0.05);
    expect(Math.abs(Math.log10(fit.K) - Math.log10(2e6))).toBeLessThan(0.1);
    expect(Math.abs(fit.deltaH + 12)).toBeLessThan(0.3);
    expect(fit.deltaG).toBeCloseTo((-GAS_CONSTANT_CAL * 298.15 * Math.log(fit.K)) / 1000, 8);
    expect(fit.minusTdeltaS).toBeCloseTo(fit.deltaG - fit.deltaH, 10);
    expect(fit.KD * fit.K).toBeCloseTo(1, 10);
    expect(fit.cValue).toBeCloseTo(fit.n * fit.K * 20e-6, 6);
    expect(fit.parameters.find(p => p.symbol === 'K')!.ci95Low).toBeLessThan(fit.K);
    expect(fit.injections.length).toBe(20);
  });

  it('gives the same answer for µcal, µJ and kcal/mol-injectant data', () => {
    const a = fitItcOneSite(experiment(1, 1e6, -8, { noiseUcal: 0.1, unit: 'ucal' }));
    const b = fitItcOneSite(experiment(1, 1e6, -8, { noiseUcal: 0.1, unit: 'uJ' }));
    const c = fitItcOneSite(experiment(1, 1e6, -8, { noiseUcal: 0.1, unit: 'kcal/mol' }));
    expect(b.K / a.K).toBeCloseTo(1, 3);
    expect(c.deltaH).toBeCloseTo(a.deltaH, 3);
  });

  it('can fix n (low-c titration) and still recover ΔH and K', () => {
    const e = experiment(1, 3e4, -6, { cellUm: 30, synUm: 600, noiseUcal: 0.08 });
    const fit = fitItcOneSite(e, { fixedN: 1 });
    expect(fit.n).toBe(1);
    expect(fit.parameters[0]!.standardError).toBeUndefined();
    expect(Math.abs(Math.log10(fit.K) - Math.log10(3e4))).toBeLessThan(0.25);
    expect(fit.cValue).toBeLessThan(2);
  });

  it('flags a too-high c and a titration that stops before saturation', () => {
    const high = fitItcOneSite(experiment(1, 1e9, -10, { noiseUcal: 0.1 }));
    expect(high.notes.join(' ')).toMatch(/c > 1000/);
    const short = experiment(1, 1e6, -10, { cellUm: 20, synUm: 80, noiseUcal: 0.1 });
    expect(fitItcOneSite(short).notes.join(' ')).toMatch(/before saturation/);
  });

  it('fits a constant heat of dilution when asked and can skip the first injection', () => {
    const base = experiment(1, 1e6, -9, { noiseUcal: 0.05 });
    const shifted = { ...base, heats: base.heats.map(h => h + 0.8) }; // +0.8 µcal per injection
    const withOff = fitItcOneSite(shifted, { fitOffset: true, skipFirst: true });
    expect(withOff.parameters.find(p => p.symbol === 'offset')!.value).toBeCloseTo(0.8, 0);
    expect(withOff.injections[0]!.excluded).toBe(true);
    expect(Math.abs(withOff.deltaH + 9)).toBeLessThan(0.3);
  });

  it('validates input', () => {
    const e = experiment(1, 1e6, -9);
    expect(() => fitItcOneSite({ ...e, heats: e.heats.slice(1) })).toThrow(/each injection/i);
    expect(() => fitItcOneSite({ ...e, volumesUl: [1, 1, 1], heats: [1, 1, 1] })).toThrow(/at least 8/);
    expect(() => fitItcOneSite({ ...e, cellConcUm: 0 })).toThrow(/positive/);
    expect(() => fitItcOneSite(e, { fixedN: -1 })).toThrow(/positive/);
  });
});
