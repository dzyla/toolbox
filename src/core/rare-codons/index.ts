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

// Kazusa codon usage tables (frequencies per thousand)
export const ECOLI_CODON_USAGE: Record<string, CodonUsageEntry> = {
  TTT: { aa: 'F', fraction: 0.42, frequencyPerThousand: 22.4 },
  TTC: { aa: 'F', fraction: 0.58, frequencyPerThousand: 16.5 },
  TTA: { aa: 'L', fraction: 0.14, frequencyPerThousand: 13.9 },
  TTG: { aa: 'L', fraction: 0.13, frequencyPerThousand: 13.7 },
  CTT: { aa: 'L', fraction: 0.12, frequencyPerThousand: 11.0 },
  CTC: { aa: 'L', fraction: 0.10, frequencyPerThousand: 11.1 },
  CTA: { aa: 'L', fraction: 0.04, frequencyPerThousand: 3.7 }, // RARE
  CTG: { aa: 'L', fraction: 0.47, frequencyPerThousand: 52.8 }, // OPTIMAL
  ATT: { aa: 'I', fraction: 0.49, frequencyPerThousand: 30.5 },
  ATC: { aa: 'I', fraction: 0.42, frequencyPerThousand: 25.1 },
  ATA: { aa: 'I', fraction: 0.09, frequencyPerThousand: 4.1 }, // RARE
  ATG: { aa: 'M', fraction: 1.00, frequencyPerThousand: 27.9 },
  GTT: { aa: 'V', fraction: 0.28, frequencyPerThousand: 18.2 },
  GTC: { aa: 'V', fraction: 0.20, frequencyPerThousand: 15.3 },
  GTA: { aa: 'V', fraction: 0.17, frequencyPerThousand: 10.9 },
  GTG: { aa: 'V', fraction: 0.35, frequencyPerThousand: 26.3 },
  TCT: { aa: 'S', fraction: 0.17, frequencyPerThousand: 8.5 },
  TCC: { aa: 'S', fraction: 0.15, frequencyPerThousand: 8.6 },
  TCA: { aa: 'S', fraction: 0.14, frequencyPerThousand: 7.1 },
  TCG: { aa: 'S', fraction: 0.14, frequencyPerThousand: 8.9 },
  AGT: { aa: 'S', fraction: 0.16, frequencyPerThousand: 8.8 },
  AGC: { aa: 'S', fraction: 0.25, frequencyPerThousand: 16.0 }, // OPTIMAL
  CCT: { aa: 'P', fraction: 0.18, frequencyPerThousand: 7.0 },
  CCC: { aa: 'P', fraction: 0.13, frequencyPerThousand: 5.5 }, // RARE
  CCA: { aa: 'P', fraction: 0.20, frequencyPerThousand: 8.5 },
  CCG: { aa: 'P', fraction: 0.49, frequencyPerThousand: 23.3 }, // OPTIMAL
  ACT: { aa: 'T', fraction: 0.19, frequencyPerThousand: 8.9 },
  ACC: { aa: 'T', fraction: 0.40, frequencyPerThousand: 23.4 }, // OPTIMAL
  ACA: { aa: 'T', fraction: 0.15, frequencyPerThousand: 7.0 },
  ACG: { aa: 'T', fraction: 0.26, frequencyPerThousand: 14.4 },
  GCT: { aa: 'A', fraction: 0.18, frequencyPerThousand: 15.3 },
  GCC: { aa: 'A', fraction: 0.26, frequencyPerThousand: 25.5 },
  GCA: { aa: 'A', fraction: 0.23, frequencyPerThousand: 20.3 },
  GCG: { aa: 'A', fraction: 0.33, frequencyPerThousand: 33.7 }, // OPTIMAL
  TAT: { aa: 'Y', fraction: 0.43, frequencyPerThousand: 16.2 },
  TAC: { aa: 'Y', fraction: 0.57, frequencyPerThousand: 12.2 },
  TAA: { aa: '*', fraction: 0.61, frequencyPerThousand: 2.0 },
  TAG: { aa: '*', fraction: 0.09, frequencyPerThousand: 0.3 },
  TGA: { aa: '*', fraction: 0.30, frequencyPerThousand: 1.0 },
  CAT: { aa: 'H', fraction: 0.57, frequencyPerThousand: 12.9 },
  CAC: { aa: 'H', fraction: 0.43, frequencyPerThousand: 9.7 },
  CAA: { aa: 'Q', fraction: 0.34, frequencyPerThousand: 15.4 },
  CAG: { aa: 'Q', fraction: 0.66, frequencyPerThousand: 28.9 },
  AAT: { aa: 'N', fraction: 0.49, frequencyPerThousand: 17.7 },
  AAC: { aa: 'N', fraction: 0.51, frequencyPerThousand: 21.6 },
  AAA: { aa: 'K', fraction: 0.74, frequencyPerThousand: 33.6 },
  AAG: { aa: 'K', fraction: 0.26, frequencyPerThousand: 10.3 },
  GAT: { aa: 'D', fraction: 0.63, frequencyPerThousand: 32.2 },
  GAC: { aa: 'D', fraction: 0.37, frequencyPerThousand: 19.1 },
  GAA: { aa: 'E', fraction: 0.68, frequencyPerThousand: 39.6 },
  GAG: { aa: 'E', fraction: 0.32, frequencyPerThousand: 17.9 },
  TGT: { aa: 'C', fraction: 0.46, frequencyPerThousand: 5.2 },
  TGC: { aa: 'C', fraction: 0.54, frequencyPerThousand: 6.4 },
  TGG: { aa: 'W', fraction: 1.00, frequencyPerThousand: 15.3 },
  CGT: { aa: 'R', fraction: 0.36, frequencyPerThousand: 20.9 }, // OPTIMAL
  CGC: { aa: 'R', fraction: 0.36, frequencyPerThousand: 22.0 }, // OPTIMAL
  CGA: { aa: 'R', fraction: 0.07, frequencyPerThousand: 3.1 }, // RARE
  CGG: { aa: 'R', fraction: 0.11, frequencyPerThousand: 5.4 }, // RARE
  AGA: { aa: 'R', fraction: 0.04, frequencyPerThousand: 2.1 }, // VERY RARE
  AGG: { aa: 'R', fraction: 0.02, frequencyPerThousand: 1.4 }, // EXTREMELY RARE
  GGT: { aa: 'G', fraction: 0.35, frequencyPerThousand: 24.7 },
  GGC: { aa: 'G', fraction: 0.38, frequencyPerThousand: 29.6 },
  GGA: { aa: 'G', fraction: 0.13, frequencyPerThousand: 7.8 }, // RARE
  GGG: { aa: 'G', fraction: 0.15, frequencyPerThousand: 11.0 },
};

export const HUMAN_CODON_USAGE: Record<string, CodonUsageEntry> = { ...ECOLI_CODON_USAGE }; // fallback map

export const HOST_NAMES: Record<HostOrganism, string> = {
  ecoli: 'Escherichia coli (BL21 / K-12)',
  yeast: 'Saccharomyces cerevisiae / Pichia',
  human: 'Human / Mammalian (HEK293 / CHO)',
  insect: 'Insect (Spodoptera frugiperda Sf9)',
};

/** E. coli specific rare codons (Rosetta pRARE target codons) */
export const ECOLI_RARE_CODONS = new Set([
  'AGG', 'AGA', 'CGA', 'CGG', // Arg
  'AUA', 'ATA',               // Ile
  'CUA', 'CTA',               // Leu
  'CCC',                      // Pro
  'GGA',                      // Gly
]);

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

  const usageTable = ECOLI_CODON_USAGE;

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
    if (ECOLI_RARE_CODONS.has(codon) || freq < 6.0 || wi < 0.15) {
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
