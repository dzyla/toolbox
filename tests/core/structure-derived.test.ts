import { describe, it, expect } from 'vitest';
import { parseMmcif } from '@/core/structure/mmcif';
import { toFasta } from '@/core/structure/fasta';
import { computeInterfaces } from '@/core/structure/interfaces';
import { computeMetrics } from '@/core/structure/metrics';
import { writeMmcif, writePdb } from '@/core/structure/export';
import type { AtomTable, StructureModel } from '@/core/structure/model';
import { read } from './structure-helpers';

interface A { asym: string; seq: number; comp?: string; name?: string; el?: string; xyz: [number, number, number]; ins?: string }

/** Build a StructureModel directly from a list of atoms; chains are polymer unless seq is 0. */
function synth(atoms: A[], chainAsyms: string[], opts: { auth?: Record<string, string> } = {}): StructureModel {
  const n = atoms.length;
  const t: AtomTable = {
    modelNumber: 1, count: n, xyz: new Float32Array(3 * n), bFactor: new Float32Array(n).fill(10),
    occupancy: new Float32Array(n).fill(1), isHetatm: new Uint8Array(n), isHydrogen: new Uint8Array(n),
    atomName: [], element: [], compId: [], labelAsymId: [], labelSeqId: new Int32Array(n),
    authAsymId: [], authSeqId: new Int32Array(n), insCode: [], entityId: [],
  };
  atoms.forEach((a, i) => {
    t.xyz.set(a.xyz, 3 * i);
    const el = a.el ?? 'C';
    t.isHydrogen[i] = el === 'H' ? 1 : 0;
    t.atomName.push(a.name ?? (el === 'H' ? 'H' : 'CA')); t.element.push(el); t.compId.push(a.comp ?? 'ALA');
    t.labelAsymId.push(a.asym); t.labelSeqId[i] = a.seq; t.authAsymId.push(opts.auth?.[a.asym] ?? a.asym);
    t.authSeqId[i] = a.seq; t.insCode.push(a.ins ?? ''); t.entityId.push('1');
    if (a.seq === 0) t.isHetatm[i] = 1;
  });
  return {
    name: 'synth', format: 'mmcif', header: { organisms: [] },
    entities: [{ id: '1', kind: 'polymer', polymerType: 'protein', description: 'x', sequence: 'A', labelAsymIds: chainAsyms }],
    chains: chainAsyms.map((c) => ({
      labelAsymId: c, authAsymId: opts.auth?.[c] ?? c, entityId: '1',
      residues: [{ seqId: 1, compId: 'ALA', oneLetter: 'A', modelled: true }],
    })),
    ligands: [], models: [t], warnings: [],
  };
}

