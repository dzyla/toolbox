import { useEffect, useRef, useState, useMemo } from 'preact/hooks';
import { useUrlState } from '@/lib/url-state';
import { downloadText, downloadBlob, toCsv } from '@/lib/export';
import { decodeImageFile } from '@/lib/image';
import { demoGel } from '@/core/gel/synthetic';
import { autoLanes, equalLanes } from '@/core/gel/lanes';
import { sampleLane, laneProfile, detectBands } from '@/core/gel/profile';
import { rollingBaseline, valleyBaseline, sharedCrossLaneBaseline } from '@/core/gel/background';
import { quantifyBands, detectPolarity, type BandMetrics } from '@/core/gel/quant';
import { fitCalibration, formatSize, type Calibration } from '@/core/gel/calibration';
import { transformPlane, type Geometry } from '@/core/gel/transform';
import type { Plane, Polarity, Lane, Band } from '@/core/gel/types';
import laddersData from '@/data/ladders.json';
import { ToolLayout } from '@/app/components/ToolLayout';
import { SciencePanel, scienceText } from '@/app/components/SciencePanel';
import { ActionBar } from '@/app/components/ActionBar';
import { SCIENCE } from './science';

interface StandardLadder {
  id: string;
  name: string;
  kind: 'protein' | 'dna';
  sizes: number[];
  unit?: string;
  supplier?: string;
}

const LADDERS = laddersData.ladders as unknown as StandardLadder[];

interface State {
  polarity: Polarity;
  brightness: number;
  contrast: number;
  invertDisplay: boolean;
  bgMethod: 'shared' | 'rolling' | 'valley' | 'none';
  rollingRadius: number;
  prominence: number;
  ladderLaneId: string;
  ladderId: string;
  calibMethod: 'linear' | 'piecewise' | 'spline';
  refBandId: string;
  viewTab: 'gel' | 'calib' | 'quant';
  tableMode: 'all' | 'selected';
}

const DEFAULTS: State = {
  polarity: 'dark',
  brightness: 1,
  contrast: 1,
  invertDisplay: false,
  bgMethod: 'shared',
  rollingRadius: 40,
  prominence: 0.05,
  ladderLaneId: '',
  ladderId: 'broad-protein',
  calibMethod: 'piecewise',
  refBandId: '',
  viewTab: 'gel',
  tableMode: 'all',
};

const SATURATION_WARN = 0.05;

interface LaneAnalysisItem {
  lane: Lane;
  laneIdx: number;
  profile: Float32Array;
  baseline: Float32Array;
  metrics: (BandMetrics & { number: number; share: number; ratio: number; sizeEst: number | null })[];
  totalNet: number;
}

function toBands(peaks: ReturnType<typeof detectBands>): Band[] {
  return peaks.map((p, i) => ({
    id: `b-${Math.round(p.index)}-${i}`,
    y0: p.y0,
    y1: p.y1,
    peakY: p.index,
  }));
}

function BandQuantChart({
  analysis,
  ladderKind,
  laneLabels,
  selectedLaneId,
  onSelectLane,
}: {
  analysis: LaneAnalysisItem[];
  ladderKind: 'protein' | 'dna';
  laneLabels: Record<string, string>;
  selectedLaneId?: string;
  onSelectLane?: (laneId: string) => void;
}) {
  const [chartMode, setChartMode] = useState<'lane' | 'mass'>('lane');
  const [targetBandIdx, setTargetBandIdx] = useState<number>(0);
  const [metric, setMetric] = useState<'net' | 'raw' | 'share'>('net');
  const [hoveredBar, setHoveredBar] = useState<{
    laneIdx: number;
    bandNum: number;
    val: number;
    size: string;
    share: number;
    fold?: string;
  } | null>(null);

  if (analysis.length === 0) return null;

  const bandColors = [
    '#3b82f6', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6',
    '#06b6d4', '#f97316', '#14b8a6', '#6366f1', '#e11d48',
  ];

  const maxBands = Math.max(1, ...analysis.map(a => a.metrics.length));

  // Build target band list with average MW
  const targetBandOptions = Array.from({ length: maxBands }, (_, bIdx) => {
    const sizes = analysis
      .map(a => a.metrics[bIdx]?.sizeEst)
      .filter((s): s is number => typeof s === 'number' && s > 0);
    const avgSize = sizes.length > 0 ? sizes.reduce((a, b) => a + b, 0) / sizes.length : null;
    return {
      idx: bIdx,
      label: `Band #${bIdx + 1}${avgSize ? ` (~${formatSize(avgSize, ladderKind)})` : ''}`,
      avgSize,
    };
  });

  const chartW = 750;
  const chartH = 260;
  const padLeft = 65;
  const padRight = 30;
  const padTop = 30;
  const padBottom = 50;
  const innerW = chartW - padLeft - padRight;
  const innerH = chartH - padTop - padBottom;

  const getMetricVal = (m?: { net: number; raw: number; share: number }) => {
    if (!m) return 0;
    if (metric === 'net') return Math.max(0, m.net);
    if (metric === 'raw') return Math.max(0, m.raw);
    return Math.max(0, m.share);
  };

  // Compute maxVal
  const maxVal = Math.max(
    1,
    chartMode === 'mass'
      ? Math.max(...analysis.map(a => getMetricVal(a.metrics[targetBandIdx])))
      : Math.max(...analysis.flatMap(a => a.metrics.map(getMetricVal)))
  );

  // Reference for fold-change in mass mode
  const refMetric = analysis[0]?.metrics[targetBandIdx];
  const refVal = refMetric ? getMetricVal(refMetric) : 0;

  return (
    <div class="rounded-xl border border-slate-200 p-4 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-900/40 space-y-3">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div class="flex flex-wrap items-center gap-2">
          <span class="text-xs font-bold text-slate-800 dark:text-slate-200">
            📊 Band Quantification &amp; Densitometry
          </span>
          {/* Mode toggle */}
          <div class="flex rounded-lg border border-slate-200 dark:border-slate-700 p-0.5 bg-white dark:bg-slate-900 text-xs">
            <button
              type="button"
              onClick={() => setChartMode('lane')}
              class={`px-2.5 py-0.5 rounded font-medium transition ${chartMode === 'lane' ? 'bg-accent-600 text-white' : 'text-slate-600 dark:text-slate-400'}`}
            >
              Per Lane (All Bands)
            </button>
            <button
              type="button"
              onClick={() => setChartMode('mass')}
              class={`px-2.5 py-0.5 rounded font-medium transition ${chartMode === 'mass' ? 'bg-accent-600 text-white' : 'text-slate-600 dark:text-slate-400'}`}
            >
              Per Target Mass (WB Mode)
            </button>
          </div>

          {chartMode === 'mass' && (
            <select
              value={targetBandIdx}
              onChange={(e) => setTargetBandIdx(parseInt((e.target as HTMLSelectElement).value) || 0)}
              class="text-xs px-2 py-0.5 rounded-lg border border-slate-300 dark:border-slate-700 dark:bg-slate-900 font-semibold"
            >
              {targetBandOptions.map(opt => (
                <option key={opt.idx} value={opt.idx}>
                  {opt.label}
                </option>
              ))}
            </select>
          )}
        </div>

        <div class="flex items-center gap-2 text-xs">
          <span class="text-slate-500">Metric:</span>
          <div class="flex rounded-lg border border-slate-200 dark:border-slate-700 p-0.5 bg-white dark:bg-slate-900">
            <button
              type="button"
              onClick={() => setMetric('net')}
              class={`px-2.5 py-0.5 rounded font-medium transition ${metric === 'net' ? 'bg-accent-600 text-white' : 'text-slate-600 dark:text-slate-400'}`}
            >
              Net OD
            </button>
            <button
              type="button"
              onClick={() => setMetric('raw')}
              class={`px-2.5 py-0.5 rounded font-medium transition ${metric === 'raw' ? 'bg-accent-600 text-white' : 'text-slate-600 dark:text-slate-400'}`}
            >
              Raw Volume
            </button>
            <button
              type="button"
              onClick={() => setMetric('share')}
              class={`px-2.5 py-0.5 rounded font-medium transition ${metric === 'share' ? 'bg-accent-600 text-white' : 'text-slate-600 dark:text-slate-400'}`}
            >
              % Share
            </button>
          </div>
        </div>
      </div>

      {hoveredBar && (
        <div class="text-xs text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-800 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 flex flex-wrap items-center gap-4">
          <span>Lane: <strong>L{hoveredBar.laneIdx + 1}</strong></span>
          <span>Band: <strong>#{hoveredBar.bandNum}</strong></span>
          {hoveredBar.size && <span>Est. MW: <strong class="text-accent-600 dark:text-accent-400">{hoveredBar.size}</strong></span>}
          <span>Value: <strong>{Math.round(hoveredBar.val).toLocaleString()} {metric === 'share' ? '%' : 'OD'}</strong></span>
          {hoveredBar.fold && <span>Relative Fold: <strong class="text-emerald-600 dark:text-emerald-400">{hoveredBar.fold}</strong></span>}
        </div>
      )}

      <div class="overflow-x-auto">
        <svg viewBox={`0 0 ${chartW} ${chartH}`} class="w-full h-auto min-w-[500px] select-none">
          {/* Grid lines */}
          {[0, 0.25, 0.5, 0.75, 1].map(frac => {
            const y = padTop + innerH * (1 - frac);
            const labelVal = frac * maxVal;
            return (
              <g key={frac}>
                <line x1={padLeft} x2={chartW - padRight} y1={y} y2={y} stroke="#e2e8f0" stroke-dasharray="3,3" />
                <text x={padLeft - 6} y={y + 4} font-size="9" text-anchor="end" fill="#94a3b8" font-family="monospace">
                  {metric === 'share' ? `${Math.round(labelVal)}%` : Math.round(labelVal).toLocaleString()}
                </text>
              </g>
            );
          })}

          {chartMode === 'lane' ? (
            /* Multi-band columns per lane */
            analysis.map((item, lIdx) => {
              const groupW = innerW / Math.max(1, analysis.length);
              const groupX = padLeft + lIdx * groupW;
              const bCount = Math.max(1, item.metrics.length);
              const colW = Math.min(26, Math.max(4, (groupW - 12) / bCount));
              const isSelectedLane = item.lane.id === selectedLaneId;
              const customLabel = laneLabels[item.lane.id] || `L${lIdx + 1}`;

              return (
                <g key={item.lane.id} onClick={() => onSelectLane?.(item.lane.id)} class="cursor-pointer">
                  {isSelectedLane && (
                    <rect x={groupX + 2} y={padTop} width={groupW - 4} height={innerH} fill="rgba(37, 99, 235, 0.08)" rx="4" />
                  )}
                  {item.metrics.map((m, bIdx) => {
                    const val = getMetricVal(m);
                    const barH = (val / maxVal) * innerH;
                    const barX = groupX + (groupW - bCount * colW) / 2 + bIdx * colW;
                    const barY = padTop + innerH - barH;
                    const color = bandColors[bIdx % bandColors.length]!;
                    const szText = m.sizeEst ? formatSize(m.sizeEst, ladderKind) : '';

                    return (
                      <g
                        key={m.bandId}
                        onMouseEnter={() => setHoveredBar({ laneIdx: lIdx, bandNum: bIdx + 1, val, size: szText, share: m.share })}
                        onMouseLeave={() => setHoveredBar(null)}
                      >
                        <rect
                          x={barX + 1}
                          y={barY}
                          width={Math.max(2, colW - 2)}
                          height={Math.max(2, barH)}
                          fill={color}
                          rx="2"
                          opacity={hoveredBar && hoveredBar.laneIdx === lIdx && hoveredBar.bandNum === bIdx + 1 ? 1 : 0.85}
                        />
                        {barH > 22 && colW >= 12 && (
                          <text
                            x={barX + colW / 2}
                            y={barY + 11}
                            font-size="8"
                            font-weight="bold"
                            text-anchor="middle"
                            fill="#ffffff"
                          >
                            {bIdx + 1}
                          </text>
                        )}
                      </g>
                    );
                  })}
                  <text
                    x={groupX + groupW / 2}
                    y={chartH - padBottom + 16}
                    font-size="10"
                    font-weight={isSelectedLane ? 'bold' : 'normal'}
                    text-anchor="middle"
                    fill={isSelectedLane ? '#2563eb' : '#64748b'}
                  >
                    {customLabel.length > 10 ? `${customLabel.slice(0, 9)}…` : customLabel}
                  </text>
                </g>
              );
            })
          ) : (
            /* Target Mass mode (Western Blot cross-lane comparison) */
            analysis.map((item, lIdx) => {
              const groupW = innerW / Math.max(1, analysis.length);
              const groupX = padLeft + lIdx * groupW;
              const m = item.metrics[targetBandIdx];
              const val = getMetricVal(m);
              const barH = (val / maxVal) * innerH;
              const colW = Math.min(45, Math.max(14, groupW - 16));
              const barX = groupX + (groupW - colW) / 2;
              const barY = padTop + innerH - barH;
              const isSelectedLane = item.lane.id === selectedLaneId;
              const customLabel = laneLabels[item.lane.id] || `L${lIdx + 1}`;
              const foldStr = refVal > 0 && m ? `${(val / refVal).toFixed(2)}×` : '—';
              const szText = m?.sizeEst ? formatSize(m.sizeEst, ladderKind) : '';

              return (
                <g key={item.lane.id} onClick={() => onSelectLane?.(item.lane.id)} class="cursor-pointer">
                  {isSelectedLane && (
                    <rect x={groupX + 2} y={padTop} width={groupW - 4} height={innerH} fill="rgba(37, 99, 235, 0.08)" rx="4" />
                  )}
                  {m ? (
                    <g
                      onMouseEnter={() => setHoveredBar({ laneIdx: lIdx, bandNum: targetBandIdx + 1, val, size: szText, share: m.share, fold: foldStr })}
                      onMouseLeave={() => setHoveredBar(null)}
                    >
                      <rect
                        x={barX}
                        y={barY}
                        width={colW}
                        height={Math.max(2, barH)}
                        fill="#0284c7"
                        rx="3"
                        opacity={hoveredBar && hoveredBar.laneIdx === lIdx ? 1 : 0.85}
                      />
                      {/* Fold change label on top of bar */}
                      <text
                        x={barX + colW / 2}
                        y={Math.max(padTop + 10, barY - 4)}
                        font-size="9"
                        font-weight="bold"
                        text-anchor="middle"
                        fill="#0369a1"
                        font-family="monospace"
                      >
                        {foldStr}
                      </text>
                    </g>
                  ) : (
                    <text
                      x={groupX + groupW / 2}
                      y={padTop + innerH - 8}
                      font-size="9"
                      font-style="italic"
                      fill="#94a3b8"
                      text-anchor="middle"
                    >
                      n/d
                    </text>
                  )}
                  <text
                    x={groupX + groupW / 2}
                    y={chartH - padBottom + 16}
                    font-size="10"
                    font-weight={isSelectedLane ? 'bold' : 'normal'}
                    text-anchor="middle"
                    fill={isSelectedLane ? '#2563eb' : '#64748b'}
                  >
                    {customLabel.length > 10 ? `${customLabel.slice(0, 9)}…` : customLabel}
                  </text>
                </g>
              );
            })
          )}
        </svg>
      </div>
    </div>
  );
}

