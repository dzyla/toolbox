/* Double-stranded DNA molecules with explicit end structures.

   A linear molecule is stored as the top-strand letters of its full extent (both
   strands' union) plus a description of each end:
   - left end, 5′ overhang of n: the top strand's 5′ end sticks out n nt;
   - left end, 3′ overhang of n: the bottom strand's 3′ end sticks out n nt;
   - right end, 5′ overhang of n: the bottom strand's 5′ end sticks out n nt;
   - right end, 3′ overhang of n: the top strand's 3′ end sticks out n nt.
   The overhang letters are always read from `sequence` (top-strand sense), so two
   sticky ends anneal when their kind, length and letters agree. */

import { reverseComplement } from '@/core/nucleic/sequence';
import type { Annotation, PlasmidDocument } from '@/core/plasmid/model';
import type { Segment } from '@/core/plasmid/coordinates';

export type EndKind = 'blunt' | "5'" | "3'";

export interface MoleculeEnd {
  kind: EndKind;
  /** Single-stranded length; 0 for blunt. */
  length: number;
  /** Whether the 5′ end at this terminus carries a phosphate (restriction digests do; PCR primers do not unless ordered phosphorylated). */
  phosphorylated: boolean;
  /** How the end was produced, for user-facing descriptions (e.g. "EcoRI", "PCR"). */
  origin: string;
}

export interface Molecule {
  name: string;
  sequence: string;
  topology: 'linear' | 'circular';
  /** Present only for linear molecules. */
  left?: MoleculeEnd;
  right?: MoleculeEnd;
  annotations: Annotation[];
}

export const BLUNT_PCR_END: MoleculeEnd = { kind: 'blunt', length: 0, phosphorylated: false, origin: 'PCR' };

export function normaliseSequence(raw: string): string {
  return raw.replace(/\s/g, '').toUpperCase().replace(/U/g, 'T');
}

export function moleculeFromDocument(document: PlasmidDocument): Molecule {
  const linear = document.topology === 'linear';
  return {
    name: document.name,
    sequence: normaliseSequence(document.sequence),
    topology: document.topology,
    left: linear ? { ...BLUNT_PCR_END, origin: 'linear source' } : undefined,
    right: linear ? { ...BLUNT_PCR_END, origin: 'linear source' } : undefined,
    annotations: document.annotations,
  };
}

export function moleculeToDocument(molecule: Molecule, id: string, description?: string): PlasmidDocument {
  return {
    id,
    name: molecule.name,
    sequence: molecule.sequence,
    topology: molecule.topology,
    annotations: molecule.annotations,
    description,
    provenance: { format: 'genbank', parserVersion: 'cloning-hub-1', warnings: [] },
  };
}

/** Letters of the single-stranded region at one end (top-strand sense); '' for blunt. */
export function overhangSequence(molecule: Molecule, side: 'left' | 'right'): string {
  const end = side === 'left' ? molecule.left : molecule.right;
  if (!end || end.kind === 'blunt') return '';
  return side === 'left' ? molecule.sequence.slice(0, end.length) : molecule.sequence.slice(-end.length);
}

/** Human-readable end, e.g. "EcoRI 5′ AATT" or "blunt (PCR)". */
export function describeEnd(molecule: Molecule, side: 'left' | 'right'): string {
  const end = side === 'left' ? molecule.left : molecule.right;
  if (!end) return 'circular';
  if (end.kind === 'blunt') return `blunt (${end.origin})`;
  return `${end.origin} ${end.kind === "5'" ? '5′' : '3′'} ${overhangSequence(molecule, side)}`;
}

/* ---------- annotations ---------- */

let annotationCounter = 0;
export function nextAnnotationId(prefix: string): string {
  annotationCounter += 1;
  return `${prefix}-${annotationCounter}`;
}

function mergeSegments(segments: Segment[]): Segment[] {
  const merged: Segment[] = [];
  for (const segment of segments) {
    const last = merged[merged.length - 1];
    if (last && last.end === segment.start) last.end = segment.end;
    else merged.push({ ...segment });
  }
  return merged;
}

/**
 * Annotations lying wholly inside a window of `length` nt starting at `start`
 * (which may wrap the origin of a circular source), in window coordinates.
 * Features cut by the window edge are dropped: they no longer exist intact.
 */
