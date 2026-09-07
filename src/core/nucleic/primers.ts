/* Primer QC & PCR Suite core scientific algorithms.
   Pure TypeScript with NO DOM dependencies.
   Literature references:
   - SantaLucia J Jr (1998) A unified view of polymer, dumbbell, and oligonucleotide DNA
     nearest-neighbor thermodynamics. Proc Natl Acad Sci USA 95:1460-1465.
   - SantaLucia J Jr, Hicks D (2004) The thermodynamics of DNA structural motifs.
     Annu Rev Biophys Biomol Struct 33:415-440.
   - Owczarzy R et al. (2004) Effects of sodium ions on DNA duplex oligomers.
     Biochemistry 43:3537-3554.
   - Owczarzy R et al. (2008) Predicting stability of DNA duplexes in solutions containing
     magnesium and monovalent cations. Biochemistry 47:5336-5353.
   - Dieffenbach CW et al. (1993) General concepts for PCR primer design.
     PCR Methods Appl 3:S30-S37.
*/

import nn from '@/data/nn-santalucia.json';
import { cleanNucleic, reverseComplement, gcContent, NucleicError } from './sequence';
import {
  tmNearestNeighbour,
  tmWallace,
  tmBasic,
  R_GAS,
  type NNOptions,
  type SaltCorrection,
} from './tm';

export interface ReactionConditions {
  /** Primer concentration in nM (excess strand, default 250 nM). */
  primerNM?: number;
  /** Template concentration in nM (default equal to primerNM). */
  templateNM?: number;
  /** Monovalent sodium ion concentration in mM (default 50 mM). */
  naMM?: number;
  /** Monovalent potassium ion concentration in mM (default 0 mM). */
  kMM?: number;
  /** Tris buffer cation concentration in mM (default 0 mM; monovalent equivalent is trisMM/2). */
  trisMM?: number;
  /** Divalent magnesium ion concentration in mM (default 1.5 mM standard PCR). */
  mgMM?: number;
  /** Total dNTP concentration in mM (default 0.8 mM, i.e. 0.2 mM each). */
  dntpMM?: number;
  /** Salt correction method ('owczarzy2008' | 'owczarzy2004' | 'santalucia1998' | 'none'). */
  saltCorrection?: SaltCorrection;
}

export const DEFAULT_REACTION_CONDITIONS: Required<ReactionConditions> = {
  primerNM: 250,
  templateNM: 250,
  naMM: 50,
  kMM: 0,
  trisMM: 0,
  mgMM: 1.5,
  dntpMM: 0.8,
  saltCorrection: 'owczarzy2008',
};

type Pair = { dH: number; dS: number };
const NN = nn as {
  stacks: Record<string, Pair>;
  init_GC: Pair;
  init_AT: Pair;
  sym: Pair;
  R_cal_per_mol_K: number;
};

const COMPLEMENT: Record<string, string> = {
  A: 'T',
  T: 'A',
  U: 'A',
  C: 'G',
  G: 'C',
};

/**
 * Returns nearest-neighbor thermodynamic parameters (dH in kcal/mol, dS in cal/(mol·K), dG37 in kcal/mol)
 * for adjacent base pair step (x, y) 5'->3' on top strand paired with complement 3'->5' on bottom strand.
 * Standard state: 1 M NaCl, 37 °C (SantaLucia 1998 Table 2).
 */
export function getStackThermodynamics(x: string, y: string): { dH: number; dS: number; dG37: number } {
  const b1 = x.toUpperCase().replace(/U/g, 'T');
  const b2 = y.toUpperCase().replace(/U/g, 'T');
  const c1 = COMPLEMENT[b1];
  const c2 = COMPLEMENT[b2];
  if (!c1 || !c2) {
    throw new NucleicError(`Invalid nucleotide base in stack: ${x}${y}`);
  }
  const key1 = `${b1}${b2}/${c1}${c2}`;
  const key2 = `${c2}${c1}/${b2}${b1}`;
  const pair = NN.stacks[key1] ?? NN.stacks[key2];
  if (!pair) {
    throw new NucleicError(`No nearest-neighbor entry for ${b1}${b2}`);
  }
  const dG37 = pair.dH - (310.15 * pair.dS) / 1000;
  return { dH: pair.dH, dS: pair.dS, dG37 };
}

/* =========================================================================
   1. 3' Terminal Stability & GC Clamp
   ========================================================================= */

