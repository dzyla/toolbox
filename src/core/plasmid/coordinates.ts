export type Strand = 1 | -1 | 0;

/** A zero-based, half-open interval within one sequence traversal. */
export interface Segment {
  start: number;
  end: number;
}

/** Ordered segments in biological 5′→3′ order. Multiple segments represent joins or an origin crossing. */
export interface Location {
  segments: Segment[];
  strand: Strand;
}

export interface LocationValidation {
  valid: boolean;
  reason?: string;
}

export function toDisplayRange(segment: Segment): { start: number; end: number } {
  return { start: segment.start + 1, end: segment.end };
}

export function validateLocation(location: Location, sequenceLength: number): LocationValidation {
  if (!Number.isInteger(sequenceLength) || sequenceLength <= 0) {
    return { valid: false, reason: 'Sequence length must be a positive integer.' };
  }
  if (!location.segments.length) {
    return { valid: false, reason: 'A location must contain at least one segment.' };
  }
  for (const segment of location.segments) {
    if (!Number.isInteger(segment.start) || !Number.isInteger(segment.end)) {
      return { valid: false, reason: 'Segment coordinates must be integers.' };
    }
    if (segment.start < 0 || segment.end > sequenceLength || segment.start >= segment.end) {
      return { valid: false, reason: 'Segment is empty or outside the sequence bounds.' };
    }
  }
  return { valid: true };
}

function reverseComplement(sequence: string): string {
  const complements: Record<string, string> = {
    A: 'T', T: 'A', G: 'C', C: 'G', N: 'N',
    a: 't', t: 'a', g: 'c', c: 'g', n: 'n',
  };
  return sequence.split('').reverse().map(base => complements[base] ?? base).join('');
}

export function locationSequence(sequence: string, location: Location): string {
  const validation = validateLocation(location, sequence.length);
  if (!validation.valid) throw new Error(validation.reason);

  const selected = location.segments.map(segment => sequence.slice(segment.start, segment.end)).join('');
  return location.strand === -1 ? reverseComplement(selected) : selected;
}
