/**
 * Core plasmid analysis, ORF detection, and restriction site mapping.
 */

export interface PlasmidFeature {
  id: string;
  name: string;
  type: 'cds' | 'promoter' | 'origin' | 'resistance' | 'tag' | 'terminator' | 'regulatory' | 'mcs' | 'misc';
  start: number; // 1-based start
  end: number;   // 1-based end
  strand: 1 | -1; // 1 = clockwise / forward, -1 = counter-clockwise / reverse
  color?: string;
  notes?: string;
  translation?: string;
}

export interface RestrictionSite {
  id: string;
  enzyme: string;
  recognitionSeq: string;
  cutPosition: number; // 1-based position in plasmid
  cutCount: number;    // total times this enzyme cuts this plasmid
  overhang?: '5prime' | '3prime' | 'blunt';
}

export interface ORF {
  id: string;
  frame: number; // +1, +2, +3, -1, -2, -3
  start: number; // 1-based
  end: number;   // 1-based
  strand: 1 | -1;
  lengthBp: number;
  lengthAa: number;
  protein: string;
}

export interface Plasmid {
  id: string;
  name: string;
  length: number;
  seq: string;
  isCircular: boolean;
  features: PlasmidFeature[];
  description?: string;
}

// Common molecular biology restriction enzymes
export const RESTRICTION_ENZYMES: Array<{ enzyme: string; pattern: string; cutOffset: number; overhang: '5prime' | '3prime' | 'blunt' }> = [
  { enzyme: 'EcoRI',   pattern: 'GAATTC', cutOffset: 1, overhang: '5prime' },
  { enzyme: 'BamHI',   pattern: 'GGATCC', cutOffset: 1, overhang: '5prime' },
  { enzyme: 'HindIII', pattern: 'AAGCTT', cutOffset: 1, overhang: '5prime' },
  { enzyme: 'NotI',    pattern: 'GCGGCCGC', cutOffset: 2, overhang: '5prime' },
  { enzyme: 'XhoI',    pattern: 'CTCGAG', cutOffset: 1, overhang: '5prime' },
  { enzyme: 'NdeI',    pattern: 'CATATG', cutOffset: 2, overhang: '5prime' },
  { enzyme: 'NcoI',    pattern: 'CCATGG', cutOffset: 1, overhang: '5prime' },
  { enzyme: 'SacI',    pattern: 'GAGCTC', cutOffset: 5, overhang: '3prime' },
  { enzyme: 'KpnI',    pattern: 'GGTACC', cutOffset: 5, overhang: '3prime' },
  { enzyme: 'PstI',    pattern: 'CTGCAG', cutOffset: 5, overhang: '3prime' },
  { enzyme: 'SalI',    pattern: 'GTCGAC', cutOffset: 1, overhang: '5prime' },
  { enzyme: 'SmaI',    pattern: 'CCCGGG', cutOffset: 3, overhang: 'blunt' },
  { enzyme: 'XbaI',    pattern: 'TCTAGA', cutOffset: 1, overhang: '5prime' },
  { enzyme: 'SpeI',    pattern: 'ACTAGT', cutOffset: 1, overhang: '5prime' },
  { enzyme: 'ClaI',    pattern: 'ATCGAT', cutOffset: 2, overhang: '5prime' },
  { enzyme: 'BglII',   pattern: 'AGATCT', cutOffset: 1, overhang: '5prime' },
  { enzyme: 'DpnI',    pattern: 'GATC',   cutOffset: 2, overhang: 'blunt' },
  { enzyme: 'EcoRV',   pattern: 'GATATC', cutOffset: 3, overhang: 'blunt' },
  { enzyme: 'AgeI',    pattern: 'ACCGGT', cutOffset: 1, overhang: '5prime' },
  { enzyme: 'BspEI',   pattern: 'TCCGGA', cutOffset: 1, overhang: '5prime' },
];

export const FEATURE_COLORS: Record<PlasmidFeature['type'], string> = {
  resistance: '#ef4444', // Red
  origin:     '#64748b', // Slate
  promoter:   '#8b5cf6', // Purple
  tag:        '#f59e0b', // Amber
  cds:        '#0ea5e9', // Sky blue
  terminator: '#f43f5e', // Rose
  regulatory: '#a855f7', // Violet
  mcs:        '#10b981', // Emerald
  misc:       '#06b6d4', // Cyan
};

/** Calculate GC content percentage (0 - 100) */
export function calculateGC(seq: string): number {
  if (!seq) return 0;
  const clean = seq.toUpperCase().replace(/[^ACGT]/g, '');
  if (!clean.length) return 0;
  const gcCount = (clean.match(/[GC]/g) || []).length;
  return (gcCount / clean.length) * 100;
}

/** Reverse complement a DNA string */
export function reverseComplement(dna: string): string {
  const complement: Record<string, string> = {
    A: 'T', T: 'A', G: 'C', C: 'G',
    a: 't', t: 'a', g: 'c', c: 'g',
    N: 'N', n: 'n',
  };
  return dna.split('').reverse().map(b => complement[b] || b).join('');
}

