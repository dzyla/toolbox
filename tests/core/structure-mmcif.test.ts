import { describe, it, expect } from 'vitest';
import { parseMmcif } from '@/core/structure/mmcif';
import { parseCifBlocks } from '@/core/structure/cif';
import { numberingJumpWarning, oneLetterFor, polymerTypeFromCif, MODIFIED_PARENT } from '@/core/structure/residues';
import { read } from './structure-helpers';

const UBQ = 'MQIFVKTLTGKTITLEVEPSDTIENVKAKIQDKEGIPPDQQRLIFAGKQLEDGRTLSDYNIQKESTLHLVLRLRGG';

describe('residue helpers', () => {
  it('maps modified residues and unknowns', () => {
    expect(oneLetterFor('MSE')).toBe('M');
    expect(oneLetterFor('XYZ', 'SER')).toBe('S');
    expect(oneLetterFor('XYZ')).toBe('X');
    expect(oneLetterFor('PSU')).toBe('U');
    expect(oneLetterFor('DT')).toBe('T');
    expect(oneLetterFor('PCA')).toBe('E');
    expect(MODIFIED_PARENT.MSE).toBe('MET');
  });
  it('lists numbering jumps (at most five, then a count); steps of 0 or 1 and decreases are not jumps', () => {
    expect(numberingJumpWarning('A', [1, 2, 2, 3, 1])).toBeUndefined();
    expect(numberingJumpWarning('A', [])).toBeUndefined();
    expect(numberingJumpWarning('X', [1, 3, 5, 7, 9, 11, 13, 15])).toBe(
      'Chain X: residue numbering jumps 1→3, 3→5, 5→7, 7→9, 9→11 and 2 more; the file has no deposited sequence, so gaps cannot be shown',
    );
  });
  it('classifies polymer types', () => {
    expect(polymerTypeFromCif('polypeptide(L)')).toBe('protein');
    expect(polymerTypeFromCif('polydeoxyribonucleotide')).toBe('dna');
    expect(polymerTypeFromCif('polyribonucleotide')).toBe('rna');
    expect(polymerTypeFromCif('polydeoxyribonucleotide/polyribonucleotide hybrid')).toBe('other');
    expect(polymerTypeFromCif('other')).toBe('other');
  });
});

