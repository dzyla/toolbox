/**
 * Rare Codon & Recombinant Expression Optimizer
 * Computes Codon Adaptation Index (CAI), GC3 wobble content,
 * ribosomal pause hotspots, host strain recommendations (BL21 vs Rosetta),
 * and generates synonymously optimized coding sequences.
 */

export interface CodonUsageEntry {
  aa: string;
  fraction: number; // 0.0 to 1.0 among synonyms
  frequencyPerThousand: number;
}

export type HostOrganism = 'ecoli' | 'yeast' | 'human' | 'insect';

export interface EvaluatedCodon {
  index: number; // 0-indexed codon
  position: number; // 1-indexed amino acid
  codon: string;
  aa: string;
  frequencyPerThousand: number;
  relativeAdaptiveness: number; // w_i
  status: 'optimal' | 'moderate' | 'rare';
  suggestedCodon?: string;
}

export interface CodonPauseCluster {
  startAa: number;
  endAa: number;
  codons: EvaluatedCodon[];
  description: string;
}

export interface CodonAnalysisResult {
  host: HostOrganism;
  totalCodons: number;
  overallGc: number;
  gc3: number; // 3rd position GC
  cai: number; // Codon Adaptation Index (0.0 to 1.0)
  rareCodonCount: number;
  rareCodonPct: number;
  optimalCodonCount: number;
  optimalCodonPct: number;
  evaluatedCodons: EvaluatedCodon[];
  pauseClusters: CodonPauseCluster[];
  strainRecommendation: {
    recommendedStrain: string;
    reason: string;
    isRareStrainNeeded: boolean;
  };
  optimizedDna: string;
  optimizedCai: number;
}

import codonUsageJson from '@/data/codon-usage.json';

export const ECOLI_CODON_USAGE: Record<string, CodonUsageEntry> = codonUsageJson.tables.ecoli as Record<string, CodonUsageEntry>;
export const HUMAN_CODON_USAGE: Record<string, CodonUsageEntry> = codonUsageJson.tables.human as Record<string, CodonUsageEntry>;
export const YEAST_CODON_USAGE: Record<string, CodonUsageEntry> = codonUsageJson.tables.yeast as Record<string, CodonUsageEntry>;
export const INSECT_CODON_USAGE: Record<string, CodonUsageEntry> = codonUsageJson.tables.insect as Record<string, CodonUsageEntry>;

export const HOST_CODON_USAGE: Record<HostOrganism, Record<string, CodonUsageEntry>> = {
  ecoli: ECOLI_CODON_USAGE,
  human: HUMAN_CODON_USAGE,
  yeast: YEAST_CODON_USAGE,
  insect: INSECT_CODON_USAGE,
};

export const HOST_NAMES: Record<HostOrganism, string> = {
  ecoli: 'Escherichia coli (BL21 / K-12)',
  yeast: 'Saccharomyces cerevisiae / Pichia',
  human: 'Human / Mammalian (HEK293 / CHO)',
  insect: 'Insect (Spodoptera frugiperda Sf9)',
};

/** Host-specific rare codons */
export const ECOLI_RARE_CODONS = new Set([
  'AGG', 'AGA', 'CGA', 'CGG', // Arg
  'AUA', 'ATA',               // Ile
  'CUA', 'CTA',               // Leu
  'CCC',                      // Pro
  'GGA',                      // Gly
]);

export const HOST_RARE_CODONS: Record<HostOrganism, Set<string>> = {
  ecoli: ECOLI_RARE_CODONS,
  human: new Set(['TCG', 'CGT', 'ACG', 'CGA', 'CCG', 'CUA', 'CTA', 'GUA', 'GCG', 'AUA', 'ATA', 'UUA', 'TTA']),
  yeast: new Set(['CGG', 'CGC', 'CGA', 'CGT', 'CCG', 'CCC', 'CTC', 'CUC', 'GGG', 'GCG', 'ACG', 'TGC', 'UGC']),
  insect: new Set(['CGG', 'GGG', 'CGA', 'CUA', 'CTA', 'UUA', 'TTA', 'UCG', 'CCG', 'AUA', 'ATA', 'AGU']),
};

export function cleanDna(raw: string): string {
  return raw
    .replace(/^>.*$/gm, '')
    .replace(/[^atcgunATCGUN]/g, '')
    .toUpperCase()
    .replace(/U/g, 'T');
}

/**
 * Analyzes coding DNA sequence for rare codons, CAI, GC3, and pause clusters.
 */
