import type { Annotation, PlasmidDocument } from './model';
import { validateDocument } from './model';

function validated(document: PlasmidDocument): PlasmidDocument {
  const result = validateDocument(document);
  if (!result.valid) throw new Error(result.reason);
  return document;
}

/** Replace an annotation immutably, retaining the document's imported metadata. */
export function replaceAnnotation(document: PlasmidDocument, annotation: Annotation): PlasmidDocument {
  if (!document.annotations.some(current => current.id === annotation.id)) {
    throw new Error(`Annotation does not exist: ${annotation.id}`);
  }
  return validated({ ...document, annotations: document.annotations.map(current => current.id === annotation.id ? annotation : current) });
}

export function deleteAnnotation(document: PlasmidDocument, annotationId: string): PlasmidDocument {
  if (!document.annotations.some(annotation => annotation.id === annotationId)) {
    throw new Error(`Annotation does not exist: ${annotationId}`);
  }
  return { ...document, annotations: document.annotations.filter(annotation => annotation.id !== annotationId) };
}

export function addAnnotation(document: PlasmidDocument, annotation: Annotation): PlasmidDocument {
  if (document.annotations.some(current => current.id === annotation.id)) {
    throw new Error(`Duplicate annotation ID: ${annotation.id}`);
  }
  return validated({ ...document, annotations: [...document.annotations, annotation] });
}
