import { describe, expect, it } from 'vitest';
import {
  parsePdb,
  kabschSuperposition,
  superimposeStructures,
  getDemoTrpCagePdb,
  dist3d,
  type Vec3,
} from '@/core/protein/structure';

describe('3D Protein Structure & Kabsch Superposition', () => {
  it('parses PDB ATOM records, Ca coordinates, and residue sequences', () => {
    const { refPdb } = getDemoTrpCagePdb();
    const struct = parsePdb(refPdb, 'Trp-cage');

    expect(struct.name).toBe('Trp-cage');
    expect(struct.caAtoms.length).toBe(20);
    expect(struct.sequence).toBe('NLYIQWLKDGGPSSGRPPPS');
    expect(struct.chains.length).toBe(1);
    expect(struct.chains[0]?.residues.length).toBe(20);
    expect(struct.radiusOfGyration).toBeGreaterThan(5);
    expect(struct.radiusOfGyration).toBeLessThan(15);
  });

  it('yields RMSD = 0 for identical structures', () => {
    const { refPdb } = getDemoTrpCagePdb();
    const structA = parsePdb(refPdb, 'A');
    const structB = parsePdb(refPdb, 'B');

    const result = superimposeStructures(structA, structB);
    expect(result.rmsd).toBeCloseTo(0, 5);
    expect(result.maxDeviation).toBeCloseTo(0, 5);
    expect(result.pairedCount).toBe(20);

    // Rotation should be identity
    expect(result.rotation[0]![0]!).toBeCloseTo(1, 4);
    expect(result.rotation[1]![1]!).toBeCloseTo(1, 4);
    expect(result.rotation[2]![2]!).toBeCloseTo(1, 4);
  });

  it('recovers pure rigid-body rotation and translation with RMSD = 0', () => {
    const coords: Vec3[] = [
      { x: 1.0, y: 2.0, z: 3.0 },
      { x: 4.0, y: 0.5, z: -1.0 },
      { x: -2.0, y: 3.5, z: 2.5 },
      { x: 0.0, y: -4.0, z: 1.2 },
      { x: 3.2, y: 1.8, z: -2.4 },
    ];

    // Rotate 45 deg around Z and translate by (10, -20, 5)
    const rad = Math.PI / 4;
    const cosT = Math.cos(rad);
    const sinT = Math.sin(rad);

    const transformed: Vec3[] = coords.map(p => ({
      x: cosT * p.x - sinT * p.y + 10.0,
      y: sinT * p.x + cosT * p.y - 20.0,
      z: p.z + 5.0,
    }));

    // Superimpose coords onto transformed
    const result = kabschSuperposition(coords, transformed);
    expect(result.rmsd).toBeCloseTo(0, 4);
    expect(result.maxDeviation).toBeCloseTo(0, 4);
    expect(result.translation.x).toBeCloseTo(10.0, 3);
    expect(result.translation.y).toBeCloseTo(-20.0, 3);
    expect(result.translation.z).toBeCloseTo(5.0, 3);
  });

  it('superimposes conformational ensemble models with realistic RMSD and per-residue deviations', () => {
    const { refPdb, targetPdb } = getDemoTrpCagePdb();
    const structRef = parsePdb(refPdb, 'Ref');
    const structTarget = parsePdb(targetPdb, 'Target');

    const result = superimposeStructures(structRef, structTarget);
    expect(result.rmsd).toBeGreaterThan(0.2);
    expect(result.rmsd).toBeLessThan(1.5);
    expect(result.alignedResidues.length).toBe(20);
    expect(result.maxDeviation).toBeGreaterThan(result.medianDeviation);
    expect(result.transformedStructureA.caAtoms.length).toBe(20);

    // Verify distance between aligned Ca and target is close to per-residue deviations
    const ca1 = result.transformedStructureA.caAtoms[0]!.coord;
    const caTarget1 = structTarget.caAtoms[0]!.coord;
    expect(dist3d(ca1, caTarget1)).toBeCloseTo(result.perResidueDeviations[0]!, 2);
  });

  it('rejects point sets with mismatched lengths or fewer than 3 points', () => {
    const p = [{ x: 0, y: 0, z: 0 }, { x: 1, y: 1, z: 1 }];
    const q = [{ x: 0, y: 0, z: 0 }, { x: 1, y: 1, z: 1 }];
    expect(() => kabschSuperposition(p, q)).toThrow(/at least 3/i);

    const p3 = [{ x: 0, y: 0, z: 0 }, { x: 1, y: 1, z: 1 }, { x: 2, y: 2, z: 2 }];
    expect(() => kabschSuperposition(p3, q)).toThrow(/mismatch/i);
  });

  it('parses ligands, cofactors, and HETNAM records rendering actual PDB names instead of X', () => {
    const mockPdb = [
      'HETNAM     HEM PROTOPORPHYRIN IX CONTAINING FE',
      'HETNAM     PO4 PHOSPHATE ION',
      'ATOM      1  N   ALA A   1      11.104  13.207   9.000  1.00 20.00           N',
      'ATOM      2  CA  ALA A   1      11.104  13.207  10.000  1.00 20.00           C',
      'ATOM      3  C   ALA A   1      11.104  13.207  11.000  1.00 20.00           C',
      'ATOM      4  O   ALA A   1      11.104  13.207  12.000  1.00 20.00           O',
      'HETATM    5  FE  HEM A 142      15.000  15.000  15.000  1.00 15.00          FE',
      'HETATM    6  N   HEM A 142      15.500  15.000  15.000  1.00 15.00           N',
      'HETATM    7  P   PO4 B   1      20.000  20.000  20.000  1.00 10.00           P',
      'HETATM    8  O1  PO4 B   1      20.500  20.000  20.000  1.00 10.00           O',
      'HETATM    9  O   HOH A 200      30.000  30.000  30.000  1.00 10.00           O',
    ].join('\n');

    const struct = parsePdb(mockPdb, 'LigandTest');

    // Does not render as 'X'
    expect(struct.sequence).not.toContain('X');
    expect(struct.sequence).toContain('[HEM]');
    expect(struct.sequence).toContain('[PO4]');

    // Chain A: 1 aa + 1 ligand + 1 water
    const chainA = struct.chains.find(c => c.id === 'A');
    expect(chainA).toBeDefined();
    expect(chainA?.isLigandOnly).toBe(false);
    expect(chainA?.polymerResidues.length).toBe(1);
    expect(chainA?.polymerResidues[0]?.oneLetter).toBe('A');
    expect(chainA?.ligands.length).toBe(1);
    expect(chainA?.ligands[0]?.resName).toBe('HEM');
    expect(chainA?.ligands[0]?.fullName).toBe('PROTOPORPHYRIN IX CONTAINING FE');
    expect(chainA?.ligands[0]?.oneLetter).toBe('[HEM]');
    expect(chainA?.waters.length).toBe(1);

    // Chain B: ligand only (PO4)
    const chainB = struct.chains.find(c => c.id === 'B');
    expect(chainB).toBeDefined();
    expect(chainB?.isLigandOnly).toBe(true);
    expect(chainB?.polymerResidues.length).toBe(0);
    expect(chainB?.ligands.length).toBe(1);
    expect(chainB?.ligands[0]?.resName).toBe('PO4');
    expect(chainB?.ligands[0]?.fullName).toBe('PHOSPHATE ION');
    expect(chainB?.ligands[0]?.oneLetter).toBe('[PO4]');

    // Global ligands list
    expect(struct.ligands.length).toBe(2);
    const hem = struct.ligands.find(l => l.id === 'HEM');
    expect(hem?.name).toBe('PROTOPORPHYRIN IX CONTAINING FE');
    expect(hem?.chain).toBe('A');
    expect(hem?.resSeq).toBe(142);
    expect(hem?.atomCount).toBe(2);

    const po4 = struct.ligands.find(l => l.id === 'PO4');
    expect(po4?.name).toBe('PHOSPHATE ION');
    expect(po4?.chain).toBe('B');
    expect(po4?.resSeq).toBe(1);
    expect(po4?.atomCount).toBe(2);
  });

  it('parses ribosomal RNA and multi-subunit complexes with COMPND descriptions and P backbone atoms', () => {
    const mockRibosomePdb = [
      'COMPND    MOL_ID: 1;',
      'COMPND   2 MOLECULE: 16S RIBOSOMAL RNA;',
      'COMPND   3 CHAIN: A;',
      'COMPND   4 MOL_ID: 2;',
      'COMPND   5 MOLECULE: 30S RIBOSOMAL PROTEIN S2;',
      'COMPND   6 CHAIN: E;',
      'COMPND   7 MOL_ID: 3;',
      'COMPND   8 MOLECULE: TRNA(PHE);',
      'COMPND   9 CHAIN: B;',
      // Chain A: RNA nucleotides (U, G, A, C) with phosphorus (P) backbone trace
      'ATOM      1  P     U A   1     -50.761  76.728 327.188  1.00 20.00           P',
      'ATOM      2  P     G A   2     -48.559  75.043 336.960  1.00 20.00           P',
      'ATOM      3  P     A A   3     -38.842  81.559 319.106  1.00 20.00           P',
      'ATOM      4  P     C A   4     -33.520  80.139 315.004  1.00 20.00           P',
      // Chain B: tRNA with modified base PSU
      'ATOM      5  P   PSU B   1     -10.000  10.000  10.000  1.00 20.00           P',
      'ATOM      6  P     C B   2     -12.000  12.000  12.000  1.00 20.00           P',
      // Chain E: Protein subunit with CA
      'ATOM      7  N   MET E   1       5.000   5.000   5.000  1.00 20.00           N',
      'ATOM      8  CA  MET E   1       6.000   6.000   6.000  1.00 20.00           C',
      'ATOM      9  N   GLY E   2       7.000   7.000   7.000  1.00 20.00           N',
      'ATOM     10  CA  GLY E   2       8.000   8.000   8.000  1.00 20.00           C',
      // Real ligand (Magnesium ion)
      'HETATM   11 MG    MG A 201     -40.000  70.000 320.000  1.00 15.00          MG',
    ].join('\n');

    const struct = parsePdb(mockRibosomePdb, '1JGQ-Mock');

    expect(struct.chains.length).toBe(3);

    // Chain A: 16S rRNA
    const chainA = struct.chains.find(c => c.id === 'A');
    expect(chainA).toBeDefined();
    expect(chainA?.description).toBe('16S RIBOSOMAL RNA');
    expect(chainA?.chainType).toBe('rna');
    expect(chainA?.isLigandOnly).toBe(false);
    expect(chainA?.polymerResidues.length).toBe(4);
    expect(chainA?.polymerResidues.map(r => r.oneLetter).join('')).toBe('UGAC');
    expect(chainA?.ligands.length).toBe(1); // Only the MG ion
    expect(chainA?.ligands[0]?.resName).toBe('MG');

    // Chain B: tRNA
    const chainB = struct.chains.find(c => c.id === 'B');
    expect(chainB).toBeDefined();
    expect(chainB?.description).toBe('TRNA(PHE)');
    expect(chainB?.chainType).toBe('rna');
    expect(chainB?.polymerResidues.length).toBe(2);
    expect(chainB?.polymerResidues[0]?.resName).toBe('PSU');
    expect(chainB?.polymerResidues[0]?.oneLetter).toBe('U');

    // Chain E: Protein S2
    const chainE = struct.chains.find(c => c.id === 'E');
    expect(chainE).toBeDefined();
    expect(chainE?.description).toBe('30S RIBOSOMAL PROTEIN S2');
    expect(chainE?.chainType).toBe('protein');
    expect(chainE?.polymerResidues.length).toBe(2);
    expect(chainE?.polymerResidues.map(r => r.oneLetter).join('')).toBe('MG');

    // caAtoms should include both CA (2) and P (6) = 8 backbone trace atoms
    expect(struct.caAtoms.length).toBe(8);

    // Ligands list should ONLY contain the real MG ligand, NOT the 6 RNA bases!
    expect(struct.ligands.length).toBe(1);
    expect(struct.ligands[0]?.id).toBe('MG');
    expect(struct.ligands[0]?.chain).toBe('A');
  });
});
