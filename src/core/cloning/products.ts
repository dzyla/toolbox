/* Build product molecules with the features of their inputs carried across. */

import type { Annotation } from '@/core/plasmid/model';
import { annotationsInWindow, shiftAnnotations, nextAnnotationId, type Molecule } from './molecule';
import type { NebuilderDesign } from './methods/nebuilder';
import type { InfusionDesign } from './methods/infusion';
import type { SdmDesign } from './methods/basechanger';

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