export function analyzeCodonUsage(
  dna: string,
  host: HostOrganism = 'ecoli'
): CodonAnalysisResult {
  const clean = cleanDna(dna);
  const totalCodons = Math.floor(clean.length / 3);

  const usageTable = HOST_CODON_USAGE[host] || ECOLI_CODON_USAGE;
  const rareSet = HOST_RARE_CODONS[host] || ECOLI_RARE_CODONS;

  // Find max frequency for each AA to compute relative adaptiveness w_i
  const maxFreqPerAa: Record<string, number> = {};
  const bestCodonPerAa: Record<string, string> = {};

  for (const [codon, entry] of Object.entries(usageTable)) {
    if (!maxFreqPerAa[entry.aa] || entry.frequencyPerThousand > maxFreqPerAa[entry.aa]!) {
      maxFreqPerAa[entry.aa] = entry.frequencyPerThousand;
      bestCodonPerAa[entry.aa] = codon;
    }
  }

  const evaluatedCodons: EvaluatedCodon[] = [];
  let logWSum = 0;
  let rareCount = 0;
  let gcCount = 0;
  let gc3Count = 0;

  for (let i = 0; i < totalCodons; i++) {
    const codon = clean.slice(i * 3, i * 3 + 3);
    const entry = usageTable[codon];
    const aa = entry?.aa || '?';
    const freq = entry?.frequencyPerThousand || 10;
    const maxFreq = maxFreqPerAa[aa] || 25;
    const wi = Math.max(0.01, freq / maxFreq);

    logWSum += Math.log(wi);

    // GC metrics
    if (codon[0] === 'G' || codon[0] === 'C') gcCount++;
    if (codon[1] === 'G' || codon[1] === 'C') gcCount++;
    if (codon[2] === 'G' || codon[2] === 'C') {
      gcCount++;
      gc3Count++;
    }

    // Status
    let status: EvaluatedCodon['status'] = 'optimal';
    if (rareSet.has(codon) || freq < 6.0 || wi < 0.15) {
      status = 'rare';
      rareCount++;
    } else if (freq < 12.0 || wi < 0.35) {
      status = 'moderate';
    }

    evaluatedCodons.push({
      index: i,
      position: i + 1,
      codon,
      aa,
      frequencyPerThousand: freq,
      relativeAdaptiveness: wi,
      status,
      suggestedCodon: bestCodonPerAa[aa] || codon,
    });
  }

  // CAI = exp( 1/L * sum(ln w_i) )
  const cai = totalCodons > 0 ? Math.exp(logWSum / totalCodons) : 0;
  const overallGc = totalCodons > 0 ? ((gcCount / (totalCodons * 3)) * 100) : 0;
  const gc3 = totalCodons > 0 ? ((gc3Count / totalCodons) * 100) : 0;

  // Identify Ribosomal Pause Hotspots (clusters of >=2 rare codons within 8 codons)
  const pauseClusters: CodonPauseCluster[] = [];
  let wStart = 0;
  while (wStart < evaluatedCodons.length) {
    const window = evaluatedCodons.slice(wStart, wStart + 8);
    const rareInWindow = window.filter(c => c.status === 'rare');
    if (rareInWindow.length >= 2) {
      const firstRare = rareInWindow[0]!;
      const lastRare = rareInWindow[rareInWindow.length - 1]!;
      pauseClusters.push({
        startAa: firstRare.position,
        endAa: lastRare.position,
        codons: rareInWindow,
        description: `Cluster of ${rareInWindow.length} rare codons (${rareInWindow.map(c => `${c.codon}[${c.aa}]`).join(', ')}) across residues ${firstRare.position}–${lastRare.position}. High risk of ribosomal stalling.`,
      });
      wStart = lastRare.index + 1;
    } else {
      wStart++;
    }
  }

  // Strain Recommendation Engine
  let recommendedStrain = 'BL21(DE3)';
  let reason = 'Sequence has high Codon Adaptation Index (CAI) with no problematic rare codon clusters. Standard BL21(DE3) will yield high expression.';
  let isRareStrainNeeded = false;

  if (host === 'ecoli') {
    const rareArgs = evaluatedCodons.filter(c => ['AGG', 'AGA', 'CGA', 'CGG'].includes(c.codon)).length;
    const rareIles = evaluatedCodons.filter(c => c.codon === 'ATA' || c.codon === 'AUA').length;
    const rareLeus = evaluatedCodons.filter(c => c.codon === 'CTA' || c.codon === 'CUA').length;
    const rarePros = evaluatedCodons.filter(c => c.codon === 'CCC').length;

    if (pauseClusters.length > 0 || rareArgs >= 3 || rareIles >= 3) {
      isRareStrainNeeded = true;
      recommendedStrain = 'Rosetta 2(DE3)';
      reason = `Detected ${pauseClusters.length} ribosomal pause cluster(s) and rare codons (Arg: ${rareArgs}, Ile: ${rareIles}, Leu: ${rareLeus}, Pro: ${rarePros}). Rosetta 2(DE3) supplies all 7 rare tRNAs (AUA, AGG, AGA, CUA, CCC, GGA, CGG on pRARE2) to prevent translation arrest.`;
    } else if (rareCount > 0) {
      recommendedStrain = 'BL21 CodonPlus(DE3)-RIL';
      reason = `Minor rare codon presence (${rareCount} rare codons). CodonPlus-RIL supplies Arg, Ile, and Leu tRNAs for robust yields.`;
    }
  } else if (host === 'human') {
    if (cai < 0.75 || pauseClusters.length > 0) {
      isRareStrainNeeded = true;
      recommendedStrain = 'Codon-Optimized HEK293 / CHO';
      reason = `Mammalian CAI (${cai.toFixed(2)}) is suboptimal or contains rare codon clusters. Synonymous optimization to human preference (high GC3) is recommended for HEK293/CHO expression.`;
    } else {
      recommendedStrain = 'HEK293 / CHO-K1';
      reason = `High mammalian codon adaptation (CAI ${cai.toFixed(2)}). Well-suited for direct expression in human/mammalian host cells.`;
    }
  } else if (host === 'yeast') {
    if (cai < 0.75 || pauseClusters.length > 0) {
      isRareStrainNeeded = true;
      recommendedStrain = 'Codon-Optimized Pichia / S. cerevisiae';
      reason = `Yeast CAI (${cai.toFixed(2)}) is suboptimal or contains rare codon clusters. Synonymous optimization is recommended for Pichia pastoris / S. cerevisiae.`;
    } else {
      recommendedStrain = 'Pichia pastoris (GS115) / S. cerevisiae';
      reason = `Well-adapted to yeast codon bias (CAI ${cai.toFixed(2)}). Expected robust expression in yeast.`;
    }
  } else {
    // insect
    if (cai < 0.75 || pauseClusters.length > 0) {
      isRareStrainNeeded = true;
      recommendedStrain = 'Codon-Optimized Sf9 / High Five';
      reason = `Insect CAI (${cai.toFixed(2)}) is suboptimal. Synonymous adaptation to Sf9/High Five preference is recommended for baculovirus vectors.`;
    } else {
      recommendedStrain = 'Spodoptera frugiperda (Sf9 / Sf21)';
      reason = `Good insect codon compatibility (CAI ${cai.toFixed(2)}). Suitable for baculovirus expression.`;
    }
  }

  // Synonymously optimized DNA sequence
  let optimizedDna = '';
  let optLogWSum = 0;

  for (const c of evaluatedCodons) {
    const optCodon = c.suggestedCodon || c.codon;
    optimizedDna += optCodon;
    const entry = usageTable[optCodon];
    const maxFreq = maxFreqPerAa[c.aa] || 25;
    const wi = Math.max(0.01, (entry?.frequencyPerThousand || 25) / maxFreq);
    optLogWSum += Math.log(wi);
  }

  const optimizedCai = totalCodons > 0 ? Math.exp(optLogWSum / totalCodons) : 1.0;

  return {
    host,
    totalCodons,
    overallGc: Math.round(overallGc * 10) / 10,
    gc3: Math.round(gc3 * 10) / 10,
    cai: Math.round(cai * 1000) / 1000,
    rareCodonCount: rareCount,
    rareCodonPct: totalCodons > 0 ? Math.round(((rareCount / totalCodons) * 100) * 10) / 10 : 0,
    optimalCodonCount: totalCodons - rareCount - evaluatedCodons.filter(c => c.status === 'moderate').length,
    optimalCodonPct: totalCodons > 0
      ? Math.round((((totalCodons - rareCount - evaluatedCodons.filter(c => c.status === 'moderate').length) / totalCodons) * 100) * 10) / 10
      : 0,
    evaluatedCodons,
    pauseClusters,
    strainRecommendation: {
      recommendedStrain,
      reason,
      isRareStrainNeeded,
    },
    optimizedDna,
    optimizedCai: Math.round(optimizedCai * 1000) / 1000,
  };
}

