import { describe, expect, it } from 'vitest';
import { parseChromatogram, uv280MilliAbsorbanceToAu } from '@/core/chromatography';

describe('chromatogram import', () => {
  it('maps UNICORN-style channel aliases and imported fraction labels', () => {
    const parsed = parseChromatogram('Volume (ml),UV 280 (mAU),Cond (mS/cm),Fraction\n1.0,10,2,F1\n');

    expect(parsed.points).toEqual([{ volumeMl: 1, uv280: 10, conductivityMsCm: 2 }]);
    expect(parsed.fractions).toEqual([{ label: 'F1' }]);
    expect(parsed.mappedHeaders).toEqual({
      volumeMl: 'Volume (ml)', uv280: 'UV 280 (mAU)', conductivityMsCm: 'Cond (mS/cm)', fraction: 'Fraction',
    });
  });

  it('uses a caller-selected mapping for generic CSV columns', () => {
    const parsed = parseChromatogram('position,signal\n2.5,321\n', { volumeMl: 0, uv280: 1 });

    expect(parsed.points).toEqual([{ volumeMl: 2.5, uv280: 321 }]);
    expect(parsed.mappedHeaders).toEqual({ volumeMl: 'position', uv280: 'signal' });
  });

  it('parses tab-separated canonical channels', () => {
    const parsed = parseChromatogram('Time (min)\t%A\tBuffer B\tpH\n1.5\t25\t75\t7.4\n');

    expect(parsed.points).toEqual([{ timeMin: 1.5, percentB: 75, ph: 7.4 }]);
  });

  it('returns notices and no points for input without an axis mapping', () => {
    const parsed = parseChromatogram('operator,signal\nAda,10\n');

    expect(parsed.points).toEqual([]);
    expect(parsed.notices).toContain('No volume or time column was mapped; no chromatogram points were imported.');
  });

  it('derives volume from a time-only import only when explicitly given a flow rate', () => {
    const parsed = parseChromatogram('Time (min),A280\n1.5,250\n', { flowMlPerMin: 2 });

    expect(parsed.points).toEqual([{ timeMin: 1.5, volumeMl: 3, uv280: 250 }]);
  });

  it('skips duplicate-axis and invalid rows with notices', () => {
    const parsed = parseChromatogram('Volume,UV280\n1,10\n1,11\nbad,12\n2,not-a-number\n');

    expect(parsed.points).toEqual([{ volumeMl: 1, uv280: 10 }, { volumeMl: 2 }]);
    expect(parsed.notices).toEqual([
      'Row 3: duplicate volume value 1 skipped.',
      'Row 4: invalid volume value skipped.',
      'Row 5: nonnumeric UV 280 value omitted.',
    ]);
  });

  it('keeps manual fraction bounds alongside imported fraction labels', () => {
    const parsed = parseChromatogram('Volume,Fraction\n1,F1\n2,F2\n', {
      fractionBounds: [{ label: 'Pool A', startVolumeMl: 1.1, endVolumeMl: 1.9 }],
    });

    expect(parsed.fractions).toEqual([
      { label: 'F1' },
      { label: 'F2' },
      { label: 'Pool A', startVolumeMl: 1.1, endVolumeMl: 1.9 },
    ]);
  });

  it('leaves UV 280 readings in mAU unless the named derived accessor is used', () => {
    const parsed = parseChromatogram('Volume,UV280\n1,1250\n');

    expect(parsed.points[0]?.uv280).toBe(1250);
    expect(uv280MilliAbsorbanceToAu(parsed.points[0]!)).toBe(1.25);
  });
});
