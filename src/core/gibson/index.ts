/**
 * Gibson, NEBuilder HiFi & In-Fusion Assembly Overlap and Primer Designer.
 * Computes seamless homology arms, primer annealing regions with Tm,
 * junction stability, and full recombinant construct sequence.
 * Benchmark verified against official NEBuilder HiFi (#E5520) and Q5 DNA Polymerase.
 */

import { tmNearestNeighbour, tmWallace } from '@/core/nucleic/tm';

export type AssemblyMethod = 'nebuilder' | 'gibson' | 'infusion';
export type PcrPolymerase = 'q5' | 'phusion' | 'taq';

export interface FragmentInput {
  id: string;
  name: string;
  sequence: string; // 5' to 3'
}

export interface AssemblyPrimer {
  name: string;
  targetFragmentName: string;
  direction: 'forward' | 'reverse';
  fullSequence: string; // 5' to 3'
  overhangSeq: string; // 5' homology arm
  annealSeq: string; // 3' template binding region
  totalLength: number;
  overhangLength: number;
  annealLength: number;
  annealTm: number; // °C
  overhangTm: number; // °C
  gcPercent: number;
  recommendedTa: number; // °C (for Q5/Phusion)
  warnings: string[];
}

export interface AssemblyJunction {
  upstreamName: string;
  downstreamName: string;
  overlapSeq: string; // 5' to 3'
  overlapLength: number;
  overlapTm: number;
  overlapGc: number;
  status: 'optimal' | 'low_tm' | 'high_gc' | 'low_gc' | 'hairpin_risk';
  message: string;
}

export interface AssemblyResult {
  method: AssemblyMethod;
  assembledSequence: string;
  assembledLength: number;
  junctions: AssemblyJunction[];
  primers: AssemblyPrimer[];
  warnings: string[];
}

export interface AssemblyOptions {
  method?: AssemblyMethod;
  overlapLen?: number;
  targetPrimerTm?: number;
  circularize?: boolean;
  polymerase?: PcrPolymerase;
  primerConcentrationNm?: number;
  minPrimerLen?: number;
  maxPrimerTmDiff?: number;
  amplifyAllFragments?: boolean;
}

/** Sanitize DNA sequence (strip whitespace, numbers, FASTA lines) */
export function cleanDna(raw: string): string {
  return raw
    .replace(/^>.*$/gm, '')
    .replace(/[^atcgunATCGUN]/g, '')
    .toUpperCase()
    .replace(/U/g, 'T');
}

/** Reverse complement */
export function revComp(dna: string): string {
  const comp: Record<string, string> = { A: 'T', T: 'A', C: 'G', G: 'C', N: 'N' };
  return dna
    .split('')
    .reverse()
    .map(base => comp[base] || 'N')
    .join('');
}

/** Percentage GC */
export function calcGc(dna: string): number {
  if (!dna.length) return 0;
  const gcCount = (dna.match(/[GC]/gi) || []).length;
  return (gcCount / dna.length) * 100;
}

export interface TmOptions {
  primerNm?: number;
  mgMm?: number;
  naMm?: number;
}

/**
 * Nearest-neighbor melting temperature with salt correction
 * Default: 50 mM Na+, 2.0 mM Mg2+, 500 nM primer (NEB Q5 parameters)
 * SantaLucia (1998) unified thermodynamic parameters and Owczarzy (2008) divalent salt correction.
 */
export function calcTm(dna: string, opts?: TmOptions): number {
  const clean = cleanDna(dna).replace(/U/g, 'T');
  const len = clean.length;
  if (len === 0) return 0;
  if (len < 8) {
    return tmWallace(clean).tm;
  }
  const primerNm = opts?.primerNm ?? 500;
  const mgMm = opts?.mgMm ?? 2.0;
  const naMm = opts?.naMm ?? 50;

  try {
    const res = tmNearestNeighbour(clean, {
      naMM: naMm,
      mgMM: mgMm,
      primerNM: primerNm,
      dntpMM: 0.8,
      saltCorrection: 'owczarzy2008',
    });
    return Math.round(res.tm * 10) / 10;
  } catch {
    return tmWallace(clean).tm;
  }
}

