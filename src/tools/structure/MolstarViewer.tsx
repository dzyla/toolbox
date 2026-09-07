import { useState } from 'preact/hooks';

export interface MolstarViewerProps {
  rcsbId: string;
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
  onSelectPdb,
  height = 580,
}: MolstarViewerProps) {
  const activeId = (rcsbId || '1CRN').trim().toUpperCase();
  const [currentId, setCurrentId] = useState<string>(activeId);
  const [iframeKey, setIframeKey] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [showControls, setShowControls] = useState<boolean>(false);
  const [isExpanded, setIsExpanded] = useState<boolean>(false);

  // Sync if prop changes
  const displayId = activeId || currentId;
  // Default to hide-controls=1 so 3D structure is front and center without sidebars covering it
  const molstarUrl = `https://molstar.org/viewer/?pdb=${encodeURIComponent(displayId)}&hide-controls=${showControls ? '0' : '1'}`;
  const isTestEnv = (typeof process !== 'undefined' && process.env?.NODE_ENV === 'test') || (typeof navigator !== 'undefined' && /happy-dom|jsdom/i.test(navigator.userAgent));
  const iframeSrc = isTestEnv ? 'about:blank' : molstarUrl;

  const currentHeight = isExpanded ? Math.max(height, 800) : height;

  function handleSwitchPdb(id: string) {
    setCurrentId(id);
    setIsLoading(true);
    setIframeKey(k => k + 1);
    if (onSelectPdb) onSelectPdb(id);
  }

  function handleReload() {
    setIsLoading(true);
    setIframeKey(k => k + 1);
  }

  function handleToggleControls() {
    setShowControls(prev => !prev);
    setIsLoading(true);
    setIframeKey(k => k + 1);
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
            <span class="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 px-2 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800">
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
        <span class="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mr-1">RCSB Presets:</span>
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
            <span class="text-xs font-medium">Initializing Mol* WebGL Viewer for {displayId}…</span>
          </div>
        )}
        <iframe
          key={iframeKey}
          src={iframeSrc}
          title={`Mol* 3D Structure Viewer (3D Backbone Canvas) - ${displayId}`}
          class="w-full h-full border-0 block"
          onLoad={() => setIsLoading(false)}
          allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture; fullscreen"
        />
      </div>

      {/* Viewer Capabilities & Guidance Footer */}
      <div class="p-3 bg-slate-50/80 dark:bg-slate-950/40 border-t border-slate-100 dark:border-slate-800 text-[11px] text-slate-500 flex flex-wrap items-center justify-between gap-2">
        <div class="flex items-center gap-3">
          <span>🎮 <strong>Left Drag</strong>: Rotate 3D</span>
          <span>🖱️ <strong>Right Drag</strong>: Pan</span>
          <span>📜 <strong>Scroll</strong>: Zoom</span>
          <span>✨ Secondary structure cartoons, ligands &amp; chains</span>
        </div>
        <span class="text-slate-400">Powered by Mol* (molstar.org)</span>
      </div>
    </div>
  );
}
