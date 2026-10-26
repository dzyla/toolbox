import { describe, it, expect } from 'vitest';
import { parseMmcif } from '@/core/structure/mmcif';
import { parsePdbToModel } from '@/core/structure/pdb';
import { detectFormat, parseStructure } from '@/core/structure/detect';
import * as api from '@/core/structure';
import type { StructureModel } from '@/core/structure/model';
import { read } from './structure-helpers';

const UBQ = 'MQIFVKTLTGKTITLEVEPSDTIENVKAKIQDKEGIPPDQQRLIFAGKQLEDGRTLSDYNIQKESTLHLVLRLRGG';

/** Format-neutral summary compared across readers (keyed by auth chain id). */
function summary(m: StructureModel) {
  const entOf = new Map(m.entities.map((e) => [e.id, e]));
  const polymers = m.entities.filter((e) => e.kind === 'polymer');
  return {
    sequences: polymers.map((e) => e.sequence).sort(),
    authChainsPerEntity: polymers.map((e) => [e.sequence, m.chains.filter((c) => c.entityId === e.id).map((c) => c.authAsymId).sort()]).sort(),
    unmodelled: Object.fromEntries(m.chains.map((c) => [c.authAsymId, c.residues.filter((r) => !r.modelled).map((r) => r.seqId)])),
    chainSeq: Object.fromEntries(m.chains.map((c) => [c.authAsymId, c.residues.map((r) => r.oneLetter).join('')])),
    firstAuth: Object.fromEntries(m.chains.map((c) => [c.authAsymId, c.residues.find((r) => r.modelled)?.auth])),
    ligands: m.ligands.map((l) => l.compId),
    atoms: m.models[0]!.count,
    entityOf: entOf.size,
  };
}

describe('parsePdbToModel parity with mmCIF', () => {
  for (const id of ['1UBQ', '3KZ5']) {
    it(`${id}: same sequences, chains, gaps, ligands and atom count`, () => {
      const p = parsePdbToModel(read(`${id}.pdb`), id);
      const c = parseMmcif(read(`${id}.cif`), id);
      const sp = summary(p);
      const sc = summary(c);
      expect(sp.sequences).toEqual(sc.sequences);
      expect(sp.authChainsPerEntity).toEqual(sc.authChainsPerEntity);
      expect(sp.unmodelled).toEqual(sc.unmodelled);
      expect(sp.chainSeq).toEqual(sc.chainSeq);
      expect(sp.firstAuth).toEqual(sc.firstAuth);
      expect(sp.ligands).toEqual(sc.ligands);
      expect(sp.atoms).toBe(sc.atoms);
      expect(p.format).toBe('pdb');
    });
  }

  it('1UBQ.pdb: header, sequence, atoms', () => {
    const m = parsePdbToModel(read('1UBQ.pdb'), '1UBQ');
    expect(m.header).toMatchObject({
      id: '1UBQ', method: 'X-RAY DIFFRACTION', resolution: 1.8, organisms: ['Homo sapiens'], depositionDate: '1987-01-02',
    });
    expect(m.header.title).toMatch(/UBIQUITIN/);
    expect(m.entities).toHaveLength(1);
    expect(m.entities[0]).toMatchObject({ id: '1', kind: 'polymer', polymerType: 'protein', description: 'UBIQUITIN', sequence: UBQ, labelAsymIds: ['A'] });
    expect(m.chains).toHaveLength(1);
    expect(m.chains[0]).toMatchObject({ labelAsymId: 'A', authAsymId: 'A', entityId: '1' });
    expect(m.chains[0]!.residues.map((r) => r.seqId)).toEqual(Array.from({ length: 76 }, (_, i) => i + 1));
    const t = m.models[0]!;
    expect(t.atomName[0]).toBe('N');
    expect(t.labelSeqId[0]).toBe(1);
    expect(t.entityId[0]).toBe('1');
    expect(t.xyz[0]).toBeCloseTo(27.34, 2);
    expect(t.occupancy[0]).toBe(1);
    expect(m.warnings).toEqual([]);
    const water = t.compId.indexOf('HOH');
    expect(water).toBeGreaterThan(0);
    expect(t.isHetatm[water]).toBe(1);
    expect(t.labelSeqId[water]).toBe(0);
    expect(t.entityId[water]).toBe('');
    expect(m.ligands).toEqual([]);
  });

  it('3KZ5.pdb: COMPND entity, chains in COMPND order, ligand ACT', () => {
    const m = parsePdbToModel(read('3KZ5.pdb'));
    expect(m.entities).toHaveLength(1);
    expect(m.entities[0]).toMatchObject({ id: '1', description: 'PROTEIN SOPB' });
    expect(m.entities[0]!.labelAsymIds).toEqual(['E', 'B', 'A']);
    expect(m.chains.map((c) => c.authAsymId)).toEqual(['E', 'B', 'A']);
    expect(m.header.depositionDate).toBe('2009-12-07');
    expect(m.header.resolution).toBe(1.58);
    expect(m.header.organisms).toEqual(['Escherichia coli']);
    expect(m.ligands).toHaveLength(1);
    expect(m.ligands[0]).toMatchObject({ compId: 'ACT', labelAsymId: 'B', authAsymId: 'B', authSeqId: 28, entityId: '' });
    expect(m.ligands[0]!.name).toMatch(/ACETATE/);
    expect(m.ligands[0]!.atomCount).toBe(4);
  });
});

