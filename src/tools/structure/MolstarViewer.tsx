import { useEffect, useRef, useState } from 'preact/hooks';
import type { ResidueRef, StructureFormat } from '@/core/structure';
import type { MolstarEngine } from './molstarEngine';

/** 'auto' is Mol*'s size-based preset (cartoon, or a coarse surface for very large entries). */
export type Representation = 'auto' | 'cartoon' | 'surface' | 'ball-and-stick' | 'spacefill';
/** Mol* colour theme names; 'uncertainty' is labelled "B-factor" in the UI. */
export type Coloring = 'chain-id' | 'entity-id' | 'secondary-structure' | 'residue-name' | 'uncertainty';

export interface MolstarHandle {
  load(data: string, format: StructureFormat, label: string, modelIndex: number): Promise<void>;
  setRepresentation(r: Representation): Promise<void>;
  setColoring(c: Coloring): Promise<void>;
  highlight(residues: ResidueRef[]): void;          // [] clears
  select(residues: ResidueRef[]): void;             // [] clears
  focus(residues: ResidueRef[]): void;              // camera to these; [] resets the view
  snapshot(): Promise<Blob>;                        // PNG
}

export interface MolstarViewerProps {
  label: string;
  height: number;
  showControls: boolean;
  onReady(handle: MolstarHandle): void;
  onResidueClick?(r: ResidueRef | null): void;
  onResidueHover?(r: ResidueRef | null): void;
}

const isTestEnv = (typeof process !== 'undefined' && process.env?.NODE_ENV === 'test')
  || (typeof navigator !== 'undefined' && /happy-dom|jsdom/i.test(navigator.userAgent));

/** Test environments have no WebGL: the handle resolves immediately and does nothing. */
const NOOP_HANDLE: MolstarHandle = {
  load: async () => undefined,
  setRepresentation: async () => undefined,
  setColoring: async () => undefined,
  highlight: () => undefined,
  select: () => undefined,
  focus: () => undefined,
  snapshot: async () => new Blob([], { type: 'image/png' }),
};

/**
 * One long-lived local Mol* plugin (nothing is sent to molstar.org). It is created when this
 * component mounts and disposed when it unmounts; structures are swapped in through the handle
 * passed to `onReady`, and `height` / `showControls` only change the layout in place.
 * After each completed load the host carries `data-loaded-label` (read back from the Mol* state
 * tree) and `data-load-count`.
 */
export function MolstarViewer({ label, height, showControls, onReady, onResidueClick, onResidueHover }: MolstarViewerProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<MolstarEngine | null>(null);
  const latest = useRef({ onReady, onResidueClick, onResidueHover, showControls });
  latest.current = { onReady, onResidueClick, onResidueHover, showControls };
  const [status, setStatus] = useState<'starting' | 'ready' | 'error'>(isTestEnv ? 'ready' : 'starting');
  const [error, setError] = useState('');

  // Mount only: one plugin for the life of the component.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    if (isTestEnv) {
      latest.current.onReady(NOOP_HANDLE);
      return;
    }
    let unmounted = false;
    import('./molstarEngine')
      .then(({ createMolstarEngine }) => createMolstarEngine(host, {
        showControls: latest.current.showControls,
        onResidueClick: r => latest.current.onResidueClick?.(r),
        onResidueHover: r => latest.current.onResidueHover?.(r),
      }))
      .then(engine => {
        if (unmounted) { engine.dispose(); return; }
        engineRef.current = engine;
        engine.setShowControls(latest.current.showControls);
        setStatus('ready');
        latest.current.onReady(engine.handle);
      })
      .catch((err: unknown) => {
        if (unmounted) return;
        setError(err instanceof Error ? err.message : 'Could not start the 3D viewer');
        setStatus('error');
      });
    return () => {
      unmounted = true;
      engineRef.current?.dispose();
      engineRef.current = null;
    };
  }, []);

  useEffect(() => { engineRef.current?.setShowControls(showControls); }, [showControls]);
  useEffect(() => {
    const id = requestAnimationFrame(() => engineRef.current?.resize());
    return () => cancelAnimationFrame(id);
  }, [height]);

  return (
    <div class="relative w-full overflow-hidden bg-slate-950" style={{ height: `${height}px` }} ref={hostRef} role="region" aria-label={`Mol* 3D viewer: ${label}`}>
      {status === 'starting' && (
        <div class="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-slate-900/90 text-slate-300 pointer-events-none">
          <div class="h-8 w-8 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
          <span class="text-xs font-medium">Starting the local Mol* viewer…</span>
        </div>
      )}
      {status === 'error' && (
        <div role="alert" class="absolute inset-0 z-10 flex items-center justify-center bg-slate-900/90 p-4 text-center text-xs text-rose-300">
          {error}
        </div>
      )}
    </div>
  );
}
