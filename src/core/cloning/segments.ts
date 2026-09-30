/* Which source every stretch of a product came from (product coordinates, 0-based, half-open). */

import type { Annotation } from '@/core/plasmid/model';
import { nextAnnotationId } from './molecule';
import { sourceColor } from './source-colors';
import type { InfusionDesign } from './methods/infusion';
import type { NebuilderDesign } from './methods/nebuilder';

export interface SourceSegment {
  /** Index of the source in the hub's source list; -1 for bases that belong to no source (spacers, added restriction-site bases). */
  sourceIndex: number;
  name: string;
  start: number;
  end: number;
}

/** Same start arithmetic as `nebuilderProduct`; a homology that already overlaps makes neighbouring segments overlap. */
export function nebuilderSegments(design: NebuilderDesign): SourceSegment[] {
  const length = design.product.length;
  if (!length || !design.templates.length) return [];
  const segments: SourceSegment[] = [];
  let end = 0;
  design.templates.forEach((template, index) => {
    const junction = index === 0 ? undefined : design.junctions[index - 1]!;
    const spacer = junction?.spacer.length ?? 0;
    if (spacer) segments.push({ sourceIndex: -1, name: 'spacer', start: end, end: end + spacer });
    const start = index === 0 ? 0 : end + spacer - junction!.intrinsicOverlap;
    end = start + template.sequence.length;
    segments.push({ sourceIndex: index, name: template.name, start, end: Math.min(end, length) });
  });
  const closing = design.junctions.length === design.templates.length ? design.junctions[design.junctions.length - 1] : undefined;
  if (closing?.spacer.length) {
    const last = segments[segments.length - 1]!;
    segments.push({ sourceIndex: -1, name: 'spacer', start: last.end, end: Math.min(length, last.end + closing.spacer.length) });
  }
  return segments;
}

/** Vector, added left site, inserts in order, added right site — the layout `infusionProduct` builds. */
export function infusionSegments(
  design: InfusionDesign,
  vector: { sourceIndex: number; name: string },
  inserts: Array<{ sourceIndex: number; name: string; length: number }>,
): SourceSegment[] {
  if (!design.product) return [];
  const segments: SourceSegment[] = [{ sourceIndex: vector.sourceIndex, name: vector.name, start: 0, end: design.vector.length }];
  let cursor = design.vector.length;
  if (design.leftSite.length) {
    segments.push({ sourceIndex: -1, name: 'restriction site', start: cursor, end: cursor + design.leftSite.length });
    cursor += design.leftSite.length;
  }
  for (const insert of inserts) {
    segments.push({ sourceIndex: insert.sourceIndex, name: insert.name, start: cursor, end: cursor + insert.length });
    cursor += insert.length;
  }
  if (design.rightSite.length) segments.push({ sourceIndex: -1, name: 'restriction site', start: cursor, end: cursor + design.rightSite.length });
  return segments;
}

/** Coloured, numbered regions for the maps and the sequence view; bases with no source get none. */
export function segmentAnnotations(segments: SourceSegment[]): Annotation[] {
  return segments.filter(segment => segment.sourceIndex >= 0 && segment.end > segment.start).map(segment => ({
    id: nextAnnotationId('source'),
    name: `${segment.sourceIndex + 1} · ${segment.name}`,
    type: 'misc_feature',
    location: { segments: [{ start: segment.start, end: segment.end }], strand: 0 },
    qualifiers: { note: [`Source ${segment.sourceIndex + 1}: ${segment.name}`] },
    color: sourceColor(segment.sourceIndex),
    source: 'manual',
  }));
}
