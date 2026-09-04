/**
 * Protein 3D Structure parser (PDB), Kabsch algorithm (1976) optimal superposition,
 * Ca RMSD calculation, and structural analytics.
 */

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface AtomRecord {
  record: 'ATOM' | 'HETATM';
  serial: number;
  name: string;
  resName: string;
  chain: string;
  resSeq: number;
  coord: Vec3;
  occupancy: number;
  bFactor: number;
  element: string;
}

export interface Residue {
  resSeq: number;
  resName: string;
  oneLetter: string;
  chain: string;
  caAtom?: AtomRecord;
  atoms: AtomRecord[];
  secondary?: 'H' | 'E' | 'C'; // Helix, Sheet, Coil/Loop
}

export interface Chain {
  id: string;
  residues: Residue[];
}

export interface ParsedStructure {
  name: string;
  chains: Chain[];
  caAtoms: AtomRecord[];
  allAtoms: AtomRecord[];
  sequence: string;
  center: Vec3;
  radiusOfGyration: number;
  bounds: { min: Vec3; max: Vec3 };
}

export interface SuperpositionResult {
  rmsd: number;
  rotation: number[][]; // 3x3 rotation matrix R
  translation: Vec3; // translation vector t = cQ - R * cP
  transformedP: Vec3[];
  perResidueDeviations: number[];
  maxDeviation: number;
  medianDeviation: number;
  pairedCount: number;
}

export interface StructureSuperpositionResult extends SuperpositionResult {
  alignedResidues: Array<{
    pairIndex: number;
    resA: Residue;
    resB: Residue;
    deviation: number;
  }>;
  transformedStructureA: ParsedStructure;
}

export const AA_3TO1: Record<string, string> = {
  ALA: 'A', ARG: 'R', ASN: 'N', ASP: 'D', CYS: 'C',
  GLN: 'Q', GLU: 'E', GLY: 'G', HIS: 'H', ILE: 'I',
  LEU: 'L', LYS: 'K', MET: 'M', PHE: 'F', PRO: 'P',
  SER: 'S', THR: 'T', TRP: 'W', TYR: 'Y', VAL: 'V',
  SEC: 'U', PYL: 'O',
  // Modified / phosphorylated
  MSE: 'M', PTR: 'Y', SEP: 'S', TPO: 'T',
};

export function threeToOne(three: string): string {
  return AA_3TO1[three.toUpperCase()] || 'X';
}

export function dist3d(a: Vec3, b: Vec3): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/**
 * Parse standard PDB text format.
 */
