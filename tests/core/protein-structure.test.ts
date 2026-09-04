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
});