/** Detect 3' hairpin or self-dimer risk (simple inverted repeats at 3' end) */
export function checkHairpin(dna: string): boolean {
  if (dna.length < 12) return false;
  const tail = dna.slice(-10);
  const rcTail = revComp(tail);
  // Check for 4bp complementary stem
  for (let i = 0; i <= tail.length - 4; i++) {
    const sub = tail.slice(i, i + 4);
    if (rcTail.includes(sub)) return true;
  }
  return false;
}

/** Find optimal annealing length (from start or end) to achieve target Tm (typically 58-62°C) */
export function findAnnealingRegion(
  fragmentSeq: string,
  fromStart: boolean,
  targetTm = 60,
  minLen = 17,
  maxLen = 30,
  tmOpts?: TmOptions
): { seq: string; tm: number; gc: number } {
  let bestSeq = '';
  let bestDiff = 999;
  let bestTm = 0;

  for (let len = minLen; len <= Math.min(maxLen, fragmentSeq.length); len++) {
    const sub = fromStart ? fragmentSeq.slice(0, len) : fragmentSeq.slice(-len);
    const tm = calcTm(sub, tmOpts);
    const diff = Math.abs(tm - targetTm);
    if (diff < bestDiff) {
      bestDiff = diff;
      bestSeq = sub;
      bestTm = tm;
    }
  }

  return { seq: bestSeq, tm: bestTm, gc: calcGc(bestSeq) };
}

/**
 * Find optimal annealing pair (forward and reverse) for an entire fragment,
 * taking into account minimum primer length, 3' GC clamp, and maximum Tm difference.
 */
export function findOptimalPrimerPairLengths(
  fragmentSeq: string,
  minLen = 18,
  maxLen = 30,
  targetTm = 62,
  maxDiff = 5.0,
  tmOpts?: TmOptions
): { fwdLen: number; revLen: number } {
  let bestPair = { fwdLen: minLen, revLen: minLen };
  let bestScore = 1e9;
  const seqLen = fragmentSeq.length;

  for (let lf = minLen; lf <= Math.min(maxLen, seqLen); lf++) {
    const fwdSeq = fragmentSeq.slice(0, lf);
    const tmF = calcTm(fwdSeq, tmOpts);
    const fwdClamp = fwdSeq.endsWith('G') || fwdSeq.endsWith('C');

    for (let lr = minLen; lr <= Math.min(maxLen, seqLen); lr++) {
      const revTemplate = fragmentSeq.slice(-lr);
      const revSeq = revComp(revTemplate);
      const tmR = calcTm(revSeq, tmOpts);
      const revClamp = revSeq.endsWith('G') || revSeq.endsWith('C');
      const diff = Math.abs(tmF - tmR);

      if (diff > maxDiff) continue;

      let score = 0;
      // Target Tm penalty
      score += Math.abs(tmF - targetTm) + Math.abs(tmR - targetTm);
      // Tm difference penalty
      score += diff * 1.5;
      // 3' GC clamp preference
      if (!fwdClamp) score += 4.0;
      if (!revClamp) score += 4.0;
      // Length penalty (prefer shorter oligos when sufficient)
      score += (lf - minLen) * 0.4 + (lr - minLen) * 0.4;
      // Symmetry bonus
      if (lf === lr) score -= 1.5;

      if (score < bestScore) {
        bestScore = score;
        bestPair = { fwdLen: lf, revLen: lr };
      }
    }
  }

  return bestPair;
}

/**
 * Designs Gibson, NEBuilder HiFi (#E5520), or In-Fusion assembly primers & junctions.
 * Supports both options object and positional arguments.
 */
