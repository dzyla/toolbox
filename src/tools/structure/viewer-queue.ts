/**
 * Serialises everything that changes what Mol* shows. Loads, representation changes and colour
 * changes run one at a time, in call order, so a style change made while a load is pending applies
 * after it (never racing it) and before any later load; later loads use the chosen style.
 * No Mol* imports here, so the ordering is unit-testable without WebGL.
 */
import type { StructureFormat } from '@/core/structure';
import type { ColorScale, Coloring, Representation } from './MolstarViewer';

export interface ViewerStyle {
  representation: Representation;
  /** null (the default, or "Default" picked again): Mol*'s per-representation preset colouring. */
  coloring: Coloring | null;
  colorScale: ColorScale;
  hydrogens: boolean;
}

export interface ViewerOps {
  isDisposed(): boolean;
  /** `isCurrent()` turns false once a newer load is queued; the load should stop at its next step. */
  load(isCurrent: () => boolean, data: string, format: StructureFormat, label: string, modelIndex: number, style: ViewerStyle): Promise<void>;
  applyRepresentation(style: ViewerStyle): Promise<void>;
  applyColoring(style: ViewerStyle): Promise<void>;
  applyHydrogens(style: ViewerStyle): Promise<void>;
}

export interface ViewerQueue {
  load(data: string, format: StructureFormat, label: string, modelIndex: number): Promise<void>;
  setRepresentation(r: Representation): Promise<void>;
  setColoring(c: Coloring | null, scale?: ColorScale): Promise<void>;
  setHydrogens(show: boolean): Promise<void>;
}

export function createViewerQueue(ops: ViewerOps): ViewerQueue {
  let generation = 0;
  let tail: Promise<void> = Promise.resolve();
  const style: ViewerStyle = { representation: 'auto', coloring: null, colorScale: {}, hydrogens: true };

  const enqueue = (task: () => Promise<void> | undefined): Promise<void> => {
    const run = tail.then(() => (ops.isDisposed() ? undefined : task()));
    tail = run.catch(() => undefined);
    return run;
  };

  return {
    load(data, format, label, modelIndex) {
      const gen = ++generation;
      const isCurrent = () => gen === generation && !ops.isDisposed();
      // A load superseded before its turn is skipped; one superseded mid-way stops at its next step.
      return enqueue(() => (isCurrent() ? ops.load(isCurrent, data, format, label, modelIndex, style) : undefined));
    },
    setRepresentation(r) {
      style.representation = r;
      return enqueue(() => ops.applyRepresentation(style));
    },
    setColoring(c, scale = {}) {
      style.coloring = c;
      style.colorScale = scale;
      return enqueue(() => ops.applyColoring(style));
    },
    setHydrogens(show) {
      style.hydrogens = show;
      return enqueue(() => ops.applyHydrogens(style));
    },
  };
}
