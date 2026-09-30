import { useMemo } from 'preact/hooks';
import type { AminoAcidResult } from '@/core/cloning/methods/basechanger';
import { mutationAlignment, proteinLines, translateFrom } from '@/core/cloning/mutation-view';

const MONO = 'font-mono text-xs leading-6';

/** The translated reading frame, ten residues to a block, numbered at both ends of every line, mutated residues marked. */
export function NumberedProtein({ protein, marks, total }: { protein: string; marks: Map<number, string>; total?: number }) {
  const shown = useMemo(() => protein.replace(/\*/g, '').length, [protein]);
  const lines = useMemo(() => proteinLines(protein), [protein]);
  const truncated = total !== undefined && total > shown;
  return <section aria-label="Protein sequence with residue numbers" class="space-y-1 overflow-x-auto rounded-xl border border-slate-200 p-3 dark:border-slate-700">
    {lines.map(line => <div key={line.start} class={`${MONO} flex items-baseline gap-3 whitespace-nowrap`}>
      <span class="w-10 shrink-0 text-right text-slate-600 dark:text-slate-400">{line.start}</span>
      <span class="flex gap-2">{line.blocks.map((block, blockIndex) => <span key={blockIndex}>{[...block].map((residue, i) => {
        const number = line.start + blockIndex * 10 + i;
        const change = truncated && number > shown ? undefined : marks.get(number);
        return change
          ? <mark key={i} title={`${change} (residue ${number})`} class="rounded-sm bg-amber-200 px-px font-bold text-amber-950 dark:bg-amber-700 dark:text-amber-50">{residue}</mark>
          : <span key={i}>{residue}</span>;
      })}</span>)}</span>
      <span class="w-10 shrink-0 text-slate-600 dark:text-slate-400">{line.end}</span>
    </div>)}
    {truncated && <p class="text-xs text-slate-600 dark:text-slate-400">Showing the first {shown.toLocaleString('en-US')} of {total!.toLocaleString('en-US')} residues. Mutations beyond that are designed but not marked here.</p>}
  </section>;
}

/** DNA row with the changed bases in bold; a caret line under it marks them without relying on weight or colour. */
function DnaRow({ label, bases, changed }: { label: string; bases: string; changed: Set<number> }) {
  return <div><span class="inline-block w-20 text-slate-600 dark:text-slate-400">{label}</span>{[...bases].map((base, i) => changed.has(i) ? <strong key={i} class="font-bold text-amber-900 dark:text-amber-200">{base}</strong> : <span key={i}>{base}</span>)}</div>;
}

/** One card per mutation: the codon change and the pairwise alignment of the wild-type and mutant protein. */
export function MutationCards({ result, wildDna, orfStart }: { result: AminoAcidResult; wildDna: string; orfStart: number }) {
  const design = result.design;
  const product = design?.product;
  // Translations and alignments only change with the design, so a keystroke elsewhere does not redo them.
  const views = useMemo(() => {
    if (!product) return [];
    const wildProtein = translateFrom(wildDna, orfStart);
    const mutantProtein = translateFrom(product, orfStart);
    return result.mutations.map(mutation => {
      const codonStart = orfStart + (mutation.position - 1) * 3;
      const before = Math.min(3, codonStart); // bases of context to the left (fewer near the plasmid start)
      const stop = codonStart + 3 + 3;
      return { mutation, view: mutationAlignment(wildProtein, mutantProtein, mutation.position, 10, {
        wild: wildDna.slice(codonStart - before, stop),
        mutant: product.slice(codonStart - before, stop),
        codonAt: before,
      }) };
    });
  }, [result, wildDna, orfStart, product]);
  if (!design) return null;
  return <div class="space-y-3">
    {views.map(({ mutation, view }) => {
      const changed = new Set(view.dna.changed);
      return <div key={mutation.raw} role="group" aria-label={`${mutation.raw}: wild type vs mutant`} class="space-y-2 rounded-xl border border-slate-200 p-3 dark:border-slate-700">
        <p class="text-xs"><strong>{mutation.raw}</strong> · Residue {view.position}: {view.from} → {view.to} · codon <span class="font-mono">{view.wildCodon}</span> → <span class="font-mono font-bold">{view.mutantCodon}</span></p>
        <div aria-label="Protein alignment" role="group" class={`${MONO} whitespace-pre overflow-x-auto`}>
          <div><span class="inline-block w-20 text-slate-600 dark:text-slate-400">Wild type</span>{view.wild}</div>
          <div><span class="inline-block w-20" />{view.midline}</div>
          <div><span class="inline-block w-20 text-slate-600 dark:text-slate-400">Mutant</span>{view.mutant}</div>
          <div class="text-slate-600 dark:text-slate-400"><span class="inline-block w-20" />residues {view.windowStart}–{view.windowStart + view.wild.replace(/-/g, '').length - 1} · {view.matchCount} identical, {view.mismatchCount} changed{view.gapCount ? `, ${view.gapCount} gap` : ''}</div>
        </div>
        <div aria-label="DNA alignment" role="group" class={`${MONO} whitespace-pre overflow-x-auto`}>
          <DnaRow label="DNA wild" bases={view.dna.wild} changed={changed} />
          <div><span class="inline-block w-20" />{view.dna.midline}</div>
          <DnaRow label="DNA new" bases={view.dna.mutant} changed={changed} />
          <div data-testid="dna-carets" class="text-amber-900 dark:text-amber-200"><span class="inline-block w-20 text-slate-600 dark:text-slate-400">changed</span>{view.dna.carets}</div>
        </div>
        <p class="text-xs text-slate-600 dark:text-slate-400">| identical · . changed · gap for a missing residue (for example after a new stop). ^ marks a changed base.</p>
      </div>;
    })}
  </div>;
}
