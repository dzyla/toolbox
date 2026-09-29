/* Build product molecules with the features of their inputs carried across. */

import type { Annotation } from '@/core/plasmid/model';
import { annotationsInWindow, shiftAnnotations, nextAnnotationId, type Molecule } from './molecule';
import type { NebuilderDesign } from './methods/nebuilder';
import type { InfusionDesign } from './methods/infusion';
import type { SdmDesign } from './methods/basechanger';
import type { ProductJunction } from './assemble';

function within(annotations: Annotation[], length: number): Annotation[] {
  return annotations.filter(annotation => annotation.location.segments.every(segment => segment.end <= length));
}

/** `sources[i]` is the molecule the i-th NEBuilder fragment was cut or amplified from. */
export function nebuilderProduct(design: NebuilderDesign, sources: Molecule[], name: string, circular: boolean): Molecule | null {
  if (!design.product || sources.length !== design.templates.length) return null;
  let annotations: Annotation[] = [];
  let length = 0;
  design.templates.forEach((template, index) => {
    const source = sources[index]!;
    const junction = index === 0 ? undefined : design.junctions[index - 1]!;
    const start = index === 0 ? 0 : length + junction!.spacer.length - junction!.intrinsicOverlap;
    const window = annotationsInWindow(source.annotations, source.sequence.length, source.topology === 'circular', template.start, template.sequence.length);
    annotations = [...annotations, ...shiftAnnotations(window, start)];
    length = start + template.sequence.length;
  });
  return { name, sequence: design.product, topology: circular ? 'circular' : 'linear', annotations: within(annotations, design.product.length), left: undefined, right: undefined };
}

export function infusionProduct(design: InfusionDesign, vector: Molecule, inserts: Molecule[], name: string): Molecule | null {
  if (!design.product) return null;
  const n = vector.sequence.length;
  const circular = vector.topology === 'circular';
  let annotations = annotationsInWindow(vector.annotations, n, circular, design.vectorStart, design.vector.length);
  let cursor = design.vector.length + design.leftSite.length;
  for (const insert of inserts) {
    annotations = [...annotations, ...shiftAnnotations(insert.annotations, cursor)];
    cursor += insert.sequence.length;
  }
  return { name, sequence: design.product, topology: 'circular', annotations: within(annotations, design.product.length) };
}

/** Plasmid after an SDM edit: features keep their place, shift, stretch or (if cut through) disappear; the edit is added as a feature. */
export function sdmProduct(source: Molecule, design: SdmDesign): Molecule {
  const { start, end, replacement, label } = design.edit;
  const delta = replacement.length - (end - start);
  const annotations: Annotation[] = [];
  for (const annotation of source.annotations) {
    const segments = annotation.location.segments;
    const first = segments[0]!.start;
    const last = segments[segments.length - 1]!.end;
    if (last <= start) annotations.push(annotation);
    else if (first >= end) annotations.push(...shiftAnnotations([annotation], delta));
    else if (first <= start && last >= end) {
      annotations.push({ ...annotation, location: { ...annotation.location, segments: segments.map(segment => segment.end >= end ? { start: segment.start, end: segment.end + delta } : segment) } });
    }
  }
  if (replacement.length) {
    annotations.push({
      id: nextAnnotationId('edit'),
      name: label,
      type: 'misc_feature',
      location: { segments: [{ start, end: start + replacement.length }], strand: 1 },
      qualifiers: { note: [design.description] },
      source: 'manual',
    });
  }
  return { name: `${source.name} ${label}`, sequence: design.product, topology: source.topology, annotations };
}

/**
 * A place worth pointing at in a product: a junction between assembled parts or the edited region.
 * `start`/`end` are 0-based and half-open with 0 <= start < end <= product length, so a mark can be
 * selected on the map and in the sequence view directly. A junction whose span crosses the origin of a
 * circular product is SPLIT into two marks (one before the origin, one after), never wrapped.
 */
export interface ProductMark { label: string; start: number; end: number; kind: 'junction' | 'edit'; detail: string }

const at = (position: number) => (position + 1).toLocaleString('en-US');

/** A span around a single point (a blunt junction or a deletion), clamped into [0, length]. */
function around(point: number, length: number): { start: number; end: number } {
  const start = Math.max(0, Math.min(point - 1, length - 1));
  return { start, end: Math.min(length, start + 2) };
}