export default function GelView() {
  const [stateSig, shareUrl] = useUrlState<State>('gel', DEFAULTS);
  const s = stateSig.value;
  const set = (patch: Partial<State>) => { stateSig.value = { ...stateSig.value, ...patch }; };

  // Base raw plane untouched by user crop/rotation
  const [originalPlane, setOriginalPlane] = useState<Plane | null>(null);
  // Un-deskewed base plane before fine rotation
  const [basePlane, setBasePlane] = useState<Plane | null>(null);
  // Current active working plane
  const [plane, setPlane] = useState<Plane | null>(null);

  const [imageName, setImageName] = useState<string>('');
  const [lanes, setLanes] = useState<Lane[]>([]);
  const [selectedLaneId, setSelectedLaneId] = useState<string>('');
  const [bandMap, setBandMap] = useState<Record<string, Band[]>>({});
  const [numLanesInput, setNumLanesInput] = useState<number>(5);

  // Annotations
  const [gelTitle, setGelTitle] = useState<string>('Gel & Blot Analysis');
  const [laneLabels, setLaneLabels] = useState<Record<string, string>>({});
  const [showMwLabels, setShowMwLabels] = useState<boolean>(true);
  const [showLaneHeaders, setShowLaneHeaders] = useState<boolean>(true);
  const [stripLanePrefix, setStripLanePrefix] = useState<boolean>(false);

  // Layout & Zoom
  const [gelLayout, setGelLayout] = useState<'split' | 'stacked'>('split');
  const [canvasZoom, setCanvasZoom] = useState<number>(100);

  // Custom Ladders
  const [customLadders, setCustomLadders] = useState<StandardLadder[]>(() => {
    try {
      const stored = localStorage.getItem('bio-bench-custom-ladders');
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });
  const [showCustomLadderModal, setShowCustomLadderModal] = useState<boolean>(false);
  const [customLadderName, setCustomLadderName] = useState<string>('');
  const [customLadderKind, setCustomLadderKind] = useState<'protein' | 'dna'>('protein');
  const [customLadderSizesStr, setCustomLadderSizesStr] = useState<string>('');
  const [customLadderError, setCustomLadderError] = useState<string>('');
  const customLadderFileRef = useRef<HTMLInputElement>(null);

  // Geometry / deskew angle
  const [deskewAngle, setDeskewAngle] = useState<number>(0);

  // Interactive Cropping
  const [isCropping, setIsCropping] = useState<boolean>(false);
  const [cropBox, setCropBox] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const cropStartRef = useRef<{ x: number; y: number } | null>(null);

  // Canvas Drag State
  const [dragState, setDragState] = useState<{
    type: 'move' | 'resize';
    laneId: string;
    edge?: 'left' | 'right';
    startX: number;
    origX: number;
    origWidth: number;
  } | null>(null);
  const hasDraggedRef = useRef<boolean>(false);
  const [canvasCursor, setCanvasCursor] = useState<string>('default');

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load demo gel on initial mount
  useEffect(() => {
    if (!plane) {
      loadDemo();
    }
  }, []);

  function loadDemo() {
    const demo = demoGel();
    setOriginalPlane(demo.plane);
    setBasePlane(demo.plane);
    setPlane(demo.plane);
    setImageName('demo_gel.png');
    setDeskewAngle(0);
    setIsCropping(false);
    setCropBox(null);
    const detectedPolarity = detectPolarity(demo.plane);
    set({ polarity: detectedPolarity });

    const initialLanes = autoLanes(demo.plane, { x: 0, y: 0, w: demo.plane.width, h: demo.plane.height }, detectedPolarity);
    setLanes(initialLanes);
    if (initialLanes.length > 0) {
      setSelectedLaneId(initialLanes[0]!.id);
      set({ ladderLaneId: initialLanes[0]!.id });
    }
  }

  async function handleFileUpload(file: File) {
    try {
      const decoded = await decodeImageFile(file);
      const newPlane = { width: decoded.width, height: decoded.height, data: decoded.data };
      setOriginalPlane(newPlane);
      setBasePlane(newPlane);
      setPlane(newPlane);
      setImageName(file.name);
      setDeskewAngle(0);
      setIsCropping(false);
      setCropBox(null);
      const pol = detectPolarity(newPlane);
      set({ polarity: pol });

      const detected = autoLanes(newPlane, { x: 0, y: 0, w: newPlane.width, h: newPlane.height }, pol);
      setLanes(detected);
      setBandMap({});
      if (detected.length > 0) {
        setSelectedLaneId(detected[0]!.id);
        set({ ladderLaneId: detected[0]!.id });
      }
    } catch (err) {
      alert(`Error loading image: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // Transformations
  function applyRotation(deltaDeg: number) {
    if (!plane) return;
    const g: Geometry = { rotation: deltaDeg, flipH: false, flipV: false };
    const rotated = transformPlane(plane, g);
    setBasePlane(rotated);
    setPlane(rotated);
    setDeskewAngle(0);
    setBandMap({});
    const newLanes = autoLanes(rotated, { x: 0, y: 0, w: rotated.width, h: rotated.height }, s.polarity);
    setLanes(newLanes.length > 0 ? newLanes : equalLanes(lanes.length || 5, { x: 0, y: 0, w: rotated.width, h: rotated.height }));
    if (newLanes.length > 0) setSelectedLaneId(newLanes[0]!.id);
  }

  function applyFlip(horizontal: boolean) {
    if (!plane) return;
    const g: Geometry = { rotation: 0, flipH: horizontal, flipV: !horizontal };
    const flipped = transformPlane(plane, g);
    setBasePlane(flipped);
    setPlane(flipped);
    setDeskewAngle(0);
    setBandMap({});
    const newLanes = autoLanes(flipped, { x: 0, y: 0, w: flipped.width, h: flipped.height }, s.polarity);
    setLanes(newLanes.length > 0 ? newLanes : equalLanes(lanes.length || 5, { x: 0, y: 0, w: flipped.width, h: flipped.height }));
    if (newLanes.length > 0) setSelectedLaneId(newLanes[0]!.id);
  }

  function handleDeskewChange(angle: number) {
    if (!basePlane) return;
    setDeskewAngle(angle);
    const g: Geometry = { rotation: angle, flipH: false, flipV: false };
    const transformed = transformPlane(basePlane, g);
    setPlane(transformed);
    const newLanes = autoLanes(transformed, { x: 0, y: 0, w: transformed.width, h: transformed.height }, s.polarity);
    setLanes(newLanes.length > 0 ? newLanes : equalLanes(lanes.length || 5, { x: 0, y: 0, w: transformed.width, h: transformed.height }));
  }

  function handleApplyCrop() {
    if (!plane || !cropBox || cropBox.w < 10 || cropBox.h < 10) return;
    const cropped = transformPlane(plane, { rotation: 0, flipH: false, flipV: false, crop: cropBox });
    setBasePlane(cropped);
    setPlane(cropped);
    setDeskewAngle(0);
    setIsCropping(false);
    setCropBox(null);
    setBandMap({});
    const newLanes = autoLanes(cropped, { x: 0, y: 0, w: cropped.width, h: cropped.height }, s.polarity);
    setLanes(newLanes.length > 0 ? newLanes : equalLanes(lanes.length || 5, { x: 0, y: 0, w: cropped.width, h: cropped.height }));
    if (newLanes.length > 0) setSelectedLaneId(newLanes[0]!.id);
  }

  function handleResetAllTransforms() {
    if (!originalPlane) return;
    setBasePlane(originalPlane);
    setPlane(originalPlane);
    setDeskewAngle(0);
    setIsCropping(false);
    setCropBox(null);
    setBandMap({});
    const newLanes = autoLanes(originalPlane, { x: 0, y: 0, w: originalPlane.width, h: originalPlane.height }, s.polarity);
    setLanes(newLanes.length > 0 ? newLanes : equalLanes(5, { x: 0, y: 0, w: originalPlane.width, h: originalPlane.height }));
    if (newLanes.length > 0) setSelectedLaneId(newLanes[0]!.id);
  }

  const allLadders = useMemo(() => {
    return [...LADDERS, ...customLadders];
  }, [customLadders]);

  // Active ladder preset
  const activeLadder = useMemo(() => {
    return allLadders.find(l => l.id === s.ladderId) || allLadders[0]!;
  }, [allLadders, s.ladderId]);

  function handleSaveCustomLadder() {
    setCustomLadderError('');
    if (!customLadderName.trim()) {
      setCustomLadderError('Please provide a name for this ladder.');
      return;
    }
    const numbers = customLadderSizesStr
      .split(/[\s,;]+/)
      .map(v => parseFloat(v.trim()))
      .filter(n => !isNaN(n) && n > 0);

    if (numbers.length < 2) {
      setCustomLadderError('Please enter at least 2 valid positive band sizes.');
      return;
    }

    const sorted = Array.from(new Set(numbers)).sort((a, b) => b - a);
    const newLadder: StandardLadder = {
      id: `custom-${Date.now()}`,
      name: customLadderName.trim(),
      kind: customLadderKind,
      sizes: sorted,
      unit: customLadderKind === 'protein' ? 'kDa' : 'bp',
      supplier: 'Custom',
    };

    const updated = [...customLadders, newLadder];
    setCustomLadders(updated);
    try {
      localStorage.setItem('bio-bench-custom-ladders', JSON.stringify(updated));
    } catch (e) {
      console.error(e);
    }
    set({ ladderId: newLadder.id });
    setShowCustomLadderModal(false);
    setCustomLadderName('');
    setCustomLadderSizesStr('');
  }

  function handleDeleteCustomLadder(id: string) {
    const updated = customLadders.filter(l => l.id !== id);
    setCustomLadders(updated);
    try {
      localStorage.setItem('bio-bench-custom-ladders', JSON.stringify(updated));
    } catch (e) {
      console.error(e);
    }
    if (s.ladderId === id) {
      set({ ladderId: LADDERS[0]!.id });
    }
  }

  function handleCustomLadderFileUpload(file: File) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      if (!text) return;
      try {
        const json = JSON.parse(text);
        if (Array.isArray(json)) {
          setCustomLadderSizesStr(json.join(', '));
        } else if (json && typeof json === 'object') {
          if (json.name) setCustomLadderName(json.name);
          if (json.kind === 'dna' || json.kind === 'protein') setCustomLadderKind(json.kind);
          if (Array.isArray(json.sizes)) setCustomLadderSizesStr(json.sizes.join(', '));
        }
      } catch {
        setCustomLadderSizesStr(text.trim());
      }
    };
    reader.readAsText(file);
  }

  // Calibration from ladder lane
  const calibration: Calibration | null = useMemo(() => {
    if (!plane || !s.ladderLaneId) return null;
    const ladderLane = lanes.find(l => l.id === s.ladderLaneId);
    if (!ladderLane) return null;

    try {
      const dens = sampleLane(plane, ladderLane, s.polarity);
      const prof = laneProfile(dens);
      const bands = bandMap[ladderLane.id] || toBands(detectBands(prof, { minProminence: s.prominence }));
      if (bands.length < 2) return null;

      const sortedBands = [...bands].sort((a, b) => (a.peakY ?? 0) - (b.peakY ?? 0));
      const sortedSizes = [...activeLadder.sizes].sort((a, b) => b - a);

      const pairs = sortedBands.slice(0, sortedSizes.length).map((b, i) => ({
        y: b.peakY ?? (b.y0 + b.y1) / 2,
        size: sortedSizes[i]!,
      }));

      return fitCalibration(pairs, s.calibMethod);
    } catch {
      return null;
    }
  }, [plane, lanes, s.ladderLaneId, bandMap, s.prominence, s.polarity, activeLadder, s.calibMethod]);

  // Comprehensive analysis across ALL lanes
  const allLanesAnalysis: LaneAnalysisItem[] = useMemo(() => {
    if (!plane) return [];

    let sharedBase: Float32Array | null = null;
    if (s.bgMethod === 'shared' && lanes.length > 0) {
      try {
        const allProfs = lanes.map(lane => laneProfile(sampleLane(plane, lane, s.polarity)));
        sharedBase = sharedCrossLaneBaseline(allProfs, s.rollingRadius);
      } catch {
        sharedBase = null;
      }
    }

    return lanes.map((lane, laneIdx) => {
      try {
        const dens = sampleLane(plane, lane, s.polarity);
        const prof = laneProfile(dens);
        const bands = bandMap[lane.id] || toBands(detectBands(prof, { minProminence: s.prominence }));

        let baseline: Float32Array;
        if (s.bgMethod === 'shared' && sharedBase) {
          baseline = sharedBase;
        } else if (s.bgMethod === 'rolling') {
          baseline = rollingBaseline(prof, s.rollingRadius);
        } else if (s.bgMethod === 'valley') {
          baseline = valleyBaseline(prof, bands);
        } else {
          baseline = new Float32Array(prof.length);
        }

        const metrics = quantifyBands(dens, bands, baseline);

        const totalNet = metrics.reduce((acc, m) => acc + Math.max(0, m.net), 0);
        const refBand = metrics.find(m => m.bandId === s.refBandId);
        const refNet = refBand && refBand.net > 0 ? refBand.net : (metrics[0]?.net ?? 1);

        const enriched = metrics.map((m, i) => {
          const share = totalNet > 0 ? (Math.max(0, m.net) / totalNet) * 100 : 0;
          const ratio = refNet > 0 ? Math.max(0, m.net) / refNet : 1;
          const peakY = m.peakY ?? 0;
          const sizeEst = calibration ? calibration.sizeAt(peakY) : null;
          return { ...m, number: i + 1, share, ratio, sizeEst };
        });

        return { lane, laneIdx, profile: prof, baseline, metrics: enriched, totalNet };
      } catch {
        return { lane, laneIdx, profile: new Float32Array(0), baseline: new Float32Array(0), metrics: [], totalNet: 0 };
      }
    });
  }, [plane, lanes, bandMap, s.polarity, s.bgMethod, s.rollingRadius, s.prominence, s.refBandId, calibration]);

  const selectedLane = useMemo(() => lanes.find(l => l.id === selectedLaneId) || lanes[0] || null, [lanes, selectedLaneId]);
  const selectedLaneIdx = useMemo(() => lanes.findIndex(l => l.id === selectedLane?.id), [lanes, selectedLane]);
  const laneAnalysis = useMemo(() => allLanesAnalysis.find(a => a.lane.id === selectedLane?.id) || null, [allLanesAnalysis, selectedLane]);

  // Sampled horizontal slice of the selected lane matching the profile x-axis (440px)
  const laneStripDataUrl = useMemo(() => {
    if (!plane || !selectedLane) return null;
    const stripWidth = 440;
    const stripHeight = 38;
    const offscreen = document.createElement('canvas');
    offscreen.width = stripWidth;
    offscreen.height = stripHeight;
    const ctx = offscreen.getContext('2d');
    if (!ctx) return null;

    const imgData = ctx.createImageData(stripWidth, stripHeight);
    const data = imgData.data;

    const laneY0 = selectedLane.y0;
    const laneY1 = selectedLane.y1;
    const laneLen = Math.max(1, laneY1 - laneY0);
    const halfW = selectedLane.width / 2;

    for (let c = 0; c < stripWidth; c++) {
      const t = c / (stripWidth - 1);
      const curY = laneY0 + t * laneLen;
      const curCenterX = selectedLane.x + t * selectedLane.tilt;

      for (let r = 0; r < stripHeight; r++) {
        const v = (r / (stripHeight - 1) - 0.5) * 2;
        const curX = curCenterX + v * halfW;

        const gx = Math.max(0, Math.min(plane.width - 1, Math.round(curX)));
        const gy = Math.max(0, Math.min(plane.height - 1, Math.round(curY)));
        const rawVal = plane.data[gy * plane.width + gx] ?? 0;

        let adj = (rawVal - 0.5) * s.contrast + 0.5;
        adj = adj * s.brightness;
        if (s.invertDisplay) adj = 1 - adj;
        adj = Math.max(0, Math.min(1, adj));

        const gray = Math.round(adj * 255);
        const pIdx = (r * stripWidth + c) * 4;
        data[pIdx] = gray;
        data[pIdx + 1] = gray;
        data[pIdx + 2] = gray;
        data[pIdx + 3] = 255;
      }
    }

    ctx.putImageData(imgData, 0, 0);
    return offscreen.toDataURL();
  }, [plane, selectedLane, s.brightness, s.contrast, s.invertDisplay]);

  function removePeakFromLane(laneId: string, bandId: string) {
    const laneItem = allLanesAnalysis.find(a => a.lane.id === laneId);
    if (!laneItem) return;
    const currentBands = bandMap[laneId] || laneItem.metrics.map((m, i) => {
      const py = m.peakY ?? 0;
      return {
        id: m.bandId || `b-${Math.round(py)}-${i}`,
        y0: Math.max(0, py - 5),
        y1: py + 5,
        peakY: py,
      };
    });
    const updated = currentBands.filter(b => b.id !== bandId);
    setBandMap(prev => ({ ...prev, [laneId]: updated }));
    if (s.refBandId === bandId) {
      set({ refBandId: '' });
    }
  }

  // Canvas helper: get gel pixel coordinates from mouse event
  function getCanvasCoords(e: MouseEvent): { x: number; y: number } {
    const canvas = canvasRef.current;
    if (!canvas || !plane) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  }

  // Draw on Canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !plane) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = plane.width;
    canvas.height = plane.height;

    const imgData = ctx.createImageData(plane.width, plane.height);
    const data = imgData.data;
    const raw = plane.data;
    const b = s.brightness;
    const c = s.contrast;
    const inv = s.invertDisplay;

    for (let i = 0; i < raw.length; i++) {
      let val = raw[i]!;
      val = (val - 0.5) * c + 0.5;
      val = val * b;
      val = Math.max(0, Math.min(1, val));
      if (inv) val = 1 - val;
      const byteVal = Math.round(val * 255);
      const pIdx = i * 4;
      data[pIdx] = byteVal;
      data[pIdx + 1] = byteVal;
      data[pIdx + 2] = byteVal;
      data[pIdx + 3] = 255;
    }
    ctx.putImageData(imgData, 0, 0);

    // Draw Lanes
    lanes.forEach((l, idx) => {
      const isSelected = l.id === selectedLane?.id;
      const isLadder = l.id === s.ladderLaneId;
      const half = l.width / 2;

      ctx.save();
      // Lane box fill
      ctx.fillStyle = isSelected
        ? 'rgba(37, 99, 235, 0.18)'
        : isLadder
          ? 'rgba(234, 179, 8, 0.12)'
          : 'rgba(255, 255, 255, 0.05)';
      ctx.fillRect(l.x - half, l.y0, l.width, l.y1 - l.y0);

      // Lane boundaries
      ctx.strokeStyle = isSelected ? '#2563eb' : isLadder ? '#eab308' : 'rgba(148, 163, 184, 0.6)';
      ctx.lineWidth = isSelected ? 2 : 1;
      ctx.setLineDash(isSelected ? [] : [4, 4]);
      ctx.strokeRect(l.x - half, l.y0, l.width, l.y1 - l.y0);

      // Lane Center Guide Line
      ctx.strokeStyle = isSelected ? 'rgba(37, 99, 235, 0.4)' : 'rgba(148, 163, 184, 0.25)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(l.x, l.y0);
      ctx.lineTo(l.x, l.y1);
      ctx.stroke();

      // Lane Header Badge
      if (showLaneHeaders) {
        const customName = laneLabels[l.id];
        const labelText = customName ? `L${idx + 1}: ${customName}` : isLadder ? `L${idx + 1} (Ladder)` : `L${idx + 1}`;
        ctx.font = 'bold 11px sans-serif';
        const tw = ctx.measureText(labelText).width;
        ctx.fillStyle = isSelected ? '#2563eb' : isLadder ? '#d97706' : '#475569';
        ctx.fillRect(l.x - tw / 2 - 4, Math.max(2, l.y0 - 18), tw + 8, 16);
        ctx.fillStyle = '#ffffff';
        ctx.fillText(labelText, l.x - tw / 2, Math.max(14, l.y0 - 6));
      }

      // Bands for this lane
      const analysisItem = allLanesAnalysis.find(a => a.lane.id === l.id);
      const bList = analysisItem?.metrics || [];

      bList.forEach((band) => {
        if (band.peakY !== undefined) {
          ctx.strokeStyle = isSelected ? '#2563eb' : isLadder ? '#d97706' : '#94a3b8';
          ctx.lineWidth = isSelected ? 2 : 1.5;
          ctx.setLineDash([]);
          ctx.beginPath();
          ctx.moveTo(l.x - half, band.peakY);
          ctx.lineTo(l.x + half, band.peakY);
          ctx.stroke();

          // Band peak handle dot
          ctx.fillStyle = isSelected ? '#2563eb' : '#64748b';
          ctx.beginPath();
          ctx.arc(l.x, band.peakY, isSelected ? 3 : 2, 0, 2 * Math.PI);
          ctx.fill();

          // MW annotation text if calibrated
          if (showMwLabels && calibration) {
            const sz = band.sizeEst;
            if (sz !== null) {
              const text = formatSize(sz, activeLadder.kind);
              ctx.font = 'bold 10px sans-serif';
              ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
              const txtW = ctx.measureText(text).width;
              ctx.fillRect(l.x + half + 2, band.peakY - 7, txtW + 4, 14);
              ctx.fillStyle = '#ffffff';
              ctx.fillText(text, l.x + half + 4, band.peakY + 4);
            }
          }
        }
      });

      ctx.restore();
    });

    // Draw Crop Box Overlay if Cropping
    if (isCropping && cropBox) {
      ctx.save();
      // Dim outside area
      ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
      ctx.fillRect(0, 0, plane.width, cropBox.y);
      ctx.fillRect(0, cropBox.y + cropBox.h, plane.width, plane.height - (cropBox.y + cropBox.h));
      ctx.fillRect(0, cropBox.y, cropBox.x, cropBox.h);
      ctx.fillRect(cropBox.x + cropBox.w, cropBox.y, plane.width - (cropBox.x + cropBox.w), cropBox.h);

      // Crop rectangle border
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.strokeRect(cropBox.x, cropBox.y, cropBox.w, cropBox.h);

      // Corner handles
      ctx.fillStyle = '#38bdf8';
      const corners = [
        [cropBox.x, cropBox.y],
        [cropBox.x + cropBox.w, cropBox.y],
        [cropBox.x, cropBox.y + cropBox.h],
        [cropBox.x + cropBox.w, cropBox.y + cropBox.h],
      ];
      for (const [cx, cy] of corners) {
        ctx.fillRect(cx! - 4, cy! - 4, 8, 8);
      }
      ctx.restore();
    }
  }, [plane, lanes, selectedLane, allLanesAnalysis, s.brightness, s.contrast, s.invertDisplay, s.ladderLaneId, calibration, activeLadder, isCropping, cropBox, laneLabels, showMwLabels, showLaneHeaders, s.viewTab]);

  // Mouse Interaction: Grab to move lines, resize lanes, band addition/removal, crop drag
  function handleMouseDown(e: MouseEvent) {
    const coords = getCanvasCoords(e);
    hasDraggedRef.current = false;

    if (isCropping) {
      cropStartRef.current = coords;
      setCropBox({ x: coords.x, y: coords.y, w: 0, h: 0 });
      return;
    }

    // Check if mouse is on a lane border (resize) or lane center/body (move)
    for (const lane of lanes) {
      const half = lane.width / 2;
      const leftBorder = lane.x - half;
      const rightBorder = lane.x + half;
      const inY = coords.y >= Math.min(lane.y0, lane.y1) && coords.y <= Math.max(lane.y0, lane.y1);

      if (inY) {
        if (Math.abs(coords.x - leftBorder) <= 8) {
          setSelectedLaneId(lane.id);
          setDragState({ type: 'resize', laneId: lane.id, edge: 'left', startX: coords.x, origX: lane.x, origWidth: lane.width });
          return;
        }
        if (Math.abs(coords.x - rightBorder) <= 8) {
          setSelectedLaneId(lane.id);
          setDragState({ type: 'resize', laneId: lane.id, edge: 'right', startX: coords.x, origX: lane.x, origWidth: lane.width });
          return;
        }
        if (coords.x >= leftBorder && coords.x <= rightBorder) {
          setSelectedLaneId(lane.id);
          setDragState({ type: 'move', laneId: lane.id, startX: coords.x, origX: lane.x, origWidth: lane.width });
          return;
        }
      }
    }
  }

  function handleMouseMove(e: MouseEvent) {
    const coords = getCanvasCoords(e);

    // Cropping drag
    if (isCropping && cropStartRef.current && plane) {
      const x0 = Math.max(0, Math.min(cropStartRef.current.x, coords.x));
      const y0 = Math.max(0, Math.min(cropStartRef.current.y, coords.y));
      const w = Math.min(plane.width - x0, Math.abs(coords.x - cropStartRef.current.x));
      const h = Math.min(plane.height - y0, Math.abs(coords.y - cropStartRef.current.y));
      setCropBox({ x: Math.round(x0), y: Math.round(y0), w: Math.round(w), h: Math.round(h) });
      return;
    }

    // Lane dragging (move or resize)
    if (dragState && plane) {
      hasDraggedRef.current = true;
      const dx = coords.x - dragState.startX;

      if (dragState.type === 'move') {
        const lane = lanes.find(l => l.id === dragState.laneId);
        if (lane) {
          const half = lane.width / 2;
          const newX = Math.max(half, Math.min(plane.width - half, dragState.origX + dx));
          setLanes(prev => prev.map(l => l.id === dragState.laneId ? { ...l, x: Math.round(newX) } : l));
        }
      } else if (dragState.type === 'resize') {
        let newWidth = dragState.origWidth;
        if (dragState.edge === 'right') {
          newWidth = dragState.origWidth + dx * 2;
        } else {
          newWidth = dragState.origWidth - dx * 2;
        }
        newWidth = Math.max(12, Math.min(plane.width, newWidth));
        setLanes(prev => prev.map(l => l.id === dragState.laneId ? { ...l, width: Math.round(newWidth) } : l));
      }
      return;
    }

    // Hover cursor updates
    if (isCropping) {
      setCanvasCursor('crosshair');
      return;
    }

    let nextCursor = 'default';
    for (const lane of lanes) {
      const half = lane.width / 2;
      const inY = coords.y >= Math.min(lane.y0, lane.y1) && coords.y <= Math.max(lane.y0, lane.y1);
      if (inY) {
        if (Math.abs(coords.x - (lane.x - half)) <= 8 || Math.abs(coords.x - (lane.x + half)) <= 8) {
          nextCursor = 'ew-resize';
          break;
        }
        if (coords.x >= lane.x - half && coords.x <= lane.x + half) {
          nextCursor = 'grab';
          break;
        }
      }
    }
    setCanvasCursor(nextCursor);
  }

  function handleMouseUp(e: MouseEvent) {
    if (isCropping) {
      cropStartRef.current = null;
      return;
    }

    if (dragState) {
      setDragState(null);
      if (hasDraggedRef.current) {
        hasDraggedRef.current = false;
        return; // Don't trigger click action after drag
      }
    }

    // User clicked without dragging: Band Addition & Removal or Lane Selection
    handleCanvasClick(e);
  }

  // Click on canvas: Band addition by clicking and Ctrl+click to remove
  function handleCanvasClick(e: MouseEvent) {
    if (!plane || lanes.length === 0) return;
    const coords = getCanvasCoords(e);
    const clickX = coords.x;
    const clickY = coords.y;

    // Find clicked lane
    let clickedLane: Lane | null = null;
    for (const lane of lanes) {
      const half = lane.width / 2;
      if (clickX >= lane.x - half && clickX <= lane.x + half && clickY >= lane.y0 && clickY <= lane.y1) {
        clickedLane = lane;
        break;
      }
    }

    if (!clickedLane) {
      // Find closest lane horizontally
      let minD = Infinity;
      for (const lane of lanes) {
        const d = Math.abs(clickX - lane.x);
        if (d < minD) { minD = d; clickedLane = lane; }
      }
      if (clickedLane) setSelectedLaneId(clickedLane.id);
      return;
    }

    setSelectedLaneId(clickedLane.id);

    // Current bands for this lane
    const currentBands = bandMap[clickedLane.id] || (() => {
      const analysisItem = allLanesAnalysis.find(a => a.lane.id === clickedLane!.id);
      return analysisItem?.metrics.map(m => ({
        id: m.bandId,
        y0: (m.peakY ?? clickY) - 8,
        y1: (m.peakY ?? clickY) + 8,
        peakY: m.peakY ?? clickY,
      })) || [];
    })();

    // Check if clicked near an existing band peak
    const existingBandIdx = currentBands.findIndex(b => Math.abs((b.peakY ?? (b.y0 + b.y1) / 2) - clickY) <= 8);

    if (existingBandIdx !== -1) {
      const existingBand = currentBands[existingBandIdx]!;
      // Ctrl+click or Alt+click removes band
      if (e.ctrlKey || e.metaKey || e.altKey) {
        const updated = currentBands.filter((_, idx) => idx !== existingBandIdx);
        setBandMap(prev => ({ ...prev, [clickedLane!.id]: updated }));
      } else {
        // Normal click sets reference band
        set({ refBandId: existingBand.id });
      }
    } else {
      // Click on empty lane adds a new band at this position!
      const newBand: Band = {
        id: `band-${Date.now()}`,
        y0: Math.max(0, clickY - 8),
        y1: Math.min(plane.height, clickY + 8),
        peakY: Math.round(clickY),
      };
      const updated = [...currentBands, newBand].sort((a, b) => (a.peakY ?? 0) - (b.peakY ?? 0));
      setBandMap(prev => ({ ...prev, [clickedLane!.id]: updated }));
    }
  }

  // Export Annotated Gel Image
  function handleExportAnnotatedGel() {
    if (!plane) return;
    const exportCanvas = document.createElement('canvas');
    const headerHeight = 50;
    exportCanvas.width = plane.width;
    exportCanvas.height = plane.height + headerHeight;
    const ctx = exportCanvas.getContext('2d');
    if (!ctx) return;

    // Background banner
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, exportCanvas.width, headerHeight);

    // Title text
    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 16px sans-serif';
    ctx.fillText(gelTitle, 16, 26);
    ctx.fillStyle = '#94a3b8';
    ctx.font = '11px sans-serif';
    ctx.fillText(`${plane.width} × ${plane.height} px · Bio-Bench Annotated Gel Export`, 16, 42);

    // Draw gel image below header
    if (canvasRef.current) {
      ctx.drawImage(canvasRef.current, 0, headerHeight);
    }

    exportCanvas.toBlob((blob) => {
      if (blob) {
        downloadBlob(blob, `${imageName.replace(/\.[^/.]+$/, '')}_annotated.png`);
      }
    }, 'image/png');
  }

  // Lane Management
  function handleAddLane() {
    if (!plane) return;
    const lastLane = lanes[lanes.length - 1];
    const newX = lastLane ? Math.min(plane.width - 25, lastLane.x + 50) : 50;
    const newLane: Lane = {
      id: `lane-${Date.now()}`,
      x: newX,
      width: lastLane ? lastLane.width : 50,
      y0: 0,
      y1: plane.height,
      tilt: 0,
    };
    setLanes([...lanes, newLane]);
    setSelectedLaneId(newLane.id);
  }

  function handleAutoLanes() {
    if (!plane) return;
    const detected = autoLanes(plane, { x: 0, y: 0, w: plane.width, h: plane.height }, s.polarity);
    setLanes(detected);
    if (detected.length > 0) setSelectedLaneId(detected[0]!.id);
  }

  function handleEqualLanes() {
    if (!plane) return;
    const eq = equalLanes(numLanesInput, { x: 0, y: 0, w: plane.width, h: plane.height });
    setLanes(eq);
    if (eq.length > 0) setSelectedLaneId(eq[0]!.id);
  }

  function handleDeleteSelectedLane() {
    if (!selectedLane || lanes.length <= 1) return;
    const updated = lanes.filter(l => l.id !== selectedLane.id);
    setLanes(updated);
    if (updated.length > 0) setSelectedLaneId(updated[0]!.id);
  }

  function handleClearAllLanes() {
    setLanes([]);
    setSelectedLaneId('');
    setBandMap({});
    set({ ladderLaneId: '', refBandId: '' });
  }

  function updateSelectedLane(patch: Partial<Lane>) {
    if (!selectedLane) return;
    setLanes(lanes.map(l => l.id === selectedLane.id ? { ...l, ...patch } : l));
  }

  // Export CSV
  function handleExportCsv() {
    const unit = activeLadder.kind === 'protein' ? 'kDa' : 'bp';
    const rows = [
      ['Lane_Number', 'Lane_ID', 'Lane_Custom_Name', 'Band_Number', 'Migration_Y_px', 'Estimated_Size', 'Estimated_Mass_Formatted', 'Size_Unit', 'Raw_Area', 'Baseline_Area', 'Net_Intensity', 'Percent_Of_Lane', 'Ratio_To_Reference', 'Saturated'],
      ...allLanesAnalysis.flatMap(item =>
        item.metrics.map(m => {
          let label = laneLabels[item.lane.id] || `Lane ${item.laneIdx + 1}`;
          if (stripLanePrefix) {
            label = label.replace(/^(?:L\d+|Lane\s*\d+)[\s:\-_]*/i, '').trim() || label;
          }
          return [
            item.laneIdx + 1,
            stripLanePrefix ? item.lane.id.replace(/^l/i, '') : item.lane.id,
            label,
            m.number,
            m.peakY ? Number(m.peakY.toFixed(2)) : '',
            m.sizeEst ? Number(m.sizeEst.toFixed(1)) : '',
            m.sizeEst ? formatSize(m.sizeEst, activeLadder.kind) : '',
            unit,
            Number(m.raw.toFixed(1)),
            Number(m.background.toFixed(1)),
            Number(m.net.toFixed(1)),
            Number(m.share.toFixed(2)),
            Number(m.ratio.toFixed(2)),
            m.saturation >= SATURATION_WARN ? 'YES' : 'NO',
          ];
        })
      ),
    ];
    downloadText(toCsv(rows), `${imageName.replace(/\.[^/.]+$/, '')}_all_lanes_quantification.csv`, 'text/csv;charset=utf-8');
  }

  return (
    <ToolLayout
      icon="🧬"
      title="Gel & Blot Analysis"
      blurb="Densitometry, relative quantification, interactive line grabbing, orientation transforms, and molecular-weight calibration."
      wide={true}
      inputs={
        <div class="space-y-4">
          {/* Image Source Card */}
          <div class="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 space-y-3">
            <div class="flex items-center justify-between">
              <span class="text-xs font-semibold text-slate-500 uppercase tracking-wider">Image Source</span>
              <span class="text-xs text-slate-400 truncate max-w-[140px] mono">{imageName || 'None'}</span>
            </div>
            <div class="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                class="px-3 py-2 text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
              >
                Upload File / TIFF
              </button>
              <button
                type="button"
                onClick={loadDemo}
                class="px-3 py-2 text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
              >
                Load Demo Gel
              </button>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/tiff,image/bmp,.tif,.tiff"
              class="hidden"
              onChange={(e) => {
                const file = (e.target as HTMLInputElement).files?.[0];
                if (file) handleFileUpload(file);
              }}
            />

            <div>
              <label class="text-xs font-medium text-slate-500 block mb-1">Signal Polarity</label>
              <select
                value={s.polarity}
                onChange={(e) => set({ polarity: (e.target as HTMLSelectElement).value as Polarity })}
                class="w-full text-xs px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 dark:bg-slate-900"
              >
                <option value="dark">Dark bands on light (Coomassie, Silver, UV ethidium)</option>
                <option value="light">Light bands on dark (Chemiluminescence, Fluorescence)</option>
              </select>
            </div>
          </div>

          {/* Image Orientation, Crop & Deskew Card */}
          <div class="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 space-y-3">
            <div class="flex items-center justify-between">
              <span class="text-xs font-semibold text-slate-500 uppercase tracking-wider">Orientation & Crop</span>
              <button
                type="button"
                onClick={handleResetAllTransforms}
                class="text-[11px] text-slate-400 hover:text-accent-600 transition underline"
              >
                Reset Image
              </button>
            </div>

            {/* Quick Rotate & Flip buttons */}
            <div class="grid grid-cols-4 gap-1.5">
              <button
                type="button"
                onClick={() => applyRotation(-90)}
                class="p-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-center transition"
                title="Rotate 90° Counter-Clockwise"
              >
                ↺ -90°
              </button>
              <button
                type="button"
                onClick={() => applyRotation(90)}
                class="p-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-center transition"
                title="Rotate 90° Clockwise"
              >
                ↻ +90°
              </button>
              <button
                type="button"
                onClick={() => applyFlip(true)}
                class="p-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-center transition"
                title="Flip Horizontally (Mirror)"
              >
                ⇄ Flip H
              </button>
              <button
                type="button"
                onClick={() => applyFlip(false)}
                class="p-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-center transition"
                title="Flip Vertically"
              >
                ⇅ Flip V
              </button>
            </div>

            {/* Deskew Angle Slider */}
            <div>
              <div class="flex justify-between text-xs text-slate-500 mb-1">
                <span>Deskew / Straighten</span>
                <span class="mono font-semibold">{deskewAngle.toFixed(1)}°</span>
              </div>
              <div class="flex items-center gap-2">
                <input
                  type="range"
                  min="-30"
                  max="30"
                  step="0.5"
                  value={deskewAngle}
                  onInput={(e) => handleDeskewChange(parseFloat((e.target as HTMLInputElement).value))}
                  class="w-full accent-accent-600"
                />
                <button
                  type="button"
                  onClick={() => handleDeskewChange(0)}
                  class="text-[11px] px-1.5 py-0.5 rounded border border-slate-300 dark:border-slate-700 text-slate-500"
                >
                  0°
                </button>
              </div>
            </div>

            {/* Interactive Crop Button & Controls */}
            <div class="pt-1">
              {!isCropping ? (
                <button
                  type="button"
                  onClick={() => { setIsCropping(true); setCropBox(null); }}
                  class="w-full py-1.5 text-xs font-semibold rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-200 transition"
                >
                  ✂️ Select Crop Area
                </button>
              ) : (
                <div class="space-y-2 rounded-lg bg-sky-50 dark:bg-sky-950/40 p-2.5 border border-sky-200 dark:border-sky-800">
                  <span class="text-xs text-sky-800 dark:text-sky-200 block font-medium">
                    Drag a bounding box across the gel to crop:
                  </span>
                  {cropBox && cropBox.w > 0 && (
                    <span class="text-[11px] mono text-sky-600 dark:text-sky-300 block">
                      Box: {cropBox.w} × {cropBox.h} px
                    </span>
                  )}
                  <div class="flex gap-2">
                    <button
                      type="button"
                      onClick={handleApplyCrop}
                      disabled={!cropBox || cropBox.w < 10}
                      class="flex-1 py-1 text-xs font-semibold rounded-md bg-sky-600 text-white hover:bg-sky-700 disabled:opacity-50 transition"
                    >
                      Apply Crop
                    </button>
                    <button
                      type="button"
                      onClick={() => { setIsCropping(false); setCropBox(null); }}
                      class="py-1 px-2.5 text-xs font-medium rounded-md border border-slate-300 dark:border-slate-700"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Molecular Weight Calibration Presets */}
          <div class="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 space-y-3">
            <span class="text-xs font-semibold text-slate-500 uppercase tracking-wider block">
              Molecular Weight Calibration
            </span>
            <div>
              <label class="text-xs font-medium text-slate-500 block mb-1">Ladder Lane</label>
              <select
                value={s.ladderLaneId}
                onChange={(e) => set({ ladderLaneId: (e.target as HTMLSelectElement).value })}
                class="w-full text-xs px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 dark:bg-slate-900"
              >
                <option value="">Select standard ladder lane…</option>
                {lanes.map((l, i) => (
                  <option key={l.id} value={l.id}>
                    Lane {i + 1}{laneLabels[l.id] ? ` (${laneLabels[l.id]})` : ''}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label class="text-xs font-medium text-slate-500 block mb-1">Standard Ladder Preset</label>
              <select
                value={s.ladderId}
                onChange={(e) => set({ ladderId: (e.target as HTMLSelectElement).value })}
                class="w-full text-xs px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 dark:bg-slate-900"
              >
                <optgroup label="Built-in Standard Ladders">
                  {LADDERS.map(l => (
                    <option key={l.id} value={l.id}>{l.name} [{l.kind.toUpperCase()}]</option>
                  ))}
                </optgroup>
                {customLadders.length > 0 && (
                  <optgroup label="Custom Uploaded Ladders">
                    {customLadders.map(l => (
                      <option key={l.id} value={l.id}>⭐ {l.name} [{l.kind.toUpperCase()}]</option>
                    ))}
                  </optgroup>
                )}
              </select>

              <div class="flex items-center justify-between pt-1">
                <button
                  type="button"
                  onClick={() => setShowCustomLadderModal(prev => !prev)}
                  class="text-xs text-accent-600 dark:text-accent-400 hover:underline font-medium flex items-center gap-1"
                >
                  {showCustomLadderModal ? '▲ Close Custom Ladder' : '➕ Upload / Custom Ladder…'}
                </button>
                {s.ladderId.startsWith('custom-') && (
                  <button
                    type="button"
                    onClick={() => handleDeleteCustomLadder(s.ladderId)}
                    class="text-[11px] text-rose-600 hover:underline font-medium"
                    title="Delete this custom ladder"
                  >
                    🗑️ Delete Custom Ladder
                  </button>
                )}
              </div>

              {showCustomLadderModal && (
                <div class="mt-2 rounded-xl border border-accent-200 bg-accent-50/50 p-3 dark:border-accent-900/60 dark:bg-accent-950/20 space-y-2 text-xs">
                  <span class="font-bold text-slate-800 dark:text-slate-200 block">Create / Upload Custom Ladder</span>
                  <div>
                    <label class="block text-[11px] text-slate-500 mb-0.5">Ladder Name</label>
                    <input
                      type="text"
                      placeholder="e.g. Lab Custom Protein Standard"
                      value={customLadderName}
                      onInput={(e) => setCustomLadderName((e.target as HTMLInputElement).value)}
                      class="w-full px-2 py-1 rounded border border-slate-300 dark:border-slate-700 dark:bg-slate-900"
                    />
                  </div>
                  <div class="flex gap-4 pt-0.5">
                    <label class="flex items-center gap-1 cursor-pointer">
                      <input
                        type="radio"
                        name="customKind"
                        checked={customLadderKind === 'protein'}
                        onChange={() => setCustomLadderKind('protein')}
                      />
                      <span>Protein (kDa)</span>
                    </label>
                    <label class="flex items-center gap-1 cursor-pointer">
                      <input
                        type="radio"
                        name="customKind"
                        checked={customLadderKind === 'dna'}
                        onChange={() => setCustomLadderKind('dna')}
                      />
                      <span>DNA (bp)</span>
                    </label>
                  </div>
                  <div>
                    <div class="flex justify-between items-center mb-0.5">
                      <label class="block text-[11px] text-slate-500">Band Sizes (descending)</label>
                      <button
                        type="button"
                        onClick={() => customLadderFileRef.current?.click()}
                        class="text-[10px] text-accent-600 hover:underline font-semibold"
                      >
                        📁 Import JSON/CSV
                      </button>
                      <input
                        ref={customLadderFileRef}
                        type="file"
                        accept=".json,.csv,.txt"
                        class="hidden"
                        onChange={(e) => {
                          const f = (e.target as HTMLInputElement).files?.[0];
                          if (f) handleCustomLadderFileUpload(f);
                        }}
                      />
                    </div>
                    <textarea
                      rows={2}
                      placeholder={customLadderKind === 'protein' ? '250, 150, 100, 75, 50, 37, 25, 15, 10' : '10000, 8000, 6000, 5000, 4000, 3000, 2000, 1000, 500'}
                      value={customLadderSizesStr}
                      onInput={(e) => setCustomLadderSizesStr((e.target as HTMLTextAreaElement).value)}
                      class="w-full px-2 py-1 rounded border border-slate-300 dark:border-slate-700 dark:bg-slate-900 font-mono text-[11px]"
                    />
                  </div>
                  {customLadderError && (
                    <p class="text-[11px] text-rose-600 font-medium">{customLadderError}</p>
                  )}
                  <div class="flex gap-2 pt-1">
                    <button
                      type="button"
                      onClick={handleSaveCustomLadder}
                      class="flex-1 py-1 rounded bg-accent-600 text-white font-semibold hover:bg-accent-700 transition"
                    >
                      Save & Use Ladder
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowCustomLadderModal(false)}
                      class="px-2.5 py-1 rounded border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div>
              <label class="text-xs font-medium text-slate-500 block mb-1">Fitting Model</label>
              <select
                value={s.calibMethod}
                onChange={(e) => set({ calibMethod: (e.target as HTMLSelectElement).value as 'linear' | 'piecewise' | 'spline' })}
                class="w-full text-xs px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 dark:bg-slate-900"
              >
                <option value="piecewise">Piecewise Linear (Recommended)</option>
                <option value="linear">Global Linear Semi-Log</option>
                <option value="spline">Monotone Cubic Spline</option>
              </select>
            </div>

            {calibration && (
              <div class="rounded-lg bg-emerald-50 p-2 text-xs text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                ✓ Calibrated ({calibration.points.length} ladder bands matched).
              </div>
            )}
          </div>

          {/* Densitometry & Background Parameters */}
          <div class="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 space-y-3">
            <span class="text-xs font-semibold text-slate-500 uppercase tracking-wider block">
              Densitometry & Background
            </span>
            <div>
              <label class="text-xs font-medium text-slate-500 block mb-1">Baseline Method</label>
              <select
                value={s.bgMethod}
                onChange={(e) => set({ bgMethod: (e.target as HTMLSelectElement).value as 'shared' | 'rolling' | 'valley' | 'none' })}
                class="w-full text-xs px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 dark:bg-slate-900"
              >
                <option value="shared">Shared Cross-Lane Baseline (Recommended for Multi-Lane Comparison)</option>
                <option value="rolling">Rolling Ball (Per-Lane)</option>
                <option value="valley">Valley-to-Valley (Per-Lane)</option>
                <option value="none">None (No Subtraction)</option>
              </select>
            </div>

            {s.bgMethod === 'shared' && (
              <p class="text-[11px] text-slate-500 bg-slate-50 dark:bg-slate-800/60 p-2 rounded-lg leading-relaxed">
                💡 <strong>Shared Baseline</strong> applies uniform background subtraction across all lanes, eliminating individual baseline distortion for accurate quantitative Western blots and lane comparisons.
              </p>
            )}

            {(s.bgMethod === 'rolling' || s.bgMethod === 'shared') && (
              <div>
                <div class="flex justify-between text-xs text-slate-500 mb-1">
                  <span>Smoothing Radius</span>
                  <span>{s.rollingRadius} px</span>
                </div>
                <input
                  type="range"
                  min="5"
                  max="100"
                  step="5"
                  value={s.rollingRadius}
                  onInput={(e) => set({ rollingRadius: parseInt((e.target as HTMLInputElement).value) })}
                  class="w-full accent-accent-600"
                />
              </div>
            )}

            <div>
              <div class="flex justify-between text-xs text-slate-500 mb-1">
                <span>Band Sensitivity</span>
                <span>{(s.prominence * 100).toFixed(0)}%</span>
              </div>
              <input
                type="range"
                min="0.01"
                max="0.30"
                step="0.01"
                value={s.prominence}
                onInput={(e) => set({ prominence: parseFloat((e.target as HTMLInputElement).value) })}
                class="w-full accent-accent-600"
              />
            </div>
          </div>

          {/* Annotations & Titles Card */}
          <div class="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 space-y-3">
            <span class="text-xs font-semibold text-slate-500 uppercase tracking-wider block">
              Gel Annotations
            </span>
            <div>
              <label class="text-xs font-medium text-slate-500 block mb-1">Gel Export Title</label>
              <input
                type="text"
                value={gelTitle}
                onInput={(e) => setGelTitle((e.target as HTMLInputElement).value)}
                class="w-full text-xs px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 dark:bg-slate-900"
                placeholder="e.g. SDS-PAGE 12% Tris-Glycine"
              />
            </div>
          </div>

          {/* Display Adjustments */}
          <details class="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 space-y-2">
            <summary class="cursor-pointer font-semibold text-xs uppercase tracking-wider text-slate-500">
              Display Adjustments
            </summary>
            <div class="pt-2 space-y-2">
              <div>
                <div class="flex justify-between text-xs text-slate-500 mb-1">
                  <span>Brightness: {s.brightness.toFixed(2)}×</span>
                </div>
                <input
                  type="range"
                  min="0.2"
                  max="3"
                  step="0.05"
                  value={s.brightness}
                  onInput={(e) => set({ brightness: parseFloat((e.target as HTMLInputElement).value) })}
                  class="w-full"
                />
              </div>
              <div>
                <div class="flex justify-between text-xs text-slate-500 mb-1">
                  <span>Contrast: {s.contrast.toFixed(2)}×</span>
                </div>
                <input
                  type="range"
                  min="0.2"
                  max="3"
                  step="0.05"
                  value={s.contrast}
                  onInput={(e) => set({ contrast: parseFloat((e.target as HTMLInputElement).value) })}
                  class="w-full"
                />
              </div>
              <label class="flex items-center gap-2 text-xs font-medium text-slate-700 dark:text-slate-300 cursor-pointer pt-1">
                <input
                  type="checkbox"
                  checked={s.invertDisplay}
                  onChange={(e) => set({ invertDisplay: (e.target as HTMLInputElement).checked })}
                  class="rounded border-slate-300"
                />
                Invert Display (Black/White)
              </label>
            </div>
          </details>
        </div>
      }
      results={
        <div class="space-y-4">
          {/* Quick Lanes Toolbar & Navigation */}
          <div class="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 space-y-3">
            <div class="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3 dark:border-slate-800">
              <div class="flex items-center gap-1.5 flex-wrap">
                <span class="text-xs font-semibold text-slate-500 uppercase tracking-wider mr-1">Lanes:</span>
                {lanes.map((l, i) => {
                  const isSel = l.id === selectedLane?.id;
                  const isLadder = l.id === s.ladderLaneId;
                  const customName = laneLabels[l.id];
                  return (
                    <button
                      key={l.id}
                      type="button"
                      onClick={() => setSelectedLaneId(l.id)}
                      class={`px-2.5 py-1 text-xs font-semibold rounded-lg transition ${
                        isSel
                          ? 'bg-accent-600 text-white shadow-xs'
                          : isLadder
                            ? 'bg-amber-100 text-amber-900 hover:bg-amber-200 dark:bg-amber-950 dark:text-amber-200'
                            : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'
                      }`}
                    >
                      {customName ? `L${i + 1}: ${customName}` : `L${i + 1}`}{isLadder ? ' 🏷️' : ''}
                    </button>
                  );
                })}
              </div>

              <div class="flex items-center gap-1.5 flex-wrap">
                <button
                  type="button"
                  onClick={handleAddLane}
                  class="px-2.5 py-1 text-xs font-medium bg-slate-100 hover:bg-slate-200 rounded-lg dark:bg-slate-800 dark:hover:bg-slate-700 transition"
                  title="Add another lane"
                >
                  + Add Lane
                </button>
                <button
                  type="button"
                  onClick={handleAutoLanes}
                  class="px-2.5 py-1 text-xs font-medium bg-slate-100 hover:bg-slate-200 rounded-lg dark:bg-slate-800 dark:hover:bg-slate-700 transition"
                >
                  Auto-Find Lanes
                </button>
                <div class="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={handleEqualLanes}
                    class="px-2.5 py-1 text-xs font-medium bg-slate-100 hover:bg-slate-200 rounded-lg dark:bg-slate-800 dark:hover:bg-slate-700 transition"
                  >
                    Equal Lanes
                  </button>
                  <input
                    type="number"
                    min="1"
                    max="50"
                    value={numLanesInput}
                    onInput={(e) => setNumLanesInput(Math.max(1, parseInt((e.target as HTMLInputElement).value) || 1))}
                    class="w-12 px-1.5 py-1 text-xs rounded-lg border border-slate-300 dark:border-slate-700 dark:bg-slate-900 mono"
                    title="Number of equal lanes"
                  />
                </div>
                {selectedLane && (
                  <button
                    type="button"
                    onClick={handleDeleteSelectedLane}
                    class="px-2 py-1 text-xs text-red-600 hover:bg-red-50 rounded-lg dark:hover:bg-red-950/40 transition"
                    title="Delete current lane"
                  >
                    Delete L{selectedLaneIdx + 1}
                  </button>
                )}
                {lanes.length > 0 && (
                  <button
                    type="button"
                    onClick={handleClearAllLanes}
                    class="px-2 py-1 text-xs text-rose-600 hover:bg-rose-50 rounded-lg dark:hover:bg-rose-950/40 transition font-medium"
                    title="Clear all lanes from image"
                  >
                    🗑️ Clear All Lanes
                  </button>
                )}
              </div>
            </div>

            {/* Selected Lane Custom Label & Sliders */}
            {selectedLane && (
              <div class="grid gap-3 sm:grid-cols-3 text-xs bg-slate-50 p-2.5 rounded-xl dark:bg-slate-800/50 items-center">
                <div class="flex items-center gap-2">
                  <span class="text-slate-500 shrink-0 font-medium">L{selectedLaneIdx + 1} Label:</span>
                  <input
                    type="text"
                    placeholder="e.g. Wild-Type 0h"
                    value={laneLabels[selectedLane.id] || ''}
                    onInput={(e) => {
                      const val = (e.target as HTMLInputElement).value;
                      setLaneLabels(prev => ({ ...prev, [selectedLane.id]: val }));
                    }}
                    class="w-full px-2 py-1 rounded-md border border-slate-300 dark:border-slate-700 dark:bg-slate-900 text-xs"
                  />
                </div>
                <div class="flex items-center gap-2">
                  <span class="text-slate-500 shrink-0 font-medium">Center X:</span>
                  <input
                    type="range"
                    min="10"
                    max={plane ? plane.width - 10 : 400}
                    value={selectedLane.x}
                    onInput={(e) => updateSelectedLane({ x: parseInt((e.target as HTMLInputElement).value) })}
                    class="w-full accent-accent-600"
                  />
                  <span class="mono font-semibold w-10 text-right">{Math.round(selectedLane.x)}</span>
                </div>
                <div class="flex items-center gap-2">
                  <span class="text-slate-500 shrink-0 font-medium">Width:</span>
                  <input
                    type="range"
                    min="10"
                    max="150"
                    value={selectedLane.width}
                    onInput={(e) => updateSelectedLane({ width: parseInt((e.target as HTMLInputElement).value) })}
                    class="w-full accent-accent-600"
                  />
                  <span class="mono font-semibold w-10 text-right">{selectedLane.width}</span>
                </div>
              </div>
            )}
          </div>

          {/* Workflow Tabs: Gel Image & Profile, MW Calibration Curve, Band Quantification */}
          <div class="flex items-center justify-between border-b border-slate-200 dark:border-slate-700 pb-2">
            <div class="flex gap-2">
              <button
                type="button"
                onClick={() => set({ viewTab: 'gel' })}
                class={`px-3 py-1.5 text-xs font-semibold rounded-lg transition ${
                  s.viewTab === 'gel'
                    ? 'bg-accent-600 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'
                }`}
              >
                🖼️ Gel Image & Lane Profile
              </button>
              <button
                type="button"
                onClick={() => set({ viewTab: 'calib' })}
                class={`px-3 py-1.5 text-xs font-semibold rounded-lg transition ${
                  s.viewTab === 'calib'
                    ? 'bg-accent-600 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'
                }`}
              >
                📈 MW Calibration Curve
              </button>
              <button
                type="button"
                onClick={() => set({ viewTab: 'quant' })}
                class={`px-3 py-1.5 text-xs font-semibold rounded-lg transition ${
                  s.viewTab === 'quant'
                    ? 'bg-accent-600 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'
                }`}
              >
                📊 Band Quantification & Amounts
              </button>
            </div>

            {/* Quick Export Annotated Gel Button */}
            <button
              type="button"
              onClick={handleExportAnnotatedGel}
              class="px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-900 text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white transition flex items-center gap-1.5"
            >
              📥 Export Annotated Gel (PNG)
            </button>
          </div>

          {/* TAB 1: Gel Image & Interactive Lane Profile */}
          <div class={s.viewTab === 'gel' ? (gelLayout === 'stacked' ? 'space-y-4' : 'grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]') : 'hidden'}>
              {/* Gel Canvas Card */}
              <div class="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 space-y-2">
                <div class="flex items-center justify-between flex-wrap gap-2">
                  <div class="flex items-center gap-2">
                    <h3 class="font-bold text-sm text-slate-900 dark:text-slate-100">Gel Image & Annotations</h3>
                    <span class="text-xs text-slate-400 mono">
                      {plane ? `${plane.width} × ${plane.height} px` : ''}
                    </span>
                  </div>
                  <div class="flex items-center gap-2.5 text-xs text-slate-500 flex-wrap">
                    {/* Layout switcher */}
                    <div class="flex rounded-lg border border-slate-200 dark:border-slate-700 p-0.5 text-[11px]">
                      <button
                        type="button"
                        onClick={() => setGelLayout('split')}
                        class={`px-2 py-0.5 rounded font-medium transition ${
                          gelLayout === 'split' ? 'bg-accent-600 text-white' : 'text-slate-600 hover:text-slate-900 dark:text-slate-400'
                        }`}
                        title="Side-by-side view with lane profile"
                      >
                        🪟 Side-by-Side
                      </button>
                      <button
                        type="button"
                        onClick={() => setGelLayout('stacked')}
                        class={`px-2 py-0.5 rounded font-medium transition ${
                          gelLayout === 'stacked' ? 'bg-accent-600 text-white' : 'text-slate-600 hover:text-slate-900 dark:text-slate-400'
                        }`}
                        title="Full width large image view"
                      >
                        📄 Large Image (Stacked)
                      </button>
                    </div>

                    {/* Zoom selector */}
                    <div class="flex items-center gap-1 text-[11px]">
                      <span class="text-slate-400">Zoom:</span>
                      {[100, 125, 150].map(z => (
                        <button
                          key={z}
                          type="button"
                          onClick={() => setCanvasZoom(z)}
                          class={`px-1.5 py-0.5 rounded border text-[10px] ${
                            canvasZoom === z
                              ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 border-slate-900'
                              : 'border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800'
                          }`}
                        >
                          {z}%
                        </button>
                      ))}
                    </div>

                    <label class="flex items-center gap-1 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={showLaneHeaders}
                        onChange={(e) => setShowLaneHeaders((e.target as HTMLInputElement).checked)}
                        class="rounded"
                      />
                      Headers
                    </label>
                    <label class="flex items-center gap-1 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={showMwLabels}
                        onChange={(e) => setShowMwLabels((e.target as HTMLInputElement).checked)}
                        class="rounded"
                      />
                      MW Tags
                    </label>
                  </div>
                </div>

                {/* Gesture hint banner */}
                <div class="rounded-lg bg-slate-50 dark:bg-slate-800/60 px-3 py-1.5 text-[11px] text-slate-500 flex flex-wrap items-center justify-between gap-2">
                  <span>💡 <strong>Grab lane lines</strong> to move or resize width. <strong>Click</strong> in lane to add band line; <strong>Ctrl+Click</strong> on band to remove it.</span>
                  {selectedLane && (
                    <span class="text-accent-600 dark:text-accent-400 font-semibold">Active: L{selectedLaneIdx + 1}</span>
                  )}
                </div>

                <div class="overflow-auto max-h-[850px] border border-slate-200 rounded-xl dark:border-slate-800 flex justify-center bg-slate-950/5 p-2">
                  <canvas
                    ref={canvasRef}
                    onMouseDown={handleMouseDown}
                    onMouseMove={handleMouseMove}
                    onMouseUp={handleMouseUp}
                    style={{
                      cursor: canvasCursor,
                      width: canvasZoom !== 100 ? `${canvasZoom}%` : undefined,
                      maxWidth: canvasZoom > 100 ? `${canvasZoom}%` : '100%',
                    }}
                    class="h-auto block select-none rounded shadow-2xs"
                    title="Click or drag lanes. Click to add band, Ctrl+click to remove."
                  />
                </div>
              </div>

              {/* Densitometry Profile Card for Active Lane */}
              <div class="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 space-y-3">
                <div class="flex items-center justify-between border-b border-slate-100 pb-2 dark:border-slate-800">
                  <div>
                    <h3 class="font-bold text-sm text-slate-900 dark:text-slate-100">
                      Densitometry Profile — Lane {selectedLaneIdx + 1}
                    </h3>
                    <p class="text-xs text-slate-500">
                      Migration distance $Y$ (top → bottom) vs band optical density & physical lane strip
                    </p>
                  </div>
                  <div class="flex items-center gap-3 text-xs">
                    <span class="flex items-center gap-1.5 font-medium text-accent-600">
                      <span class="w-3 h-0.5 bg-accent-600 rounded"></span> Signal
                    </span>
                    <span class="flex items-center gap-1.5 font-medium text-amber-500">
                      <span class="w-3 h-0.5 bg-amber-500 rounded border-t border-dashed"></span> Baseline
                    </span>
                  </div>
                </div>

                {laneAnalysis && laneAnalysis.profile.length > 0 ? (
                  <div class="space-y-3">
                    <svg viewBox="0 0 500 305" class="w-full h-auto rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 select-none">
                      {/* Grid Lines */}
                      <line x1="40" y1="20" x2="40" y2="180" stroke="#94a3b8" stroke-width="1" stroke-opacity="0.3" />
                      <line x1="40" y1="180" x2="480" y2="180" stroke="#94a3b8" stroke-width="1" stroke-opacity="0.3" />

                      {/* Signal Curve */}
                      <path
                        d={laneAnalysis.profile.reduce((acc, val, i) => {
                          const x = 40 + (i / laneAnalysis.profile.length) * 440;
                          const y = 180 - Math.min(1, Math.max(0, val)) * 155;
                          return i === 0 ? `M ${x} ${y}` : `${acc} L ${x} ${y}`;
                        }, '')}
                        fill="none"
                        stroke="#2563eb"
                        stroke-width="1.8"
                      />

                      {/* Baseline Curve */}
                      <path
                        d={laneAnalysis.baseline.reduce((acc, val, i) => {
                          const x = 40 + (i / laneAnalysis.baseline.length) * 440;
                          const y = 180 - Math.min(1, Math.max(0, val)) * 155;
                          return i === 0 ? `M ${x} ${y}` : `${acc} L ${x} ${y}`;
                        }, '')}
                        fill="none"
                        stroke="#f59e0b"
                        stroke-dasharray="3 3"
                        stroke-width="1.5"
                      />

                      {/* Physical Lane Strip Section */}
                      <text x="40" y="197" font-size="8.5" font-weight="bold" fill="#64748b" letter-spacing="0.4">
                        PHYSICAL LANE STRIP (GEL BANDS UNDER PROFILE)
                      </text>

                      {laneStripDataUrl && (
                        <image
                          x="40"
                          y="203"
                          width="440"
                          height="38"
                          href={laneStripDataUrl}
                          preserveAspectRatio="none"
                        />
                      )}
                      <rect
                        x="40"
                        y="203"
                        width="440"
                        height="38"
                        fill="none"
                        stroke="#94a3b8"
                        stroke-width="1"
                        stroke-opacity="0.5"
                        rx="2"
                      />

                      {/* Peak Markers, Vertical Alignment Guides, and Tags */}
                      {laneAnalysis.metrics.map((m) => {
                        if (m.peakY === undefined) return null;
                        const frac = m.peakY / (laneAnalysis.lane.y1 - laneAnalysis.lane.y0 || 1);
                        const px = 40 + frac * 440;
                        const val = laneAnalysis.profile[Math.min(laneAnalysis.profile.length - 1, Math.round(frac * laneAnalysis.profile.length))] ?? 0;
                        const py = 180 - Math.min(1, Math.max(0, val)) * 155;
                        const isRef = m.bandId === s.refBandId;

                        return (
                          <g
                            key={m.bandId}
                            class="cursor-pointer"
                            onClick={(e) => {
                              if (e.ctrlKey || e.metaKey) {
                                if (selectedLane) removePeakFromLane(selectedLane.id, m.bandId);
                              } else {
                                set({ refBandId: m.bandId });
                              }
                            }}
                          >
                            {/* Vertical alignment line through curve and lane strip */}
                            <line
                              x1={px}
                              y1={py}
                              x2={px}
                              y2="241"
                              stroke={isRef ? '#10b981' : '#ef4444'}
                              stroke-width="1.2"
                              stroke-dasharray="2 2"
                              stroke-opacity="0.85"
                            />

                            {/* Physical lane strip highlight bar */}
                            <rect
                              x={px - 2}
                              y="203"
                              width="4"
                              height="38"
                              fill={isRef ? '#10b981' : '#ef4444'}
                              fill-opacity="0.3"
                              stroke={isRef ? '#10b981' : '#ef4444'}
                              stroke-width="1"
                            />

                            {/* Dot on curve */}
                            <circle cx={px} cy={py} r={isRef ? 5 : 4} fill={isRef ? '#10b981' : '#ef4444'} stroke="#ffffff" stroke-width="1.5" />

                            {/* Number above curve */}
                            <text x={px} y={py - 6} font-size="9" text-anchor="middle" fill="#64748b" font-weight="bold">
                              #{m.number}
                            </text>

                            {/* Tag below lane strip */}
                            <text x={px} y="254" font-size="8.5" text-anchor="middle" fill="#334155" class="dark:fill-slate-200" font-weight="bold">
                              #{m.number}
                            </text>
                            <text x={px} y="265" font-size="7.5" text-anchor="middle" fill="#0284c7" class="dark:fill-sky-400" font-weight="bold">
                              {m.sizeEst ? formatSize(m.sizeEst, activeLadder.kind) : ''}
                            </text>
                          </g>
                        );
                      })}

                      {/* Direction labels */}
                      <text x="40" y="288" font-size="9" font-weight="bold" fill="#64748b">
                        ⮜ Top / Well (y₀)
                      </text>
                      <text x="480" y="288" font-size="9" font-weight="bold" fill="#64748b" text-anchor="end">
                        Bottom / Front (y₁) ⮞
                      </text>
                    </svg>

                    {/* Detected Peaks Table with Remove Option */}
                    <div class="space-y-2 pt-2">
                      <div class="flex items-center justify-between">
                        <span class="text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider block">
                          Detected Peaks in Lane {selectedLaneIdx + 1} ({laneAnalysis.metrics.length})
                        </span>
                        {laneAnalysis.metrics.length > 0 && (
                          <button
                            type="button"
                            onClick={() => {
                              if (!selectedLane) return;
                              setBandMap(prev => ({ ...prev, [selectedLane.id]: [] }));
                              if (s.refBandId) set({ refBandId: '' });
                            }}
                            class="text-[11px] text-rose-600 hover:underline font-medium"
                            title="Remove all peaks in this lane"
                          >
                            Clear All Peaks in Lane
                          </button>
                        )}
                      </div>

                      {laneAnalysis.metrics.length > 0 ? (
                        <div class="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
                          <table class="w-full text-xs text-left">
                            <thead class="bg-slate-50 dark:bg-slate-800/60 text-slate-500 uppercase tracking-wider text-[10px]">
                              <tr>
                                <th class="px-3 py-2 font-semibold">Peak #</th>
                                <th class="px-3 py-2 font-semibold">Position (Y)</th>
                                <th class="px-3 py-2 font-semibold">Est. Mass / Size</th>
                                <th class="px-3 py-2 font-semibold text-right">Peak OD</th>
                                <th class="px-3 py-2 font-semibold text-right">Net Signal</th>
                                <th class="px-3 py-2 font-semibold text-right">Lane Share</th>
                                <th class="px-3 py-2 font-semibold text-center">Ref</th>
                                <th class="px-3 py-2 font-semibold text-center">Action</th>
                              </tr>
                            </thead>
                            <tbody class="divide-y divide-slate-100 dark:divide-slate-800 bg-white dark:bg-slate-900">
                              {laneAnalysis.metrics.map(m => {
                                const isRef = m.bandId === s.refBandId;
                                const peakIdx = Math.min(laneAnalysis.profile.length - 1, Math.round(m.peakY ?? 0));
                                const peakVal = laneAnalysis.profile[peakIdx] ?? 0;
                                return (
                                  <tr
                                    key={m.bandId}
                                    class={`hover:bg-slate-50 dark:hover:bg-slate-800/40 transition ${
                                      isRef ? 'bg-emerald-50/60 dark:bg-emerald-950/25' : ''
                                    }`}
                                  >
                                    <td class="px-3 py-2 font-bold">
                                      <span class="inline-flex items-center justify-center w-5 h-5 rounded-full bg-slate-100 dark:bg-slate-800 text-[11px]">
                                        {m.number}
                                      </span>
                                    </td>
                                    <td class="px-3 py-2 mono text-slate-600 dark:text-slate-400">
                                      {m.peakY !== undefined ? `${m.peakY.toFixed(1)} px` : '-'}
                                    </td>
                                    <td class="px-3 py-2 font-bold text-accent-600 dark:text-accent-400">
                                      {m.sizeEst ? (
                                        formatSize(m.sizeEst, activeLadder.kind)
                                      ) : (
                                        <span class="text-slate-400 font-normal">Uncalibrated</span>
                                      )}
                                    </td>
                                    <td class="px-3 py-2 mono text-right text-slate-600 dark:text-slate-400">
                                      {peakVal.toFixed(3)}
                                    </td>
                                    <td class="px-3 py-2 mono text-right font-semibold text-slate-900 dark:text-slate-100">
                                      {m.net.toFixed(1)}
                                    </td>
                                    <td class="px-3 py-2 mono text-right font-medium text-slate-700 dark:text-slate-300">
                                      {m.share.toFixed(1)}%
                                    </td>
                                    <td class="px-3 py-2 text-center">
                                      <button
                                        type="button"
                                        onClick={() => set({ refBandId: isRef ? '' : m.bandId })}
                                        class={`px-2 py-0.5 rounded text-[10px] font-semibold transition ${
                                          isRef
                                            ? 'bg-emerald-600 text-white shadow-2xs'
                                            : 'bg-slate-100 hover:bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                                        }`}
                                        title={isRef ? 'Active Reference Band' : 'Set as Reference Band'}
                                      >
                                        {isRef ? '✓ Ref' : 'Set'}
                                      </button>
                                    </td>
                                    <td class="px-3 py-2 text-center">
                                      <button
                                        type="button"
                                        onClick={() => {
                                          if (selectedLane) removePeakFromLane(selectedLane.id, m.bandId);
                                        }}
                                        class="px-2 py-1 rounded text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-xs font-semibold transition inline-flex items-center gap-1"
                                        title="Remove peak from lane"
                                      >
                                        ✕ Remove
                                      </button>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <p class="text-xs text-slate-400 italic py-2">No bands detected in this lane. Click on the gel image or lane strip to add bands.</p>
                      )}
                    </div>
                  </div>
                ) : (
                  <p class="text-xs text-slate-400 py-8 text-center">No densitometry profile data available for this lane.</p>
                )}
              </div>
            </div>

          {/* TAB 2: Molecular Weight Calibration Curve Plot */}
          {s.viewTab === 'calib' && (
            <div class="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 space-y-4">
              <div class="flex flex-wrap items-baseline justify-between gap-2 border-b border-slate-100 pb-3 dark:border-slate-800">
                <div>
                  <h3 class="font-bold text-base text-slate-900 dark:text-slate-100">
                    Molecular Weight Calibration Curve
                  </h3>
                  <p class="text-xs text-slate-500">
                    Semi-log regression: Migration distance $Y$ (pixels) vs Log₁₀(Molecular Weight / Size)
                  </p>
                </div>
                {calibration && (
                  <div class="flex items-center gap-3 text-xs">
                    <span class="font-medium text-slate-500">Model: <strong class="text-slate-800 dark:text-slate-200">{s.calibMethod}</strong></span>
                    {calibration.r2 !== undefined && (
                      <span class="font-medium text-slate-500">R²: <strong class="text-emerald-600 dark:text-emerald-400">{calibration.r2.toFixed(4)}</strong></span>
                    )}
                  </div>
                )}
              </div>

              {calibration && calibration.points.length >= 2 ? (
                <div class="space-y-4">
                  <svg viewBox="0 0 600 320" class="w-full h-auto rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                    {/* Axes */}
                    <line x1="60" y1="20" x2="60" y2="270" stroke="#94a3b8" stroke-width="1.5" />
                    <line x1="60" y1="270" x2="570" y2="270" stroke="#94a3b8" stroke-width="1.5" />

                    {/* Axis Labels */}
                    <text x="315" y="305" font-size="11" text-anchor="middle" fill="#64748b" font-weight="600">
                      Migration Distance Y along Lane (px)
                    </text>
                    <text transform="rotate(-90 20 145)" x="20" y="145" font-size="11" text-anchor="middle" fill="#64748b" font-weight="600">
                      Log₁₀(Size / MW)
                    </text>

                    {/* Compute min/max for scale */}
                    {(() => {
                      const pts = calibration.points;
                      const minY = Math.min(...pts.map(p => p.y));
                      const maxY = Math.max(...pts.map(p => p.y));
                      const rangeY = Math.max(20, maxY - minY);

                      const minLog = Math.min(...pts.map(p => Math.log10(p.size)));
                      const maxLog = Math.max(...pts.map(p => Math.log10(p.size)));
                      const rangeLog = Math.max(0.5, maxLog - minLog);

                      // Curve points
                      const curveSteps = 50;
                      const curvePts: [number, number][] = [];
                      for (let step = 0; step <= curveSteps; step++) {
                        const yVal = minY + (step / curveSteps) * rangeY;
                        const sz = calibration.sizeAt(yVal);
                        if (sz > 0) {
                          const xSvg = 60 + ((yVal - minY) / rangeY) * 500;
                          const ySvg = 270 - ((Math.log10(sz) - minLog) / rangeLog) * 240;
                          curvePts.push([xSvg, ySvg]);
                        }
                      }

                      return (
                        <>
                          {/* Regression Fitted Curve */}
                          {curvePts.length > 1 && (
                            <path
                              d={curvePts.reduce((acc, [cx, cy], i) => i === 0 ? `M ${cx} ${cy}` : `${acc} L ${cx} ${cy}`, '')}
                              fill="none"
                              stroke="#2563eb"
                              stroke-width="2.5"
                            />
                          )}

                          {/* Standard Ladder Markers */}
                          {pts.map((pt, i) => {
                            const sx = 60 + ((pt.y - minY) / rangeY) * 500;
                            const sy = 270 - ((Math.log10(pt.size) - minLog) / rangeLog) * 240;
                            return (
                              <g key={i}>
                                <circle cx={sx} cy={sy} r="5" fill="#f59e0b" stroke="#ffffff" stroke-width="1.5" />
                                <text x={sx} y={sy - 9} font-size="9" text-anchor="middle" fill="#d97706" font-weight="bold">
                                  {formatSize(pt.size, activeLadder.kind)}
                                </text>
                              </g>
                            );
                          })}

                          {/* Unknown sample bands projected onto curve */}
                          {selectedLane && laneAnalysis && laneAnalysis.metrics.map((m) => {
                            if (m.peakY === undefined || m.sizeEst === null) return null;
                            const sx = 60 + ((m.peakY - minY) / rangeY) * 500;
                            const sy = 270 - ((Math.log10(m.sizeEst) - minLog) / rangeLog) * 240;
                            return (
                              <g key={m.bandId}>
                                <polygon
                                  points={`${sx},${sy - 5} ${sx + 5},${sy} ${sx},${sy + 5} ${sx - 5},${sy}`}
                                  fill="#10b981"
                                  stroke="#ffffff"
                                  stroke-width="1.2"
                                />
                              </g>
                            );
                          })}
                        </>
                      );
                    })()}
                  </svg>

                  <div class="flex flex-wrap items-center justify-between text-xs text-slate-500 bg-slate-50 dark:bg-slate-800/50 p-3 rounded-xl">
                    <div class="flex items-center gap-4">
                      <span class="flex items-center gap-1.5"><span class="w-3 h-3 rounded-full bg-amber-500 inline-block"></span> Standard Ladder Points</span>
                      <span class="flex items-center gap-1.5"><span class="w-4 h-0.5 bg-accent-600 inline-block"></span> Fitted Standard Curve</span>
                      <span class="flex items-center gap-1.5"><span class="w-2.5 h-2.5 rotate-45 bg-emerald-500 inline-block"></span> Sample Bands (Interpolated)</span>
                    </div>
                  </div>
                </div>
              ) : (
                <div class="py-12 text-center text-slate-400 text-xs">
                  Please select a standard ladder lane with at least 2 detected bands in the left sidebar to plot the molecular weight calibration curve.
                </div>
              )}
            </div>
          )}

          {/* TAB 3: Comprehensive Quantification & Amounts Across All Lanes */}
          {s.viewTab === 'quant' && (
            <div class="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 space-y-4">
              <div class="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3 dark:border-slate-800">
                <div>
                  <h3 class="font-bold text-base text-slate-900 dark:text-slate-100">
                    Band Quantification & Relative Amounts
                  </h3>
                  <p class="text-xs text-slate-500">
                    Background-subtracted optical densities, relative percentage shares, and calibrated molecular weights
                  </p>
                </div>

                <div class="flex items-center gap-2">
                  <div class="flex rounded-lg border border-slate-200 dark:border-slate-700 p-0.5 text-xs">
                    <button
                      type="button"
                      onClick={() => set({ tableMode: 'all' })}
                      class={`px-3 py-1 rounded-md font-medium transition ${
                        s.tableMode === 'all' ? 'bg-accent-600 text-white' : 'text-slate-600 hover:text-slate-900 dark:text-slate-400'
                      }`}
                    >
                      All Lanes ({lanes.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => set({ tableMode: 'selected' })}
                      class={`px-3 py-1 rounded-md font-medium transition ${
                        s.tableMode === 'selected' ? 'bg-accent-600 text-white' : 'text-slate-600 hover:text-slate-900 dark:text-slate-400'
                      }`}
                    >
                      Lane {selectedLaneIdx + 1} Only
                    </button>
                  </div>

                  <div class="flex items-center gap-3">
                    <label class="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400 select-none cursor-pointer">
                      <input
                        type="checkbox"
                        checked={stripLanePrefix}
                        onChange={(e) => setStripLanePrefix((e.target as HTMLInputElement).checked)}
                        class="rounded border-slate-300 dark:border-slate-700 text-accent-600 focus:ring-accent-500"
                      />
                      <span>Omit L1/L2 prefix</span>
                    </label>

                    <button
                      type="button"
                      onClick={handleExportCsv}
                      class="px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                    >
                      Export All Lanes CSV
                    </button>
                  </div>
                </div>
              </div>

              {/* Band Quantification Chart */}
              <BandQuantChart
                analysis={allLanesAnalysis}
                ladderKind={activeLadder.kind}
                laneLabels={laneLabels}
                selectedLaneId={selectedLane?.id}
                onSelectLane={setSelectedLaneId}
              />

              {/* Table */}
              <div class="overflow-x-auto">
                <table class="w-full text-xs text-left">
                  <thead>
                    <tr class="border-b border-slate-200 dark:border-slate-700 text-slate-500 uppercase tracking-wider">
                      {s.tableMode === 'all' && <th class="pb-2 font-semibold">Lane</th>}
                      <th class="pb-2 font-semibold">Band #</th>
                      <th class="pb-2 font-semibold">Migration Y</th>
                      <th class="pb-2 font-semibold">Est. Size</th>
                      <th class="pb-2 font-semibold text-right">Raw Area</th>
                      <th class="pb-2 font-semibold text-right">Baseline</th>
                      <th class="pb-2 font-semibold text-right text-slate-900 dark:text-slate-100">Net Intensity (Amount)</th>
                      <th class="pb-2 font-semibold text-right">% of Lane</th>
                      <th class="pb-2 font-semibold text-right">Ratio to Ref</th>
                      <th class="pb-2 font-semibold text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-slate-100 dark:divide-slate-800">
                    {(s.tableMode === 'all' ? allLanesAnalysis : [laneAnalysis].filter(Boolean) as LaneAnalysisItem[]).flatMap((item) =>
                      item.metrics.map(m => {
                        const isRef = m.bandId === s.refBandId;
                        const isSaturated = m.saturation >= SATURATION_WARN;
                        const customName = laneLabels[item.lane.id];
                        return (
                          <tr
                            key={`${item.lane.id}-${m.bandId}`}
                            class={`hover:bg-slate-50 dark:hover:bg-slate-800/40 transition ${
                              isRef ? 'bg-emerald-50/50 dark:bg-emerald-950/20' : ''
                            }`}
                          >
                            {s.tableMode === 'all' && (
                              <td class="py-2.5 font-bold">
                                <span class="rounded bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5">
                                  {customName ? `L${item.laneIdx + 1}: ${customName}` : `L${item.laneIdx + 1}`}
                                </span>
                              </td>
                            )}
                            <td class="py-2.5 font-medium">Band {m.number}</td>
                            <td class="py-2.5 mono">{m.peakY ? m.peakY.toFixed(1) : '-'} px</td>
                            <td class="py-2.5 font-bold text-accent-600 dark:text-accent-400">
                              {m.sizeEst ? formatSize(m.sizeEst, activeLadder.kind) : '-'}
                            </td>
                            <td class="py-2.5 mono text-right text-slate-500">{m.raw.toFixed(1)}</td>
                            <td class="py-2.5 mono text-right text-slate-500">{m.background.toFixed(1)}</td>
                            <td class="py-2.5 mono text-right font-bold text-slate-900 dark:text-slate-100 text-sm">
                              {m.net.toFixed(1)}
                            </td>
                            <td class="py-2.5 mono text-right font-medium">{m.share.toFixed(1)}%</td>
                            <td class="py-2.5 mono text-right">
                              {isRef ? <span class="text-emerald-600 font-bold">1.00 (Ref)</span> : m.ratio.toFixed(2)}
                            </td>
                            <td class="py-2.5 text-center">
                              {isSaturated ? (
                                <span class="rounded bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-300 px-2 py-0.5 text-[10px] font-bold">
                                  Saturated
                                </span>
                              ) : (
                                <span class="text-slate-400 text-[10px]">Linear</span>
                              )}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      }
      actions={
        <div class="space-y-2">
          <ActionBar
            onCopy={() => {
              const unit = activeLadder.kind === 'protein' ? 'kDa' : 'bp';
              const summary = [
                `Gel & Blot Analysis Summary`,
                `Image: ${imageName}`,
                `Lanes: ${lanes.length}`,
                `Ladder: ${activeLadder.name} (${unit})`,
                `Calibration: ${calibration ? `${s.calibMethod} (R²=${calibration.r2?.toFixed(4) ?? 'N/A'})` : 'Uncalibrated'}`,
                '',
                ...allLanesAnalysis.flatMap(item => {
                  const customName = laneLabels[item.lane.id];
                  const title = customName ? `Lane ${item.laneIdx + 1} (${customName})` : `Lane ${item.laneIdx + 1}`;
                  const bands = item.metrics.map(m => {
                    const massStr = m.sizeEst ? ` | Mass: ${formatSize(m.sizeEst, activeLadder.kind)}` : '';
                    return `    Band #${m.number}: Pos=${Math.round(m.peakY ?? 0)}px${massStr} | Net=${m.net.toFixed(1)} (${m.share.toFixed(1)}%)`;
                  });
                  return [
                    `  ${title} [Total Net: ${item.totalNet.toFixed(1)}]:`,
                    ...(bands.length > 0 ? bands : ['    (No detected bands)']),
                  ];
                }),
              ].join('\n');
              return `${summary}\n\n${scienceText(SCIENCE)}`;
            }}
            shareUrl={shareUrl}
          />
          <div class="flex flex-col gap-1.5">
            <label class="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400 select-none cursor-pointer">
              <input
                type="checkbox"
                checked={stripLanePrefix}
                onChange={(e) => setStripLanePrefix((e.target as HTMLInputElement).checked)}
                class="rounded border-slate-300 dark:border-slate-700 text-accent-600 focus:ring-accent-500"
              />
              <span>Omit L1/L2 prefix</span>
            </label>
            <button
              type="button"
              onClick={handleExportCsv}
              class="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800 transition text-center"
            >
              Export All Lanes CSV
            </button>
          </div>
        </div>
      }
      science={<SciencePanel science={SCIENCE} />}
    />
  );
}
