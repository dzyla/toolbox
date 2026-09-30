import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/preact';
import { designAminoAcidChanges } from '@/core/cloning/methods/basechanger';
import { MutationCards, NumberedProtein } from '@/tools/cloning/hub/ProteinView';

vi.mock('@/core/cloning/mutation-view', async importOriginal => {
  const original = await importOriginal<typeof import('@/core/cloning/mutation-view')>();
  return { ...original, translateFrom: vi.fn(original.translateFrom), mutationAlignment: vi.fn(original.mutationAlignment), proteinLines: vi.fn(original.proteinLines) };
});
import * as view from '@/core/cloning/mutation-view';

afterEach(cleanup);

const GENE = `ATG${'GCTAAAGAACTG'.repeat(30)}TAA`;

describe('protein view work is memoised', () => {
  it('does not translate or align again when re-rendered with the same design', () => {
    const { results } = designAminoAcidChanges(GENE, { start: 0 }, 'K3R');
    const result = results[0]!;
    expect(result.design).toBeTruthy();
    const { rerender, container } = render(<MutationCards result={result} wildDna={GENE} orfStart={0} />);
    const translated = vi.mocked(view.translateFrom).mock.calls.length;
    const aligned = vi.mocked(view.mutationAlignment).mock.calls.length;
    expect(aligned).toBe(1);
    rerender(<MutationCards result={result} wildDna={GENE} orfStart={0} />);
    expect(vi.mocked(view.translateFrom).mock.calls.length).toBe(translated);
    expect(vi.mocked(view.mutationAlignment).mock.calls.length).toBe(aligned);
    expect(container.querySelector('[data-testid="dna-carets"]')!.textContent).toContain('^');
  });

  it('does not rebuild the numbered lines for the same protein', () => {
    const marks = new Map<number, string>();
    const { rerender } = render(<NumberedProtein protein="MKAYGKEFLK*" marks={marks} />);
    const calls = vi.mocked(view.proteinLines).mock.calls.length;
    rerender(<NumberedProtein protein="MKAYGKEFLK*" marks={new Map([[3, 'A3G']])} />);
    expect(vi.mocked(view.proteinLines).mock.calls.length).toBe(calls);
  });
});
