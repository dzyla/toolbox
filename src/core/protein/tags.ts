/* Tag Library & Protease Cleavage Simulator core module. Pure TypeScript, no DOM dependencies.
   Literature:
   - Waugh DS (2011) Protein Expr Purif 80:283-293. An overview of tools for the cleavage of fusion proteins by site-specific proteases.
   - Kapust RB et al. (2002) Protein Eng 15:871-874. The P1' tolerance of tobacco etch virus protease and implications for the removal of affinity tags from recombinant proteins.
*/

import {
  countAA,
  molecularWeight,
  isoelectricPoint,
  extinctionCoefficients,
  sanitize,
} from './index';

// ---------------------------------------------------------------------------
// 1. Tag Database & Definitions
// ---------------------------------------------------------------------------

export type TagCategory = 'Affinity' | 'Epitope' | 'Solubility';
export type TagType = 'peptide' | 'domain';

export interface AffinityTagDefinition {
  id: string;
  name: string;
  shortName: string;
  sequence: string;
  approxMwDa: number;
  type: TagType;
  category: TagCategory;
  resin: string;
  elution: string;
  description: string;
  color: string;
}

export type KnownTagId =
  | 'his6'
  | 'his10'
  | 'gst'
  | 'mbp'
  | 'sumo'
  | 'twin_strep'
  | 'flag'
  | 'ha'
  | 'myc'
  | 'strep2'
  | 'v5';

/** Curated Tag Database based on Waugh (2011) and industry standards. */
export const TAG_DATABASE: Record<KnownTagId, AffinityTagDefinition> = {
  his6: {
    id: 'his6',
    name: '6xHis Tag (Hexahistidine)',
    shortName: 'His6',
    sequence: 'HHHHHH',
    approxMwDa: 840.8,
    type: 'peptide',
    category: 'Affinity',
    resin: 'Ni-NTA / Co²⁺-TALON (IMAC)',
    elution: '250–500 mM Imidazole',
    description: 'Hexahistidine peptide for Immobilized Metal Affinity Chromatography (IMAC). Compatible with native and denaturing conditions.',
    color: '#0d9488',
  },
  his10: {
    id: 'his10',
    name: '10xHis Tag (Decahistidine)',
    shortName: 'His10',
    sequence: 'HHHHHHHHHH',
    approxMwDa: 1388.3,
    type: 'peptide',
    category: 'Affinity',
    resin: 'Ni-NTA / Co²⁺-TALON (IMAC)',
    elution: '300–500 mM Imidazole',
    description: 'Decahistidine peptide conferring higher IMAC affinity, useful for stringent wash conditions or difficult membrane proteins.',
    color: '#0284c7',
  },
  gst: {
    id: 'gst',
    name: 'GST (Glutathione S-Transferase)',
    shortName: 'GST',
    sequence:
      'MSPILGYWKIKGLVQPTRLLLEYLEEKYEEHLYERDEGDKWRNKKFELGLEFPNLPYYIDGDVKLTQSMAIIRYIADKHNMLGGCPKERAEISMLEGAVLDIRYGVSRIAYSKDFETLKVDFLSKLPEMLKMFEDRLCHKTYLNGDHVTHPDFMLYDALDVVLYMDPMCLDAFPKLVCFKKRIEAIPQIDKYLKSSKYIAWPLQGWQATFGGGDHPPKSD',
    approxMwDa: 26000, // ~26 kDa (220 aa, 25.6 kDa)
    type: 'domain',
    category: 'Solubility',
    resin: 'Glutathione Agarose / Sepharose',
    elution: '10–20 mM Reduced Glutathione',
    description: '26 kDa folded domain from Schistosoma japonicum. Enhances expression and solubility; forms homodimers in solution.',
    color: '#b45309',
  },
  mbp: {
    id: 'mbp',
    name: 'MBP (Maltose-Binding Protein)',
    shortName: 'MBP',
    sequence:
      'MKIEEGKLVIWINGDKGYNGLAEVGKKFEKDTGIKVTVEHPDKLEEKFPQVAATGDGPDIIFWAHDRFGGYAQSGLLAEITPDKAFQDKLYPFTWDAVRYNGKLIAYPIAVEALSLIYNKDLLPNPPKTWEEIPALDKEIKAKGKSALMFNLQEPYFTWPLIAADGGYAFKYENGKYDIKDVGVDNAGAKAGLTFLVDLIKNKHMNADTDYSIAEAAFNKGETAMTINGPWAWSNIDTSKVNYGVTVLPTFKGQPSKPFVGVLSAGINAASPNKELAKEFLENYLLTDEGLEAVNKDKPLGAVALKSYEEELAKDPRIAATMENAQKGEIMPNIPQMSAFWYAVRTAVINAASGRQTVDEALKDAQTRITK',
    approxMwDa: 42500, // ~42.5 kDa (371 aa, 40.8 kDa)
    type: 'domain',
    category: 'Solubility',
    resin: 'Amylose Resin / Dextrin Sepharose',
    elution: '10–20 mM Maltose',
    description: '42.5 kDa periplasmic chaperone from E. coli malE. Renowned general solubility enhancer; monomeric.',
    color: '#4d7c0f',
  },
  sumo: {
    id: 'sumo',
    name: 'SUMO / Smt3 (Small Ubiquitin-like Modifier)',
    shortName: 'SUMO',
    sequence:
      'MSDSEVNQEAKPEVKPEVKPETHINLKVSDGSSEIFFKIKKTTPLRRLMEAFAKRQGKEMDSLRFLYDGIRIQADQTPEDLDMEDNDIIEAHREQIGG',
    approxMwDa: 11128, // ~11.5 kDa
    type: 'domain',
    category: 'Solubility',
    resin: 'Ni-NTA (in His-SUMO fusions) / Ulp1 Cleavage',
    elution: 'Proteolytic cleavage by SUMO Protease (Ulp1) leaves native N-terminus',
    description: '11.5 kDa yeast Smt3 domain. Enhances eukaryotic & prokaryotic folding; cleaved after C-terminal GG by Ulp1 with zero scar residues.',
    color: '#7e22ce',
  },
  twin_strep: {
    id: 'twin_strep',
    name: 'Twin-Strep-tag®',
    shortName: 'Twin-Strep',
    sequence: 'WSHPQFEKGGGSGGGSGGSAWSHPQFEK',
    approxMwDa: 2886, // ~3 kDa
    type: 'peptide',
    category: 'Affinity',
    resin: 'Strep-Tactin® / Strep-Tactin®XT',
    elution: '2.5–5 mM Desthiobiotin (Tactin) or 50 mM Biotin (Tactin XT)',
    description: 'Tandem Strep-II peptide tag with flexible linker (~3 kDa) providing picomolar to nanomolar affinity for Strep-Tactin XT.',
    color: '#0891b2',
  },
  flag: {
    id: 'flag',
    name: 'FLAG® Tag',
    shortName: 'FLAG',
    sequence: 'DYKDDDDK',
    approxMwDa: 1013,
    type: 'peptide',
    category: 'Epitope',
    resin: 'Anti-FLAG M1 / M2 Monoclonal Antibody Agarose',
    elution: '3xFLAG Peptide (100–150 µg/mL) or 0.1 M Glycine pH 3.5',
    description: 'Hydrophilic octapeptide tag. Inherently contains an Enterokinase cleavage site (DDDDK) at its C-terminus.',
    color: '#6366f1',
  },
  ha: {
    id: 'ha',
    name: 'HA Tag (Hemagglutinin)',
    shortName: 'HA',
    sequence: 'YPYDVPDYA',
    approxMwDa: 1102,
    type: 'peptide',
    category: 'Epitope',
    resin: 'Anti-HA Monoclonal Affinity Matrix',
    elution: 'HA Peptide (1–2 mg/mL) or 0.1 M Glycine pH 2.5',
    description: '9-amino-acid epitope from Influenza virus hemagglutinin (aa 98-106) widely used for Western blotting and immunoprecipitation.',
    color: '#f59e0b',
  },
  myc: {
    id: 'myc',
    name: 'c-Myc Tag',
    shortName: 'Myc',
    sequence: 'EQKLISEEDL',
    approxMwDa: 1203,
    type: 'peptide',
    category: 'Epitope',
    resin: 'Anti-c-Myc (9E10) Affinity Gel',
    elution: 'c-Myc Peptide (100–200 µg/mL) or 0.1 M Glycine pH 2.8',
    description: '10-amino-acid epitope derived from human c-myc oncogene (aa 410-419) recognized by 9E10 monoclonal antibody.',
    color: '#ec4899',
  },
  strep2: {
    id: 'strep2',
    name: 'Strep-tag® II',
    shortName: 'Strep-II',
    sequence: 'WSHPQFEK',
    approxMwDa: 1058,
    type: 'peptide',
    category: 'Affinity',
    resin: 'Strep-Tactin® Sepharose',
    elution: '2.5 mM Desthiobiotin',
    description: '8-residue peptide engineered to bind the biotin-binding pocket of engineered streptavidin.',
    color: '#06b6d4',
  },
  v5: {
    id: 'v5',
    name: 'V5 Tag',
    shortName: 'V5',
    sequence: 'GKPIPNPLLGLDST',
    approxMwDa: 1421,
    type: 'peptide',
    category: 'Epitope',
    resin: 'Anti-V5 Agarose',
    elution: 'V5 Peptide or Low pH',
    description: '14-amino-acid epitope derived from paramyxovirus SV5 P/V proteins.',
    color: '#14b8a6',
  },
};