describe('parseMmcif', () => {
  it('1UBQ: one entity, 76 aa, all modelled, header', () => {
    const m = parseMmcif(read('1UBQ.cif'), '1UBQ');
    expect(m.name).toBe('1UBQ');
    expect(m.format).toBe('mmcif');
    expect(m.entities.filter((e) => e.kind === 'polymer')).toHaveLength(1);
    expect(m.entities[0]!.sequence).toBe(UBQ);
    expect(m.entities[0]!.polymerType).toBe('protein');
    expect(m.chains).toHaveLength(1);
    expect(m.chains[0]!.residues).toHaveLength(76);
    expect(m.chains[0]!.residues.every((r) => r.modelled)).toBe(true);
    expect(m.chains[0]!.residues.map((r) => r.oneLetter).join('')).toBe(UBQ);
    expect(m.header).toMatchObject({
      id: '1UBQ', method: 'X-RAY DIFFRACTION', resolution: 1.8, organisms: ['Homo sapiens'],
      depositionDate: '1987-01-02',
    });
    expect(m.header.title).toMatch(/UBIQUITIN/);
    const t = m.models[0]!;
    expect(t.count).toBe(t.xyz.length / 3);
    expect(t.atomName[0]).toBe('N');
    expect(t.isHydrogen.some((h) => h === 1)).toBe(false);
    expect(m.warnings).toEqual([]);
  });

  it('3KZ5: label vs auth chains and unmodelled ends', () => {
    const m = parseMmcif(read('3KZ5.cif'));
    expect(m.chains.map((c) => [c.labelAsymId, c.authAsymId])).toEqual([['A', 'E'], ['B', 'B'], ['C', 'A']]);
    const gaps = (id: string) => m.chains.find((c) => c.labelAsymId === id)!.residues.filter((r) => !r.modelled).map((r) => r.seqId);
    expect(gaps('A')).toEqual([49, 50, 51, 52]);
    expect(gaps('B')).toEqual([1, 49, 50, 51, 52]);
    expect(gaps('C')).toEqual([1, 2, 3, 4, 52]);
    expect(m.entities[0]).toMatchObject({ description: 'Protein sopB', labelAsymIds: ['A', 'B', 'C'] });
    expect(m.ligands.map((l) => l.compId)).toEqual(['ACT']);
    expect(m.ligands[0]!.name).toMatch(/ACETATE/i);
    const a = m.chains[0]!.residues;
    expect(a[0]!.auth).toEqual({ seqId: 271, insCode: '' });
  });

  it('4HHB: two polymer entities with two copies each, 4 HEM, 2 PO4, waters excluded', () => {
    const m = parseMmcif(read('4HHB.cif.gz'));
    const polys = m.entities.filter((e) => e.kind === 'polymer');
    expect(polys.map((e) => e.labelAsymIds)).toEqual([['A', 'C'], ['B', 'D']]);
    expect(m.chains.map((c) => c.labelAsymId)).toEqual(['A', 'B', 'C', 'D']);
    expect(m.ligands.filter((l) => l.compId === 'HEM')).toHaveLength(4);
    expect(m.ligands.filter((l) => l.compId === 'PO4')).toHaveLength(2);
    expect(m.ligands.some((l) => l.compId === 'HOH')).toBe(false);
    expect(m.ligands).toHaveLength(6);
    expect(m.ligands.find((l) => l.compId === 'HEM')!.name).toMatch(/PROTOPORPHYRIN/i);
  });

  it('1L2Y: 38 models with equal atom counts; sequence independent of model', () => {
    const m = parseMmcif(read('1L2Y.cif.gz'));
    expect(m.models).toHaveLength(38);
    const c0 = m.models[0]!.count;
    expect(c0).toBeGreaterThan(250);
    expect(m.models.every((t) => t.count === c0)).toBe(true);
    expect(m.models.map((t) => t.modelNumber)).toEqual(Array.from({ length: 38 }, (_, i) => i + 1));
    expect(m.chains).toHaveLength(1);
    expect(m.chains[0]!.residues.map((r) => r.oneLetter).join('')).toBe('NLYIQWLKDGGPSSGRPPPS');
    expect(m.models[0]!.isHydrogen.some((h) => h === 1)).toBe(true);
  });

  it('semet: full sequence equals _entity_poly.pdbx_seq_one_letter_code_can and MSE positions carry parent MET', () => {
    const text = read('semet.cif.gz');
    const can = parseCifBlocks(text)[0]!.categories.get('_entity_poly')!.get('pdbx_seq_one_letter_code_can', 0)!.replace(/\s+/g, '');
    const m = parseMmcif(text);
    expect(m.entities.find((e) => e.kind === 'polymer')!.sequence).toBe(can);
    const chain = m.chains[0]!;
    expect(chain.residues.map((r) => r.oneLetter).join('')).toBe(can);
    const mse = chain.residues.filter((r) => r.compId === 'MSE');
    expect(mse).toHaveLength(8);
    expect(mse.every((r) => r.parentCompId === 'MET' && r.oneLetter === 'M')).toBe(true);
    expect(chain.residues.find((r) => r.compId !== 'MSE')!.parentCompId).toBeUndefined();
    expect(m.warnings).toEqual([]);
  });

  it('minimal.cif: sequences from atoms, MSE to M via fallback table, chain B gap is not invented', () => {
    const m = parseMmcif(read('minimal.cif'));
    expect(m.header).toEqual({ organisms: [] });
    expect(m.chains.map((c) => c.labelAsymId)).toEqual(['A', 'B']);
    const a = m.chains[0]!;
    expect(a.residues.map((r) => r.oneLetter).join('')).toBe('AGMLS');
    expect(a.residues.map((r) => r.seqId)).toEqual([1, 2, 3, 4, 5]);
    expect(a.residues[2]).toMatchObject({ compId: 'MSE', parentCompId: 'MET', oneLetter: 'M', modelled: true });
    const b = m.chains[1]!;
    expect(b.residues).toHaveLength(6);
    expect(b.residues.every((r) => r.modelled)).toBe(true);
    expect(b.residues.map((r) => r.seqId)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(b.residues.map((r) => r.auth!.seqId)).toEqual([1, 2, 3, 7, 8, 9]);
    expect(b.residues.map((r) => r.oneLetter).join('')).toBe('VKEDFY');
    expect(m.entities).toHaveLength(2);
    expect(m.entities.map((e) => e.sequence)).toEqual(['AGMLS', 'VKEDFY']);
    expect(m.entities.map((e) => e.description)).toEqual(['', '']);
    expect(m.chains.map((c) => c.entityId)).toEqual(m.entities.map((e) => e.id));
    expect(m.ligands).toEqual([]);
    expect(m.models[0]!.count).toBe(23);
    // No deposited sequence: the 3→7 jump in chain B is reported, not shown as a gap; chain A is contiguous.
    expect(m.warnings).toEqual(['Chain B: residue numbering jumps 3→7; the file has no deposited sequence, so gaps cannot be shown']);
  });

  it('no gap warning for entries with a deposited sequence (1UBQ, 3KZ5) or for insertion-code steps', () => {
    for (const f of ['1UBQ.cif', '3KZ5.cif', 'insertion.cif']) {
      expect(parseMmcif(read(f)).warnings.filter((w) => w.includes('numbering jumps'))).toEqual([]);
    }
  });

  it('insertion.cif: 27, 27A, 27B stay distinct and ordered', () => {
    const m = parseMmcif(read('insertion.cif'));
    const r = m.chains[0]!.residues;
    expect(r.map((x) => `${x.auth!.seqId}${x.auth!.insCode}`)).toEqual(['26', '27', '27A', '27B', '28']);
    expect(r.map((x) => x.seqId)).toEqual([1, 2, 3, 4, 5]);
    expect(m.models[0]!.insCode.includes('B')).toBe(true);
  });

  it('unknown modified residue becomes X with a warning', () => {
    const cif = `data_T
loop_
_atom_site.group_PDB
_atom_site.id
_atom_site.type_symbol
_atom_site.label_atom_id
_atom_site.label_alt_id
_atom_site.label_comp_id
_atom_site.label_asym_id
_atom_site.label_seq_id
_atom_site.Cartn_x
_atom_site.Cartn_y
_atom_site.Cartn_z
_atom_site.auth_seq_id
_atom_site.auth_asym_id
_atom_site.pdbx_PDB_model_num
ATOM 1 N N . ALA A 1 0 0 0 1 A 1
ATOM 2 C CA . ZZZ A 2 1 0 0 2 A 1
ATOM 3 C CA . GLY A 3 2 0 0 3 A 1
`;
    const m = parseMmcif(cif);
    expect(m.chains[0]!.residues.map((r) => r.oneLetter).join('')).toBe('AXG');
    expect(m.chains[0]!.residues[1]!.parentCompId).toBeUndefined();
    expect(m.warnings.some((w) => w.includes('ZZZ'))).toBe(true);
    expect(m.warnings.filter((w) => w.includes('ZZZ'))).toHaveLength(1);
  });

  it('uses mod_residue and chem_comp parents, microheterogeneity, altlocs, water, nucleic acids', () => {
    const cif = `data_T
_entry.id T
loop_
_exptl.entry_id
_exptl.method
T 'ELECTRON MICROSCOPY'
T 'NEUTRON DIFFRACTION'
_em_3d_reconstruction.resolution 3.4
loop_
_entity.id
_entity.type
_entity.pdbx_description
1 polymer 'Peptide'
2 polymer 'DNA strand'
3 non-polymer 'Zinc'
4 water water
loop_
_entity_poly.entity_id
_entity_poly.type
_entity_poly.pdbx_seq_one_letter_code_can
1 'polypeptide(L)' AXG
2 polydeoxyribonucleotide
;AC
 T
;
loop_
_entity_poly_seq.entity_id
_entity_poly_seq.num
_entity_poly_seq.mon_id
_entity_poly_seq.hetero
1 1 ALA n
1 2 QQQ y
1 2 SER y
1 3 GLY n
2 1 DA n
2 2 DC n
2 3 DT n
loop_
_struct_asym.id
_struct_asym.entity_id
A 1
B 2
C 3
D 4
loop_
_chem_comp.id
_chem_comp.name
_chem_comp.mon_nstd_parent_comp_id
QQQ 'Q thing' THR
ZN 'ZINC ION' ?
loop_
_atom_site.group_PDB
_atom_site.id
_atom_site.type_symbol
_atom_site.label_atom_id
_atom_site.label_alt_id
_atom_site.label_comp_id
_atom_site.label_asym_id
_atom_site.label_entity_id
_atom_site.label_seq_id
_atom_site.Cartn_x
_atom_site.Cartn_y
_atom_site.Cartn_z
_atom_site.occupancy
_atom_site.B_iso_or_equiv
_atom_site.auth_seq_id
_atom_site.auth_asym_id
_atom_site.pdbx_PDB_model_num
ATOM 1 C CA A ALA A 1 1 0 0 0 0.5 10 1 A 1
ATOM 2 C CA B ALA A 1 1 9 9 9 0.5 10 1 A 1
ATOM 3 D HD1 . QQQ A 1 2 1 0 0 1 10 2 A 1
ATOM 4 C CA . GLY A 1 3 2 0 0 1 10 3 A 1
ATOM 5 P P . DA B 2 1 5 5 5 1 10 1 B 1
HETATM 6 ZN ZN . ZN C 3 . 7 7 7 1 10 101 C 1
HETATM 7 O O . HOH D 4 . 8 8 8 1 10 201 D 1
`;
    const m = parseMmcif(cif);
    expect(m.header.method).toBe('ELECTRON MICROSCOPY / NEUTRON DIFFRACTION');
    expect(m.header.resolution).toBe(3.4);
    const ra = m.chains[0]!.residues;
    expect(ra[1]).toMatchObject({ compId: 'QQQ', parentCompId: 'THR', oneLetter: 'T', modelled: true });
    expect(m.warnings.some((w) => /microheterogeneity/i.test(w))).toBe(true);
    expect(m.entities[0]!.sequence).toBe('AXG');
    expect(m.entities[1]).toMatchObject({ sequence: 'ACT', polymerType: 'dna', description: 'DNA strand' });
    expect(m.entities[3]!.kind).toBe('water');
    expect(m.chains.map((c) => c.labelAsymId)).toEqual(['A', 'B']);
    expect(m.chains[1]!.residues.map((r) => r.oneLetter).join('')).toBe('ACT');
    expect(m.chains[0]!.residues[0]).toMatchObject({ modelled: true, auth: { seqId: 1, insCode: '' } });
    expect(m.ligands).toHaveLength(1);
    expect(m.ligands[0]).toMatchObject({ compId: 'ZN', name: 'ZINC ION', atomCount: 1, authSeqId: 101, entityId: '3' });
    const t = m.models[0]!;
    expect(t.count).toBe(6); // altloc B dropped
    expect(t.occupancy[0]).toBeCloseTo(0.5);
    expect(t.isHydrogen[1]).toBe(1);
    expect(t.isHetatm[4]).toBe(1);
    expect(t.labelSeqId[4]).toBe(0);
  });

  it('rejects text without a data block', () => {
    expect(() => parseMmcif('')).toThrow(/data block/i);
  });
});

const HDR = `loop_
_atom_site.group_PDB
_atom_site.id
_atom_site.type_symbol
_atom_site.label_atom_id
_atom_site.label_alt_id
_atom_site.label_comp_id
_atom_site.label_asym_id
_atom_site.label_entity_id
_atom_site.label_seq_id
_atom_site.Cartn_x
_atom_site.Cartn_y
_atom_site.Cartn_z
_atom_site.auth_seq_id
_atom_site.auth_asym_id
_atom_site.pdbx_PDB_model_num
`;
const MICRO_ATOMS = `ATOM 1 N N . ALA A 1 1 0 0 0 1 A 1
ATOM 2 N N A SER A 1 2 1 0 0 2 A 1
ATOM 3 C CB A SER A 1 2 1 1 0 2 A 1
ATOM 4 O OG A SER A 1 2 1 2 0 2 A 1
ATOM 5 O OG1 B THR A 1 2 1 3 0 2 A 1
ATOM 6 C CG2 B THR A 1 2 1 4 0 2 A 1
ATOM 7 N N . GLY A 1 3 2 0 0 3 A 1
`;

describe('alt-loc microheterogeneity and minimal-path ligands', () => {
  it('keeps only the first alt id per residue (minimal path)', () => {
    const m = parseMmcif(`data_T
${HDR}${MICRO_ATOMS}`);
    expect(m.models[0]!.compId.filter((c, i, a) => a.indexOf(c) === i)).toEqual(['ALA', 'SER', 'GLY']);
    expect(m.models[0]!.count).toBe(5);
    expect(m.chains[0]!.residues.map((r) => `${r.seqId}${r.oneLetter}`)).toEqual(['1A', '2S', '3G']);
  });

  it('drops the second alt id with entity categories present', () => {
    const cif = `data_T
loop_
_entity.id
_entity.type
1 polymer
loop_
_entity_poly_seq.entity_id
_entity_poly_seq.num
_entity_poly_seq.mon_id
1 1 ALA
1 2 SER
1 3 GLY
loop_
_struct_asym.id
_struct_asym.entity_id
A 1
${HDR}${MICRO_ATOMS}`;
    const m = parseMmcif(cif);
    expect(m.models[0]!.compId).not.toContain('THR');
    expect(m.models[0]!.atomName).not.toContain('OG1');
    expect(m.chains[0]!.residues.map((r) => r.compId)).toEqual(['ALA', 'SER', 'GLY']);
  });

  it('does not stamp the polymer entity id on ligand or water atoms (minimal path)', () => {
    const cif = `data_T
${HDR}ATOM 1 N N . ALA A 1 1 0 0 0 1 A 1
ATOM 2 C CA . GLY A 1 2 1 0 0 2 A 1
HETATM 3 FE FE . HEM A 1 . 5 5 5 301 A 1
HETATM 4 O O . HOH A 1 . 8 8 8 401 A 1
`;
    const m = parseMmcif(cif);
    expect(m.entities).toHaveLength(1);
    const polyId = m.entities[0]!.id;
    expect(m.ligands).toHaveLength(1);
    expect(m.ligands[0]!.compId).toBe('HEM');
    expect(m.ligands[0]!.entityId).toBe('');
    expect(m.models[0]!.entityId).toEqual([polyId, polyId, '', '']);
  });
});
