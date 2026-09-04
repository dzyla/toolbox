import { describe, it, expect } from 'vitest';
import {
  parseFastaSequences,
  detectMoleculeType,
  computeSequenceMatrices,
  computeProgressiveMsa,
  formatAsClustal,
  formatAsFasta,
  formatMatrixCsv,
  MSA_PRESETS,
} from '@/core/msa';
import { getMatrix } from '@/core/align/matrices';
import { compute2DDiffractionIntensity, generateThonRingsMatrix, DIFFRACTION_PRESETS } from '@/core/cryoem';
import { parseScientificNumber } from '@/app/components/DecimalInput';

describe('Multiple Sequence Alignment & Matrix Core Logic', () => {
  it('parses multi-FASTA strings with headers and raw sequences', () => {
    const fasta = `
>Seq1 Alpha subunit
MKTIIALSYIFCLVFA
>Seq2 Beta subunit
MKTIIALSYIFCLAAA
    `.trim();

    const seqs = parseFastaSequences(fasta);
    expect(seqs.length).toBe(2);
    expect(seqs[0]!.name).toBe('Seq1');
    expect(seqs[0]!.description).toBe('Alpha subunit');
    expect(seqs[0]!.sequence).toBe('MKTIIALSYIFCLVFA');
    expect(seqs[1]!.name).toBe('Seq2');
    expect(seqs[1]!.sequence).toBe('MKTIIALSYIFCLAAA');
  });

  it('detects molecule types correctly for DNA vs Protein', () => {
    const dnaSeqs = parseFastaSequences('>D1\nATGCGATCGATCGATC\n>D2\nATGCGATCGATCGATT');
    expect(detectMoleculeType(dnaSeqs)).toBe('dna');

    const proteinSeqs = parseFastaSequences('>P1\nMKWVTFISLLFLFSSAYSRG\n>P2\nMKWVTFISLLFLFSSAYSRA');
    expect(detectMoleculeType(proteinSeqs)).toBe('protein');
  });

  it('computes symmetric N x N identity and similarity matrices', () => {
    const seqs = [
      { id: '1', name: 'SeqA', sequence: 'HEAGAWGHEE' },
      { id: '2', name: 'SeqB', sequence: 'P-AWHEAE' },
      { id: '3', name: 'SeqC', sequence: 'HEAGAWGHEE' }, // exact clone of SeqA
    ];

    const res = computeSequenceMatrices(seqs, {
      matrixName: 'BLOSUM62',
      gapOpen: 10,
      gapExtend: 1,
      metric: 'identity',
    });

    expect(res.matrix.length).toBe(3);
    expect(res.matrix[0]!.length).toBe(3);

    // Diagonal elements must be 100%
    expect(res.identityMatrix[0]![0]).toBe(100);
    expect(res.identityMatrix[1]![1]).toBe(100);
    expect(res.identityMatrix[2]![2]).toBe(100);

    // SeqA vs SeqC identical
    expect(res.identityMatrix[0]![2]).toBe(100);
    expect(res.identityMatrix[2]![0]).toBe(100);

    // Symmetry
    expect(res.identityMatrix[0]![1]).toBe(res.identityMatrix[1]![0]);
    expect(res.similarityMatrix[0]![1]).toBe(res.similarityMatrix[1]![0]);
    expect(res.distanceMatrix[0]![1]).toBe(res.distanceMatrix[1]![0]);
    expect(res.scoreMatrix[0]![1]).toBe(res.scoreMatrix[1]![0]);

    // Pairwise comparison lookup
    const comp01 = res.comparisons['0_1'];
    expect(comp01).toBeTruthy();
    expect(comp01?.name1).toBe('SeqA');
    expect(comp01?.name2).toBe('SeqB');
    expect(comp01?.aligned1.length).toBe(comp01?.aligned2.length);
  });

  it('computes progressive MSA with equal columns and consensus symbols', () => {
    const seqs = [
      { id: '1', name: 'A', sequence: 'MKTIIALSYIFCLVFA' },
      { id: '2', name: 'B', sequence: 'MKTIIALSYIFCLAAA' },
      { id: '3', name: 'C', sequence: 'MKTIIALSYIF' },
    ];

    const matrix = getMatrix('BLOSUM62');
    const dists = [
      [0, 18.7, 31.2],
      [18.7, 0, 31.2],
      [31.2, 31.2, 0],
    ];

    const msa = computeProgressiveMsa(seqs, dists, matrix, 10, 1, 'protein');
    expect(msa.alignedSequences.length).toBe(3);
    expect(msa.columns).toBeGreaterThanOrEqual(16);

    // All sequences in the MSA must have identical aligned length
    for (const item of msa.alignedSequences) {
      expect(item.aligned.length).toBe(msa.columns);
    }

    // Consensus length matches columns
    expect(msa.consensus.length).toBe(msa.columns);
    expect(msa.consensusScores.length).toBe(msa.columns);
    expect(msa.conservationSymbols.length).toBe(msa.columns);

    // Conserved prefix MKTIIALSYIF should have '*'
    expect(msa.conservationSymbols.startsWith('***********')).toBe(true);
  });

  it('formats Clustal, FASTA, and Matrix CSV exports correctly', () => {
    const seqs = [
      { id: '1', name: 'Seq1', sequence: 'MVLSPADKTN' },
      { id: '2', name: 'Seq2', sequence: 'MVLSPADKTE' },
    ];
    const res = computeSequenceMatrices(seqs);

    const clustal = formatAsClustal(res.msa);
    expect(clustal).toContain('CLUSTAL W multiple sequence alignment');
    expect(clustal).toContain('Seq1');
    expect(clustal).toContain('Seq2');

    const fasta = formatAsFasta(res.msa);
    expect(fasta).toContain('>Seq1\n');
    expect(fasta).toContain('>Seq2\n');

    const csv = formatMatrixCsv(res.sequences, res.identityMatrix, '% Identity');
    expect(csv).toContain('"Seq1"');
    expect(csv).toContain('100');
  });

  it('contains valid built-in presets that parse cleanly', () => {
    expect(MSA_PRESETS.length).toBeGreaterThanOrEqual(4);
    for (const preset of MSA_PRESETS) {
      const parsed = parseFastaSequences(preset.fasta);
      expect(parsed.length).toBeGreaterThanOrEqual(3);
      for (const item of parsed) {
        expect(item.sequence.length).toBeGreaterThan(10);
      }
    }
  });
});