describe('toFasta', () => {
  const m = parseMmcif(read('3KZ5.cif'), '3KZ5');
  const seq = m.entities.find((e) => e.kind === 'polymer')!.sequence;

  it('entity record with chains and auth ids', () => {
    expect(toFasta(m, { kind: 'entity', entityId: '1' })).toBe(
      '>3KZ5_1 | Chains A, B, C [auth E, B, A] | Protein sopB\nGSHMSSRHQFAPGATVLYKGDKMVLNLDRSRVPTECIEKIEAILKELEKPAP\n',
    );
  });
  it('single-chain entity still says Chains', () => {
    const u = parseMmcif(read('1UBQ.cif'), '1UBQ');
    expect(toFasta(u, { kind: 'entity', entityId: '1' }).split('\n')[0]).toMatch(/^>1UBQ_1 \| Chains A \[auth A\] \| /);
  });
  it('modelled mode marks unmodelled residues with gap or drops them', () => {
    const chainC = m.chains.find((c) => c.labelAsymId === 'C')!;
    const expected = chainC.residues.map((r) => (r.modelled ? r.oneLetter : '-')).join('');
    expect(expected.startsWith('----SSRHQ')).toBe(true);
    expect(expected.endsWith('KELEKPA-')).toBe(true);
    expect(toFasta(m, { kind: 'chain', labelAsymId: 'C' }, { mode: 'modelled', gap: '-' })).toBe(
      `>3KZ5_1 | Chain C [auth A] | Protein sopB\n${expected}\n`,
    );
    const noGap = toFasta(m, { kind: 'chain', labelAsymId: 'C' }, { mode: 'modelled', gap: '' }).split('\n')[1]!;
    expect(noGap).toHaveLength(47);
    expect(toFasta(m, { kind: 'chain', labelAsymId: 'C' }).split('\n')[1]).toBe(seq);
  });
  it('range uses label seq numbering, inclusive', () => {
    const f = toFasta(m, { kind: 'range', labelAsymId: 'C', from: 5, to: 10 });
    expect(f.split('\n')[0]).toBe('>3KZ5_1 | Chain C [auth A] | Protein sopB | residues 5-10');
    expect(f.split('\n')[1]).toBe('SSRHQF');
  });
  it('entity scope in modelled mode uses the first chain and says so', () => {
    const f = toFasta(m, { kind: 'entity', entityId: '1' }, { mode: 'modelled', gap: '-' });
    expect(f.split('\n')[0]!.endsWith(' | modelled residues of chain A')).toBe(true);
    expect(f.split('\n')[1]).toBe(m.chains[0]!.residues.map((r) => (r.modelled ? r.oneLetter : '-')).join(''));
  });
  it("'all' gives one record per polymer entity", () => {
    const hb = parseMmcif(read('4HHB.cif.gz'), '4HHB');
    const f = toFasta(hb, { kind: 'all' });
    expect(f.split('\n').filter((l) => l.startsWith('>'))).toHaveLength(2);
    expect(f.endsWith('\n')).toBe(true);
    expect(toFasta(m, { kind: 'all' }, { mode: 'modelled', gap: '' }).split('\n')[1]).toHaveLength(m.chains[0]!.residues.filter((r) => r.modelled).length);
  });
  it('falls back to the model name and handles missing scopes and types', () => {
    const s = synth([{ asym: 'A', seq: 1, xyz: [0, 0, 0] }], ['A']);
    expect(toFasta(s, { kind: 'chain', labelAsymId: 'A' }).startsWith('>synth_1 | Chain A [auth A] | x')).toBe(true);
    s.entities[0]!.polymerType = 'dna'; s.entities[0]!.description = '';
    expect(toFasta(s, { kind: 'chain', labelAsymId: 'A' }).split('\n')[0]).toBe('>synth_1 | Chain A [auth A] | DNA');
    expect(toFasta(s, { kind: 'chain', labelAsymId: 'Z' })).toBe('');
    expect(toFasta(s, { kind: 'entity', entityId: '9' })).toBe('');
    expect(toFasta(s, { kind: 'entity', entityId: '1' }, { mode: 'modelled', gap: '-' })).toContain('modelled residues of chain A');
    s.chains = [];
    expect(toFasta(s, { kind: 'entity', entityId: '1' }, { mode: 'modelled', gap: '-' })).toBe('');
  });
});

