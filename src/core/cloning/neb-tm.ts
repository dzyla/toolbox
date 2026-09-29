/* Primer Tm as NEB's tools compute it (NEBuilder, NEBaseChanger, NEB Tm Calculator).

   Both methods use SantaLucia (1998) unified nearest-neighbour parameters with
   per-end initiation (A·T end +2.3 kcal/mol, +4.1 eu; G·C end +0.1 kcal/mol, −2.8 eu)
   and −1.4 eu for self-complementary sequences.
   - Method 4 (all polymerases except Phusion): Tm = ΔH / (ΔS + R ln Ct) with the
     full primer concentration Ct, then Owczarzy et al. (2004) monovalent-salt
     correction 1/Tm + (4.29·fGC − 3.95)·10⁻⁵·ln[Na⁺] + 9.4·10⁻⁶·ln²[Na⁺].
   - Method 5 (Phusion): the same with Ct/4, plus Schildkraut & Lifson (1965)
     16.6·log10[Na⁺].
   Verified against NEBuilder v2.11.2 over 174 oligos × 30 conditions
   (tests/fixtures/vendor/nebuilder/tm.json). */

import { NN_STACKS, R_GAS } from '@/core/nucleic/tm';

export type NebTmMethod = 4 | 5;

export interface NebTmConditions {
  method: NebTmMethod;
  /** Monovalent-cation equivalent of the PCR buffer, mM. */
  monovalentMm: number;
  /** Concentration of each primer, nM. */
  primerNm: number;
}

const COMPLEMENT: Record<string, string> = { A: 'T', C: 'G', G: 'C', T: 'A' };

function stack(pair: string): { dH: number; dS: number } | undefined {
  const reverse = COMPLEMENT[pair[1]!]! + COMPLEMENT[pair[0]!]!;
  const table = NN_STACKS as Record<string, { dH: number; dS: number }>;
  return table[`${pair}/${COMPLEMENT[pair[0]!]}${COMPLEMENT[pair[1]!]}`]
    ?? table[`${reverse}/${COMPLEMENT[reverse[0]!]}${COMPLEMENT[reverse[1]!]}`];
}

export function nebTm(sequence: string, conditions: NebTmConditions): number {
  const seq = sequence.toUpperCase().replace(/U/g, 'T');
  const n = seq.length;
  if (n < 2) return Number.NaN;
  let dH = 0; // cal/mol
  let dS = 0; // cal/(mol·K)
  for (const end of [seq[0]!, seq[n - 1]!]) {
    if (end === 'A' || end === 'T') { dH += 2300; dS += 4.1; }
    else if (end === 'G' || end === 'C') { dH += 100; dS += -2.8; }
  }
  for (let i = 0; i < n - 1; i++) {
    const params = stack(seq.slice(i, i + 2));
    if (!params) return Number.NaN;
    dH += params.dH * 1000;
    dS += params.dS;
  }
  const reverseComplement = [...seq].reverse().map(base => COMPLEMENT[base]).join('');
  if (reverseComplement === seq) dS += -1.4;

  const ctMolar = conditions.primerNm * 1e-9 / (conditions.method === 5 ? 4 : 1);
  const tmKelvin = dH / (dS + R_GAS * Math.log(ctMolar));
  const na = conditions.monovalentMm / 1000;
  if (conditions.method === 5) return tmKelvin + 16.6 * Math.log10(na) - 273.15;
  const gc = [...seq].filter(base => base === 'G' || base === 'C').length;
  const at = [...seq].filter(base => base === 'A' || base === 'T').length;
  const fGc = gc / (gc + at);
  const lnNa = Math.log(na);
  return 1 / (1 / tmKelvin + 1e-5 * (4.29 * fGc - 3.95) * lnNa + 9.4e-6 * lnNa * lnNa) - 273.15;
}

/** NEB's display rounding: one decimal, half away from zero on the tenths. */
export function roundTenth(value: number): number {
  return Math.round(value * 10) / 10;
}

/** Wallace rule (4·GC + 2·AT), used by NEBuilder to judge overlaps. */
export function wallaceTm(sequence: string): number {
  let tm = 0;
  for (const base of sequence.toUpperCase()) tm += base === 'G' || base === 'C' ? 4 : 2;
  return tm;
}