export function designAssembly(
  vector: FragmentInput,
  inserts: FragmentInput[],
  methodOrOptions?: AssemblyMethod | AssemblyOptions,
  overlapLenArg?: number,
  targetPrimerTmArg?: number
): AssemblyResult {
  const options: AssemblyOptions =
    typeof methodOrOptions === 'object' && methodOrOptions !== null
      ? methodOrOptions
      : {
          method: methodOrOptions ?? 'gibson',
          overlapLen: overlapLenArg ?? 25,
          targetPrimerTm: targetPrimerTmArg ?? 60,
        };

  const method: AssemblyMethod = options.method ?? 'gibson';
  const overlapLen = options.overlapLen ?? (method === 'nebuilder' ? 20 : 25);
  const targetPrimerTm = options.targetPrimerTm ?? 60;
  const circularize = options.circularize ?? true;
  const minPrimerLen = options.minPrimerLen ?? 18;
  const maxPrimerTmDiff = options.maxPrimerTmDiff ?? 5.0;
  const primerConcNm = options.primerConcentrationNm ?? (options.polymerase === 'q5' || method === 'nebuilder' ? 500 : 200);
  const isQ5 = options.polymerase === 'q5' || method === 'nebuilder';
  const tmOpts: TmOptions = {
    primerNm: primerConcNm,
    mgMm: isQ5 ? 2.0 : 1.5,
    naMm: 50,
  };

  const cleanVec = cleanDna(vector.sequence);
  const cleanInserts = inserts.map(ins => ({
    id: ins.id,
    name: ins.name || 'Insert',
    sequence: cleanDna(ins.sequence),
  })).filter(ins => ins.sequence.length > 0);

  const warnings: string[] = [];

  if (cleanVec.length < 50) {
    warnings.push('Vector sequence is too short for reliable assembly design (<50 bp).');
  }
  if (cleanInserts.length === 0) {
    warnings.push('At least one insert fragment sequence is required.');
    return {
      method,
      assembledSequence: cleanVec,
      assembledLength: cleanVec.length,
      junctions: [],
      primers: [],
      warnings,
    };
  }

  // Fragments in circular/linear order: Vector -> Insert 1 -> Insert 2 ...
  const allFragments = [
    { id: vector.id, name: vector.name || 'Vector', sequence: cleanVec, isVector: true },
    ...cleanInserts.map(ins => ({ ...ins, isVector: false })),
  ];

  const junctions: AssemblyJunction[] = [];
  const primers: AssemblyPrimer[] = [];

  const numJunctions = circularize ? allFragments.length : allFragments.length - 1;

  // 1. Determine junctions
  for (let i = 0; i < numJunctions; i++) {
    const curr = allFragments[i]!;
    const next = allFragments[(i + 1) % allFragments.length]!;

    const actualOverlapLen = Math.min(
      overlapLen,
      Math.floor(curr.sequence.length / 2),
      Math.floor(next.sequence.length / 2)
    );

    let overlap = '';
    if (method === 'nebuilder') {
      // Balanced overlap across junction: half from curr 3' end, half from next 5' end
      const half1 = Math.floor(actualOverlapLen / 2);
      const half2 = actualOverlapLen - half1;
      overlap = curr.sequence.slice(-half1) + next.sequence.slice(0, half2);
    } else {
      // Gibson/In-Fusion standard convention: taken from 3' of curr
      overlap = curr.sequence.slice(-actualOverlapLen);
    }

    const overlapTm = calcTm(overlap, tmOpts);
    const overlapGc = calcGc(overlap);

    let status: AssemblyJunction['status'] = 'optimal';
    let message = `Optimal ${actualOverlapLen} bp homology arm (Tm: ${overlapTm}°C, GC: ${overlapGc.toFixed(1)}%)`;

    if (overlapTm < 48) {
      status = 'low_tm';
      message = `Low homology Tm (${overlapTm}°C < 48°C). Consider increasing overlap length to ${actualOverlapLen + 5} bp.`;
    } else if (overlapGc < 35) {
      status = 'low_gc';
      message = `Low GC content (${overlapGc.toFixed(1)}%). May reduce assembly efficiency.`;
    } else if (overlapGc > 65) {
      status = 'high_gc';
      message = `High GC content (${overlapGc.toFixed(1)}%). Risk of secondary structure or mispriming.`;
    } else if (checkHairpin(overlap)) {
      status = 'hairpin_risk';
      message = 'Hairpin/inverted repeat detected in overlap region.';
    }

    junctions.push({
      upstreamName: curr.name,
      downstreamName: next.name,
      overlapSeq: overlap,
      overlapLength: actualOverlapLen,
      overlapTm,
      overlapGc,
      status,
      message,
    });
  }

  // 2. Primer Design
  const amplifyAll = options.amplifyAllFragments ?? (method === 'nebuilder' || options.circularize === true);

  if (method === 'nebuilder' || amplifyAll) {
    // PCR amplifies all fragments (or vector + all inserts) with balanced overlap split
    const half1 = Math.floor(overlapLen / 2);
    const half2 = overlapLen - half1;

    for (let i = 0; i < allFragments.length; i++) {
      const curr = allFragments[i]!;
      const prev = allFragments[(i - 1 + allFragments.length) % allFragments.length]!;
      const next = allFragments[(i + 1) % allFragments.length]!;

      // Find optimal annealing lengths for this fragment
      const { fwdLen, revLen } = findOptimalPrimerPairLengths(
        curr.sequence,
        minPrimerLen,
        30,
        targetPrimerTm,
        maxPrimerTmDiff,
        tmOpts
      );

      // Forward Primer:
      // 5' Overhang = last half1 bases of prev fragment
      const fwdOverhang = prev.sequence.slice(-half1);
      const fwdAnnealSeq = curr.sequence.slice(0, fwdLen);
      const fwdFull = (fwdOverhang + fwdAnnealSeq).toLowerCase();
      const fwdAnnealTm = calcTm(fwdAnnealSeq, tmOpts);
      const fwdJunctionOverlap = prev.sequence.slice(-half1) + curr.sequence.slice(0, half2);
      const fwdOverlapTm = calcTm(fwdJunctionOverlap, tmOpts);

      const fwdWarnings: string[] = [];
      if (checkHairpin(fwdFull)) fwdWarnings.push("Potential 3' hairpin or secondary structure.");
      if (!fwdAnnealSeq.endsWith('G') && !fwdAnnealSeq.endsWith('C')) fwdWarnings.push("Lacks 3' GC clamp.");

      // Reverse Primer:
      // 5' Overhang = reverse complement of first half2 bases of next fragment
      const next5p = next.sequence.slice(0, half2);
      const revOverhang = revComp(next5p);
      const revAnnealTemplate = curr.sequence.slice(-revLen);
      const revAnnealSeq = revComp(revAnnealTemplate);
      const revFull = (revOverhang + revAnnealSeq).toLowerCase();
      const revAnnealTm = calcTm(revAnnealSeq, tmOpts);
      const revJunctionOverlap = curr.sequence.slice(-half1) + next.sequence.slice(0, half2);
      const revOverlapTm = calcTm(revJunctionOverlap, tmOpts);

      const revWarnings: string[] = [];
      if (checkHairpin(revFull)) revWarnings.push("Potential 3' hairpin or secondary structure.");
      if (!revAnnealSeq.endsWith('G') && !revAnnealSeq.endsWith('C')) revWarnings.push("Lacks 3' GC clamp.");
      if (Math.abs(fwdAnnealTm - revAnnealTm) > maxPrimerTmDiff) {
        revWarnings.push(`Annealing Tm difference (${Math.abs(fwdAnnealTm - revAnnealTm).toFixed(1)}°C) exceeds ${maxPrimerTmDiff}°C.`);
      }

      // Recommended Ta for Q5: based on lower annealing Tm
      const pairLowerTm = Math.min(fwdAnnealTm, revAnnealTm);
      const recTa = Math.round(pairLowerTm > 65 ? pairLowerTm : Math.max(55, pairLowerTm - 2));

      primers.push({
        name: `${curr.name}_fwd`,
        targetFragmentName: curr.name,
        direction: 'forward',
        fullSequence: fwdFull,
        overhangSeq: fwdOverhang,
        annealSeq: fwdAnnealSeq,
        totalLength: fwdFull.length,
        overhangLength: fwdOverhang.length,
        annealLength: fwdAnnealSeq.length,
        annealTm: fwdAnnealTm,
        overhangTm: fwdOverlapTm,
        gcPercent: Math.round(calcGc(fwdFull)),
        recommendedTa: recTa,
        warnings: fwdWarnings,
      });

      primers.push({
        name: `${curr.name}_rev`,
        targetFragmentName: curr.name,
        direction: 'reverse',
        fullSequence: revFull,
        overhangSeq: revOverhang,
        annealSeq: revAnnealSeq,
        totalLength: revFull.length,
        overhangLength: revOverhang.length,
        annealLength: revAnnealSeq.length,
        annealTm: revAnnealTm,
        overhangTm: revOverlapTm,
        gcPercent: Math.round(calcGc(revFull)),
        recommendedTa: recTa,
        warnings: revWarnings,
      });
    }
  } else {
    // Classic Gibson / In-Fusion: primers for inserts only
    for (let idx = 0; idx < cleanInserts.length; idx++) {
      const ins = cleanInserts[idx]!;
      const prevFrag = idx === 0 ? allFragments[0]! : cleanInserts[idx - 1]!;
      const nextFrag = idx === cleanInserts.length - 1 ? allFragments[0]! : cleanInserts[idx + 1]!;

      // Forward Primer: 5' overhang from 3' end of prevFrag
      const fwdOverhang = prevFrag.sequence.slice(-overlapLen);
      const fwdAnneal = findAnnealingRegion(ins.sequence, true, targetPrimerTm, 17, 30, tmOpts);
      const fwdFull = (fwdOverhang + fwdAnneal.seq).toUpperCase();
      const fwdWarnings: string[] = [];

      if (fwdAnneal.tm < targetPrimerTm - 5) fwdWarnings.push('Annealing Tm below target.');
      if (checkHairpin(fwdFull)) fwdWarnings.push("Potential 3' hairpin/dimer formation.");
      if (!fwdAnneal.seq.endsWith('G') && !fwdAnneal.seq.endsWith('C')) fwdWarnings.push("Lacks 3' GC clamp.");

      primers.push({
        name: `${ins.name}_Fwd`,
        targetFragmentName: ins.name,
        direction: 'forward',
        fullSequence: fwdFull,
        overhangSeq: fwdOverhang,
        annealSeq: fwdAnneal.seq,
        totalLength: fwdFull.length,
        overhangLength: fwdOverhang.length,
        annealLength: fwdAnneal.seq.length,
        annealTm: fwdAnneal.tm,
        overhangTm: calcTm(fwdOverhang, tmOpts),
        gcPercent: Math.round(calcGc(fwdFull)),
        recommendedTa: Math.round(fwdAnneal.tm + 3),
        warnings: fwdWarnings,
      });

      // Reverse Primer: 5' overhang from 5' end of nextFrag (RC)
      const next5Prime = nextFrag.sequence.slice(0, overlapLen);
      const revOverhang = revComp(next5Prime);
      const revAnneal = findAnnealingRegion(ins.sequence, false, targetPrimerTm, 17, 30, tmOpts);
      const revAnnealRc = revComp(revAnneal.seq);
      const revFull = (revOverhang + revAnnealRc).toUpperCase();
      const revWarnings: string[] = [];

      if (revAnneal.tm < targetPrimerTm - 5) revWarnings.push('Annealing Tm below target.');
      if (checkHairpin(revFull)) revWarnings.push("Potential 3' hairpin/dimer formation.");
      if (!revAnnealRc.endsWith('G') && !revAnnealRc.endsWith('C')) revWarnings.push("Lacks 3' GC clamp.");

      primers.push({
        name: `${ins.name}_Rev`,
        targetFragmentName: ins.name,
        direction: 'reverse',
        fullSequence: revFull,
        overhangSeq: revOverhang,
        annealSeq: revAnnealRc,
        totalLength: revFull.length,
        overhangLength: revOverhang.length,
        annealLength: revAnnealRc.length,
        annealTm: revAnneal.tm,
        overhangTm: calcTm(revOverhang, tmOpts),
        gcPercent: Math.round(calcGc(revFull)),
        recommendedTa: Math.round(revAnneal.tm + 3),
        warnings: revWarnings,
      });
    }
  }

  // 3. Assemble construct
  let assembled = cleanVec;
  for (const ins of cleanInserts) {
    assembled += ins.sequence;
  }

  return {
    method,
    assembledSequence: assembled,
    assembledLength: assembled.length,
    junctions,
    primers,
    warnings,
  };
}