export interface TerminalStabilityResult {
  /** The terminal 3' sequence analyzed (up to numBases, default 5 nt). */
  terminalSequence: string;
  /** Free energy ΔG° at 37 °C of the terminal pentamer (kcal/mol). Stacking sum from SantaLucia 1998. */
  deltaG: number;
  /** Enthalpy ΔH° (kcal/mol). */
  deltaH: number;
  /** Entropy ΔS° (cal/(mol·K)). */
  deltaS: number;
  /** Number of G or C bases in the terminal 5 bases. */
  gcCount: number;
  /** GC percentage of the terminal 5 bases. */
  gcPercent: number;
  /** GC clamp status: 'optimal' (1-3 G/C), 'poor' (0 G/C), 'risky' (>3 G/C). */
  gcClampStatus: 'optimal' | 'poor' | 'risky';
  /** True if deltaG <= -9.0 kcal/mol or gcClampStatus is 'risky' (high risk of non-specific priming). */
  isRisky: boolean;
  warnings: string[];
}

/**
 * Calculates 3' terminal stability ΔG (37 °C) and evaluates the GC clamp over the terminal 5 bases.
 * SantaLucia 1998 unified NN parameters.
 * Flags ΔG <= -9.0 kcal/mol or >3 G/C as high risk of mispriming.
 */
export function calcTerminalStability(
  seq: string,
  numBases = 5,
  thresholdDeltaG = -9.0,
): TerminalStabilityResult {
  const clean = seq.toUpperCase().replace(/[^ACGTU]/g, '').replace(/U/g, 'T');
  if (clean.length < 2) {
    return {
      terminalSequence: clean,
      deltaG: 0,
      deltaH: 0,
      deltaS: 0,
      gcCount: clean === 'G' || clean === 'C' ? 1 : 0,
      gcPercent: clean ? ((clean === 'G' || clean === 'C' ? 1 : 0) / clean.length) * 100 : 0,
      gcClampStatus: 'poor',
      isRisky: false,
      warnings: ['Sequence too short to evaluate terminal stability (minimum 2 nt)'],
    };
  }

  const k = Math.min(numBases, clean.length);
  const terminalSeq = clean.slice(-k);
  let dH = 0;
  let dS = 0;
  for (let i = 0; i < terminalSeq.length - 1; i++) {
    const p = getStackThermodynamics(terminalSeq[i]!, terminalSeq[i + 1]!);
    dH += p.dH;
    dS += p.dS;
  }
  const deltaG = dH - (310.15 * dS) / 1000;

  // GC clamp count in terminal window
  let gcCount = 0;
  for (const ch of terminalSeq) {
    if (ch === 'G' || ch === 'C') gcCount++;
  }
  const gcPercent = (gcCount / terminalSeq.length) * 100;

  let gcClampStatus: 'optimal' | 'poor' | 'risky' = 'optimal';
  const warnings: string[] = [];

  if (gcCount === 0) {
    gcClampStatus = 'poor';
    warnings.push('0 G/C in 3\' terminal 5 nt: lack of GC clamp may result in poor priming efficiency.');
  } else if (gcCount > 3) {
    gcClampStatus = 'risky';
    warnings.push('>3 G/C in 3\' terminal 5 nt: excessive GC clamp increases risk of mispriming and off-target extension.');
  }

  const isDeltaGRisky = deltaG <= thresholdDeltaG;
  if (isDeltaGRisky) {
    warnings.push(
      `High 3' terminal stability (ΔG = ${deltaG.toFixed(1)} kcal/mol ≤ ${thresholdDeltaG.toFixed(1)} kcal/mol): excessive terminal binding stability promotes non-specific priming.`
    );
  }

  const isRisky = isDeltaGRisky || gcClampStatus === 'risky';

  return {
    terminalSequence: terminalSeq,
    deltaG: Math.round(deltaG * 100) / 100,
    deltaH: Math.round(dH * 10) / 10,
    deltaS: Math.round(dS * 10) / 10,
    gcCount,
    gcPercent: Math.round(gcPercent * 10) / 10,
    gcClampStatus,
    isRisky,
    warnings,
  };
}

/* =========================================================================
   2. Hairpin Detection & Thermodynamics
   ========================================================================= */

export interface HairpinStructure {
  stemLength: number;
  loopLength: number;
  stem5Seq: string;
  loopSeq: string;
  stem3Seq: string;
  startIndex: number; // 0-based
  endIndex: number;   // 0-based, inclusive
  deltaG: number;     // kcal/mol at 37 °C
  deltaH: number;     // kcal/mol
  deltaS: number;     // cal/(mol·K)
  tm: number;         // °C (intramolecular melting temp)
  isRisky: boolean;   // deltaG <= -3.0 kcal/mol
  alignment: string;
}

export interface HairpinResult {
  hasHairpin: boolean;
  worstDeltaG: number;
  isRisky: boolean;
  primaryHairpin: HairpinStructure | null;
  allHairpins: HairpinStructure[];
  warnings: string[];
}

