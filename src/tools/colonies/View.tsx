import { useState, useRef, useEffect, useMemo } from 'preact/hooks';
import {
  calculateCfu,
  autoDetectColonies,
  computeSizeDistribution,
  calculateColonyPhysicalMetrics,
  calculatePlatePhysicalSummary,
  PETRI_DISH_PRESETS,
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
  dishDiameterMm: number; // e.g. 90 mm
  showSizeHistogram: boolean;
  showOverlayLabels: boolean;
  displayUnits: 'si' | 'px';
}

const DEFAULTS: State = {
  volumePlatedUl: 100,
  dilutionExponent: 4,
  minCertainty: 0.50,
  minDiameter: 4,
  maxDiameter: 50,
  minDistance: 5,
  dishMarginPct: 15,
  dishDiameterMm: 90,
  showSizeHistogram: true,
  showOverlayLabels: false,
  displayUnits: 'si',
};

const SYNTHETIC_COORDS = [
  { x: 230, y: 160, r: 8 },
  { x: 280, y: 190, r: 10 },
  { x: 190, y: 220, r: 6 },
  { x: 330, y: 220, r: 9 },
  { x: 240, y: 250, r: 14 },
  { x: 290, y: 270, r: 7 },
  { x: 160, y: 280, r: 11 },
  { x: 370, y: 270, r: 8 },
  { x: 210, y: 310, r: 6 },
  { x: 270, y: 330, r: 12 },
  { x: 320, y: 340, r: 7 },
  { x: 180, y: 360, r: 9 },
  { x: 240, y: 390, r: 5 },
  { x: 150, y: 210, r: 5 },
  { x: 340, y: 160, r: 7 },
  { x: 210, y: 120, r: 6 },
  { x: 290, y: 130, r: 8 },
  { x: 370, y: 340, r: 6 },
  { x: 140, y: 330, r: 6 },
  { x: 220, y: 180, r: 4 },
  { x: 260, y: 210, r: 5 },
  { x: 300, y: 230, r: 4 },
  { x: 180, y: 160, r: 4 },
  { x: 350, y: 300, r: 4 },
];

const BUNDLED_EXAMPLE_COLONIES: ColonySpot[] = SYNTHETIC_COORDS.map((sc, i) => ({
  id: `c-${i + 1}`,
  x: sc.x,
  y: sc.y,
  radius: sc.r,
  certainty: 0.95,
  category: sc.r >= 10 ? 'cat-1' : sc.r >= 6 ? 'cat-2' : 'cat-3',
  isManual: false,
}));