export interface DetectedTag {
  tag: AffinityTagDefinition;
  start: number; // 0-based inclusive
  end: number;   // 0-based exclusive
  matchSequence: string;
  identity: number; // 0.0 to 1.0
}

/** Detects known affinity and epitope tags in an amino acid sequence. */
export function detectTags(rawSeq: string): DetectedTag[] {
  const { seq } = sanitize(rawSeq);
  if (!seq) return [];
  const detected: DetectedTag[] = [];

  // 1. Histidine tags: find runs of H >= 6
  const hisRegex = /H{6,}/g;
  for (const match of seq.matchAll(hisRegex)) {
    const runLength = match[0].length;
    const isTen = runLength >= 10;
    const tagDef = isTen ? TAG_DATABASE.his10! : TAG_DATABASE.his6!;
    detected.push({
      tag: tagDef,
      start: match.index!,
      end: match.index! + runLength,
      matchSequence: match[0],
      identity: 1.0,
    });
  }

  // 2. Exact/tandem peptide tags
  const peptideTagKeys: (keyof typeof TAG_DATABASE)[] = ['twin_strep', 'flag', 'ha', 'myc', 'strep2', 'v5'];
  for (const key of peptideTagKeys) {
    const def = TAG_DATABASE[key];
    if (!def) continue;
    let idx = seq.indexOf(def.sequence);
    while (idx !== -1) {
      detected.push({
        tag: def,
        start: idx,
        end: idx + def.sequence.length,
        matchSequence: def.sequence,
        identity: 1.0,
      });
      idx = seq.indexOf(def.sequence, idx + 1);
    }
  }

  // 3. Domain tags: GST, MBP, SUMO
  const domainTagKeys: (keyof typeof TAG_DATABASE)[] = ['sumo', 'gst', 'mbp'];
  for (const key of domainTagKeys) {
    const def = TAG_DATABASE[key];
    if (!def) continue;
    const targetSeq = def.sequence;
    const targetLen = targetSeq.length;

    // Check full exact match
    let idx = seq.indexOf(targetSeq);
    if (idx !== -1) {
      while (idx !== -1) {
        detected.push({
          tag: def,
          start: idx,
          end: idx + targetLen,
          matchSequence: targetSeq,
          identity: 1.0,
        });
        idx = seq.indexOf(targetSeq, idx + 1);
      }
      continue;
    }

    // Check substring or sliding window with >= 85% identity
    if (seq.length >= Math.floor(targetLen * 0.7)) {
      const windowSize = targetLen;
      if (seq.length >= windowSize) {
        for (let s = 0; s <= seq.length - windowSize; s++) {
          let identical = 0;
          for (let j = 0; j < windowSize; j++) {
            if (seq[s + j] === targetSeq[j]) identical++;
          }
          const identity = identical / windowSize;
          if (identity >= 0.85) {
            detected.push({
              tag: def,
              start: s,
              end: s + windowSize,
              matchSequence: seq.slice(s, s + windowSize),
              identity,
            });
            s += windowSize - 1; // skip forward
          }
        }
      } else {
        // Shorter fragment matching N- or C-terminal region of domain (>= 30 aa)
        const minLen = Math.min(seq.length, 30);
        let identical = 0;
        for (let j = 0; j < minLen; j++) {
          if (seq[j] === targetSeq[j]) identical++;
        }
        if (identical / minLen >= 0.9 && minLen >= 25) {
          detected.push({
            tag: def,
            start: 0,
            end: minLen,
            matchSequence: seq.slice(0, minLen),
            identity: identical / minLen,
          });
        }
      }
    }
  }

  // Sort by start position
  return detected.sort((a, b) => a.start - b.start || a.end - b.end);
}

// ---------------------------------------------------------------------------
// 2. Protease Database & Kapust (2002) Reference Data
// ---------------------------------------------------------------------------