/**
 * Hairpin loop initiation penalties for DNA (SantaLucia & Hicks 2004 Table 11).
 * Loop length >= 3 nt is required (loops < 3 nt are sterically prohibited).
 */
export const HAIRPIN_LOOP_PENALTIES: Record<number, { dG37: number; dH: number; dS: number }> = {
  3: { dG37: 3.5, dH: 7.4, dS: 12.6 },
  4: { dG37: 3.5, dH: 4.5, dS: 3.2 },
  5: { dG37: 4.0, dH: 4.1, dS: 0.3 },
  6: { dG37: 4.3, dH: 3.0, dS: -4.2 },
  7: { dG37: 4.5, dH: 2.8, dS: -5.5 },
  8: { dG37: 4.7, dH: 2.6, dS: -6.8 },
  9: { dG37: 4.9, dH: 2.4, dS: -8.1 },
};

/**
 * Calculates hairpin loop penalty for DNA.
 * For loops > 9 nt, uses logarithmic Jacobson-Stockmayer entropy extrapolation.
 */
export function getHairpinLoopPenalty(loopLen: number): { dG37: number; dH: number; dS: number } {
  if (loopLen < 3) {
    return { dG37: Infinity, dH: 0, dS: 0 };
  }
  if (HAIRPIN_LOOP_PENALTIES[loopLen]) {
    return HAIRPIN_LOOP_PENALTIES[loopLen]!;
  }
  const dG37 = 4.9 + 2.44 * Math.log(loopLen / 9);
  const dH = 2.4;
  const dS = ((dH - dG37) / 310.15) * 1000;
  return { dG37, dH, dS };
}

/**
 * Detects hairpins (inverted repeats with loop size >= 3 nt).
 * Estimates folding ΔG = stem NN ΔG + loop penalty (+ closing AT penalty).
 * Flags ΔG <= -3.0 kcal/mol as high risk.
 */
export function detectHairpins(
  seq: string,
  minStem = 2,
  minLoop = 3,
  riskThreshold = -3.0,
): HairpinResult {
  const s = seq.toUpperCase().replace(/[^ACGTU]/g, '').replace(/U/g, 'T');
  const N = s.length;
  const hairpins: HairpinStructure[] = [];

  for (let loopLen = minLoop; loopLen <= N - 2 * minStem; loopLen++) {
    for (let loopStart = minStem; loopStart <= N - minStem - loopLen; loopStart++) {
      let stemLen = 0;
      while (
        loopStart - 1 - stemLen >= 0 &&
        loopStart + loopLen + stemLen < N &&
        s[loopStart - 1 - stemLen] === COMPLEMENT[s[loopStart + loopLen + stemLen]!]
      ) {
        stemLen++;
      }

      if (stemLen >= minStem) {
        const stem5Start = loopStart - stemLen;
        const stem5 = s.slice(stem5Start, loopStart);
        const loopSeq = s.slice(loopStart, loopStart + loopLen);
        const stem3 = s.slice(loopStart + loopLen, loopStart + loopLen + stemLen);
        const stem3End = loopStart + loopLen + stemLen - 1;

        // Calculate stem nearest-neighbor thermodynamics
        let stemH = 0;
        let stemS = 0;
        for (let i = 0; i < stem5.length - 1; i++) {
          const p = getStackThermodynamics(stem5[i]!, stem5[i + 1]!);
          stemH += p.dH;
          stemS += p.dS;
        }

        // Loop penalty
        const loopPen = getHairpinLoopPenalty(loopSeq.length);

        // Terminal mismatch / closing AT penalty (+0.5 kcal/mol in SantaLucia & Hicks 2004)
        const closing5 = s[loopStart - 1]!;
        const closing3 = s[loopStart + loopLen]!;
        const isClosingAT = closing5 === 'A' || closing5 === 'T' || closing3 === 'A' || closing3 === 'T';
        const closingPenaltyH = isClosingAT ? 2.3 : 0;
        const closingPenaltyS = isClosingAT ? 5.8 : 0;

        const totH = stemH + loopPen.dH + closingPenaltyH;
        const totS = stemS + loopPen.dS + closingPenaltyS;
        const deltaG = totH - (310.15 * totS) / 1000;

        // Intramolecular unimolecular Tm (°C): Tm = dH / dS - 273.15
        let tm = 0;
        if (totS < 0 && totH < 0) {
          tm = (totH * 1000) / totS - 273.15;
        }

        const isRisky = deltaG <= riskThreshold;

        // Visual alignment string
        const alignment =
          `5'-${stem5}--(${loopSeq.length}nt loop)--${stem3}-3'\n` +
          `   ${'|'.repeat(stem5.length)} (ΔG = ${deltaG.toFixed(1)} kcal/mol)`;

        hairpins.push({
          stemLength: stemLen,
          loopLength: loopSeq.length,
          stem5Seq: stem5,
          loopSeq,
          stem3Seq: stem3,
          startIndex: stem5Start,
          endIndex: stem3End,
          deltaG: Math.round(deltaG * 100) / 100,
          deltaH: Math.round(totH * 10) / 10,
          deltaS: Math.round(totS * 10) / 10,
          tm: Math.round(tm * 10) / 10,
          isRisky,
          alignment,
        });
      }
    }
  }

  // Deduplicate hairpins by (startIndex, endIndex, stemLength)
  const uniqueHairpins: HairpinStructure[] = [];
  const seen = new Set<string>();
  for (const h of hairpins) {
    const key = `${h.startIndex}_${h.endIndex}_${h.stemLength}_${h.loopLength}`;
    if (!seen.has(key)) {
      seen.add(key);
      uniqueHairpins.push(h);
    }
  }

  uniqueHairpins.sort((a, b) => a.deltaG - b.deltaG);

  const primary = uniqueHairpins[0] ?? null;
  const worstDeltaG = primary ? primary.deltaG : 0;
  const isRisky = primary ? primary.deltaG <= riskThreshold : false;

  const warnings: string[] = [];
  if (isRisky && primary) {
    warnings.push(
      `Stable hairpin predicted (ΔG = ${primary.deltaG.toFixed(1)} kcal/mol ≤ ${riskThreshold.toFixed(1)} kcal/mol, ${primary.stemLength} bp stem, ${primary.loopLength} nt loop). May cause PCR failure or poor primer annealing.`
    );
  }

  return {
    hasHairpin: uniqueHairpins.length > 0 && worstDeltaG < 0,
    worstDeltaG,
    isRisky,
    primaryHairpin: primary,
    allHairpins: uniqueHairpins,
    warnings,
  };
}

