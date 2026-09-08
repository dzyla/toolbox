import type { Plasmid, PlasmidFeature } from './index';
import type { Annotation, PlasmidDocument } from './model';

function annotationTypeToLegacy(type: string): PlasmidFeature['type'] {
  const normalized = type.toLowerCase();
  if (normalized === 'cds') return 'cds';
  if (normalized.includes('promoter')) return 'promoter';
  if (normalized.includes('origin')) return 'origin';
  if (normalized.includes('resistance')) return 'resistance';
  if (normalized.includes('terminator')) return 'terminator';
  if (normalized.includes('regulatory') || normalized.includes('operator')) return 'regulatory';
  if (normalized.includes('tag')) return 'tag';
  if (normalized.includes('mcs') || normalized.includes('cloning')) return 'mcs';
  return 'misc';
}

function legacyFeatureToAnnotation(feature: PlasmidFeature): Annotation {
  const qualifiers: Record<string, string[]> = {};
  if (feature.notes) qualifiers.note = [feature.notes];
  if (feature.translation) qualifiers.translation = [feature.translation];

  return {
    id: feature.id,
    name: feature.name,
    type: feature.type,
    location: {
      strand: feature.strand,
      segments: [{ start: feature.start - 1, end: feature.end }],
    },
    qualifiers,
    color: feature.color,
    source: 'imported',
    confidence: 'annotated',
  };
}

/** Transitional adapter for existing presets and tools using 1-based inclusive feature coordinates. */
export function legacyPlasmidToDocument(plasmid: Plasmid): PlasmidDocument {
  return {
    id: plasmid.id,
    name: plasmid.name,
    sequence: plasmid.seq,
    topology: plasmid.isCircular ? 'circular' : 'linear',
    annotations: plasmid.features.map(legacyFeatureToAnnotation),
    description: plasmid.description,
    provenance: {
      format: 'fasta',
      parserVersion: 'legacy-adapter-1',
      warnings: [],
    },
  };
}

/** Display adapter while the map renderer completes its migration to compound locations. */
export function documentToLegacyPlasmid(document: PlasmidDocument): Plasmid {
  return {
    id: document.id,
    name: document.name,
    length: document.sequence.length,
    seq: document.sequence,
    isCircular: document.topology === 'circular',
    description: document.description,
    features: document.annotations.map(annotation => {
      const first = annotation.location.segments[0]!;
      const last = annotation.location.segments[annotation.location.segments.length - 1]!;
      return {
        id: annotation.id,
        name: annotation.name,
        type: annotationTypeToLegacy(annotation.type),
        start: first.start + 1,
        end: last.end,
        strand: annotation.location.strand === -1 ? -1 : 1,
        color: annotation.color,
        notes: annotation.qualifiers.note?.join('\n'),
        translation: annotation.qualifiers.translation?.[0],
      };
    }),
  };
}
