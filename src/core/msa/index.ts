import { getMatrix, scoreOf, type MatrixName, type ScoringMatrix } from '../align/matrices';
import { align, type AlignmentResult } from '../align/gotoh';

export interface SequenceItem {
  id: string;
  name: string;
  sequence: string;
  description?: string;
}

export type MatrixMetric = 'identity' | 'similarity' | 'distance' | 'score';
export type IdentityDenominator = 'alignment' | 'shorter';

export interface PairwiseComparison {
  seq1Idx: number;
  seq2Idx: number;
  name1: string;
  name2: string;
  len1: number;
  len2: number;
  identityCount: number;
  similarityCount: number;
  gapCount: number;
  alignmentLength: number;
  identityPct: number;          // Over alignment length
  identityPctShorter: number;   // Over min(len1, len2)
  similarityPct: number;
  gapPct: number;
  score: number;
  aligned1: string;
  aligned2: string;
  midline: string;
}

export interface MsaResult {
  alignedSequences: { id: string; name: string; aligned: string }[];
  consensus: string;
  consensusScores: number[]; // 0 to 1 per column
  conservationSymbols: string; // '*', ':', '.', ' '
  columns: number;
}

export interface SequenceMatrixResult {
  sequences: SequenceItem[];
  molType: 'protein' | 'dna';
  matrix: number[][];
  identityMatrix: number[][];
  similarityMatrix: number[][];
  distanceMatrix: number[][];
  scoreMatrix: number[][];
  comparisons: Record<string, PairwiseComparison>;
  averageIdentityPct: number;
  averageSimilarityPct: number;
  minIdentityPair: { name1: string; name2: string; pct: number } | null;
  maxIdentityPair: { name1: string; name2: string; pct: number } | null;
  msa: MsaResult;
}

/**
 * Parses FASTA formatted text or loose lines into structured SequenceItems.
 */
export function parseFastaSequences(raw: string): SequenceItem[] {
  const lines = raw.split(/\r?\n/);
  const items: SequenceItem[] = [];
  let currentHeader = '';
  let currentSeqParts: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    if (trimmed.startsWith('>')) {
      if (currentHeader || currentSeqParts.length > 0) {
        const fullSeq = currentSeqParts.join('').toUpperCase().replace(/[^A-Z*]/g, '');
        if (fullSeq) {
          const headerParts = currentHeader.split(/\s+/);
          items.push({
            id: `seq-${items.length + 1}`,
            name: headerParts[0] || `Seq_${items.length + 1}`,
            description: headerParts.slice(1).join(' '),
            sequence: fullSeq,
          });
        }
      }
      currentHeader = trimmed.slice(1).trim();
      currentSeqParts = [];
    } else {
      currentSeqParts.push(trimmed);
    }
  }

  if (currentHeader || currentSeqParts.length > 0) {
    const fullSeq = currentSeqParts.join('').toUpperCase().replace(/[^A-Z*]/g, '');
    if (fullSeq) {
      const headerParts = currentHeader.split(/\s+/);
      items.push({
        id: `seq-${items.length + 1}`,
        name: headerParts[0] || `Seq_${items.length + 1}`,
        description: headerParts.slice(1).join(' '),
        sequence: fullSeq,
      });
    }
  }

  // If no fasta headers were provided, fallback to splitting lines or commas
  if (items.length === 0 && raw.trim().length > 0) {
    const candidateLines = raw
      .split(/[\n,;]+/)
      .map(s => s.trim().toUpperCase().replace(/[^A-Z*]/g, ''))
      .filter(s => s.length >= 3);

    candidateLines.forEach((seq, idx) => {
      items.push({
        id: `seq-${idx + 1}`,
        name: `Sequence_${idx + 1}`,
        sequence: seq,
      });
    });
  }

  return items;
}

/**
 * Auto-detects whether the sequence collection is Protein or DNA.
 */
