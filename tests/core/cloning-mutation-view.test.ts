import { describe, expect, it } from 'vitest';
import { mutationAlignment, mutationMarks, proteinLines, translateFrom } from '@/core/cloning/mutation-view';

const WILD = 'MKTAYIAKQRQISFVKSHFSRQLEERLGLIEVQAPILSRVGDGTQDNLSGAEKAVQVKVKALPDAQFEVV';

describe('proteinLines', () => {
  it('numbers lines by their first and last residue and groups residues in tens', () => {
    const lines = proteinLines(WILD, 50);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatchObject({ start: 1, end: 50 });
    expect(lines[0]!.blocks).toHaveLength(5);
    expect(lines[0]!.blocks[0]).toBe('MKTAYIAKQR');
    expect(lines[1]).toMatchObject({ start: 51, end: WILD.length });
    expect(lines[1]!.blocks.join('')).toBe(WILD.slice(50));
  });
  it('is empty for an empty protein and never splits a block at the end', () => {
    expect(proteinLines('')).toEqual([]);
    expect(proteinLines('MKT', 50)[0]!.blocks).toEqual(['MKT']);
  });
});

describe('translateFrom', () => {
  it('translates from an offset and stops after the first stop codon', () => {
    expect(translateFrom('CCATGAAATAGGGG', 2)).toBe('MK*');
  });
  it('stops at the end of the sequence and honours the residue cap', () => {
    expect(translateFrom('ATGAAAGG', 0)).toBe('MK');
    expect(translateFrom('ATGAAAAAAAAA', 0, 2)).toBe('MK');
  });
});

describe('mutationAlignment', () => {
  const mutate = (protein: string, position: number, to: string) => protein.slice(0, position - 1) + to + protein.slice(position);

  it('aligns a substitution and counts one mismatch', () => {
    const mutant = mutate(WILD, 30, 'W');
    const view = mutationAlignment(WILD, mutant, 30, 10);
    expect(view).toMatchObject({ position: 30, from: WILD[29], to: 'W', windowStart: 20, mismatchCount: 1, gapCount: 0 });
    expect(view.wild).toHaveLength(21);
    expect(view.mutant).toHaveLength(21);
    expect(view.midline).toHaveLength(21);
    expect(view.matchCount).toBe(20);
    expect(view.wild[10]).toBe(WILD[29]);
    expect(view.mutant[10]).toBe('W');
  });

  it('truncates the window at the start of the protein', () => {
    const view = mutationAlignment(WILD, mutate(WILD, 1, 'L'), 1, 10);
    expect(view.windowStart).toBe(1);
    expect(view.wild).toHaveLength(11);
    expect(view.mismatchCount).toBe(1);
  });

  it('truncates the window at the end of the protein', () => {
    const last = WILD.length;
    const view = mutationAlignment(WILD, mutate(WILD, last, 'A'), last, 10);
    expect(view.windowStart).toBe(last - 10);
    expect(view.wild).toHaveLength(11);
    expect(view.wild.endsWith(WILD[last - 1]!)).toBe(true);
  });

  it('handles a single-residue protein', () => {
    const view = mutationAlignment('M', 'L', 1, 10);
    expect(view.wild).toBe('M');
    expect(view.mutant).toBe('L');
    expect(view.mismatchCount).toBe(1);
  });

  it('shows a mutation to stop as a shorter mutant with gaps and no crash', () => {
    const mutant = WILD.slice(0, 29) + '*';
    const view = mutationAlignment(WILD, mutant, 30, 10);
    expect(view.to).toBe('*');
    expect(view.wild.replace(/-/g, '')).toBe(WILD.slice(19, 40));
    expect(view.mutant.replace(/-/g, '')).toBe(WILD.slice(19, 29) + '*');
    expect(view.gapCount).toBeGreaterThan(0);
  });

  it('reads a mutation that lies after a new stop as absent, not as a stop', () => {
    const mutant = WILD.slice(0, 9) + '*'; // new stop at residue 10
    const view = mutationAlignment(WILD, mutant, 30, 10);
    expect(view.to).toBe('-');
    expect(mutationAlignment(WILD, mutant, 10, 10).to).toBe('*');
  });

  it('reads a protein cut off exactly at the position as a stop', () => {
    expect(mutationAlignment(WILD, WILD.slice(0, 29), 30, 10).to).toBe('*');
    expect(mutationAlignment(WILD, WILD.slice(0, 20), 30, 10).to).toBe('-');
  });

  it('draws a caret under every changed DNA base', () => {
    const view = mutationAlignment(WILD, mutate(WILD, 30, 'F'), 30, 10, { wild: 'GCTTATGTT', mutant: 'GCTTTTGTT', codonAt: 3 });
    expect(view.dna.carets).toBe('    ^    ');
    expect(view.dna.carets).toHaveLength(view.dna.wild.length);
    const none = mutationAlignment('MKT', 'MKT', 2, 10, { wild: 'AAA', mutant: 'AAA', codonAt: 0 });
    expect(none.dna.carets).toBe('   ');
  });

  it('reads the codon change from the DNA windows and marks the changed bases', () => {
    const wildDna = 'GCTTATGTT'; // 3 bases of context, the codon, 3 bases of context
    const mutDna = 'GCTTTTGTT';
    const view = mutationAlignment(WILD, mutate(WILD, 30, 'F'), 30, 10, { wild: wildDna, mutant: mutDna, codonAt: 3 });
    expect(view.wildCodon).toBe('TAT');
    expect(view.mutantCodon).toBe('TTT');
    expect(view.dna.changed).toEqual([4]);
    expect(view.dna.midline).toBe('||||.||||');
  });

  it('reads the codon at index 0 when there is no left context (start of the plasmid)', () => {
    const view = mutationAlignment('MKT', 'MLT', 2, 10, { wild: 'AAAGGG', mutant: 'AAATTT', codonAt: 0 });
    expect(view.wildCodon).toBe('AAA');
    expect(view.mutantCodon).toBe('AAA');
    expect(view.dna.changed).toEqual([3, 4, 5]);
  });
});

describe('mutationMarks', () => {
  const mutation = (position: number, raw: string) => ({ position, raw });
  const design = {} as never;

  it('labels each mutated residue', () => {
    const marks = mutationMarks([{ design, mutations: [mutation(67, 'Y67F')] }]);
    expect([...marks]).toEqual([[67, 'Y67F']]);
  });

  it('joins the labels when two designs hit the same residue', () => {
    const marks = mutationMarks([
      { design, mutations: [mutation(67, 'Y67F')] },
      { design, mutations: [mutation(67, 'Y67W'), mutation(70, 'K70A')] },
    ]);
    expect(marks.get(67)).toBe('Y67F / Y67W');
    expect(marks.get(70)).toBe('K70A');
  });

  it('does not repeat a label and skips designs that failed', () => {
    const marks = mutationMarks([
      { design, mutations: [mutation(5, 'A5G')] },
      { design, mutations: [mutation(5, 'A5G')] },
      { design: null, mutations: [mutation(9, 'K9A')] },
    ]);
    expect([...marks]).toEqual([[5, 'A5G']]);
  });
});
