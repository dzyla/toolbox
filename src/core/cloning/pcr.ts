/* In-silico PCR with 5′-tailed primers. */

import { reverseComplement } from '@/core/nucleic/sequence';
import { annotationsInWindow, shiftAnnotations, type Molecule } from './molecule';

export interface AmpliconRegion {
  /** 0-based start of the amplified template region (top strand). */
  start: number;
  /** Length of the amplified template region; may wrap the origin of a circular template. */
  length: number;
}

export interface PcrPrimer {
  /** 5′ tail not matching the template (top-strand sense for the forward primer, primer sense for the reverse). */
  tail: string;
  /** Template-binding 3′ part, primer sense (5′→3′). */
  anneal: string;
  /** Full primer 5′→3′. */
  sequence: string;
}

export interface Amplicon {
  molecule: Molecule;
  forward: PcrPrimer;
  reverse: PcrPrimer;
}

/** Template region read 5′→3′ on the top strand, wrapping circular templates. */
export function templateRegion(template: Pick<Molecule, 'sequence' | 'topology'>, region: AmpliconRegion): string {
  const n = template.sequence.length;
  if (template.topology === 'linear') return template.sequence.slice(region.start, region.start + region.length);
  const from = ((region.start % n) + n) % n;
  return template.sequence.repeat(Math.ceil((from + region.length) / n)).slice(from, from + region.length);
}

/**
 * Amplify `region` of `template` with a forward primer (tail + first `forwardAnneal` nt)
 * and a reverse primer (reverse-complement tail + last `reverseAnneal` nt).
 * `forwardTail` is given in top-strand sense (it becomes the product's 5′ extension);
 * `reverseTailTop` is also top-strand sense (it becomes the product's 3′ extension).
 * The PCR product is blunt and unphosphorylated (proofreading polymerase, unmodified primers).
 */
export function amplify(
  template: Molecule,
  region: AmpliconRegion,
  forwardAnneal: number,
  reverseAnneal: number,
  forwardTail = '',
  reverseTailTop = '',
  name = template.name,
): Amplicon {
  const core = templateRegion(template, region);
  const forwardBinding = core.slice(0, forwardAnneal);
  const reverseBindingTop = core.slice(core.length - reverseAnneal);
  const forward: PcrPrimer = { tail: forwardTail, anneal: forwardBinding, sequence: forwardTail + forwardBinding };
  const reverseTail = reverseComplement(reverseTailTop);
  const reverseAnnealSeq = reverseComplement(reverseBindingTop);
  const reverse: PcrPrimer = { tail: reverseTail, anneal: reverseAnnealSeq, sequence: reverseTail + reverseAnnealSeq };
  const n = template.sequence.length;
  const annotations = shiftAnnotations(
    annotationsInWindow(template.annotations, n, template.topology === 'circular', region.start, region.length),
    forwardTail.length,
  );
  const end = { kind: 'blunt' as const, length: 0, phosphorylated: false, origin: 'PCR' };
  return {
    molecule: {
      name,
      sequence: forwardTail + core + reverseTailTop,
      topology: 'linear',
      left: end,
      right: end,
      annotations,
    },
    forward,
    reverse,
  };
}
