import type { Annotation, PlasmidDocument } from './model';

function locationText(annotation: Annotation): string {
  const ranges = annotation.location.segments.map(segment => `${segment.start + 1}..${segment.end}`);
  const compound = ranges.length === 1 ? ranges[0]! : `join(${ranges.join(',')})`;
  return annotation.location.strand === -1 ? `complement(${compound})` : compound;
}

function qualifierLines(annotation: Annotation): string[] {
  const qualifiers = { ...annotation.qualifiers };
  // The editable name is authoritative; a retained imported label can be stale after a rename.
  qualifiers.label = [annotation.name];
  if (annotation.color) qualifiers.ApEinfo_fwdcolor = [annotation.color];
  return Object.entries(qualifiers).flatMap(([key, values]) => values.map(value => `                     /${key}="${value.replace(/"/g, '""')}"`));
}

/** Export the editable canonical document to an interoperable GenBank record. */
export function exportGenBank(document: PlasmidDocument): string {
  const name = document.name.replace(/\s+/g, '_').slice(0, 16) || 'Untitled';
  const topology = document.topology === 'circular' ? 'circular' : 'linear';
  const features = document.annotations.flatMap(annotation => [
    `     ${annotation.type.slice(0, 15).padEnd(16)} ${locationText(annotation)}`,
    ...qualifierLines(annotation),
  ]);
  const sequence = document.sequence.toLowerCase();
  const origin = Array.from({ length: Math.ceil(sequence.length / 60) }, (_, index) => {
    const start = index * 60;
    const groups = sequence.slice(start, start + 60).match(/.{1,10}/g)?.join(' ') || '';
    return `${String(start + 1).padStart(9)} ${groups}`;
  });
  return [`LOCUS       ${name.padEnd(16)} ${document.sequence.length} bp    DNA     ${topology}`, 'FEATURES             Location/Qualifiers', ...features, 'ORIGIN', ...origin, '//', ''].join('\n');
}

export function exportFasta(document: PlasmidDocument): string {
  const chunks = document.sequence.match(/.{1,80}/g) || [];
  return `>${document.name}\n${chunks.join('\n')}\n`;
}
