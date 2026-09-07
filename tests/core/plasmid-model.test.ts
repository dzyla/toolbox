import { describe, expect, it } from 'vitest';
import {
  locationSequence,
  toDisplayRange,
  validateLocation,
  type Location,
} from '@/core/plasmid/coordinates';
import { validateDocument, type PlasmidDocument } from '@/core/plasmid/model';
import { legacyPlasmidToDocument } from '@/core/plasmid/legacy';

describe('plasmid coordinate model', () => {
  it('represents a circular origin-crossing location in biological order', () => {
    const location: Location = {
      strand: 1,
      segments: [{ start: 6, end: 9 }, { start: 0, end: 3 }],
    };

    expect(validateLocation(location, 9).valid).toBe(true);
    expect(locationSequence('AAACCCGGG', location)).toBe('GGGAAA');
    expect(toDisplayRange(location.segments[0]!)).toEqual({ start: 7, end: 9 });
  });

  it('returns the reverse-complemented sequence for a reverse-strand location', () => {
    const location: Location = {
      strand: -1,
      segments: [{ start: 6, end: 9 }, { start: 0, end: 3 }],
    };

    expect(locationSequence('AAACCCGGG', location)).toBe('TTTCCC');
  });

  it('rejects an empty or out-of-bounds segment', () => {
    expect(validateLocation({ strand: 1, segments: [{ start: 3, end: 3 }] }, 9)).toMatchObject({ valid: false });
    expect(validateLocation({ strand: 1, segments: [{ start: 8, end: 10 }] }, 9)).toMatchObject({ valid: false });
  });

  it('rejects duplicate annotation identities before rendering', () => {
    const document: PlasmidDocument = {
      id: 'demo',
      name: 'Demo',
      sequence: 'AAACCCGGG',
      topology: 'circular',
      annotations: [
        { id: 'feature-1', name: 'first', type: 'misc_feature', location: { strand: 1, segments: [{ start: 0, end: 3 }] }, qualifiers: {}, source: 'manual' },
        { id: 'feature-1', name: 'second', type: 'misc_feature', location: { strand: 1, segments: [{ start: 3, end: 6 }] }, qualifiers: {}, source: 'manual' },
      ],
      provenance: { format: 'fasta', parserVersion: 'test', warnings: [] },
    };

    expect(validateDocument(document)).toMatchObject({ valid: false, reason: /duplicate annotation id/i });
  });

  it('adapts existing plasmid features without changing their display coordinates', () => {
    const document = legacyPlasmidToDocument({
      id: 'legacy', name: 'Legacy', length: 9, seq: 'AAACCCGGG', isCircular: true,
      features: [{ id: 'gene', name: 'Gene', type: 'cds', start: 7, end: 9, strand: 1, notes: 'imported before migration' }],
    });

    expect(document.topology).toBe('circular');
    expect(document.annotations[0]?.location.segments).toEqual([{ start: 6, end: 9 }]);
    expect(document.annotations[0]?.qualifiers.note).toEqual(['imported before migration']);
  });
});
