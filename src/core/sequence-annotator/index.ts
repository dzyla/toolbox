/** Durable, linear sequence annotation primitives. Coordinates are 1-based inclusive. */

export type SequenceKind = 'protein' | 'DNA' | 'RNA';
export { sequenceTypeHint, type SequenceTypeHint } from './type';
export { foldQuickRna, QUICK_RNA_MAX_LENGTH, type QuickRnaStructure } from './rna-structure';
export type AnnotationEvidence = 'user' | 'imported';

export interface Selection {
  start: number;
  end: number;
}

export interface SequenceAnnotation {
  id: string;
  name: string;
  type: string;
  start: number;
  end: number;
  color: string;
  note: string;
  evidence: AnnotationEvidence;
}

export function normaliseSelection(start: number, end: number, length: number): Selection | null {
  if (!Number.isInteger(start) || !Number.isInteger(end) || length < 1) return null;
  const first = Math.max(1, Math.min(start, end));
  const last = Math.min(length, Math.max(start, end));
  return first <= last ? { start: first, end: last } : null;
}

/** Removes invalid ranges and clamps annotations that overlap the sequence end. */
export function validateAnnotations(annotations: SequenceAnnotation[], length: number): SequenceAnnotation[] {
  if (length < 1) return [];
  return annotations.flatMap(annotation => {
    if (!annotation.id || !annotation.name.trim() || !Number.isInteger(annotation.start) || !Number.isInteger(annotation.end)) return [];
    const start = Math.max(1, annotation.start);
    const end = Math.min(length, annotation.end);
    return start <= end ? [{ ...annotation, start, end }] : [];
  });
}

/**
 * Keeps annotations attached to surviving sequence through one replacement edit.
 * `editStart` is the first deleted position, or the insertion point when `deleted` is 0.
 */
export function transformAnnotationsForEdit(
  annotations: SequenceAnnotation[],
  editStart: number,
  deleted: number,
  inserted: number,
  nextLength: number,
): SequenceAnnotation[] {
  const start = Math.max(1, editStart);
  const deleteCount = Math.max(0, deleted);
  const insertCount = Math.max(0, inserted);
  const deleteEnd = start + deleteCount - 1;
  const delta = insertCount - deleteCount;

  const transformed = annotations.flatMap(annotation => {
    let nextStart = annotation.start;
    let nextEnd = annotation.end;

    if (deleteCount > 0) {
      if (annotation.end < start) {
        // entirely before the deletion
      } else if (annotation.start > deleteEnd) {
        nextStart += delta;
        nextEnd += delta;
      } else {
        const survivingBefore = Math.max(0, start - annotation.start);
        const survivingAfter = Math.max(0, annotation.end - deleteEnd);
        if (survivingBefore + survivingAfter === 0) return [];
        nextStart = annotation.start < start ? annotation.start : start;
        nextEnd = nextStart + survivingBefore + survivingAfter - 1;
      }
    }

    if (insertCount > 0) {
      if (deleteCount === 0) {
        if (annotation.start >= start) {
          nextStart += insertCount;
          nextEnd += insertCount;
        } else if (annotation.end >= start) {
          nextEnd += insertCount;
        }
      } else if (annotation.start <= start && annotation.end >= start) {
        nextEnd += insertCount;
      }
    }

    return [{ ...annotation, start: nextStart, end: nextEnd }];
  });

  return validateAnnotations(transformed, nextLength);
}
