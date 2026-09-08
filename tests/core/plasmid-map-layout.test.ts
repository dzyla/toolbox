import { describe, expect, it } from 'vitest';
import type { Annotation } from '@/core/plasmid/model';
import {
  annotationSegments,
  assignAnnotationLanes,
  displayLabel,
} from '@/tools/plasmid/map-layout';

function annotation(
  id: string,
  name: string,
  segments: Array<{ start: number; end: number }>,
  strand: 1 | -1 = 1,
): Annotation {
  return {
    id,
    name,
    type: 'misc_feature',
    location: { strand, segments },
    qualifiers: {},
    source: 'manual',
  };
}

const a0to10 = annotation('a', 'first', [{ start: 0, end: 10 }]);
const a5to15 = annotation('b', 'second', [{ start: 5, end: 15 }]);
const a16to22 = annotation('c', 'third', [{ start: 16, end: 22 }]);
const wrappedAnnotation = annotation('wrapped', 'wrapped feature', [
  { start: 24, end: 30 },
  { start: 0, end: 4 },
]);

describe('plasmid annotation map layout', () => {
  it('assigns overlapping annotations to deterministic lanes', () => {
    const lanes = assignAnnotationLanes([a0to10, a5to15, a16to22], 30, 'linear');

    expect(lanes.get(a0to10.id)).toBe(0);
    expect(lanes.get(a5to15.id)).toBe(1);
    expect(lanes.get(a16to22.id)).toBe(0);
  });

  it('assigns a wrapped annotation one lane that reserves every drawing segment', () => {
    const originFeature = annotation('origin', 'origin feature', [{ start: 0, end: 3 }]);
    const tailFeature = annotation('tail', 'tail feature', [{ start: 27, end: 30 }]);
    const lanes = assignAnnotationLanes(
      [wrappedAnnotation, originFeature, tailFeature],
      30,
      'circular',
    );

    expect(lanes.get(wrappedAnnotation.id)).toBe(1);
    expect(lanes.get(originFeature.id)).toBe(0);
    expect(lanes.get(tailFeature.id)).toBe(0);
  });

  it('keeps canonical compound coordinates and splits only into drawing segments', () => {
    expect(annotationSegments(wrappedAnnotation)).toEqual([
      { start: 24, end: 30 },
      { start: 0, end: 4 },
    ]);
    expect(wrappedAnnotation.location.segments).toEqual([
      { start: 24, end: 30 },
      { start: 0, end: 4 },
    ]);
  });

  it('includes the lane in labels only when a collision lane needs disambiguation', () => {
    expect(displayLabel(a0to10, 0)).toBe('first');
    expect(displayLabel(a5to15, 1)).toBe('second · lane 2');
  });
});