export type ReadingFrame = 1 | 2 | 3 | -1 | -2 | -3;

export function reverseComplement(seq: string): string {
  const complement: Record<string, string> = {
    A: 'T', T: 'A', G: 'C', C: 'G',
    a: 't', t: 'a', g: 'c', c: 'g',
    U: 'T', u: 't', N: 'N', n: 'n',
  };
  return seq.split('').reverse().map(b => complement[b] || b).join('');
}

export function getSequenceInFrame(dna: string, frame: ReadingFrame): string {
  const clean = cleanDna(dna);
  if (frame > 0) {
    const offset = frame - 1;
    return clean.slice(offset);
  } else {
    const rev = reverseComplement(clean);
    const offset = Math.abs(frame) - 1;
    return rev.slice(offset);
  }
}

export interface DetectedOrf {
  frame: ReadingFrame;
  start: number;
  end: number;
  lengthBp: number;
  lengthAa: number;
  sequence: string;
  isAmpicillinBla: boolean;
  label: string;
}

/**
 * Searches across all 6 reading frames (+1 to -3) to automatically detect
 * the authentic coding Open Reading Frame (ORF).
 * Handles native sequences as well as inverted plasmid strands (e.g. bla on pUC19 strand -1).
 */
export function autoDetectBestOrf(rawDna: string, minAa = 30): DetectedOrf | null {
  const clean = cleanDna(rawDna);
  if (clean.length < 90) return null;

  const frames: ReadingFrame[] = [1, 2, 3, -1, -2, -3];
  let bestOrf: DetectedOrf | null = null;

  for (const frame of frames) {
    const strandSeq = frame > 0 ? clean : reverseComplement(clean);
    const offset = Math.abs(frame) - 1;

    let currentStart = -1;
    for (let i = offset; i + 2 < strandSeq.length; i += 3) {
      const codon = strandSeq.slice(i, i + 3);
      if (codon === 'ATG' && currentStart === -1) {
        currentStart = i;
      } else if ((codon === 'TAA' || codon === 'TAG' || codon === 'TGA') && currentStart !== -1) {
        const orfSeq = strandSeq.slice(currentStart, i + 3);
        const aaLen = orfSeq.length / 3 - 1;
        if (aaLen >= minAa) {
          // Check for Ampicillin (bla beta-lactamase) characteristics:
          // bla is 861 bp (286 aa) and starts with ATG AGT ATT CAA CAT TTC CGT GTC GCC CTT ATT CCC
          const isBla = orfSeq.length === 861 || orfSeq.includes('AGTATTCAACATTTCCGTGTC');

          if (!bestOrf || isBla || orfSeq.length > bestOrf.lengthBp) {
            bestOrf = {
              frame,
              start: currentStart + 1,
              end: i + 3,
              lengthBp: orfSeq.length,
              lengthAa: aaLen,
              sequence: orfSeq,
              isAmpicillinBla: isBla,
              label: isBla
                ? `Ampicillin Resistance (bla / β-lactamase, ${aaLen} aa on strand ${frame > 0 ? '+' : ''}${frame})`
                : `ORF ${aaLen} aa (${orfSeq.length} bp, frame ${frame > 0 ? '+' : ''}${frame})`,
            };
          }
        }
        currentStart = -1;
      }
    }
  }

  return bestOrf;
}

export interface MultiHostComparison {
  host: HostOrganism;
  hostName: string;
  cai: number;
  optimalPct: number;
  rarePct: number;
  rareCount: number;
  recommendedStrain: string;
  isRareStrainNeeded: boolean;
  reason: string;
}

export function compareAllHosts(dna: string): MultiHostComparison[] {
  const hosts: HostOrganism[] = ['ecoli', 'yeast', 'human', 'insect'];
  return hosts.map(h => {
    const res = analyzeCodonUsage(dna, h);
    return {
      host: h,
      hostName: HOST_NAMES[h],
      cai: res.cai,
      optimalPct: res.optimalCodonPct,
      rarePct: res.rareCodonPct,
      rareCount: res.rareCodonCount,
      recommendedStrain: res.strainRecommendation.recommendedStrain,
      isRareStrainNeeded: res.strainRecommendation.isRareStrainNeeded,
      reason: res.strainRecommendation.reason,
    };
  });
}

