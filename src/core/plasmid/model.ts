import { validateLocation, type Location } from './coordinates';

export type PlasmidTopology = 'circular' | 'linear';
export type AnnotationSource = 'imported' | 'manual' | 'detected';
export type AnnotationConfidence = 'annotated' | 'predicted';
export type ImportFormat = 'fasta' | 'genbank' | 'snapgene';

export interface ImportWarning {
  code: string;
  message: string;
}

export interface ImportProvenance {
  format: ImportFormat;
  filename?: string;
  parserVersion: string;
  warnings: ImportWarning[];
}

export interface Annotation {
  id: string;
  name: string;
  type: string;
  location: Location;
  qualifiers: Record<string, string[]>;
  color?: string;
  source: AnnotationSource;
  confidence?: AnnotationConfidence;
}

export interface PlasmidDocument {
  id: string;
  name: string;
  sequence: string;
  topology: PlasmidTopology;
  annotations: Annotation[];
  description?: string;
  provenance: ImportProvenance;
}

export interface DocumentValidation {
  valid: boolean;
  reason?: string;
}

const DNA_ALPHABET = /^[ACGTRYSWKMBDHVN]+$/i;

export function validateDocument(document: PlasmidDocument): DocumentValidation {
  if (!document.id.trim()) return { valid: false, reason: 'Document ID is required.' };
  if (!document.name.trim()) return { valid: false, reason: 'Document name is required.' };
  if (typeof document.sequence !== 'string') return { valid: false, reason: 'Sequence must be a string.' };
  if (!DNA_ALPHABET.test(document.sequence)) return { valid: false, reason: 'Sequence contains invalid DNA bases.' };
  if (!document.provenance.parserVersion.trim()) return { valid: false, reason: 'Parser version is required.' };

  const annotationIds = new Set<string>();
  for (const annotation of document.annotations) {
    if (!annotation.id.trim()) return { valid: false, reason: 'Annotation ID is required.' };
    if (annotationIds.has(annotation.id)) return { valid: false, reason: `Duplicate annotation ID: ${annotation.id}.` };
    annotationIds.add(annotation.id);
    if (!annotation.name.trim()) return { valid: false, reason: `Annotation ${annotation.id} has no name.` };
    if (!annotation.type.trim()) return { valid: false, reason: `Annotation ${annotation.id} has no type.` };
    const location = validateLocation(annotation.location, document.sequence.length);
    if (!location.valid) return { valid: false, reason: `Annotation ${annotation.id}: ${location.reason}` };
    for (const [key, values] of Object.entries(annotation.qualifiers)) {
      if (!key.trim() || !Array.isArray(values) || values.some(value => typeof value !== 'string')) {
        return { valid: false, reason: `Annotation ${annotation.id} has an invalid qualifier.` };
      }
    }
  }

  return { valid: true };
}
