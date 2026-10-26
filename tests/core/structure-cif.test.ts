import { describe, it, expect } from 'vitest';
import { parseCifBlocks } from '@/core/structure/cif';
import { read } from './structure-helpers';

describe('parseCifBlocks', () => {
  it('reads key-value pairs and loops from 1UBQ', () => {
    const text = read('1UBQ.cif');
    const b = parseCifBlocks(text)[0]!;
    expect(b.name).toBe('1UBQ');
    expect(b.categories.get('_struct')!.get('title', 0)).toBe('STRUCTURE OF UBIQUITIN REFINED AT 1.8 ANGSTROMS RESOLUTION');
    const atoms = b.categories.get('_atom_site')!;
    const expected = text.split('\n').filter((l) => /^(ATOM|HETATM)\s/.test(l)).length;
    expect(expected).toBeGreaterThan(500);
    expect(atoms.rowCount).toBe(expected);
    expect(atoms.get('label_comp_id', 0)).toBe('MET');
    expect(atoms.get('Cartn_x', 0)).toBe('27.340');
    expect(atoms.fields[0]).toBe('group_PDB');
  });

  it('handles ; text fields, quotes with embedded quotes, ? and .', () => {
    const b = parseCifBlocks(read('edge-cases.cif'))[0]!;
    const s = b.categories.get('_struct')!;
    expect(s.get('title', 0)).toBe(`Line one of a long title\nline two with 'quotes' and "double quotes"`);
    expect(s.get('pdbx_descriptor', 0)).toBe("five'-O-methyl");
    expect(s.get('note', 0)).toBe(`it's a "test"x`);
    expect(s.get('unknown_a', 0)).toBeUndefined();
    expect(s.get('unknown_b', 0)).toBeUndefined();
    expect(s.get('plain', 0)).toBe('value_with_underscores');
    expect(s.get('spaced', 0)).toBe('two words');
    expect(s.get('trailing_quote', 0)).toBe("O5' ");
    const c = b.categories.get('_chem_comp')!;
    expect(c.rowCount).toBe(5);
    expect(c.get('name', 0)).toBe('L-ALANINE');
    expect(c.get('formula', 1)).toBe('C5 H11 N O2 Se');
    expect(c.get('formula', 2)).toBe('H2 O');
    expect(c.get('name', 3)).toBeUndefined();
    expect(c.get('formula', 3)).toBeUndefined();
    expect(c.get('name', 4)).toBe(`O5' DERIVATIVE`);
    expect(c.get('formula', 4)).toBe(`N''-ACETYL`);
  });

  it('returns one block per data_ section', () => {
    const blocks = parseCifBlocks(read('edge-cases.cif'));
    expect(blocks.map((b) => b.name)).toEqual(['EDGE1', 'EDGE2']);
    const a = blocks[1]!.categories.get('_atom_site')!;
    expect(a.rowCount).toBe(2);
    expect(a.get('label_atom_id', 1)).toBe("O5'");
    expect(a.get('Cartn_x', 1)).toBe('2.500');
    expect(blocks[0]!.categories.has('_atom_site')).toBe(false);
  });

  it('returns undefined for unknown fields and out-of-range rows', () => {
    const b = parseCifBlocks(read('minimal.cif'))[0]!;
    const a = b.categories.get('_atom_site')!;
    expect(a.get('nope', 0)).toBeUndefined();
    expect(a.get('id', -1)).toBeUndefined();
    expect(a.get('id', a.rowCount)).toBeUndefined();
  });

  it('keeps ? and . as undefined in loops (minimal.cif chain B has no label_seq_id)', () => {
    const b = parseCifBlocks(read('minimal.cif'))[0]!;
    const a = b.categories.get('_atom_site')!;
    expect(a.rowCount).toBe(23);
    expect(a.get('label_seq_id', 0)).toBe('1');
    expect(a.get('label_seq_id', 11)).toBeUndefined();
    expect(a.get('label_alt_id', 0)).toBeUndefined();
    expect(a.get('pdbx_PDB_ins_code', 0)).toBeUndefined();
  });

  it('reads insertion codes', () => {
    const b = parseCifBlocks(read('insertion.cif'))[0]!;
    const a = b.categories.get('_atom_site')!;
    const rows = Array.from({ length: a.rowCount }, (_, i) => `${a.get('auth_seq_id', i)}${a.get('pdbx_PDB_ins_code', i) ?? ''}`);
    expect(Array.from(new Set(rows))).toEqual(['26', '27', '27A', '27B', '28']);
  });

  it('parses gzipped fixtures with several blocks of data and many categories', () => {
    const b = parseCifBlocks(read('4HHB.cif.gz'))[0]!;
    expect(b.name).toBe('4HHB');
    expect(b.categories.get('_entity')!.rowCount).toBeGreaterThan(1);
    expect(b.categories.get('_atom_site')!.rowCount).toBeGreaterThan(4000);
    const semet = parseCifBlocks(read('semet.cif.gz'))[0]!.categories.get('_atom_site')!;
    expect(Array.from({ length: semet.rowCount }, (_, i) => semet.get('label_comp_id', i))).toContain('MSE');
  });

  it('handles CRLF line endings, comments and empty input', () => {
    const crlf = 'data_X\r\n_a.b 1\r\n# c\r\nloop_\r\n_t.x\r\n_t.y\r\n1 2\r\n3 4\r\n';
    const b = parseCifBlocks(crlf)[0]!;
    expect(b.categories.get('_a')!.get('b', 0)).toBe('1');
    const t = b.categories.get('_t')!;
    expect(t.rowCount).toBe(2);
    expect(t.get('y', 1)).toBe('4');
    expect(parseCifBlocks('')).toEqual([]);
    expect(parseCifBlocks('# only a comment\n')).toEqual([]);
  });

  it('ignores a trailing partial row and tolerates stray tokens', () => {
    const b = parseCifBlocks('data_X\nloop_\n_t.x\n_t.y\n1 2 3\n_a.b v\n')[0]!;
    expect(b.categories.get('_t')!.rowCount).toBe(1);
    expect(b.categories.get('_a')!.get('b', 0)).toBe('v');
    expect(parseCifBlocks('stray\ndata_Y\n_k.v 1\n')[0]!.name).toBe('Y');
    expect(parseCifBlocks('data_Z\n_k.v\n')[0]!.categories.size).toBe(0);
  });

  it('handles multi-row ; text fields inside a loop and unterminated text fields', () => {
    const src = 'data_X\nloop_\n_t.a\n_t.b\nrow1\n;multi\nline\n;\nrow2 \'it\'s\'\n_k.v\n;unterminated\nrest';
    const b = parseCifBlocks(src)[0]!;
    const t = b.categories.get('_t')!;
    expect(t.rowCount).toBe(2);
    expect(t.get('b', 0)).toBe('multi\nline');
    expect(t.get('b', 1)).toBe("it's");
    expect(b.categories.get('_k')!.get('v', 0)).toBe('unterminated\nrest');
  });

  it('merges repeated keys of one category and handles unterminated quotes', () => {
    const b = parseCifBlocks("data_X\n_k.a 1\n_k.b 'open\n_k.c 3\n")[0]!;
    const k = b.categories.get('_k')!;
    expect(k.fields).toEqual(['a', 'b', 'c']);
    expect(k.get('a', 0)).toBe('1');
    expect(k.get('b', 0)).toBe('open');
    expect(k.get('c', 0)).toBe('3');
  });

  it('skips global_, save_ and stop_ constructs without breaking later data', () => {
    const b = parseCifBlocks('data_X\nsave_frame\n_s.a 1\nsave_\n_k.v 2\nloop_\n_t.x\n1\nstop_\n')[0]!;
    expect(b.categories.get('_k')!.get('v', 0)).toBe('2');
  });
});
