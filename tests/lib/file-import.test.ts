import { describe, expect, it } from 'vitest';
import { FileImportError, importErrorMessage, readBinaryFile, readTextFile } from '@/lib/file-import';

describe('file import', () => {
  it('reads text files', async () => {
    await expect(readTextFile(new File(['A1,0.5'], 'plate.csv'))).resolves.toBe('A1,0.5');
  });

  it('rejects empty and oversized files with a readable message', async () => {
    await expect(readTextFile(new File(['  \n'], 'empty.csv'))).rejects.toThrow('empty.csv is empty.');
    await expect(readTextFile(new File(['x'.repeat(2048)], 'big.csv'), 1024)).rejects.toThrow(/big\.csv is 2 KB; this import accepts files up to 1 KB/);
    await expect(readBinaryFile(new File([new Uint8Array(10)], 'map.mrc'), 4)).rejects.toBeInstanceOf(FileImportError);
  });

  it('formats unknown errors with the file name', () => {
    expect(importErrorMessage(new FileImportError('x is empty.'), 'x')).toBe('x is empty.');
    expect(importErrorMessage(new Error('bad header'), 'seq.dna')).toBe('Could not import seq.dna: bad header');
  });
});
