/**
 * Site-Directed Mutagenesis Primer Designer (NEBaseChanger / Q5 SDM style)
 * Designs non-overlapping back-to-back primers for exponential whole-plasmid amplification
 * followed by Kinase-Ligase-DpnI (KLD) circularization.
 */

export interface CodonInfo {
  index: number; // 0-indexed codon index in ORF
  aaPos: number; // 1-indexed amino acid position
  wtCodon: string;
  wtAa: string;
  startBp: number; // 0-indexed in plasmid
  endBp: number;
}

export interface MutationDesignResult {
  wtCodon: string;
  wtAa: string;
  mutCodon: string;
  mutAa: string;
  aaPosition: number;
  ntPosition: number; // 1-indexed in plasmid
  forwardPrimer: {
    name: string;
    sequence: string; // 5' to 3'
    length: number;
    tm: number;
    gc: number;
    mutationOffsetFrom5Prime: number;
  };
  reversePrimer: {
    name: string;
    sequence: string; // 5' to 3'
    length: number;
    tm: number;
    gc: number;
  };
  recommendedTa: number; // °C for Q5
  mutantPlasmidSeq: string;
  mutantOrfSeq: string;
  mutantProteinSeq: string;
  pcrProgram: {
    initialDenat: string;
    cycling: string;
    finalExt: string;
    kldTreatment: string;
  };
}

export const GENETIC_CODE: Record<string, string> = {
  TTT: 'F', TTC: 'F', TTA: 'L', TTG: 'L',
  CTT: 'L', CTC: 'L', CTA: 'L', CTG: 'L',
  ATT: 'I', ATC: 'I', ATA: 'I', ATG: 'M',
  GTT: 'V', GTC: 'V', GTA: 'V', GTG: 'V',
  TCT: 'S', TCC: 'S', TCA: 'S', TCG: 'S',
  CCT: 'P', CCC: 'P', CCA: 'P', CCG: 'P',
  ACT: 'T', ACC: 'T', ACA: 'T', ACG: 'T',
  GCT: 'A', GCC: 'A', GCA: 'A', GCG: 'A',
  TAT: 'Y', TAC: 'Y', TAA: '*', TAG: '*',
  CAT: 'H', CAC: 'H', CAA: 'Q', CAG: 'Q',
  AAT: 'N', AAC: 'N', AAA: 'K', AAG: 'K',
  GAT: 'D', GAC: 'D', GAA: 'E', GAG: 'E',
  TGT: 'C', TGC: 'C', TGA: '*', TGG: 'W',
  CGT: 'R', CGC: 'R', CGA: 'R', CGG: 'R',
  AGT: 'S', AGC: 'S', AGA: 'R', AGG: 'R',
  GGT: 'G', GGC: 'G', GGA: 'G', GGG: 'G',
};

export const AA_NAMES: Record<string, string> = {
  A: 'Ala (Alanine)',
  C: 'Cys (Cysteine)',
  D: 'Asp (Aspartate)',
  E: 'Glu (Glutamate)',
  F: 'Phe (Phenylalanine)',
  G: 'Gly (Glycine)',
  H: 'His (Histidine)',
  I: 'Ile (Isoleucine)',
  K: 'Lys (Lysine)',
  L: 'Leu (Leucine)',
  M: 'Met (Methionine)',
  N: 'Asn (Asparagine)',
  P: 'Pro (Proline)',
  Q: 'Gln (Glutamine)',
  R: 'Arg (Arginine)',
  S: 'Ser (Serine)',
  T: 'Thr (Threonine)',
  V: 'Val (Valine)',
  W: 'Trp (Tryptophan)',
  Y: 'Tyr (Tyrosine)',
  '*': 'Stop (*)',
};

/** Preferred codons for E. coli high-level expression */
export const PREFERRED_CODONS_ECOLI: Record<string, string> = {
  A: 'GCG', C: 'TGC', D: 'GAT', E: 'GAA', F: 'TTC',
  G: 'GGC', H: 'CAC', I: 'ATC', K: 'AAA', L: 'CTG',
  M: 'ATG', N: 'AAC', P: 'CCG', Q: 'CAG', R: 'CGT',
  S: 'AGC', T: 'ACC', V: 'GTG', W: 'TGG', Y: 'TAC',
  '*': 'TAA',
};

export function cleanDna(raw: string): string {
  return raw
    .replace(/^>.*$/gm, '')
    .replace(/[^atcgunATCGUN]/g, '')
    .toUpperCase()
    .replace(/U/g, 'T');
}