export function detectMoleculeType(sequences: SequenceItem[]): 'protein' | 'dna' {
  if (sequences.length === 0) return 'protein';
  let totalChars = 0;
  let dnaChars = 0;

  for (const item of sequences) {
    for (let i = 0; i < item.sequence.length; i++) {
      const ch = item.sequence[i]!;
      totalChars++;
      if (ch === 'A' || ch === 'C' || ch === 'G' || ch === 'T' || ch === 'U' || ch === 'N') {
        dnaChars++;
      }
    }
  }

  if (totalChars === 0) return 'protein';
  return (dnaChars / totalChars >= 0.88) ? 'dna' : 'protein';
}

/**
 * Computes all pairwise alignments and builds the N x N Identity, Similarity, Distance, and Score matrices.
 */
export function computeSequenceMatrices(
  sequences: SequenceItem[],
  options: {
    matrixName?: MatrixName;
    gapOpen?: number;
    gapExtend?: number;
    metric?: MatrixMetric;
    identityDenominator?: IdentityDenominator;
  } = {}
): SequenceMatrixResult {
  const n = sequences.length;
  const molType = detectMoleculeType(sequences);
  const matrixName = options.matrixName ?? (molType === 'dna' ? 'DNA-simple' : 'BLOSUM62');
  const scoringMatrix = getMatrix(matrixName);
  const gapOpen = options.gapOpen ?? (molType === 'dna' ? 10 : 10);
  const gapExtend = options.gapExtend ?? (molType === 'dna' ? 2 : 1);
  const metric = options.metric ?? 'identity';
  const idDenom = options.identityDenominator ?? 'alignment';

  const identityMatrix: number[][] = Array.from({ length: n }, () => Array(n).fill(0));
  const similarityMatrix: number[][] = Array.from({ length: n }, () => Array(n).fill(0));
  const distanceMatrix: number[][] = Array.from({ length: n }, () => Array(n).fill(0));
  const scoreMatrix: number[][] = Array.from({ length: n }, () => Array(n).fill(0));
  const comparisons: Record<string, PairwiseComparison> = {};

  let totalPairIdentities = 0;
  let totalPairSimilarities = 0;
  let pairCount = 0;

  let minIdentityPair: { name1: string; name2: string; pct: number } | null = null;
  let maxIdentityPair: { name1: string; name2: string; pct: number } | null = null;

  for (let i = 0; i < n; i++) {
    const seq1 = sequences[i]!;
    
    // Diagonal (self comparison)
    identityMatrix[i]![i] = 100;
    similarityMatrix[i]![i] = 100;
    distanceMatrix[i]![i] = 0;
    
    // Self score
    const selfRes = align(seq1.sequence, seq1.sequence, {
      mode: 'global',
      matrix: scoringMatrix,
      gapOpen,
      gapExtend,
    });
    scoreMatrix[i]![i] = selfRes.score;

    for (let j = i + 1; j < n; j++) {
      const seq2 = sequences[j]!;
      const res: AlignmentResult = align(seq1.sequence, seq2.sequence, {
        mode: 'global',
        matrix: scoringMatrix,
        gapOpen,
        gapExtend,
      });

      const cols = res.stats.columns || 1;
      const minLen = Math.min(seq1.sequence.length, seq2.sequence.length) || 1;
      const idPctAlign = Math.round((res.stats.identities / cols) * 1000) / 10;
      const idPctShorter = Math.round((res.stats.identities / minLen) * 1000) / 10;
      const simPct = Math.round((res.stats.similarities / cols) * 1000) / 10;
      const gapPct = Math.round((res.stats.gapColumns / cols) * 1000) / 10;

      const effectiveIdPct = idDenom === 'shorter' ? idPctShorter : idPctAlign;
      const dist = Math.max(0, Math.round((100 - effectiveIdPct) * 10) / 10);

      const comp: PairwiseComparison = {
        seq1Idx: i,
        seq2Idx: j,
        name1: seq1.name,
        name2: seq2.name,
        len1: seq1.sequence.length,
        len2: seq2.sequence.length,
        identityCount: res.stats.identities,
        similarityCount: res.stats.similarities,
        gapCount: res.stats.gapColumns,
        alignmentLength: cols,
        identityPct: idPctAlign,
        identityPctShorter: idPctShorter,
        similarityPct: simPct,
        gapPct,
        score: res.score,
        aligned1: res.aligned1,
        aligned2: res.aligned2,
        midline: res.midline,
      };

      comparisons[`${i}_${j}`] = comp;
      comparisons[`${j}_${i}`] = {
        ...comp,
        seq1Idx: j,
        seq2Idx: i,
        name1: seq2.name,
        name2: seq1.name,
        len1: seq2.sequence.length,
        len2: seq1.sequence.length,
        aligned1: res.aligned2,
        aligned2: res.aligned1,
      };

      identityMatrix[i]![j] = effectiveIdPct;
      identityMatrix[j]![i] = effectiveIdPct;

      similarityMatrix[i]![j] = simPct;
      similarityMatrix[j]![i] = simPct;

      distanceMatrix[i]![j] = dist;
      distanceMatrix[j]![i] = dist;

      scoreMatrix[i]![j] = res.score;
      scoreMatrix[j]![i] = res.score;

      totalPairIdentities += effectiveIdPct;
      totalPairSimilarities += simPct;
      pairCount++;

      if (!minIdentityPair || effectiveIdPct < minIdentityPair.pct) {
        minIdentityPair = { name1: seq1.name, name2: seq2.name, pct: effectiveIdPct };
      }
      if (!maxIdentityPair || effectiveIdPct > maxIdentityPair.pct) {
        maxIdentityPair = { name1: seq1.name, name2: seq2.name, pct: effectiveIdPct };
      }
    }
  }

  // Active matrix depending on selected metric
  let activeMatrix = identityMatrix;
  if (metric === 'similarity') activeMatrix = similarityMatrix;
  else if (metric === 'distance') activeMatrix = distanceMatrix;
  else if (metric === 'score') activeMatrix = scoreMatrix;

  const averageIdentityPct = pairCount > 0 ? Math.round((totalPairIdentities / pairCount) * 10) / 10 : 100;
  const averageSimilarityPct = pairCount > 0 ? Math.round((totalPairSimilarities / pairCount) * 10) / 10 : 100;

  // Progressive MSA computation
  const msa = computeProgressiveMsa(sequences, distanceMatrix, scoringMatrix, gapOpen, gapExtend, molType);

  return {
    sequences,
    molType,
    matrix: activeMatrix,
    identityMatrix,
    similarityMatrix,
    distanceMatrix,
    scoreMatrix,
    comparisons,
    averageIdentityPct,
    averageSimilarityPct,
    minIdentityPair,
    maxIdentityPair,
    msa,
  };
}