/**
 * P1' tolerance of Tobacco Etch Virus (TEV) protease.
 * Relative processing efficiency (%) normalized to Gly = 100%.
 * Reference: Kapust RB et al. (2002) Protein Eng 15:871-874, Table I.
 */
export const KAPUST_2002_TEV_P1_PRIME_EFFICIENCY: Readonly<Record<string, number>> = Object.freeze({
  G: 100, // 100% Gly (canonical wild-type)
  S: 89,  // 89% Ser
  A: 82,  // 82% Ala
  C: 65,  // 65% Cys
  M: 57,  // 57% Met
  N: 52,  // 52% Asn
  Y: 42,  // 42% Tyr
  H: 41,  // 41% His
  D: 34,  // 34% Asp
  K: 29,  // 29% Lys
  W: 28,  // 28% Trp
  F: 26,  // 26% Phe
  Q: 24,  // 24% Gln
  R: 19,  // 19% Arg
  T: 17,  // 17% Thr
  L: 16,  // 16% Leu
  E: 15,  // 15% Glu
  V: 10,  // 10% Val
  I: 6,   // 6% Ile
  P: 0.1, // <0.1% Pro (essentially completely resistant to cleavage)
});

export interface CleavageSite {
  proteaseId: string;
  proteaseName: string;
  siteIndex: number;          // 0-based cut coordinate (cleavage occurs between siteIndex-1 and siteIndex)
  position1Based: number;     // 1-based position of the P1 residue (cleaves after residue #)
  motifSequence: string;      // recognition motif sequence
  motifStart: number;         // 0-based start of motif
  motifEnd: number;           // 0-based end of motif (exclusive)
  p1Residue: string;          // P1 amino acid
  p1PrimeResidue: string;     // P1' amino acid
  cleavageDescription: string;// Human readable explanation
  specificityRating: 'Optimal' | 'Tolerated' | 'Resistant' | 'Suboptimal';
  relativeEfficiencyPct?: number; // Kapust 2002 value for TEV
  scarOnTarget: string;       // Non-native residues left on target if N-term tag
}

export interface ProteaseDefinition {
  id: string;
  name: string;
  shortName: string;
  recognitionMotif: string;   // Display string e.g. "ENLYFQ↓[G/S/A/C/M]"
  cleavageRule: string;       // e.g. "Cuts after Q"
  optimalTemp: string;
  optimalBuffer: string;
  edtaCompatible: boolean;
  literature: string;
  color: string;
  findSites: (seq: string, relaxed?: boolean) => CleavageSite[];
}

export type KnownProteaseId =
  | 'tev'
  | 'hrv3c'
  | 'thrombin'
  | 'factor_xa'
  | 'enterokinase'
  | 'ulp1';

