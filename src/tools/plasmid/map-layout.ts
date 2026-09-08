import type { Segment } from '@/core/plasmid/coordinates';
import type { Annotation, PlasmidTopology } from '@/core/plasmid/model';

/**
 * Return the canonical location segments used by map renderers.
 *
 * Locations are already represented as zero-based, half-open segments. A
 * circular origin crossing is therefore represented by a tail segment
 * followed by a head segment; this function deliberately does not merge or
 * reorder those segments.
 */
export function annotationSegments(annotation: Annotation): Segment[] {
  return annotation.location.segments.map(segment => ({ ...segment }));
}

interface LayoutEntry {
  annotation: Annotation;
  segments: Segment[];
  segmentIndex: number;
}

function validSegment(segment: Segment, length: number): boolean {
  return Number.isInteger(segment.start)
    && Number.isInteger(segment.end)
    && segment.start >= 0
    && segment.end <= length
    && segment.start < segment.end;
}

/**
 * Convert a segment list into drawing segments while retaining canonical
 * coordinates. Runtime callers normally provide validated Locations, but the
 * defensive split also keeps a directed `start > end` circular range safe for
 * map rendering if one arrives from an older document.
 */
function drawableSegments(annotation: Annotation, length: number, topology: PlasmidTopology): Segment[] {
  const segments = annotationSegments(annotation);
  if (topology !== 'circular') {
    return segments.filter(segment => validSegment(segment, length));
  }

  return segments.flatMap(segment => {
    if (segment.start <= segment.end) return [segment];
    return [
      { start: segment.start, end: length },
      { start: 0, end: segment.end },
    ];
  }).filter(segment => validSegment(segment, length));
}

function overlaps(left: Segment, right: Segment): boolean {
  // Half-open intervals that touch at an endpoint do not overlap.
  return left.start < right.end && right.start < left.end;
}

/**
 * Pack annotations into the first available non-overlapping lane.
 *
 * Segment ordering is independent of input order. Once one segment of an
 * annotation is encountered, all of that annotation's segments reserve the
 * chosen lane, which is important for origin-spanning circular features.
 */
export function assignAnnotationLanes(
  annotations: Annotation[],
  length: number,
  topology: PlasmidTopology,
): Map<string, number> {
  const lanes = new Map<string, number>();
  const entries: LayoutEntry[] = [];

  for (const annotation of annotations) {
    const segments = drawableSegments(annotation, length, topology);
    if (!segments.length) {
      // A validated document cannot reach this branch. Keeping an empty
      // annotation visible in lane zero is nevertheless deterministic and
      // avoids dropping an annotation identity from the layout map.
      entries.push({ annotation, segments: [], segmentIndex: 0 });
      continue;
    }
    segments.forEach((_, segmentIndex) => {
      entries.push({ annotation, segments, segmentIndex });
    });
  }

  entries.sort((left, right) => {
    const leftSegment = left.segments[left.segmentIndex];
    const rightSegment = right.segments[right.segmentIndex];
    if (!leftSegment && !rightSegment) return left.annotation.id.localeCompare(right.annotation.id);
    if (!leftSegment) return 1;
    if (!rightSegment) return -1;
    return leftSegment.start - rightSegment.start
      || leftSegment.end - rightSegment.end
      || left.annotation.id.localeCompare(right.annotation.id)
      || left.segmentIndex - right.segmentIndex;
  });

  const reservations: Segment[][] = [];
  for (const entry of entries) {
    if (lanes.has(entry.annotation.id)) continue;

    let lane = 0;
    while (entry.segments.some(segment => reservations[lane]?.some(occupied => overlaps(segment, occupied)))) {
      lane += 1;
    }
    lanes.set(entry.annotation.id, lane);
    reservations[lane] = [...(reservations[lane] ?? []), ...entry.segments];
  }

  return lanes;
}

/**
 * Return the user-facing feature label. Secondary lanes get a stable suffix
 * so overlapping features remain distinguishable without changing the stored
 * annotation name.
 */
export function displayLabel(annotation: Annotation, lane: number): string {
  const name = annotation.name.trim() || annotation.id;
  if (lane <= 0) return name;
  return `${name} · lane ${Math.trunc(lane) + 1}`;
}