describe('computeInterfaces', () => {
  it('finds exactly the residues within the cutoff on a synthetic pair', () => {
    const atoms: A[] = [
      { asym: 'A', seq: 1, xyz: [-50, 0, 0] },
      { asym: 'A', seq: 2, xyz: [0, 0, 0] },
      { asym: 'A', seq: 3, xyz: [0, 3, 0] },
      { asym: 'A', seq: 4, xyz: [20, 0, 0] },
      { asym: 'B', seq: 7, xyz: [0, 0, 4.4] },
      { asym: 'B', seq: 7, xyz: [0, 3, 4.0], name: 'CB' },
      { asym: 'B', seq: 9, xyz: [20, 0, 4.6] },
    ];
    const m = synth(atoms, ['A', 'B']);
    const res = computeInterfaces(m, 0);
    expect(res).toHaveLength(1);
    expect(res[0]!.a.labelAsymId).toBe('A');
    expect(res[0]!.a.residues.map((r) => r.authSeqId)).toEqual([2, 3]);
    expect(res[0]!.b.labelAsymId).toBe('B');
    expect(res[0]!.b.residues.map((r) => r.authSeqId)).toEqual([7]);
    expect(computeInterfaces(m, 0, 4.7)[0]!.a.residues.map((r) => r.authSeqId)).toEqual([2, 3, 4]);
    expect(computeInterfaces(m, 5)).toEqual([]);
  });
  it('ignores hydrogens, ligands and unrelated chains', () => {
    const m = synth([
      { asym: 'A', seq: 1, xyz: [0, 0, 0] },
      { asym: 'B', seq: 1, el: 'H', xyz: [0, 0, 2] },
      { asym: 'L', seq: 0, comp: 'HEM', xyz: [0, 0, 3] },
      { asym: 'C', seq: 1, xyz: [100, 0, 0] },
    ], ['A', 'B', 'C']);
    expect(computeInterfaces(m, 0)).toEqual([]);
    expect(computeInterfaces(synth([], []), 0)).toEqual([]);
  });
  it('4HHB: A-B contact, no self pairs, no waters or HEM', () => {
    const hb = parseMmcif(read('4HHB.cif.gz'), '4HHB');
    const res = computeInterfaces(hb, 0);
    expect(res.length).toBeGreaterThan(0);
    expect(res.some((p) => p.a.labelAsymId === 'A' && p.b.labelAsymId === 'B')).toBe(true);
    const polymer = new Set(hb.chains.map((c) => c.labelAsymId));
    const order = new Map(hb.chains.map((c, i) => [c.labelAsymId, i]));
    for (const p of res) {
      expect(p.a.labelAsymId).not.toBe(p.b.labelAsymId);
      expect(polymer.has(p.a.labelAsymId) && polymer.has(p.b.labelAsymId)).toBe(true);
      expect(order.get(p.a.labelAsymId)!).toBeLessThan(order.get(p.b.labelAsymId)!);
      expect(p.a.residues.length).toBeGreaterThan(0);
    }
  });
  it('keeps the insertion code of interface residues', () => {
    const base = parseMmcif(read('insertion.cif'), 'ins');
    const t = base.models[0]!;
    // Duplicate the chain as B shifted 3 A in y so every residue touches.
    const n = t.count;
    const big: AtomTable = {
      ...t, count: 2 * n, xyz: new Float32Array(6 * n), bFactor: new Float32Array(2 * n), occupancy: new Float32Array(2 * n),
      isHetatm: new Uint8Array(2 * n), isHydrogen: new Uint8Array(2 * n),
      atomName: [...t.atomName, ...t.atomName], element: [...t.element, ...t.element], compId: [...t.compId, ...t.compId],
      labelAsymId: [...t.labelAsymId, ...t.labelAsymId.map(() => 'B')], labelSeqId: new Int32Array(2 * n),
      authAsymId: [...t.authAsymId, ...t.authAsymId.map(() => 'B')], authSeqId: new Int32Array(2 * n),
      insCode: [...t.insCode, ...t.insCode], entityId: [...t.entityId, ...t.entityId],
    };
    big.xyz.set(t.xyz); big.labelSeqId.set(t.labelSeqId); big.labelSeqId.set(t.labelSeqId, n);
    big.authSeqId.set(t.authSeqId); big.authSeqId.set(t.authSeqId, n);
    for (let i = 0; i < n; i++) {
      big.xyz[3 * (n + i)] = t.xyz[3 * i]!; big.xyz[3 * (n + i) + 1] = t.xyz[3 * i + 1]! + 3; big.xyz[3 * (n + i) + 2] = t.xyz[3 * i + 2]!;
    }
    const m: StructureModel = { ...base, chains: [base.chains[0]!, { ...base.chains[0]!, labelAsymId: 'B', authAsymId: 'B' }], models: [big] };
    const res = computeInterfaces(m, 0);
    expect(res[0]!.a.residues.map((r) => `${r.authSeqId}${r.insCode}`)).toEqual(['26', '27', '27A', '27B', '28']);
  });
});

describe('computeMetrics', () => {
  const ball: A[] = [
    { asym: 'A', seq: 1, xyz: [1, 0, 0] }, { asym: 'A', seq: 1, xyz: [-1, 0, 0] },
    { asym: 'A', seq: 1, xyz: [0, 1, 0] }, { asym: 'A', seq: 1, xyz: [0, -1, 0] },
    { asym: 'A', seq: 1, xyz: [0, 0, 1] }, { asym: 'A', seq: 1, xyz: [0, 0, -1] },
  ];
  it('Rg, centre and bounds of an octahedron; water and H are ignored', () => {
    const m = synth(ball, ['A']);
    const a = computeMetrics(m, 0);
    expect(a.radiusOfGyration).toBeCloseTo(1, 5);
    expect(a.center).toEqual([0, 0, 0]);
    expect(a.bounds).toEqual({ min: [-1, -1, -1], max: [1, 1, 1] });
    const m2 = synth([...ball, { asym: 'W', seq: 0, comp: 'HOH', el: 'O', xyz: [50, 0, 0] }, { asym: 'A', seq: 1, el: 'H', xyz: [9, 9, 9] }], ['A']);
    const b = computeMetrics(m2, 0);
    expect(b.radiusOfGyration).toBeCloseTo(1, 5);
    expect(b.bounds).toEqual(a.bounds);
    expect(b.atomCount).toBe(8);
    expect(b.heavyAtomCount).toBe(7);
    expect(b.residueCount).toBe(1);
  });
  it('degenerate inputs', () => {
    const m = synth([{ asym: 'A', seq: 1, el: 'H', xyz: [1, 1, 1] }], ['A']);
    expect(computeMetrics(m, 0).radiusOfGyration).toBe(0);
    expect(computeMetrics(m, 3).atomCount).toBe(0);
  });
  it('1UBQ counts', () => {
    const text = read('1UBQ.cif');
    const m = parseMmcif(text, '1UBQ');
    const rows = text.split('\n').filter((l) => /^(ATOM|HETATM)\s/.test(l));
    const model1 = rows.filter((l) => l.trim().split(/\s+/).at(-1) === '1').length;
    const r = computeMetrics(m, 0);
    expect(r.atomCount).toBe(m.models[0]!.count);
    expect(r.atomCount).toBeLessThanOrEqual(model1);
    expect(r.atomCount).toBeGreaterThan(model1 - 100);
    expect(r.residueCount).toBe(76);
    expect(r.radiusOfGyration).toBeGreaterThan(10);
    expect(r.radiusOfGyration).toBeLessThan(15);
  });
});