/* =========================================================================
   3. Primer Dimer (Self-Dimer & Hetero-Dimer) Detection
   ========================================================================= */

export interface DimerAlignment {
  strand1Name: string;
  strand2Name: string;
  strand1Seq: string;
  strand2Seq: string;
  strand1Start: number;
  strand1End: number;
  strand2Start: number;
  strand2End: number;
  matchLength: number;
  deltaG: number;     // kcal/mol at 37 °C
  deltaH: number;     // kcal/mol
  deltaS: number;     // cal/(mol·K)
  tm: number;         // °C (bimolecular Tm at primer concentration)
  involves3PrimeEnd: boolean;
  involvesStrand1_3Prime: boolean;
  involvesStrand2_3Prime: boolean;
  isRisky: boolean;
  lines: [string, string, string]; // Top 5'->3', middle pipes, bottom 3'<-5'
}

export interface DimerResult {
  hasDimer: boolean;
  worstDeltaG: number;
  endDeltaG: number;
  is3PrimeEndRisky: boolean;
  isWorstRisky: boolean;
  isRisky: boolean;
  worstAlignment: DimerAlignment | null;
  endAlignment: DimerAlignment | null;
  allAlignments: DimerAlignment[];
  warnings: string[];
}

/**
 * Calculates primer dimers (homodimer or heterodimer) via sliding antiparallel complementarity.
 * Evaluates both internal alignments and 3' end hybridized alignments.
 * Flags 3' end dimers with ΔG <= -5.0 kcal/mol and internal dimers with ΔG <= -6.0 kcal/mol.
 */
