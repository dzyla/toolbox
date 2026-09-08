import { describe, expect, it } from 'vitest';
import {
  findDocumentOrfs,
  findDocumentRestrictionSites,
  orfToAnnotation,
} from '@/core/plasmid/analysis';
import type { PlasmidDocument } from '@/core/plasmid/model';

const provenance = { format: 'genbank' as const, parserVersion: 'test', warnings: [] };
const originSpanningSequence = 'AAATAA' + 'A'.repeat(84) + 'ATGAAA';

const circularDocument: PlasmidDocument = {
  id: 'circular-doc',
  name: 'Circular document',
  sequence: originSpanningSequence,
  topology: 'circular',
  annotations: [],
  provenance,
};

const linearDocument: PlasmidDocument = {
  ...circularDocument,
  id: 'linear-doc',
  name: 'Linear document',
  topology: 'linear',
};

const originSpanningEcoRiDocument: PlasmidDocument = {
  ...circularDocument,
  id: 'restriction-doc',
  sequence: 'ATTC' + 'A'.repeat(90) + 'GA',
};

const shortCircularDocument: PlasmidDocument = {
  ...circularDocument,
  id: 'short-circular-doc',
  sequence: 'AAATAAAAAATGAAA',
};

describe('canonical plasmid document analysis', () => {
  it('returns one origin-spanning circular ORF as predicted', () => {
    const result = findDocumentOrfs(circularDocument, { minLengthAa: 2 });

    expect(result.filter(orf => orf.start > orf.end)).toHaveLength(1);
    expect(result[0]).toMatchObject({
      start: 90,
      end: 6,
      frame: 1,
      strand: 1,
      protein: 'MKK*',
      completeStart: true,
      completeStop: true,
      source: 'detected',
      confidence: 'predicted',
    });
    expect(circularDocument.annotations).toEqual([]);
  });

  it('does not wrap linear analysis', () => {
    expect(findDocumentOrfs(linearDocument, { minLengthAa: 2 })).toEqual([]);
    expect(findDocumentRestrictionSites({ ...originSpanningEcoRiDocument, topology: 'linear' }))
      .not.toContainEqual(expect.objectContaining({ crossesOrigin: true }));
  });

  it('finds a short circular ORF when its requested minimum is met', () => {
    expect(findDocumentOrfs(shortCircularDocument, { minLengthAa: 2 }))
      .toContainEqual(expect.objectContaining({ start: 9, end: 6, protein: 'MKK*' }));
  });

  it('reports circular restriction sites with zero-based origin-crossing ranges', () => {
    expect(findDocumentRestrictionSites(originSpanningEcoRiDocument)).toContainEqual(expect.objectContaining({
      enzyme: 'EcoRI',
      start: 94,
      end: 4,
      cutPosition: 95,
      crossesOrigin: true,
      source: 'detected',
      confidence: 'predicted',
    }));
  });

  it('only promotes an ORF when explicitly converted to an annotation', () => {
    const [orf] = findDocumentOrfs(circularDocument, { minLengthAa: 2 });
    const annotation = orfToAnnotation(orf!);

    expect(annotation).toMatchObject({
      type: 'CDS',
      source: 'detected',
      confidence: 'predicted',
      location: {
        strand: 1,
        segments: [{ start: 90, end: 96 }, { start: 0, end: 6 }],
      },
      qualifiers: { translation: ['MKK*'] },
    });
    expect(annotation.id).not.toBe(orf!.id);
    expect(circularDocument.annotations).toEqual([]);
  });

  it('gives each explicit ORF promotion a new annotation ID', () => {
    const [orf] = findDocumentOrfs(circularDocument, { minLengthAa: 2 });

    expect(orfToAnnotation(orf!).id).not.toBe(orfToAnnotation(orf!).id);
  });
});
