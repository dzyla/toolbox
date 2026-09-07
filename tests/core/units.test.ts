import { describe, it, expect } from 'vitest';
import { parseQuantity, toSI, convert, formatSI, dimOf, UnitError } from '@/core/units';

describe('units', () => {
  it('parses text with prefixes and unicode', () => {
    expect(parseQuantity('10 mM')).toMatchObject({ value: 10, unit: 'mM', si: 0.01, dim: 'concentration' });
    const ul = parseQuantity('2.5 µL')!;
    expect(ul).toMatchObject({ value: 2.5, unit: 'µL', dim: 'volume' });
    expect(ul.si).toBeCloseTo(2.5e-6, 12);
    expect(parseQuantity('2.5 uL')).toMatchObject({ unit: 'µL' });
    expect(parseQuantity('2.5ul')).toMatchObject({ unit: 'µL' });
    expect(parseQuantity('3 ml')).toMatchObject({ unit: 'mL' });
    expect(parseQuantity('1e-7 M')).toMatchObject({ si: 1e-7 });
    expect(parseQuantity('5 mg/mL')).toMatchObject({ dim: 'massconc', si: 5 });
    expect(parseQuantity('100 ng/µL')).toMatchObject({ dim: 'massconc', si: 0.1 });
    expect(parseQuantity('100 ng/ul')).toMatchObject({ unit: 'ng/µL' });
    expect(parseQuantity('12', 'volume')).toBeNull();
    expect(parseQuantity('abc')).toBeNull();
    expect(parseQuantity('10 mM', 'volume')).toBeNull();
  });
  it('converts within a dimension and refuses across', () => {
    expect(convert(1, 'mL', 'µL')).toBeCloseTo(1000);
    expect(convert(250, 'nM', 'µM')).toBeCloseTo(0.25);
    expect(convert(1, 'mg', 'g')).toBeCloseTo(0.001);
    expect(() => convert(1, 'mL', 'mM')).toThrow(UnitError);
    expect(() => toSI({ value: 1, unit: 'furlong' })).toThrow(UnitError);
  });
  it('formats with a sensible unit', () => {
    expect(formatSI(0.00025, 'concentration')).toMatchObject({ value: 250, unit: 'µM' });
    expect(formatSI(0.0125, 'volume').text).toBe('12.5 mL');
    expect(formatSI(0, 'mass').text).toBe('0 g');
    expect(formatSI(2.5e-9, 'amount', { sig: 2 }).text).toBe('2.5 nmol');
    expect(formatSI(1500, 'mass').text).toBe('1.5 kg');
    expect(formatSI(0.2922, 'mass').text).toBe('292.2 mg');
  });
  it('knows dimensions', () => {
    expect(dimOf('pM')).toBe('concentration');
    expect(dimOf('Å')).toBe('length');
    expect(dimOf('nope')).toBeUndefined();
  });
  it('radioactivity: reference values (Ci defined from ²²⁶Ra: 1 Ci = 3.7e10 Bq exactly)', () => {
    expect(convert(1, 'Ci', 'Bq')).toBe(3.7e10);
    expect(convert(1, 'mCi', 'kBq')).toBeCloseTo(37000, 8);
    expect(convert(1, 'µCi', 'Bq')).toBeCloseTo(3.7e4, 8);
    expect(convert(1, 'MBq', 'Ci')).toBeCloseTo(1 / 37000, 10);
  });
  it('radiation dose: 1 rem = 0.01 Sv, SI prefixes on both Gy and Sv', () => {
    expect(convert(1, 'rem', 'Sv')).toBeCloseTo(0.01, 12);
    expect(convert(1, 'mrem', 'mSv')).toBeCloseTo(0.01, 10);
    expect(convert(250, 'mSv', 'µSv')).toBeCloseTo(250000, 6);
    expect(convert(1, 'Gy', 'mGy')).toBeCloseTo(1000, 10);
  });
  it('pressure: 1 atm = 101325 Pa, 1 bar = 1e5 Pa, 1 mmHg = 133.322368 Pa (Torr = 101325/760)', () => {
    expect(convert(1, 'atm', 'Pa')).toBe(101325);
    expect(convert(1, 'bar', 'kPa')).toBeCloseTo(100, 10);
    expect(convert(760, 'mmHg', 'Pa')).toBeCloseTo(101325, 2);
    expect(convert(1, 'Torr', 'mmHg')).toBeCloseTo(1, 10);
    expect(convert(1, 'psi', 'kPa')).toBeCloseTo(6.894757, 4);
    expect(convert(1, 'mbar', 'Pa')).toBe(100);
  });
  it('parses new-dimension quantities and formats them', () => {
    expect(parseQuantity('3.7 kBq')).toMatchObject({ value: 3.7, unit: 'kBq', dim: 'activity' });
    expect(parseQuantity('1.5 mSv')).toMatchObject({ value: 1.5, unit: 'mSv', dim: 'radiation' });
    expect(parseQuantity('760 mmHg')).toMatchObject({ value: 760, unit: 'mmHg', dim: 'pressure' });
    expect(formatSI(3.7e10, 'activity')).toMatchObject({ value: 37, unit: 'GBq' });
    expect(formatSI(101325, 'pressure')).toMatchObject({ value: 101.3, unit: 'kPa' });
    expect(['mGy', 'mSv']).toContain(formatSI(0.001, 'radiation').unit);
  });
});
