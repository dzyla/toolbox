/* Where the amplified pieces and their primers sit on their sources, for the primer maps.
   Positions are 0-based on the source's top strand; a stretch may wrap the origin of a circular source. */

import type { InfusionDesign } from './methods/infusion';
import type { NebuilderDesign, NebuilderFragment } from './methods/nebuilder';

export interface PrimerSpan {
  name: string;
  strand: 'fwd' | 'rev';
  /** The stretch of the source this primer's annealing part binds (top-strand coordinates). */
  start: number;
  length: number;
  /** 5′ tail: homology, spacer or site bases that do not bind the source. */
  tailLength: number;
  /** Hub source index of the fragment the tail overlaps. */
  tailNeighborIndex?: number;
}

export interface PieceGeometry {
  sourceIndex: number;
  name: string;
  length: number;
  topology: 'linear' | 'circular';
  kind: 'pcr' | 'digest';
  region: { start: number; length: number };
  removed?: { start: number; length: number };
  primers: PrimerSpan[];
}

const mod = (a: number, n: number) => ((a % n) + n) % n;

export function nebuilderGeometry(design: NebuilderDesign, fragments: NebuilderFragment[]): PieceGeometry[] {
  if (!design.templates.length || design.templates.length !== fragments.length) return [];
  const circle = design.junctions.length === fragments.length;
  // Primers were pushed in fragment order, a forward/reverse pair for every PCR fragment.
  let cursor = 0;
  return fragments.map((fragment, index) => {
    const template = design.templates[index]!;
    const n = fragment.sequence.length;
    const region = { start: template.start, length: template.sequence.length };
    const piece: PieceGeometry = { sourceIndex: index, name: fragment.name, length: n, topology: fragment.topology, kind: fragment.kind, region, primers: [] };
    if (fragment.topology === 'circular' && region.length < n) piece.removed = { start: mod(region.start + region.length, n), length: n - region.length };
    if (fragment.kind !== 'pcr') return piece;
    const fwd = design.primers[cursor++];
    const rev = design.primers[cursor++];
    if (!fwd || !rev) return piece;
    const before = index === 0 ? (circle ? fragments.length - 1 : undefined) : index - 1;
    const after = index === fragments.length - 1 ? (circle ? 0 : undefined) : index + 1;
    const tail = (primer: typeof fwd) => primer.overlap.length + primer.spacer.length;
    piece.primers = [
      { name: fwd.name, strand: 'fwd', start: region.start, length: fwd.anneal.length, tailLength: tail(fwd), tailNeighborIndex: tail(fwd) ? before : undefined },
      { name: rev.name, strand: 'rev', start: mod(region.start + region.length - rev.anneal.length, n), length: rev.anneal.length, tailLength: tail(rev), tailNeighborIndex: tail(rev) ? after : undefined },
    ];
    return piece;
  });
}

export function infusionGeometry(
  design: InfusionDesign,
  vector: { sourceIndex: number; name: string; length: number; topology?: 'circular' | 'linear' },
  inserts: Array<{ sourceIndex: number; name: string; length: number }>,
): PieceGeometry[] {
  if (!design.product) return [];
  const n = vector.length;
  const tail = (primer: { extension: string; site: string }) => primer.extension.length + primer.site.length;
  const vectorPrimers = design.primers.filter(primer => primer.role === 'vector');
  const vectorPiece: PieceGeometry = {
    sourceIndex: vector.sourceIndex, name: vector.name, length: n, topology: vector.topology ?? 'circular', kind: vectorPrimers.length ? 'pcr' : 'digest',
    region: { start: design.vectorStart, length: design.vector.length }, primers: [],
  };
  if (vectorPiece.topology === 'circular' && design.vector.length < n) vectorPiece.removed = { start: mod(design.vectorStart + design.vector.length, n), length: n - design.vector.length };
  const first = inserts[0];
  const last = inserts[inserts.length - 1];
  vectorPrimers.forEach(primer => {
    const forward = primer.direction === 'forward';
    vectorPiece.primers.push({
      name: primer.name, strand: forward ? 'fwd' : 'rev',
      start: forward ? design.vectorStart : mod(design.vectorStart + design.vector.length - primer.anneal.length, n), length: primer.anneal.length,
      tailLength: tail(primer), tailNeighborIndex: tail(primer) ? (forward ? last?.sourceIndex : first?.sourceIndex) : undefined,
    });
  });
  const insertPrimers = design.primers.filter(primer => primer.role === 'insert');
  const pieces = inserts.map((insert, index): PieceGeometry => {
    const fwd = insertPrimers[index * 2];
    const rev = insertPrimers[index * 2 + 1];
    const piece: PieceGeometry = { sourceIndex: insert.sourceIndex, name: insert.name, length: insert.length, topology: 'linear', kind: 'pcr', region: { start: 0, length: insert.length }, primers: [] };
    if (fwd) piece.primers.push({ name: fwd.name, strand: 'fwd', start: 0, length: fwd.anneal.length, tailLength: tail(fwd), tailNeighborIndex: index === 0 ? vector.sourceIndex : inserts[index - 1]!.sourceIndex });
    if (rev) piece.primers.push({ name: rev.name, strand: 'rev', start: insert.length - rev.anneal.length, length: rev.anneal.length, tailLength: tail(rev), tailNeighborIndex: index === inserts.length - 1 ? vector.sourceIndex : inserts[index + 1]!.sourceIndex });
    return piece;
  });
  return [vectorPiece, ...pieces];
}
