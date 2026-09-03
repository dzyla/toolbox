import { describe, expect, it } from 'vitest';
import { AmmoniumSulfateError, gramsToAdd } from '@/core/reactions/ammonium-sulfate';
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
