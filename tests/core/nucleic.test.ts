import { describe, it, expect } from 'vitest';
import {
  cleanNucleic, detectType, complement, reverseComplement, gcContent, gcProfile,
  translate, sixFrames, findOrfs, restrictionSites, digestSummary, formatFasta,
} from '@/core/nucleic/sequence';
import {
  approxMolecularWeight, massConcToMolar, molarToMassConc,
  a260ToMassConc, copyNumber, massForCopies, oligoMass, oligoNmol,
  oligoExtinctionCoefficient, quantifyOligoA260,
} from '@/core/nucleic/quant';
import {
  tmWallace, tmBasic, tmSaltAdjusted, tmNearestNeighbour,
} from '@/core/nucleic/tm';

describe('nucleic sequence basics', () => {
  it('cleans and detects DNA, RNA, and protein', () => {
    expect(cleanNucleic('  atgc n r y \n').seq).toBe('ATGCNRY');
    expect(detectType('ATGCAAAGGGTTT')).toBe('DNA');
    expect(detectType('AUGCAAAGGGUUU')).toBe('RNA');
    expect(detectType('MKWVTFISLLLLFSSAYSRG')).toBe('protein');
  });

  it('reverse complement handles standard and IUPAC ambiguity codes', () => {
    expect(complement('ATGCN', 'DNA')).toBe('TACGN');
    expect(reverseComplement('ATGCN', 'DNA')).toBe('NGCAT');
    expect(reverseComplement('RYSWKMBDHV', 'DNA')).toBe('BDHVKMWSRY');
    expect(reverseComplement('AUGC', 'RNA')).toBe('GCAU');
  });

  it('computes GC content and sliding window profile', () => {
    expect(gcContent('ATGC')).toBe(0.5);
    expect(gcContent('GGCC')).toBe(1.0);
    const prof = gcProfile('ATGCGCAT', 4);
    expect(prof.x.length).toBe(5);
    expect(prof.y[0]).toBe(50);
  });

  it('translates sequences in 6 frames and finds ORFs', () => {
    // ATG GCC TGA -> M A *
    expect(translate('ATGGCCTGA', 1, 1)).toBe('MA*');
    const six = sixFrames('ATGGCCTGA');
    expect(six.find(f => f.frame === 1)?.protein).toBe('MA*');

    const orfs = findOrfs('CCATGGCCTGAATTT', { minAa: 2 });
    expect(orfs.length).toBeGreaterThan(0);
    expect(orfs[0]!.protein).toBe('MA');
  });

  it('identifies restriction sites and digest fragments', () => {
    // EcoRI is GAATTC, cuts at 1 (G^AATTC)
    const sites = restrictionSites('TTGAATTCAA');
    expect(sites.some(s => s.enzyme === 'EcoRI' && s.position === 3)).toBe(true);

    const summary = digestSummary('TTGAATTCAA', undefined, { circular: false });
    const ecoRI = summary.find(r => r.enzyme === 'EcoRI');
    expect(ecoRI).toBeDefined();
    expect(ecoRI?.cuts).toBe(1);
    expect(ecoRI?.fragments).toEqual([3, 7]);
    expect(formatFasta([{ header: 'test', seq: 'ATGC' }])).toContain('>test\nATGC');
  });
});

describe('nucleic acid quantification', () => {
  it('computes molecular weight and nanomoles', () => {
    expect(approxMolecularWeight(1000, 'dsDNA')).toBe(650000);
    expect(oligoNmol(650, 650000)).toBeCloseTo(1.0, 2);
  });

  it('computes molarity from mass concentration (ng/µL to nM)', () => {
    // 650 g/mol/bp for dsDNA. 1000 bp at 650 ng/µL (1 µM = 1000 nM):
    // MW = 650,000 g/mol. 650 ng/µL = 0.65 g/L -> 0.65 / 650000 = 1e-6 M = 1000 nM
    expect(massConcToMolar(650, 1000, 'dsDNA')).toBeCloseTo(1000, 2);
    expect(molarToMassConc(1000, 1000, 'dsDNA')).toBeCloseTo(650, 2);
  });

  it('converts A260 to mass concentration using standard factors', () => {
    // A260 = 1.0 -> 50 µg/mL for dsDNA, 40 for ssRNA, 33 for ssDNA
    expect(a260ToMassConc(1.0, 'dsDNA')).toBe(50);
    expect(a260ToMassConc(1.0, 'ssRNA')).toBe(40);
    expect(a260ToMassConc(1.0, 'ssDNA')).toBe(33);
    expect(a260ToMassConc(2.0, 'dsDNA', 10)).toBe(1000); // 10x dilution
  });

  it('calculates copy number from mass and length', () => {
    // 1 µg of 1000 bp dsDNA -> ~9.26e11 copies
    const copies = copyNumber(1000, 1000, 'dsDNA');
    expect(copies).toBeCloseTo(9.26e11, -9);
    expect(massForCopies(copies, 1000, 'dsDNA')).toBeCloseTo(1000, 1);
  });

  it('calculates exact oligo mass from residue masses with end correction', () => {
    // IDT formula: sum(residues) - 61.96
    // Oligo: ACGT (DNA)
    // dA 313.21, dC 289.18, dG 329.21, dT 304.20 -> 1235.8 - 61.96 = 1173.84
    const m = oligoMass('ACGT', 'DNA');
    expect(m).toBeCloseTo(1173.84, 2);
  });

  it('calculates nearest-neighbor oligo extinction coefficient (ε260) and A260 quantification', () => {
    // Oligo: ACGT (DNA)
    // Dimers: AC (21200) + CG (18000) + GT (20000) = 59200
    // Internal monomers: C (7050) + G (12010) = 19060
    // ε260 = 59200 - 19060 = 40140 M^-1 cm^-1
    const ec = oligoExtinctionCoefficient('ACGT', 'DNA');
    expect(ec).toBe(40140);

    const quant = quantifyOligoA260(1.0, 'ACGT', 'DNA');
    expect(quant.extinctionCoefficient).toBe(40140);
    expect(quant.molarConcUM).toBeCloseTo(1e6 / 40140, 2);
    expect(quant.nmolPerOd260).toBeCloseTo(1e6 / 40140, 2);
  });
});

describe('melting temperature (Tm)', () => {
  it('Wallace rule: 2(A+T) + 4(G+C) for short oligos', () => {
    // AATTGG -> 2*4 + 4*2 = 8 + 8 = 16
    expect(tmWallace('AATTGG').tm).toBe(16);
  });

  it('Basic Marmur formula and salt-adjusted for medium oligos', () => {
    // 64.9 + 41 * (yG+zC - 16.4) / N
    const res = tmBasic('ACGTACGTACGTACGT');
    expect(res.tm).toBeGreaterThan(40);
    expect(res.tm).toBeLessThan(70);

    const saltRes = tmSaltAdjusted('ACGTACGTACGTACGT', 50);
    expect(saltRes.tm).toBeGreaterThan(30);
  });

  it('Nearest-neighbour Tm (SantaLucia 1998)', () => {
    // Self-complementary or primer with salt correction
    const res = tmNearestNeighbour('GCATGCATGCAT', {
      naMM: 50,
      primerNM: 250,
      saltCorrection: 'santalucia1998',
    });
    expect(res.tm).toBeGreaterThan(30);
    expect(res.tm).toBeLessThan(60);
    expect(res.warnings).toEqual([]);
  });
});
