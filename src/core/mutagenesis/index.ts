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
  const pLen = cleanPlasmid.length;

  const wtCodon = cleanPlasmid.slice(targetBpStart, targetBpStart + wtCodonLen);
  const wtAa = GENETIC_CODE[wtCodon] || '?';
  const mutCodon = mutantCodonSeq.toUpperCase();
  const mutAa = GENETIC_CODE[mutCodon] || '?';

  // 1. Forward Primer:
  // Starts with mutantCodon at 5' end, followed by downstream template sequence
  let bestFwdTm = 0;
  let bestFwdSeq = '';

  for (let len = 15; len <= 35; len++) {
    // Read downstream on forward strand (circular wrap)
    let downstream = '';
    for (let k = 0; k < len; k++) {
      const idx = (targetBpStart + wtCodonLen + k) % pLen;
      downstream += cleanPlasmid[idx];
    }
    const tm = calcTm(downstream);
    if (Math.abs(tm - targetPrimerTm) < Math.abs(bestFwdTm - targetPrimerTm) || bestFwdSeq === '') {
      bestFwdTm = tm;
      bestFwdSeq = mutCodon + downstream;
    }
  }

  // 2. Reverse Primer:
  // Starts at the nucleotide immediately 5' of targetBpStart, extending in reverse direction (back-to-back, no overlap)
  let bestRevTm = 0;
  let bestRevSeq = '';

  for (let len = 15; len <= 35; len++) {
    let upstream = '';
    for (let k = 0; k < len; k++) {
      const idx = (targetBpStart - 1 - k + pLen * 2) % pLen;
      upstream += cleanPlasmid[idx];
    }
    const tm = calcTm(upstream);
    if (Math.abs(tm - bestFwdTm) < Math.abs(bestRevTm - bestFwdTm) || bestRevSeq === '') {
      bestRevTm = tm;
      // Reverse primer is reverse complement of upstream sequence
      bestRevSeq = revComp(upstream);
    }
  }

  // Recommended Ta for Q5 is lower Tm + 3°C
  const lowerTm = Math.min(bestFwdTm, bestRevTm);
  const recommendedTa = Math.round(lowerTm + 3);

  // Construct mutant plasmid sequence
  const mutantPlasmid =
    cleanPlasmid.slice(0, targetBpStart) +
    mutCodon +
    cleanPlasmid.slice(targetBpStart + wtCodonLen);

  const pcrProgram = {
    initialDenat: '98°C for 30 seconds',
    cycling: `25 cycles: 98°C for 10 s | ${recommendedTa}°C for 20 s | 72°C for ${Math.max(20, Math.ceil((pLen / 1000) * 30))} s (30 s/kb)`,
    finalExt: '72°C for 2 minutes',
    kldTreatment: '5 minutes at room temperature (Kinase, Ligase, DpnI)',
  };

  return {
    wtCodon,
    wtAa,
    mutCodon,
    mutAa,
    aaPosition: Math.floor(targetBpStart / 3) + 1,
    ntPosition: targetBpStart + 1,
    forwardPrimer: {
      name: `Mut_${wtAa}${Math.floor(targetBpStart / 3) + 1}${mutAa}_Fwd`,
      sequence: bestFwdSeq,
      length: bestFwdSeq.length,
      tm: bestFwdTm,
      gc: calcGc(bestFwdSeq),
      mutationOffsetFrom5Prime: mutCodon.length,
    },
    reversePrimer: {
      name: `Mut_${wtAa}${Math.floor(targetBpStart / 3) + 1}${mutAa}_Rev`,
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
