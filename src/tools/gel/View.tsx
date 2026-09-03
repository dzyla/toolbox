import { useState, useMemo, useRef, useEffect } from 'preact/hooks';
import { useUrlState } from '@/lib/url-state';
import { decodeImageFile } from '@/lib/image';
import { demoGel } from '@/core/gel/synthetic';
import { autoLanes, equalLanes } from '@/core/gel/lanes';
import { sampleLane, laneProfile, detectBands, type LaneSamples, type BandPeak } from '@/core/gel/profile';
import { rollingBaseline, valleyBaseline } from '@/core/gel/background';
import { quantifyBands, percentOfLane, detectPolarity, SATURATION_WARN, type BandMetrics } from '@/core/gel/quant';
import { fitCalibration, formatSize, type Calibration, type CalibrationModel } from '@/core/gel/calibration';
import type { Plane, Polarity, Lane, Band } from '@/core/gel/types';
import laddersData from '@/data/ladders.json';
import { ToolLayout } from '@/app/components/ToolLayout';
import { SciencePanel, scienceText } from '@/app/components/SciencePanel';
import { ActionBar } from '@/app/components/ActionBar';
import { SCIENCE } from './science';

interface LadderPreset {
  id: string;
  name: string;
  supplier: string;
  catalog: string;
  kind: 'protein' | 'dna';
  unit: 'kDa' | 'bp';
  sizes: number[];
  notes?: string;
}

interface State {
  polarity: Polarity;
  bgMethod: 'rolling' | 'valley' | 'none';
  rollingRadius: number;
  prominence: number;
  ladderId: string;
  ladderLaneId: string;
  calModel: CalibrationModel;
  refBandId: string;
  brightness: number;
  contrast: number;
  invertDisplay: boolean;
  activeView: 'gel' | 'calibration' | 'quantification';
  tableMode: 'all' | 'selected';
}

const DEFAULTS: State = {
  polarity: 'dark',
  bgMethod: 'rolling',
  rollingRadius: 30,
  prominence: 0.05,
  ladderId: 'biorad-precision-plus',
  ladderLaneId: '',
  calModel: 'linear',
  refBandId: '',
  brightness: 1,
  contrast: 1,
  invertDisplay: false,
  activeView: 'gel',
  tableMode: 'all',
};

const LADDERS = laddersData.ladders as LadderPreset[];

interface LaneAnalysisItem {
  lane: Lane;
  laneIdx: number;
  isLadder: boolean;
  samples: LaneSamples;
  profile: Float32Array;
  baseline: Float32Array;
  bands: Band[];
  metrics: (BandMetrics & { number: number; share: number; ratio: number; sizeEst: number | null })[];
  totalNet: number;
}