/** Protease Database based on Waugh (2011) and Kapust (2002). */
export const PROTEASE_DATABASE: Record<KnownProteaseId, ProteaseDefinition> = {
  tev: {
    id: 'tev',
    name: 'TEV Protease (Tobacco Etch Virus)',
    shortName: 'TEV',
    recognitionMotif: 'ENLYFQ↓[G/S/A/C/M]',
    cleavageRule: 'Cleaves between Gln (Q) and P1\' residue',
    optimalTemp: '30°C (2–4 h) or 4°C (overnight)',
    optimalBuffer: '50 mM Tris-HCl pH 8.0, 0.5 mM EDTA, 1 mM DTT',
    edtaCompatible: true,
    literature: 'Waugh DS (2011); Kapust RB et al. (2002) Protein Eng 15:871-874',
    color: '#0284c7',
    findSites: (seq: string, relaxed = false): CleavageSite[] => {
      const sites: CleavageSite[] = [];
      // Primary search for ENLYFQ followed by any residue
      const regex = /ENLYFQ(?=([A-Z]))/g;
      for (const m of seq.matchAll(regex)) {
        const start = m.index!;
        const motifLength = 6;
        const p1Prime = m[1] ?? '';
        const eff = KAPUST_2002_TEV_P1_PRIME_EFFICIENCY[p1Prime] ?? 20;
        const isOptimal = 'GSACM'.includes(p1Prime);
        const isResistant = p1Prime === 'P';

        if (!relaxed && !isOptimal) {
          // If not relaxed mode, only include canonical optimal [G/S/A/C/M]
          continue;
        }

        const rating = isResistant ? 'Resistant' : isOptimal ? 'Optimal' : 'Tolerated';
        const cutIdx = start + motifLength;

        sites.push({
          proteaseId: 'tev',
          proteaseName: 'TEV Protease',
          siteIndex: cutIdx,
          position1Based: cutIdx,
          motifSequence: `ENLYFQ${p1Prime}`,
          motifStart: start,
          motifEnd: start + motifLength + (p1Prime ? 1 : 0),
          p1Residue: 'Q',
          p1PrimeResidue: p1Prime,
          cleavageDescription: `Cleaves after Q${cutIdx} (P1) before ${p1Prime}${cutIdx + 1} (P1'). Efficiency: ${eff}%.`,
          specificityRating: rating,
          relativeEfficiencyPct: eff,
          scarOnTarget: p1Prime ? `${p1Prime} (at N-terminus)` : 'None',
        });
      }
      return sites;
    },
  },
  hrv3c: {
    id: 'hrv3c',
    name: 'HRV 3C / PreScission Protease',
    shortName: 'HRV 3C',
    recognitionMotif: 'LEVLFQ↓GP',
    cleavageRule: 'Cleaves between Gln (Q) and Gly (G)',
    optimalTemp: '4°C (16 h overnight; preserves fragile proteins)',
    optimalBuffer: '50 mM Tris-HCl pH 7.5, 150 mM NaCl, 1 mM EDTA, 1 mM DTT',
    edtaCompatible: true,
    literature: 'Waugh DS (2011) Protein Expr Purif 80:283-293; Cordingley MG et al.',
    color: '#7c3aed',
    findSites: (seq: string): CleavageSite[] => {
      const sites: CleavageSite[] = [];
      const regex = /LEVLFQ(?=GP)/g;
      for (const m of seq.matchAll(regex)) {
        const start = m.index!;
        const cutIdx = start + 6;
        sites.push({
          proteaseId: 'hrv3c',
          proteaseName: 'HRV 3C / PreScission',
          siteIndex: cutIdx,
          position1Based: cutIdx,
          motifSequence: 'LEVLFQGP',
          motifStart: start,
          motifEnd: start + 8,
          p1Residue: 'Q',
          p1PrimeResidue: 'G',
          cleavageDescription: `Cleaves after Q${cutIdx} (P1) before G${cutIdx + 1} (P1'). High specificity at 4°C.`,
          specificityRating: 'Optimal',
          scarOnTarget: 'GP (Gly-Pro at N-terminus)',
        });
      }
      return sites;
    },
  },
  thrombin: {
    id: 'thrombin',
    name: 'Thrombin',
    shortName: 'Thrombin',
    recognitionMotif: 'LVPR↓GS',
    cleavageRule: 'Cleaves after Arg (R)',
    optimalTemp: '20–25°C (2–16 h)',
    optimalBuffer: '20 mM Tris-HCl pH 8.4, 150 mM NaCl, 2.5 mM CaCl₂',
    edtaCompatible: false, // requires Ca2+, inhibited by EDTA
    literature: 'Waugh DS (2011); Jenny RJ et al.',
    color: '#ea580c',
    findSites: (seq: string): CleavageSite[] => {
      const sites: CleavageSite[] = [];
      const regex = /LVPR(?=GS)/g;
      for (const m of seq.matchAll(regex)) {
        const start = m.index!;
        const cutIdx = start + 4;
        sites.push({
          proteaseId: 'thrombin',
          proteaseName: 'Thrombin',
          siteIndex: cutIdx,
          position1Based: cutIdx,
          motifSequence: 'LVPRGS',
          motifStart: start,
          motifEnd: start + 6,
          p1Residue: 'R',
          p1PrimeResidue: 'G',
          cleavageDescription: `Cleaves after R${cutIdx} (P1) before G${cutIdx + 1} (P1'). Serine protease.`,
          specificityRating: 'Optimal',
          scarOnTarget: 'GS (Gly-Ser at N-terminus)',
        });
      }
      return sites;
    },
  },
  factor_xa: {
    id: 'factor_xa',
    name: 'Factor Xa',
    shortName: 'Factor Xa',
    recognitionMotif: 'IEGR↓',
    cleavageRule: 'Cleaves after Arg (R)',
    optimalTemp: '20–25°C (6–16 h)',
    optimalBuffer: '20 mM Tris-HCl pH 8.0, 100 mM NaCl, 2 mM CaCl₂',
    edtaCompatible: false, // requires Ca2+
    literature: 'Waugh DS (2011); Nagai K & Thøgersen HC (1984)',
    color: '#ca8a04',
    findSites: (seq: string): CleavageSite[] => {
      const sites: CleavageSite[] = [];
      // Canonical IEGR (also tolerates IDGR; does not cleave before Pro)
      const regex = /I[ED]GR(?=[^P]|$)/g;
      for (const m of seq.matchAll(regex)) {
        const start = m.index!;
        const cutIdx = start + 4;
        const p1Prime = seq[cutIdx] ?? '';
        sites.push({
          proteaseId: 'factor_xa',
          proteaseName: 'Factor Xa',
          siteIndex: cutIdx,
          position1Based: cutIdx,
          motifSequence: m[0],
          motifStart: start,
          motifEnd: start + 4,
          p1Residue: 'R',
          p1PrimeResidue: p1Prime,
          cleavageDescription: `Cleaves after R${cutIdx} (P1). Leaves native N-terminus if directly fused.`,
          specificityRating: 'Optimal',
          scarOnTarget: 'None (authentic native N-terminus)',
        });
      }
      return sites;
    },
  },
  enterokinase: {
    id: 'enterokinase',
    name: 'Enterokinase (Enteropeptidase / EK)',
    shortName: 'Enterokinase',
    recognitionMotif: 'DDDDK↓',
    cleavageRule: 'Cleaves after Lys (K)',
    optimalTemp: '20–25°C (16 h)',
    optimalBuffer: '20 mM Tris-HCl pH 8.0, 50 mM NaCl, 2 mM CaCl₂',
    edtaCompatible: false, // requires Ca2+
    literature: 'Waugh DS (2011); Hosfield T & Lu Q (1999)',
    color: '#4f46e5',
    findSites: (seq: string): CleavageSite[] => {
      const sites: CleavageSite[] = [];
      const regex = /DDDDK/g;
      for (const m of seq.matchAll(regex)) {
        const start = m.index!;
        const cutIdx = start + 5;
        const p1Prime = seq[cutIdx] ?? '';
        sites.push({
          proteaseId: 'enterokinase',
          proteaseName: 'Enterokinase',
          siteIndex: cutIdx,
          position1Based: cutIdx,
          motifSequence: 'DDDDK',
          motifStart: start,
          motifEnd: start + 5,
          p1Residue: 'K',
          p1PrimeResidue: p1Prime,
          cleavageDescription: `Cleaves after K${cutIdx} (P1). Leaves native N-terminus if directly fused (present in FLAG tag).`,
          specificityRating: 'Optimal',
          scarOnTarget: 'None (authentic native N-terminus)',
        });
      }
      return sites;
    },
  },
  ulp1: {
    id: 'ulp1',
    name: 'SUMO Protease (Ulp1)',
    shortName: 'Ulp1 (SUMO)',
    recognitionMotif: 'SUMO-fold C-term GG↓',
    cleavageRule: 'Recognizes SUMO tertiary fold; cleaves after C-terminal Gly-Gly (GG)',
    optimalTemp: '30°C (1–2 h) or 4°C (overnight)',
    optimalBuffer: '50 mM Tris-HCl pH 8.0, 150 mM NaCl, 1 mM DTT (active in 0.5–2% Triton X-100)',
    edtaCompatible: true,
    literature: 'Waugh DS (2011); Malakhov MP et al. (2004); Mossessova E & Lima CD (2000)',
    color: '#9333ea',
    findSites: (seq: string): CleavageSite[] => {
      const sites: CleavageSite[] = [];

      // 1. Detect if SUMO domain is present and cuts after its C-term GG
      const sumoDef = TAG_DATABASE.sumo!;
      const fullIdx = seq.indexOf(sumoDef.sequence);
      if (fullIdx !== -1) {
        const cutIdx = fullIdx + sumoDef.sequence.length;
        const p1Prime = seq[cutIdx] ?? '';
        sites.push({
          proteaseId: 'ulp1',
          proteaseName: 'SUMO Protease (Ulp1)',
          siteIndex: cutIdx,
          position1Based: cutIdx,
          motifSequence: sumoDef.sequence.slice(-8), // AHREQIGG
          motifStart: cutIdx - 8,
          motifEnd: cutIdx,
          p1Residue: 'G',
          p1PrimeResidue: p1Prime,
          cleavageDescription: `Cleaves after C-terminal G${cutIdx} of the full SUMO/Smt3 domain. Zero scar on target.`,
          specificityRating: 'Optimal',
          scarOnTarget: 'None (100% authentic native N-terminus)',
        });
        return sites;
      }

      // 2. Detect canonical SUMO C-terminal junction signatures:
      // yeast Smt3: AHREQIGG↓, REQIGG↓, EQIGG↓, QIGG↓
      // mammalian SUMO1/2/3: QQQTGG↓, QQTGG↓
      const sumoJunctionRegex = /(?:AHREQIGG|REQIGG|EQIGG|QQQTGG|QQTGG)(?=[^P]|$)/g;
      for (const m of seq.matchAll(sumoJunctionRegex)) {
        const start = m.index!;
        const cutIdx = start + m[0].length;
        const p1Prime = seq[cutIdx] ?? '';
        sites.push({
          proteaseId: 'ulp1',
          proteaseName: 'SUMO Protease (Ulp1)',
          siteIndex: cutIdx,
          position1Based: cutIdx,
          motifSequence: m[0],
          motifStart: start,
          motifEnd: cutIdx,
          p1Residue: 'G',
          p1PrimeResidue: p1Prime,
          cleavageDescription: `Cleaves after C-terminal Gly-Gly (G${cutIdx}) of the SUMO motif. Zero scar on target.`,
          specificityRating: 'Optimal',
          scarOnTarget: 'None (100% authentic native N-terminus)',
        });
      }

      return sites;
    },
  },
};