/** Standard genetic code for translation */
const CODON_TABLE: Record<string, string> = {
  TTT: 'F', TTC: 'F', TTA: 'L', TTG: 'L',
  TCT: 'S', TCC: 'S', TCA: 'S', TCG: 'S',
  TAT: 'Y', TAC: 'Y', TAA: '*', TAG: '*',
  TGT: 'C', TGC: 'C', TGA: '*', TGG: 'W',
  CTT: 'L', CTC: 'L', CTA: 'L', CTG: 'L',
  CCT: 'P', CCC: 'P', CCA: 'P', CCG: 'P',
  CAT: 'H', CAC: 'H', CAA: 'Q', CAG: 'Q',
  CGT: 'R', CGC: 'R', CGA: 'R', CGG: 'R',
  ATT: 'I', ATC: 'I', ATA: 'I', ATG: 'M',
  ACT: 'T', ACC: 'T', ACA: 'T', ACG: 'T',
  AAT: 'N', AAC: 'N', AAA: 'K', AAG: 'K',
  AGT: 'S', AGC: 'S', AGA: 'R', AGG: 'R',
  GTT: 'V', GTC: 'V', GTA: 'V', GTG: 'V',
  GCT: 'A', GCC: 'A', GCA: 'A', GCG: 'A',
  GAT: 'D', GAC: 'D', GAA: 'E', GAG: 'E',
  GGT: 'G', GGC: 'G', GGA: 'G', GGG: 'G',
};

/** Translate a DNA sequence to protein */
export function translateDNA(dna: string): string {
  const upper = dna.toUpperCase().replace(/[^ACGT]/g, 'N');
  let protein = '';
  for (let i = 0; i + 2 < upper.length; i += 3) {
    const codon = upper.slice(i, i + 3);
    protein += CODON_TABLE[codon] || 'X';
  }
  return protein;
}

/** Find all restriction enzyme cleavage sites in plasmid */
export function findRestrictionSites(dna: string, isCircular = true): RestrictionSite[] {
  const clean = dna.toUpperCase().replace(/[^ACGT]/g, '');
  const len = clean.length;
  if (!len) return [];

  // For circular plasmids, append start to end to detect sites spanning the origin (0/N boundary)
  const maxPatternLen = 10;
  const searchSeq = isCircular ? clean + clean.slice(0, maxPatternLen) : clean;

  const sitesByEnzyme = new Map<string, number[]>();

  for (const re of RESTRICTION_ENZYMES) {
    let idx = searchSeq.indexOf(re.pattern);
    while (idx !== -1) {
      const sitePos = ((idx + re.cutOffset - 1) % len) + 1;
      if (!sitesByEnzyme.has(re.enzyme)) sitesByEnzyme.set(re.enzyme, []);
      const list = sitesByEnzyme.get(re.enzyme)!;
      if (!list.includes(sitePos)) {
        list.push(sitePos);
      }
      idx = searchSeq.indexOf(re.pattern, idx + 1);
    }
  }

  const results: RestrictionSite[] = [];
  for (const [enzymeName, positions] of sitesByEnzyme.entries()) {
    const reInfo = RESTRICTION_ENZYMES.find(r => r.enzyme === enzymeName)!;
    positions.sort((a, b) => a - b);
    for (const pos of positions) {
      results.push({
        id: `${enzymeName}-${pos}`,
        enzyme: enzymeName,
        recognitionSeq: reInfo.pattern,
        cutPosition: pos,
        cutCount: positions.length,
        overhang: reInfo.overhang,
      });
    }
  }

  return results.sort((a, b) => a.cutPosition - b.cutPosition);
}

/** Detect Open Reading Frames (ORFs) across 6 reading frames */
export function findORFs(dna: string, minLengthAa = 30, isCircular = true): ORF[] {
  const clean = dna.toUpperCase().replace(/[^ACGT]/g, '');
  const len = clean.length;
  if (len < 90) return [];

  const orfs: ORF[] = [];
  const searchDna = isCircular ? clean + clean : clean;
  const searchLen = searchDna.length;

  // Forward frames (+1, +2, +3)
  for (let frame = 0; frame < 3; frame++) {
    let currentStart = -1;
    for (let i = frame; i + 2 < (isCircular ? len + len / 2 : len); i += 3) {
      const codon = searchDna.slice(i, i + 3);
      if (codon === 'ATG' && currentStart === -1) {
        currentStart = i;
      } else if ((codon === 'TAA' || codon === 'TAG' || codon === 'TGA') && currentStart !== -1) {
        const orfDna = searchDna.slice(currentStart, i + 3);
        const aaLen = orfDna.length / 3 - 1; // excluding stop
        if (aaLen >= minLengthAa) {
          const start1 = (currentStart % len) + 1;
          const end1 = ((i + 2) % len) + 1;
          orfs.push({
            id: `orf-+${frame + 1}-${start1}-${end1}`,
            frame: frame + 1,
            start: start1,
            end: end1,
            strand: 1,
            lengthBp: orfDna.length,
            lengthAa: aaLen,
            protein: translateDNA(orfDna),
          });
        }
        currentStart = -1;
      }
    }
  }

  // Reverse frames (-1, -2, -3)
  const revDna = reverseComplement(searchDna);
  for (let frame = 0; frame < 3; frame++) {
    let currentStart = -1;
    for (let i = frame; i + 2 < (isCircular ? len + len / 2 : len); i += 3) {
      const codon = revDna.slice(i, i + 3);
      if (codon === 'ATG' && currentStart === -1) {
        currentStart = i;
      } else if ((codon === 'TAA' || codon === 'TAG' || codon === 'TGA') && currentStart !== -1) {
        const orfDna = revDna.slice(currentStart, i + 3);
        const aaLen = orfDna.length / 3 - 1;
        if (aaLen >= minLengthAa) {
          // Convert back to original 5' coordinate
          const origEnd = (searchLen - currentStart) % len || len;
          const origStart = (searchLen - (i + 2)) % len || len;
          orfs.push({
            id: `orf--${frame + 1}-${origStart}-${origEnd}`,
            frame: -(frame + 1),
            start: Math.min(origStart, origEnd),
            end: Math.max(origStart, origEnd),
            strand: -1,
            lengthBp: orfDna.length,
            lengthAa: aaLen,
            protein: translateDNA(orfDna),
          });
        }
        currentStart = -1;
      }
    }
  }

  return orfs.sort((a, b) => b.lengthAa - a.lengthAa);
}