export function revComp(dna: string): string {
  const comp: Record<string, string> = { A: 'T', T: 'A', C: 'G', G: 'C', N: 'N' };
  return dna
    .split('')
    .reverse()
    .map(base => comp[base] || 'N')
    .join('');
}

export function calcGc(dna: string): number {
  if (!dna.length) return 0;
  const gcCount = (dna.match(/[GC]/gi) || []).length;
  return Math.round(((gcCount / dna.length) * 100) * 10) / 10;
}

export function calcTm(dna: string): number {
  const clean = dna.toUpperCase();
  const len = clean.length;
  if (len === 0) return 0;
  if (len < 14) {
    const at = (clean.match(/[AT]/g) || []).length;
    const gc = (clean.match(/[GC]/g) || []).length;
    return 2 * at + 4 * gc;
  }
  const gc = (clean.match(/[GC]/g) || []).length;
  const tm = 64.9 + (41 * (gc - 16.4)) / len;
  return Math.round(tm * 10) / 10;
}

/** Translate DNA to Amino Acids */
export function translateDna(dna: string): string {
  const clean = cleanDna(dna);
  let prot = '';
  for (let i = 0; i <= clean.length - 3; i += 3) {
    const codon = clean.slice(i, i + 3);
    prot += GENETIC_CODE[codon] || 'X';
  }
  return prot;
}

/** Extract all codons in an ORF */
export function extractOrfCodons(orfDna: string, orfStartInPlasmid = 0): CodonInfo[] {
  const clean = cleanDna(orfDna);
  const codons: CodonInfo[] = [];
  const numCodons = Math.floor(clean.length / 3);

  for (let i = 0; i < numCodons; i++) {
    const codon = clean.slice(i * 3, i * 3 + 3);
    const aa = GENETIC_CODE[codon] || 'X';
    codons.push({
      index: i,
      aaPos: i + 1,
      wtCodon: codon,
      wtAa: aa,
      startBp: orfStartInPlasmid + i * 3,
      endBp: orfStartInPlasmid + i * 3 + 3,
    });
  }

  return codons;
}

export type MutationType = 'substitution' | 'insertion' | 'deletion';

export interface FlexibleMutationDesignResult {
  mutationType: MutationType;
  targetBpStart: number; // 0-indexed in plasmid
  replacedSequence: string;
  replacementSequence: string;
  forwardPrimer: {
    name: string;
    sequence: string; // 5' to 3'
    length: number;
    tm: number; // Annealing region Tm
    totalTm: number;
    gc: number;
    mutationOffsetFrom5Prime: number;
    mutationLength: number;
  };
  reversePrimer: {
    name: string;
    sequence: string; // 5' to 3'
    length: number;
    tm: number;
    gc: number;
  };
  recommendedTa: number; // °C for Q5
  mutantPlasmidSeq: string;
  mutantOrfSeq?: string;
  mutantProteinSeq?: string;
  pcrProgram: {
    initialDenat: string;
    cycling: string;
    finalExt: string;
    kldTreatment: string;
  };
}

/**
 * Designs flexible mutagenesis primers with complete sequence freedom:
 * - Arbitrary nucleotide substitutions (1 bp, 3 bp, or N bp)
 * - Arbitrary insertions of any length (e.g. tag additions, linkers)
 * - Arbitrary deletions of any length (e.g. domain cutouts)
 */