/** Finds all cleavage sites in a sequence for a selected protease or all proteases. */
export function findCleavageSites(seq: string, proteaseId?: string, relaxed = false): CleavageSite[] {
  const { seq: cleanSeq } = sanitize(seq);
  if (!cleanSeq) return [];

  if (proteaseId && proteaseId !== 'all') {
    const protease = (PROTEASE_DATABASE as Record<string, ProteaseDefinition | undefined>)[proteaseId];
    if (!protease) return [];
    return protease.findSites(cleanSeq, relaxed);
  }

  // Scan all proteases
  const allSites: CleavageSite[] = [];
  for (const p of Object.values(PROTEASE_DATABASE)) {
    allSites.push(...p.findSites(cleanSeq, relaxed));
  }
  return allSites.sort((a, b) => a.siteIndex - b.siteIndex);
}

// ---------------------------------------------------------------------------
// 3. Fragment Properties & Cleavage Simulation
// ---------------------------------------------------------------------------

export type FragmentRole = 'intact' | 'tag' | 'target' | 'internal' | 'unknown';

export interface FragmentProperties {
  name: string;
  seq: string;
  length: number;
  start1Based: number;
  end1Based: number;
  mwDa: number;
  mwKda: number;
  pI: number;
  extinction280: number;       // native ε280 with cystines (M⁻¹cm⁻¹)
  extinctionReduced: number;   // reduced ε280 (M⁻¹cm⁻¹)
  abs01Percent: number;        // A280 for 1 mg/mL (1 g/L) solution = ε280 / MW
  detectedTags: DetectedTag[];
  role: FragmentRole;
  isAffinityDepleted: boolean;
  depletionResin?: string;
  depletionElution?: string;
  scarResidues?: string;
}

/** Computes biochemical properties for any protein or fragment sequence. */
export function calculateFragmentProperties(
  seq: string,
  name: string,
  start1Based = 1,
  role: FragmentRole = 'unknown',
  scarResidues?: string
): FragmentProperties {
  const { seq: clean } = sanitize(seq);
  const counts = countAA(clean);
  const mwDa = clean.length > 0 ? molecularWeight(counts) : 0;
  const mwKda = mwDa / 1000;
  const pI = clean.length > 0 ? isoelectricPoint(counts, 'bjellqvist', clean) : 7.0;
  const ext = extinctionCoefficients(counts, mwDa, 'native');
  const extRed = extinctionCoefficients(counts, mwDa, 'denatured');
  const tags = detectTags(clean);

  const hasTag = tags.length > 0;
  const primaryTag = tags[0]?.tag;

  return {
    name,
    seq: clean,
    length: clean.length,
    start1Based,
    end1Based: start1Based + clean.length - 1,
    mwDa,
    mwKda,
    pI,
    extinction280: ext.cystines,
    extinctionReduced: extRed.reduced,
    abs01Percent: ext.absCys,
    detectedTags: tags,
    role,
    isAffinityDepleted: hasTag,
    depletionResin: primaryTag?.resin,
    depletionElution: primaryTag?.elution,
    scarResidues,
  };
}

export interface SubtractiveDepletionInfo {
  affinityResin: string;
  elutionCondition: string;
  targetFragment: FragmentProperties;
  depletedFragments: FragmentProperties[];
  proteaseRemovalNote: string;
  isSubtractiveFeasible: boolean;
  warnings: string[];
}

export interface CleavageSimulationResult {
  sequence: string;
  protease: ProteaseDefinition;
  cleavageSite: CleavageSite | null;
  allCleavageSites: CleavageSite[];
  intact: FragmentProperties;
  nTerminalFragment: FragmentProperties | null;
  cTerminalFragment: FragmentProperties | null;
  tagFragment: FragmentProperties | null;
  targetFragment: FragmentProperties | null;
  allFragments: FragmentProperties[];
  subtractiveDepletion: SubtractiveDepletionInfo | null;
  warnings: string[];
}

/**
 * Simulates protease cleavage on a protein sequence and evaluates subtractive affinity depletion.
 * References: Waugh DS (2011), Kapust RB et al. (2002).
 */