export function annotationsInWindow(
  annotations: Annotation[],
  sourceLength: number,
  circular: boolean,
  start: number,
  length: number,
): Annotation[] {
  const toWindow = (position: number): number => circular
    ? ((position - start) % sourceLength + sourceLength) % sourceLength
    : position - start;
  const out: Annotation[] = [];
  for (const annotation of annotations) {
    const segments: Segment[] = [];
    let inside = true;
    for (const segment of annotation.location.segments) {
      const a = toWindow(segment.start);
      const span = segment.end - segment.start;
      if (a < 0 || a + span > length) { inside = false; break; }
      segments.push({ start: a, end: a + span });
    }
    if (inside && segments.length) {
      out.push({ ...annotation, location: { ...annotation.location, segments: mergeSegments(segments) } });
    }
  }
  return out;
}

export function shiftAnnotations(annotations: Annotation[], offset: number): Annotation[] {
  return annotations.map(annotation => ({
    ...annotation,
    location: {
      ...annotation.location,
      segments: annotation.location.segments.map(segment => ({ start: segment.start + offset, end: segment.end + offset })),
    },
  }));
}

export function reverseAnnotations(annotations: Annotation[], length: number): Annotation[] {
  return annotations.map(annotation => ({
    ...annotation,
    location: {
      strand: annotation.location.strand === 0 ? 0 : (annotation.location.strand === 1 ? -1 : 1),
      segments: annotation.location.segments
        .map(segment => ({ start: length - segment.end, end: length - segment.start }))
        .reverse(),
    },
  }));
}

/** A feature on a circular product that may run across its origin. */
export function wrappedLocation(start: number, end: number, length: number): Segment[] {
  if (end <= length) return [{ start, end }];
  return [{ start, end: length }, { start: 0, end: end - length }];
}

/* ---------- molecule operations ---------- */

/** Reverse-complement a molecule: ends swap sides, overhang kinds are preserved. */
export function flipMolecule(molecule: Molecule): Molecule {
  return {
    ...molecule,
    sequence: reverseComplement(molecule.sequence),
    left: molecule.right,
    right: molecule.left,
    annotations: reverseAnnotations(molecule.annotations, molecule.sequence.length),
  };
}

/**
 * Make both ends blunt as a polymerase would: 5′ overhangs are filled in
 * (Klenow / T4 DNA polymerase), 3′ overhangs are chewed back (T4 DNA polymerase).
 */
export function bluntEnds(molecule: Molecule, sides: Array<'left' | 'right'> = ['left', 'right']): Molecule {
  if (molecule.topology === 'circular') return molecule;
  let sequence = molecule.sequence;
  let annotations = molecule.annotations;
  let left = molecule.left!;
  let right = molecule.right!;
  if (sides.includes('left') && left.kind !== 'blunt') {
    if (left.kind === "3'") {
      sequence = sequence.slice(left.length);
      annotations = annotationsInWindow(annotations, molecule.sequence.length, false, left.length, sequence.length);
    }
    left = { ...left, kind: 'blunt', length: 0, origin: `${left.origin}, ${left.kind === "5'" ? 'filled in' : 'chewed back'}` };
  }
  if (sides.includes('right') && right.kind !== 'blunt') {
    if (right.kind === "3'") {
      const trimmed = sequence.slice(0, sequence.length - right.length);
      annotations = annotationsInWindow(annotations, sequence.length, false, 0, trimmed.length);
      sequence = trimmed;
    }
    right = { ...right, kind: 'blunt', length: 0, origin: `${right.origin}, ${right.kind === "5'" ? 'filled in' : 'chewed back'}` };
  }
  return { ...molecule, sequence, left, right, annotations };
}

export function dephosphorylate(molecule: Molecule): Molecule {
  if (molecule.topology === 'circular') return molecule;
  return { ...molecule, left: { ...molecule.left!, phosphorylated: false }, right: { ...molecule.right!, phosphorylated: false } };
}

export function phosphorylate(molecule: Molecule): Molecule {
  if (molecule.topology === 'circular') return molecule;
  return { ...molecule, left: { ...molecule.left!, phosphorylated: true }, right: { ...molecule.right!, phosphorylated: true } };
}