/**
 * UPGMA tree node for progressive alignment guide tree
 */
interface UpgmaNode {
  id: number;
  seqIndices: number[];
  left?: UpgmaNode;
  right?: UpgmaNode;
  dist: number;
}

/**
 * Constructs a UPGMA guide tree and performs progressive multiple sequence alignment.
 */
export function computeProgressiveMsa(
  sequences: SequenceItem[],
  distanceMatrix: number[][],
  matrix: ScoringMatrix,
  gapOpen: number,
  gapExtend: number,
  molType: 'protein' | 'dna'
): MsaResult {
  const n = sequences.length;
  if (n === 0) {
    return { alignedSequences: [], consensus: '', consensusScores: [], conservationSymbols: '', columns: 0 };
  }
  if (n === 1) {
    const s = sequences[0]!;
    return {
      alignedSequences: [{ id: s.id, name: s.name, aligned: s.sequence }],
      consensus: s.sequence,
      consensusScores: Array(s.sequence.length).fill(1.0),
      conservationSymbols: '*'.repeat(s.sequence.length),
      columns: s.sequence.length,
    };
  }

  // Build UPGMA Guide Tree
  let nodes: UpgmaNode[] = sequences.map((_, i) => ({
    id: i,
    seqIndices: [i],
    dist: 0,
  }));

  let dists: number[][] = distanceMatrix.map(row => [...row]);

  while (nodes.length > 1) {
    let minD = Infinity;
    let minI = 0;
    let minJ = 1;

    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        if (dists[i]![j]! < minD) {
          minD = dists[i]![j]!;
          minI = i;
          minJ = j;
        }
      }
    }

    const nodeA = nodes[minI]!;
    const nodeB = nodes[minJ]!;
    const mergedNode: UpgmaNode = {
      id: nodes.length + 1000,
      seqIndices: [...nodeA.seqIndices, ...nodeB.seqIndices],
      left: nodeA,
      right: nodeB,
      dist: minD / 2,
    };

    const newRow: number[] = [];
    const sizeA = nodeA.seqIndices.length;
    const sizeB = nodeB.seqIndices.length;

    for (let k = 0; k < nodes.length; k++) {
      if (k === minI || k === minJ) continue;
      const d = (sizeA * dists[minI]![k]! + sizeB * dists[minJ]![k]!) / (sizeA + sizeB);
      newRow.push(d);
    }

    const remainingNodes = nodes.filter((_, idx) => idx !== minI && idx !== minJ);
    const newDists: number[][] = [];

    for (let r = 0; r < remainingNodes.length; r++) {
      const origIdxR = nodes.indexOf(remainingNodes[r]!);
      const rRow: number[] = [];
      for (let c = 0; c < remainingNodes.length; c++) {
        const origIdxC = nodes.indexOf(remainingNodes[c]!);
        rRow.push(dists[origIdxR]![origIdxC]!);
      }
      rRow.push(newRow[r]!);
      newDists.push(rRow);
    }

    const mergedClusterRow = [...newRow, 0];
    newDists.push(mergedClusterRow);

    nodes = [...remainingNodes, mergedNode];
    dists = newDists;
  }

  // Progressive profile alignment traversal
  const root = nodes[0]!;

  function alignCluster(node: UpgmaNode): Record<number, string> {
    if (!node.left || !node.right) {
      return { [node.seqIndices[0]!]: sequences[node.seqIndices[0]!]!.sequence };
    }

    const leftProfiles = alignCluster(node.left);
    const rightProfiles = alignCluster(node.right);

    const leftRepIdx = node.left.seqIndices[0]!;
    const rightRepIdx = node.right.seqIndices[0]!;

    const leftRepSeq = leftProfiles[leftRepIdx]!;
    const rightRepSeq = rightProfiles[rightRepIdx]!;

    const ungapped1 = leftRepSeq.replace(/-/g, '');
    const ungapped2 = rightRepSeq.replace(/-/g, '');

    const res = align(ungapped1, ungapped2, {
      mode: 'global',
      matrix,
      gapOpen,
      gapExtend,
    });

    const mappedLeft = mapGapsToCluster(leftProfiles, ungapped1, res.aligned1);
    const mappedRight = mapGapsToCluster(rightProfiles, ungapped2, res.aligned2);

    return { ...mappedLeft, ...mappedRight };
  }

  const alignedMap = alignCluster(root);
  const alignedSequences = sequences.map((s, idx) => ({
    id: s.id,
    name: s.name,
    aligned: alignedMap[idx] || s.sequence,
  }));

  // Calculate consensus and conservation statistics
  const columns = alignedSequences[0]?.aligned.length || 0;
  let consensus = '';
  let conservationSymbols = '';
  const consensusScores: number[] = [];

  for (let col = 0; col < columns; col++) {
    const counts: Record<string, number> = {};
    let nonGaps = 0;

    for (const item of alignedSequences) {
      const ch = item.aligned[col] || '-';
      if (ch !== '-') {
        counts[ch] = (counts[ch] || 0) + 1;
        nonGaps++;
      }
    }

    if (nonGaps === 0) {
      consensus += '-';
      consensusScores.push(0);
      conservationSymbols += ' ';
      continue;
    }

    let topRes = '-';
    let topCount = 0;
    for (const [r, count] of Object.entries(counts)) {
      if (count > topCount) {
        topCount = count;
        topRes = r;
      }
    }

    const freq = topCount / n;
    consensus += (freq >= 0.5 ? topRes : topRes.toLowerCase());
    consensusScores.push(Math.round(freq * 100) / 100);

    if (topCount === n) {
      conservationSymbols += '*';
    } else if (nonGaps === n && molType === 'protein') {
      const distinct = Object.keys(counts);
      const isStrong = distinct.every(a => distinct.every(b => scoreOf(matrix, a, b) > 0));
      if (isStrong) {
        conservationSymbols += ':';
      } else {
        const isWeak = distinct.every(a => distinct.every(b => scoreOf(matrix, a, b) >= 0));
        conservationSymbols += isWeak ? '.' : ' ';
      }
    } else {
      conservationSymbols += ' ';
    }
  }

  return {
    alignedSequences,
    consensus,
    consensusScores,
    conservationSymbols,
    columns,
  };
}