export interface KnownElementPattern {
  name: string;
  type: PlasmidFeature['type'];
  pattern: string;
  notes?: string;
}

export const KNOWN_PLASMID_ELEMENTS: KnownElementPattern[] = [
  // Tags
  { name: '6xHis Tag', type: 'tag', pattern: '(?:CAT|CAC){6}', notes: 'Polyhistidine affinity purification tag' },
  { name: 'FLAG Tag', type: 'tag', pattern: 'GATTACAAGGATGACGACGATAAG|GACTACAA[AG]GA[CT]GA[CT]GA[CT]GA[CT]AAA', notes: 'DYKDDDDK epitope tag' },
  { name: 'HA Tag', type: 'tag', pattern: 'TACCCATACGACGTCCCAGACTACGCT', notes: 'YPYDVPDYA hemagglutinin tag' },
  { name: 'Myc Tag', type: 'tag', pattern: 'GAGCAGAAGCTGATCTCCGAGGAGGACCTG|GAGCAGAA[AG]CT[AG]AT[CT]TC[CT]GAGGA[AG]GA[CT]CT[AG]', notes: 'EQKLISEEDL c-Myc epitope tag' },
  { name: 'Strep-tag II', type: 'tag', pattern: 'TGGAGC(?:CAC|CAT)CC(?:G|C|A|T)CAGTTCGA(?:G|A)AAA', notes: 'WSHPQFEK streptavidin-binding tag' },
  { name: 'V5 Tag', type: 'tag', pattern: 'GGTAAGCCTATCCCTAACCCTCTCCTCGGTCTCGATTCTACG', notes: 'GKPIPNPLLGLDST paramyxovirus tag' },
  { name: 'TEV Cleavage Site', type: 'tag', pattern: 'GAAAACCTGTATTTTCAG(?:GGC|AGT|TCC)', notes: 'ENLYFQ(G/S) TEV protease site' },
  { name: 'Thrombin Site', type: 'tag', pattern: 'CTGGTGCCGCGCGGCAGC', notes: 'LVPRGS Thrombin protease site' },
  { name: 'PreScission (3C) Site', type: 'tag', pattern: 'CTGGAAGTTCTGTTCCAGGGTCCG', notes: 'LEVLFQGP Human rhinovirus 3C site' },

  // Promoters & Operators
  { name: 'T7 Promoter', type: 'promoter', pattern: 'TAATACGACTCACTATAGGG', notes: 'Bacteriophage T7 RNA polymerase promoter' },
  { name: 'T7 Terminator', type: 'terminator', pattern: 'CTAGCATAACCCCTTGGGGCCTCTAAACGGGTCTTGAGGGGTTTTTTG', notes: 'T7 transcription terminator' },
  { name: 'T3 Promoter', type: 'promoter', pattern: 'AATTAACCCTCACTAAAGGG', notes: 'Bacteriophage T3 promoter' },
  { name: 'SP6 Promoter', type: 'promoter', pattern: 'ATTTAGGTGACACTATAGAA', notes: 'Bacteriophage SP6 promoter' },
  { name: 'lac Operator', type: 'regulatory', pattern: 'AATTGTGAGCGGATAACAATT', notes: 'Binding site for lac repressor' },
  { name: 'lac Promoter', type: 'promoter', pattern: 'TGGCGAAAGGGGGATGTG', notes: 'E. coli lac operon promoter' },
  { name: 'Ribosome Binding Site (RBS)', type: 'regulatory', pattern: 'AAGGAGATATACAT|AAGGAGG', notes: 'Shine-Dalgarno translation initiation site' },
  { name: 'Kozak Sequence', type: 'regulatory', pattern: 'GCCGCCACCATGG', notes: 'Eukaryotic translation initiation signal' },
  { name: 'AmpR Promoter', type: 'promoter', pattern: 'TTACCAATGCTTAATCAGTGAGGCA', notes: 'Beta-lactamase promoter' },

  // Resistance Markers
  { name: 'AmpR (bla)', type: 'resistance', pattern: 'ATGAGTATTCAACATTTTCGTGTCGCCCTTATTCCCTTTTTTGCGGCATTTTGCCTTCCTGTTTTTGCTCACCCA', notes: 'Beta-lactamase (Ampicillin resistance)' },
  { name: 'KanR / NeoR', type: 'resistance', pattern: 'ATGATTGAACAAGATGGATTGCACGCAGGTTCTCCGGCCGCTTGGGTGGAGAGGCTATTCGGCTATGACTGG', notes: 'Aminoglycoside 3-phosphotransferase' },
  { name: 'Chloramphenicol (CamR)', type: 'resistance', pattern: 'ATGAACTTTAATAAAATTGATTTAGACAATTGGAAGAGAAAAGAGATATTTAATCATTATTTGAACCAACAAACG', notes: 'Chloramphenicol acetyltransferase' },
  { name: 'Tetracycline (TetR)', type: 'resistance', pattern: 'ATGAATAGTTCGACAAAGATCGCATTGGTAATTACGTTACTCGATGCCATGGGGATTGGCCTTATCATGCCAGTC', notes: 'Tetracycline efflux pump' },

  // Fluorescent Proteins & Reporters
  { name: 'EGFP', type: 'cds', pattern: 'ATGGTGAGCAAGGGCGAGGAGCTGTTCACCGGGGTGGTGCCCATCCTGGTCGAGCTGGACGGCGACGTAAACGGC', notes: 'Enhanced Green Fluorescent Protein' },
  { name: 'mCherry', type: 'cds', pattern: 'ATGGTGAGCAAGGGCGAGGAGGATAACATGGCCATCATCAAGGAGTTCATGCGCTTCAAGGTGCACATGGAGGGC', notes: 'Red monomeric fluorescent protein' },
];

