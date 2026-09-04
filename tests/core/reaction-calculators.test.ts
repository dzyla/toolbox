import { describe, expect, it } from 'vitest';
import { AmmoniumSulfateError, gramsToAdd, predictSaltingOut, predictFromSequence } from '@/core/reactions/ammonium-sulfate';
import { MasterMixError, masterMix } from '@/core/reactions/mastermix';
import { SerialDilutionError, plan } from '@/core/reactions/serial-dilution';

describe('master mix', () => {
  it('scales components, water, excess and dead volume proportionally', () => {
    const result = masterMix({
      reactionVolume: 20,
      reactions: 10,
      excessPercent: 10,
      deadVolume: 20,
      components: [
        { name: '10x buffer', perReaction: 2 },
        { name: 'Enzyme', perReaction: 0.5 },
        { name: 'Template', perReaction: 1 },
      ],
    });
    expect(result.effectiveReactions).toBeCloseTo(11, 12);
    expect(result.totalVolume).toBeCloseTo(240, 12);
    expect(result.rows.map(r => [r.name, r.total])).toEqual([
      ['10x buffer', 24],
      ['Enzyme', 6],
      ['Template', 12],
      ['Water', 198],
    ]);
  });

  it('rejects components that exceed the per-reaction volume', () => {
    expect(() => masterMix({ reactionVolume: 10, reactions: 1, excessPercent: 0, deadVolume: 0,
      components: [{ name: 'Reagent', perReaction: 11 }] })).toThrow(MasterMixError);
  });
});

describe('ammonium sulfate cut', () => {
  it('matches the audited 25 °C and 0–4 °C reference values', () => {
    expect(gramsToAdd(0, 50, 1, 25)).toBeCloseTo(313.5, 1);
    expect(gramsToAdd(0, 50, 1, 0)).toBeCloseTo(297.7, 1);
  });

  it('rejects invalid saturation cuts', () => {
    expect(() => gramsToAdd(50, 50, 1, 25)).toThrow(AmmoniumSulfateError);
    expect(() => gramsToAdd(60, 50, 1, 25)).toThrow(/exceed/i);
    expect(() => gramsToAdd(0, 100, 1, 25)).toThrow(/below 100/i);
  });

  it('predicts Cohn salting-out parameters and fractional precipitation curves', () => {
    // Large hydrophobic protein: MW 150 kDa, pI 7.0, GRAVY -0.15 (like IgG)
    const igg = predictSaltingOut({ mwDa: 150_000, pI: 7.0, gravy: -0.15, pH: 7.0, initialConcMgMl: 2.0 });
    // Small hydrophilic protein: MW 14.3 kDa, pI 11.0, GRAVY -0.47 (like Lysozyme)
    const lyso = predictSaltingOut({ mwDa: 14_300, pI: 11.0, gravy: -0.47, pH: 7.0, initialConcMgMl: 2.0 });

    // Large hydrophobic protein must precipitate at LOWER saturation than small hydrophilic protein
    expect(igg.onsetSaturation).toBeLessThan(lyso.onsetSaturation);
    expect(igg.completeSaturation).toBeLessThan(lyso.completeSaturation);
    expect(igg.ks).toBeGreaterThan(lyso.ks); // larger slope

    // Verify curve has expected points and boundaries
    expect(igg.curve.length).toBeGreaterThan(40);
    expect(igg.curve[0]?.percentPrecipitated).toBe(0);
    expect(igg.curve[igg.curve.length - 1]?.percentPrecipitated).toBe(100);
  });

  it('demonstrates salting-in shift away from isoelectric point (pI)', () => {
    // Protein at pI (minimum solubility)
    const atPi = predictSaltingOut({ mwDa: 50_000, pI: 7.0, gravy: -0.3, pH: 7.0 });
    // Protein away from pI (charged surface -> higher solubility -> higher onset saturation)
    const awayPi = predictSaltingOut({ mwDa: 50_000, pI: 7.0, gravy: -0.3, pH: 4.5 });

    expect(awayPi.beta).toBeGreaterThan(atPi.beta);
    expect(awayPi.onsetSaturation).toBeGreaterThanOrEqual(atPi.onsetSaturation);
  });

  it('predicts precipitation directly from protein sequence', () => {
    // Lysozyme C fragment (Gallus gallus)
    const seq = 'KVFGRCELAAAMKRHGLDNYRGYSLGNWVCAAKFESNFNTQATNRNTDGSTDYGILQINSRWWCNDGRTPGSRNLCNIPCSALLSSDITASVNCAKKIVSDGNGMNAWVAWRNRCKGTDVQAWIRGCRL';
    const result = predictFromSequence(seq, { pH: 7.0, initialConcMgMl: 2.0 });
    expect(result.mwDa).toBeGreaterThan(13_000);
    expect(result.mwDa).toBeLessThan(16_000);
    expect(result.pI).toBeGreaterThan(9.0);
    expect(result.onsetSaturation).toBeGreaterThanOrEqual(50);
    expect(result.recommendedTargetCut).toBeGreaterThan(result.recommendedPreCut);
  });
});

describe('serial dilution plan', () => {
  it('plans two-fold wells with enough starting solution to leave 100 µL per well', () => {
    const rows = plan({ startConc: 100, factor: 2, steps: 4, wellVolume: 100 });
    expect(rows.map(r => r.concentration)).toEqual([100, 50, 25, 12.5]);
    expect(rows[0]).toMatchObject({ well: 1, transferVolume: 100, diluentVolume: 0, preparationVolume: 200 });
    expect(rows[1]).toMatchObject({ well: 2, transferVolume: 100, diluentVolume: 100, preparationVolume: 200 });
    expect(rows[0]).toMatchObject({ transfer: 100, diluent: 100 });
  });

  it('rejects factors at or below one and fractional step counts', () => {
    expect(() => plan({ startConc: 100, factor: 1, steps: 4, wellVolume: 100 })).toThrow(SerialDilutionError);
    expect(() => plan({ startConc: 100, factor: 2, steps: 2.5, wellVolume: 100 })).toThrow(/integer/i);
  });
});