function CalibrationPlot({
  calibration,
  activeLadder,
  allLanes,
  selectedLaneId,
}: {
  calibration: Calibration | null;
  activeLadder: LadderPreset;
  allLanes: LaneAnalysisItem[];
  selectedLaneId: string;
}) {
  if (!calibration || calibration.points.length < 2) {
    return (
      <div class="rounded-xl border border-dashed border-slate-300 p-8 text-center text-slate-500 dark:border-slate-700">
        <p class="font-medium">No Molecular Weight Calibration Active</p>
        <p class="mt-1 text-xs text-slate-400">
          Designate a ladder lane in the sidebar to fit standard bands and generate the calibration curve.
        </p>
      </div>
    );
  }

  const width = 640;
  const height = 340;
  const margin = { top: 25, right: 35, bottom: 45, left: 65 };
  const plotW = width - margin.left - margin.right;
  const plotH = height - margin.top - margin.bottom;

  const points = calibration.points;
  const minY = Math.min(...points.map(p => p.y));
  const maxY = Math.max(...points.map(p => p.y));
  const padY = Math.max(15, (maxY - minY) * 0.1);
  const domainY0 = Math.max(0, minY - padY);
  const domainY1 = maxY + padY;

  const minLog = Math.min(...points.map(p => Math.log10(p.size)));
  const maxLog = Math.max(...points.map(p => Math.log10(p.size)));
  const padLog = (maxLog - minLog) * 0.12;
  const domainLog0 = minLog - padLog;
  const domainLog1 = maxLog + padLog;

  const sx = (y: number) => margin.left + ((y - domainY0) / (domainY1 - domainY0)) * plotW;
  const sy = (logVal: number) => margin.top + (1 - (logVal - domainLog0) / (domainLog1 - domainLog0)) * plotH;

  // Sample fitted curve
  let curvePath = '';
  const numSteps = 70;
  for (let i = 0; i <= numSteps; i++) {
    const curY = domainY0 + (i / numSteps) * (domainY1 - domainY0);
    try {
      const sz = calibration.sizeAt(curY);
      if (Number.isFinite(sz) && sz > 0) {
        const curLog = Math.log10(sz);
        const px = sx(curY);
        const py = sy(curLog);
        curvePath += (curvePath === '' ? `M ${px.toFixed(1)} ${py.toFixed(1)}` : ` L ${px.toFixed(1)} ${py.toFixed(1)}`);
      }
    } catch {
      // extrapolate boundary
    }
  }

  // Sample bands from non-ladder lanes
  const sampleBands: { laneIdx: number; peakY: number; sizeEst: number; isSelected: boolean }[] = [];
  allLanes.forEach(item => {
    if (!item.isLadder) {
      item.metrics.forEach(m => {
        if (m.peakY !== undefined && m.sizeEst) {
          sampleBands.push({
            laneIdx: item.laneIdx,
            peakY: m.peakY,
            sizeEst: m.sizeEst,
            isSelected: item.lane.id === selectedLaneId,
          });
        }
      });
    }
  });

  return (
    <div class="space-y-4">
      <div class="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <div class="flex flex-wrap items-baseline justify-between gap-2 mb-3">
          <div>
            <h4 class="font-bold text-sm text-slate-900 dark:text-slate-100">
              Molecular Weight Calibration Curve (Semi-Log Plot)
            </h4>
            <p class="text-xs text-slate-500">
              Migration distance Y (px) vs log₁₀(Size {activeLadder.unit}) · Model: {calibration.model} (R² = {calibration.r2.toFixed(4)})
            </p>
          </div>
          <div class="flex items-center gap-4 text-xs">
            <span class="flex items-center gap-1.5">
              <span class="inline-block w-3 h-3 rounded-full bg-amber-500" />
              Ladder Standards
            </span>
            <span class="flex items-center gap-1.5">
              <span class="inline-block w-3 h-3 rotate-45 bg-blue-500" />
              Unknown Bands
            </span>
          </div>
        </div>

        <div class="overflow-x-auto rounded-lg bg-slate-50/50 p-2 dark:bg-slate-800/40">
          <svg viewBox={`0 0 ${width} ${height}`} class="w-full h-auto min-w-[500px]">
            {/* Grid lines */}
            {[0.25, 0.5, 0.75].map(frac => (
              <g key={frac}>
                <line
                  x1={margin.left}
                  y1={margin.top + frac * plotH}
                  x2={margin.left + plotW}
                  y2={margin.top + frac * plotH}
                  stroke="currentColor"
                  stroke-opacity="0.08"
                />
                <line
                  x1={margin.left + frac * plotW}
                  y1={margin.top}
                  x2={margin.left + frac * plotW}
                  y2={margin.top + plotH}
                  stroke="currentColor"
                  stroke-opacity="0.08"
                />
              </g>
            ))}

            {/* Axes */}
            <line x1={margin.left} y1={margin.top + plotH} x2={margin.left + plotW} y2={margin.top + plotH} stroke="currentColor" stroke-width="1.5" />
            <line x1={margin.left} y1={margin.top} x2={margin.left} y2={margin.top + plotH} stroke="currentColor" stroke-width="1.5" />

            {/* X-axis labels */}
            <text x={margin.left + plotW / 2} y={height - 8} text-anchor="middle" font-size="11" fill="currentColor" font-weight="500">
              Migration Distance Y along Lane (px)
            </text>
            <text x={margin.left} y={margin.top + plotH + 16} font-size="10" fill="currentColor" opacity="0.7">
              {Math.round(domainY0)} px
            </text>
            <text x={margin.left + plotW} y={margin.top + plotH + 16} text-anchor="end" font-size="10" fill="currentColor" opacity="0.7">
              {Math.round(domainY1)} px
            </text>

            {/* Y-axis labels */}
            <text x={-(margin.top + plotH / 2)} y="18" transform="rotate(-90)" text-anchor="middle" font-size="11" fill="currentColor" font-weight="500">
              log₁₀(Size / {activeLadder.unit})
            </text>
            <text x={margin.left - 8} y={margin.top + 10} text-anchor="end" font-size="10" fill="currentColor" opacity="0.7">
              {Math.round(Math.pow(10, domainLog1))} {activeLadder.unit}
            </text>
            <text x={margin.left - 8} y={margin.top + plotH} text-anchor="end" font-size="10" fill="currentColor" opacity="0.7">
              {Math.round(Math.pow(10, domainLog0))} {activeLadder.unit}
            </text>

            {/* Fitted Curve Path */}
            {curvePath && <path d={curvePath} fill="none" stroke="#2563eb" stroke-width="2.5" />}

            {/* Unknown Sample Bands Projected onto Curve */}
            {sampleBands.map((sb, idx) => {
              const px = sx(sb.peakY);
              const py = sy(Math.log10(sb.sizeEst));
              return (
                <g key={`sample-${idx}`}>
                  <rect
                    x={px - 4}
                    y={py - 4}
                    width="8"
                    height="8"
                    transform={`rotate(45 ${px} ${py})`}
                    fill={sb.isSelected ? '#3b82f6' : '#94a3b8'}
                    stroke="#ffffff"
                    stroke-width="1"
                  >
                    <title>{`Lane ${sb.laneIdx + 1} Band: ${sb.peakY.toFixed(1)} px → ${formatSize(sb.sizeEst, activeLadder.kind)}`}</title>
                  </rect>
                </g>
              );
            })}

            {/* Ladder Calibration Points */}
            {points.map((p, idx) => {
              const px = sx(p.y);
              const py = sy(Math.log10(p.size));
              return (
                <g key={`ladder-${idx}`}>
                  <circle cx={px} cy={py} r="5" fill="#f59e0b" stroke="#ffffff" stroke-width="1.5">
                    <title>{`Ladder: ${p.y.toFixed(1)} px → ${p.size} ${activeLadder.unit}`}</title>
                  </circle>
                  <text x={px + 7} y={py + 3} font-size="9.5" fill="currentColor" font-weight="600" opacity="0.9">
                    {p.size}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>

        {/* Calibration Stats & Equation */}
        <div class="mt-3 grid gap-3 sm:grid-cols-3 text-xs">
          <div class="rounded-lg bg-slate-50 p-2.5 dark:bg-slate-800">
            <span class="text-slate-500 block">Model & Fit R²</span>
            <strong class="text-slate-900 dark:text-slate-100">
              {calibration.model.toUpperCase()} (R² = {calibration.r2.toFixed(4)})
            </strong>
          </div>
          <div class="rounded-lg bg-slate-50 p-2.5 dark:bg-slate-800 sm:col-span-2">
            <span class="text-slate-500 block">Regression Equation</span>
            <code class="mono font-semibold text-accent-600 dark:text-accent-400">
              {calibration.slope !== undefined
                ? `log₁₀(Size) = ${calibration.slope.toFixed(5)} · y + ${(calibration.intercept ?? 0).toFixed(4)}`
                : `${calibration.points.length} standard reference bands interpolated`}
            </code>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function GelView() {
  const [stateSig, shareUrl] = useUrlState<State>('gel', DEFAULTS);
  const s = stateSig.value;
  const set = (patch: Partial<State>) => { stateSig.value = { ...stateSig.value, ...patch }; };
  const [plane, setPlane] = useState<Plane | null>(null);
  const [imageName, setImageName] = useState<string>('');
  const [lanes, setLanes] = useState<Lane[]>([]);
  const [selectedLaneId, setSelectedLaneId] = useState<string>('');
  const [bandMap, setBandMap] = useState<Record<string, Band[]>>({});
  const [numLanesInput, setNumLanesInput] = useState<number>(5);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load demo gel on initial mount if none loaded
  useEffect(() => {
    if (!plane) {
      loadDemo();
    }
  }, []);

  function loadDemo() {
    const demo = demoGel();
    setPlane(demo.plane);
    setImageName('demo_gel.png');
    const detectedPolarity = detectPolarity(demo.plane);
    set({ polarity: detectedPolarity });

    // Initial lanes across image
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
      setPlane({ width: decoded.width, height: decoded.height, data: decoded.data });
      setImageName(file.name);
      const pol = detectPolarity({ width: decoded.width, height: decoded.height, data: decoded.data });
      set({ polarity: pol });

      const detected = autoLanes({ width: decoded.width, height: decoded.height, data: decoded.data }, { x: 0, y: 0, w: decoded.width, h: decoded.height }, pol);
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

  // Active ladder preset
  const activeLadder = useMemo(() => {
    return LADDERS.find(l => l.id === s.ladderId) || LADDERS[0]!;
  }, [s.ladderId]);

  // Calibration from ladder lane
  const calibration: Calibration | null = useMemo(() => {
    if (!plane || !s.ladderLaneId) return null;
    const ladderLane = lanes.find(l => l.id === s.ladderLaneId);
    if (!ladderLane) return null;

    try {
      const ladderSamples = sampleLane(plane, ladderLane, s.polarity);
      const prof = laneProfile(ladderSamples);
      const peaks: BandPeak[] = detectBands(prof, { minProminence: s.prominence });
      if (peaks.length < (s.calModel === 'spline' ? 3 : 2)) return null;

      const sortedSizes = [...activeLadder.sizes].sort((a, b) => b - a);
      let chosenPeaks = [...peaks].sort((a, b) => b.prominence - a.prominence).slice(0, sortedSizes.length);
      chosenPeaks = chosenPeaks.sort((a, b) => a.index - b.index);

      const points = chosenPeaks.map((p, i) => ({ y: p.index, size: sortedSizes[i]! }));
      return fitCalibration(points, s.calModel);
    } catch {
      return null;
    }
  }, [plane, lanes, s.ladderLaneId, s.polarity, s.prominence, activeLadder, s.calModel]);

  // Selected lane calculations
  const selectedLane = useMemo(() => {
    return lanes.find(l => l.id === selectedLaneId) || lanes[0] || null;
  }, [lanes, selectedLaneId]);

  // Comprehensive analysis across ALL lanes
  const allLanesAnalysis: LaneAnalysisItem[] = useMemo(() => {
    if (!plane) return [];
    return lanes.map((lane, idx) => {
      try {
        const samples = sampleLane(plane, lane, s.polarity);
        const prof = laneProfile(samples);
        const bands: Band[] = bandMap[lane.id] || detectBands(prof, { minProminence: s.prominence }).map((p, i) => ({
          id: `${lane.id}-b-${i + 1}`,
          y0: p.y0,
          y1: p.y1,
          peakY: p.index,
        }));
        let baseline: Float32Array;
        if (s.bgMethod === 'rolling') {
          baseline = rollingBaseline(prof, s.rollingRadius);
        } else if (s.bgMethod === 'valley') {
          baseline = valleyBaseline(prof, bands);
        } else {
          baseline = new Float32Array(prof.length);
        }
        const rawMetrics = quantifyBands(samples, bands, baseline);
        const shares = percentOfLane(rawMetrics);

        const refMetric = rawMetrics.find(m => m.bandId === s.refBandId);
        const refNet = refMetric ? refMetric.net : (rawMetrics[0]?.net ?? 1);

        const table = rawMetrics.map((m, bIdx) => {
          const share = shares[bIdx]?.percentOfLane ?? 0;
          const ratio = refNet > 0 ? m.net / refNet : NaN;
          const sizeEst = calibration && m.peakY !== undefined ? calibration.sizeAt(m.peakY) : null;
          return {
            ...m,
            number: bIdx + 1,
            share,
            ratio,
            sizeEst,
          };
        });

        const totalNet = table.reduce((acc, m) => acc + m.net, 0);

        return {
          lane,
          laneIdx: idx,
          isLadder: lane.id === s.ladderLaneId,
          samples,
          profile: prof,
          baseline,
          bands,
          metrics: table,
          totalNet,
        };
      } catch {
        return null;
      }
    }).filter(Boolean) as LaneAnalysisItem[];
  }, [plane, lanes, s.polarity, s.bgMethod, s.rollingRadius, s.prominence, bandMap, s.refBandId, s.ladderLaneId, calibration]);

  const laneAnalysis = useMemo(() => {
    return allLanesAnalysis.find(item => item.lane.id === selectedLane?.id) || null;
  }, [allLanesAnalysis, selectedLane]);

  // Canvas rendering
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !plane) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = plane.width;
    canvas.height = plane.height;

    const imgData = ctx.createImageData(plane.width, plane.height);
    const d = imgData.data;

    const b = s.brightness;
    const c = s.contrast;
    const inv = s.invertDisplay;

    for (let i = 0; i < plane.data.length; i++) {
      let val = plane.data[i]!;
      if (inv) val = 1 - val;
      val = (val - 0.5) * c + 0.5;
      val = val * b;
      const byte = Math.max(0, Math.min(255, Math.round(val * 255)));
      const pIdx = i * 4;
      d[pIdx] = byte;
      d[pIdx + 1] = byte;
      d[pIdx + 2] = byte;
      d[pIdx + 3] = 255;
    }
    ctx.putImageData(imgData, 0, 0);

    // Draw lanes
    lanes.forEach((l, idx) => {
      const isSelected = l.id === selectedLane?.id;
      const isLadder = l.id === s.ladderLaneId;

      ctx.save();
      ctx.strokeStyle = isSelected ? '#3b82f6' : isLadder ? '#eab308' : '#64748b';
      ctx.lineWidth = isSelected ? 2.5 : 1;
      ctx.setLineDash(isSelected ? [] : [4, 4]);

      const half = l.width / 2;
      ctx.strokeRect(l.x - half, l.y0, l.width, l.y1 - l.y0);

      // Label badge
      ctx.fillStyle = isSelected ? '#3b82f6' : isLadder ? '#eab308' : '#94a3b8';
      ctx.font = 'bold 12px sans-serif';
      ctx.fillText(`L${idx + 1}${isLadder ? ' (Ladder)' : ''}`, l.x - half + 4, l.y0 + 16);

      // Draw bands for this lane
      const analysisItem = allLanesAnalysis.find(item => item.lane.id === l.id);
      const bands = analysisItem ? analysisItem.bands : (bandMap[l.id] || []);
      bands.forEach(band => {
        ctx.fillStyle = isSelected ? 'rgba(59, 130, 246, 0.35)' : 'rgba(148, 163, 184, 0.25)';
        ctx.fillRect(l.x - half, band.y0, l.width, Math.max(1, band.y1 - band.y0));

        if (band.peakY !== undefined) {
          ctx.strokeStyle = isSelected ? '#2563eb' : '#94a3b8';
          ctx.lineWidth = 1.5;
          ctx.setLineDash([]);
          ctx.beginPath();
          ctx.moveTo(l.x - half, band.peakY);
          ctx.lineTo(l.x + half, band.peakY);
          ctx.stroke();

          // Size text if calibrated
          if (calibration) {
            const sz = calibration.sizeAt(band.peakY);
            ctx.fillStyle = '#ffffff';
            ctx.font = '10px sans-serif';
            ctx.fillText(formatSize(sz, activeLadder.kind), l.x + half + 4, band.peakY + 3);
          }
        }
      });

      ctx.restore();
    });
  }, [plane, lanes, selectedLane, allLanesAnalysis, bandMap, s.brightness, s.contrast, s.invertDisplay, s.ladderLaneId, calibration, activeLadder]);

  // Click on canvas to select lane
  function handleCanvasClick(e: MouseEvent) {
    const canvas = canvasRef.current;
    if (!canvas || !plane || lanes.length === 0) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const clickX = (e.clientX - rect.left) * scaleX;
    const clickY = (e.clientY - rect.top) * scaleY;

    let closestLane: Lane | null = null;
    let minDistance = Infinity;

    for (const lane of lanes) {
      const half = lane.width / 2;
      const inLaneX = clickX >= lane.x - half && clickX <= lane.x + half;
      const inLaneY = clickY >= Math.min(lane.y0, lane.y1) && clickY <= Math.max(lane.y0, lane.y1);
      if (inLaneX && inLaneY) {
        closestLane = lane;
        break;
      }
      const dist = Math.abs(clickX - lane.x);
      if (dist < minDistance) {
        minDistance = dist;
        closestLane = lane;
      }
    }

    if (closestLane) {
      setSelectedLaneId(closestLane.id);
    }
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

  function handleAddLane() {
    if (!plane) return;
    const newX = lanes.length > 0 ? Math.min(plane.width - 20, (lanes[lanes.length - 1]?.x ?? 50) + 50) : 50;
    const newLane: Lane = {
      id: `lane-${Date.now()}`,
      x: newX,
      y0: 0,
      y1: plane.height,
      width: 40,
      tilt: 0,
    };
    const updated = [...lanes, newLane];
    setLanes(updated);
    setSelectedLaneId(newLane.id);
  }

  function handleDeleteSelectedLane() {
    if (!selectedLane) return;
    const updated = lanes.filter(l => l.id !== selectedLane.id);
    setLanes(updated);
    if (updated.length > 0) setSelectedLaneId(updated[0]!.id);
  }

  function updateSelectedLane(delta: Partial<Lane>) {
    if (!selectedLane) return;
    setLanes(lanes.map(l => l.id === selectedLane.id ? { ...l, ...delta } : l));
  }

  function exportCsv() {
    const headers = ['Lane', 'Band', 'Peak Y (px)', `Size (${activeLadder.unit})`, 'Raw Area', 'Background', 'Net Intensity', 'Percent of Lane (%)', 'Ratio to Ref'];
    const rows: (string | number)[][] = [];

    allLanesAnalysis.forEach(item => {
      item.metrics.forEach(m => {
        rows.push([
          `L${item.laneIdx + 1}${item.isLadder ? ' (Ladder)' : ''}`,
          `Band ${m.number}`,
          m.peakY !== undefined ? m.peakY.toFixed(1) : '',
          m.sizeEst ? formatSize(m.sizeEst, activeLadder.kind) : '',
          m.raw.toFixed(1),
          m.background.toFixed(1),
          m.net.toFixed(1),
          m.share.toFixed(2),
          Number.isFinite(m.ratio) ? m.ratio.toFixed(3) : '',
        ]);
      });
    });

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `${imageName || 'gel'}_all_lanes_quantification.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  const selectedLaneIdx = lanes.findIndex(l => l.id === selectedLane?.id);

  return (
    <ToolLayout
      icon="🧬"
      title="Gel & Blot Analysis"
      blurb="Densitometry, relative quantification and molecular-weight calibration for SDS-PAGE, Western blots and agarose gels"
      wide={true}
      inputs={
        <div class="space-y-5 text-sm">
          {/* Image Source Card */}
          <div class="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 space-y-3">
            <h3 class="font-semibold text-sm text-slate-900 dark:text-slate-100 flex items-center justify-between">
              <span>Image Source</span>
              <span class="text-xs font-normal text-slate-500 truncate max-w-[130px]">{imageName}</span>
            </h3>
            <div class="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                class="px-3 py-2 text-xs font-semibold bg-accent-600 text-white rounded-lg hover:bg-accent-700 transition"
              >
                Upload Gel / TIFF
              </button>
              <button
                type="button"
                onClick={loadDemo}
                class="px-3 py-2 text-xs font-semibold bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 transition"
              >
                Load Demo Gel
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,.tif,.tiff"
                class="hidden"
                onChange={(e) => {
                  const file = (e.target as HTMLInputElement).files?.[0];
                  if (file) handleFileUpload(file);
                }}
              />
            </div>
            <div>
              <label class="text-xs font-medium text-slate-500 block mb-1">Signal Polarity</label>
              <select
                value={s.polarity}
                onChange={(e) => set({ polarity: (e.target as HTMLSelectElement).value as Polarity })}
                class="w-full text-xs px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 dark:bg-slate-900"
              >
                <option value="dark">Dark bands on light (Coomassie, Silver, UV)</option>
                <option value="light">Light bands on dark (ECL, Fluorescence)</option>
              </select>
            </div>
          </div>

          {/* Molecular Weight Calibration Section */}
          <div class="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 space-y-3">
            <h3 class="font-semibold text-sm text-slate-900 dark:text-slate-100">
              Molecular Weight Calibration
            </h3>
            <div>
              <label class="text-xs font-medium text-slate-500 block mb-1">Ladder Lane</label>
              <select
                value={s.ladderLaneId}
                onChange={(e) => set({ ladderLaneId: (e.target as HTMLSelectElement).value })}
                class="w-full text-xs px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 dark:bg-slate-900"
              >
                <option value="">None (no calibration)</option>
                {lanes.map((l, i) => (
                  <option key={l.id} value={l.id}>Lane {i + 1}</option>
                ))}
              </select>
            </div>

            <div>
              <label class="text-xs font-medium text-slate-500 block mb-1">Ladder Preset</label>
              <select
                value={s.ladderId}
                onChange={(e) => set({ ladderId: (e.target as HTMLSelectElement).value })}
                class="w-full text-xs px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 dark:bg-slate-900"
              >
                {LADDERS.map(ladder => (
                  <option key={ladder.id} value={ladder.id}>
                    {ladder.name} ({ladder.supplier})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label class="text-xs font-medium text-slate-500 block mb-1">Fitting Model</label>
              <select
                value={s.calModel}
                onChange={(e) => set({ calModel: (e.target as HTMLSelectElement).value as CalibrationModel })}
                class="w-full text-xs px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 dark:bg-slate-900"
              >
                <option value="linear">Log-Linear (Weber & Osborn, R²)</option>
                <option value="piecewise">Piecewise Linear</option>
                <option value="spline">Natural Cubic Spline</option>
              </select>
            </div>

            {calibration && (
              <div class="rounded-lg bg-slate-50 p-2 text-xs space-y-1 dark:bg-slate-800">
                <div class="flex justify-between">
                  <span class="text-slate-500">Fit R²:</span>
                  <strong class="mono">{calibration.r2.toFixed(4)}</strong>
                </div>
                {calibration.slope !== undefined && (
                  <div class="flex justify-between">
                    <span class="text-slate-500">Slope:</span>
                    <span class="mono">{calibration.slope.toFixed(5)}</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Densitometry & Background */}
          <div class="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 space-y-3">
            <h3 class="font-semibold text-sm text-slate-900 dark:text-slate-100">
              Densitometry & Background
            </h3>
            <div>
              <label class="text-xs font-medium text-slate-500 block mb-1">Baseline Method</label>
              <select
                value={s.bgMethod}
                onChange={(e) => set({ bgMethod: (e.target as HTMLSelectElement).value as 'rolling' | 'valley' | 'none' })}
                class="w-full text-xs px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 dark:bg-slate-900"
              >
                <option value="rolling">Rolling Ball</option>
                <option value="valley">Valley-to-Valley Baseline</option>
                <option value="none">None (No Subtraction)</option>
              </select>
            </div>

            {s.bgMethod === 'rolling' && (
              <div>
                <div class="flex justify-between text-xs text-slate-500 mb-1">
                  <span>Rolling Radius</span>
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
          {/* Quick Lanes Navigation & Toolbar Bar */}
          <div class="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 space-y-3">
            <div class="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3 dark:border-slate-800">
              <div class="flex items-center gap-1.5 flex-wrap">
                <span class="text-xs font-semibold text-slate-500 uppercase tracking-wider mr-1">Lanes:</span>
                {lanes.map((l, i) => {
                  const isSel = l.id === selectedLane?.id;
                  const isLadder = l.id === s.ladderLaneId;
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
                      L{i + 1}{isLadder ? ' 🏷️' : ''}
                    </button>
                  );
                })}
              </div>

              <div class="flex items-center gap-1.5">
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
              </div>
            </div>

            {/* Selected Lane Inline Geometry Sliders */}
            {selectedLane && (
              <div class="grid gap-3 sm:grid-cols-2 text-xs bg-slate-50 p-2.5 rounded-xl dark:bg-slate-800/50 items-center">
                <div class="flex items-center gap-3">
                  <span class="text-slate-500 shrink-0 font-medium">L{selectedLaneIdx + 1} Center X:</span>
                  <input
                    type="range"
                    min="10"
                    max={plane ? plane.width - 10 : 400}
                    value={selectedLane.x}
                    onInput={(e) => updateSelectedLane({ x: parseInt((e.target as HTMLInputElement).value) })}
                    class="w-full accent-accent-600"
                  />
                  <span class="mono font-semibold w-12 text-right">{Math.round(selectedLane.x)} px</span>
                </div>
                <div class="flex items-center gap-3">
                  <span class="text-slate-500 shrink-0 font-medium">Lane Width:</span>
                  <input
                    type="range"
                    min="10"
                    max="150"
                    value={selectedLane.width}
                    onInput={(e) => updateSelectedLane({ width: parseInt((e.target as HTMLInputElement).value) })}
                    class="w-full accent-accent-600"
                  />
                  <span class="mono font-semibold w-12 text-right">{selectedLane.width} px</span>
                </div>
              </div>
            )}
          </div>

          {/* Workflow View Tabs */}
          <div class="flex flex-wrap gap-1 border-b border-slate-200 dark:border-slate-800 pb-2">
            <button
              type="button"
              onClick={() => set({ activeView: 'gel' })}
              class={`rounded-lg px-3.5 py-2 text-xs font-semibold transition ${
                s.activeView === 'gel'
                  ? 'bg-accent-600 text-white shadow-xs'
                  : 'text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800'
              }`}
            >
              🖼️ Gel Image & Lane Profile
            </button>
            <button
              type="button"
              onClick={() => set({ activeView: 'calibration' })}
              class={`rounded-lg px-3.5 py-2 text-xs font-semibold transition ${
                s.activeView === 'calibration'
                  ? 'bg-accent-600 text-white shadow-xs'
                  : 'text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800'
              }`}
            >
              📈 MW Calibration Curve
            </button>
            <button
              type="button"
              onClick={() => set({ activeView: 'quantification' })}
              class={`rounded-lg px-3.5 py-2 text-xs font-semibold transition ${
                s.activeView === 'quantification'
                  ? 'bg-accent-600 text-white shadow-xs'
                  : 'text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800'
              }`}
            >
              📊 Band Quantification & Amounts ({allLanesAnalysis.reduce((acc, l) => acc + l.metrics.length, 0)} bands)
            </button>
          </div>

          {/* VIEW 1: GEL IMAGE & LANE PROFILE */}
          {s.activeView === 'gel' && (
            <div class="space-y-4">
              {/* Gel Canvas Card */}
              <div class="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                <div class="flex items-center justify-between mb-2">
                  <h3 class="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                    <span>Gel Image & Annotations</span>
                    <span class="text-xs font-normal text-slate-400">
                      {plane ? `${plane.width} × ${plane.height} px` : ''}
                    </span>
                  </h3>
                  <div class="text-xs text-accent-600 dark:text-accent-400 font-medium">
                    💡 Click on any lane on the gel to select it
                  </div>
                </div>

                <div class="w-full overflow-auto bg-slate-950/90 rounded-xl p-3 flex justify-center items-center min-h-[300px]">
                  <canvas
                    ref={canvasRef}
                    onClick={handleCanvasClick}
                    class="max-w-full h-auto object-contain shadow-md rounded cursor-pointer transition hover:opacity-95"
                    title="Click directly on any lane to select it"
                  />
                </div>
              </div>

              {/* Densitometry Profile Chart */}
              {laneAnalysis && (
                <div class="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 space-y-3">
                  <div class="flex items-center justify-between">
                    <h3 class="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      Densitometry Profile — Lane {selectedLaneIdx + 1}
                    </h3>
                    <div class="text-xs text-slate-500 flex gap-4">
                      <span class="flex items-center gap-1.5"><span class="w-3 h-0.5 bg-blue-500 inline-block" /> Signal</span>
                      <span class="flex items-center gap-1.5"><span class="w-3 h-0.5 bg-amber-500 inline-block border-t border-dashed" /> Baseline</span>
                      <span class="flex items-center gap-1.5"><span class="w-2 h-2 rounded-full bg-red-500 inline-block" /> Peaks ({laneAnalysis.bands.length})</span>
                    </div>
                  </div>

                  <div class="h-44 w-full bg-slate-50/60 rounded-xl p-2 relative overflow-hidden dark:bg-slate-800/40">
                    <svg class="w-full h-full" viewBox={`0 0 ${laneAnalysis.profile.length} 100`} preserveAspectRatio="none">
                      {(() => {
                        let maxVal = 0.001;
                        for (let i = 0; i < laneAnalysis.profile.length; i++) {
                          if (laneAnalysis.profile[i]! > maxVal) maxVal = laneAnalysis.profile[i]!;
                        }
                        maxVal *= 1.1;

                        let sigPath = `M 0 ${100 - (laneAnalysis.profile[0]! / maxVal) * 100}`;
                        for (let i = 1; i < laneAnalysis.profile.length; i++) {
                          sigPath += ` L ${i} ${100 - (laneAnalysis.profile[i]! / maxVal) * 100}`;
                        }

                        let basePath = `M 0 ${100 - (laneAnalysis.baseline[0]! / maxVal) * 100}`;
                        for (let i = 1; i < laneAnalysis.baseline.length; i++) {
                          basePath += ` L ${i} ${100 - (laneAnalysis.baseline[i]! / maxVal) * 100}`;
                        }

                        return (
                          <g>
                            <line x1="0" y1="25" x2={laneAnalysis.profile.length} y2="25" stroke="currentColor" stroke-opacity="0.05" />
                            <line x1="0" y1="50" x2={laneAnalysis.profile.length} y2="50" stroke="currentColor" stroke-opacity="0.05" />
                            <line x1="0" y1="75" x2={laneAnalysis.profile.length} y2="75" stroke="currentColor" stroke-opacity="0.05" />

                            {laneAnalysis.bands.map(b => (
                              <rect
                                key={b.id}
                                x={b.y0}
                                y="0"
                                width={Math.max(1, b.y1 - b.y0)}
                                height="100"
                                fill="rgba(59, 130, 246, 0.12)"
                              />
                            ))}

                            <path d={basePath} fill="none" stroke="#f59e0b" stroke-width="1.5" stroke-dasharray="3,3" />
                            <path d={sigPath} fill="none" stroke="#3b82f6" stroke-width="1.5" />

                            {laneAnalysis.bands.map(b => {
                              if (b.peakY === undefined) return null;
                              const yVal = laneAnalysis.profile[Math.round(b.peakY)] ?? 0;
                              return (
                                <circle
                                  key={b.id}
                                  cx={b.peakY}
                                  cy={100 - (yVal / maxVal) * 100}
                                  r="3"
                                  fill="#ef4444"
                                />
                              );
                            })}
                          </g>
                        );
                      })()}
                    </svg>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* VIEW 2: MOLECULAR WEIGHT CALIBRATION PLOT */}
          {s.activeView === 'calibration' && (
            <CalibrationPlot
              calibration={calibration}
              activeLadder={activeLadder}
              allLanes={allLanesAnalysis}
              selectedLaneId={selectedLane?.id || ''}
            />
          )}

          {/* VIEW 3: QUANTIFICATION & AMOUNTS (ALL LANES AND MARKERS) */}
          {s.activeView === 'quantification' && (
            <div class="space-y-4">
              <div class="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 space-y-3">
                <div class="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3 dark:border-slate-800">
                  <div>
                    <h3 class="font-bold text-sm text-slate-900 dark:text-slate-100">
                      Band Quantification & Sizes / Amounts
                    </h3>
                    <p class="text-xs text-slate-500">
                      Showing calibrated sizes, background-subtracted integrated areas, and relative shares
                    </p>
                  </div>

                  <div class="flex items-center gap-2">
                    <div class="flex rounded-lg border border-slate-200 p-0.5 dark:border-slate-700 text-xs">
                      <button
                        type="button"
                        onClick={() => set({ tableMode: 'all' })}
                        class={`px-2.5 py-1 rounded-md font-medium transition ${s.tableMode === 'all' ? 'bg-accent-600 text-white' : 'text-slate-600 dark:text-slate-400'}`}
                      >
                        All Lanes ({allLanesAnalysis.length})
                      </button>
                      <button
                        type="button"
                        onClick={() => set({ tableMode: 'selected' })}
                        class={`px-2.5 py-1 rounded-md font-medium transition ${s.tableMode === 'selected' ? 'bg-accent-600 text-white' : 'text-slate-600 dark:text-slate-400'}`}
                      >
                        Lane {selectedLaneIdx + 1} Only
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={exportCsv}
                      class="px-3 py-1.5 text-xs font-semibold bg-accent-600 text-white rounded-lg hover:bg-accent-700 transition flex items-center gap-1.5"
                    >
                      Export All Lanes CSV
                    </button>
                  </div>
                </div>

                {/* Table */}
                <div class="overflow-x-auto max-h-96 rounded-xl border border-slate-200 dark:border-slate-800">
                  <table class="w-full min-w-[48rem] text-left text-xs">
                    <thead class="sticky top-0 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 text-slate-500">
                      <tr>
                        <th class="py-2 px-3 font-medium">Lane</th>
                        <th class="py-2 px-3 font-medium">Band</th>
                        <th class="py-2 px-3 text-right font-medium">Peak Y (px)</th>
                        <th class="py-2 px-3 text-right font-medium">Estimated Size</th>
                        <th class="py-2 px-3 text-right font-medium">Net Intensity (Amount)</th>
                        <th class="py-2 px-3 text-right font-medium">% of Lane</th>
                        <th class="py-2 px-3 text-right font-medium">Ratio to Ref</th>
                        <th class="py-2 px-3 text-center font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-100 dark:divide-slate-800">
                      {(s.tableMode === 'all' ? allLanesAnalysis : [laneAnalysis].filter(Boolean) as LaneAnalysisItem[]).flatMap((item) =>
                        item.metrics.map(m => {
                          const isRef = m.bandId === s.refBandId;
                          const isSaturated = m.saturation >= SATURATION_WARN;
                          return (
                            <tr
                              key={`${item.lane.id}-${m.bandId}`}
                              class={`hover:bg-slate-50 dark:hover:bg-slate-800/50 ${item.lane.id === selectedLane?.id ? 'bg-blue-50/20' : ''}`}
                            >
                              <td class="py-1.5 px-3 font-semibold text-slate-900 dark:text-slate-100">
                                L{item.laneIdx + 1}
                                {item.isLadder && <span class="ml-1 text-[10px] text-amber-600 dark:text-amber-400 font-normal">(Ladder)</span>}
                              </td>
                              <td class="py-1.5 px-3 mono">Band {m.number}</td>
                              <td class="py-1.5 px-3 text-right mono">{m.peakY !== undefined ? m.peakY.toFixed(1) : '—'}</td>
                              <td class="py-1.5 px-3 text-right mono font-semibold text-accent-600 dark:text-accent-400">
                                {m.sizeEst ? formatSize(m.sizeEst, activeLadder.kind) : '—'}
                              </td>
                              <td class="py-1.5 px-3 text-right mono font-medium">{m.net.toFixed(1)}</td>
                              <td class="py-1.5 px-3 text-right mono">{m.share.toFixed(1)}%</td>
                              <td class="py-1.5 px-3 text-right mono">{Number.isFinite(m.ratio) ? m.ratio.toFixed(2) : '—'}</td>
                              <td class="py-1.5 px-3 text-center">
                                {isSaturated ? (
                                  <span class="px-1.5 py-0.5 rounded text-[10px] bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200">
                                    Saturated
                                  </span>
                                ) : isRef ? (
                                  <span class="px-1.5 py-0.5 rounded text-[10px] bg-accent-100 text-accent-800 dark:bg-accent-950 dark:text-accent-200">
                                    Reference
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
            </div>
          )}
        </div>
      }
      actions={
        <ActionBar
          onCopy={() => {
            const summary = allLanesAnalysis.map(item => `Lane ${item.laneIdx + 1}: ${item.metrics.length} bands, Total Net: ${item.totalNet.toFixed(1)}`).join('\n');
            return `${summary}\n\n${scienceText(SCIENCE)}`;
          }}
          shareUrl={shareUrl}
        />
      }
      science={<SciencePanel science={SCIENCE} />}
    />
  );
}