export default function ColoniesView() {
  const [stateSig, shareUrl] = useUrlState<State>('colonies', DEFAULTS);
  const s = stateSig.value;
  const set = (patch: Partial<State>) => { stateSig.value = { ...stateSig.value, ...patch }; };

  const [allDetected, setAllDetected] = useState<ColonySpot[]>([]);
  const [manualSpots, setManualSpots] = useState<ColonySpot[]>([]);
  const [selectedColonyId, setSelectedColonyId] = useState<string | null>(null);
  const [interactionMode, setInteractionMode] = useState<'pick' | 'add' | 'remove'>('pick');
  const [hoveredColony, setHoveredColony] = useState<ColonySpot | null>(null);
  const [categories, setCategories] = useState<ColonyCategory[]>(DEFAULT_COLONY_CATEGORIES);
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

  // Spatial calibration: 500x500 canvas with inner agar plate radius = 215 px
  const dishRadiusPx = 215;
  const mmPerPixel = (s.dishDiameterMm / 2) / dishRadiusPx;
  const pixelsPerMm = 1 / mmPerPixel;

  const sizeStats = useMemo(() => {
    return computeSizeDistribution(activeColonies, mmPerPixel);
  }, [activeColonies, mmPerPixel]);

  const plateSummary = useMemo(() => {
    return calculatePlatePhysicalSummary(
      activeColonies.length,
      sizeStats.meanRadius,
      s.dishDiameterMm || 90,
      dishRadiusPx,
    );
  }, [activeColonies.length, sizeStats.meanRadius, s.dishDiameterMm, dishRadiusPx]);

  const selectedColony = useMemo(() => {
    if (!selectedColonyId) return null;
    return activeColonies.find(c => c.id === selectedColonyId) || null;
  }, [activeColonies, selectedColonyId]);

  const selectedColonyMetrics = useMemo(() => {
    if (!selectedColony) return null;
    return calculateColonyPhysicalMetrics(
      selectedColony.radius || 4,
      selectedColony.x,
      selectedColony.y,
      { cx: 250, cy: 250 },
      mmPerPixel,
    );
  }, [selectedColony, mmPerPixel]);

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

  function drawSyntheticPlate(ctx: CanvasRenderingContext2D, width: number, height: number) {
    const cx = width / 2;
    const cy = height / 2;
    const r = dishRadiusPx;

    // Background petri dish rim
    ctx.fillStyle = '#f1f5f9';
    ctx.fillRect(0, 0, width, height);

    ctx.beginPath();
    ctx.arc(cx, cy, r + 6, 0, 2 * Math.PI);
    ctx.fillStyle = '#cbd5e1';
    ctx.fill();

    // Agar surface (clean uniform tone)
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, 2 * Math.PI);
    ctx.fillStyle = '#fef08a';
    ctx.fill();
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 3;
    ctx.stroke();

    // Draw realistic colonies with dome profile (Gaussian gradient)
    for (const sc of SYNTHETIC_COORDS) {
      const g = ctx.createRadialGradient(sc.x, sc.y, 0, sc.x, sc.y, sc.r);
      g.addColorStop(0, '#260e02');
      g.addColorStop(0.7, '#451a03');
      g.addColorStop(1, '#78350f');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(sc.x, sc.y, sc.r, 0, 2 * Math.PI);
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
      if (detected.length > 0) {
        setAllDetected(detected);
      } else if (!imageSrc) {
        setAllDetected(BUNDLED_EXAMPLE_COLONIES);
      }
    } catch {
      if (!imageSrc) {
        setAllDetected(BUNDLED_EXAMPLE_COLONIES);
      }
    }
  }

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

  // Redraw overlays whenever active colonies, hover, or selection changes
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
  }, [activeColonies, hoveredColony, selectedColonyId, s.showOverlayLabels, s.displayUnits, mmPerPixel]);

  function renderOverlays(ctx: CanvasRenderingContext2D) {
    const catMap = new Map(categories.map(c => [c.id, c.color]));

    for (let i = 0; i < activeColonies.length; i++) {
      const c = activeColonies[i]!;
      const r = Math.max(3, c.radius || 4);
      const isHovered = hoveredColony?.id === c.id;
      const isSelected = selectedColonyId === c.id;
      const cert = c.certainty ?? 1.0;

      // Ring color based on certainty or category
      let strokeColor = catMap.get(c.category) || '#10b981';
      if (c.isManual) strokeColor = '#ec4899';
      else if (cert >= 0.85) strokeColor = '#10b981';
      else if (cert >= 0.65) strokeColor = '#0ea5e9';
      else strokeColor = '#f59e0b';

      if (isSelected) {
        // Glowing picked colony highlight: outer dashed golden ring + inner solid white ring
        ctx.save();
        ctx.beginPath();
        ctx.arc(c.x, c.y, r + 7, 0, 2 * Math.PI);
        ctx.strokeStyle = '#f59e0b';
        ctx.lineWidth = 2.5;
        ctx.setLineDash([4, 3]);
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(c.x, c.y, r + 3, 0, 2 * Math.PI);
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.setLineDash([]);
        ctx.stroke();
        ctx.restore();
      } else {
        ctx.beginPath();
        ctx.arc(c.x, c.y, r + 2, 0, 2 * Math.PI);
        ctx.strokeStyle = isHovered ? '#ffffff' : strokeColor;
        ctx.lineWidth = isHovered ? 3.5 : 2;
        ctx.stroke();
      }

      // Center crosshair/dot
      ctx.beginPath();
      ctx.arc(c.x, c.y, isSelected ? 3.5 : 2, 0, 2 * Math.PI);
      ctx.fillStyle = isSelected ? '#f59e0b' : strokeColor;
      ctx.fill();

      if (s.showOverlayLabels || isHovered || isSelected) {
        const diamLabel = s.displayUnits === 'si'
          ? `${(r * 2 * mmPerPixel).toFixed(1)}mm`
          : `${(r * 2).toFixed(0)}px`;

        ctx.font = isSelected ? 'bold 11px monospace' : 'bold 9px monospace';
        ctx.fillStyle = isSelected ? '#fef08a' : '#ffffff';
        ctx.shadowColor = 'rgba(0,0,0,0.85)';
        ctx.shadowBlur = 4;
        ctx.textAlign = 'center';
        ctx.fillText(diamLabel, c.x, c.y - r - (isSelected ? 7 : 4));
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

    // Generous hit detection threshold (at least 14 px or colony radius + 6 px)
    const clickedColony = activeColonies.find(c => Math.hypot(c.x - x, c.y - y) <= Math.max(14, (c.radius || 4) + 6));

    if (interactionMode === 'remove') {
      if (clickedColony) {
        if (clickedColony.isManual) {
          setManualSpots(prev => prev.filter(m => m.id !== clickedColony.id));
        } else {
          setAllDetected(prev => prev.filter(a => a.id !== clickedColony.id));
        }
        if (selectedColonyId === clickedColony.id) setSelectedColonyId(null);
        setHoveredColony(null);
      }
      return;
    }

    if (interactionMode === 'add') {
      const newManual: ColonySpot = {
        id: `manual-${Date.now()}`,
        x: Math.round(x * 10) / 10,
        y: Math.round(y * 10) / 10,
        radius: 6,
        certainty: 1.0,
        category: 'cat-4',
        isManual: true,
      };
      setManualSpots(prev => [...prev, newManual]);
      setSelectedColonyId(newManual.id);
      return;
    }

    // Default 'pick' (Inspect) mode
    if (clickedColony) {
      setSelectedColonyId(clickedColony.id);
    } else {
      setSelectedColonyId(null);
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

    const nearby = activeColonies.find(c => Math.hypot(c.x - x, c.y - y) <= Math.max(14, (c.radius || 4) + 6));
    setHoveredColony(nearby || null);
  }

  function handleResetToExample() {
    setImageSrc(null);
    setSelectedColonyId(null);
    setManualSpots([]);
    setAllDetected(BUNDLED_EXAMPLE_COLONIES);
  }

  function handleImageUpload(file: File) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const src = e.target?.result as string;
      if (src) {
        setImageSrc(src);
        setSelectedColonyId(null);
        setManualSpots([]);
      }
    };
    reader.readAsDataURL(file);
  }

  function handleExportCsv() {
    const rows = [
      [
        'ID',
        'Index',
        'X_px',
        'Y_px',
        'X_mm',
        'Y_mm',
        'Radius_px',
        'Radius_mm',
        'Diameter_px',
        'Diameter_mm',
        'Area_px2',
        'Area_mm2',
        'Dist_Center_mm',
        'Certainty_pct',
        'Type',
        'Category',
      ],
      ...activeColonies.map((c, i) => {
        const rPx = c.radius || 4;
        const phys = calculateColonyPhysicalMetrics(rPx, c.x, c.y, { cx: 250, cy: 250 }, mmPerPixel);
        const xMm = ((c.x - 250) * mmPerPixel).toFixed(2);
        const yMm = ((c.y - 250) * mmPerPixel).toFixed(2);
        return [
          c.id,
          i + 1,
          Math.round(c.x),
          Math.round(c.y),
          xMm,
          yMm,
          rPx.toFixed(1),
          phys.radiusMm.toFixed(2),
          (rPx * 2).toFixed(1),
          phys.diameterMm.toFixed(2),
          (Math.PI * rPx * rPx).toFixed(1),
          phys.areaMm2.toFixed(2),
          phys.distanceFromCenterMm.toFixed(2),
          `${Math.round((c.certainty ?? 1.0) * 100)}%`,
          c.isManual ? 'Manual' : 'Automated',
          c.category,
        ];
      }),
    ];
    const csv = rows.map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `colonies_physical_data_${new Date().toISOString().slice(0, 10)}.csv`;
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

          {/* Petri Dish & Physical Spatial Calibration (SI Units) */}
          <div class="space-y-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <div class="flex items-center justify-between">
              <h3 class="text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                Petri Dish & SI Calibration
              </h3>
              <span class="text-[10px] font-mono font-semibold px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
                {plateSummary.dishAreaCm2.toFixed(1)} cm²
              </span>
            </div>

            <div>
              <label class="block text-[11px] text-slate-500 mb-1">Standard Dish Diameter</label>
              <div class="grid grid-cols-2 gap-1.5 mb-2">
                {PETRI_DISH_PRESETS.map((p) => (
                  <button
                    key={p.diameterMm}
                    type="button"
                    onClick={() => set({ dishDiameterMm: p.diameterMm })}
                    class={`px-2 py-1 text-xs rounded-lg font-medium transition text-left truncate ${
                      s.dishDiameterMm === p.diameterMm
                        ? 'bg-accent-600 text-white shadow-2xs font-semibold'
                        : 'border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
                    }`}
                    title={p.description}
                  >
                    {p.label}
                  </button>
                ))}
              </div>

              <div class="flex items-center gap-2">
                <input
                  type="number"
                  min="20"
                  max="300"
                  step="1"
                  aria-label="Dish Diameter in mm"
                  value={s.dishDiameterMm}
                  onInput={(e) => set({ dishDiameterMm: parseFloat((e.target as HTMLInputElement).value) || 90 })}
                  class="w-24 rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-mono dark:border-slate-700 dark:bg-slate-900 font-semibold"
                />
                <span class="text-xs text-slate-500">mm diameter</span>
              </div>
            </div>

            <div class="text-[11px] text-slate-500 bg-slate-50 dark:bg-slate-800/50 p-2 rounded-lg space-y-0.5">
              <div class="flex justify-between">
                <span>Spatial Resolution:</span>
                <span class="font-mono font-semibold text-slate-700 dark:text-slate-300">{pixelsPerMm.toFixed(2)} px/mm</span>
              </div>
              <div class="flex justify-between">
                <span>Scale Factor:</span>
                <span class="font-mono font-semibold text-slate-700 dark:text-slate-300">{mmPerPixel.toFixed(3)} mm/px</span>
              </div>
              <div class="flex justify-between">
                <span>Plating Density:</span>
                <span class="font-mono font-semibold text-emerald-600 dark:text-emerald-400">
                  {plateSummary.platingDensityCfuPerCm2.toFixed(2)} CFU/cm²
                </span>
              </div>
            </div>

            {/* Display Units Toggle */}
            <div class="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs">
              <span class="text-slate-600 dark:text-slate-400">Display Units:</span>
              <div class="inline-flex rounded-lg border border-slate-200 dark:border-slate-700 p-0.5 bg-slate-50 dark:bg-slate-800">
                <button
                  type="button"
                  onClick={() => set({ displayUnits: 'si' })}
                  class={`px-2 py-0.5 rounded-md text-[11px] font-semibold transition ${
                    s.displayUnits === 'si' ? 'bg-accent-600 text-white shadow-2xs' : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  SI (mm)
                </button>
                <button
                  type="button"
                  onClick={() => set({ displayUnits: 'px' })}
                  class={`px-2 py-0.5 rounded-md text-[11px] font-semibold transition ${
                    s.displayUnits === 'px' ? 'bg-accent-600 text-white shadow-2xs' : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  Pixels (px)
                </button>
              </div>
            </div>
          </div>

          <div class="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleResetToExample}
              class="w-full py-1.5 px-3 text-xs font-semibold rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 transition flex items-center justify-center gap-1.5 shadow-2xs"
              title="Load bundled LB agar plate with realistic colonies"
            >
              🧫 Load Bundled Example Plate
            </button>
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
              onClick={() => { setImageSrc(null); setSelectedColonyId(null); setAllDetected([]); setManualSpots([]); }}
              class="px-2.5 py-1.5 text-xs font-medium rounded-lg text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 border border-rose-200 dark:border-rose-900 transition"
              title="Clear all colonies and plate"
            >
              Clear
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
                <span class="text-[11px] text-slate-400 block capitalize">
                  {plateSummary.densityStatus} ({manualSpots.length > 0 ? `${manualSpots.length} manual` : 'auto'})
                </span>
              </div>

              <div class="rounded-2xl border border-slate-200 bg-white p-3.5 dark:border-slate-800 dark:bg-slate-900">
                <span class="text-xs text-slate-500 block">Plating Colony Density</span>
                <span data-testid="colony-density" class="font-mono text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                  {plateSummary.platingDensityCfuPerCm2.toFixed(2)}
                </span>
                <span class="text-[11px] text-slate-400 block">CFU / cm² (dish {plateSummary.dishAreaCm2.toFixed(0)} cm²)</span>
              </div>

              <div class="rounded-2xl border border-slate-200 bg-white p-3.5 dark:border-slate-800 dark:bg-slate-900">
                <span class="text-xs text-slate-500 block">Mean Colony Diameter</span>
                <span data-testid="colony-diameter" class="font-mono text-2xl font-bold text-slate-900 dark:text-slate-100">
                  {s.displayUnits === 'si'
                    ? `${(sizeStats.meanDiameterMm ?? 0).toFixed(2)} mm`
                    : `${sizeStats.meanDiameter.toFixed(1)} px`}
                </span>
                <span class="text-[11px] text-slate-400 block">
                  Area: {plateSummary.meanAreaMm2.toFixed(2)} mm² · CV {sizeStats.cvPercent.toFixed(1)}%
                </span>
              </div>

              <div class="rounded-2xl border border-slate-200 bg-white p-3.5 dark:border-slate-800 dark:bg-slate-900">
                <span class="text-xs text-slate-500 block">Estimated CFU / mL</span>
                <span data-testid="cfu-ml" class="font-mono text-2xl font-bold text-accent-600 dark:text-accent-400">
                  {cfuResult.cfuPerMl.toExponential(2)}
                </span>
                <span class="text-[11px] text-slate-400 block">in stock (10⁻{s.dilutionExponent}, {s.volumePlatedUl} µL)</span>
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
                  Mean Ø: {s.displayUnits === 'si'
                    ? `${(sizeStats.meanDiameterMm ?? 0).toFixed(2)} mm ± ${(sizeStats.stdDevMm ?? 0).toFixed(2)} mm`
                    : `${sizeStats.meanDiameter.toFixed(1)} px ± ${sizeStats.stdDev.toFixed(1)} px`}
                </span>
              </div>

              <div class="grid grid-cols-3 sm:grid-cols-6 gap-2 pt-2">
                {sizeStats.bins.map((bin, idx) => {
                  const maxCount = Math.max(1, ...sizeStats.bins.map(b => b.count));
                  const heightFrac = bin.count / maxCount;
                  const label = s.displayUnits === 'si' && bin.binLabelMm ? bin.binLabelMm : bin.binLabel;
                  return (
                    <div key={idx} class="space-y-1 text-center bg-slate-50 dark:bg-slate-800/40 p-2 rounded-xl">
                      <div class="h-16 flex items-end justify-center">
                        <div
                          class="w-full rounded-t-md bg-accent-600 transition-all duration-300"
                          style={{ height: `${Math.max(4, heightFrac * 60)}px` }}
                          title={`${label}: ${bin.count} colonies (${bin.percentage.toFixed(1)}%)`}
                        />
                      </div>
                      <span class="block font-mono font-bold text-xs text-slate-900 dark:text-slate-100">
                        {bin.count}
                      </span>
                      <span class="block text-[10px] text-slate-400 mono truncate" title={label}>
                        {label}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Interactive Plate Canvas Card */}
          <div class="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 space-y-2.5">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 class="font-bold text-sm text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <span>Plate Visualization & Colony Inspection</span>
                  <span class="text-xs font-normal text-slate-400 font-mono">({activeColonies.length} colonies)</span>
                </h3>
                <p class="text-xs text-slate-500">
                  {interactionMode === 'pick'
                    ? 'Click any colony on the plate to pick/inspect physical dimensions in SI units (mm, mm², CFU/cm²).'
                    : interactionMode === 'add'
                    ? 'Click anywhere on the plate to add a manual pin.'
                    : 'Click any colony to remove it from the plate.'}
                </p>
              </div>

              {/* Mode Selector & Action Buttons */}
              <div class="flex flex-wrap items-center gap-1.5 text-xs">
                <div class="inline-flex rounded-lg border border-slate-200 dark:border-slate-700 p-0.5 bg-slate-50 dark:bg-slate-800">
                  <button
                    type="button"
                    onClick={() => setInteractionMode('pick')}
                    class={`px-2.5 py-1 rounded-md font-semibold transition ${
                      interactionMode === 'pick'
                        ? 'bg-accent-600 text-white shadow-2xs'
                        : 'text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                    }`}
                    title="Click any colony to pick and inspect dimensions"
                  >
                    🎯 Pick / Inspect
                  </button>
                  <button
                    type="button"
                    onClick={() => setInteractionMode('add')}
                    class={`px-2.5 py-1 rounded-md font-semibold transition ${
                      interactionMode === 'add'
                        ? 'bg-emerald-600 text-white shadow-2xs'
                        : 'text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                    }`}
                    title="Click plate to add manual colony"
                  >
                    ➕ Add Pin
                  </button>
                  <button
                    type="button"
                    onClick={() => setInteractionMode('remove')}
                    class={`px-2.5 py-1 rounded-md font-semibold transition ${
                      interactionMode === 'remove'
                        ? 'bg-rose-600 text-white shadow-2xs'
                        : 'text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                    }`}
                    title="Click colony to delete it"
                  >
                    ➖ Remove Pin
                  </button>
                </div>

                <button
                  type="button"
                  onClick={handleExportCsv}
                  class="px-3 py-1 text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 transition shadow-2xs shrink-0"
                >
                  Export CSV
                </button>
              </div>
            </div>

            {/* Selected Colony Inspector Card (When user picks a colony) */}
            {selectedColony && selectedColonyMetrics && (
              <div data-testid="picked-colony-card" class="p-3 bg-amber-50/80 dark:bg-amber-950/30 rounded-xl border border-amber-200 dark:border-amber-800/60 space-y-2">
                <div class="flex items-center justify-between">
                  <div class="flex items-center gap-2">
                    <span class="text-sm font-bold text-amber-900 dark:text-amber-200 flex items-center gap-1.5">
                      <span>🎯 Picked Colony:</span>
                      <code class="px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/60 text-xs font-mono">{selectedColony.id}</code>
                    </span>
                    <span class="text-[11px] px-2 py-0.5 rounded-full font-semibold bg-white dark:bg-slate-900 border border-amber-300 dark:border-amber-700 text-amber-800 dark:text-amber-300">
                      {selectedColony.isManual ? 'Manual Pin' : `Confidence: ${Math.round((selectedColony.certainty ?? 1) * 100)}%`}
                    </span>
                  </div>

                  <div class="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        if (selectedColony.isManual) {
                          setManualSpots(prev => prev.filter(m => m.id !== selectedColony.id));
                        } else {
                          setAllDetected(prev => prev.filter(a => a.id !== selectedColony.id));
                        }
                        setSelectedColonyId(null);
                      }}
                      class="text-xs text-rose-600 hover:text-rose-700 font-semibold px-2 py-0.5 rounded border border-rose-200 dark:border-rose-900 bg-white dark:bg-slate-900 hover:bg-rose-50"
                    >
                      🗑️ Delete Colony
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedColonyId(null)}
                      class="text-xs text-slate-500 hover:text-slate-700 font-semibold px-2 py-0.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                    >
                      ✕ Close
                    </button>
                  </div>
                </div>

                <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-mono">
                  <div class="bg-white/80 dark:bg-slate-900/80 p-2 rounded-lg border border-amber-100 dark:border-amber-900/40">
                    <span class="text-[10px] text-slate-500 block uppercase font-sans">Diameter (SI)</span>
                    <span class="font-bold text-amber-800 dark:text-amber-300 text-sm">
                      {selectedColonyMetrics.diameterMm.toFixed(2)} mm
                    </span>
                    <span class="text-[10px] text-slate-400 block font-sans">({((selectedColony.radius || 4) * 2).toFixed(1)} px)</span>
                  </div>

                  <div class="bg-white/80 dark:bg-slate-900/80 p-2 rounded-lg border border-amber-100 dark:border-amber-900/40">
                    <span class="text-[10px] text-slate-500 block uppercase font-sans">Colony Area</span>
                    <span class="font-bold text-slate-800 dark:text-slate-200 text-sm">
                      {selectedColonyMetrics.areaMm2.toFixed(2)} mm²
                    </span>
                    <span class="text-[10px] text-slate-400 block font-sans">({(Math.PI * Math.pow(selectedColony.radius || 4, 2)).toFixed(0)} px²)</span>
                  </div>

                  <div class="bg-white/80 dark:bg-slate-900/80 p-2 rounded-lg border border-amber-100 dark:border-amber-900/40">
                    <span class="text-[10px] text-slate-500 block uppercase font-sans">Center Distance</span>
                    <span class="font-bold text-slate-800 dark:text-slate-200 text-sm">
                      {selectedColonyMetrics.distanceFromCenterMm.toFixed(1)} mm
                    </span>
                    <span class="text-[10px] text-slate-400 block font-sans">from dish origin</span>
                  </div>

                  <div class="bg-white/80 dark:bg-slate-900/80 p-2 rounded-lg border border-amber-100 dark:border-amber-900/40">
                    <span class="text-[10px] text-slate-500 block uppercase font-sans">Position (X, Y)</span>
                    <span class="font-bold text-slate-800 dark:text-slate-200 text-sm">
                      {Math.round(selectedColony.x)}, {Math.round(selectedColony.y)} px
                    </span>
                    <span class="text-[10px] text-slate-400 block font-sans">Radius: {selectedColonyMetrics.radiusMm.toFixed(2)} mm</span>
                  </div>
                </div>
              </div>
            )}

            {/* Live Inspection Bar */}
            <div class="h-6 flex items-center justify-between text-xs mono">
              {hoveredColony ? (
                <span class="bg-accent-50 dark:bg-accent-950/40 text-accent-800 dark:text-accent-300 px-2.5 py-0.5 rounded-md border border-accent-200 dark:border-accent-800 font-semibold truncate">
                  Colony {hoveredColony.id}: Ø {((hoveredColony.radius || 4) * 2 * mmPerPixel).toFixed(2)} mm ({((hoveredColony.radius || 4) * 2).toFixed(1)} px) · Area {(Math.PI * Math.pow((hoveredColony.radius || 4) * mmPerPixel, 2)).toFixed(2)} mm² · Certainty {Math.round((hoveredColony.certainty ?? 1.0) * 100)}% · Position ({Math.round(hoveredColony.x)}, {Math.round(hoveredColony.y)})
                </span>
              ) : (
                <span class="text-slate-400 text-[11px]">
                  Click any colony to inspect detailed physical SI dimensions (mm, mm², center distance).
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