describe('Scientific Exponent Input & Cryo-EM Hexagonal Graphene Logic', () => {
  it('parses scientific notations including "1.3 10 6", "1.3e6", "1.3 x 10^6", and standard numbers', () => {
    expect(parseScientificNumber('123.45')).toBe(123.45);
    expect(parseScientificNumber('1.3e6')).toBe(1300000);
    expect(parseScientificNumber('1.3E6')).toBe(1300000);
    expect(parseScientificNumber('1.3 10 6')).toBe(1300000);
    expect(parseScientificNumber('1.3 10^6')).toBe(1300000);
    expect(parseScientificNumber('1.3 x 10^6')).toBe(1300000);
    expect(parseScientificNumber('1.3 * 10^6')).toBe(1300000);
    expect(parseScientificNumber('1.3 × 10^6')).toBe(1300000);
    expect(parseScientificNumber('1.3 10 -6')).toBe(1.3e-6);
    expect(parseScientificNumber('10^6')).toBe(1000000);
    expect(parseScientificNumber('-10^3')).toBe(-1000);
    expect(parseScientificNumber('')).toBeNull();
    expect(parseScientificNumber('invalid')).toBeNull();
  });

  it('computes discrete 6-fold hexagonal Bragg reflection spots for single-crystal graphene in Cryo-EM', () => {
    expect(DIFFRACTION_PRESETS.graphene.name).toContain('Hexagonal Bragg Spots');
    expect(DIFFRACTION_PRESETS.graphene.rings.length).toBe(2);

    // Check 2D spot intensity at 2.13 Å (s = 1/2.13 = ~0.4695 1/Å)
    const s1 = 1 / 2.13;
    const theta0 = (15 * Math.PI) / 180;
    const spotX = s1 * Math.cos(theta0);
    const spotY = s1 * Math.sin(theta0);

    // Exactly at the Bragg reflection spot, intensity must be strong
    const peakInt = compute2DDiffractionIntensity(spotX, spotY, s1, 'graphene');
    expect(peakInt).toBeGreaterThan(0.85);

    // At the same radius (s1) but between spots (e.g. 30° away), intensity must drop to ~0
    const midAngle = theta0 + (30 * Math.PI) / 180;
    const midX = s1 * Math.cos(midAngle);
    const midY = s1 * Math.sin(midAngle);
    const gapInt = compute2DDiffractionIntensity(midX, midY, s1, 'graphene');
    expect(gapInt).toBeLessThan(0.05);

    // 2D matrix generation runs and succeeds with graphene
    const matrix = generateThonRingsMatrix(128, 300, 2.7, 1.2, 1.2, 0, 1.0, 0.07, 50, 'graphene');
    expect(matrix.length).toBe(128 * 128);
  });
});