export function simulateCleavage(
  rawSeq: string,
  proteaseId: string,
  siteIndex?: number,
  relaxedTev = false
): CleavageSimulationResult {
  const { seq } = sanitize(rawSeq);
  const protease = (PROTEASE_DATABASE as Record<string, ProteaseDefinition | undefined>)[proteaseId] ?? PROTEASE_DATABASE.tev;
  const allSites = protease.findSites(seq, relaxedTev);

  const intact = calculateFragmentProperties(seq, 'Intact Fusion Protein', 1, 'intact');

  if (allSites.length === 0) {
    return {
      sequence: seq,
      protease,
      cleavageSite: null,
      allCleavageSites: [],
      intact,
      nTerminalFragment: null,
      cTerminalFragment: null,
      tagFragment: null,
      targetFragment: null,
      allFragments: [intact],
      subtractiveDepletion: null,
      warnings: [`No ${protease.name} cleavage site detected in the sequence. Expected motif: ${protease.recognitionMotif}.`],
    };
  }

  // Pick primary cleavage site (either requested siteIndex or first site)
  let site: CleavageSite;
  if (siteIndex !== undefined) {
    site = allSites.find(s => s.siteIndex === siteIndex) ?? allSites[0]!;
  } else {
    site = allSites[0]!;
  }

  const cut = site.siteIndex;
  const nSeq = seq.slice(0, cut);
  const cSeq = seq.slice(cut);

  // Determine tag vs target orientation
  const nTags = detectTags(nSeq);
  const cTags = detectTags(cSeq);

  let nRole: FragmentRole = 'unknown';
  let cRole: FragmentRole = 'unknown';

  if (nTags.length > 0 && cTags.length === 0) {
    // Standard N-terminal fusion: Tag is N-term, Target is C-term
    nRole = 'tag';
    cRole = 'target';
  } else if (cTags.length > 0 && nTags.length === 0) {
    // C-terminal fusion: Target is N-term, Tag is C-term
    nRole = 'target';
    cRole = 'tag';
  } else if (nTags.length > 0 && cTags.length > 0) {
    // Both fragments have tags (e.g. dual tagged)
    // Upstream tag fragment is tag, downstream is target with secondary tag
    nRole = 'tag';
    cRole = 'target';
  } else {
    // Neither has a registered tag: assume larger is target
    if (nSeq.length >= cSeq.length) {
      nRole = 'target';
      cRole = 'tag';
    } else {
      nRole = 'tag';
      cRole = 'target';
    }
  }

  const scar = site.scarOnTarget;
  const nFrag = calculateFragmentProperties(
    nSeq,
    nRole === 'tag' ? 'Cut Tag (N-terminal)' : 'Cleaved Target (N-terminal)',
    1,
    nRole,
    nRole === 'target' ? scar : undefined
  );

  const cFrag = calculateFragmentProperties(
    cSeq,
    cRole === 'target' ? 'Cleaved Target (C-terminal)' : 'Cut Tag (C-terminal)',
    cut + 1,
    cRole,
    cRole === 'target' ? scar : undefined
  );

  const tagFrag = nRole === 'tag' ? nFrag : cFrag;
  const targetFrag = nRole === 'target' ? nFrag : cFrag;

  // Complete digestion fragments if multiple cleavage sites exist
  const sortedCuts = [0, ...new Set(allSites.map(s => s.siteIndex)), seq.length].sort((a, b) => a - b);
  const allFragments: FragmentProperties[] = [];
  for (let i = 0; i < sortedCuts.length - 1; i++) {
    const start = sortedCuts[i]!;
    const end = sortedCuts[i + 1]!;
    const subSeq = seq.slice(start, end);
    const subTags = detectTags(subSeq);
    const subRole: FragmentRole = subTags.length > 0 ? 'tag' : subSeq === targetFrag.seq ? 'target' : 'internal';
    allFragments.push(
      calculateFragmentProperties(
        subSeq,
        `Fragment ${i + 1} (${start + 1}–${end})`,
        start + 1,
        subRole,
        subRole === 'target' ? scar : undefined
      )
    );
  }

  // Subtractive Resin Depletion Analysis (Waugh 2011)
  const warnings: string[] = [];

  if (allSites.length > 1) {
    warnings.push(
      `Multiple (${allSites.length}) cleavage sites detected! Complete digestion will yield ${allFragments.length} fragments.`
    );
  }

  // Check if target protein itself contains unintended affinity tag features (e.g. natural His runs)
  const targetTags = detectTags(targetFrag.seq);
  if (targetTags.length > 0) {
    warnings.push(
      `Warning: Cleaved target protein contains internal ${targetTags.map(t => t.tag.shortName).join(', ')} motif(s). Subtractive depletion may accidentally deplete the target protein!`
    );
  }

  // Check for internal Histidine cluster in target that might bind Ni-NTA
  const hisCountInTarget = (targetFrag.seq.match(/H/g) || []).length;
  const hisPercent = targetFrag.length > 0 ? (hisCountInTarget / targetFrag.length) * 100 : 0;
  if (tagFrag.detectedTags.some(t => t.tag.id.startsWith('his')) && hisPercent > 8 && targetFrag.length > 50) {
    warnings.push(
      `Notice: Target protein has a high histidine density (${hisPercent.toFixed(1)}%). Check flow-through carefully as it may bind weakly to IMAC resin.`
    );
  }

  const primaryResin = tagFrag.depletionResin ?? 'Affinity Resin';
  const primaryElution = tagFrag.depletionElution ?? 'Standard Elution Buffer';
  const isSubtractiveFeasible = tagFrag.isAffinityDepleted && !targetFrag.isAffinityDepleted;

  const proteaseRemovalNote = protease.edtaCompatible
    ? `Recombinant ${protease.shortName} is usually engineered with an affinity tag (e.g. 6xHis). Both the cut tag and the tagged protease will bind to the ${primaryResin}, while the cleaved target flows through.`
    : `Note: ${protease.shortName} requires Ca²⁺ and is not active in EDTA. Ensure protease removal via size exclusion or secondary affinity depletion.`;

  const subtractiveDepletion: SubtractiveDepletionInfo = {
    affinityResin: primaryResin,
    elutionCondition: primaryElution,
    targetFragment: targetFrag,
    depletedFragments: [tagFrag],
    proteaseRemovalNote,
    isSubtractiveFeasible,
    warnings: [...warnings],
  };

  return {
    sequence: seq,
    protease,
    cleavageSite: site,
    allCleavageSites: allSites,
    intact,
    nTerminalFragment: nFrag,
    cTerminalFragment: cFrag,
    tagFragment: tagFrag,
    targetFragment: targetFrag,
    allFragments,
    subtractiveDepletion,
    warnings,
  };
}

// ---------------------------------------------------------------------------
// 4. Virtual SDS-PAGE Mobility Preview Calculations
// ---------------------------------------------------------------------------

export interface VirtualGelBand {
  id: string;
  name: string;
  mwKda: number;
  yNorm: number; // 0.0 (top of resolving gel) to 1.0 (bottom / dye front)
  intensity: number; // 0.15 to 1.0 (relative Coomassie staining intensity)
  color?: string;
  isLadder?: boolean;
}

export interface VirtualGelLane {
  id: string;
  title: string;
  subtitle: string;
  bands: VirtualGelBand[];
  description: string;
}

/** Standard broad-range SDS-PAGE protein ladder molecular weights in kDa. */
export const STANDARD_LADDER_KDA: readonly number[] = Object.freeze([
  250, 150, 100, 75, 50, 37, 25, 20, 15, 10,
]);

/**
 * Calculates electrophoretic mobility (relative distance migrated Y) on an SDS-PAGE gel.
 * Semi-logarithmic relationship: distance migrated is inversely proportional to log10(MW).
 * Reference: Weber K & Osborn M (1969) J Biol Chem 244:4406-4412.
 *
 * @param mwDa Molecular weight in Daltons
 * @param topKda Upper molecular weight limit (kDa) default 250
 * @param bottomKda Lower molecular weight limit (kDa) default 10
 * @returns Normalized migration fraction from 0.06 (top) to 0.95 (bottom/dye front)
 */
