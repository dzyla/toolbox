/* Oligonucleotide melting temperatures.
   - Wallace rule: Tm = 2·(A+T) + 4·(G+C) °C. Wallace RB et al. (1979) Nucleic Acids Res 6:3543. For oligos < 14 nt.
   - Basic (Marmur–Doty type, 50 mM Na+): Tm = 64.9 + 41·(G+C − 16.4)/N. Marmur J, Doty P (1962) J Mol Biol 5:109 as
     used by OligoCalc (Kibbe WA (2007) Nucleic Acids Res 35:W43). For oligos ≥ 14 nt.
   - Salt-adjusted basic: Tm = 100.5 + 41·(G+C)/N − 820/N + 16.6·log10[Na+]. Howley PM et al. (1979) J Biol Chem 254:4876 (OligoCalc form).
   - Nearest neighbour: SantaLucia J Jr (1998) Proc Natl Acad Sci USA 95:1460 unified parameters (src/data/nn-santalucia.json);
     Tm = ΔH·1000 / (ΔS + R·ln k) with k = [primer] − [template]/2 for non-self-complementary duplexes (or [strand] for
     self-complementary ones, with the symmetry term). Salt: Owczarzy R et al. (2004) Biochemistry 43:3537 eq. 22 (Na+);
     Owczarzy R et al. (2008) Biochemistry 47:5336 eq. 16, 18–20 (Mg2+, dNTP binding Ka = 3e4 M⁻¹);
     SantaLucia 1998 ΔS + 0.368·(N−1)·ln[Na+] as an alternative.
   Reference values in tests/core/nucleic-tm.test.ts were pinned against Biopython 1.88 Bio.SeqUtils.MeltingTemp.Tm_NN
   (nn_table=DNA_NN3, which is this table) and a hand derivation. */
import nn from '@/data/nn-santalucia.json';
import { NucleicError, reverseComplement } from './sequence';

export interface TmResult { tm: number; warnings: string[] }

export function baseCounts(seq: string) {
  const c = { A: 0, C: 0, G: 0, T: 0, other: 0, n: 0 };
  for (const ch of seq.toUpperCase()) {
    if (ch === 'A') c.A++; else if (ch === 'C') c.C++; else if (ch === 'G') c.G++; else if (ch === 'T' || ch === 'U') c.T++; else c.other++;
    c.n++;
  }
  return c;
}
function checkSeq(seq: string) {
  const c = baseCounts(seq);
  if (c.n === 0) throw new NucleicError('Empty sequence');
  if (c.other > 0) throw new NucleicError('Tm needs an unambiguous A/C/G/T(U) sequence');
  return c;
}

export const WALLACE_MAX = 13;
/** Wallace rule, meant for oligos of up to 13 nt. */
export function tmWallace(seq: string): TmResult {
  const c = checkSeq(seq);
  const warnings = c.n > WALLACE_MAX ? [`Wallace rule is meant for oligos < 14 nt (this one is ${c.n} nt).`] : [];
  return { tm: 2 * (c.A + c.T) + 4 * (c.G + c.C), warnings };
}

export const BASIC_MIN = 14;
/** 64.9 + 41·(G+C − 16.4)/N; assumes 50 mM Na+. */
export function tmBasic(seq: string): TmResult {
  const c = checkSeq(seq);
  const warnings = c.n < BASIC_MIN ? [`Basic formula is meant for oligos ≥ 14 nt (this one is ${c.n} nt).`] : [];
  return { tm: 64.9 + (41 * (c.G + c.C - 16.4)) / c.n, warnings };
}

/** Salt-adjusted basic formula; Na in mM. */
export function tmSaltAdjusted(seq: string, naMM = 50): TmResult {
  const c = checkSeq(seq);
  if (!(naMM > 0)) throw new NucleicError('[Na+] must be > 0');
  const warnings = c.n < BASIC_MIN ? [`Salt-adjusted formula is meant for oligos ≥ 14 nt (this one is ${c.n} nt).`] : [];
  return { tm: 100.5 + (41 * (c.G + c.C)) / c.n - 820 / c.n + 16.6 * Math.log10(naMM / 1000), warnings };
}

/* ---------- nearest neighbour ---------- */
type Pair = { dH: number; dS: number };
const NN = nn as { stacks: Record<string, Pair>; init_GC: Pair; init_AT: Pair; sym: Pair; R_cal_per_mol_K: number };
export const NN_STACKS = NN.stacks;
export const R_GAS = NN.R_cal_per_mol_K;

const COMP: Record<string, string> = { A: 'T', T: 'A', C: 'G', G: 'C' };
function stack(x: string, y: string): Pair {
  const key = `${x}${y}/${COMP[x]}${COMP[y]}`;
  const p = NN.stacks[key] ?? NN.stacks[`${COMP[y]}${COMP[x]}/${y}${x}`];
  if (!p) throw new NucleicError(`No nearest-neighbour entry for ${x}${y}`);
  return p;
}

export type SaltCorrection = 'owczarzy2004' | 'owczarzy2008' | 'santalucia1998' | 'none';
export interface NNOptions {
  /** Primer (excess strand) concentration, nM. */ primerNM?: number;
  /** Template (limiting strand) concentration, nM; defaults to the primer concentration. */ templateNM?: number;
  naMM?: number; kMM?: number; trisMM?: number; mgMM?: number; dntpMM?: number;
  /** Default: owczarzy2008 when Mg2+ is given, else owczarzy2004. */ saltCorrection?: SaltCorrection;
  /** Override the automatic self-complementarity check. */ selfComplementary?: boolean;
}
export interface NNResult extends TmResult {
  dH: number; dS: number; /** effective strand concentration k, mol/L */ k: number;
  selfComplementary: boolean; saltCorrection: SaltCorrection; /** Tm before salt correction (1 M Na+). */ tm1M: number;
}
export const NN_MIN = 8, NN_MAX = 60;