export function detectDimers(
  seq1: string,
  seq2: string,
  name1 = 'Primer 1',
  name2 = 'Primer 2',
  opts: {
    primerNM?: number;
    endRiskThreshold?: number;   // default -5.0 kcal/mol
    worstRiskThreshold?: number; // default -6.0 kcal/mol
    minMatchLength?: number;     // default 2 bp
  } = {},
): DimerResult {
  const s1 = seq1.toUpperCase().replace(/[^ACGTU]/g, '').replace(/U/g, 'T');
  const s2 = seq2.toUpperCase().replace(/[^ACGTU]/g, '').replace(/U/g, 'T');
  const L1 = s1.length;
  const L2 = s2.length;
  const isHomodimer = s1 === s2;
  const primerNM = opts.primerNM ?? 250;
  const endRiskThresh = opts.endRiskThreshold ?? -5.0;
  const worstRiskThresh = opts.worstRiskThreshold ?? -6.0;
  const minMatchLen = opts.minMatchLength ?? 2;

  if (L1 < minMatchLen || L2 < minMatchLen) {
    return {
      hasDimer: false,
      worstDeltaG: 0,
      endDeltaG: 0,
      is3PrimeEndRisky: false,
      isWorstRisky: false,
      isRisky: false,
      worstAlignment: null,
      endAlignment: null,
      allAlignments: [],
      warnings: [],
    };
  }

  const alignments: DimerAlignment[] = [];

  // Diagonal C = i + j (ranges from 0 to L1 + L2 - 2)
  for (let C = 0; C <= L1 + L2 - 2; C++) {
    const minI = Math.max(0, C - L2 + 1);
    const maxI = Math.min(L1 - 1, C);

    let runStart = -1;
    for (let i = minI; i <= maxI + 1; i++) {
      const j = C - i;
      const isMatch = i <= maxI && j >= 0 && j < L2 && s1[i] === COMPLEMENT[s2[j]!];

      if (isMatch) {
        if (runStart < 0) runStart = i;
      } else if (runStart >= 0) {
        const runEnd = i - 1;
        const matchLen = runEnd - runStart + 1;

        if (matchLen >= minMatchLen) {
          const s1Start = runStart;
          const s1End = runEnd;
          const s2End = C - runStart; // coordinate in s2
          const s2Start = C - runEnd; // coordinate in s2

          // Thermodynamics of the duplex run
          let dH = 0;
          let dS = 0;
          for (let k = s1Start; k < s1End; k++) {
            const p = getStackThermodynamics(s1[k]!, s1[k + 1]!);
            dH += p.dH;
            dS += p.dS;
          }

          // Initiation penalties
          const leftEnd = s1[s1Start]!;
          const rightEnd = s1[s1End]!;
          const initLeft = leftEnd === 'G' || leftEnd === 'C' ? NN.init_GC : NN.init_AT;
          const initRight = rightEnd === 'G' || rightEnd === 'C' ? NN.init_GC : NN.init_AT;
          dH += initLeft.dH + initRight.dH;
          dS += initLeft.dS + initRight.dS;

          // Symmetry penalty if self-complementary homodimer duplex
          const matchedSub = s1.slice(s1Start, s1End + 1);
          if (isHomodimer && reverseComplement(matchedSub) === matchedSub) {
            dH += NN.sym.dH;
            dS += NN.sym.dS;
          }

          const deltaG = dH - (310.15 * dS) / 1000;

          // Bimolecular Tm at primer concentration
          let tm = 0;
          const ct = primerNM * 1e-9;
          const kMol = isHomodimer ? ct : ct / 4;
          const denom = dS + R_GAS * Math.log(kMol);
          if (denom < 0 && dH < 0) {
            tm = (1000 * dH) / denom - 273.15;
          }

          // 3' end involvement:
          // Strand 1 3' end is at index L1 - 1
          // Strand 2 3' end is at index L2 - 1 (which corresponds to j = L2 - 1, i = C - L2 + 1)
          const involvesS1_3 = s1End >= L1 - 2;
          const involvesS2_3 = s2End >= L2 - 1 || s2Start <= 1 || (C - s1Start) >= L2 - 2;
          const involves3 = involvesS1_3 || involvesS2_3;

          const isRisky = involves3 ? deltaG <= endRiskThresh : deltaG <= worstRiskThresh;

          // Build ASCII 3-line diagram
          const s2Offset = C - L2 + 1;
          const minPos = Math.min(0, s2Offset);
          const maxPos = Math.max(L1 - 1, C);
          const span = maxPos - minPos + 1;

          const topChars = Array(span).fill(' ');
          const midChars = Array(span).fill(' ');
          const botChars = Array(span).fill(' ');

          for (let p = 0; p < L1; p++) {
            topChars[p - minPos] = s1[p];
          }
          for (let p = 0; p < L2; p++) {
            const charIdx = L2 - 1 - p;
            botChars[s2Offset + p - minPos] = s2[charIdx];
          }
          for (let p = s1Start; p <= s1End; p++) {
            midChars[p - minPos] = '|';
          }

          const lineTop = `5'-${topChars.join('')}-3'`;
          const lineMid = `   ${midChars.join('')}   `;
          const lineBot = `3'-${botChars.join('')}-5'`;

          alignments.push({
            strand1Name: name1,
            strand2Name: name2,
            strand1Seq: s1,
            strand2Seq: s2,
            strand1Start: s1Start,
            strand1End: s1End,
            strand2Start: s2Start,
            strand2End: s2End,
            matchLength: matchLen,
            deltaG: Math.round(deltaG * 100) / 100,
            deltaH: Math.round(dH * 10) / 10,
            deltaS: Math.round(dS * 10) / 10,
            tm: Math.round(tm * 10) / 10,
            involves3PrimeEnd: involves3,
            involvesStrand1_3Prime: involvesS1_3,
            involvesStrand2_3Prime: involvesS2_3,
            isRisky,
            lines: [lineTop, lineMid, lineBot],
          });
        }
        runStart = -1;
      }
    }
  }

  // Deduplicate alignments
  const uniqueAlignments: DimerAlignment[] = [];
  const seen = new Set<string>();
  for (const a of alignments) {
    const key = `${a.strand1Start}_${a.strand1End}_${a.strand2Start}_${a.strand2End}`;
    if (!seen.has(key)) {
      seen.add(key);
      uniqueAlignments.push(a);
    }
  }

  uniqueAlignments.sort((a, b) => a.deltaG - b.deltaG);

  const worst = uniqueAlignments[0] ?? null;
  const endAlignments = uniqueAlignments.filter(a => a.involves3PrimeEnd);
  const worstEnd = endAlignments[0] ?? null;

  const worstDeltaG = worst ? worst.deltaG : 0;
  const endDeltaG = worstEnd ? worstEnd.deltaG : 0;

  const is3PrimeEndRisky = worstEnd ? worstEnd.deltaG <= endRiskThresh : false;
  const isWorstRisky = worst ? worst.deltaG <= worstRiskThresh : false;
  const isRisky = is3PrimeEndRisky || isWorstRisky;

  const warnings: string[] = [];
  if (is3PrimeEndRisky && worstEnd) {
    warnings.push(
      `High risk of 3' primer dimer (ΔG = ${worstEnd.deltaG.toFixed(1)} kcal/mol ≤ ${endRiskThresh.toFixed(1)} kcal/mol, ${worstEnd.matchLength} bp match). Polymerase may extend this dimer, depleting primers and generating artifact bands.`
    );
  }
  if (isWorstRisky && !is3PrimeEndRisky && worst) {
    warnings.push(
      `Internal dimer detected (ΔG = ${worst.deltaG.toFixed(1)} kcal/mol ≤ ${worstRiskThresh.toFixed(1)} kcal/mol, ${worst.matchLength} bp match). May sequester primers and reduce PCR yield.`
    );
  }

  return {
    hasDimer: uniqueAlignments.length > 0 && worstDeltaG < 0,
    worstDeltaG,
    endDeltaG,
    is3PrimeEndRisky,
    isWorstRisky,
    isRisky,
    worstAlignment: worst,
    endAlignment: worstEnd,
    allAlignments: uniqueAlignments,
    warnings,
  };
}