export function calculateMobilityY(mwDa: number, topKda = 250, bottomKda = 10): number {
  const mwKda = mwDa / 1000;
  if (mwKda <= 0) return 0.95;

  const logTop = Math.log10(topKda);
  const logBot = Math.log10(bottomKda);
  const logMw = Math.log10(Math.max(1, mwKda));

  if (mwKda >= topKda) return 0.06;
  if (mwKda <= bottomKda) {
    // Peptides below resolving limit run close to or at dye front
    const subFraction = Math.max(0, mwKda) / bottomKda;
    return 0.88 + (1 - subFraction) * 0.08;
  }

  const fraction = (logTop - logMw) / (logTop - logBot);
  return 0.06 + fraction * 0.82;
}

/**
 * Prepares virtual SDS-PAGE lanes for visual comparison:
 * Lane 1: Protein Ladder
 * Lane 2: Intact Fusion Protein
 * Lane 3: Cleaved Reaction (Post-Cleavage Mix with Target + Tag + faint uncleaved)
 * Lane 4: Flow-Through (Purified Target Protein)
 * Lane 5: Resin-Bound Fraction (Cut Tag + Uncleaved)
 */
export function getVirtualGelLanes(result: CleavageSimulationResult): VirtualGelLane[] {
  const { intact, targetFragment, tagFragment } = result;

  // 1. Ladder Lane
  const ladderBands: VirtualGelBand[] = STANDARD_LADDER_KDA.map(kda => ({
    id: `ladder-${kda}`,
    name: `${kda} kDa`,
    mwKda: kda,
    yNorm: calculateMobilityY(kda * 1000),
    // 75 kDa and 25 kDa are standard reference bands with double intensity
    intensity: kda === 75 || kda === 25 ? 0.95 : 0.6,
    isLadder: true,
  }));

  // 2. Intact Fusion Lane
  const intactBands: VirtualGelBand[] = [
    {
      id: 'intact-fusion',
      name: `Intact (${intact.mwKda.toFixed(1)} kDa)`,
      mwKda: intact.mwKda,
      yNorm: calculateMobilityY(intact.mwDa),
      intensity: 0.9,
      color: '#38bdf8',
    },
  ];

  // 3. Cleaved Reaction Lane (Target + Tag + 5% residual uncleaved)
  const cleavedBands: VirtualGelBand[] = [];
  if (targetFragment) {
    cleavedBands.push({
      id: 'cleaved-target',
      name: `Target (${targetFragment.mwKda.toFixed(1)} kDa)`,
      mwKda: targetFragment.mwKda,
      yNorm: calculateMobilityY(targetFragment.mwDa),
      intensity: 0.85,
      color: '#34d399', // Emerald
    });
  }
  if (tagFragment) {
    cleavedBands.push({
      id: 'cut-tag',
      name: `Tag (${tagFragment.mwKda.toFixed(1)} kDa)`,
      mwKda: tagFragment.mwKda,
      yNorm: calculateMobilityY(tagFragment.mwDa),
      intensity: Math.max(0.3, Math.min(0.8, tagFragment.mwKda / Math.max(1, intact.mwKda))),
      color: '#f472b6', // Pink
    });
  }
  // Residual uncleaved (e.g. 5% incomplete digestion typical in laboratory)
  cleavedBands.push({
    id: 'cleaved-residual',
    name: `Uncleaved (${intact.mwKda.toFixed(1)} kDa)`,
    mwKda: intact.mwKda,
    yNorm: calculateMobilityY(intact.mwDa),
    intensity: 0.15,
    color: '#94a3b8',
  });

  // 4. Flow-Through Lane (Subtractive Depletion)
  const flowThroughBands: VirtualGelBand[] = [];
  if (targetFragment) {
    flowThroughBands.push({
      id: 'flowthrough-target',
      name: `Pure Target (${targetFragment.mwKda.toFixed(1)} kDa)`,
      mwKda: targetFragment.mwKda,
      yNorm: calculateMobilityY(targetFragment.mwDa),
      intensity: 0.9,
      color: '#10b981',
    });
  }

  // 5. Bound Fraction Lane (Cut Tag + Uncleaved)
  const boundBands: VirtualGelBand[] = [];
  if (tagFragment) {
    boundBands.push({
      id: 'bound-tag',
      name: `Cut Tag (${tagFragment.mwKda.toFixed(1)} kDa)`,
      mwKda: tagFragment.mwKda,
      yNorm: calculateMobilityY(tagFragment.mwDa),
      intensity: 0.8,
      color: '#ec4899',
    });
  }
  boundBands.push({
    id: 'bound-residual',
    name: `Uncleaved (${intact.mwKda.toFixed(1)} kDa)`,
    mwKda: intact.mwKda,
    yNorm: calculateMobilityY(intact.mwDa),
    intensity: 0.25,
    color: '#94a3b8',
  });

  return [
    {
      id: 'ladder',
      title: 'Ladder',
      subtitle: 'Marker',
      bands: ladderBands,
      description: 'Standard broad-range SDS-PAGE marker (10–250 kDa).',
    },
    {
      id: 'intact',
      title: 'Intact',
      subtitle: `${intact.mwKda.toFixed(1)} kDa`,
      bands: intactBands,
      description: 'Purified intact fusion protein before protease incubation.',
    },
    {
      id: 'cleaved',
      title: 'Cleaved',
      subtitle: 'Post-Digest',
      bands: cleavedBands,
      description: 'Cleavage reaction mixture containing target, cut tag, and residual intact protein.',
    },
    {
      id: 'flowthrough',
      title: 'Flow-Thru',
      subtitle: 'Depleted',
      bands: flowThroughBands,
      description: 'Subtractive affinity depletion flow-through (pure target protein).',
    },
    {
      id: 'bound',
      title: 'Resin Bound',
      subtitle: 'Eluate',
      bands: boundBands,
      description: 'Fraction retained on affinity resin (cut tag and uncleaved fusion).',
    },
  ];
}

// ---------------------------------------------------------------------------
// 5. Construct Builder & Presets
// ---------------------------------------------------------------------------

export interface ConstructPreset {
  id: string;
  name: string;
  proteaseId: string;
  tagId: string;
  description: string;
  sequence: string;
}

