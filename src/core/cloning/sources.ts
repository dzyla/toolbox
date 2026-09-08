import { importPlasmidFile, importPlasmidText } from '@/core/plasmid/import';
import type { PlasmidDocument, PlasmidTopology } from '@/core/plasmid/model';
import type { Finding } from './types';

export interface CloningSource {
  id: string;
  name: string;
  document: PlasmidDocument;
  kind: 'plasmid' | 'fragment';
}

export interface Linearization {
  kind: 'coordinates' | 'inverse-pcr';
  /** Zero-based sequence boundary; `end` is exclusive. */
  start: number;
  end: number;
}

function withIdentity(id: string, document: PlasmidDocument): CloningSource {
  if (!id.trim()) throw new Error('A cloning source needs a stable ID.');
  return {
    id,
    name: document.name,
    kind: 'plasmid',
    document: { ...document, id },
  };
}

export function sourceFromText(id: string, text: string, topology?: PlasmidTopology): CloningSource {
  const imported = importPlasmidText(text).document;
  const document = topology && imported.provenance.format === 'fasta'
    ? { ...imported, topology }
    : imported;
  return withIdentity(id, document);
}

export async function sourceFromFile(id: string, file: Blob): Promise<CloningSource> {
  return withIdentity(id, (await importPlasmidFile(file)).document);
}

function linearizationBlocker(code: string, message: string): { sequence: string; findings: Finding[] } {
  return { sequence: '', findings: [{ code, severity: 'blocker', message }] };
}

export function linearizeSource(source: CloningSource, selection: Linearization): { sequence: string; findings: Finding[] } {
  const { sequence, topology } = source.document;
  const { start, end } = selection;
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < 0 || start >= sequence.length || end > sequence.length) {
    return linearizationBlocker('INVALID_LINEARIZATION_BOUNDARY', 'Linearization boundaries must be zero-based positions within the source sequence.');
  }
  if (topology === 'linear' && end <= start) {
    return linearizationBlocker('WRAPPED_LINEARIZATION_ON_LINEAR_SOURCE', 'A linear source cannot use a boundary that wraps across its end.');
  }
  if (topology === 'circular' && end < start) {
    return { sequence: sequence.slice(start) + sequence.slice(0, end), findings: [] };
  }
  return { sequence: sequence.slice(start, end), findings: [] };
}