const rec = (name: string, serial: number, atom: string, alt: string, res: string, chain: string, seq: number, ins: string, x: number, el: string) =>
  `${name.padEnd(6)}${String(serial).padStart(5)} ${atom.padEnd(4)}${alt}${res.padStart(3)} ${chain}${String(seq).padStart(4)}${ins}   ${x.toFixed(3).padStart(8)}${'1.000'.padStart(8)}${'2.000'.padStart(8)}${'1.00'.padStart(6)}${'10.00'.padStart(6)}          ${el.padStart(2)}`;
const seqres = (n: number, chain: string, total: number, comps: string) => `SEQRES ${String(n).padStart(3)} ${chain} ${String(total).padStart(4)}  ${comps}`;

describe('parsePdbToModel edge cases', () => {
  it('SEQRES alignment with gaps, MODRES parent, alt locs, insertion codes, two models', () => {
    const text = [
      'HEADER    TEST                                    05-MAR-99   9ABC',
      seqres(1, 'A', 6, 'GLY MSE ALA SER LYS GLY'),
      'MODRES 9ABC MSE A    2  MET  SELENOMETHIONINE',
      'MODEL        1',
      rec('HETATM', 1, ' CA', ' ', 'MSE', 'A', 9, ' ', 1, 'C'),
      rec('ATOM', 2, ' N', ' ', 'ALA', 'A', 10, ' ', 2, 'N'),
      rec('ATOM', 3, ' CA', ' ', 'ALA', 'A', 10, ' ', 3, 'C'),
      rec('ATOM', 4, ' CB', 'A', 'ALA', 'A', 10, ' ', 4, 'C'),
      rec('ATOM', 5, ' CB', 'B', 'ALA', 'A', 10, ' ', 5, 'C'),
      rec('ATOM', 6, ' CA', ' ', 'SER', 'A', 11, ' ', 6, 'C'),
      rec('ATOM', 7, ' CA', ' ', 'LYS', 'A', 11, 'A', 7, 'C'),
      'ENDMDL',
      'MODEL        2',
      rec('ATOM', 8, ' N', ' ', 'ALA', 'A', 10, ' ', 11, 'N'),
      'ENDMDL',
      'END',
    ].join('\n');
    const m = parsePdbToModel(text);
    // Alignment is in order against SEQRES (GLY MSE ALA SER LYS GLY) with names matching.
    const c = m.chains[0]!;
    expect(c.residues.map((r) => [r.seqId, r.compId, r.modelled])).toEqual([
      [1, 'GLY', false], [2, 'MSE', true], [3, 'ALA', true], [4, 'SER', true], [5, 'LYS', true], [6, 'GLY', false],
    ]);
    expect(c.residues[1]).toMatchObject({ oneLetter: 'M', parentCompId: 'MET', auth: { seqId: 9, insCode: '' } });
    expect(c.residues[4]!.auth).toEqual({ seqId: 11, insCode: 'A' });
    expect(m.entities[0]!.sequence).toBe('GMASKG');
    expect(m.models.map((t) => t.modelNumber)).toEqual([1, 2]);
    // alt loc: first non-blank id (A) kept, B dropped.
    const t = m.models[0]!;
    expect(t.count).toBe(6);
    expect(Array.from(t.xyz.filter((_, i) => i % 3 === 0))).toEqual([1, 2, 3, 4, 6, 7]);
    expect(Array.from(t.labelSeqId)).toEqual([2, 3, 3, 3, 4, 5]);
    expect(m.models[1]!.count).toBe(1);
    expect(m.models[1]!.labelSeqId[0]).toBe(3);
    expect(m.header.depositionDate).toBe('1999-03-05');
    expect(m.warnings).toEqual([]);
    expect(m.ligands).toEqual([]);
  });

  it('name mismatch against SEQRES falls back to the atom-derived sequence with a warning', () => {
    const text = [
      seqres(1, 'A', 3, 'GLY GLY GLY'),
      rec('ATOM', 1, ' CA', ' ', 'ALA', 'A', 1, ' ', 1, 'C'),
      rec('ATOM', 2, ' CA', ' ', 'SER', 'A', 2, ' ', 2, 'C'),
    ].join('\n');
    const m = parsePdbToModel(text);
    expect(m.chains[0]!.residues.map((r) => r.oneLetter).join('')).toBe('AS');
    expect(m.chains[0]!.residues.every((r) => r.modelled)).toBe(true);
    expect(m.entities[0]!.sequence).toBe('AS');
    expect(m.warnings).toHaveLength(1);
    expect(m.warnings[0]).toMatch(/SEQRES.*chain A/);
  });

  it('no SEQRES/COMPND: one entity per distinct sequence, ligands and waters without entity', () => {
    const text = [
      rec('ATOM', 1, ' CA', ' ', 'ALA', 'A', 1, ' ', 1, 'C'),
      rec('ATOM', 2, ' CA', ' ', 'SER', 'A', 2, ' ', 2, 'C'),
      rec('ATOM', 3, ' CA', ' ', 'ALA', 'B', 1, ' ', 3, 'C'),
      rec('ATOM', 4, ' CA', ' ', 'SER', 'B', 2, ' ', 4, 'C'),
      rec('ATOM', 5, ' CA', ' ', 'GLY', 'C', 1, ' ', 5, 'C'),
      rec('HETATM', 6, ' C1', ' ', 'GOL', 'A', 101, ' ', 6, 'C'),
      rec('HETATM', 7, ' O', ' ', 'HOH', 'A', 102, ' ', 7, 'O'),
    ].join('\n');
    const m = parsePdbToModel(text);
    expect(m.entities.map((e) => [e.id, e.sequence, e.labelAsymIds])).toEqual([['1', 'AS', ['A', 'B']], ['2', 'G', ['C']]]);
    expect(m.ligands).toHaveLength(1);
    expect(m.ligands[0]).toMatchObject({ compId: 'GOL', name: 'GOL', entityId: '', authSeqId: 101 });
    expect(Array.from(m.models[0]!.entityId)).toEqual(['1', '1', '1', '1', '2', '', '']);
  });

  it('HETATM MSE without SEQRES/MODRES stays in the sequence', () => {
    const m = parsePdbToModel([
      rec('ATOM', 1, ' CA', ' ', 'ALA', 'A', 1, ' ', 1, 'C'),
      rec('HETATM', 2, ' CA', ' ', 'MSE', 'A', 2, ' ', 2, 'C'),
      rec('ATOM', 3, ' CA', ' ', 'SER', 'A', 3, ' ', 3, 'C'),
    ].join('\n'));
    expect(m.entities[0]!.sequence).toBe('AMS');
    expect(m.chains[0]!.residues[1]).toMatchObject({ compId: 'MSE', parentCompId: 'MET', oneLetter: 'M' });
    expect(m.ligands).toEqual([]);
    expect(m.warnings).toEqual([]);
  });

  it('a free standard-residue ligand after TER is a ligand, not a sequence residue', () => {
    const lines = (ter: boolean) => [
      seqres(1, 'A', 5, 'GLY ALA SER LYS LEU'),
      rec('ATOM', 1, ' CA', ' ', 'GLY', 'A', 1, ' ', 1, 'C'),
      rec('ATOM', 2, ' CA', ' ', 'ALA', 'A', 2, ' ', 2, 'C'),
      rec('ATOM', 3, ' CA', ' ', 'SER', 'A', 3, ' ', 3, 'C'),
      ...(ter ? ['TER'] : []),
      rec('HETATM', 4, ' CA', ' ', 'LYS', 'A', 301, ' ', 4, 'C'),
    ].join('\n');
    for (const ter of [true, false]) {
      const m = parsePdbToModel(lines(ter));
      expect(m.chains[0]!.residues.map((r) => r.modelled)).toEqual([true, true, true, false, false]);
      expect(m.ligands.map((l) => [l.compId, l.authSeqId])).toEqual([['LYS', 301]]);
      expect(m.models[0]!.labelSeqId[3]).toBe(0);
    }
  });

  it('ATOM records after a TER stay polymer; only HETATM records after TER are demoted', () => {
    // Full TER record: serial, residue name, chain and number in their columns.
    const fullTer = `TER   ${'3'.padStart(5)}      GLY A${'2'.padStart(4)}`;
    for (const ter of [fullTer, 'TER']) {
      const m = parsePdbToModel([
        rec('ATOM', 1, ' CA', ' ', 'ALA', 'A', 1, ' ', 1, 'C'),
        rec('ATOM', 2, ' CA', ' ', 'GLY', 'A', 2, ' ', 2, 'C'),
        ter,
        rec('ATOM', 4, ' CA', ' ', 'SER', 'A', 10, ' ', 3, 'C'),
        rec('ATOM', 5, ' CA', ' ', 'LYS', 'A', 11, ' ', 4, 'C'),
      ].join('\n'));
      expect(m.chains[0]!.residues.map((r) => [r.compId, r.auth?.seqId])).toEqual([['ALA', 1], ['GLY', 2], ['SER', 10], ['LYS', 11]]);
      expect(m.entities[0]!.sequence).toBe('AGSK');
      expect(m.ligands).toEqual([]);
      expect(Array.from(m.models[0]!.labelSeqId)).toEqual([1, 2, 3, 4]);
    }
  });

  it('a bare TER line (tleap/GROMACS) ends the chain like a full TER record', () => {
    const lines = (ter: string | null) => [
      seqres(1, 'A', 4, 'GLY ALA SER LYS'),
      rec('ATOM', 1, ' CA', ' ', 'GLY', 'A', 1, ' ', 1, 'C'),
      rec('ATOM', 2, ' CA', ' ', 'ALA', 'A', 2, ' ', 2, 'C'),
      rec('ATOM', 3, ' CA', ' ', 'SER', 'A', 3, ' ', 3, 'C'),
      ...(ter === null ? [] : [ter]),
      rec('HETATM', 4, ' CA', ' ', 'LYS', 'A', 4, ' ', 4, 'C'),
    ].join('\n');
    // Without TER a contiguous standard-named HETATM that SEQRES lists continues the chain.
    expect(parsePdbToModel(lines(null)).ligands).toEqual([]);
    for (const ter of ['TER', 'TER   ', `TER   ${'4'.padStart(5)}      SER A${'3'.padStart(4)}`]) {
      const m = parsePdbToModel(lines(ter));
      expect(m.ligands.map((l) => [l.compId, l.authSeqId])).toEqual([['LYS', 4]]);
      expect(m.chains[0]!.residues.map((r) => r.modelled)).toEqual([true, true, true, false]);
    }
  });

  it('empty or hydrogen-only input does not throw; element falls back to the atom name', () => {
    expect(parsePdbToModel('').models).toEqual([]);
    const m = parsePdbToModel(`${rec('ATOM', 1, ' HA', ' ', 'ALA', 'A', 1, ' ', 1, '').slice(0, 76)}`);
    expect(m.models[0]!.element[0]).toBe('H');
    expect(m.models[0]!.isHydrogen[0]).toBe(1);
  });
});