/** Classic published benchmark constructs. */
export const CONSTRUCT_PRESETS: ConstructPreset[] = [
  {
    id: 'pet_his6_tev_gfp',
    name: 'His6–TEV–GFP (pET Expression)',
    proteaseId: 'tev',
    tagId: 'his6',
    description: 'Standard 6xHis tag with ENLYFQ↓G TEV cleavage site fusing Enhanced GFP (27 kDa).',
    sequence:
      'MHHHHHHSSGRENLYFQGMVSKGEELFTGVVPILVELDGDVNGHKFSVSGEGEGDATYGKLTLKFICTTGKLPVPWPTLVTTLTYGVQCFSRYPDHMKQHDFFKSAMPEGYVQERTIFFKDDGNYKTRAEVKFEGDTLVNRIELKGIDFKEDGNILGHKLEYNYNSHNVYIMADKQKNGIKVNFKIRHNIEDGSVQLADHYQQNTPIGDGPVLLPDNHYLSTQSALSKDPNEKRDHMVLLEFVTAAGITLGMDELYK',
  },
  {
    id: 'pmal_mbp_tev_lysozyme',
    name: 'MBP–TEV–Lysozyme (Solubility Benchmark)',
    proteaseId: 'tev',
    tagId: 'mbp',
    description: '42.5 kDa Maltose-Binding Protein with TEV site fused to Hen Egg Lysozyme (Waugh 2011).',
    sequence:
      TAG_DATABASE.mbp!.sequence +
      'ENLYFQGKVFGRCELAAAMKRHGLDNYRGYSLGNWVCAAKFESNFNTQATNRNTDGSTDYGILQINSRWWCNDGRTPGSRNLCNIPCSALLSSDITASVNCAKKIVSDGNGMNAWVAWRNRCKGTDVQAWIRGCRL',
  },
  {
    id: 'pgex_gst_hrv3c_target',
    name: 'GST–HRV 3C–GFP (pGEX-6P-1)',
    proteaseId: 'hrv3c',
    tagId: 'gst',
    description: '26 kDa GST fusion with PreScission/HRV 3C protease cleavage site (LEVLFQ↓GP).',
    sequence:
      TAG_DATABASE.gst!.sequence +
      'LEVLFQGPMVSKGEELFTGVVPILVELDGDVNGHKFSVSGEGEGDATYGKLTLKFICTTGKLPVPWPTLVTTLTYGVQCFSRYPDHMKQHDFFKSAMPEGYVQERTIFFKDDGNYKTRAEVKFEGDTLVNRIELKGIDFKEDGNILGHKLEYNYNSHNVYIMADKQKNGIKVNFKIRHNIEDGSVQLADHYQQNTPIGDGPVLLPDNHYLSTQSALSKDPNEKRDHMVLLEFVTAAGITLGMDELYK',
  },
  {
    id: 'sumo_ulp1_target',
    name: 'His6–SUMO–GFP (Native N-terminus)',
    proteaseId: 'ulp1',
    tagId: 'sumo',
    description: 'Yeast Smt3/SUMO fold cleaved cleanly after C-terminal GG by Ulp1 leaving zero scar residues.',
    sequence:
      'MHHHHHHSSG' +
      TAG_DATABASE.sumo!.sequence +
      'MVSKGEELFTGVVPILVELDGDVNGHKFSVSGEGEGDATYGKLTLKFICTTGKLPVPWPTLVTTLTYGVQCFSRYPDHMKQHDFFKSAMPEGYVQERTIFFKDDGNYKTRAEVKFEGDTLVNRIELKGIDFKEDGNILGHKLEYNYNSHNVYIMADKQKNGIKVNFKIRHNIEDGSVQLADHYQQNTPIGDGPVLLPDNHYLSTQSALSKDPNEKRDHMVLLEFVTAAGITLGMDELYK',
  },
  {
    id: 'pet28_thrombin_target',
    name: 'His6–Thrombin–Lysozyme (pET-28a)',
    proteaseId: 'thrombin',
    tagId: 'his6',
    description: 'pET-28a leader containing 6xHis and Thrombin cleavage site (LVPR↓GS).',
    sequence:
      'MGSSHHHHHHSSGLVPRGSKVFGRCELAAAMKRHGLDNYRGYSLGNWVCAAKFESNFNTQATNRNTDGSTDYGILQINSRWWCNDGRTPGSRNLCNIPCSALLSSDITASVNCAKKIVSDGNGMNAWVAWRNRCKGTDVQAWIRGCRL',
  },
  {
    id: 'flag_enterokinase_target',
    name: 'FLAG–Enterokinase–Lysozyme',
    proteaseId: 'enterokinase',
    tagId: 'flag',
    description: 'N-terminal FLAG tag (DYKDDDDK↓) with intrinsic Enterokinase cleavage site.',
    sequence:
      'MDYKDDDDKKVFGRCELAAAMKRHGLDNYRGYSLGNWVCAAKFESNFNTQATNRNTDGSTDYGILQINSRWWCNDGRTPGSRNLCNIPCSALLSSDITASVNCAKKIVSDGNGMNAWVAWRNRCKGTDVQAWIRGCRL',
  },
  {
    id: 'factor_xa_lysozyme',
    name: 'MBP–Factor Xa–Lysozyme',
    proteaseId: 'factor_xa',
    tagId: 'factor_xa',
    description: 'MBP fusion with Factor Xa cleavage site (IEGR↓) yielding authentic native N-terminus.',
    sequence:
      TAG_DATABASE.mbp!.sequence +
      'IEGRKVFGRCELAAAMKRHGLDNYRGYSLGNWVCAAKFESNFNTQATNRNTDGSTDYGILQINSRWWCNDGRTPGSRNLCNIPCSALLSSDITASVNCAKKIVSDGNGMNAWVAWRNRCKGTDVQAWIRGCRL',
  },
];

/**
 * Builds a custom fusion construct sequence from components.
 */
export function buildFusionConstruct(
  tagId: string,
  proteaseId: string,
  targetSeq: string,
  orientation: 'N-term' | 'C-term' = 'N-term',
  linker = 'SSG'
): string {
  const { seq: cleanTarget } = sanitize(targetSeq);
  const tag = (TAG_DATABASE as Record<string, AffinityTagDefinition | undefined>)[tagId];
  const tagSeq = tag ? tag.sequence : '';

  let proteaseMotif = '';
  switch (proteaseId) {
    case 'tev':
      proteaseMotif = 'ENLYFQG';
      break;
    case 'hrv3c':
      proteaseMotif = 'LEVLFQGP';
      break;
    case 'thrombin':
      proteaseMotif = 'LVPRGS';
      break;
    case 'factor_xa':
      proteaseMotif = 'IEGR';
      break;
    case 'enterokinase':
      proteaseMotif = tagId === 'flag' ? '' : 'DDDDK';
      break;
    case 'ulp1':
      proteaseMotif = ''; // SUMO ends with GG, no extra motif needed
      break;
    default:
      proteaseMotif = 'ENLYFQG';
  }

  if (orientation === 'N-term') {
    const leader = [tagSeq, linker, proteaseMotif].filter(Boolean).join('');
    return (leader.startsWith('M') ? leader : `M${leader}`) + cleanTarget;
  } else {
    // C-terminal tag
    const trailer = [proteaseMotif, linker, tagSeq].filter(Boolean).join('');
    return cleanTarget + trailer;
  }
}
