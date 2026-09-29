import { validateDocument, type PlasmidDocument } from '@/core/plasmid/model';

/** Accept the previous raw-document schema as well as the versioned workspace envelope. */
export function restoreDocument(state: unknown): PlasmidDocument {
  try {
    if (!state || typeof state !== 'object') throw new Error();
    const envelope = state as { schemaVersion?: unknown; document?: unknown };
    if (envelope.schemaVersion !== undefined && envelope.schemaVersion !== 2) throw new Error();
    const document = (envelope.schemaVersion === 2 ? envelope.document : state) as PlasmidDocument;
    if (!document || !['circular', 'linear'].includes(document.topology)
      || !Array.isArray(document.annotations) || !Array.isArray(document.provenance?.warnings)
      || !['fasta', 'genbank', 'snapgene'].includes(document.provenance.format)
      || document.provenance.warnings.some(warning => typeof warning.code !== 'string' || typeof warning.message !== 'string')
      || !validateDocument(document).valid) throw new Error();
    return document;
  } catch { throw new Error('This saved project does not contain a supported, valid plasmid document.'); }
}
