import { useState, useRef, useEffect, useMemo } from 'preact/hooks';
import {
  distanceBetween,
  angleBetweenPoints,
  applyCalibration,
  type Point,
  type CalibrationScale,
  type MeasurementItem,
  type MeasurementType,
} from '@/core/measure';
import { ToolLayout } from '@/app/components/ToolLayout';
import { SciencePanel, scienceText } from '@/app/components/SciencePanel';
import { ActionBar } from '@/app/components/ActionBar';
import { useUrlState } from '@/lib/url-state';
import { SCIENCE } from './science';

interface State {
  tool: 'line' | 'angle' | 'rect' | 'calibrate';
  calibLength: number;
  calibUnit: 'nm' | 'µm' | 'mm' | 'cm';
  scalePixels: number;
}

const DEFAULTS: State = {
  tool: 'line',
  calibLength: 50,
  calibUnit: 'µm',
  scalePixels: 100,
};

function getMeasurementCalibrated(m: MeasurementItem, scale: CalibrationScale) {
  if (m.type === 'angle') {
    return { value: m.angleDeg ?? m.pixelValue, unit: '°' };
  }
  return applyCalibration(m.pixelValue, m.type, scale);
}

export default function MeasureView() {
  const [stateSig, shareUrl] = useUrlState<State>('measure', DEFAULTS);
  const s = stateSig.value;
  const set = (patch: Partial<State>) => { stateSig.value = { ...stateSig.value, ...patch }; };

  const activeScale: CalibrationScale = useMemo(() => ({
    pixels: s.scalePixels > 0 ? s.scalePixels : 100,
    realLength: s.calibLength > 0 ? s.calibLength : 50,
    unit: s.calibUnit || 'µm',
  }), [s.scalePixels, s.calibLength, s.calibUnit]);

  const [measurements, setMeasurements] = useState<MeasurementItem[]>([
    {
      id: 'm1',
      type: 'line',
      label: 'Cell Length #1',
      points: [{ x: 120, y: 150 }, { x: 260, y: 190 }],
      color: '#0ea5e9',
      pixelValue: 145.6,
      calibratedValue: 72.8,
      unit: 'µm',
    },
  ]);

  const [currentPoints, setCurrentPoints] = useState<Point[]>([]);
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [imageDimensions, setImageDimensions] = useState<{ width: number; height: number } | null>(null);
  const [zoom, setZoom] = useState<number>(1.0);
  const [zoomMode, setZoomMode] = useState<'fit' | 'custom'>('fit');
  const [hoverPt, setHoverPt] = useState<Point | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const canvasWidth = imageDimensions?.width ?? 640;
  const canvasHeight = imageDimensions?.height ?? 480;

  // Transform client mouse coordinate on displayed canvas to native unzoomed image resolution
  function getCanvasCoord(e: MouseEvent): Point | null {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    const scaleFactorX = canvas.width / rect.width;
    const scaleFactorY = canvas.height / rect.height;
    const rawX = (e.clientX - rect.left) * scaleFactorX;
    const rawY = (e.clientY - rect.top) * scaleFactorY;
    return {
      x: Math.round(Math.max(0, Math.min(canvas.width, rawX))),
      y: Math.round(Math.max(0, Math.min(canvas.height, rawY))),
    };
  }

  // Redraw canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = canvasWidth;
    canvas.height = canvasHeight;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (imageSrc) {
      const img = new Image();
      img.onload = () => {
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        drawAnnotations(ctx);
      };
      img.src = imageSrc;
    } else {
      // Draw realistic cell micrograph / test pattern
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.strokeStyle = '#e2e8f0';
      ctx.lineWidth = 1;
      for (let x = 0; x < canvas.width; x += 50) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke();
      }
      for (let y = 0; y < canvas.height; y += 50) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke();
      }

      // Draw sample cell contours
      ctx.save();
      ctx.fillStyle = 'rgba(14, 165, 233, 0.12)';
      ctx.strokeStyle = '#0284c7';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(190, 170, 75, 40, 0.35, 0, 2 * Math.PI);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = 'rgba(16, 185, 129, 0.12)';
      ctx.strokeStyle = '#059669';
      ctx.beginPath();
      ctx.ellipse(400, 260, 90, 50, -0.4, 0, 2 * Math.PI);
      ctx.fill();
      ctx.stroke();
      ctx.restore();

      // Dynamic scale bar at bottom right
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(canvas.width - 150, canvas.height - 35, activeScale.pixels, 6);
      ctx.font = 'bold 11px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(
        `Scale: ${activeScale.realLength} ${activeScale.unit} (${activeScale.pixels.toFixed(1)} px)`,
        canvas.width - 150 + activeScale.pixels / 2,
        canvas.height - 18,
      );

      drawAnnotations(ctx);
    }
  }, [imageSrc, imageDimensions, measurements, currentPoints, hoverPt, activeScale, canvasWidth, canvasHeight]);

  function drawAnnotations(ctx: CanvasRenderingContext2D) {
    // Draw finalized measurements
    for (const m of measurements) {
      const cal = getMeasurementCalibrated(m, activeScale);
      ctx.strokeStyle = m.color;
      ctx.fillStyle = m.color;
      ctx.lineWidth = 2.5;

      if (m.type === 'line' && m.points.length === 2) {
        const [p1, p2] = m.points;
        ctx.beginPath();
        ctx.moveTo(p1!.x, p1!.y);
        ctx.lineTo(p2!.x, p2!.y);
        ctx.stroke();

        // Endcaps
        ctx.beginPath(); ctx.arc(p1!.x, p1!.y, 4, 0, 2 * Math.PI); ctx.fill();
        ctx.beginPath(); ctx.arc(p2!.x, p2!.y, 4, 0, 2 * Math.PI); ctx.fill();

        // Label
        const mx = (p1!.x + p2!.x) / 2;
        const my = (p1!.y + p2!.y) / 2 - 8;
        ctx.font = 'bold 11px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`${m.label}: ${cal.value.toFixed(1)} ${cal.unit}`, mx, my);
      } else if (m.type === 'rect' && m.points.length === 2) {
        const [p1, p2] = m.points;
        const x = Math.min(p1!.x, p2!.x);
        const y = Math.min(p1!.y, p2!.y);
        const w = Math.abs(p2!.x - p1!.x);
        const h = Math.abs(p2!.y - p1!.y);
        ctx.strokeRect(x, y, w, h);
        ctx.fillText(`${m.label}: ${cal.value.toFixed(1)} ${cal.unit}`, x + w / 2, y - 6);
      } else if (m.type === 'angle' && m.points.length === 3) {
        const [p1, v, p2] = m.points;
        ctx.beginPath();
        ctx.moveTo(p1!.x, p1!.y);
        ctx.lineTo(v!.x, v!.y);
        ctx.lineTo(p2!.x, p2!.y);
        ctx.stroke();
        ctx.fillText(`${m.label}: ${cal.value.toFixed(1)}°`, v!.x, v!.y - 10);
      }
    }

    // Draw active drawing points in progress and live rubberband preview
    if (currentPoints.length > 0) {
      ctx.fillStyle = '#ef4444';
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 1.5;
      for (const p of currentPoints) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 5, 0, 2 * Math.PI);
        ctx.fill();
      }

      // Live rubberband preview to cursor position
      const p1 = currentPoints[0]!;
      const pPreview = hoverPt || (currentPoints.length === 2 ? currentPoints[1]! : null);

      if (pPreview && currentPoints.length === 1) {
        ctx.save();
        ctx.setLineDash([4, 4]);
        ctx.lineWidth = 2;
        ctx.strokeStyle = s.tool === 'calibrate' ? '#d97706' : '#3b82f6';
        ctx.fillStyle = s.tool === 'calibrate' ? '#d97706' : '#3b82f6';

        if (s.tool === 'line' || s.tool === 'calibrate') {
          ctx.beginPath();
          ctx.moveTo(p1.x, p1.y);
          ctx.lineTo(pPreview.x, pPreview.y);
          ctx.stroke();

          const distPx = distanceBetween(p1, pPreview);
          const cal = applyCalibration(distPx, 'line', activeScale);
          const mx = (p1.x + pPreview.x) / 2;
          const my = (p1.y + pPreview.y) / 2 - 8;
          ctx.font = 'bold 11px sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(`${distPx.toFixed(1)} px (${cal.value.toFixed(1)} ${cal.unit})`, mx, my);
        } else if (s.tool === 'rect') {
          const x = Math.min(p1.x, pPreview.x);
          const y = Math.min(p1.y, pPreview.y);
          const w = Math.abs(pPreview.x - p1.x);
          const h = Math.abs(pPreview.y - p1.y);
          ctx.strokeRect(x, y, w, h);

          const areaPx = w * h;
          const cal = applyCalibration(areaPx, 'rect', activeScale);
          ctx.font = 'bold 11px sans-serif';
          ctx.fillText(`${cal.value.toFixed(1)} ${cal.unit}`, x + w / 2, y - 6);
        }
        ctx.restore();
      } else if (currentPoints.length === 2 && s.tool === 'angle' && hoverPt) {
        // Live angle preview with arm 1, vertex, and hover arm 2
        const [pt1, v] = currentPoints;
        ctx.save();
        ctx.setLineDash([4, 4]);
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#10b981';
        ctx.beginPath();
        ctx.moveTo(pt1!.x, pt1!.y);
        ctx.lineTo(v!.x, v!.y);
        ctx.lineTo(hoverPt.x, hoverPt.y);
        ctx.stroke();

        const deg = angleBetweenPoints(pt1!, v!, hoverPt);
        ctx.font = 'bold 11px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`${deg.toFixed(1)}°`, v!.x, v!.y - 10);
        ctx.restore();
      }
    }
  }

  function handleCanvasClick(e: MouseEvent) {
    const pt = getCanvasCoord(e);
    if (!pt) return;

    const nextPoints = [...currentPoints, pt];

    if (s.tool === 'calibrate') {
      if (nextPoints.length === 2) {
        const px = distanceBetween(nextPoints[0]!, nextPoints[1]!);
        if (px > 0) {
          set({ scalePixels: px, tool: 'line' });
        }
        setCurrentPoints([]);
      } else {
        setCurrentPoints(nextPoints);
      }
      return;
    }

    if (s.tool === 'line' || s.tool === 'rect') {
      if (nextPoints.length === 2) {
        const p1 = nextPoints[0]!;
        const p2 = nextPoints[1]!;
        const pxDist = distanceBetween(p1, p2);
        const cal = applyCalibration(pxDist, s.tool, activeScale);

        const newM: MeasurementItem = {
          id: `m-${Date.now()}`,
          type: s.tool as MeasurementType,
          label: `${s.tool === 'line' ? 'Distance' : 'Area'} #${measurements.length + 1}`,
          points: [p1, p2],
          color: '#2563eb',
          pixelValue: pxDist,
          calibratedValue: cal.value,
          unit: cal.unit,
        };
        setMeasurements(prev => [...prev, newM]);
        setCurrentPoints([]);
      } else {
        setCurrentPoints(nextPoints);
      }
    } else if (s.tool === 'angle') {
      if (nextPoints.length === 3) {
        const [p1, v, p2] = nextPoints;
        const deg = angleBetweenPoints(p1!, v!, p2!);
        const newM: MeasurementItem = {
          id: `m-${Date.now()}`,
          type: 'angle',
          label: `Angle #${measurements.length + 1}`,
          points: [p1!, v!, p2!],
          color: '#10b981',
          pixelValue: deg,
          calibratedValue: deg,
          unit: '°',
          angleDeg: deg,
        };
        setMeasurements(prev => [...prev, newM]);
        setCurrentPoints([]);
      } else {
        setCurrentPoints(nextPoints);
      }
    }
  }

  function handleCanvasMouseMove(e: MouseEvent) {
    const pt = getCanvasCoord(e);
    setHoverPt(pt);
  }

  function handleWheel(e: WheelEvent) {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const delta = e.deltaY < 0 ? 0.2 : -0.2;
      setZoomMode('custom');
      setZoom(z => Math.max(0.2, Math.min(8.0, Math.round((z + delta) * 100) / 100)));
    }
  }

  function handleImageUpload(file: File) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const src = e.target?.result as string;
      if (src) {
        const img = new Image();
        img.onload = () => {
          const MAX_DIM = 2400;
          let w = img.naturalWidth || 640;
          let h = img.naturalHeight || 480;
          if (w > MAX_DIM || h > MAX_DIM) {
            if (w >= h) {
              h = Math.round((h * MAX_DIM) / w);
              w = MAX_DIM;
            } else {
              w = Math.round((w * MAX_DIM) / h);
              h = MAX_DIM;
            }
          }
          setImageDimensions({ width: w, height: h });
          setImageSrc(src);
          setMeasurements([]);
          setCurrentPoints([]);
        };
        img.src = src;
      }
    };
    reader.readAsDataURL(file);
  }

  function handleExportCsv() {
    const rows = [
      ['ID', 'Label', 'Type', 'Calibrated_Value', 'Unit', 'Pixel_Value'],
      ...measurements.map(m => {
        const cal = getMeasurementCalibrated(m, activeScale);
        return [
          m.id,
          `"${m.label.replace(/"/g, '""')}"`,
          m.type,
          cal.value.toFixed(3),
          cal.unit,
          m.pixelValue.toFixed(1),
        ];
      }),
    ];
    const csv = rows.map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `measurements_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const copyText = [
    `Image Measurer Results (Scale: ${activeScale.realLength} ${activeScale.unit} = ${activeScale.pixels.toFixed(1)} px):`,
    ...measurements.map(m => {
      const cal = getMeasurementCalibrated(m, activeScale);
      return `  - ${m.label} (${m.type}): ${cal.value.toFixed(2)} ${cal.unit}`;
    }),
    '',
    scienceText(SCIENCE),
  ].join('\n');

  return (
    <ToolLayout
      icon="📐"
      title="Image Measurer & Scale Calibration"
      blurb="Calibrate scale bars and measure lengths, distances, areas, and angles on lab images."
      wide={true}
      inputs={
        <div class="space-y-4">
          {/* Tool Selector */}
          <div class="space-y-2 rounded-xl border border-slate-200 bg-white p-3.5 dark:border-slate-800 dark:bg-slate-900">
            <span class="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
              Measurement Tool
            </span>
            <div class="grid grid-cols-2 gap-1.5 text-xs">
              <button
                type="button"
                onClick={() => { setCurrentPoints([]); set({ tool: 'line' }); }}
                class={`p-2 rounded-lg font-semibold transition ${s.tool === 'line' ? 'bg-accent-600 text-white' : 'border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'}`}
              >
                📏 Line / Distance
              </button>
              <button
                type="button"
                onClick={() => { setCurrentPoints([]); set({ tool: 'angle' }); }}
                class={`p-2 rounded-lg font-semibold transition ${s.tool === 'angle' ? 'bg-accent-600 text-white' : 'border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'}`}
              >
                📐 Angle (3 pts)
              </button>
              <button
                type="button"
                onClick={() => { setCurrentPoints([]); set({ tool: 'rect' }); }}
                class={`p-2 rounded-lg font-semibold transition ${s.tool === 'rect' ? 'bg-accent-600 text-white' : 'border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'}`}
              >
                ▭ Rectangle Area
              </button>
              <button
                type="button"
                onClick={() => { setCurrentPoints([]); set({ tool: 'calibrate' }); }}
                class={`p-2 rounded-lg font-semibold transition ${s.tool === 'calibrate' ? 'bg-amber-600 text-white' : 'border border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-300 hover:bg-amber-50'}`}
              >
                ⚙️ Set Scale Bar
              </button>
            </div>
          </div>

          {/* Scale Calibration Card */}
          <div class="space-y-3 rounded-xl border border-slate-200 bg-white p-3.5 dark:border-slate-800 dark:bg-slate-900">
            <h3 class="text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
              Scale Calibration
            </h3>
            <div class="grid grid-cols-2 gap-2">
              <div>
                <label class="block text-[11px] text-slate-500 mb-1">Known Length</label>
                <input
                  type="number"
                  min="0.001"
                  step="any"
                  aria-label="Known Length"
                  value={s.calibLength}
                  onInput={(e) => set({ calibLength: parseFloat((e.target as HTMLInputElement).value) || 1 })}
                  class="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs dark:border-slate-700 dark:bg-slate-900"
                />
              </div>
              <div>
                <label class="block text-[11px] text-slate-500 mb-1">Unit</label>
                <select
                  aria-label="Scale Unit"
                  value={s.calibUnit}
                  onChange={(e) => set({ calibUnit: (e.target as HTMLSelectElement).value as State['calibUnit'] })}
                  class="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs dark:border-slate-700 dark:bg-slate-900 font-medium"
                >
                  <option value="nm">nm</option>
                  <option value="µm">µm</option>
                  <option value="mm">mm</option>
                  <option value="cm">cm</option>
                </select>
              </div>
            </div>

            <div class="text-[11px] text-slate-500 bg-slate-50 dark:bg-slate-800/50 p-2 rounded-lg">
              Current: <strong>{activeScale.realLength} {activeScale.unit}</strong> = <strong>{activeScale.pixels.toFixed(1)} px</strong> ({(activeScale.realLength / activeScale.pixels).toFixed(4)} {activeScale.unit}/px)
            </div>
          </div>

          <div class="flex gap-2">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              class="flex-1 py-1.5 text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
            >
              📷 Open Image
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
              onClick={() => { setImageSrc(null); setImageDimensions(null); setMeasurements([]); setCurrentPoints([]); }}
              class="px-3 py-1.5 text-xs font-medium rounded-lg text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 border border-rose-200 dark:border-rose-900 transition"
            >
              Clear
            </button>
          </div>
        </div>
      }
      results={
        <div class="space-y-4">
          {/* Canvas Card */}
          <div class="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 space-y-2">
            <div class="flex items-center justify-between">
              <div>
                <h3 class="font-bold text-sm text-slate-900 dark:text-slate-100">
                  Image Canvas
                </h3>
                <p class="text-xs text-slate-500">
                  {s.tool === 'calibrate'
                    ? 'Click 2 points across the scale bar to calibrate.'
                    : s.tool === 'line'
                    ? 'Click 2 points to measure distance.'
                    : s.tool === 'angle'
                    ? 'Click 3 points (arm 1, vertex, arm 2) to measure angle.'
                    : 'Click 2 opposite corners to measure rectangle area.'}
                </p>
              </div>
              <button
                type="button"
                onClick={handleExportCsv}
                disabled={measurements.length === 0}
                class="px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50 transition"
              >
                Export CSV
              </button>
            </div>

            {/* Zoom Controls & Coordinate Readout Toolbar */}
            <div class="flex flex-wrap items-center justify-between gap-2 p-2.5 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700">
              <div class="flex items-center gap-2 text-xs font-mono text-slate-600 dark:text-slate-300">
                <span class="px-2 py-0.5 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-2xs font-semibold">
                  {canvasWidth} × {canvasHeight} px
                </span>
                {hoverPt ? (
                  <span class="text-accent-600 dark:text-accent-400 font-semibold">
                    X: {hoverPt.x} px · Y: {hoverPt.y} px (
                    {((hoverPt.x * activeScale.realLength) / activeScale.pixels).toFixed(1)} {activeScale.unit},{' '}
                    {((hoverPt.y * activeScale.realLength) / activeScale.pixels).toFixed(1)} {activeScale.unit})
                  </span>
                ) : (
                  <span class="text-slate-400 text-[11px]">Hover image to inspect coordinates · Ctrl+Scroll to zoom</span>
                )}
              </div>

              {/* Zoom Controls */}
              <div class="flex items-center gap-1.5 text-xs">
                <span class="text-[11px] text-slate-500 font-medium">Zoom:</span>
                <button
                  type="button"
                  onClick={() => {
                    setZoomMode('custom');
                    setZoom(z => Math.max(0.25, Math.round((z - 0.25) * 100) / 100));
                  }}
                  class="w-7 h-7 flex items-center justify-center rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 font-bold transition shadow-2xs"
                  title="Zoom Out (-25%)"
                  aria-label="Zoom Out"
                >
                  −
                </button>

                <select
                  value={zoomMode === 'fit' ? 'fit' : zoom.toString()}
                  onChange={(e) => {
                    const val = (e.target as HTMLSelectElement).value;
                    if (val === 'fit') {
                      setZoomMode('fit');
                    } else {
                      setZoomMode('custom');
                      setZoom(parseFloat(val));
                    }
                  }}
                  aria-label="Zoom Level"
                  class="px-2 py-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono text-xs font-semibold shadow-2xs"
                >
                  <option value="fit">Fit (Auto)</option>
                  <option value="0.25">25%</option>
                  <option value="0.5">50%</option>
                  <option value="0.75">75%</option>
                  <option value="1">100% (1:1)</option>
                  <option value="1.25">125%</option>
                  <option value="1.5">150%</option>
                  <option value="2">200%</option>
                  <option value="3">300%</option>
                  <option value="4">400%</option>
                  <option value="8">800%</option>
                  {zoomMode === 'custom' && !['0.25', '0.5', '0.75', '1', '1.25', '1.5', '2', '3', '4', '8'].includes(zoom.toString()) && (
                    <option value={zoom.toString()}>{Math.round(zoom * 100)}%</option>
                  )}
                </select>

                <button
                  type="button"
                  onClick={() => {
                    setZoomMode('custom');
                    setZoom(z => Math.min(8.0, Math.round((z + 0.25) * 100) / 100));
                  }}
                  class="w-7 h-7 flex items-center justify-center rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 font-bold transition shadow-2xs"
                  title="Zoom In (+25%)"
                  aria-label="Zoom In"
                >
                  +
                </button>

                <button
                  type="button"
                  onClick={() => setZoomMode('fit')}
                  class={`px-2.5 py-1 rounded-lg font-semibold transition text-xs shadow-2xs ${
                    zoomMode === 'fit'
                      ? 'bg-accent-600 text-white'
                      : 'border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  Fit
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setZoom(1.0);
                    setZoomMode('custom');
                  }}
                  class={`px-2.5 py-1 rounded-lg font-semibold transition text-xs shadow-2xs ${
                    zoomMode === 'custom' && zoom === 1.0
                      ? 'bg-accent-600 text-white'
                      : 'border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  100%
                </button>
              </div>
            </div>

            <div
              onWheel={handleWheel}
              class="flex justify-center items-center p-3 bg-slate-100 dark:bg-slate-950 rounded-xl overflow-auto max-h-[750px] min-h-[360px] border border-slate-200/60 dark:border-slate-800/60"
            >
              <canvas
                ref={canvasRef}
                width={canvasWidth}
                height={canvasHeight}
                onClick={handleCanvasClick}
                onMouseMove={handleCanvasMouseMove}
                onMouseLeave={() => setHoverPt(null)}
                class="cursor-crosshair rounded-lg shadow-sm transition-[width,height] duration-75"
                style={{
                  width: zoomMode === 'fit' ? '100%' : `${Math.round(canvasWidth * zoom)}px`,
                  height: zoomMode === 'fit' ? 'auto' : `${Math.round(canvasHeight * zoom)}px`,
                  maxWidth: zoomMode === 'fit' ? '100%' : 'none',
                  maxHeight: zoomMode === 'fit' ? '700px' : 'none',
                  minWidth: zoomMode === 'fit' ? 'auto' : `${Math.round(canvasWidth * zoom)}px`,
                  objectFit: 'contain',
                  imageRendering: zoom >= 1.5 ? 'pixelated' : 'auto',
                }}
              />
            </div>
          </div>

          {/* Measurements Table */}
          {measurements.length > 0 && (
            <div class="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
              <h4 class="font-bold text-xs text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-2">
                Recorded Measurements ({measurements.length})
              </h4>
              <div class="overflow-x-auto">
                <table class="w-full text-xs text-left">
                  <thead>
                    <tr class="border-b border-slate-200 dark:border-slate-700 text-slate-500">
                      <th class="pb-2 font-semibold">#</th>
                      <th class="pb-2 font-semibold">Label</th>
                      <th class="pb-2 font-semibold">Type</th>
                      <th class="pb-2 font-semibold text-right">Calibrated Value</th>
                      <th class="pb-2 font-semibold text-right">Pixels</th>
                      <th class="pb-2 font-semibold text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-slate-100 dark:divide-slate-800">
                    {measurements.map((m, idx) => {
                      const cal = getMeasurementCalibrated(m, activeScale);
                      return (
                        <tr key={m.id}>
                          <td class="py-2 text-slate-400">{idx + 1}</td>
                          <td class="py-2 font-semibold text-slate-900 dark:text-slate-100">{m.label}</td>
                          <td class="py-2 text-slate-500 capitalize">{m.type}</td>
                          <td data-testid={`meas-val-${idx}`} class="py-2 font-mono font-bold text-right text-accent-600 dark:text-accent-400">
                            {cal.value.toFixed(2)} {cal.unit}
                          </td>
                          <td class="py-2 font-mono text-right text-slate-400">{m.pixelValue.toFixed(1)} px</td>
                          <td class="py-2 text-center">
                            <button
                              type="button"
                              onClick={() => setMeasurements(prev => prev.filter(item => item.id !== m.id))}
                              class="text-slate-400 hover:text-rose-500"
                              title="Delete measurement"
                            >
                              ✕
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      }
      actions={<ActionBar onCopy={() => copyText} shareUrl={shareUrl} />}
      science={<SciencePanel science={SCIENCE} />}
    />
  );
}