export function designFlexibleMutagenesis(
  plasmidDna: string,
  targetBpStart: number, // 0-indexed start position
  replacedLen: number, // 0 for pure insertion, >0 for substitution or deletion
  replacementSeq: string, // Sequence to insert/substitute (can be empty string for deletion)
  targetPrimerTm = 62
): FlexibleMutationDesignResult {
  const cleanPlasmid = cleanDna(plasmidDna);
  const pLen = cleanPlasmid.length;
  if (pLen === 0) throw new Error('Plasmid sequence cannot be empty');

  const normStart = ((targetBpStart % pLen) + pLen) % pLen;
  const cleanReplacement = cleanDna(replacementSeq);

  const replacedSequence = cleanPlasmid.slice(normStart, normStart + replacedLen);
  let mutationType: MutationType = 'substitution';
  if (replacedLen === 0 && cleanReplacement.length > 0) mutationType = 'insertion';
  else if (cleanReplacement.length === 0 && replacedLen > 0) mutationType = 'deletion';

  // 1. Forward Primer:
  // 5' end contains the mutation, followed by downstream template annealing sequence
  let bestFwdAnnealTm = 0;
  let bestFwdSeq = '';

  for (let len = 16; len <= 38; len++) {
    let downstream = '';
    for (let k = 0; k < len; k++) {
      const idx = (normStart + replacedLen + k) % pLen;
      downstream += cleanPlasmid[idx];
    }
    const tm = calcTm(downstream);
    if (Math.abs(tm - targetPrimerTm) < Math.abs(bestFwdAnnealTm - targetPrimerTm) || bestFwdSeq === '') {
      bestFwdAnnealTm = tm;
      bestFwdSeq = cleanReplacement + downstream;
    }
  }

  // 2. Reverse Primer:
  // Starts immediately 5' of normStart and extends upstream (reverse complemented)
  let bestRevTm = 0;
  let bestRevSeq = '';

  for (let len = 16; len <= 38; len++) {
    let upstream = '';
    for (let k = 0; k < len; k++) {
      const idx = (normStart - 1 - k + pLen * 2) % pLen;
      upstream += cleanPlasmid[idx];
    }
    const tm = calcTm(upstream);
    if (Math.abs(tm - bestFwdAnnealTm) < Math.abs(bestRevTm - bestFwdAnnealTm) || bestRevSeq === '') {
      bestRevTm = tm;
      bestRevSeq = revComp(upstream);
    }
  }

  const lowerTm = Math.min(bestFwdAnnealTm, bestRevTm);
  const recommendedTa = Math.round(lowerTm + 3);

  // Construct mutant plasmid
  const mutantPlasmid =
    cleanPlasmid.slice(0, normStart) +
    cleanReplacement +
    cleanPlasmid.slice(normStart + replacedLen);

  const mutLength = mutantPlasmid.length;

  const pcrProgram = {
    initialDenat: '98°C for 30 seconds',
    cycling: `25 cycles: 98°C for 10 s | ${recommendedTa}°C for 20 s | 72°C for ${Math.max(20, Math.ceil((mutLength / 1000) * 30))} s (30 s/kb)`,
    finalExt: '72°C for 2 minutes',
    kldTreatment: '5 minutes at room temperature (Kinase, Ligase, DpnI)',
  };

  const nameSuffix =
    mutationType === 'insertion'
      ? `Ins_${normStart + 1}_+${cleanReplacement.length}bp`
      : mutationType === 'deletion'
      ? `Del_${normStart + 1}_-${replacedLen}bp`
      : `Mut_${normStart + 1}_${replacedSequence}>${cleanReplacement}`;

  return {
    mutationType,
    targetBpStart: normStart,
    replacedSequence,
    replacementSequence: cleanReplacement,
    forwardPrimer: {
      name: `Fwd_${nameSuffix}`,
      sequence: bestFwdSeq,
      length: bestFwdSeq.length,
      tm: bestFwdAnnealTm,
      totalTm: calcTm(bestFwdSeq),
      gc: calcGc(bestFwdSeq),
      mutationOffsetFrom5Prime: cleanReplacement.length,
      mutationLength: cleanReplacement.length,
    },
    reversePrimer: {
      name: `Rev_${nameSuffix}`,
      sequence: bestRevSeq,
      length: bestRevSeq.length,
      tm: bestRevTm,
      gc: calcGc(bestRevSeq),
    },
    recommendedTa,
    mutantPlasmidSeq: mutantPlasmid,
    mutantOrfSeq: mutantPlasmid,
    mutantProteinSeq: translateDna(mutantPlasmid),
    pcrProgram,
  };
}

/**
 * Designs non-overlapping back-to-back mutagenesis primers (NEBaseChanger / Q5 SDM protocol).
 */
export function designSiteDirectedMutagenesis(
  plasmidDna: string,
  targetBpStart: number, // 0-indexed position in plasmid of the codon/nt to mutate
  mutantCodonSeq: string, // Replacement sequence (e.g. 3 bp codon)
  wtCodonLen = 3,
  targetPrimerTm = 62
): MutationDesignResult {
  const cleanPlasmid = cleanDna(plasmidDna);

  const wtCodon = cleanPlasmid.slice(targetBpStart, targetBpStart + wtCodonLen);
  const wtAa = GENETIC_CODE[wtCodon] || '?';
  const mutCodon = mutantCodonSeq.toUpperCase();
  const mutAa = GENETIC_CODE[mutCodon] || '?';

  const flex = designFlexibleMutagenesis(cleanPlasmid, targetBpStart, wtCodonLen, mutCodon, targetPrimerTm);

  return {
    wtCodon,
    wtAa,
    mutCodon,
    mutAa,
    aaPosition: Math.floor(targetBpStart / 3) + 1,
    ntPosition: targetBpStart + 1,
    forwardPrimer: {
      name: `Mut_${wtAa}${Math.floor(targetBpStart / 3) + 1}${mutAa}_Fwd`,
      sequence: flex.forwardPrimer.sequence,
      length: flex.forwardPrimer.length,
      tm: flex.forwardPrimer.tm,
      gc: flex.forwardPrimer.gc,
      mutationOffsetFrom5Prime: flex.forwardPrimer.mutationOffsetFrom5Prime,
    },
    reversePrimer: {
      name: `Mut_${wtAa}${Math.floor(targetBpStart / 3) + 1}${mutAa}_Rev`,
      sequence: flex.reversePrimer.sequence,
      length: flex.reversePrimer.length,
      tm: flex.reversePrimer.tm,
      gc: flex.reversePrimer.gc,
    },
    recommendedTa: flex.recommendedTa,
    mutantPlasmidSeq: flex.mutantPlasmidSeq,
    mutantOrfSeq: flex.mutantOrfSeq || flex.mutantPlasmidSeq,
    mutantProteinSeq: flex.mutantProteinSeq || translateDna(flex.mutantPlasmidSeq),
    pcrProgram: flex.pcrProgram,
  };
}

