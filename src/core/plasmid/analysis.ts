import {
  findORFs,
  findRestrictionSites,
  RESTRICTION_ENZYMES,
  type RestrictionSite,
} from './index';
import type { Annotation, PlasmidDocument } from './model';
import type { Location } from './coordinates';

let promotionSequence = 0;

export interface DocumentOrf {
  id: string;
  /** Zero-based, half-open selection coordinates. start > end crosses a circular origin. */
  start: number;
  end: number;
  frame: number;
  strand: 1 | -1;
  lengthBp: number;
  lengthAa: number;
  protein: string;
  completeStart: boolean;
  completeStop: boolean;
  source: 'detected';
  confidence: 'predicted';
  location: Location;
}

export interface FindDocumentOrfsOptions {
  minLengthAa?: number;
  maxLengthAa?: number;
}

export interface DocumentRestrictionSite extends Omit<RestrictionSite, 'cutPosition'> {
  /** Zero-based cleavage boundary in the canonical document. */
  cutPosition: number;
  /** Zero-based, half-open recognition coordinates. start > end crosses a circular origin. */
  start: number;
  end: number;
  crossesOrigin: boolean;
  source: 'detected';
  confidence: 'predicted';
  location: Location;
}

function circularCoordinate(value: number, sequenceLength: number): number {
  return ((value % sequenceLength) + sequenceLength) % sequenceLength;
}

function locationForRange(start: number, end: number, sequenceLength: number, fullCircle = false): Location {
  if (start > end || (fullCircle && start === end)) {
    if (start === 0) return { strand: 1, segments: [{ start: 0, end: sequenceLength }] };
    return {
      strand: 1,
      segments: [{ start, end: sequenceLength }, { start: 0, end }],
    };
  }
  return { strand: 1, segments: [{ start, end }] };
}

/**
 * Find ORFs against a canonical document. Results are derived predictions and
 * do not modify document annotations.
 */
export function findDocumentOrfs(document: PlasmidDocument, options: FindDocumentOrfsOptions = {}): DocumentOrf[] {
  const legacyOrfs = findORFs(
    document.sequence,
    options.minLengthAa ?? 30,
    document.topology === 'circular',
    options.maxLengthAa,
  );
  const sequenceLength = document.sequence.length;
  const seen = new Set<string>();

  return legacyOrfs.flatMap(orf => {
    const start = orf.start - 1;
    const end = orf.end;
    const key = `${orf.frame}:${orf.strand}:${start}:${end}`;
    if (seen.has(key)) return [];
    seen.add(key);

    return [{
      id: `detected-${orf.id}`,
      start,
      end,
      frame: orf.frame,
      strand: orf.strand,
      lengthBp: orf.lengthBp,
      lengthAa: orf.lengthAa,
      protein: orf.protein,
      completeStart: true,
      completeStop: true,
      source: 'detected' as const,
      confidence: 'predicted' as const,
      location: { ...locationForRange(start, end, sequenceLength, orf.lengthBp === sequenceLength), strand: orf.strand },
    }];
  });
}

/** Find restriction sites against document topology with canonical coordinates. */
export function findDocumentRestrictionSites(document: PlasmidDocument): DocumentRestrictionSite[] {
  const sequenceLength = document.sequence.length;
  if (!sequenceLength) return [];

  return findRestrictionSites(document.sequence, document.topology === 'circular').map(site => {
    const enzyme = RESTRICTION_ENZYMES.find(candidate => candidate.enzyme === site.enzyme);
    const start = circularCoordinate(site.cutPosition - (enzyme?.cutOffset ?? 0), sequenceLength);
    const unwrappedEnd = start + site.recognitionSeq.length;
    const crossesOrigin = document.topology === 'circular' && unwrappedEnd > sequenceLength;
    const end = crossesOrigin ? unwrappedEnd - sequenceLength : unwrappedEnd;

    return {
      ...site,
      cutPosition: site.cutPosition % sequenceLength,
      start,
      end,
      crossesOrigin,
      source: 'detected',
      confidence: 'predicted',
      location: locationForRange(start, end, sequenceLength),
    };
  });
}

/** Explicitly promote a derived ORF prediction to an editable CDS annotation. */
export function orfToAnnotation(orf: DocumentOrf): Annotation {
  promotionSequence += 1;
  return {
    id: `predicted-cds-${orf.id}-${promotionSequence}`,
    name: `Predicted ORF ${orf.frame > 0 ? '+' : ''}${orf.frame}`,
    type: 'CDS',
    location: {
      strand: orf.location.strand,
      segments: orf.location.segments.map(segment => ({ ...segment })),
    },
    qualifiers: { translation: [orf.protein] },
    source: 'detected',
    confidence: 'predicted',
  };
}
