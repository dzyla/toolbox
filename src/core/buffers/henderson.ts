export interface BufferPKa { id: string; name: string; pKa25: number; dpKadT: number }

/* Good et al., Biochemistry 5:467–477 (1966), doi:10.1021/bi00866a011,
   supplemented with supplier temperature-coefficient tables. */
export const BUFFER_PKA: BufferPKa[] = [
  { id: 'tris', name: 'Tris', pKa25: 8.06, dpKadT: -0.028 },
  { id: 'hepes', name: 'HEPES', pKa25: 7.48, dpKadT: -0.014 },
  { id: 'mes', name: 'MES', pKa25: 6.10, dpKadT: -0.011 },
  { id: 'mops', name: 'MOPS', pKa25: 7.14, dpKadT: -0.015 },
  { id: 'pipes', name: 'PIPES', pKa25: 6.76, dpKadT: -0.0085 },
  { id: 'phosphate', name: 'Phosphate (pKa2)', pKa25: 7.20, dpKadT: -0.0028 },
];

const finite = (value: number, label: string) => {
  if (!Number.isFinite(value)) throw new RangeError(`${label} must be finite`);
};

/** Henderson-Hasselbalch rearrangement: [base]/[acid] = 10^(pH-pKa). */
export function ratioBaseAcid(pH: number, pKa: number): number {
  finite(pH, 'pH'); finite(pKa, 'pKa');
  return 10 ** (pH - pKa);
}

/** Linear temperature correction relative to 25 °C. */
export function pKaAtTemperature(pKa25: number, dpKadT: number, temperature_C: number): number {
  finite(pKa25, 'pKa at 25 °C'); finite(dpKadT, 'dpKa/dT'); finite(temperature_C, 'Temperature');
  return pKa25 + dpKadT * (temperature_C - 25);
}