function mapGapsToCluster(
  clusterMap: Record<number, string>,
  ungapped: string,
  aligned: string
): Record<number, string> {
  const result: Record<number, string> = {};

  for (const [keyStr, originalSeq] of Object.entries(clusterMap)) {
    const key = Number(keyStr);
    let newSeq = '';
    let origPtr = 0;

    for (let i = 0; i < aligned.length; i++) {
      if (aligned[i] === '-') {
        newSeq += '-';
      } else {
        while (origPtr < originalSeq.length && originalSeq[origPtr] === '-') {
          newSeq += '-';
          origPtr++;
        }
        if (origPtr < originalSeq.length) {
          newSeq += originalSeq[origPtr];
          origPtr++;
        }
      }
    }

    while (origPtr < originalSeq.length) {
      newSeq += originalSeq[origPtr];
      origPtr++;
    }

    result[key] = newSeq;
  }

  return result;
}

export function formatAsClustal(msa: MsaResult, wrapWidth = 60): string {
  const lines: string[] = ['CLUSTAL W multiple sequence alignment\n'];
  const maxNameLen = Math.max(...msa.alignedSequences.map(s => s.name.length), 10) + 4;
  const numBlocks = Math.ceil(msa.columns / wrapWidth);

  for (let b = 0; b < numBlocks; b++) {
    const start = b * wrapWidth;
    const end = Math.min(msa.columns, start + wrapWidth);

    for (const item of msa.alignedSequences) {
      const slice = item.aligned.slice(start, end);
      lines.push(`${item.name.padEnd(maxNameLen)}${slice}`);
    }

    const consSlice = msa.conservationSymbols.slice(start, end);
    lines.push(`${''.padEnd(maxNameLen)}${consSlice}\n`);
  }

  return lines.join('\n');
}