export interface ParsedMutation {
  raw: string;
  wtAa: string;
  position: number; // 1-indexed amino acid residue
  mutAa: string;
  valid: boolean;
  error?: string;
}

/**
 * Parses mutation lists in standard biochemical formats:
 * e.g. "A22Y", "S65T", "p.Ala22Tyr", "Y443H", separated by commas or spaces.
 */
export function parseMutationList(text: string): ParsedMutation[] {
  if (!text) return [];
  const tokens = text.split(/[\s,;]+/).filter(Boolean);
  return tokens.map(token => {
    // 1-letter code: e.g. A22Y, S65T, C123*
    const m1 = token.trim().match(/^([A-Za-z*])(\d+)([A-Za-z*])$/);
    if (m1) {
      return {
        raw: token,
        wtAa: m1[1]!.toUpperCase(),
        position: parseInt(m1[2]!, 10),
        mutAa: m1[3]!.toUpperCase(),
        valid: true,
      };
    }
    // 3-letter code: e.g. Ala22Tyr or p.Ala22Tyr
    const m3 = token.trim().replace(/^p\./, '').match(/^([A-Za-z]{3})(\d+)([A-Za-z]{3})$/);
    if (m3) {
      const codeTo1 = (code: string) => {
        const c = code.toUpperCase();
        for (const [one, name] of Object.entries(AA_NAMES)) {
          if (name.toUpperCase().startsWith(c)) return one;
        }
        return code[0]!.toUpperCase();
      };
      return {
        raw: token,
        wtAa: codeTo1(m3[1]!),
        position: parseInt(m3[2]!, 10),
        mutAa: codeTo1(m3[3]!),
        valid: true,
      };
    }
    return {
      raw: token,
      wtAa: '',
      position: 0,
      mutAa: '',
      valid: false,
      error: 'Unrecognized mutation syntax (e.g. A22Y or S65T)',
    };
  });
}

/**
 * Generates wild-type vs mutated DNA and translated protein sequences for visual comparison.
 */
export function generateMutatedSequence(
  templateDna: string,
  start0: number,
  replaceLength: number,
  replacementSeq: string,
): {
  mutatedDna: string;
  mutatedProtein: string;
  originalProtein: string;
  mutationWindow: {
    startBp: number;
    endBp: number;
    wtSegment: string;
    mutSegment: string;
  };
} {
  const clean = cleanDna(templateDna);
  const safeStart = Math.max(0, Math.min(clean.length, start0));
  const safeLen = Math.max(0, Math.min(clean.length - safeStart, replaceLength));
  const cleanRepl = cleanDna(replacementSeq);

  const before = clean.slice(0, safeStart);
  const after = clean.slice(safeStart + safeLen);
  const mutatedDna = before + cleanRepl + after;

  const originalProtein = translateDna(clean);
  const mutatedProtein = translateDna(mutatedDna);

  // Focus window around the mutation (e.g. 25 bp before and after)
  const winBefore = Math.max(0, safeStart - 24);
  const winAfter = Math.min(clean.length, safeStart + safeLen + 24);
  const wtSegment = clean.slice(winBefore, winAfter);
  const mutSegment = mutatedDna.slice(winBefore, winBefore + (safeStart - winBefore) + cleanRepl.length + (winAfter - safeStart - safeLen));

  return {
    mutatedDna,
    mutatedProtein,
    originalProtein,
    mutationWindow: {
      startBp: winBefore + 1,
      endBp: winAfter,
      wtSegment,
      mutSegment,
    },
  };
}