export function parsePdb(pdbText: string, name = 'Structure'): ParsedStructure {
  const lines = pdbText.split(/\r?\n/);
  const allAtoms: AtomRecord[] = [];
  const caAtoms: AtomRecord[] = [];
  const chainMap = new Map<string, Map<number, Residue>>();

  for (const line of lines) {
    const record = line.substring(0, 6).trim();
    if (record !== 'ATOM' && record !== 'HETATM') continue;

    const serial = parseInt(line.substring(6, 11).trim(), 10) || allAtoms.length + 1;
    const atomName = line.substring(12, 16).trim();
    const resName = line.substring(17, 20).trim();
    const chain = line.substring(21, 22).trim() || 'A';
    const resSeq = parseInt(line.substring(22, 26).trim(), 10) || 0;
    const x = parseFloat(line.substring(30, 38).trim());
    const y = parseFloat(line.substring(38, 46).trim());
    const z = parseFloat(line.substring(46, 54).trim());
    const occupancy = parseFloat(line.substring(54, 60).trim()) || 1.0;
    const bFactor = parseFloat(line.substring(60, 66).trim()) || 0.0;
    const element = line.substring(76, 78).trim() || (atomName.length > 0 ? atomName[0]! : 'C');

    if (isNaN(x) || isNaN(y) || isNaN(z)) continue;

    const atom: AtomRecord = {
      record: record as 'ATOM' | 'HETATM',
      serial,
      name: atomName,
      resName,
      chain,
      resSeq,
      coord: { x, y, z },
      occupancy,
      bFactor,
      element,
    };

    allAtoms.push(atom);

    let chainResMap = chainMap.get(chain);
    if (!chainResMap) {
      chainResMap = new Map<number, Residue>();
      chainMap.set(chain, chainResMap);
    }

    let residue = chainResMap.get(resSeq);
    if (!residue) {
      residue = {
        resSeq,
        resName,
        oneLetter: threeToOne(resName),
        chain,
        atoms: [],
      };
      chainResMap.set(resSeq, residue);
    }

    residue.atoms.push(atom);

    if (atomName === 'CA') {
      atom.coord = { x, y, z };
      residue.caAtom = atom;
      caAtoms.push(atom);
    }
  }

  // Assign secondary structure heuristics based on Ca-Ca geometry (Levitt & Chothia)
  for (const [, resMap] of chainMap) {
    const resList = Array.from(resMap.values()).sort((a, b) => a.resSeq - b.resSeq);
    for (let i = 0; i < resList.length; i++) {
      const cur = resList[i]!;
      if (!cur.caAtom) {
        cur.secondary = 'C';
        continue;
      }

      // Check alpha helix: Ca(i) - Ca(i+3) ~ 5.0 - 5.5 A, Ca(i) - Ca(i+4) ~ 5.8 - 6.5 A
      const caPlus3 = resList[i + 3]?.caAtom;
      const caPlus4 = resList[i + 4]?.caAtom;
      const caPlus2 = resList[i + 2]?.caAtom;

      if (caPlus3 && caPlus4) {
        const d3 = dist3d(cur.caAtom.coord, caPlus3.coord);
        const d4 = dist3d(cur.caAtom.coord, caPlus4.coord);
        if (d3 >= 4.7 && d3 <= 5.8 && d4 >= 5.5 && d4 <= 6.8) {
          cur.secondary = 'H';
          continue;
        }
      }

      // Check beta sheet: extended strand Ca(i) - Ca(i+2) ~ 6.4 - 7.3 A
      if (caPlus2) {
        const d2 = dist3d(cur.caAtom.coord, caPlus2.coord);
        if (d2 >= 6.3 && d2 <= 7.4) {
          cur.secondary = 'E';
          continue;
        }
      }

      cur.secondary = 'C';
    }
  }

  // Compute centroid & radius of gyration
  let cx = 0, cy = 0, cz = 0;
  const count = allAtoms.length || 1;
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

  for (const a of allAtoms) {
    cx += a.coord.x;
    cy += a.coord.y;
    cz += a.coord.z;
    minX = Math.min(minX, a.coord.x);
    minY = Math.min(minY, a.coord.y);
    minZ = Math.min(minZ, a.coord.z);
    maxX = Math.max(maxX, a.coord.x);
    maxY = Math.max(maxY, a.coord.y);
    maxZ = Math.max(maxZ, a.coord.z);
  }

  const center: Vec3 = { x: cx / count, y: cy / count, z: cz / count };

  let rgSqSum = 0;
  for (const a of allAtoms) {
    const dx = a.coord.x - center.x;
    const dy = a.coord.y - center.y;
    const dz = a.coord.z - center.z;
    rgSqSum += dx * dx + dy * dy + dz * dz;
  }
  const radiusOfGyration = Math.sqrt(rgSqSum / count);

  const chains: Chain[] = [];
  let seq = '';
  for (const [id, resMap] of chainMap) {
    const residues = Array.from(resMap.values()).sort((a, b) => a.resSeq - b.resSeq);
    chains.push({ id, residues });
    for (const r of residues) seq += r.oneLetter;
  }

  return {
    name,
    chains,
    caAtoms,
    allAtoms,
    sequence: seq,
    center,
    radiusOfGyration: Number(radiusOfGyration.toFixed(2)),
    bounds: {
      min: { x: minX, y: minY, z: minZ },
      max: { x: maxX, y: maxY, z: maxZ },
    },
  };
}

