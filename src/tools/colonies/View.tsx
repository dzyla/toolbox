import { useState, useRef, useEffect, useMemo } from 'preact/hooks';
import {
  calculateCfu,
  autoDetectColonies,
  computeSizeDistribution,
  DEFAULT_COLONY_CATEGORIES,
  type ColonySpot,
  type ColonyCategory,
} from '@/core/counting';
import { ToolLayout } from '@/app/components/ToolLayout';
import { SciencePanel, scienceText } from '@/app/components/SciencePanel';
import { ActionBar } from '@/app/components/ActionBar';
import { useUrlState } from '@/lib/url-state';
import { SCIENCE } from './science';

interface State {
  volumePlatedUl: number;
  dilutionExponent: number; // e.g. 4 for 10^4
  minCertainty: number; // 0.1 to 0.95
  minDiameter: number;  // px
  maxDiameter: number;  // px
  minDistance: number;  // min separation in px
  dishMarginPct: number; // rim margin exclusion %
  showSizeHistogram: boolean;
  showOverlayLabels: boolean;
}

const DEFAULTS: State = {
  volumePlatedUl: 100,
  dilutionExponent: 4,
  minCertainty: 0.50,
  minDiameter: 4,
  maxDiameter: 50,
  minDistance: 5,
  dishMarginPct: 15,
  showSizeHistogram: true,
  showOverlayLabels: false,
};

