import { describe, expect, it } from 'vitest';
import { simulateGradient, suggestIonExchange } from '@/core/chromatography';

describe('chromatography method advice', () => {
  it('suggests cation exchange when target pH is at least one unit below pI', () => {
    const advice = suggestIonExchange({ proteinPi: 9, targetPh: 7 });

    expect(advice).toMatchObject({
      status: 'suggested',
      mode: 'cation-exchange',
      piDistance: 2,
    });
  });

  it('requires review when pI is within one pH unit of the target', () => {
    expect(suggestIonExchange({ proteinPi: 7.2, targetPh: 7 })).toMatchObject({
      status: 'review-required',
      mode: undefined,
    });
  });

  it('suggests anion exchange at least one pH unit above pI and exposes editable buffer descriptions', () => {
    const advice = suggestIonExchange({ proteinPi: 5.5, targetPh: 7 });

    expect(advice).toMatchObject({ status: 'suggested', mode: 'anion-exchange' });
    expect(advice.bufferA.name).toBe('Buffer A');
    expect(advice.bufferB.name).toBe('Buffer B');
  });

  it('accepts a pI distance of exactly one pH unit', () => {
    expect(suggestIonExchange({ proteinPi: 8, targetPh: 7 }).status).toBe('suggested');
  });
});

describe('gradient simulator', () => {
  it('ends a linear gradient at its requested buffer-B percentage', () => {
    const result = simulateGradient({
      columnVolumeMl: 5,
      flowMlPerMin: 1,
      startPercentB: 0,
      endPercentB: 100,
      gradientCv: 10,
    });

    expect(result.atGradientEnd.percentB).toBe(100);
    expect(result.atGradientEnd).toMatchObject({ columnVolumes: 10, volumeMl: 50, timeMin: 50 });
  });

  it('keeps %B constant during optional hold segments', () => {
    const result = simulateGradient({
      columnVolumeMl: 2,
      flowMlPerMin: 1,
      startPercentB: 10,
      endPercentB: 70,
      startHoldCv: 2,
      gradientCv: 4,
      endHoldCv: 3,
    });

    expect(result.points).toEqual([
      { phase: 'start', columnVolumes: 0, volumeMl: 0, timeMin: 0, percentB: 10 },
      { phase: 'start-hold-end', columnVolumes: 2, volumeMl: 4, timeMin: 4, percentB: 10 },
      { phase: 'gradient-end', columnVolumes: 6, volumeMl: 12, timeMin: 12, percentB: 70 },
      { phase: 'end-hold-end', columnVolumes: 9, volumeMl: 18, timeMin: 18, percentB: 70 },
    ]);
  });

  it.each([
    [{ columnVolumeMl: 5, flowMlPerMin: 0, startPercentB: 0, endPercentB: 100, gradientCv: 10 }, 'Flow'],
    [{ columnVolumeMl: 5, flowMlPerMin: 1, startPercentB: 0, endPercentB: 100, gradientCv: 0 }, 'Gradient CV'],
  ])('rejects invalid gradient inputs: %s', (input, message) => {
    expect(() => simulateGradient(input)).toThrow(message);
  });
});
