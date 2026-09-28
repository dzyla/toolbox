import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadLibrary, saveLibrary, isRecord, type LibrarySpec } from '@/lib/local-library';
import { CUSTOM_LADDERS } from '@/tools/gel/ladder-library';

interface Item { id: string; n: number }
const spec: LibrarySpec<Item> = {
  key: 'test.library', version: 1, legacyKeys: ['test.legacy'],
  validate: (v): v is Item => isRecord(v) && typeof v.id === 'string' && typeof v.n === 'number',
};

afterEach(() => { vi.unstubAllGlobals(); localStorage.clear(); });

describe('local preset libraries', () => {
  it('migrates a legacy bare array into the versioned envelope and removes the old key', () => {
    localStorage.setItem('test.legacy', JSON.stringify([{ id: 'a', n: 1 }, { id: 'b', n: 2 }]));
    expect(loadLibrary(spec)).toEqual([{ id: 'a', n: 1 }, { id: 'b', n: 2 }]);
    expect(localStorage.getItem('test.legacy')).toBeNull();
    expect(JSON.parse(localStorage.getItem('test.library')!)).toEqual({ version: 1, items: [{ id: 'a', n: 1 }, { id: 'b', n: 2 }] });
  });

  it('drops malformed and duplicate entries instead of passing them to the tool', () => {
    localStorage.setItem('test.library', JSON.stringify({ version: 1, items: [{ id: 'a', n: 1 }, { id: 'a', n: 9 }, { id: 3 }, 'junk', null] }));
    expect(loadLibrary(spec)).toEqual([{ id: 'a', n: 1 }]);
    localStorage.setItem('test.library', '{not json');
    expect(loadLibrary(spec)).toEqual([]);
  });

  it('reports a failed write (quota or private mode)', () => {
    vi.stubGlobal('localStorage', { getItem: () => null, removeItem: () => {}, setItem: () => { throw new Error('QuotaExceededError'); } });
    expect(saveLibrary(spec, [{ id: 'a', n: 1 }])).toBe(false);
  });

  it('migrates existing custom gel ladders and rejects ladders without valid sizes', () => {
    localStorage.setItem('bio-bench-custom-ladders', JSON.stringify([
      { id: 'custom-1', name: 'My ladder', kind: 'protein', sizes: [250, 100, 50] },
      { id: 'custom-2', name: 'Broken', kind: 'protein', sizes: ['big'] },
    ]));
    expect(loadLibrary(CUSTOM_LADDERS).map(l => l.id)).toEqual(['custom-1']);
  });
});