/** Auto-detect standard biological tags, promoters, terminators, and elements */
export function detectPlasmidElements(dna: string, isCircular = true): PlasmidFeature[] {
  const clean = dna.toUpperCase().replace(/[^ACGT]/g, '');
  const len = clean.length;
  if (!len) return [];

  const searchDna = isCircular ? clean + clean : clean;
  const detected: PlasmidFeature[] = [];

  for (const elem of KNOWN_PLASMID_ELEMENTS) {
    const regex = new RegExp(elem.pattern, 'gi');
    let match: RegExpExecArray | null;

    // Search forward strand
    while ((match = regex.exec(searchDna)) !== null) {
      const matchIdx = match.index;
      if (isCircular && matchIdx >= len) break;
      const start = (matchIdx % len) + 1;
      const matchLen = match[0].length;
      const end = ((matchIdx + matchLen - 1) % len) + 1;

      detected.push({
        id: `auto-${elem.type}-${start}-${end}`,
        name: elem.name,
        type: elem.type,
        start,
        end,
        strand: 1,
        color: FEATURE_COLORS[elem.type] || '#6366f1',
        notes: elem.notes,
      });

      if (!regex.global) break;
    }

    // Search reverse strand
    const revSearchDna = reverseComplement(searchDna);
    while ((match = regex.exec(revSearchDna)) !== null) {
      const matchIdx = match.index;
      if (isCircular && matchIdx >= len) break;
      const origEnd = (len * (isCircular ? 2 : 1) - matchIdx) % len || len;
      const origStart = (len * (isCircular ? 2 : 1) - (matchIdx + match[0].length)) % len || len;

      detected.push({
        id: `auto-${elem.type}-rev-${origStart}-${origEnd}`,
        name: elem.name,
        type: elem.type,
        start: Math.min(origStart, origEnd),
        end: Math.max(origStart, origEnd),
        strand: -1,
        color: FEATURE_COLORS[elem.type] || '#6366f1',
        notes: `${elem.notes} (reverse strand)`,
      });

      if (!regex.global) break;
    }
  }

  // Deduplicate overlapping features with same name
  const filtered: PlasmidFeature[] = [];
  for (const d of detected) {
    const exists = filtered.some(e => e.name === d.name && Math.abs(e.start - d.start) < 5);
    if (!exists) filtered.push(d);
  }

  return filtered;
}