/**
 * Jacobi eigenvalue algorithm for symmetric 3x3 matrix.
 * Unconditionally stable and converges to machine precision in <10 sweeps.
 */
function jacobiEigen3x3(matrix: number[][]): { values: number[]; vectors: number[][] } {
  // Deep copy matrix
  const A = matrix.map(r => [...r]);
  // Initialize eigenvector matrix as identity
  const V = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ];

  const maxSweeps = 50;
  const eps = 1e-15;

  for (let sweep = 0; sweep < maxSweeps; sweep++) {
    // Check off-diagonal norm
    const offDiag = Math.abs(A[0]![1]!) + Math.abs(A[0]![2]!) + Math.abs(A[1]![2]!);
    if (offDiag < eps) break;

    for (let p = 0; p < 2; p++) {
      for (let q = p + 1; q < 3; q++) {
        const apq = A[p]![q]!;
        if (Math.abs(apq) < eps) continue;

        const app = A[p]![p]!;
        const aqq = A[q]![q]!;
        const tau = (aqq - app) / (2 * apq);
        let t: number;
        if (tau >= 0) {
          t = 1 / (tau + Math.sqrt(1 + tau * tau));
        } else {
          t = -1 / (-tau + Math.sqrt(1 + tau * tau));
        }

        const c = 1 / Math.sqrt(1 + t * t);
        const s = t * c;
        const h = t * apq;

        A[p]![p] = app - h;
        A[q]![q] = aqq + h;
        A[p]![q] = 0;
        A[q]![p] = 0;

        for (let r = 0; r < 3; r++) {
          if (r !== p && r !== q) {
            const arp = A[r]![p]!;
            const arq = A[r]![q]!;
            A[r]![p] = c * arp - s * arq;
            A[p]![r] = A[r]![p]!;
            A[r]![q] = s * arp + c * arq;
            A[q]![r] = A[r]![q]!;
          }
        }

        // Update eigenvectors
        for (let r = 0; r < 3; r++) {
          const vrp = V[r]![p]!;
          const vrq = V[r]![q]!;
          V[r]![p] = c * vrp - s * vrq;
          V[r]![q] = s * vrp + c * vrq;
        }
      }
    }
  }

  const values = [A[0]![0]!, A[1]![1]!, A[2]![2]!];
  return { values, vectors: V };
}

/**
 * 3x3 Determinant.
 */
function det3x3(M: number[][]): number {
  return (
    M[0]![0]! * (M[1]![1]! * M[2]![2]! - M[1]![2]! * M[2]![1]!) -
    M[0]![1]! * (M[1]![0]! * M[2]![2]! - M[1]![2]! * M[2]![0]!) +
    M[0]![2]! * (M[1]![0]! * M[2]![1]! - M[1]![1]! * M[2]![0]!)
  );
}

/**
 * 3x3 Matrix multiplication A * B.
 */
function matMul3x3(A: number[][], B: number[][]): number[][] {
  const C = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      let sum = 0;
      for (let k = 0; k < 3; k++) {
        sum += A[i]![k]! * B[k]![j]!;
      }
      C[i]![j] = sum;
    }
  }
  return C;
}

/**
 * 3x3 Transpose.
 */
function transpose3x3(A: number[][]): number[][] {
  return [
    [A[0]![0]!, A[1]![0]!, A[2]![0]!],
    [A[0]![1]!, A[1]![1]!, A[2]![1]!],
    [A[0]![2]!, A[1]![2]!, A[2]![2]!],
  ];
}

/**
 * Kabsch Algorithm (1976) for optimal rotation matrix and minimal RMSD between paired 3D points.
 * P is transformed to fit Q: Q ≈ R * P + t.
 */