/** Fragment boundaries and their overlaps, with the same start arithmetic as `nebuilderProduct`. */
export function nebuilderMarks(design: NebuilderDesign): ProductMark[] {
  const length = design.product.length;
  if (!length || !design.templates.length) return [];
  const marks: ProductMark[] = [];
  const circular = design.junctions.length === design.templates.length;
  let end = design.templates[0]!.sequence.length; // end of the fragment placed so far
  design.junctions.forEach((junction, index) => {
    const closing = index >= design.templates.length - 1;
    const label = `Junction ${index + 1}: ${junction.upstream} → ${junction.downstream}`;
    const detail = (position: number) => `${at(position)} · ${junction.overlapLength ? `${junction.overlapLength}-bp overlap` : 'no overlap'}${junction.spacer ? ` · ${junction.spacer.length}-bp spacer` : ''}`;
    const upstream = junction.upstreamTail.length;
    const downstream = junction.downstreamTail.length;
    if (!closing) {
      const next = end + junction.spacer.length - junction.intrinsicOverlap;
      const span = junction.intrinsicOverlap
        ? { start: next, end: next + junction.intrinsicOverlap }
        : upstream + downstream + junction.spacer.length
          ? { start: end - upstream, end: next + downstream }
          : around(next, length);
      marks.push({ label, ...span, kind: 'junction', detail: detail(span.start) });
      end = next + design.templates[index + 1]!.sequence.length;
      return;
    }
    if (!circular) return;
    // Closing junction: last fragment back to the first, across the origin.
    if (junction.intrinsicOverlap) {
      marks.push({ label, start: 0, end: junction.intrinsicOverlap, kind: 'junction', detail: detail(0) });
      return;
    }
    const before = { start: Math.max(0, length - junction.spacer.length - upstream), end: length };
    const after = { start: 0, end: Math.min(downstream, length) };
    const parts = [before, after].filter(part => part.end > part.start);
    if (!parts.length) parts.push(around(0, length));
    parts.forEach((part, partIndex) => marks.push({
      label: parts.length > 1 ? `${label} (part ${partIndex + 1} of 2, across the origin)` : label,
      ...part, kind: 'junction', detail: detail(part.start),
    }));
  });
  return marks;
}

/** Homology arms of an In-Fusion product: vector → insert(s) → vector. `inserts` are the molecules given to `infusionProduct`. */
export function infusionMarks(design: InfusionDesign, inserts: Molecule[]): ProductMark[] {
  if (!design.product || !inserts.length) return [];
  const forward = design.primers.filter(primer => primer.role === 'insert' && primer.direction === 'forward');
  const vectorArm = forward[0]?.extension.length ?? 0;
  const marks: ProductMark[] = [];
  const homology = (label: string, start: number, end: number) =>
    marks.push({ label, start, end, kind: 'junction', detail: `${at(start)} · ${end - start}-bp homology` });
  let cursor = design.vector.length + design.leftSite.length;
  if (vectorArm) homology(`Junction 1: vector → ${inserts[0]!.name}`, design.vector.length - vectorArm, design.vector.length);
  inserts.forEach((insert, index) => {
    cursor += insert.sequence.length;
    const next = inserts[index + 1];
    if (next) {
      const arm = forward[index + 1]?.extension.length ?? 0;
      if (arm) homology(`Junction ${index + 2}: ${insert.name} → ${next.name}`, cursor - arm, cursor);
    }
  });
  const rightArm = design.primers.find(primer => primer.role === 'insert' && primer.direction === 'reverse' && primer.target === inserts[inserts.length - 1]!.name)?.extension.length ?? 0;
  if (rightArm) homology(`Junction ${inserts.length + 1}: ${inserts[inserts.length - 1]!.name} → vector`, 0, rightArm);
  return marks;
}

/**
 * One mark per ligation junction: the overhang (or 2 bp around a blunt junction), clamped to the product `length`.
 * The closing junction of a circular product sits at the origin (marked from base 1).
 * Only sticky and blunt junctions (from `ligate`) are marked; homology ('overlap') junctions are skipped.
 */
export function ligationMarks(junctions: ProductJunction[], length = Infinity): ProductMark[] {
  return junctions.filter(junction => junction.kind !== 'overlap').map(junction => {
    const size = junction.sequence.length;
    const span: { start: number; end: number } = size === 0
      ? { start: Math.max(0, junction.position - 1), end: junction.position + 1 }
      : junction.position === 0 ? { start: 0, end: size } : { start: junction.position - size, end: junction.position };
    span.end = Math.min(span.end, length);
    return {
      label: `Junction ${junction.index + 1}: ${junction.leftName} → ${junction.rightName}`,
      ...span, kind: 'junction' as const,
      detail: `${at(span.start)} · ${junction.kind === 'blunt' ? 'blunt' : `${size}-nt ${junction.kind} overhang ${junction.sequence}`}`,
    };
  });
}

/** The edited bases of an SDM product (a deletion is marked as 2 bp around the point). */
export function sdmMarks(design: SdmDesign): ProductMark[] {
  const { start, replacement, label } = design.edit;
  const length = design.product.length;
  const span = replacement.length ? { start, end: start + replacement.length } : around(start, length);
  return [{ label: `Edit: ${label}`, ...span, kind: 'edit', detail: `${at(span.start)} · ${design.description}` }];
}