export default function ColoniesView() {
  const [stateSig, shareUrl] = useUrlState<State>('colonies', DEFAULTS);
  const s = stateSig.value;
  const set = (patch: Partial<State>) => { stateSig.value = { ...stateSig.value, ...patch }; };

  const [allDetected, setAllDetected] = useState<ColonySpot[]>([]);
  const [manualSpots, setManualSpots] = useState<ColonySpot[]>([]);
  const [hoveredColony, setHoveredColony] = useState<ColonySpot | null>(null);
  const [categories] = useState<ColonyCategory[]>(DEFAULT_COLONY_CATEGORIES);
  const [imageSrc, setImageSrc] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  // Active colonies filtered by user certainty and size thresholds
  const activeColonies = useMemo(() => {
    const filteredAuto = allDetected.filter(c => {
      const diam = (c.radius || 4) * 2;
      const cert = c.certainty ?? 1.0;
      return cert >= s.minCertainty && diam >= s.minDiameter && diam <= s.maxDiameter;
    });
    return [...filteredAuto, ...manualSpots];
  }, [allDetected, manualSpots, s.minCertainty, s.minDiameter, s.maxDiameter]);

  const sizeStats = useMemo(() => {
    return computeSizeDistribution(activeColonies);
  }, [activeColonies]);

  const dilutionFactor = Math.pow(10, s.dilutionExponent);
  const volumePlatedMl = s.volumePlatedUl / 1000;

  const cfuResult = useMemo(() => {
    try {
      return calculateCfu({
        coloniesCounted: activeColonies.length,
        volumePlatedMl,
        dilutionFactor,
      });
    } catch (err) {
      return { error: (err as Error).message };
    }
  }, [activeColonies.length, volumePlatedMl, dilutionFactor]);

  // Initial draw & automatic detection on synthetic agar plate or custom image
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    if (imageSrc) {
      const img = new Image();
      img.onload = () => {
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        runAutoDetection(ctx, canvas.width, canvas.height);
      };
      img.src = imageSrc;
    } else {
      drawSyntheticPlate(ctx, canvas.width, canvas.height);
      runAutoDetection(ctx, canvas.width, canvas.height);
    }
  }, [imageSrc, s.minDistance, s.dishMarginPct]);

  function drawSyntheticPlate(ctx: CanvasRenderingContext2D, width: number, height: number) {
    const cx = width / 2;
    const cy = height / 2;
    const r = 215;

    // Background petri dish rim
    ctx.fillStyle = '#f1f5f9';
    ctx.fillRect(0, 0, width, height);

    ctx.beginPath();
    ctx.arc(cx, cy, r + 6, 0, 2 * Math.PI);
    ctx.fillStyle = '#cbd5e1';
    ctx.fill();

    // Agar surface gradient
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, 2 * Math.PI);
    const grad = ctx.createRadialGradient(cx, cy, 30, cx, cy, r);
    grad.addColorStop(0, '#fef08a');
    grad.addColorStop(1, '#eab308');
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 4;
    ctx.stroke();

    // Draw ~28 synthetic colonies of diverse sizes and contrasts for immediate testing
    const syntheticCoords = [
      { x: 230, y: 160, r: 8, alpha: 0.95 },
      { x: 280, y: 190, r: 10, alpha: 0.98 },
      { x: 190, y: 220, r: 6, alpha: 0.90 },
      { x: 330, y: 220, r: 9, alpha: 0.96 },
      { x: 240, y: 250, r: 14, alpha: 0.99 },
      { x: 290, y: 270, r: 7, alpha: 0.92 },
      { x: 160, y: 280, r: 11, alpha: 0.97 },
      { x: 370, y: 270, r: 8, alpha: 0.94 },
      { x: 210, y: 310, r: 6, alpha: 0.88 },
      { x: 270, y: 330, r: 12, alpha: 0.98 },
      { x: 320, y: 340, r: 7, alpha: 0.91 },
      { x: 180, y: 360, r: 9, alpha: 0.95 },
      { x: 240, y: 390, r: 5, alpha: 0.86 },
      { x: 150, y: 210, r: 5, alpha: 0.84 },
      { x: 340, y: 160, r: 7, alpha: 0.89 },
      { x: 210, y: 120, r: 6, alpha: 0.87 },
      { x: 290, y: 130, r: 8, alpha: 0.93 },
      { x: 370, y: 340, r: 6, alpha: 0.82 },
      { x: 140, y: 330, r: 6, alpha: 0.83 },
      { x: 220, y: 180, r: 4, alpha: 0.76 },
      { x: 260, y: 210, r: 5, alpha: 0.79 },
      { x: 300, y: 230, r: 4, alpha: 0.75 },
      { x: 180, y: 160, r: 3, alpha: 0.72 },
      { x: 350, y: 300, r: 4, alpha: 0.74 },
    ];

    for (const sc of syntheticCoords) {
      ctx.beginPath();
      ctx.arc(sc.x, sc.y, sc.r, 0, 2 * Math.PI);
      ctx.fillStyle = `rgba(69, 26, 3, ${sc.alpha})`; // deep colony tone
      ctx.fill();

      // Soft center sheen
      ctx.beginPath();
      ctx.arc(sc.x - sc.r * 0.25, sc.y - sc.r * 0.25, sc.r * 0.4, 0, 2 * Math.PI);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
      ctx.fill();
    }
  }

  function runAutoDetection(ctx: CanvasRenderingContext2D, width: number, height: number) {
    try {
      const imgData = ctx.getImageData(0, 0, width, height);
      const dishRadiusFrac = 1 - (s.dishMarginPct || 15) / 100;
      const detected = autoDetectColonies(imgData, {
        minRadius: 1,
        maxRadius: 50,
        minCertainty: 0.20,
        minDistance: s.minDistance || 5,
        dishRadiusFrac,
      });
      setAllDetected(detected);
    } catch {
      // Cross-origin image fallback
    }
  }

  // Redraw overlays whenever active colonies or hover changes
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Redraw base image/plate
    if (imageSrc) {
      const img = new Image();
      img.onload = () => {
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        renderOverlays(ctx);
      };
      img.src = imageSrc;
    } else {
      drawSyntheticPlate(ctx, canvas.width, canvas.height);
      renderOverlays(ctx);
    }
  }, [activeColonies, hoveredColony, s.showOverlayLabels]);

  function renderOverlays(ctx: CanvasRenderingContext2D) {
    const catMap = new Map(categories.map(c => [c.id, c.color]));

    for (let i = 0; i < activeColonies.length; i++) {
      const c = activeColonies[i]!;
      const r = Math.max(3, c.radius || 4);
      const isHovered = hoveredColony?.id === c.id;
      const cert = c.certainty ?? 1.0;

      // Ring color based on certainty or category
      let strokeColor = catMap.get(c.category) || '#10b981';
      if (c.isManual) strokeColor = '#ec4899';
      else if (cert >= 0.85) strokeColor = '#10b981';
      else if (cert >= 0.65) strokeColor = '#0ea5e9';
      else strokeColor = '#f59e0b';

      ctx.beginPath();
      ctx.arc(c.x, c.y, r + 2, 0, 2 * Math.PI);
      ctx.strokeStyle = isHovered ? '#ffffff' : strokeColor;
      ctx.lineWidth = isHovered ? 3.5 : 2;
      ctx.stroke();

      // Center crosshair/dot
      ctx.beginPath();
      ctx.arc(c.x, c.y, 2, 0, 2 * Math.PI);
      ctx.fillStyle = strokeColor;
      ctx.fill();

      if (s.showOverlayLabels || isHovered) {
        ctx.font = 'bold 9px monospace';
        ctx.fillStyle = '#ffffff';
        ctx.shadowColor = 'rgba(0,0,0,0.8)';
        ctx.shadowBlur = 4;
        ctx.textAlign = 'center';
        ctx.fillText(`${(r * 2).toFixed(0)}px`, c.x, c.y - r - 4);
        ctx.shadowBlur = 0;
      }
    }
  }

  function handleCanvasClick(e: MouseEvent) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;

    // Check if clicked near an active colony to remove it
    const clickedIdx = activeColonies.findIndex(c => Math.hypot(c.x - x, c.y - y) <= Math.max(10, (c.radius || 4) + 4));

    if (clickedIdx !== -1) {
      const toRemove = activeColonies[clickedIdx]!;
      if (toRemove.isManual) {
        setManualSpots(prev => prev.filter(m => m.id !== toRemove.id));
      } else {
        setAllDetected(prev => prev.filter(a => a.id !== toRemove.id));
      }
      setHoveredColony(null);
    } else {
      // Add manual spot
      const newManual: ColonySpot = {
        id: `manual-${Date.now()}`,
        x,
        y,
        radius: 6,
        certainty: 1.0,
        category: 'cat-4',
        isManual: true,
      };
      setManualSpots(prev => [...prev, newManual]);
    }
  }

  function handleCanvasMouseMove(e: MouseEvent) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;

    const nearby = activeColonies.find(c => Math.hypot(c.x - x, c.y - y) <= Math.max(12, (c.radius || 4) + 4));
    setHoveredColony(nearby || null);
  }

  function handleImageUpload(file: File) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const src = e.target?.result as string;
      if (src) {
        setImageSrc(src);
        setManualSpots([]);
      }
    };
    reader.readAsDataURL(file);
  }

  function handleExportCsv() {
    const rows = [
      ['ID', 'Index', 'X_px', 'Y_px', 'Diameter_px', 'Certainty_pct', 'Type'],
      ...activeColonies.map((c, i) => [
        c.id,
        i + 1,
        Math.round(c.x),
        Math.round(c.y),
        ((c.radius || 4) * 2).toFixed(1),
        `${Math.round((c.certainty ?? 1.0) * 100)}%`,
        c.isManual ? 'Manual' : 'Automated',
      ]),
    ];
    const csv = rows.map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `automated_colonies_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const copyText = 'error' in cfuResult ? cfuResult.error! : [
    `Automated Colony Count: ${activeColonies.length} colonies (Min Certainty: ${(s.minCertainty * 100).toFixed(0)}%)`,
    `Size Stats: Mean Diameter = ${sizeStats.meanDiameter.toFixed(1)} px (CV: ${sizeStats.cvPercent.toFixed(1)}%)`,
    `Estimated CFU/mL: ${cfuResult.cfuPerMl.toExponential(3)} CFU/mL`,
    `Plating: ${s.volumePlatedUl} µL at 10^${s.dilutionExponent} dilution`,
    '',
    scienceText(SCIENCE),
  ].join('\n');

  return (
    <ToolLayout
      icon="🔴"
      title="Automated Colony Counter"
      blurb="Computer-vision automated colony detection with certainty scoring, size distribution histogram, and CFU/mL calibration."
      wide={true}
      inputs={
        <div class="space-y-4">
          {/* Automated Detection & Certainty Filters */}
          <div class="space-y-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <h3 class="text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
              Detection & Confidence Tuning
            </h3>

            <div>
              <div class="flex justify-between text-xs text-slate-600 dark:text-slate-400 mb-1">
                <span>Certainty Threshold</span>
                <span class="font-mono font-bold text-accent-600">
                  {Math.round(s.minCertainty * 100)}%
                </span>
              </div>
              <input
                type="range"
                min="0.20"
                max="0.95"
                step="0.05"
                aria-label="Certainty Threshold"
                value={s.minCertainty}
                onInput={(e) => set({ minCertainty: parseFloat((e.target as HTMLInputElement).value) })}
                class="w-full accent-accent-600"
              />
              <span class="text-[11px] text-slate-400 block mt-0.5">
                Higher threshold retains only high-contrast, unambiguous colonies.
              </span>
            </div>

            <div class="pt-2 border-t border-slate-100 dark:border-slate-800">
              <div class="flex justify-between text-xs text-slate-600 dark:text-slate-400 mb-1">
                <span>Size Range Filter (Diameter)</span>
                <span class="font-mono font-bold text-slate-700 dark:text-slate-300">
                  {s.minDiameter} – {s.maxDiameter} px
                </span>
              </div>
              <div class="grid grid-cols-2 gap-2">
                <div>
                  <label class="block text-[10px] text-slate-400">Min Dia (px)</label>
                  <input
                    type="number"
                    min="1"
                    max="50"
                    value={s.minDiameter}
                    onInput={(e) => set({ minDiameter: parseInt((e.target as HTMLInputElement).value) || 2 })}
                    class="w-full rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-900"
                  />
                </div>
                <div>
                  <label class="block text-[10px] text-slate-400">Max Dia (px)</label>
                  <input
                    type="number"
                    min="5"
                    max="100"
                    value={s.maxDiameter}
                    onInput={(e) => set({ maxDiameter: parseInt((e.target as HTMLInputElement).value) || 50 })}
                    class="w-full rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-900"
                  />
                </div>
              </div>
            </div>

            {/* Minimum Colony Separation Distance */}
            <div class="pt-2 border-t border-slate-100 dark:border-slate-800">
              <div class="flex justify-between text-xs text-slate-600 dark:text-slate-400 mb-1">
                <span>Min Separation (Distance)</span>
                <span class="font-mono font-bold text-slate-700 dark:text-slate-300">
                  {s.minDistance} px
                </span>
              </div>
              <input
                type="range"
                min="2"
                max="25"
                step="1"
                aria-label="Min Separation"
                value={s.minDistance}
                onInput={(e) => set({ minDistance: parseInt((e.target as HTMLInputElement).value) || 2 })}
                class="w-full accent-accent-600"
              />
              <span class="text-[10px] text-slate-400 block mt-0.5">
                Lower separation allows detecting touching doublets / colonies close to each other.
              </span>
            </div>

            {/* Petri Dish Rim Glare Exclusion */}
            <div class="pt-2 border-t border-slate-100 dark:border-slate-800">
              <div class="flex justify-between text-xs text-slate-600 dark:text-slate-400 mb-1">
                <span>Rim Glare Margin</span>
                <span class="font-mono font-bold text-slate-700 dark:text-slate-300">
                  {s.dishMarginPct}%
                </span>
              </div>
              <input
                type="range"
                min="5"
                max="25"
                step="1"
                aria-label="Rim Glare Margin"
                value={s.dishMarginPct}
                onInput={(e) => set({ dishMarginPct: parseInt((e.target as HTMLInputElement).value) || 15 })}
                class="w-full accent-accent-600"
              />
              <span class="text-[10px] text-slate-400 block mt-0.5">
                Excludes edge glare reflections from plastic petri dish borders.
              </span>
            </div>

            <label class="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400 pt-1 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={s.showOverlayLabels}
                onChange={(e) => set({ showOverlayLabels: (e.target as HTMLInputElement).checked })}
                class="rounded text-accent-600 accent-accent-600"
              />
              <span>Show diameter tags on plate</span>
            </label>
          </div>

          {/* Plating & Dilution Parameters */}
          <div class="space-y-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <h3 class="text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
              Plating & Dilution
            </h3>
            <div>
              <label class="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                Volume Plated (µL)
              </label>
              <input
                type="number"
                min="1"
                step="10"
                value={s.volumePlatedUl}
                onInput={(e) => set({ volumePlatedUl: parseFloat((e.target as HTMLInputElement).value) || 1 })}
                class="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-900"
              />
            </div>
            <div>
              <div class="flex justify-between text-xs text-slate-500 mb-1">
                <span>Dilution: 10^{s.dilutionExponent}</span>
                <span class="mono font-semibold">1 : {dilutionFactor.toLocaleString()}</span>
              </div>
              <input
                type="range"
                min="0"
                max="8"
                step="1"
                value={s.dilutionExponent}
                onInput={(e) => set({ dilutionExponent: parseInt((e.target as HTMLInputElement).value) })}
                class="w-full accent-accent-600"
              />
            </div>
          </div>

          <div class="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => cameraInputRef.current?.click()}
              class="flex-1 py-1.5 px-2 text-xs font-semibold rounded-lg bg-accent-600 text-white hover:bg-accent-700 transition flex items-center justify-center gap-1 shadow-xs"
              title="Snap photo directly from mobile camera"
            >
              📸 Camera (Mobile)
            </button>
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              class="hidden"
              onChange={(e) => {
                const file = (e.target as HTMLInputElement).files?.[0];
                if (file) handleImageUpload(file);
              }}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              class="flex-1 py-1.5 px-2 text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 transition flex items-center justify-center gap-1"
            >
              📁 Upload Photo
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              class="hidden"
              onChange={(e) => {
                const file = (e.target as HTMLInputElement).files?.[0];
                if (file) handleImageUpload(file);
              }}
            />
            <button
              type="button"
              onClick={() => { setImageSrc(null); setAllDetected([]); setManualSpots([]); }}
              class="px-2.5 py-1.5 text-xs font-medium rounded-lg text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 border border-rose-200 dark:border-rose-900 transition"
              title="Reset to synthetic plate"
            >
              Reset
            </button>
          </div>
        </div>
      }
      results={
        <div class="space-y-4">
          {'error' in cfuResult ? (
            <p role="alert" class="text-sm text-red-600">{cfuResult.error}</p>
          ) : (
            <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div class="rounded-2xl border border-slate-200 bg-white p-3.5 dark:border-slate-800 dark:bg-slate-900">
                <span class="text-xs text-slate-500 block">Filtered Colonies</span>
                <span data-testid="colony-count" class="font-mono text-2xl font-bold text-slate-900 dark:text-slate-100">
                  {activeColonies.length}
                </span>
                <span class="text-[11px] text-slate-400 block">
                  {manualSpots.length > 0 ? `(${manualSpots.length} manual)` : 'auto detected'}
                </span>
              </div>

              <div class="rounded-2xl border border-slate-200 bg-white p-3.5 dark:border-slate-800 dark:bg-slate-900">
                <span class="text-xs text-slate-500 block">Estimated CFU / mL</span>
                <span data-testid="cfu-ml" class="font-mono text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                  {cfuResult.cfuPerMl.toExponential(2)}
                </span>
                <span class="text-[11px] text-slate-400 block">in stock culture</span>
              </div>

              <div class="rounded-2xl border border-slate-200 bg-white p-3.5 dark:border-slate-800 dark:bg-slate-900">
                <span class="text-xs text-slate-500 block">Mean Diameter</span>
                <span class="font-mono text-2xl font-bold text-slate-900 dark:text-slate-100">
                  {sizeStats.meanDiameter.toFixed(1)} px
                </span>
                <span class="text-[11px] text-slate-400 block">CV: {sizeStats.cvPercent.toFixed(1)}%</span>
              </div>

              <div class="rounded-2xl border border-slate-200 bg-white p-3.5 dark:border-slate-800 dark:bg-slate-900">
                <span class="text-xs text-slate-500 block">Plated Dilution</span>
                <span class="font-mono text-2xl font-bold text-accent-600 dark:text-accent-400">
                  10⁻{s.dilutionExponent}
                </span>
                <span class="text-[11px] text-slate-400 block">{s.volumePlatedUl} µL volume</span>
              </div>
            </div>
          )}

          {/* Size Distribution Histogram */}
          {sizeStats.bins.length > 0 && (
            <div class="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 space-y-2">
              <div class="flex items-center justify-between">
                <h4 class="font-bold text-xs text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                  Colony Size Distribution Histogram
                </h4>
                <span class="text-xs mono text-slate-500">
                  Mean: {sizeStats.meanDiameter.toFixed(1)} px ± {sizeStats.stdDev.toFixed(1)} px
                </span>
              </div>

              <div class="grid grid-cols-3 sm:grid-cols-6 gap-2 pt-2">
                {sizeStats.bins.map((bin, idx) => {
                  const maxCount = Math.max(1, ...sizeStats.bins.map(b => b.count));
                  const heightFrac = bin.count / maxCount;
                  return (
                    <div key={idx} class="space-y-1 text-center bg-slate-50 dark:bg-slate-800/40 p-2 rounded-xl">
                      <div class="h-16 flex items-end justify-center">
                        <div
                          class="w-full rounded-t-md bg-accent-600 transition-all duration-300"
                          style={{ height: `${Math.max(4, heightFrac * 60)}px` }}
                          title={`${bin.binLabel}: ${bin.count} colonies (${bin.percentage.toFixed(1)}%)`}
                        />
                      </div>
                      <span class="block font-mono font-bold text-xs text-slate-900 dark:text-slate-100">
                        {bin.count}
                      </span>
                      <span class="block text-[10px] text-slate-400 mono truncate">
                        {bin.binLabel}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Interactive Plate Canvas Card */}
          <div class="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 space-y-2">
            <div class="flex items-center justify-between">
              <div>
                <h3 class="font-bold text-sm text-slate-900 dark:text-slate-100">
                  Plate Visualization & Detection Rings
                </h3>
                <p class="text-xs text-slate-500">
                  Hover to inspect colony diameter and confidence score. Click any colony to dismiss; click open agar to add a manual pin.
                </p>
              </div>
              <button
                type="button"
                onClick={handleExportCsv}
                class="px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 transition shrink-0"
              >
                Export CSV
              </button>
            </div>

            {/* Fixed-height inspection bar: never causes canvas layout shift */}
            <div class="h-6 flex items-center justify-between text-xs mono">
              {hoveredColony ? (
                <span class="bg-accent-50 dark:bg-accent-950/40 text-accent-800 dark:text-accent-300 px-2.5 py-0.5 rounded-md border border-accent-200 dark:border-accent-800 font-semibold">
                  Colony {hoveredColony.id}: Diameter {((hoveredColony.radius || 4) * 2).toFixed(1)} px · Certainty {Math.round((hoveredColony.certainty ?? 1.0) * 100)}% · Position ({Math.round(hoveredColony.x)}, {Math.round(hoveredColony.y)})
                </span>
              ) : (
                <span class="text-slate-400 text-[11px]">
                  Hover any colony to inspect diameter, confidence, and position without shifting layout.
                </span>
              )}
            </div>

            <div class="flex justify-center p-2 bg-slate-100 dark:bg-slate-950 rounded-xl overflow-hidden">
              <canvas
                ref={canvasRef}
                width={500}
                height={500}
                onClick={handleCanvasClick}
                onMouseMove={handleCanvasMouseMove}
                onMouseLeave={() => setHoveredColony(null)}
                class="cursor-crosshair max-w-full h-auto rounded-lg shadow-xs"
              />
            </div>
          </div>
        </div>
      }
      actions={<ActionBar onCopy={() => copyText} shareUrl={shareUrl} />}
      science={<SciencePanel science={SCIENCE} />}
    />
  );
}