export function kabschSuperposition(coordsP: Vec3[], coordsQ: Vec3[]): SuperpositionResult {
  const n = coordsP.length;
  if (n !== coordsQ.length) {
    throw new Error(`Point count mismatch: P has ${n}, Q has ${coordsQ.length}`);
  }
  if (n < 3) {
    throw new Error('At least 3 paired coordinates are required for 3D superposition');
  }

  // 1. Centroids
  let cPx = 0, cPy = 0, cPz = 0;
  let cQx = 0, cQy = 0, cQz = 0;
  for (let i = 0; i < n; i++) {
    cPx += coordsP[i]!.x; cPy += coordsP[i]!.y; cPz += coordsP[i]!.z;
    cQx += coordsQ[i]!.x; cQy += coordsQ[i]!.y; cQz += coordsQ[i]!.z;
  }
  const cP: Vec3 = { x: cPx / n, y: cPy / n, z: cPz / n };
  const cQ: Vec3 = { x: cQx / n, y: cQy / n, z: cQz / n };

  // 2. Centered coordinates and 3x3 cross-covariance matrix H = P_centered^T * Q_centered
  // H_jk = sum_i (p_i,j - cP_j) * (q_i,k - cQ_k)
  let h00 = 0, h01 = 0, h02 = 0;
  let h10 = 0, h11 = 0, h12 = 0;
  let h20 = 0, h21 = 0, h22 = 0;

  for (let i = 0; i < n; i++) {
    const px = coordsP[i]!.x - cP.x;
    const py = coordsP[i]!.y - cP.y;
    const pz = coordsP[i]!.z - cP.z;

    const qx = coordsQ[i]!.x - cQ.x;
    const qy = coordsQ[i]!.y - cQ.y;
    const qz = coordsQ[i]!.z - cQ.z;

    h00 += px * qx; h01 += px * qy; h02 += px * qz;
    h10 += py * qx; h11 += py * qy; h12 += py * qz;
    h20 += pz * qx; h21 += pz * qy; h22 += pz * qz;
  }

  const H = [
    [h00, h01, h02],
    [h10, h11, h12],
    [h20, h21, h22],
  ];

  // 3. SVD of H = U * Sigma * V^T
  // Compute S = H^T * H (3x3 symmetric positive semi-definite)
  const Ht = transpose3x3(H);
  const S = matMul3x3(Ht, H);
  const { values: eigVals, vectors: eigVecs } = jacobiEigen3x3(S);

  // Sort eigenvalues & eigenvectors in descending order
  const order = [0, 1, 2].sort((a, b) => eigVals[b]! - eigVals[a]!);
  const V = [
    [eigVecs[0]![order[0]!]!, eigVecs[0]![order[1]!]!, eigVecs[0]![order[2]!]!],
    [eigVecs[1]![order[0]!]!, eigVecs[1]![order[1]!]!, eigVecs[1]![order[2]!]!],
    [eigVecs[2]![order[0]!]!, eigVecs[2]![order[1]!]!, eigVecs[2]![order[2]!]!],
  ];

  const sig0 = Math.sqrt(Math.max(0, eigVals[order[0]!]!));
  const sig1 = Math.sqrt(Math.max(0, eigVals[order[1]!]!));
  const sig2 = Math.sqrt(Math.max(0, eigVals[order[2]!]!));

  // Compute U columns: u_k = H * v_k / sig_k
  function multHv(v: [number, number, number]): [number, number, number] {
    return [
      H[0]![0]! * v[0] + H[0]![1]! * v[1] + H[0]![2]! * v[2],
      H[1]![0]! * v[0] + H[1]![1]! * v[1] + H[1]![2]! * v[2],
      H[2]![0]! * v[0] + H[2]![1]! * v[1] + H[2]![2]! * v[2],
    ];
  }

  function cross(a: [number, number, number], b: [number, number, number]): [number, number, number] {
    return [
      a[1] * b[2] - a[2] * b[1],
      a[2] * b[0] - a[0] * b[2],
      a[0] * b[1] - a[1] * b[0],
    ];
  }

  function norm(v: [number, number, number]): [number, number, number] {
    const l = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]) || 1;
    return [v[0] / l, v[1] / l, v[2] / l];
  }

  const v0: [number, number, number] = [V[0]![0]!, V[1]![0]!, V[2]![0]!];
  const v1: [number, number, number] = [V[0]![1]!, V[1]![1]!, V[2]![1]!];
  const v2: [number, number, number] = [V[0]![2]!, V[1]![2]!, V[2]![2]!];

  let u0 = sig0 > 1e-12 ? norm(multHv(v0)) : norm(v0);
  let u1 = sig1 > 1e-12 ? norm(multHv(v1)) : norm(v1);
  let u2 = sig2 > 1e-12 ? norm(multHv(v2)) : norm(cross(u0, u1));

  // Ensure right-handed orthonormal basis for U
  if (det3x3([[u0[0], u1[0], u2[0]], [u0[1], u1[1], u2[1]], [u0[2], u1[2], u2[2]]]) < 0) {
    u2 = [-u2[0], -u2[1], -u2[2]];
  }

  const U = [
    [u0[0], u1[0], u2[0]],
    [u0[1], u1[1], u2[1]],
    [u0[2], u1[2], u2[2]],
  ];

  // Check reflection: d = sign(det(V * U^T))
  const Ut = transpose3x3(U);
  let R = matMul3x3(V, Ut);
  const detR = det3x3(R);

  if (detR < 0) {
    // Negate the last column of V to ensure proper right-handed rotation SO(3)
    const V_corrected = [
      [V[0]![0]!, V[0]![1]!, -V[0]![2]!],
      [V[1]![0]!, V[1]![1]!, -V[1]![2]!],
      [V[2]![0]!, V[2]![1]!, -V[2]![2]!],
    ];
    R = matMul3x3(V_corrected, Ut);
  }

  // Translation vector: t = cQ - R * cP
  const tx = cQ.x - (R[0]![0]! * cP.x + R[0]![1]! * cP.y + R[0]![2]! * cP.z);
  const ty = cQ.y - (R[1]![0]! * cP.x + R[1]![1]! * cP.y + R[1]![2]! * cP.z);
  const tz = cQ.z - (R[2]![0]! * cP.x + R[2]![1]! * cP.y + R[2]![2]! * cP.z);
  const translation: Vec3 = { x: tx, y: ty, z: tz };

  // Transform coordinates P: p' = R * p + t
  const transformedP: Vec3[] = [];
  const perResidueDeviations: number[] = [];
  let sumSqDiff = 0;

  for (let i = 0; i < n; i++) {
    const p = coordsP[i]!;
    const q = coordsQ[i]!;

    const xPrime = R[0]![0]! * p.x + R[0]![1]! * p.y + R[0]![2]! * p.z + tx;
    const yPrime = R[1]![0]! * p.x + R[1]![1]! * p.y + R[1]![2]! * p.z + ty;
    const zPrime = R[2]![0]! * p.x + R[2]![1]! * p.y + R[2]![2]! * p.z + tz;

    const transformed: Vec3 = { x: xPrime, y: yPrime, z: zPrime };
    transformedP.push(transformed);

    const dev = dist3d(transformed, q);
    perResidueDeviations.push(Number(dev.toFixed(3)));
    sumSqDiff += dev * dev;
  }

  const rmsd = Math.sqrt(sumSqDiff / n);
  const sortedDevs = [...perResidueDeviations].sort((a, b) => a - b);
  const maxDeviation = sortedDevs[sortedDevs.length - 1] || 0;
  const medianDeviation = sortedDevs[Math.floor(sortedDevs.length / 2)] || 0;

  return {
    rmsd: Number(rmsd.toFixed(3)),
    rotation: R.map(r => r.map(v => Number(v.toFixed(6)))),
    translation: {
      x: Number(translation.x.toFixed(3)),
      y: Number(translation.y.toFixed(3)),
      z: Number(translation.z.toFixed(3)),
    },
    transformedP,
    perResidueDeviations,
    maxDeviation,
    medianDeviation,
    pairedCount: n,
  };
}