/* =========================================================================
   4. Annealing Temperature (Ta)
   ========================================================================= */

export interface AnnealingTemperatureResult {
  minTm: number;
  /** Taq / Standard PCR: min(Tm1, Tm2) - 5 °C */
  taTaq: number;
  /** Phusion / Q5 High-Fidelity PCR: 0.893 * min(Tm1, Tm2) - 4.49 °C */
  taQ5: number;
}

/**
 * Computes recommended PCR annealing temperatures (Ta).
 * - Taq / Standard polymerase: min(Tm1, Tm2) - 5 °C
 * - Phusion / Q5 High-Fidelity DNA Polymerase: 0.893 * min(Tm1, Tm2) - 4.49 °C
 */
export function calcTa(tm1: number, tm2?: number): AnnealingTemperatureResult {
  const minTm = tm2 !== undefined && Number.isFinite(tm2) ? Math.min(tm1, tm2) : tm1;
  const taTaq = minTm - 5;
  const taQ5 = 0.893 * minTm - 4.49;
  return {
    minTm: Math.round(minTm * 10) / 10,
    taTaq: Math.round(taTaq * 10) / 10,
    taQ5: Math.round(taQ5 * 10) / 10,
  };
}

/* =========================================================================
   5. Comprehensive Primer Analysis & Pair QC
   ========================================================================= */

export interface PrimerAnalysis {
  name: string;
  sequence: string;
  cleanSeq: string;
  length: number;
  gcFraction: number;
  gcPercent: number;
  tm: number;
  tmWallace: number;
  tmBasic: number;
  dH: number;
  dS: number;
  terminalStability: TerminalStabilityResult;
  gcClamp: {
    count: number;
    bases: string;
    status: 'optimal' | 'poor' | 'risky';
    warning?: string;
  };
  hairpin: HairpinResult;
  selfDimer: DimerResult;
  warnings: string[];
  qualityScore: number; // 0 to 100
  status: 'optimal' | 'warning' | 'critical';
}

export interface PrimerPairAnalysis {
  fwd: PrimerAnalysis;
  rev: PrimerAnalysis;
  tmDiff: number;           // |Tm1 - Tm2|
  isTmDiffOptimal: boolean; // tmDiff <= 3.0 °C
  taTaq: number;
  taQ5: number;
  crossDimer: DimerResult;
  pairWarnings: string[];
  overallStatus: 'optimal' | 'warning' | 'critical';
  qualityScore: number;     // 0 to 100
}

/**
 * Analyzes an individual oligonucleotide primer for PCR quality.
 */