describe('detectFormat / parseStructure', () => {
  it('detects by content', () => {
    expect(detectFormat(read('1UBQ.pdb'))).toBe('pdb');
    expect(detectFormat(read('3KZ5.pdb'))).toBe('pdb');
    expect(detectFormat(read('1UBQ.cif'))).toBe('mmcif');
    expect(detectFormat(read('3KZ5.cif'))).toBe('mmcif');
    expect(detectFormat('>sp|P0\nMQIFVKTLTGKTITLEVEPSDTIENVKAKIQDKEGIPPDQQRLIFAGKQLEDGRTLSDYNIQKESTLHLVLRLRGG\n')).toBeNull();
    expect(detectFormat('')).toBeNull();
  });
  it('content beats the extension; the extension breaks ties', () => {
    expect(detectFormat(read('1UBQ.cif'), 'model.pdb')).toBe('mmcif');
    expect(detectFormat(read('1UBQ.pdb'), 'model.cif')).toBe('pdb');
    expect(detectFormat('data_x\n#\n_atom_site.id\n', 'a.pdb')).toBe('mmcif');
  });
  it('parseStructure dispatches and names the model from the file name', () => {
    const p = parseStructure(read('1UBQ.pdb'), 'my.model.pdb');
    expect(p.format).toBe('pdb');
    expect(p.name).toBe('my.model');
    expect(parseStructure(read('1UBQ.cif')).format).toBe('mmcif');
    expect(parseStructure(read('1UBQ.cif')).name).toBe('structure');
  });
  it('parseStructure throws for non-structure text and atom-less blocks', () => {
    const msg = 'Not a PDB or mmCIF structure file';
    expect(() => parseStructure('>seq\nMKV\n')).toThrow(new Error(msg));
    expect(() => parseStructure('data_x\n_entry.id X\n')).toThrow(new Error(msg));
    expect(() => parseStructure('data_x\nloop_\n_atom_site.id\n_atom_site.Cartn_x\n')).toThrow(new Error(msg));
  });
  it('index re-exports the public API', () => {
    expect(typeof api.parseMmcif).toBe('function');
    expect(typeof api.parseCifBlocks).toBe('function');
    expect(typeof api.parsePdbToModel).toBe('function');
    expect(typeof api.detectFormat).toBe('function');
    expect(typeof api.parseStructure).toBe('function');
  });
});