/**
 * Superimpose Structure A onto Structure B using Ca atoms.
 * Pairs corresponding residues by residue number or sequence index.
 */
export function superimposeStructures(
  structA: ParsedStructure,
  structB: ParsedStructure
): StructureSuperpositionResult {
  // Find paired Ca atoms
  const pairedResA: Residue[] = [];
  const pairedResB: Residue[] = [];
  const coordsA: Vec3[] = [];
  const coordsB: Vec3[] = [];

  // Pair by sequential index or residue seq number
  const caListA = structA.chains.flatMap(c => c.residues).filter(r => !!r.caAtom);
  const caListB = structB.chains.flatMap(c => c.residues).filter(r => !!r.caAtom);

  const minLen = Math.min(caListA.length, caListB.length);
  for (let i = 0; i < minLen; i++) {
    const ra = caListA[i]!;
    const rb = caListB[i]!;
    pairedResA.push(ra);
    pairedResB.push(rb);
    coordsA.push(ra.caAtom!.coord);
    coordsB.push(rb.caAtom!.coord);
  }

  const baseResult = kabschSuperposition(coordsA, coordsB);

  // Apply rotation and translation to ALL atoms of structA
  const R = baseResult.rotation;
  const t = baseResult.translation;

  function transformCoord(p: Vec3): Vec3 {
    return {
      x: R[0]![0]! * p.x + R[0]![1]! * p.y + R[0]![2]! * p.z + t.x,
      y: R[1]![0]! * p.x + R[1]![1]! * p.y + R[1]![2]! * p.z + t.y,
      z: R[2]![0]! * p.x + R[2]![1]! * p.y + R[2]![2]! * p.z + t.z,
    };
  }

  const transformedChains: Chain[] = structA.chains.map(ch => ({
    id: ch.id,
    residues: ch.residues.map(res => ({
      ...res,
      caAtom: res.caAtom ? { ...res.caAtom, coord: transformCoord(res.caAtom.coord) } : undefined,
      atoms: res.atoms.map(atom => ({ ...atom, coord: transformCoord(atom.coord) })),
    })),
  }));

  const transformedAllAtoms = structA.allAtoms.map(atom => ({
    ...atom,
    coord: transformCoord(atom.coord),
  }));

  const transformedCaAtoms = structA.caAtoms.map(atom => ({
    ...atom,
    coord: transformCoord(atom.coord),
  }));

  const transformedStructureA: ParsedStructure = {
    ...structA,
    name: `${structA.name} (Aligned)`,
    chains: transformedChains,
    allAtoms: transformedAllAtoms,
    caAtoms: transformedCaAtoms,
    center: transformCoord(structA.center),
  };

  const alignedResidues = pairedResA.map((resA, idx) => ({
    pairIndex: idx + 1,
    resA,
    resB: pairedResB[idx]!,
    deviation: baseResult.perResidueDeviations[idx] || 0,
  }));

  return {
    ...baseResult,
    alignedResidues,
    transformedStructureA,
  };
}

