import { describe, it, expect } from 'vitest';
import laddersJson from '@/data/ladders.json';

interface LadderEntry {
  id: string;
  name: string;
  kind: 'protein' | 'dna';
  sizes: number[];
  unit: 'kDa' | 'bp';
  supplier: string;
  catalog: string;
  _source?: string;
}

describe('gel ladders catalog', () => {
  const ladders = laddersJson.ladders as LadderEntry[];

  it('contains expected standard protein and DNA ladders', () => {
    expect(ladders.length).toBeGreaterThanOrEqual(10);
    expect(ladders.some(l => l.id === 'biorad-precision-plus')).toBe(true);
    expect(ladders.some(l => l.id === 'neb-1kb')).toBe(true);
  });

  it('ensures every ladder has bands strictly descending in size', () => {
    for (const ladder of ladders) {
      expect(ladder.sizes.length).toBeGreaterThan(0);
      for (let i = 1; i < ladder.sizes.length; i++) {
        expect(
          ladder.sizes[i]!,
          `Ladder ${ladder.id} at index ${i} (${ladder.sizes[i]}) should be smaller than previous (${ladder.sizes[i - 1]})`
        ).toBeLessThan(ladder.sizes[i - 1]!);
      }
    }
  });
});
