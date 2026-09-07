import type { Plasmid, PlasmidFeature } from './index';
import type { Annotation, PlasmidDocument } from './model';

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