/**
 * Generate synthetic Trp-cage (1L2Y) miniprotein reference structure
 * and a modified conformation to test superposition and RMSD.
 */
export function getDemoTrpCagePdb(): { refPdb: string; targetPdb: string } {
  // Trp-cage NMR structure (1L2Y, 20 residues: NLYIQWLKDGGPSSGRPPPS)
  const TRP_CAGE_CA_COORDS: Array<[string, number, number, number, number]> = [
    ['ASN', 1, -8.76, 2.45, -3.12],
    ['LEU', 2, -6.21, 0.12, -1.54],
    ['TYR', 3, -3.15, -1.82, -2.48],
    ['ILE', 4, -0.45, -0.12, -4.12],
    ['GLN', 5, 1.25, 2.85, -2.65],
    ['TRP', 6, 0.18, 3.42, 0.88],
    ['LEU', 7, -2.45, 1.22, 2.45],
    ['LYS', 8, -1.12, -1.85, 3.85],
    ['ASP', 9, 2.15, -1.25, 2.65],
    ['GLY', 10, 3.45, 1.85, 3.12],
    ['GLY', 11, 4.82, 0.15, 0.85],
    ['PRO', 12, 3.25, -2.15, -0.85],
    ['SER', 13, 0.85, -3.85, 0.45],
    ['SER', 14, 2.45, -5.12, 2.85],
    ['GLY', 15, 5.12, -3.45, 3.85],
    ['ARG', 16, 6.25, -0.85, 2.15],
    ['PRO', 17, 5.85, 1.25, -0.45],
    ['PRO', 18, 4.12, 2.85, -2.15],
    ['PRO', 19, 1.85, 1.45, -4.12],
    ['SER', 20, -0.15, -0.45, -5.85],
  ];

  function formatPdbAtom(serial: number, atomName: string, resName: string, chain: string, resSeq: number, x: number, y: number, z: number): string {
    const sStr = serial.toString().padStart(5);
    const aStr = atomName.padEnd(4);
    const rStr = resName.padStart(3);
    const rsStr = resSeq.toString().padStart(4);
    const xStr = x.toFixed(3).padStart(8);
    const yStr = y.toFixed(3).padStart(8);
    const zStr = z.toFixed(3).padStart(8);
    return `ATOM  ${sStr} ${aStr} ${rStr} ${chain}${rsStr}    ${xStr}${yStr}${zStr}  1.00 20.00           C`;
  }

  const refLines = ['HEADER    TRP-CAGE MINIPROTEIN REF                   20-AUG-02   1L2Y'];
  TRP_CAGE_CA_COORDS.forEach(([resName, seq, x, y, z], i) => {
    refLines.push(formatPdbAtom(i + 1, 'CA', resName, 'A', seq, x, y, z));
  });
  refLines.push('END');

  // Rotated and slightly perturbed target structure (simulating NMR ensemble model 2)
  // Rotate around Y by 35 deg, translate by (12, -8, 15), and add slight conformational fluctuation
  const rad = (35 * Math.PI) / 180;
  const cosT = Math.cos(rad);
  const sinT = Math.sin(rad);

  const targetLines = ['HEADER    TRP-CAGE MINIPROTEIN MODEL 2               20-AUG-02   1L2Y'];
  TRP_CAGE_CA_COORDS.forEach(([resName, seq, x0, y0, z0], i) => {
    // Add small realistic conformational wobble (higher at flexible termini)
    const flex = i < 3 || i > 16 ? 0.8 : 0.25;
    const wobbleX = (Math.sin(i * 1.7) * flex);
    const wobbleY = (Math.cos(i * 2.1) * flex);
    const wobbleZ = (Math.sin(i * 0.9) * flex);

    const x = x0 + wobbleX;
    const y = y0 + wobbleY;
    const z = z0 + wobbleZ;

    // Apply rotation around Y + translation (12, -8, 15)
    const rotX = cosT * x + sinT * z + 12.0;
    const rotY = y - 8.0;
    const rotZ = -sinT * x + cosT * z + 15.0;

    targetLines.push(formatPdbAtom(i + 1, 'CA', resName, 'A', seq, rotX, rotY, rotZ));
  });
  targetLines.push('END');

  return {
    refPdb: refLines.join('\n'),
    targetPdb: targetLines.join('\n'),
  };
}
