import { useEffect, useRef, useState } from 'preact/hooks';

// Minimal shape of the lazily loaded Mol* viewer (the package is a large, browser-only chunk).
interface MolstarViewerHandle {
  loadStructureFromData(data: string, format: 'pdb', options?: { dataLabel?: string }): Promise<void>;
  dispose(): void;
}

export interface MolstarViewerProps {
  rcsbId: string;
  /** PDB-format text to render locally. Nothing is sent to molstar.org. */
  pdbText?: string;
  onSelectPdb?: (id: string) => void;
  alignedPdbUrl?: string | null;
  height?: number;
}

const BENCHMARK_PRESETS = [
  { id: '1CRN', label: '1CRN (Crambin)', desc: '46 aa plant hydrophobic protein (0.83 Å)' },
  { id: '1L2Y', label: '1L2Y (Trp-Cage)', desc: '20 aa NMR mini-protein' },
  { id: '1AKI', label: '1AKI (Lysozyme)', desc: '129 aa globular model enzyme' },
  { id: '1UBQ', label: '1UBQ (Ubiquitin)', desc: '76 aa regulatory signaling fold' },
  { id: '4HHB', label: '4HHB (Hemoglobin)', desc: 'Allosteric tetrameric complex' },
  { id: '6M0J', label: '6M0J (Spike RBD/ACE2)', desc: 'Viral receptor-binding complex' },
];