// Built-in verified standard plasmid presets
export const PRESET_PLASMIDS: Plasmid[] = [
  {
    id: 'puc19',
    name: 'pUC19',
    length: 2686,
    isCircular: true,
    description: 'High-copy-number E. coli cloning vector with blue/white selection (lacZα) and MCS.',
    features: [
      { id: 'f1', name: 'AmpR (bla)', type: 'resistance', start: 1629, end: 2489, strand: -1, color: FEATURE_COLORS.resistance, notes: 'Beta-lactamase (Ampicillin resistance)' },
      { id: 'f2', name: 'AmpR promoter', type: 'promoter', start: 2490, end: 2594, strand: -1, color: FEATURE_COLORS.promoter },
      { id: 'f3', name: 'pUC origin', type: 'origin', start: 867, end: 1455, strand: -1, color: FEATURE_COLORS.origin, notes: 'High copy number pMB1 origin (500–700 copies/cell)' },
      { id: 'f4', name: 'lacZ alpha', type: 'cds', start: 146, end: 469, strand: 1, color: FEATURE_COLORS.cds, notes: 'Beta-galactosidase alpha peptide for blue/white screening' },
      { id: 'f5', name: 'lac promoter', type: 'promoter', start: 81, end: 111, strand: 1, color: FEATURE_COLORS.promoter },
      { id: 'f6', name: 'lac operator', type: 'regulatory', start: 112, end: 132, strand: 1, color: FEATURE_COLORS.regulatory },
      { id: 'f7', name: 'CAP binding site', type: 'regulatory', start: 43, end: 80, strand: 1, color: FEATURE_COLORS.regulatory },
      { id: 'f8', name: 'MCS (Multiple Cloning Site)', type: 'mcs', start: 396, end: 452, strand: 1, color: FEATURE_COLORS.mcs, notes: 'EcoRI, SacI, KpnI, SmaI, BamHI, XbaI, SalI, PstI, SphI, HindIII' },
    ],
    // Canonical pUC19 sequence snippet (simulated base string with exact markers)
    seq: 'TCGCGCGTTTCGGTGATGACGGTGAAAACCTCTGACACATGCAGCTCCCGGAGACGGTCACAGCTTGTCTGTAAGCGGATGCCGGGAGCAGACAAGCCCGTCAGGGCGCGTCAGCGGGTGTTGGCGGGTGTCGGGGCTGGCTTAACTATGCGGCATCAGAGCAGATTGTACTGAGAGTGCACCATATGCGGTGTGAAATACCGCACAGATGCGTAAGGAGAAAATACCGCATCAGGCGCCATTCGCCATTCAGGCTGCGCAACTGTTGGGAAGGGCGATCGGTGCGGGCCTCTTCGCTATTACGCCAGCTGGCGAAAGGGGGATGTGCTGCAAGGCGATTAAGTTGGGTAACGCCAGGGTTTTCCCAGTCACGACGTTGTAAAACGACGGCCAGTGAATTCGAGCTCGGTACCCGGGGATCCTCTAGAGTCGACCTGCAGGCATGCAAGCTTGGCGTAATCATGGTCATAGCTGTTTCCTGTGTGAAATTGTTATCCGCTCACAATTCCACACAACATACGAGCCGGAAGCATAAAGTGTAAAGCCTGGGGTGCCTAATGAGTGAGCTAACTCACATTAATTGCGTTGCGCTCACTGCCCGCTTTCCAGTCGGGAAACCTGTCGTGCCAGCTGCATTAATGAATCGGCCAACGCGCGGGGAGAGGCGGTTTGCGTATTGGGCGCTCTTCCGCTTCCTCGCTCACTGACTCGCTGCGCTCGGTCGTTCGGCTGCGGCGAGCGGTATCAGCTCACTCAAAGGCGGTAATACGGTTATCCACAGAATCAGGGGATAACGCAGGAAAGAACATGTGAGCAAAAGGCCAGCAAAAGGCCAGGAACCGTAAAAAGGCCGCGTTGCTGGCGTTTTTCCATAGGCTCCGCCCCCCTGACGAGCATCACAAAAATCGACGCTCAAGTCAGAGGTGGCGAAACCCGACAGGACTATAAAGATACCAGGCGTTTCCCCCTGGAAGCTCCCTCGTGCGCTCTCCTGTTCCGACCCTGCCGCTTACCGGATACCTGTCCGCCTTTCTCCCTTCGGGAAGCGTGGCGCTTTCTCATAGCTCACGCTGTAGGTATCTCAGTTCGGTGTAGGTCGTTCGCTCCAAGCTGGGCTGTGTGCACGAACCCCCCGTTCAGCCCGACCGCTGCGCCTTATCCGGTAACTATCGTCTTGAGTCCAACCCGGTAAGACACGACTTATCGCCACTGGCAGCAGCCACTGGTAACAGGATTAGCAGAGCGAGGTATGTAGGCGGTGCTACAGAGTTCTTGAAGTGGTGGCCTAACTACGGCTACACTAGAAGGACAGTATTTGGTATCTGCGCTCTGCTGAAGCCAGTTACCTTCGGAAAAAGAGTTGGTAGCTCTTGATCCGGCAAACAAACCACCGCTGGTAGCGGTGGTTTTTTTGTTTGCAAGCAGCAGATTACGCGCAGAAAAAAAGGATCTCAAGAAGATCCTTTGATCTTTTCTACGGGGTCTGACGCTCAGTGGAACGAAAACTCACGTTAAGGGATTTTGGTCATGAGATTATCAAAAAGGATCTTCACCTAGATCCTTTTAAATTAAAAATGAAGTTTTAAATCAATCTAAAGTATATATGAGTAAACTTGGTCTGACAGTTACCAATGCTTAATCAGTGAGGCACCTATCTCAGCGATCTGTCTATTTCGTTCATCCATAGTTGCCTGACTCCCCGTCGTGTAGATAACTACGATACGGGAGGGCTTACCATCTGGCCCCAGTGCTGCAATGATACCGCGAGACCCACGCTCACCGGCTCCAGATTTATCAGCAATAAACCAGCCAGCCGGAAGGGCCGAGCGCAGAAGTGGTCCTGCAACTTTATCCGCCTCCATCCAGTCTATTAATTGTTGCCGGGAAGCTAGAGTAAGTAGTTCGCCAGTTAATAGTTTGCGCAACGTTGTTGCCATTGCTACAGGCATCGTGGTGTCACGCTCGTCGTTTGGTATGGCTTCATTCAGCTCCGGTTCCCAACGATCAAGGCGAGTTACATGATCCCCCATGTTGTGCAAAAAAGCGGTTAGCTCCTTCGGTCCTCCGATCGTTGTCAGAAGTAAGTTGGCCGCAGTGTTATCACTCATGGTTATGGCAGCACTGCATAATTCTCTTACTGTCATGCCATCCGTAAGATGCTTTTCTGTGACTGGTGAGTACTCAACCAAGTCATTCTGAGAATAGTGTATGCGGCGACCGAGTTGCTCTTGCCCGGCGTCAATACGGGATAATACCGCGCCACATAGCAGAACTTTAAAAGTGCTCATCATTGGAAAACGTTCTTCGGGGCGAAAACTCTCAAGGATCTTACCGCTGTTGAGATCCAGTTCGATGTAACCCACTCGTGCACCCAACTGATCTTCAGCATCTTTTACTTTCACCAGCGTTTCTGGGTGAGCAAAAACAGGAAGGCAAAATGCCGCAAAAAAGGGAATAAGGGCGACACGGAAATGTTGAATACTCATACTCTTCCTTTTTCAATATTATTGAAGCATTTATCAGGGTTATTGTCTCATGAGCGGATACATATTTGAATGTATTTAGAAAAATAAACAAATAGGGGTTCCGCGCACATTTCCCCGAAAAGTGCCACCTGACGTCTAAGAAACCATTATTATCATGACATTAACCTATAAAAATAGGCGTATCACGAGGCCCTTTCGTC',
  },
  {
    id: 'pet-28a',
    name: 'pET-28a(+)',
    length: 5369,
    isCircular: true,
    description: 'Bacterial T7 RNA polymerase expression vector carrying an N-terminal His•Tag/thrombin/T7•Tag configuration plus an optional C-terminal His•Tag.',
    features: [
      { id: 'pet1', name: 'T7 promoter', type: 'promoter', start: 370, end: 386, strand: 1, color: FEATURE_COLORS.promoter, notes: 'TAATACGACTCACTATA' },
      { id: 'pet2', name: 'T7 transcription start', type: 'regulatory', start: 387, end: 387, strand: 1, color: FEATURE_COLORS.regulatory },
      { id: 'pet3', name: 'His-tag (N-terminal)', type: 'tag', start: 270, end: 287, strand: 1, color: FEATURE_COLORS.tag, notes: '6x His tag for IMAC purification' },
      { id: 'pet4', name: 'Thrombin cleavage site', type: 'regulatory', start: 249, end: 266, strand: 1, color: FEATURE_COLORS.regulatory, notes: 'LVPRGS recognition sequence' },
      { id: 'pet5', name: 'T7-tag', type: 'tag', start: 207, end: 239, strand: 1, color: FEATURE_COLORS.tag, notes: 'MASMTGGQQMG leader sequence' },
      { id: 'pet6', name: 'Multiple Cloning Site (MCS)', type: 'mcs', start: 158, end: 203, strand: 1, color: FEATURE_COLORS.mcs, notes: 'NcoI, NdeI, BamHI, EcoRI, SacI, SalI, HindIII, NotI, XhoI' },
      { id: 'pet7', name: 'His-tag (C-terminal)', type: 'tag', start: 140, end: 157, strand: 1, color: FEATURE_COLORS.tag },
      { id: 'pet8', name: 'T7 terminator', type: 'terminator', start: 26, end: 72, strand: 1, color: FEATURE_COLORS.terminator },
      { id: 'pet9', name: 'KanR (aphA-1)', type: 'resistance', start: 3995, end: 4807, strand: -1, color: FEATURE_COLORS.resistance, notes: 'Kanamycin resistance gene' },
      { id: 'pet10', name: 'f1 origin', type: 'origin', start: 4903, end: 5358, strand: 1, color: FEATURE_COLORS.origin, notes: 'Phage f1 origin for single-stranded DNA' },
      { id: 'pet11', name: 'pBR322 origin', type: 'origin', start: 3274, end: 3937, strand: -1, color: FEATURE_COLORS.origin },
      { id: 'pet12', name: 'rop gene', type: 'cds', start: 2862, end: 3053, strand: -1, color: FEATURE_COLORS.cds, notes: 'Repressor of primer (copy number regulator)' },
      { id: 'pet13', name: 'lacI repressor', type: 'cds', start: 773, end: 1852, strand: -1, color: FEATURE_COLORS.cds, notes: 'Lac repressor maintaining strict basal repression' },
    ],
    seq: 'TGGCGAATGGGACGCGCCCTGTAGCGGCGCATTAAGCGCGGCGGGTGTGGTGGTTACGCGCAGCGTGACCGCTACACTTGCCAGCGCCCTAGCGCCCGCTCCTTTCGCTTTCTTCCCTTCCTTTCTCGCCACGTTCGCCGGCTTTCCCCGTCAAGCTCTAAATCGGGGGCTCCCTTTAGGGTTCCGATTTAGTGCTTTACGGCACCTCGACCCCAAAAAACTTGATTAGGGTGATGGTTCACGTAGTGGGCCATCGCCCTGATAGACGGTTTTTCGCCCTTTGACGTTGGAGTCCACGTTCTTTAATAGTGGACTCTTGTTCCAAACTGGAACAACACTCAACCCTATCTCGGTCTATTCTTTTGATTTATAAGGGATTTTGCCGATTTCGGCCTATTGGTTAAAAAATGAGCTGATTTAACAAAAATTTAACGCGAATTTTAACAAAATATTAACGTTTACAATTTCAGGTGGCACTTTTCGGGGAAATGTGCGCGGAACCCCTATTTGTTTATTTTTCTAAATACATTCAAATATGTATCCGCTCATGAATTAATTCTTAGAAAAACTCATCGAGCATCAAATGAAACTGCAATTTATTCATATCAGGATTATCAATACCATATTTTTGAAAAAGCCGTTTCTGTAATGAAGGAGAAAACTCACCGAGGCAGTTCCATAGGATGGCAAGATCCTGGTATCGGTCTGCGATTCCGACTCGTCCAACATCAATACAACCTATTAATTTCCCCTCGTCAAAAATAAGGTTATCAAGTGAGAAATCACCATGAGTGACGACTGAATCCGGTGAGAATGGCAAAAGTTTATGCATTTCTTTCCAGACTTGTTCAACAGGCCAGCCATTACGCTCGTCATCAAAATCACTCGCATCAACCAAACCGTTATTCATTCGTGATTGCGCCTGAGCGAGACGAAATACGCGATCGCTGTTAAAAGGACAATTACAAACAGGAATCGAATGCAACCGGCGCAGGAACACTGCCAGCGCATCAACAATATTTTCACCTGAATCAGGATATTCTTCTAATACCTGGAATGCTGTTTTCCCGGGGATCGCAGTGGTGAGTAACCATGCATCATCAGGAGTACGGATAAAATGCTTGATGGTCGGAAGAGGCATAAATTCCGTCAGCCAGTTTAGTCTGACCATCTCATCTGTAACATCATTGGCAACGCTACCTTTGCCATGTTTCAGAAACAACTCTGGCGCATCGGGCTTCCCATACAATCGATAGATTGTCGCACCTGATTGCCCGACATTATCGCGAGCCCATTTATACCCATATAAATCAGCATCCATGTTGGAATTTAATCGCGGCCTAGAGCAAGACGTTTCCCGTTGAATATGGCTCATAACACCCCTTGTATTACTGTTTATGTAAGCAGACAGTTTTATTGTTCATGACCAAAATCCCTTAACGTGAGTTTTCGTTCCACTGAGCGTCAGACCCCGTAGAAAAGATCAAAGGATCTTCTTGAGATCCTTTTTTTCTGCGCGTAATCTGCTGCTTGCAAACAAAAAAACCACCGCTACCAGCGGTGGTTTGTTTGCCGGATCAAGAGCTACCAACTCTTTTTCCGAAGGTAACTGGCTTCAGCAGAGCGCAGATACCAAATACTGTCCTTCTAGTGTAGCCGTAGTTAGGCCACCACTTCAAGAACTCTGTAGCACCGCCTACATACCTCGCTCTGCTAATCCTGTTACCAGTGGCTGCTGCCAGTGGCGATAAGTCGTGTCTTACCGGGTTGGACTCAAGACGATAGTTACCGGATAAGGCGCAGCGGTCGGGCTGAACGGGGGGTTCGTGCACACAGCCCAGCTTGGAGCGAACGACCTACACCGAACTGAGATACCTACAGCGTGAGCTATGAGAAAGCGCCACGCTTCCCGAAGGGAGAAAGGCGGACAGGTATCCGGTAAGCGGCAGGGTCGGAACAGGAGAGCGCACGAGGGAGCTTCCAGGGGGAAACGCCTGGTATCTTTATAGTCCTGTCGGGTTTCGCCACCTCTGACTTGAGCGTCGATTTTTGTGATGCTCGTCAGGGGGGCGGAGCCTATGGAAAAACGCCAGCAACGCGGCCTTTTTACGGTTCCTGGCCTTTTGCTGGCCTTTTGCTCACATGTTCTTTCCTGCGTTATCCCCTGATTCTGTGGATAACCGTATTACCGCCTTTGAGTGAGCTGATACCGCTCGCCGCAGCCGAACGACCGAGCGCAGCGAGTCAGTGAGCGAGGAAGCGGAAGAGCGCCTGATGCGGTATTTTCTCCTTACGCATCTGTGCGGTATTTCACACCGCATATATGGTGCACTCTCAGTACAATCTGCTCTGATGCCGCATAGTTAAGCCAGTATACACTCCGCTATCGCTACGTGACTGGGTCATGGCTGCGCCCCGACACCCGCCAACACCCGCTGACGCGCCCTGACGGGCTTGTCTGCTCCCGGCATCCGCTTACAGACAAGCTGTGACCGTCTCCGGGAGCTGCATGTGTCAGAGGTTTTCACCGTCATCACCGAAACGCGCGAGGCAGCTGCGGTAAAGCTCATCAGCGTGGTCGTGAAGCGATTCACAGATGTCTGCCTGTTCATCCGCGTCCAGCTCGTTGAGTTTCTCCAGAAGCGTTAATGTCTGGCTTCTGATAAAGCGGGCCATGTTAAGGGCGGTTTTTTCCTGTTTGGTCACTGATGCCTCCGTGTAAGGGGGATTTCTGTTCATGGGGGTAATGATACCGATGAAACGAGAGAGGATGCTCACGATACGGGTTACTGATGATGAACATGCCCGGTTACTGGAACGTTGTGAGGGTAAACAACTGGCGGTATGGATGCGGCGGGACCAGAGAAAAATCACTCAGGGTCAATGCCAGCGCTTCGTTAATACAGATGTAGGTGTTCCACAGGGTAGCCAGCAGCATCCTGCGATGCAGATCCGGAACATAATGGTGCAGGGCGCTGACTTCCGCGTTTCCAGACTTTACGAAACACGGAAACCGAAGACCATTCATGTTGTTGCTCAGGTCGCAGACGTTTTGCAGCAGCAGTCGCTTCACGTTCGCTCGCGTATCGGTGATTCATTCTGCTAACCAGTAAGGCAACCCCGCCAGCCTAGCCGGGTCCTCAACGACAGGAGCACGATCATGCGCACCCGTGGGGCCGCCATGCCGGCGATAATGGCCTGCTTCTCGCCGAAACGTTTGGTGGCGGGACCAGTGACGAAGGCTTGAGCGAGGGCGTGCAAGATTCCGAATACCGCAAGCGACAGGCCGATCATCGTCGCGCTCCAGCGAAAGCGGTCCTCGCCGAAAATGACCCAGAGCGCTGCCGGCACCTGTCCTACGAGTTGCATGATAAAGAAGACAGTCATAAGTGCGGCGACGATAGTCATGCCCCGCGCCCACCGGAAGGAGCTGACTGGGTTGAAGGCTCTCAAGGGCATCGGTCGAGATCCCGGTGCCTAATGAGTGAGCTAACTTACATTAATTGCGTTGCGCTCACTGCCCGCTTTCCAGTCGGGAAACCTGTCGTGCCAGCTGCATTAATGAATCGGCCAACGCGCGGGGAGAGGCGGTTTGCGTATTGGGCGCCAGGGTGGTTTTTCTTTTCACCAGTGAGACGGGCAACAGCTGATTGCCCTTCACCGCCTGGCCCTGAGAGAGTTGCAGCAAGCGGTCCACGCTGGTTTGCCCCAGCAGGCGAAAATCCTGTTTGATGGTGGTTAACGGCGGGATATAACATGAGCTGTCTTCGGTATCGTCGTATCCCACTACCGAGATATCCGCACCAACGCGCAGCCCGGACTCGGTAATGGCGCGCATTGCGCCCAGCGCCATCTGATCGTTGGCAACCAGCATCGCAGTGGGAACGATGCCCTCATTCAGCATTTGCATGGTTTGTTGAAAACCGGACATGGCACTCCAGTCGCCTTCCCGTTCCGCTATCGGCTGAATTTGATTGCGAGTGAGATATTTATGCCAGCCAGCCAGACGCAGACGCGCCGAGACAGAACTTAATGGGCCCGCTAACAGCGCGATTTGCTGGTGACCCAATGCGACCAGATGCTCCACGCCCAGTCGCGTACCGTCTTCATGGGAGAAAATAATACTGTTGATGGGTGTCTGGTCAGAGACATCAAGAAATAACGCCGGAACATTAGTGCAGGCAGCTTCCACAGCAATGGCATCCTGGTCATCCAGCGGATAGTTAATGATCAGCCCACTGACGCGTTGCGCGAGAAGATTGTGCACCGCCGCTTTACAGGCTTCGACGCCGCTTCGTTCTACCATCGACACCACCACGCTGGCACCCAGTTGATCGGCGCGAGATTTAATCGCCGCGACAATTTGCGACGGCGCGTGCAGGGCCAGACTGGAGGTGGCAACGCCAATCAGCAACGACTGTTTGCCCGCCAGTTGTTGTGCCACGCGGTTGGGAATGTAATTCAGCTCCGCCATCGCCGCTTCCACTTTTTCCCGCGTTTTCGCAGAAACGTGGCTGGCCTGGTTCACCACGCGGGAAACGGTCTGATAAGAGACACCGGCATACTCTGCGACATCGTATAACGTTACTGGTTTCACATTCACCACCCTGAATTGACTCTCTTCCGGGCGCTATCATGCCATACCGCGAAAGGTTTTGCGCCATTCGATGGTGTCCGGGATCTCGACGCTCTCCCTTATGCGACTCCTGCATTAGGAAGCAGCCCAGTAGTAGGTTGAGGCCGTTGAGCACCGCCGCCGCAAGGAATGGTGCATGCAAGGAGATGGCGCCCAACAGTCCCCCGGCCACGGGGCCTGCCACCATACCCACGCCGAAACAAGCGCTCATGAGCCCGAAGTGGCGAGCCCGATCTTCCCCATCGGTGATGTCGGCGATATAGGCGCCAGCAACCGCACCTGTGGCGCCGGTGATGCCGGCCACGATGCGTCCGGCGTAGAGGATCGAGATCTCGATCCCGCGAAATTAATACGACTCACTATAGGGGAATTGTGAGCGGATAACAATTCCCCTCTAGAAATAATTTTGTTTAACTTTAAGAAGGAGATATACCATGGGCAGCAGCCATCATCATCATCATCACAGCAGCGGCCTGGTGCCGCGCGGCAGCCATATGGCTAGCATGACTGGTGGACAGCAAATGGGTCGCGGATCCGAATTCGAGCTCCGTCGACAAGCTTGCGGCCGCACTCGAGCACCACCACCACCACCACTGAGATCCGGCTGCTAACAAAGCCCGAAAGGAAGCTGAGTTGGCTGCTGCCACCGCTGAGCAATAACTAGCATAACCCCTTGGGGCCTCTAAACGGGTCTTGAGGGGTTTTTTGCTGAAAGGAGGAACTATATCCGGAT',
  },
];