export function analyzePrimer(
  sequence: string,
  name = 'Primer',
  conditions: ReactionConditions = {},
): PrimerAnalysis {
  const clean = cleanNucleic(sequence).seq;
  const len = clean.length;
  if (len === 0) {
    throw new NucleicError('Empty primer sequence');
  }

  const nnOpts: NNOptions = {
    primerNM: conditions.primerNM ?? DEFAULT_REACTION_CONDITIONS.primerNM,
    templateNM: conditions.templateNM ?? DEFAULT_REACTION_CONDITIONS.templateNM,
    naMM: conditions.naMM ?? DEFAULT_REACTION_CONDITIONS.naMM,
    kMM: conditions.kMM ?? DEFAULT_REACTION_CONDITIONS.kMM,
    trisMM: conditions.trisMM ?? DEFAULT_REACTION_CONDITIONS.trisMM,
    mgMM: conditions.mgMM ?? DEFAULT_REACTION_CONDITIONS.mgMM,
    dntpMM: conditions.dntpMM ?? DEFAULT_REACTION_CONDITIONS.dntpMM,
    saltCorrection: conditions.saltCorrection ?? DEFAULT_REACTION_CONDITIONS.saltCorrection,
  };

  const nnRes = tmNearestNeighbour(clean, nnOpts);
  const wallaceRes = tmWallace(clean);
  const basicRes = tmBasic(clean);
  const gcFrac = gcContent(clean);
  const gcPct = Math.round(gcFrac * 1000) / 10;

  const terminalRes = calcTerminalStability(clean, 5);
  const hairpinRes = detectHairpins(clean);
  const selfDimerRes = detectDimers(clean, clean, name, name, {
    primerNM: conditions.primerNM ?? DEFAULT_REACTION_CONDITIONS.primerNM,
  });

  const warnings: string[] = [];
  let score = 100;

  // Length check (optimal 18-25 nt)
  if (len < 15) {
    warnings.push(`Short primer length (${len} nt < 15 nt): may exhibit low specificity.`);
    score -= 15;
  } else if (len > 30) {
    warnings.push(`Long primer length (${len} nt > 30 nt): prone to secondary structure; ensure high-fidelity polymerase is used.`);
    score -= 10;
  }

  // GC% check (optimal 40-60%)
  if (gcPct < 40) {
    warnings.push(`Low GC content (${gcPct}% < 40%): may require lower annealing temperature.`);
    score -= 10;
  } else if (gcPct > 60) {
    warnings.push(`High GC content (${gcPct}% > 60%): increases risk of secondary structure and non-specific annealing.`);
    score -= 10;
  }

  // Tm check (optimal 55-65 °C)
  if (nnRes.tm < 50) {
    warnings.push(`Low melting temperature (Tm = ${nnRes.tm.toFixed(1)} °C < 50 °C): may result in low yield.`);
    score -= 15;
  } else if (nnRes.tm > 72) {
    warnings.push(`High melting temperature (Tm = ${nnRes.tm.toFixed(1)} °C > 72 °C): may prevent denaturation or require high Ta.`);
    score -= 10;
  }

  // Terminal stability & GC clamp
  if (terminalRes.warnings.length > 0) {
    warnings.push(...terminalRes.warnings);
    score -= terminalRes.isRisky ? 20 : 10;
  }

  // Hairpin check
  if (hairpinRes.warnings.length > 0) {
    warnings.push(...hairpinRes.warnings);
    score -= hairpinRes.isRisky ? 25 : 10;
  }

  // Self dimer check
  if (selfDimerRes.warnings.length > 0) {
    warnings.push(...selfDimerRes.warnings);
    score -= selfDimerRes.is3PrimeEndRisky ? 25 : 15;
  }

  const finalScore = Math.max(0, Math.min(100, score));
  const status: 'optimal' | 'warning' | 'critical' =
    finalScore >= 80 ? 'optimal' : finalScore >= 50 ? 'warning' : 'critical';

  return {
    name,
    sequence,
    cleanSeq: clean,
    length: len,
    gcFraction: gcFrac,
    gcPercent: gcPct,
    tm: Math.round(nnRes.tm * 10) / 10,
    tmWallace: Math.round(wallaceRes.tm * 10) / 10,
    tmBasic: Math.round(basicRes.tm * 10) / 10,
    dH: Math.round(nnRes.dH * 10) / 10,
    dS: Math.round(nnRes.dS * 10) / 10,
    terminalStability: terminalRes,
    gcClamp: {
      count: terminalRes.gcCount,
      bases: terminalRes.terminalSequence,
      status: terminalRes.gcClampStatus,
      warning: terminalRes.warnings[0],
    },
    hairpin: hairpinRes,
    selfDimer: selfDimerRes,
    warnings,
    qualityScore: finalScore,
    status,
  };
}