export function MolstarViewer({
  rcsbId,
  pdbText,
  onSelectPdb,
  height = 580,
}: MolstarViewerProps) {
  const activeId = (rcsbId || '1CRN').trim().toUpperCase();
  const [currentId, setCurrentId] = useState<string>(activeId);
  const [reloadKey, setReloadKey] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string>('');
  const [showControls, setShowControls] = useState<boolean>(false);
  const [isExpanded, setIsExpanded] = useState<boolean>(false);
  const hostRef = useRef<HTMLDivElement>(null);

  const displayId = activeId || currentId;
  // External link only: the embedded viewer below runs locally from the app bundle.
  const molstarUrl = `https://molstar.org/viewer/?pdb=${encodeURIComponent(displayId)}`;
  const isTestEnv = (typeof process !== 'undefined' && process.env?.NODE_ENV === 'test') || (typeof navigator !== 'undefined' && /happy-dom|jsdom/i.test(navigator.userAgent));

  const currentHeight = isExpanded ? Math.max(height, 800) : height;

  // (Re)create the local Mol* viewer whenever the structure, panel mode or reload key changes.
  useEffect(() => {
    const host = hostRef.current;
    if (isTestEnv || !host || !pdbText) {
      setIsLoading(false);
      return;
    }
    let cancelled = false;
    let viewer: MolstarViewerHandle | null = null;
    setIsLoading(true);
    setLoadError('');
    (async () => {
      try {
        const [{ Viewer }] = await Promise.all([
          import('molstar/lib/apps/viewer/app'),
          import('molstar/build/viewer/molstar.css'),
        ]);
        if (cancelled) return;
        const v = await Viewer.create(host, {
          layoutIsExpanded: false,
          layoutShowControls: showControls,
          layoutShowRemoteState: false,
          layoutShowSequence: showControls,
          layoutShowLog: false,
          layoutShowLeftPanel: showControls,
          collapseLeftPanel: !showControls,
        });
        viewer = v as unknown as MolstarViewerHandle;
        if (cancelled) { v.dispose(); return; }
        await v.loadStructureFromData(pdbText, 'pdb', { dataLabel: displayId });
        if (!cancelled) setIsLoading(false);
      } catch (err) {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : 'Could not start the 3D viewer');
          setIsLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
      try { viewer?.dispose(); } catch { /* already disposed */ }
      if (host) host.replaceChildren();
    };
  }, [pdbText, displayId, showControls, reloadKey, isTestEnv]);

  function handleSwitchPdb(id: string) {
    setCurrentId(id);
    if (onSelectPdb) onSelectPdb(id);
  }

  function handleReload() {
    setReloadKey(k => k + 1);
  }

  function handleToggleControls() {
    setShowControls(prev => !prev);
  }

  return (
    <div class="rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 overflow-hidden shadow-xs">
      {/* Viewer Header & Controls */}
      <div class="p-3 sm:p-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/50 flex flex-wrap items-center justify-between gap-2.5">
        <div class="flex items-center gap-2">
          <span class="font-bold text-xs sm:text-sm text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
            <span class="text-base">🧬</span> Mol* 3D Structure Viewer (Full Canvas 3D)
          </span>
          <span class="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
            WebGL Mol*
          </span>
          {!showControls && (
            <span class="text-[10px] font-semibold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 px-2 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800">
              Clean 3D Mode
            </span>
          )}
        </div>

        <div class="flex items-center gap-1.5 sm:gap-2">
          <button
            type="button"
            onClick={handleToggleControls}
            class={`px-2.5 py-1 text-xs font-semibold rounded-lg border transition ${
              showControls
                ? 'bg-indigo-50 border-indigo-300 text-indigo-700 dark:bg-indigo-950 dark:border-indigo-700 dark:text-indigo-300'
                : 'bg-white border-slate-200 text-slate-700 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
            }`}
            title={showControls ? 'Switch back to clean unobstructed 3D structure view' : 'Reveal Mol* tree hierarchy and styling tool panels'}
          >
            {showControls ? '👁️ Clean Structure View' : '⚙️ Mol* Tool Panels'}
          </button>

          <button
            type="button"
            onClick={() => setIsExpanded(prev => !prev)}
            class="px-2.5 py-1 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition"
            title={isExpanded ? 'Restore standard panel height' : 'Expand panel height for large viewing'}
          >
            {isExpanded ? '↕ Standard Height' : '⤢ Large Canvas'}
          </button>

          <button
            type="button"
            onClick={handleReload}
            class="px-2.5 py-1 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition"
            title="Reload 3D viewer"
          >
            ↻ Reload
          </button>

          <a
            href={molstarUrl}
            target="_blank"
            rel="noopener noreferrer"
            class="px-2.5 py-1 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white transition inline-flex items-center gap-1 shadow-2xs"
            title="Open full-featured Mol* viewer in separate browser window"
          >
            <span>External Mol*</span>
            <span class="text-[10px]">↗</span>
          </a>
        </div>
      </div>

      {/* Preset Structure Quick Bar */}
      <div class="px-3 py-2 border-b border-slate-100 dark:border-slate-800/80 bg-slate-50/30 dark:bg-slate-900/40 flex flex-wrap items-center gap-1.5 text-xs">
        <span class="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mr-1">RCSB Presets:</span>
        {BENCHMARK_PRESETS.map(p => (
          <button
            key={p.id}
            type="button"
            onClick={() => handleSwitchPdb(p.id)}
            class={`px-2.5 py-1 rounded-md text-[11px] font-medium transition ${
              displayId === p.id
                ? 'bg-accent-600 text-white shadow-2xs font-semibold'
                : 'bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-300'
            }`}
            title={`${p.label} — ${p.desc}`}
          >
            {p.id}
          </button>
        ))}
        <span class="text-slate-300 dark:text-slate-700 select-none">|</span>
        <span class="text-[11px] text-slate-500 dark:text-slate-400">
          Viewing PDB: <strong class="font-mono text-slate-900 dark:text-slate-100 text-xs font-bold">{displayId}</strong>
        </span>
      </div>

      {/* Embedded Mol* WebGL Viewer */}
      <div class="relative w-full bg-slate-950 transition-all duration-200" style={{ height: `${currentHeight}px` }}>
        {isLoading && (
          <div class="absolute inset-0 flex flex-col items-center justify-center bg-slate-900/90 text-slate-300 z-10 space-y-2 pointer-events-none">
            <div class="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
            <span class="text-xs font-medium">Starting local Mol* viewer for {displayId}…</span>
          </div>
        )}
        {loadError && (
          <div role="alert" class="absolute inset-0 flex items-center justify-center bg-slate-900/90 text-rose-300 z-10 p-4 text-xs text-center">
            {loadError}
          </div>
        )}
        <div
          ref={hostRef}
          role="img"
          aria-label={`Mol* 3D Structure Viewer (3D Backbone Canvas) - ${displayId}`}
          class="relative w-full h-full"
        />
      </div>

      {/* Viewer Capabilities & Guidance Footer */}
      <div class="p-3 bg-slate-50/80 dark:bg-slate-950/40 border-t border-slate-100 dark:border-slate-800 text-[11px] text-slate-500 dark:text-slate-400 flex flex-wrap items-center justify-between gap-2">
        <div class="flex items-center gap-3">
          <span>🎮 <strong>Left Drag</strong>: Rotate 3D</span>
          <span>🖱️ <strong>Right Drag</strong>: Pan</span>
          <span>📜 <strong>Scroll</strong>: Zoom</span>
          <span>✨ Secondary structure cartoons, ligands &amp; chains</span>
        </div>
        <span class="text-slate-500 dark:text-slate-400">Mol* runs locally in your browser (molstar.org)</span>
      </div>
    </div>
  );
}