export function formatAsFasta(msa: MsaResult): string {
  return msa.alignedSequences
    .map(item => `>${item.name}\n${item.aligned}`)
    .join('\n');
}

export function formatMatrixCsv(
  sequences: SequenceItem[],
  matrix: number[][],
  metricName: string
): string {
  const header = ['Sequence', ...sequences.map(s => `"${s.name}"`)].join(',');
  const rows = sequences.map((seq, i) => {
    const vals = matrix[i]!.map(v => (Number.isFinite(v) ? v.toString() : '0'));
    return [`"${seq.name}"`, ...vals].join(',');
  });
  return `# Metric: ${metricName}\n${header}\n${rows.join('\n')}`;
}

export const MSA_PRESETS = [
  {
    id: 'fluorescent-proteins',
    name: 'Fluorescent Proteins (GFP, YFP, CFP, mCherry, TagRFP)',
    category: 'protein',
    description: 'Aequorea victoria GFP derivatives and Discosoma coral red fluorescent proteins comparing beta-barrel fold conservation.',
    fasta: `>EGFP
MSKGEELFTGVVPILVELDGDVNGHKFSVSGEGEGDATYGKLTLKFICTTGKLPVPWPTLVTTLTYGVQCFSRYPDHMKQHDFFKSAMPEGYVQERTIFFKDDGNYKTRAEVKFEGDTLVNRIELKGIDFKEDGNILGHKLEYNYNSHNVYIMADKQKNGIKVNFKIRHNIEDGSVQLADHYQQNTPIGDGPVLLPDNHYLSTQSALSKDPNEKRDHMVLLEFVTAAGITLGMDELYK
>EYFP
MSKGEELFTGVVPILVELDGDVNGHKFSVSGEGEGDATYGKLTLKFICTTGKLPVPWPTLVTTFGYGVQCFARYPDHMKQHDFFKSAMPEGYVQERTIFFKDDGNYKTRAEVKFEGDTLVNRIELKGIDFKEDGNILGHKLEYNYNSHNVYIMADKQKNGIKVNFKIRHNIEDGSVQLADHYQQNTPIGDGPVLLPDNHYLSYQSALSKDPNEKRDHMVLLEFVTAAGITLGMDELYK
>ECFP
MSKGEELFTGVVPILVELDGDVNGHKFSVSGEGEGDATYGKLTLKFICTTGKLPVPWPTLVTTLTWGVQCFSRYPDHMKQHDFFKSAMPEGYVQERTIFFKDDGNYKTRAEVKFEGDTLVNRIELKGIDFKEDGNILGHKLEYNYNSHNVYIMADKQKNGIKVNFKIRHNIEDGSVQLADHYQQNTPIGDGPVLLPDNHYLSTQSALSKDPNEKRDHMVLLEFVTAAGITLGMDELYK
>mCherry
MVSKGEEDNMAIIKEFMRFKVHMEGSVNGHEFEIEGEGEGRPYEGTQTAKLKVTKGGPLPFAWDILSPQFMYGSKAYVKHPADIPDYLKLSFPEGFKWERVMNFEDGGVVTVTQDSSLQDGEFIYKVKLRGTNFPSDGPVMQKKTMGWEASSERMYPEDGALKGEIKQRLKLKDGGHYDAEVKTTYKAKKPVQLPGAYNVNIKLDITSHNEDYTIVEQYERAEGRHSTGGMDELYK
>TagRFP
MVSKGEELIKENMHMKLYMEGTVNNHHFKCTSEGEGKPYEGTQTQRIKVVEGGPLPFAFDILATSFLYGSKTFINHTQGIPDFFKQSFPEGFTWERVTTYEDGGVLTATQDTSLQDGCLIYNVKIRGVNFPSNGPVMQKKTLGWEANTEMLYPADGGLEGRSDMALKLVGGGHLICNFKTTYRSKKPAKNLKMPGVYYVDHRLERIKEADKETYVEQHEVAVARYCDLPSKLGHKLN`,
  },
  {
    id: 'globins',
    name: 'Globin Superfamily (Hb-Alpha, Hb-Beta, Myoglobin, Leghemoglobin)',
    category: 'protein',
    description: 'Heme-binding globin proteins across humans and plants demonstrating conserved proximal and distal histidines.',
    fasta: `>Human_Hb_Alpha
MVLSPADKTNVKAAWGKVGAHAGEYGAEALERMFLSFPTTKTYFPHFDLSHGSAQVKGHGKKVADALTNAVAHVDDMPNALSALSDLHAHKLRVDPVNFKLLSHCLLVTLAAHLPAEFTPAVHASLDKFLASVSTVLTSKYR
>Human_Hb_Beta
MVHLTPEEKSAVTALWGKVNVDEVGGEALGRLLVVYPWTQRFFESFGDLSTPDAVMGNPKVKAHGKKVLGAFSDGLAHLDNLKGTFATLSELHCDKLHVDPENFRLLGNVLVCVLAHHFGKEFTPPVQAAYQKVVAGVANALAHKYH
>Human_Hb_Gamma
MGHFTEEDKATITSLWGKVNVEDAGGETLGRLLVVYPWTQRFFDSFGNLSSASAIMGNPKVKAHGKKVLTSLGDAIKHLDDLKGTFAQLSELHCDKLHVDPENFKLLGNVLVTVLAIHFGKEFTPEVQASWQKMVTAVASALSSRYH
>Human_Myoglobin
MGLSDGEWQLVLNVWGKVEADIPGHGQEVLIRLFKGHPETLEKFDKFKHLKSEDEMKASEDLKKHGATVLTALGGILKKKGHHEAEIKPLAQSIIATKHKIPVKYLEFISECIIQVLQSKHPGDFGADAQGAMNKALELFRKDMASNYKELGFQG
>Soybean_Leghemoglobin
MVAFTEKQDALVSSSFEAFKANIPQYSVVFYTSILEKAPAAKDLFSFLANGVDPTNPKLTGHAEKLFALVRDSAGQLKASGTVVADAALGSVHAQKAVTDPQFVVVKEALLKTIKAAVGDKWSDELSRAWEVAYDELAAAIKKA`,
  },
  {
    id: 'insulin',
    name: 'Insulin Precursors (Human, Pig, Cow, Mouse, Zebrafish)',
    category: 'protein',
    description: 'Proinsulin sequences showing high evolutionary conservation of A and B chains linked by divergent C-peptide.',
    fasta: `>Human_Insulin
MALWMRLLPLLALLALWGPDPAAAFVNQHLCGSHLVEALYLVCGERGFFYTPKTRREAEDLQVGQVELGGGPGAGSLQPLALEGSLQKRGIVEQCCTSICSLYQLENYCN
>Porcine_Insulin
MALWTRLLPLLALLALWAPAPAQAFVNQHLCGSHLVEALYLVCGERGFFYTPKARREAENPQAGAVELGGGLGGLQALALEGPPQKRGIVEQCCTSICSLYQLENYCN
>Bovine_Insulin
MALWTRLLPLLALLALWAPAPAQAFVNQHLCGSHLVEALYLVCGERGFFYTPKARREVEGPQVGALELAGGPGAGGLEGPPQKRGIVEQCCASVCSLYQLENYCN
>Mouse_Insulin_1
MALLVHFLPLLALLALWEPKPTQAFVKQHLCGPHLVEALYLVCGERGFFYTPKSRREVEDPQVEQLELGGSPGDLQTLALEVARQKRGIVDQCCTSICSLYQLENYCN
>Zebrafish_Insulin
MAVWLQAGALLVLLVVSSVSTNPGTPQHLCGSHLVDALYLVCGPTGFFYNPKRDVDPLIGFLPPKSGVEEMAFKTDIAEERRGIVEQCCHKPCSIFELQNYCN`,
  },
  {
    id: 'coronavirus-rbd',
    name: 'Coronavirus Spike RBDs (SARS-CoV-2, Delta, Omicron, SARS-CoV-1, MERS)',
    category: 'protein',
    description: 'Receptor-binding domain (RBD) comparison tracking viral evolution and immune evasion mutations.',
    fasta: `>SARS_CoV_2_WT
RVQPTESIVRFPNITNLCPFGEVFNATRFASVYAWNRKRISNCVADYSVLYNSASFSTFKCYGVSPTKLNDLCFTNVYADSFVIRGDEVRQIAPGQTGKIADYNYKLPDDFTGCVIAWNSNNLDSKVGGNYNYLYRLFRKSNLKPFERDISTEIYQAGSTPCNGVEGFNCYFPLQSYGFQPTNGVGYQPYRVVVLSFELLHAPATVCGPKKSTNLVKNKCVNF
>SARS_CoV_2_Delta
RVQPTESIVRFPNITNLCPFGEVFNATRFASVYAWNRKRISNCVADYSVLYNSASFSTFKCYGVSPTKLNDLCFTNVYADSFVIRGDEVRQIAPGQTGKIADYNYKLPDDFTGCVIAWNSNNLDSKVGGNYNYRYRLFRKSNLKPFERDISTEIYQAGSTPCNGVQGFNCYFPLQSYGFQPTNGVGYQPYRVVVLSFELLHAPATVCGPKKSTNLVKNKCVNF
>SARS_CoV_2_Omicron_BA1
RVQPTESIVRFPNITNLCPFDEVFNATRFASVYAWNRKRISNCVADYSVLYNLAPFFTFKCYGVSPTKLNDLCFTNVYADSFVIRGDEVRQIAPGQTGNIADYNYKLPDDFTGCVIAWNSNKLDSKVSGNYNYLYRLFRKSNLKPFERDISTEIYQAGNKPCNGVAGFNCYFPLRSYSFRPTYGVGHQPYRVVVLSFELLHAPATVCGPKKSTNLVKNKCVNF
>SARS_CoV_1
RVVPSGDVVRFPNITNLCPFGEVFNATKFPSVYAWERKKISNCVADYSVLYNSTFFSTFKCYGVSATKLNDLCFSNVYADSFVVKGDDVRQIAPGQTGVIADYNYKLPDDFMGCVLAWNTRNIDATSTGNYNYKYRYLRHGKLRPFERDISNVPFSPDGKPCT-PPALNCYWPLNDYGFYTTTGIGYQPYRVVVLSFELLNAPATVCGPKLSTDLIKNQCVNF
>MERS_CoV
EVPFSLSARYEYGNLTLLPKSISVSVGEFLNWTDFKAFYAWNKQKISNCVADYSVLYNSTSFSTFKCYGVSATKLNDLCFSNVYADSFVIKGDDVRQIAPGQTGVIADYNYKLPDDFMGCVLAWNTRNIDATSTGNYNYKYRYLRHGKLRPFERDISNVPFSPDGKPCT-PPALNCYWPLNDYGFYTTTGIGYQPYRVVVLSFELLNAPATVCGPKLSTDLIKNQCVNF`,
  },
  {
    id: 'dna-crispr-pam',
    name: 'DNA: CRISPR Cas9 PAM Recognition Target DNA Domains',
    category: 'dna',
    description: 'Bacterial CRISPR-Cas target sequences comparing Cas9 cleavage protospacer adjacent motif (PAM) flanking DNA.',
    fasta: `>SpCas9_Target_EMX1
GAGTCCGAGCAGAAGAAGAAGGGCTCCCATCACATCAACCGGTGGCGCATTGCCACGAAGCAGGCCAATGGGGAGGACATCGATGTCACCTCCAATGA
>SpCas9_Target_VEGFA
GGTGAGTGAGTGTGTGCGTGTGGGGAGTGGCTCCTGCCCGGGGTCCGTGCCCTTTCCGTGGAGGGACGTCCCAGCCTCACCGGGGGCTCCTCCTAGGC
>SaCas9_Target_EMX1
GAGTCCGAGCAGAAGAAGAAGGGCTCCCATCACATCAACCGGTGGCGCATTGCCACGAAGCAGGCCAATGGGGAGGACATCGATGTCACCTCCAATGA
>CjCas9_Target_EMX1
CCGAGCAGAAGAAGAAGGGCTCCCATCACATCAACCGGTGGCGCATTGCCACGAAGCAGGCCAATGGGGAGGACATCGATGTCACCTCCAATGAGGAC`,
  },
];
