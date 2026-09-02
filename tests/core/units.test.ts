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
});
