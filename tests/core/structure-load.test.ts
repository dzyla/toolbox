import { describe, it, expect, vi, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DecompressionStream as NodeDecompressionStream } from 'node:stream/web';
import { gzipSync } from 'node:zlib';
import { normaliseRcsbId, fetchRcsbEntry, readStructureFile, loadDemo } from '@/tools/structure/load';
import { runParseJob, runInterfaceJob } from '@/tools/structure/job';
import { importErrorMessage, MAX_TEXT_IMPORT_BYTES } from '@/lib/file-import';
import { read } from './structure-helpers';

beforeAll(() => {
  if (typeof globalThis.DecompressionStream === 'undefined') {
    (globalThis as unknown as { DecompressionStream: unknown }).DecompressionStream = NodeDecompressionStream;
  }
});

const BAD_ID = 'Enter a 4-character PDB ID (e.g. 1UBQ) or an extended ID (pdb_00001ubq)';

describe('normaliseRcsbId', () => {
  it('normalises classic and extended IDs', () => {
    expect(normaliseRcsbId('1ubq')).toBe('1UBQ');
    expect(normaliseRcsbId('PDB_00001UBQ')).toBe('pdb_00001ubq');
    expect(normaliseRcsbId(' 4hhb ')).toBe('4HHB');
    expect(normaliseRcsbId('0abc')).toBe('0ABC');
    expect(normaliseRcsbId('12345')).toBeNull();
    expect(normaliseRcsbId('abcd')).toBeNull();
    expect(normaliseRcsbId('')).toBeNull();
  });
});

describe('fetchRcsbEntry', () => {
  it('fetches the mmCIF from files.rcsb.org', async () => {
    const f = vi.fn(async () => new Response('data_1UBQ\n', { status: 200 }));
    const s = await fetchRcsbEntry('1ubq', f as unknown as typeof fetch);
    expect(f).toHaveBeenCalledWith('https://files.rcsb.org/download/1UBQ.cif');
    expect(s).toEqual({ text: 'data_1UBQ\n', name: '1UBQ', origin: 'rcsb', rcsbId: '1UBQ' });
  });
  it('reports an invalid id without fetching', async () => {
    const f = vi.fn();
    await expect(fetchRcsbEntry('zz', f as unknown as typeof fetch)).rejects.toThrow(BAD_ID);
    expect(f).not.toHaveBeenCalled();
  });
  it('maps 404, other HTTP errors and network failures', async () => {
    const mk = (r: () => Promise<Response>) => vi.fn(r) as unknown as typeof fetch;
    await expect(fetchRcsbEntry('9zzz', mk(async () => new Response('', { status: 404 })))).rejects.toThrow('RCSB has no entry 9ZZZ');
    await expect(fetchRcsbEntry('1ubq', mk(async () => new Response('', { status: 503 })))).rejects.toThrow('RCSB returned HTTP 503 for 1UBQ');
    await expect(fetchRcsbEntry('1ubq', mk(async () => { throw new TypeError('x'); }))).rejects.toThrow(
      'Could not reach RCSB. Check your connection; recently opened entries work offline.'
    );
  });
});

describe('readStructureFile', () => {
  it('gunzips when the magic bytes say so and names from the file stem', async () => {
    const gz = readFileSync(join(__dirname, '..', 'fixtures', 'structure', '1L2Y.cif.gz'));
    const s = await readStructureFile(new File([gz], '1L2Y.cif.gz'));
    expect(s.text.startsWith('data_1L2Y')).toBe(true);
    expect(s.name).toBe('1L2Y');
    expect(s.origin).toBe('file');
  });
  it('gunzips content regardless of extension', async () => {
    const s = await readStructureFile(new File([gzipSync('data_X\n')], 'weird.bin'));
    expect(s.text).toBe('data_X\n');
    expect(s.name).toBe('weird');
  });
  it('reads plain text', async () => {
    const s = await readStructureFile(new File([read('1UBQ.pdb')], '1ubq.pdb'));
    expect(s.name).toBe('1ubq');
    expect(s.text).toContain('ATOM');
  });
  it('rejects PNG, empty and corrupt gzip files with user-facing messages', async () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
    await expect(readStructureFile(new File([png], 'a.png'))).rejects.toThrow(/not a structure file/);
    await expect(readStructureFile(new File([], 'e.cif'))).rejects.toThrow(/empty/);
    await expect(readStructureFile(new File([new Uint8Array([0x1f, 0x8b, 1, 2, 3])], 'bad.cif.gz'))).rejects.toThrow(/could not be decompressed/);
    const err = await readStructureFile(new File([png], 'a.png')).catch((e) => e);
    expect(importErrorMessage(err, 'a.png')).toMatch(/a\.png/);
  });
  it('rejects a gzip bomb that expands past the import limit', async () => {
    const bomb = gzipSync(Buffer.alloc(MAX_TEXT_IMPORT_BYTES + 1024 * 1024, 65));
    expect(bomb.length).toBeLessThan(1024 * 1024);
    await expect(readStructureFile(new File([bomb], 'bomb.cif.gz'))).rejects.toThrow(/bomb\.cif\.gz expands to more than 50 MB/);
  });
  it('rejects NUL-containing binary', async () => {
    await expect(readStructureFile(new File([new Uint8Array([65, 0, 66, 0, 1, 2])], 'x.dat'))).rejects.toThrow(/not a structure file/);
  });
});

describe('loadDemo and jobs', () => {
  it('loads the bundled 1UBQ', async () => {
    const s = await loadDemo();
    expect(s).toMatchObject({ name: '1UBQ', origin: 'demo', rcsbId: '1UBQ' });
    expect(s.text).toContain('data_1UBQ');
  });
  it('runParseJob parses 3KZ5 as mmCIF with 3 chains', () => {
    const r = runParseJob({ text: read('3KZ5.cif'), name: '3KZ5' });
    expect(r.format).toBe('mmcif');
    expect(r.model.chains).toHaveLength(3);
  });
  it('runInterfaceJob returns pairs and metrics', () => {
    const { model } = runParseJob({ text: read('3KZ5.cif'), name: '3KZ5' });
    const r = runInterfaceJob({ model, modelIndex: 0, cutoff: 4.5 });
    expect(r.pairs.length).toBeGreaterThan(0);
    expect(r.metrics).toBeDefined();
  });
});