/** Parse a raw FASTA text into a Plasmid */
export function parseFastaPlasmid(text: string): Plasmid {
  const lines = text.trim().split(/\r?\n/);
  let name = 'Custom Plasmid';
  let seq = '';
  for (const line of lines) {
    if (line.startsWith('>')) {
      name = line.slice(1).trim() || name;
    } else {
      seq += line.replace(/\s+/g, '');
    }
  }
  const clean = seq.toUpperCase().replace(/[^ACGT]/g, '');
  return {
    id: `custom-${Date.now()}`,
    name,
    length: clean.length,
    seq: clean,
    isCircular: true,
    features: [],
  };
}

/** Flip plasmid orientation (reverse complement DNA and invert feature strands and positions) */
export function flipPlasmid(plasmid: Plasmid): Plasmid {
  const len = plasmid.length;
  if (len === 0) return plasmid;
  const newSeq = reverseComplement(plasmid.seq);
  const newFeatures: PlasmidFeature[] = plasmid.features.map(f => {
    const s = len - f.end + 1;
    const e = len - f.start + 1;
    const newStart = ((s - 1 + len) % len) + 1;
    const newEnd = ((e - 1 + len) % len) + 1;
    return {
      ...f,
      start: newStart,
      end: newEnd,
      strand: (f.strand === 1 ? -1 : 1) as 1 | -1,
      notes: f.notes ? `${f.notes} (flipped)` : undefined,
    };
  });

  return {
    ...plasmid,
    seq: newSeq,
    features: newFeatures,
  };
}

/** Set new origin (re-index circular plasmid starting at newOriginBp) */
export function setPlasmidOrigin(plasmid: Plasmid, newOriginBp: number): Plasmid {
  const len = plasmid.length;
  if (len === 0) return plasmid;
  const origin = Math.max(1, Math.min(len, Math.floor(newOriginBp)));
  const offset = origin - 1;

  const newSeq = plasmid.seq.slice(offset) + plasmid.seq.slice(0, offset);
  const newFeatures: PlasmidFeature[] = plasmid.features.map(f => {
    const shift = (pos: number) => ((pos - origin + len) % len) + 1;
    return {
      ...f,
      start: shift(f.start),
      end: shift(f.end),
    };
  });

  return {
    ...plasmid,
    seq: newSeq,
    features: newFeatures,
  };
}

/** Linearize circular plasmid by cutting at cutBp (1-based) */
export function linearizePlasmid(plasmid: Plasmid, cutBp: number): Plasmid {
  const rotated = setPlasmidOrigin(plasmid, cutBp);
  return {
    ...rotated,
    isCircular: false,
    description: `${rotated.description || rotated.name} (Linearized at bp ${cutBp})`,
  };
}