/** Sum of stacking, initiation and symmetry terms; ΔH kcal/mol, ΔS cal/(mol·K). */
export function nnThermodynamics(seq: string, selfComplementary: boolean): { dH: number; dS: number } {
  const s = seq.toUpperCase().replace(/U/g, 'T');
  let dH = 0, dS = 0;
  for (let i = 0; i + 1 < s.length; i++) { const p = stack(s[i]!, s[i + 1]!); dH += p.dH; dS += p.dS; }
  for (const end of [s[0]!, s[s.length - 1]!]) { const p = end === 'G' || end === 'C' ? NN.init_GC : NN.init_AT; dH += p.dH; dS += p.dS; }
  if (selfComplementary) { dH += NN.sym.dH; dS += NN.sym.dS; }
  return { dH, dS };
}

/** Owczarzy 2004 eq. 22: 1/Tm(Na) = 1/Tm(1 M) + (4.29·fGC − 3.95)·1e-5·ln[Na+] + 9.40e-6·ln²[Na+]. Returns the 1/Tm increment (K⁻¹). */
export function owczarzy2004(fGC: number, monM: number): number {
  const ln = Math.log(monM);
  return (4.29 * fGC - 3.95) * 1e-5 * ln + 9.4e-6 * ln * ln;
}
/** Owczarzy 2008 eq. 16 with the decision tree of eq. 18–20; concentrations in mol/L. Returns the 1/Tm increment (K⁻¹). */
export function owczarzy2008(fGC: number, nbp: number, monM: number, mgM: number, dntpM = 0): number {
  let a = 3.92, d = 1.42, g = 8.31;
  const b = -0.911, c = 6.26, e = -48.2, f = 52.5;
  let mg = mgM;
  if (dntpM > 0) { // free Mg2+ after dNTP binding, Ka = 3e4 M⁻¹
    const ka = 3e4, q = ka * dntpM - ka * mgM + 1;
    mg = (-q + Math.sqrt(q * q + 4 * ka * mgM)) / (2 * ka);
  }
  if (monM > 0) {
    const ratio = Math.sqrt(mg) / monM;
    if (ratio < 0.22) return owczarzy2004(fGC, monM);
    if (ratio < 6) {
      const ln = Math.log(monM);
      a = 3.92 * (0.843 - 0.352 * Math.sqrt(monM) * ln);
      d = 1.42 * (1.279 - 4.03e-3 * ln - 8.03e-3 * ln * ln);
      g = 8.31 * (0.486 - 0.258 * ln + 5.25e-3 * ln * ln * ln);
    }
  }
  if (!(mg > 0)) throw new NucleicError('Owczarzy 2008 needs [Mg2+] > 0 (or enough monovalent salt)');
  const lm = Math.log(mg);
  return (a + b * lm + fGC * (c + d * lm) + (1 / (2 * (nbp - 1))) * (e + f * lm + g * lm * lm)) * 1e-5;
}

export function tmNearestNeighbour(seq: string, opts: NNOptions = {}): NNResult {
  const c = checkSeq(seq);
  const s = seq.toUpperCase().replace(/U/g, 'T');
  const warnings: string[] = [];
  if (seq.toUpperCase().includes('U')) warnings.push('U read as T: parameters are for DNA/DNA duplexes.');
  if (c.n < NN_MIN || c.n > NN_MAX) warnings.push(`Nearest-neighbour parameters are validated for ${NN_MIN}–${NN_MAX} nt (this one is ${c.n} nt).`);
  const primer = opts.primerNM ?? 250, template = opts.templateNM ?? primer;
  if (!(primer > 0)) throw new NucleicError('Primer concentration must be > 0');
  if (!(template >= 0)) throw new NucleicError('Template concentration must be ≥ 0');
  const selfComplementary = opts.selfComplementary ?? reverseComplement(s) === s;
  const { dH, dS } = nnThermodynamics(s, selfComplementary);
  const k = (selfComplementary ? primer : Math.max(primer, template) - Math.min(primer, template) / 2) * 1e-9;
  const na = opts.naMM ?? 50, kk = opts.kMM ?? 0, tris = opts.trisMM ?? 0, mg = opts.mgMM ?? 0, dntp = opts.dntpMM ?? 0;
  const method: SaltCorrection = opts.saltCorrection ?? (mg > 0 ? 'owczarzy2008' : 'owczarzy2004');
  let mon = (na + kk + tris / 2) / 1000; // mol/L
  const fGC = (c.G + c.C) / c.n;
  let dSc = dS;
  const tm1M = (1000 * dH) / (dS + R_GAS * Math.log(k)) - 273.15;
  if (method !== 'none' && method !== 'owczarzy2008' && !(mon > 0)) throw new NucleicError('Monovalent salt must be > 0 for this correction');
  if ((method === 'owczarzy2004' || method === 'santalucia1998') && mg > dntp) mon += (120 * Math.sqrt(mg - dntp)) / 1000; // von Ahsen 2001 Na-equivalent
  if (method === 'santalucia1998') dSc += 0.368 * (c.n - 1) * Math.log(mon);
  let tmK = (1000 * dH) / (dSc + R_GAS * Math.log(k));
  if (method === 'owczarzy2004') tmK = 1 / (1 / tmK + owczarzy2004(fGC, mon));
  if (method === 'owczarzy2008') tmK = 1 / (1 / tmK + owczarzy2008(fGC, c.n, mon, mg / 1000, dntp / 1000));
  return { tm: tmK - 273.15, tm1M, dH, dS, k, selfComplementary, saltCorrection: method, warnings };
}
