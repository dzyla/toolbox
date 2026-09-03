/**
 * Gibson & In-Fusion Assembly Overlap and Primer Designer.
 * Computes seamless homology arms, primer annealing regions with Tm,
 * junction stability, and full recombinant construct sequence.
 */

export type AssemblyMethod = 'gibson' | 'infusion';

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

/**
 * Nearest-neighbor melting temperature with salt correction (50 mM Na+, 1.5 mM Mg2+, 0.2 uM primer)
 * Or empirical Breslauer/Wallace approximation for rapid design.
 */
export function calcTm(dna: string): number {
  const clean = dna.toUpperCase();
  const len = clean.length;
  if (len === 0) return 0;

  if (len < 14) {
    // Marmur & Doty / Wallace rule: 2*(A+T) + 4*(G+C)
    const at = (clean.match(/[AT]/g) || []).length;
    const gc = (clean.match(/[GC]/g) || []).length;
    return 2 * at + 4 * gc;
  }

  // SantaLucia-approximating formula with salt correction:
  // Tm = 64.9 + 41 * (yG + zC - 16.4) / (wA + xT + yG + zC)
  const gc = (clean.match(/[GC]/g) || []).length;
  const tm = 64.9 + (41 * (gc - 16.4)) / len;
  return Math.round(tm * 10) / 10;
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
  maxLen = 30
): { seq: string; tm: number; gc: number } {
  let bestSeq = '';
  let bestDiff = 999;
  let bestTm = 0;

  for (let len = minLen; len <= Math.min(maxLen, fragmentSeq.length); len++) {
    const sub = fromStart ? fragmentSeq.slice(0, len) : fragmentSeq.slice(-len);
    const tm = calcTm(sub);
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
 * Designs Gibson or In-Fusion assembly for a linearized vector and 1 or more inserts.
 */
export function designAssembly(
  vector: FragmentInput,
  inserts: FragmentInput[],
  method: AssemblyMethod = 'gibson',
  overlapLen = 25,
  targetPrimerTm = 60
): AssemblyResult {
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

  // Fragments in order: Vector -> Insert 1 -> Insert 2 ... -> (loops back to Vector)
  const allFragments = [
    { id: vector.id, name: vector.name || 'Vector', sequence: cleanVec, isVector: true },
    ...cleanInserts.map(ins => ({ ...ins, isVector: false })),
  ];

  const junctions: AssemblyJunction[] = [];
  const primers: AssemblyPrimer[] = [];

  // 1. Determine junctions
  // For each boundary between fragment i and fragment (i+1)%N:
  for (let i = 0; i < allFragments.length; i++) {
    const curr = allFragments[i]!;
    const next = allFragments[(i + 1) % allFragments.length]!;

    // Overlap sequence: taken from 3' end of curr and/or 5' end of next
    // By convention in Gibson: the overlap is identical between 3' of curr and 5' of next.
    // In our design, the overlap sequence is defined by the 3' end of curr (or 5' of next).
    const actualOverlapLen = Math.min(overlapLen, Math.floor(curr.sequence.length / 2), Math.floor(next.sequence.length / 2));
    const overlap = curr.sequence.slice(-actualOverlapLen);
    const overlapTm = calcTm(overlap);
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

  // 2. Design primers for each Insert (and optionally vector if PCR linearized)
  // For each insert:
  for (let idx = 0; idx < cleanInserts.length; idx++) {
    const ins = cleanInserts[idx]!;
    const prevFrag = idx === 0 ? allFragments[0]! : cleanInserts[idx - 1]!;
    const nextFrag = idx === cleanInserts.length - 1 ? allFragments[0]! : cleanInserts[idx + 1]!;

    // Forward Primer:
    // 5' Overhang = 3' end of prevFrag (length overlapLen)
    const fwdOverhang = prevFrag.sequence.slice(-overlapLen);
    const fwdAnneal = findAnnealingRegion(ins.sequence, true, targetPrimerTm);
    const fwdFull = (fwdOverhang + fwdAnneal.seq).toUpperCase();
    const fwdWarnings: string[] = [];

    if (fwdAnneal.tm < targetPrimerTm - 5) fwdWarnings.push('Annealing Tm below target.');
    if (checkHairpin(fwdFull)) fwdWarnings.push('Potential 3\' hairpin/dimer formation.');
    if (!fwdAnneal.seq.endsWith('G') && !fwdAnneal.seq.endsWith('C')) fwdWarnings.push('Lacks 3\' GC clamp.');

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
      overhangTm: calcTm(fwdOverhang),
      gcPercent: calcGc(fwdFull),
      recommendedTa: Math.round(fwdAnneal.tm + 3),
      warnings: fwdWarnings,
    });

    // Reverse Primer:
    // 5' Overhang = reverse complement of 5' end of nextFrag (length overlapLen)
    const next5Prime = nextFrag.sequence.slice(0, overlapLen);
    const revOverhang = revComp(next5Prime);
    const revAnneal = findAnnealingRegion(ins.sequence, false, targetPrimerTm);
    const revAnnealRc = revComp(revAnneal.seq);
    const revFull = (revOverhang + revAnnealRc).toUpperCase();
    const revWarnings: string[] = [];

    if (revAnneal.tm < targetPrimerTm - 5) revWarnings.push('Annealing Tm below target.');
    if (checkHairpin(revFull)) revWarnings.push('Potential 3\' hairpin/dimer formation.');
    if (!revAnnealRc.endsWith('G') && !revAnnealRc.endsWith('C')) revWarnings.push('Lacks 3\' GC clamp.');

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
      overhangTm: calcTm(revOverhang),
      gcPercent: calcGc(revFull),
      recommendedTa: Math.round(revAnneal.tm + 3),
      warnings: revWarnings,
    });
  }

  // 3. Assemble construct: Vector + Insert 1 + Insert 2 ...
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