describe('export', () => {
  it('writeMmcif round-trips a chain', () => {
    const m = parseMmcif(read('3KZ5.cif'), '3KZ5');
    const back = parseMmcif(writeMmcif(m, 0, ['B']), 'B');
    expect(back.chains).toHaveLength(1);
    expect(back.chains[0]!.labelAsymId).toBe('B');
    const orig = m.chains.find((c) => c.labelAsymId === 'B')!;
    const modelled = (c: typeof orig) => c.residues.filter((r) => r.modelled).map((r) => `${r.compId}${r.auth?.seqId}`);
    expect(modelled(back.chains[0]!)).toEqual(modelled(orig));
    expect(back.models[0]!.count).toBe(m.models[0]!.labelAsymId.filter((a) => a === 'B').length);
    expect(back.models[0]!.xyz[0]).toBeCloseTo(m.models[0]!.xyz[3 * m.models[0]!.labelAsymId.indexOf('B')]!, 2);
    expect(writeMmcif(m, 9, ['B'])).toContain('_atom_site.id');
  });
  it('quotes awkward atom names', () => {
    const m = synth([{ asym: 'A', seq: 1, name: "O5'", xyz: [0, 0, 0] }, { asym: 'A', seq: 1, name: 'X"\'', xyz: [1, 0, 0] }], ['A']);
    const text = writeMmcif(m, 0, ['A']);
    expect(text).toContain('"O5\'"');
    expect(parseMmcif(text).models[0]!.atomName[0]).toBe("O5'");
  });
  it('writePdb emits fixed-column records, TER and END', () => {
    const m = parseMmcif(read('1UBQ.cif'), '1UBQ');
    const { text, warnings } = writePdb(m, 0, ['A']);
    expect(warnings).toEqual([]);
    const lines = text.trimEnd().split('\n');
    expect(lines[0]!.slice(0, 27)).toBe('ATOM      1  N   MET A   1 ');
    expect(lines[0]!.slice(30, 38)).toBe(m.models[0]!.xyz[0]!.toFixed(3).padStart(8));
    expect(lines[0]!.slice(76, 78)).toBe(' N');
    expect(lines.some((l) => l.startsWith('TER'))).toBe(true);
    expect(lines.at(-1)).toBe('END');
    expect(writePdb(m, 4, ['A']).text).toBe('END\n');
  });
  it('writePdb handles ligands and warns about overflows', () => {
    const m = parseMmcif(read('4HHB.cif.gz'), '4HHB');
    const out = writePdb(m, 0, m.chains.map((c) => c.labelAsymId).concat(m.ligands.map((l) => l.labelAsymId)));
    expect(out.text).toContain('HETATM');
    const ter = out.text.split('\n').findIndex((l) => l.startsWith('TER'));
    expect(ter).toBeGreaterThan(0);
    const long = synth([{ asym: 'A', seq: 1, xyz: [0, 0, 0] }], ['A'], { auth: { A: 'AA' } });
    expect(writePdb(long, 0, ['A']).warnings).toEqual(['Chain IDs longer than one character (e.g. AA) are truncated in PDB format']);
    const names = Array.from({ length: 63 }, (_, i) => `C${i}`);
    const many = synth(names.map((c) => ({ asym: c, seq: 1, xyz: [0, 0, 0] as [number, number, number] })), names);
    expect(writePdb(many, 0, names).warnings).toContain('More than 62 chains: PDB format cannot hold them all');
    const heavy = synth(Array.from({ length: 100000 }, () => ({ asym: 'A', seq: 1, xyz: [0, 0, 0] as [number, number, number] })), ['A']);
    expect(writePdb(heavy, 0, ['A']).warnings).toContain('More than 99,999 atoms: serial numbers overflow in PDB format');
  });
});