/**
 * Evaluates a primer pair (forward and reverse) for PCR amplification.
 * Analyzes Tm difference, cross-dimer formation, and optimal annealing temperatures.
 */
export function analyzePrimerPair(
  fwdSeq: string,
  revSeq: string,
  fwdName = 'Forward Primer',
  revName = 'Reverse Primer',
  conditions: ReactionConditions = {},
): PrimerPairAnalysis {
  const fwd = analyzePrimer(fwdSeq, fwdName, conditions);
  const rev = analyzePrimer(revSeq, revName, conditions);

  const tmDiff = Math.abs(fwd.tm - rev.tm);
  const isTmDiffOptimal = tmDiff <= 3.0;

  const { taTaq, taQ5 } = calcTa(fwd.tm, rev.tm);

  const crossDimer = detectDimers(fwd.cleanSeq, rev.cleanSeq, fwdName, revName, {
    primerNM: conditions.primerNM ?? DEFAULT_REACTION_CONDITIONS.primerNM,
  });

  const pairWarnings: string[] = [];
  let pairScore = Math.min(fwd.qualityScore, rev.qualityScore);

  if (!isTmDiffOptimal) {
    pairWarnings.push(
      `Tm difference (|Tm1 - Tm2| = ${tmDiff.toFixed(1)} °C > 3.0 °C): large difference reduces PCR specificity and efficiency; one primer may under-anneal.`
    );
    pairScore -= 15;
  }

  if (crossDimer.warnings.length > 0) {
    pairWarnings.push(...crossDimer.warnings);
    pairScore -= crossDimer.is3PrimeEndRisky ? 30 : 15;
  }

  const finalScore = Math.max(0, Math.min(100, pairScore));
  const overallStatus: 'optimal' | 'warning' | 'critical' =
    finalScore >= 80 ? 'optimal' : finalScore >= 50 ? 'warning' : 'critical';

  return {
    fwd,
    rev,
    tmDiff: Math.round(tmDiff * 10) / 10,
    isTmDiffOptimal,
    taTaq,
    taQ5,
    crossDimer,
    pairWarnings,
    overallStatus,
    qualityScore: finalScore,
  };
}

/* =========================================================================
   6. Export Formats (TSV / CSV Ordering Sheet)
   ========================================================================= */

export interface ExportOligo {
  name: string;
  sequence: string;
  length?: number;
  tm?: number;
  gcPercent?: number;
  scale?: string;
  purification?: string;
  notes?: string;
}

/**
 * Generates an oligo ordering sheet in TSV or CSV format suitable for IDT, Thermo Fisher, or Sigma.
 */
export function exportOrderingSheet(
  oligos: (PrimerAnalysis | ExportOligo)[],
  format: 'tsv' | 'csv' = 'tsv',
  defaults: { scale?: string; purification?: string } = {},
): string {
  const delim = format === 'tsv' ? '\t' : ',';
  const quote = (v: string | number) => {
    if (format === 'tsv') return String(v);
    const s = String(v).replace(/"/g, '""');
    return `"${s}"`;
  };

  const headers = ['Well', 'Name', 'Sequence', 'Length', 'Tm (°C)', 'GC%', 'Scale', 'Purification', 'Notes'];
  const lines: string[] = [headers.map(quote).join(delim)];

  const defaultScale = defaults.scale ?? '25nm';
  const defaultPurif = defaults.purification ?? 'STD';

  const rows = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

  oligos.forEach((o, idx) => {
    const rowChar = rows[Math.floor(idx / 12) % rows.length]!;
    const colNum = String((idx % 12) + 1).padStart(2, '0');
    const well = `${rowChar}${colNum}`;

    const name = o.name;
    const cleanSeq = 'cleanSeq' in o ? o.cleanSeq : o.sequence.toUpperCase().replace(/[^ACGTU]/g, '');
    const len = 'length' in o && o.length !== undefined ? o.length : cleanSeq.length;
    const tm = 'tm' in o && o.tm !== undefined ? o.tm.toFixed(1) : '—';
    const gc = 'gcPercent' in o && o.gcPercent !== undefined ? o.gcPercent.toFixed(1) : '—';
    const scale = ('scale' in o && o.scale) ? o.scale : defaultScale;
    const purif = ('purification' in o && o.purification) ? o.purification : defaultPurif;
    const notes = 'warnings' in o && Array.isArray(o.warnings) ? o.warnings.join('; ') : ('notes' in o && o.notes) ? o.notes : '';

    const row = [well, name, cleanSeq, len, tm, gc, scale, purif, notes];
    lines.push(row.map(quote).join(delim));
  });

  return lines.join('\n');
}
