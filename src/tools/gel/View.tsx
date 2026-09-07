import { useEffect, useRef, useState, useMemo } from 'preact/hooks';
import { useUrlState } from '@/lib/url-state';
import { downloadText, downloadBlob, toCsv } from '@/lib/export';
import { decodeImageFile } from '@/lib/image';
import { demoGel } from '@/core/gel/synthetic';
import { autoLanes, equalLanes, gridLanesFromPlaced } from '@/core/gel/lanes';
import { sampleLane, laneProfile, detectBands, refitBandNear } from '@/core/gel/profile';
import { sharedCrossLaneBaseline, baselineFor, integrateLaneSignal } from '@/core/gel/background';
import { quantifyBands, detectPolarity, type BandMetrics } from '@/core/gel/quant';
import {
  fitCalibration,
  formatSize,
  fitMassCalibration,
  formatMass,
  MASS_STANDARD_PRESETS,
  type Calibration,
  type CalibrationPoint,
  type MassCalibration,
  type MassCalibrationModel,
  type MassCalibrationPoint,
} from '@/core/gel/calibration';
import { transformPlane, suggestGelCropAndTilt, type Geometry } from '@/core/gel/transform';
import { applyDisplayTransform, buildGelSvg, type BandAnnotation } from '@/core/gel/svg-export';
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
  minClip: number;
  maxClip: number;
  gamma: number;
  invertDisplay: boolean;
  bgMethod: 'shared' | 'rolling' | 'valley' | 'none';
  rollingRadius: number;
  prominence: number;
  ladderLaneId: string;
  ladderId: string;
  calibMethod: 'linear' | 'piecewise' | 'spline';
  massLaneId: string;
  massCalibMethod: MassCalibrationModel;
  massPresetId: string;
  calibSubTab: 'mw' | 'mass';
  showMassLabels: boolean;
  refBandId: string;
  loadingRefLaneId: string;
  viewTab: 'gel' | 'calib' | 'quant';
  quantSubView: 'bands' | 'loading';
  tableMode: 'all' | 'selected';
}

const DEFAULTS: State = {
  polarity: 'dark',
  brightness: 1,
  contrast: 1,
  minClip: 0,
  maxClip: 1,
  gamma: 1,
  invertDisplay: false,
  // Default to per-lane rolling-ball baseline: it adapts to each lane's local background, so dense
  // bands are corrected per-lane (a single shared baseline subtracts the same background from every
  // lane — including the reference — which under-corrects dense samples).
  bgMethod: 'rolling',
  rollingRadius: 40,
  prominence: 0.05,
  ladderLaneId: '',
  // Valid built-in ladder id (was 'broad-protein', which does not exist in ladders.json — the preset
  // dropdown rendered blank and activeLadder silently fell back to LADDERS[0]).
  ladderId: 'biorad-precision-plus',
  calibMethod: 'piecewise',
  massLaneId: '',
  massCalibMethod: 'linear',
  massPresetId: 'two-fold-dilution',
  calibSubTab: 'mw',
  showMassLabels: false,
  refBandId: '',
  loadingRefLaneId: '',
  viewTab: 'gel',
  quantSubView: 'bands',
  tableMode: 'all',
};

const SATURATION_WARN = 0.05;

interface LaneAnalysisItem {
  lane: Lane;
  laneIdx: number;
  profile: Float32Array;
  baseline: Float32Array;
  netProfile: Float32Array;
  metrics: (BandMetrics & { number: number; share: number; ratio: number; sizeEst: number | null; massEst: number | null })[];
  totalNet: number;
  totalBandsSignal: number;
  totalLaneSignal: number;
  loadingRatio: number;
  loadingDeviationPct: number;
  normFactor: number;
}

type QuantBandMetric = LaneAnalysisItem['metrics'][number];

function toBands(peaks: ReturnType<typeof detectBands>): Band[] {
  return peaks.map((p, i) => ({
    id: `b-${Math.round(p.index)}-${i}`,
    y0: p.y0,
    y1: p.y1,
    peakY: p.index,
  }));
}

/**
 * Standard mass/size color-coding for densitometry plots.
 * Maps molecular weight (or migration distance Rf if uncalibrated)
 * to consistent scientific hues across all lanes and charts.
 */
export function getMassColor(
  sizeEst: number | null | undefined,
  ladderKind: 'protein' | 'dna' = 'protein',
  migrationFrac = 0.5
): string {
  if (sizeEst !== null && sizeEst !== undefined && sizeEst > 0) {
    if (ladderKind === 'protein') {
      if (sizeEst >= 180) return '#581c87'; // Deep purple (>180 kDa)
      if (sizeEst >= 130) return '#7c3aed'; // Purple (130-180 kDa)
      if (sizeEst >= 95) return '#2563eb';  // Indigo/Blue (95-130 kDa)
      if (sizeEst >= 68) return '#0284c7';  // Sky (68-95 kDa)
      if (sizeEst >= 50) return '#0d9488';  // Teal (50-68 kDa)
      if (sizeEst >= 38) return '#16a34a';  // Green (38-50 kDa)
      if (sizeEst >= 28) return '#65a30d';  // Lime (28-38 kDa)
      if (sizeEst >= 20) return '#d97706';  // Amber (20-28 kDa)
      if (sizeEst >= 14) return '#ea580c';  // Orange (14-20 kDa)
      return '#e11d48';                    // Rose/Red (<14 kDa)
    } else {
      if (sizeEst >= 8000) return '#581c87';
      if (sizeEst >= 5000) return '#7c3aed';
      if (sizeEst >= 3000) return '#2563eb';
      if (sizeEst >= 1500) return '#0284c7';
      if (sizeEst >= 1000) return '#0d9488';
      if (sizeEst >= 700) return '#16a34a';
      if (sizeEst >= 400) return '#65a30d';
      if (sizeEst >= 200) return '#d97706';
      return '#e11d48';
    }
  }
  // Uncalibrated: map migration distance (0 = top/high mass to 1 = bottom/low mass)
  const frac = Math.max(0, Math.min(1, migrationFrac));
  const hue = Math.round(270 - frac * 270);
  return `hsl(${hue}, 75%, 45%)`;
}

/**
 * Compact horizontal preview of a whole lane (migration left→right) for the Western-blot chart.
 * The strip is `w` px of migration × `h` px of lane width; a marker is drawn at the target band's
 * migration position so the reader can see which band the bar refers to, in the context of the whole
 * lane. Reuses the same display adjustments (clip/gamma/contrast/brightness/invert) as the workbench
 * lane strips so the preview matches what is on the gel canvas.
 */
/**
 * Render an aligned vertical blot window slice for Western blot mode.
 * The window is centered on the target band's migration position (targetY) so all bands
 * line up horizontally across lanes in a natural vertical orientation.
 */
function westernBlotSliceDataUrl(opts: {
  plane: Plane;
  lane: Lane;
  targetY: number;
  windowHeightPx?: number;
  stripWidthPx?: number;
  display: { minClip: number; maxClip: number; gamma: number; contrast: number; brightness: number; invert: boolean };
}): string | null {
  const { plane, lane, targetY, windowHeightPx = 96, stripWidthPx = 44, display } = opts;
  const canvas = document.createElement('canvas');
  canvas.width = stripWidthPx;
  canvas.height = windowHeightPx;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const img = ctx.createImageData(stripWidthPx, windowHeightPx);
  const data = img.data;
  const halfH = windowHeightPx / 2;
  const halfW = lane.width / 2;
  const laneLen = Math.max(1, lane.y1 - lane.y0);
  const clipRange = Math.max(0.01, display.maxClip - display.minClip);

  for (let r = 0; r < windowHeightPx; r++) {
    const curY = lane.y0 + targetY - halfH + r;
    const t = Math.max(0, Math.min(1, (curY - lane.y0) / laneLen));
    const curX = lane.x + t * lane.tilt;

    for (let c = 0; c < stripWidthPx; c++) {
      const v = (c / (stripWidthPx - 1) - 0.5) * 2;
      const gx = Math.max(0, Math.min(plane.width - 1, Math.round(curX + v * halfW)));
      const gy = Math.max(0, Math.min(plane.height - 1, Math.round(curY)));

      let val = 0;
      if (curY >= 0 && curY < plane.height) {
        val = plane.data[gy * plane.width + gx] ?? 0;
      }
      let adj = Math.max(0, Math.min(1, (val - display.minClip) / clipRange));
      if (display.gamma !== 1) adj = Math.pow(adj, 1 / display.gamma);
      adj = (adj - 0.5) * display.contrast + 0.5;
      adj = adj * display.brightness;
      if (display.invert) adj = 1 - adj;
      adj = Math.max(0, Math.min(1, adj));
      const g = Math.round(adj * 255);
      const i = (r * stripWidthPx + c) * 4;
      data[i] = g; data[i + 1] = g; data[i + 2] = g; data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);

  // Center alignment guide tick marks on the edges (without crossing the band)
  ctx.fillStyle = '#10b981';
  ctx.fillRect(0, halfH - 1, 3, 2);
  ctx.fillRect(stripWidthPx - 3, halfH - 1, 3, 2);

  return canvas.toDataURL();
}

export interface TargetBandCluster {
  id: string;
  avgSize: number | null; // in kDa or bp
  avgRf: number;          // 0..1
  medianPeakY: number;    // pixel
  matchingLanesCount: number;
  label: string;
}

export function computeTargetBandClusters(
  analysis: LaneAnalysisItem[],
  marginPct: number,
  ladderKind: 'protein' | 'dna',
  ladderSizes: number[] = [],
): TargetBandCluster[] {
  // Gather all detected bands across all lanes
  const allBands: {
    sizeEst: number | null;
    peakY: number;
    rf: number;
    laneId: string;
    net: number;
  }[] = [];

  for (const item of analysis) {
    const laneHeight = Math.max(1, (item.lane.y1 - item.lane.y0) || 100);
    for (const m of item.metrics) {
      const peakY = m.peakY ?? 0;
      const rf = peakY / laneHeight;
      allBands.push({
        sizeEst: typeof m.sizeEst === 'number' && m.sizeEst > 0 ? m.sizeEst : null,
        peakY,
        rf,
        laneId: item.lane.id,
        net: m.net,
      });
    }
  }

  const isCalibrated = allBands.some(b => b.sizeEst !== null);

  if (isCalibrated) {
    const validBands = allBands
      .filter((b): b is typeof b & { sizeEst: number } => b.sizeEst !== null)
      .sort((a, b) => b.sizeEst - a.sizeEst);

    const clusters: {
      sizes: number[];
      peakYs: number[];
      rfs: number[];
      laneIds: Set<string>;
    }[] = [];

    for (const b of validBands) {
      const matchedCluster = clusters.find(c => {
        const avg = c.sizes.reduce((sum, s) => sum + s, 0) / c.sizes.length;
        return Math.abs(b.sizeEst - avg) / avg <= marginPct / 100;
      });

      if (matchedCluster) {
        matchedCluster.sizes.push(b.sizeEst);
        matchedCluster.peakYs.push(b.peakY);
        matchedCluster.rfs.push(b.rf);
        matchedCluster.laneIds.add(b.laneId);
      } else {
        clusters.push({
          sizes: [b.sizeEst],
          peakYs: [b.peakY],
          rfs: [b.rf],
          laneIds: new Set([b.laneId]),
        });
      }
    }

    // Also include nominal ladder sizes if present and not near any cluster
    for (const lSize of ladderSizes) {
      const near = clusters.some(c => {
        const avg = c.sizes.reduce((sum, s) => sum + s, 0) / c.sizes.length;
        return Math.abs(lSize - avg) / avg <= marginPct / 100;
      });
      if (!near) {
        const matchingLanes = new Set<string>();
        const matchedPeakYs: number[] = [];
        const matchedRfs: number[] = [];
        for (const item of analysis) {
          const laneH = Math.max(1, (item.lane.y1 - item.lane.y0) || 100);
          for (const m of item.metrics) {
            if (m.sizeEst && Math.abs(m.sizeEst - lSize) / lSize <= marginPct / 100) {
              matchingLanes.add(item.lane.id);
              matchedPeakYs.push(m.peakY ?? 0);
              matchedRfs.push((m.peakY ?? 0) / laneH);
            }
          }
        }
        clusters.push({
          sizes: [lSize],
          peakYs: matchedPeakYs.length > 0 ? matchedPeakYs : [50],
          rfs: matchedRfs.length > 0 ? matchedRfs : [0.5],
          laneIds: matchingLanes,
        });
      }
    }

    clusters.sort((a, b) => {
      const avgA = a.sizes.reduce((s, x) => s + x, 0) / a.sizes.length;
      const avgB = b.sizes.reduce((s, x) => s + x, 0) / b.sizes.length;
      return avgB - avgA;
    });

    if (clusters.length === 0) {
      return [{
        id: 'target-default',
        avgSize: 50,
        avgRf: 0.5,
        medianPeakY: 50,
        matchingLanesCount: 0,
        label: `~50 ${ladderKind === 'protein' ? 'kDa' : 'bp'} (no bands detected)`,
      }];
    }

    return clusters.map((c, idx) => {
      const avgSize = c.sizes.reduce((s, x) => s + x, 0) / c.sizes.length;
      const avgRf = c.rfs.reduce((s, x) => s + x, 0) / c.rfs.length;
      const sortedYs = [...c.peakYs].sort((x, y) => x - y);
      const medianPeakY = sortedYs[Math.floor(sortedYs.length / 2)] ?? 50;
      const sizeStr = formatSize(avgSize, ladderKind);
      return {
        id: `target-${idx}-${Math.round(avgSize)}`,
        avgSize,
        avgRf,
        medianPeakY,
        matchingLanesCount: c.laneIds.size,
        label: `~${sizeStr} (${c.laneIds.size}/${analysis.length} lanes)`,
      };
    });
  } else {
    // Uncalibrated: cluster by relative migration Rf
    const sortedBands = [...allBands].sort((a, b) => a.rf - b.rf);
    const maxRfTol = Math.max(0.03, (marginPct / 100) * 0.45);

    const clusters: {
      peakYs: number[];
      rfs: number[];
      laneIds: Set<string>;
    }[] = [];

    for (const b of sortedBands) {
      const matchedCluster = clusters.find(c => {
        const avgRf = c.rfs.reduce((sum, s) => sum + s, 0) / c.rfs.length;
        return Math.abs(b.rf - avgRf) <= maxRfTol;
      });

      if (matchedCluster) {
        matchedCluster.peakYs.push(b.peakY);
        matchedCluster.rfs.push(b.rf);
        matchedCluster.laneIds.add(b.laneId);
      } else {
        clusters.push({
          peakYs: [b.peakY],
          rfs: [b.rf],
          laneIds: new Set([b.laneId]),
        });
      }
    }

    if (clusters.length === 0) {
      return [{
        id: 'target-default',
        avgSize: null,
        avgRf: 0.5,
        medianPeakY: 50,
        matchingLanesCount: 0,
        label: 'No bands detected',
      }];
    }

    return clusters.map((c, idx) => {
      const avgRf = c.rfs.reduce((s, x) => s + x, 0) / c.rfs.length;
      const sortedYs = [...c.peakYs].sort((x, y) => x - y);
      const medianPeakY = sortedYs[Math.floor(sortedYs.length / 2)] ?? 50;
      return {
        id: `target-rf-${idx}-${Math.round(avgRf * 1000)}`,
        avgSize: null,
        avgRf,
        medianPeakY,
        matchingLanesCount: c.laneIds.size,
        label: `Rf ${avgRf.toFixed(2)} (${c.laneIds.size}/${analysis.length} lanes)`,
      };
    });
  }
}

export function findTargetBandInLane(
  item: LaneAnalysisItem,
  targetSize: number | null,
  targetRf: number | null,
  marginPct: number,
): QuantBandMetric | null {
  if (!item.metrics || item.metrics.length === 0) return null;

  let bestMatch: QuantBandMetric | null = null;
  let minDiff = Infinity;

  const laneHeight = Math.max(1, (item.lane.y1 - item.lane.y0) || 100);

  for (const m of item.metrics) {
    if (targetSize !== null && typeof m.sizeEst === 'number' && m.sizeEst > 0) {
      const relDiff = Math.abs(m.sizeEst - targetSize) / targetSize;
      if (relDiff <= marginPct / 100 && relDiff < minDiff) {
        minDiff = relDiff;
        bestMatch = m;
      }
    } else if (targetRf !== null) {
      const bandRf = (m.peakY ?? 0) / laneHeight;
      const diffRf = Math.abs(bandRf - targetRf);
      const maxRfTol = Math.max(0.03, (marginPct / 100) * 0.45);
      if (diffRf <= maxRfTol && diffRf < minDiff) {
        minDiff = diffRf;
        bestMatch = m;
      }
    }
  }

  return bestMatch;
}

function BandQuantChart({
  analysis,
  ladderKind,
  laneLabels,
  selectedLaneId,
  onSelectLane,
  ladderLaneId,
  ladderSizes = [],
  loadingRefLaneId,
  onSetLoadingRefLane,
  initialMode = 'lane',
  plane,
  display,
}: {
  analysis: LaneAnalysisItem[];
  ladderKind: 'protein' | 'dna';
  laneLabels: Record<string, string>;
  selectedLaneId?: string;
  onSelectLane?: (laneId: string) => void;
  ladderLaneId?: string;
  ladderSizes?: number[];
  loadingRefLaneId?: string;
  onSetLoadingRefLane?: (laneId: string) => void;
  initialMode?: 'lane' | 'mass' | 'loading';
  /** Gel plane + display settings, used to render the whole-lane preview strips in WB (mass) mode. */
  plane?: Plane;
  display?: { minClip: number; maxClip: number; gamma: number; contrast: number; brightness: number; invert: boolean };
}) {
  const [chartMode, setChartMode] = useState<'lane' | 'mass' | 'loading'>(initialMode);
  const [selectedTargetId, setSelectedTargetId] = useState<string>('');
  const [detectionMarginPct, setDetectionMarginPct] = useState<number>(15);
  const [massRefLaneId, setMassRefLaneId] = useState<string>('');
  const [metric, setMetric] = useState<'net' | 'raw' | 'share'>('net');
  const [hoveredBar, setHoveredBar] = useState<{
    laneIdx: number;
    bandNum?: number;
    val: number;
    size?: string;
    share?: number;
    fold?: string;
    loadingRatio?: number;
    loadingDev?: number;
  } | null>(null);

  useEffect(() => {
    if (initialMode) setChartMode(initialMode);
  }, [initialMode]);

  const targetBandClusters = useMemo(() => {
    return computeTargetBandClusters(analysis, detectionMarginPct, ladderKind, ladderSizes);
  }, [analysis, detectionMarginPct, ladderKind, ladderSizes]);

  const activeTarget = useMemo<TargetBandCluster | null>(() => {
    if (targetBandClusters.length === 0) return null;
    if (selectedTargetId) {
      const found = targetBandClusters.find(c => c.id === selectedTargetId);
      if (found) return found;
    }
    // Default to the cluster that appears in the most lanes
    const sorted = [...targetBandClusters].sort((a, b) => b.matchingLanesCount - a.matchingLanesCount);
    return sorted[0] || targetBandClusters[0] || null;
  }, [targetBandClusters, selectedTargetId]);

  const matchedBandsPerLane = useMemo<Record<string, QuantBandMetric | null>>(() => {
    const map: Record<string, QuantBandMetric | null> = {};
    if (!activeTarget) return map;
    for (const item of analysis) {
      map[item.lane.id] = findTargetBandInLane(
        item,
        activeTarget.avgSize,
        activeTarget.avgRf,
        detectionMarginPct,
      );
    }
    return map;
  }, [analysis, activeTarget, detectionMarginPct]);

  // WB (mass) mode whole-lane strip previews, memoised per (plane, lanes, target band, display).
  const disp = display;
  const wbStripUrls = useMemo<Record<string, string>>(() => {
    const urls: Record<string, string> = {};
    if (chartMode !== 'mass' || !plane || !disp || !activeTarget) return urls;

    // Find median targetY across lanes that have this band detected
    const validTargetYs = analysis
      .map(a => matchedBandsPerLane[a.lane.id]?.peakY)
      .filter((y): y is number => typeof y === 'number' && Number.isFinite(y));
    const medianTargetY = validTargetYs.length > 0
      ? validTargetYs.slice().sort((a, b) => a - b)[Math.floor(validTargetYs.length / 2)]!
      : activeTarget.medianPeakY;

    for (const item of analysis) {
      const matched = matchedBandsPerLane[item.lane.id];
      const targetY = matched?.peakY !== undefined
        ? matched.peakY
        : medianTargetY;

      const url = westernBlotSliceDataUrl({
        plane,
        lane: item.lane,
        targetY,
        windowHeightPx: 96,
        stripWidthPx: 44,
        display: disp,
      });
      if (url) urls[item.lane.id] = url;
    }
    return urls;
  }, [chartMode, plane, analysis, activeTarget, matchedBandsPerLane, disp?.minClip, disp?.maxClip, disp?.gamma, disp?.contrast, disp?.brightness, disp?.invert]);

  if (analysis.length === 0) return null;

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

  // Compute maxVal based on mode
  const maxVal = Math.max(
    1,
    chartMode === 'loading'
      ? Math.max(...analysis.map(a => a.totalLaneSignal))
      : chartMode === 'mass'
        ? Math.max(1, ...analysis.map(a => getMetricVal(matchedBandsPerLane[a.lane.id] ?? undefined)))
        : Math.max(1, ...analysis.flatMap(a => a.metrics.map(getMetricVal)))
  );

  // Reference for fold-change in mass mode (defaults to first non-ladder lane with matched band)
  const defaultRefLane = (loadingRefLaneId ? analysis.find(a => a.lane.id === loadingRefLaneId) : null)
    || analysis.find(a => a.lane.id !== ladderLaneId && matchedBandsPerLane[a.lane.id] !== null)
    || analysis.find(a => matchedBandsPerLane[a.lane.id] !== null)
    || analysis[0];

  const activeRefLaneId = massRefLaneId && analysis.some(a => a.lane.id === massRefLaneId)
    ? massRefLaneId
    : (defaultRefLane?.lane.id || '');

  const refMetric = matchedBandsPerLane[activeRefLaneId];
  const refVal = refMetric ? getMetricVal(refMetric) : 0;

  // Reference for loading comparison
  const refLaneItem = (loadingRefLaneId ? analysis.find(a => a.lane.id === loadingRefLaneId) : null) || analysis[0];
  const refLaneSignal = refLaneItem?.totalLaneSignal || 1;

  // Mass legend bins
  const proteinMassBins = [
    { label: '>180', color: '#581c87' },
    { label: '130-180', color: '#7c3aed' },
    { label: '95-130', color: '#2563eb' },
    { label: '68-95', color: '#0284c7' },
    { label: '50-68', color: '#0d9488' },
    { label: '38-50', color: '#16a34a' },
    { label: '28-38', color: '#65a30d' },
    { label: '20-28', color: '#d97706' },
    { label: '14-20', color: '#ea580c' },
    { label: '<14 kDa', color: '#e11d48' },
  ];

  const dnaMassBins = [
    { label: '>8 kb', color: '#581c87' },
    { label: '5-8 kb', color: '#7c3aed' },
    { label: '3-5 kb', color: '#2563eb' },
    { label: '1.5-3 kb', color: '#0284c7' },
    { label: '1-1.5 kb', color: '#0d9488' },
    { label: '700-1k', color: '#16a34a' },
    { label: '400-700', color: '#65a30d' },
    { label: '200-400', color: '#d97706' },
    { label: '<200 bp', color: '#e11d48' },
  ];

  const legendBins = ladderKind === 'protein' ? proteinMassBins : dnaMassBins;

  return (
    <div class="rounded-xl border border-slate-200 p-4 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-900/40 space-y-3">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div class="flex flex-wrap items-center gap-2">
          <span class="text-xs font-bold text-slate-800 dark:text-slate-200">
            📊 Quantification &amp; Densitometry Chart
          </span>
          {/* Mode toggle */}
          <div class="flex rounded-lg border border-slate-200 dark:border-slate-700 p-0.5 bg-white dark:bg-slate-900 text-xs">
            <button
              type="button"
              onClick={() => setChartMode('lane')}
              class={`px-2.5 py-0.5 rounded font-medium transition ${chartMode === 'lane' ? 'bg-accent-600 text-white shadow-xs' : 'text-slate-600 dark:text-slate-400'}`}
            >
              Per Lane (Mass Color-Coded)
            </button>
            <button
              type="button"
              onClick={() => setChartMode('mass')}
              class={`px-2.5 py-0.5 rounded font-medium transition ${chartMode === 'mass' ? 'bg-accent-600 text-white shadow-xs' : 'text-slate-600 dark:text-slate-400'}`}
            >
              Per Target Mass (WB Mode)
            </button>
            <button
              type="button"
              onClick={() => setChartMode('loading')}
              class={`px-2.5 py-0.5 rounded font-medium transition ${chartMode === 'loading' ? 'bg-accent-600 text-white shadow-xs' : 'text-slate-600 dark:text-slate-400'}`}
            >
              🧪 Line Loading (Total / Ponceau)
            </button>
          </div>

          {chartMode === 'mass' && (
            <div class="flex flex-wrap items-center gap-2">
              <div class="flex items-center gap-1">
                <span class="text-[11px] text-slate-500 font-medium">Target:</span>
                <select
                  value={activeTarget?.id || ''}
                  onChange={(e) => setSelectedTargetId((e.target as HTMLSelectElement).value)}
                  class="text-xs px-2 py-0.5 rounded-lg border border-slate-300 dark:border-slate-700 dark:bg-slate-900 font-semibold max-w-[210px] truncate"
                  title="Target band to compare across all wells"
                >
                  {targetBandClusters.map(opt => (
                    <option key={opt.id} value={opt.id}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              <div class="flex items-center gap-1">
                <span class="text-[11px] text-slate-500 font-medium">Margin:</span>
                <select
                  value={String(detectionMarginPct)}
                  onChange={(e) => setDetectionMarginPct(parseInt((e.target as HTMLSelectElement).value) || 15)}
                  class="text-xs px-1.5 py-0.5 rounded-lg border border-slate-300 dark:border-slate-700 dark:bg-slate-900 font-mono font-medium"
                  title="Margin of detection / tolerance window for matching target band across lanes"
                >
                  <option value="5">±5% (Strict)</option>
                  <option value="10">±10%</option>
                  <option value="15">±15% (Std)</option>
                  <option value="20">±20%</option>
                  <option value="25">±25%</option>
                  <option value="30">±30% (Permissive)</option>
                </select>
              </div>

              <div class="flex items-center gap-1">
                <span class="text-[11px] text-slate-500 font-medium">Ref:</span>
                <select
                  value={activeRefLaneId}
                  onChange={(e) => setMassRefLaneId((e.target as HTMLSelectElement).value)}
                  class="text-xs px-1.5 py-0.5 rounded-lg border border-slate-300 dark:border-slate-700 dark:bg-slate-900 font-medium max-w-[130px] truncate"
                  title="Reference lane for relative fold change"
                >
                  {analysis.map((item, idx) => (
                    <option key={item.lane.id} value={item.lane.id}>
                      {laneLabels[item.lane.id] || `Lane ${idx + 1}`}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}
        </div>

        {chartMode !== 'loading' ? (
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
        ) : (
          <div class="flex items-center gap-2 text-xs">
            <span class="text-slate-500">Ref Loading Lane:</span>
            <select
              value={refLaneItem?.lane.id || ''}
              onChange={(e) => onSetLoadingRefLane?.((e.target as HTMLSelectElement).value)}
              class="px-2 py-0.5 rounded-lg border border-slate-300 dark:border-slate-700 dark:bg-slate-900 font-semibold text-xs"
            >
              {analysis.map((a, i) => (
                <option key={a.lane.id} value={a.lane.id}>
                  L{i + 1}: {laneLabels[a.lane.id] || `Lane ${i + 1}`}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Detail inspect bar */}
      <div class="min-h-[32px] flex items-center">
        {hoveredBar ? (
          <div class="text-xs text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-800 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 flex flex-wrap items-center gap-4 w-full shadow-2xs">
            <span>Lane: <strong>L{hoveredBar.laneIdx + 1}</strong></span>
            {hoveredBar.bandNum !== undefined && <span>Band: <strong>#{hoveredBar.bandNum}</strong></span>}
            {hoveredBar.size && <span>Est. MW: <strong class="text-accent-600 dark:text-accent-400">{hoveredBar.size}</strong></span>}
            <span>Value: <strong>{Math.round(hoveredBar.val).toLocaleString()} {chartMode === 'loading' ? 'Total OD · px' : (metric === 'share' ? '%' : 'OD')}</strong></span>
            {hoveredBar.fold && <span>Relative Fold: <strong class="text-emerald-600 dark:text-emerald-400">{hoveredBar.fold}</strong></span>}
            {hoveredBar.loadingRatio !== undefined && (
              <span>Loading Ratio: <strong class={Math.abs((hoveredBar.loadingRatio - 1) * 100) > 20 ? 'text-rose-600' : 'text-emerald-600'}>
                {hoveredBar.loadingRatio.toFixed(2)}× ({hoveredBar.loadingDev! > 0 ? `+${hoveredBar.loadingDev!.toFixed(1)}%` : `${hoveredBar.loadingDev!.toFixed(1)}%`})
              </strong></span>
            )}
          </div>
        ) : (
          <div class="text-xs text-slate-400 italic px-1">
            {chartMode === 'loading'
              ? 'Inspecting whole-lane total integrated protein signal to verify equal loading controls across lanes.'
              : 'Hover over any bar in the chart to inspect quantification details without layout shift.'}
          </div>
        )}
      </div>

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
                  {chartMode === 'loading' ? Math.round(labelVal).toLocaleString() : (metric === 'share' ? `${Math.round(labelVal)}%` : Math.round(labelVal).toLocaleString())}
                </text>
              </g>
            );
          })}

          {chartMode === 'loading' && (
            /* Reference lane horizontal guideline and ±15% equal loading corridor */
            (() => {
              const refY = padTop + innerH - (refLaneSignal / maxVal) * innerH;
              const topY = padTop + innerH - ((refLaneSignal * 1.15) / maxVal) * innerH;
              const botY = padTop + innerH - ((refLaneSignal * 0.85) / maxVal) * innerH;
              return (
                <g>
                  {/* Equal loading target corridor (±15%) */}
                  <rect
                    x={padLeft}
                    y={Math.max(padTop, topY)}
                    width={innerW}
                    height={Math.max(1, botY - topY)}
                    fill="rgba(16, 185, 129, 0.08)"
                  />
                  <line
                    x1={padLeft}
                    x2={chartW - padRight}
                    y1={refY}
                    y2={refY}
                    stroke="#10b981"
                    stroke-dasharray="4,3"
                    stroke-width="1.5"
                  />
                  <text
                    x={chartW - padRight - 4}
                    y={refY - 4}
                    font-size="8"
                    font-weight="bold"
                    text-anchor="end"
                    fill="#059669"
                  >
                    100% Target Ref Loading (±15% Equal Band)
                  </text>
                </g>
              );
            })()
          )}

          {chartMode === 'lane' ? (
            /* Multi-band columns per lane with mass color coding */
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
                    const laneH = item.lane.y1 - item.lane.y0 || 1;
                    const color = getMassColor(m.sizeEst, ladderKind, (m.peakY ?? 0) / laneH);
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
                          opacity={hoveredBar && hoveredBar.laneIdx === lIdx && hoveredBar.bandNum === bIdx + 1 ? 1 : 0.88}
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
          ) : chartMode === 'mass' ? (
            /* Target Mass mode (Western Blot cross-lane comparison) */
            analysis.map((item, lIdx) => {
              const groupW = innerW / Math.max(1, analysis.length);
              const groupX = padLeft + lIdx * groupW;
              const m = matchedBandsPerLane[item.lane.id];
              const val = getMetricVal(m ?? undefined);
              const barH = (val / maxVal) * innerH;
              const colW = Math.min(45, Math.max(14, groupW - 16));
              const barX = groupX + (groupW - colW) / 2;
              const barY = padTop + innerH - barH;
              const isSelectedLane = item.lane.id === selectedLaneId;
              const customLabel = laneLabels[item.lane.id] || `L${lIdx + 1}`;
              const foldStr = refVal > 0 && m ? `${(val / refVal).toFixed(2)}×` : '—';
              const szText = m?.sizeEst ? formatSize(m.sizeEst, ladderKind) : (activeTarget?.avgSize ? `~${formatSize(activeTarget.avgSize, ladderKind)}` : '');
              const barColor = getMassColor(m?.sizeEst ?? activeTarget?.avgSize, ladderKind);

              return (
                <g key={item.lane.id} onClick={() => onSelectLane?.(item.lane.id)} class="cursor-pointer">
                  {isSelectedLane && (
                    <rect x={groupX + 2} y={padTop} width={groupW - 4} height={innerH} fill="rgba(37, 99, 235, 0.08)" rx="4" />
                  )}
                  {m ? (
                    <g
                      onMouseEnter={() => setHoveredBar({ laneIdx: lIdx, bandNum: m.number, val, size: szText, share: m.share, fold: foldStr })}
                      onMouseLeave={() => setHoveredBar(null)}
                    >
                      <rect
                        x={barX}
                        y={barY}
                        width={colW}
                        height={Math.max(2, barH)}
                        fill={barColor}
                        rx="3"
                        opacity={hoveredBar && hoveredBar.laneIdx === lIdx ? 1 : 0.88}
                      />
                      {/* Fold change label on top of bar */}
                      <text
                        x={barX + colW / 2}
                        y={Math.max(padTop + 10, barY - 4)}
                        font-size="9"
                        font-weight="bold"
                        text-anchor="middle"
                        fill={barColor}
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
          ) : (
            /* Line Loading Comparison mode (Ponceau S / Total integrated signal per lane) */
            analysis.map((item, lIdx) => {
              const groupW = innerW / Math.max(1, analysis.length);
              const groupX = padLeft + lIdx * groupW;
              const val = item.totalLaneSignal;
              const barH = (val / maxVal) * innerH;
              const colW = Math.min(50, Math.max(16, groupW - 14));
              const barX = groupX + (groupW - colW) / 2;
              const barY = padTop + innerH - barH;
              const isSelectedLane = item.lane.id === selectedLaneId;
              const isRefLane = item.lane.id === refLaneItem?.lane.id;
              const customLabel = laneLabels[item.lane.id] || `L${lIdx + 1}`;
              const ratio = refLaneSignal > 0 ? val / refLaneSignal : 1;
              const devPct = (ratio - 1) * 100;
              const ratioStr = isRefLane ? '1.00× (Ref)' : `${ratio.toFixed(2)}×`;

              // Color coding by loading quality relative to reference lane
              const barColor = isRefLane
                ? '#10b981' // Green for reference
                : Math.abs(devPct) <= 15
                  ? '#059669' // Good loading (within 15%)
                  : Math.abs(devPct) <= 25
                    ? '#d97706' // Moderate deviation (15-25%)
                    : '#e11d48'; // High deviation (>25%)

              return (
                <g key={item.lane.id} onClick={() => onSelectLane?.(item.lane.id)} class="cursor-pointer">
                  {isSelectedLane && (
                    <rect x={groupX + 2} y={padTop} width={groupW - 4} height={innerH} fill="rgba(37, 99, 235, 0.08)" rx="4" />
                  )}
                  <g
                    onMouseEnter={() => setHoveredBar({ laneIdx: lIdx, val, loadingRatio: ratio, loadingDev: devPct })}
                    onMouseLeave={() => setHoveredBar(null)}
                  >
                    <rect
                      x={barX}
                      y={barY}
                      width={colW}
                      height={Math.max(2, barH)}
                      fill={barColor}
                      rx="3"
                      opacity={hoveredBar && hoveredBar.laneIdx === lIdx ? 1 : 0.88}
                    />
                    {/* Ratio on top */}
                    <text
                      x={barX + colW / 2}
                      y={Math.max(padTop + 10, barY - 4)}
                      font-size="8.5"
                      font-weight="bold"
                      text-anchor="middle"
                      fill={barColor}
                      font-family="monospace"
                    >
                      {ratioStr}
                    </text>
                  </g>
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

      {/* Western-blot (target mass) publication preview: each lane shown as an aligned vertical strip
          centered on the target band, with a dashed alignment guideline across all lanes. */}
      {chartMode === 'mass' && plane && display && (
        <div class="rounded-xl bg-slate-50 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 p-4 space-y-3">
          <div class="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 dark:border-slate-800 pb-2">
            <div class="flex items-center gap-2">
              <span class="px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-600 text-white">
                Western Blot Mode
              </span>
              <span class="text-xs font-bold text-slate-800 dark:text-slate-200">
                Target Mass Alignment &bull; {activeTarget?.label || 'Target Band'}
              </span>
            </div>
            <div class="flex items-center gap-2 text-[11px] text-slate-500 font-medium">
              <span class="inline-flex items-center gap-1.5">
                <span class="w-3 h-0.5 bg-emerald-500 inline-block"></span>
                Horizontally Aligned Center Line
              </span>
            </div>
          </div>

          <div class="relative overflow-x-auto py-2">
            {/* Dashed green horizontal alignment reference line running across all lane strips right through vertical center (y = 70px) */}
            <div class="absolute left-0 right-0 top-[70px] h-0 border-t border-dashed border-emerald-500/70 pointer-events-none z-10" />

            <div class="flex items-start gap-4 min-w-max">
              {analysis.map((item, lIdx) => {
                const strip = wbStripUrls[item.lane.id];
                const m = matchedBandsPerLane[item.lane.id];
                const sz = m?.sizeEst ? formatSize(m.sizeEst, ladderKind) : (activeTarget?.avgSize ? `~${formatSize(activeTarget.avgSize, ladderKind)}` : '');
                const label = laneLabels[item.lane.id] || `L${lIdx + 1}`;
                const val = m ? getMetricVal(m) : 0;
                const fold = refVal > 0 && val > 0 ? (val / refVal).toFixed(2) : undefined;
                const isSelected = item.lane.id === selectedLaneId;

                return (
                  <div
                    key={item.lane.id}
                    onClick={() => onSelectLane?.(item.lane.id)}
                    class={`flex flex-col items-center gap-1.5 p-2 rounded-xl transition cursor-pointer border ${isSelected ? 'border-accent-500 bg-white dark:bg-slate-800 shadow-sm ring-1 ring-accent-400' : 'border-slate-200/80 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-white/60 dark:bg-slate-900/60'}`}
                  >
                    <span class="text-xs font-mono font-bold text-slate-800 dark:text-slate-200">
                      {label}
                    </span>

                    {/* Vertical Publication Blot Strip */}
                    <div class="relative rounded-lg overflow-hidden border border-slate-300 dark:border-slate-700 shadow-2xs">
                      <img
                        src={strip ?? undefined}
                        alt={`${label} target band`}
                        class="w-11 h-24 object-cover block"
                      />
                    </div>

                    <div class="text-center space-y-0.5">
                      <span class="block text-[11px] font-mono font-bold text-accent-700 dark:text-accent-300">
                        {sz || '—'}
                      </span>
                      {val > 0 ? (
                        <span class="inline-block px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300">
                          {fold ? `${fold}×` : `${Math.round(val)} OD`}
                        </span>
                      ) : (
                        <span class="inline-block px-1.5 py-0.5 rounded text-[10px] font-mono text-slate-400 bg-slate-100 dark:bg-slate-800">
                          n/d
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Mass color scale legend */}
      {chartMode === 'lane' && (
        <div class="flex flex-wrap items-center gap-2 pt-1 border-t border-slate-200/60 dark:border-slate-800/60 text-[11px]">
          <span class="font-semibold text-slate-500 shrink-0">Mass Color Coding:</span>
          <div class="flex flex-wrap items-center gap-1.5">
            {legendBins.map(bin => (
              <span key={bin.label} class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[10px]">
                <span class="w-2.5 h-2.5 rounded-xs" style={{ backgroundColor: bin.color }}></span>
                <span class="font-mono font-medium text-slate-600 dark:text-slate-300">{bin.label}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Loading overview note */}
      {chartMode === 'loading' && (
        <div class="rounded-lg bg-emerald-50/70 p-2.5 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800 text-xs text-emerald-900 dark:text-emerald-200 flex flex-wrap items-center justify-between gap-2">
          <span>
            💡 <strong>Line Loading Analysis:</strong> Integrated optical density across each lane profile (baseline-subtracted). Green bars indicate uniform loading (within ±15% of reference), amber indicates moderate variance, and red indicates significant loading discrepancy.
          </span>
          <span class="font-mono font-bold">
            Ref: L{analysis.findIndex(a => a.lane.id === refLaneItem?.lane.id) + 1} (1.00×)
          </span>
        </div>
      )}
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

  // Keep the MW-calibration ladder lane valid. Lanes are regenerated (new ids) by load, crop,
  // rotate/flip, deskew and auto-align — after which the stored ladderLaneId points at a lane that
  // no longer exists, so `calibration` returns null and every size label freezes. When that happens,
  // fall back to the first lane so the calibration recomputes instead of going stale. On first load
  // this also auto-assigns lane 1 as the ladder, which is why sizes appear "set immediately".
  useEffect(() => {
    if (lanes.length === 0) return;
    const valid = lanes.some((l) => l.id === s.ladderLaneId);
    if (!valid) set({ ladderLaneId: lanes[0]!.id });
  }, [lanes, s.ladderLaneId]);
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
    fixedX?: number;
  } | null>(null);
  const hasDraggedRef = useRef<boolean>(false);
  const [canvasCursor, setCanvasCursor] = useState<string>('default');
  const [quantLayoutMode, setQuantLayoutMode] = useState<'cards' | 'table'>('table');

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const printCanvasRef = useRef<HTMLCanvasElement>(null);
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
    // Clean slate: drop any band annotations / reference from a previous gel.
    setBandMap({});
    set({ refBandId: '' });
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
      // Clean slate: a newly loaded gel starts with no band annotations or reference.
      set({ refBandId: '' });
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
    set({ refBandId: '' });
    setCustomMassMap({});
    // Disabled automatic lane detection after modification: use clean equal lanes
    const laneCount = Math.max(1, lanes.length || 5);
    const newLanes = equalLanes(laneCount, { x: 0, y: 0, w: rotated.width, h: rotated.height });
    setLanes(newLanes);
    if (newLanes.length > 0) {
      setSelectedLaneId(newLanes[0]!.id);
      set({ ladderLaneId: newLanes[0]!.id });
    }
  }

  function applyFlip(horizontal: boolean) {
    if (!plane) return;
    const g: Geometry = { rotation: 0, flipH: horizontal, flipV: !horizontal };
    const flipped = transformPlane(plane, g);
    setBasePlane(flipped);
    setPlane(flipped);
    setDeskewAngle(0);
    setBandMap({});
    set({ refBandId: '' });
    setCustomMassMap({});
    // Disabled automatic lane detection after modification: use clean equal lanes
    const laneCount = Math.max(1, lanes.length || 5);
    const newLanes = equalLanes(laneCount, { x: 0, y: 0, w: flipped.width, h: flipped.height });
    setLanes(newLanes);
    if (newLanes.length > 0) {
      setSelectedLaneId(newLanes[0]!.id);
      set({ ladderLaneId: newLanes[0]!.id });
    }
  }

  function handleDeskewChange(angle: number) {
    if (!basePlane) return;
    setDeskewAngle(angle);
    const g: Geometry = { rotation: angle, flipH: false, flipV: false };
    const transformed = transformPlane(basePlane, g);
    setPlane(transformed);
    // Disabled automatic lane detection on deskew: keep user's lanes intact
  }

  function handleApplyCrop() {
    if (!plane || !cropBox || cropBox.w < 10 || cropBox.h < 10) return;
    const cb = cropBox;
    const cropped = transformPlane(plane, { rotation: 0, flipH: false, flipV: false, crop: cb });
    setBasePlane(cropped);
    setPlane(cropped);
    setDeskewAngle(0);
    setIsCropping(false);
    setCropBox(null);
    setBandMap({});
    set({ refBandId: '' });
    setCustomMassMap({});
    // Transform existing lanes by offsetting to the new crop boundaries
    const croppedLanes = lanes
      .map(l => ({
        ...l,
        x: l.x - cb.x,
        y0: Math.max(0, l.y0 - cb.y),
        y1: Math.min(cropped.height, l.y1 - cb.y),
      }))
      .filter(l => l.x >= 0 && l.x <= cropped.width && l.y1 > l.y0 + 10);
    const resolvedLanes = croppedLanes.length > 0
      ? croppedLanes
      : equalLanes(Math.max(1, lanes.length || 5), { x: 0, y: 0, w: cropped.width, h: cropped.height });
    setLanes(resolvedLanes);
    if (resolvedLanes.length > 0) {
      setSelectedLaneId(resolvedLanes[0]!.id);
      set({ ladderLaneId: resolvedLanes[0]!.id });
    }
  }

  function handleResetAllTransforms() {
    if (!originalPlane) return;
    setBasePlane(originalPlane);
    setPlane(originalPlane);
    setDeskewAngle(0);
    setIsCropping(false);
    setCropBox(null);
    setBandMap({});
    set({ refBandId: '' });
    setCustomMassMap({});
    // Reset to clean equal lanes without autoLanes
    const eq = equalLanes(Math.max(1, lanes.length || 5), { x: 0, y: 0, w: originalPlane.width, h: originalPlane.height });
    setLanes(eq);
    if (eq.length > 0) {
      setSelectedLaneId(eq[0]!.id);
      set({ ladderLaneId: eq[0]!.id });
    }
  }

  function handleApplySuggestion() {
    if (!cropSuggestion || !basePlane) return;
    const { rotation, crop } = cropSuggestion;
    setDeskewAngle(rotation);
    const rotated = transformPlane(basePlane, {
      rotation,
      flipH: false,
      flipV: false,
    });
    const cropped = transformPlane(rotated, {
      rotation: 0,
      flipH: false,
      flipV: false,
      crop,
    });
    setBasePlane(cropped);
    setPlane(cropped);
    setDeskewAngle(0);
    setIsCropping(false);
    setCropBox(null);
    setBandMap({});
    set({ refBandId: '' });
    setCustomMassMap({});
    const resolvedLanes = equalLanes(Math.max(1, lanes.length || 5), { x: 0, y: 0, w: cropped.width, h: cropped.height });
    setLanes(resolvedLanes);
    if (resolvedLanes.length > 0) {
      setSelectedLaneId(resolvedLanes[0]!.id);
      set({ ladderLaneId: resolvedLanes[0]!.id });
    }
  }

  function handleGridFromPlaced() {
    if (!plane || lanes.length < 2) return;
    const ladderIdx = lanes.findIndex(l => l.id === s.ladderLaneId);
    const loadingRefIdx = s.loadingRefLaneId ? lanes.findIndex(l => l.id === s.loadingRefLaneId) : -1;
    const massLaneIdx = s.massLaneId ? lanes.findIndex(l => l.id === s.massLaneId) : -1;
    const generated = gridLanesFromPlaced(lanes, plane, s.polarity, { totalLanes: numLanesInput });
    setLanes(generated);
    if (generated.length > 0) {
      if (!generated.some(l => l.id === selectedLaneId)) {
        setSelectedLaneId(generated[0]!.id);
      }
      const keepLadderIdx = ladderIdx >= 0 && ladderIdx < generated.length ? ladderIdx : 0;
      set({
        ladderLaneId: generated[keepLadderIdx]!.id,
        loadingRefLaneId: loadingRefIdx >= 0 && loadingRefIdx < generated.length ? generated[loadingRefIdx]!.id : '',
        massLaneId: massLaneIdx >= 0 && massLaneIdx < generated.length ? generated[massLaneIdx]!.id : '',
      });
    }
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

  // Effective ladder lane: robust fallback so calibration never breaks if ladderLaneId is unset
  const effectiveLadderLaneId = useMemo(() => {
    if (s.ladderLaneId && lanes.some(l => l.id === s.ladderLaneId)) return s.ladderLaneId;
    return lanes[0]?.id || '';
  }, [s.ladderLaneId, lanes]);

  // Calibration from ladder lane
  const calibration: Calibration | null = useMemo(() => {
    if (!plane || !effectiveLadderLaneId) return null;
    const ladderLane = lanes.find(l => l.id === effectiveLadderLaneId);
    if (!ladderLane) return null;

    try {
      const dens = sampleLane(plane, ladderLane, s.polarity);
      const prof = laneProfile(dens);
      const bands = bandMap[ladderLane.id] || toBands(detectBands(prof, { minProminence: s.prominence }));
      if (bands.length < 2) return null;

      const sortedBands = [...bands].sort((a, b) => (a.peakY ?? 0) - (b.peakY ?? 0));
      const sortedSizes = [...activeLadder.sizes].sort((a, b) => b - a);

      const pairs: CalibrationPoint[] = [];
      for (let i = 0; i < Math.min(sortedBands.length, sortedSizes.length); i++) {
        const b = sortedBands[i]!;
        const y = b.peakY ?? (b.y0 + b.y1) / 2;
        if (pairs.length === 0 || y > pairs[pairs.length - 1]!.y + 0.1) {
          pairs.push({ y, size: sortedSizes[i]! });
        }
      }

      if (pairs.length < 2) return null;
      return fitCalibration(pairs, s.calibMethod);
    } catch {
      return null;
    }
  }, [plane, lanes, effectiveLadderLaneId, bandMap, s.prominence, s.polarity, activeLadder, s.calibMethod]);

  // Densitometric Mass Calibration
  const [customMassMap, setCustomMassMap] = useState<Record<string, number>>({});

  const massCalibration: MassCalibration | null = useMemo(() => {
    if (!plane || !s.massLaneId) return null;
    const massLane = lanes.find(l => l.id === s.massLaneId);
    if (!massLane) return null;

    try {
      const dens = sampleLane(plane, massLane, s.polarity);
      const prof = laneProfile(dens);
      const bands = bandMap[massLane.id] || toBands(detectBands(prof, { minProminence: s.prominence }));
      if (bands.length === 0) return null;

      let sharedBase: Float32Array | null = null;
      if (s.bgMethod === 'shared' && lanes.length > 0) {
        try {
          const allProfs = lanes.map(lane => laneProfile(sampleLane(plane, lane, s.polarity)));
          sharedBase = sharedCrossLaneBaseline(allProfs, s.rollingRadius);
        } catch {
          sharedBase = null;
        }
      }

      const baseline = baselineFor(s.bgMethod, prof, {
        radius: s.rollingRadius,
        bands,
        sharedBaseline: sharedBase ?? undefined,
      });
      const metrics = quantifyBands(dens, bands, baseline);
      const sortedMetrics = [...metrics].sort((a, b) => (a.peakY ?? 0) - (b.peakY ?? 0));

      const preset = MASS_STANDARD_PRESETS.find(p => p.id === s.massPresetId) || MASS_STANDARD_PRESETS[0]!;
      const pts: MassCalibrationPoint[] = [];

      for (let i = 0; i < sortedMetrics.length; i++) {
        const m = sortedMetrics[i]!;
        const known = customMassMap[m.bandId] ?? preset.masses[i] ?? Math.round(1000 / Math.pow(2, i));
        if (known > 0 && m.net > 0) {
          pts.push({
            bandId: m.bandId,
            laneId: massLane.id,
            laneIdx: lanes.findIndex(l => l.id === massLane.id),
            netIntensity: m.net,
            knownMass: known,
            unit: preset.unit,
          });
        }
      }

      const minPts = s.massCalibMethod === 'quadratic' ? 3 : s.massCalibMethod === 'linear_zero' ? 1 : 2;
      if (pts.length < minPts) return null;

      return fitMassCalibration(pts, s.massCalibMethod, preset.unit);
    } catch {
      return null;
    }
  }, [plane, lanes, s.massLaneId, bandMap, s.prominence, s.polarity, s.bgMethod, s.rollingRadius, s.massCalibMethod, s.massPresetId, customMassMap]);

  // Comprehensive analysis across ALL lanes with uniform baseline and loading comparison
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

    const rawLanes = lanes.map((lane, laneIdx) => {
      try {
        const dens = sampleLane(plane, lane, s.polarity);
        const prof = laneProfile(dens);
        const bands = bandMap[lane.id] || toBands(detectBands(prof, { minProminence: s.prominence }));

        // Uniform background baseline across entire lane profile
        const baseline = baselineFor(s.bgMethod, prof, {
          radius: s.rollingRadius,
          bands,
          sharedBaseline: sharedBase ?? undefined,
        });

        const netProfile = Float32Array.from(prof, (v, i) => Math.max(0, v - (baseline[i] ?? 0)));
        const totalLaneSignal = integrateLaneSignal(prof, baseline, lane.width);
        const metrics = quantifyBands(dens, bands, baseline);
        const totalNet = metrics.reduce((acc, m) => acc + Math.max(0, m.net), 0);
        const totalBandsSignal = totalNet;

        const refBand = metrics.find(m => m.bandId === s.refBandId);
        const refNet = refBand && refBand.net > 0 ? refBand.net : (metrics[0]?.net ?? 1);

        const ladderLane = lanes.find(l => l.id === effectiveLadderLaneId);
        const ladderTop = ladderLane?.y0 ?? 0;
        const isLadderLane = lane.id === effectiveLadderLaneId;
        const sortedLadderSizes = [...activeLadder.sizes].sort((a, b) => b - a);

        const enriched = metrics.map((m, i) => {
          const share = totalNet > 0 ? (Math.max(0, m.net) / totalNet) * 100 : 0;
          const ratio = refNet > 0 ? Math.max(0, m.net) / refNet : 1;
          const peakY = m.peakY ?? 0;
          const effMigrationY = (lane.y0 ?? 0) + peakY - ladderTop;
          const nominalLadderSize = (isLadderLane && i < sortedLadderSizes.length) ? sortedLadderSizes[i]! : null;
          const sizeEst = nominalLadderSize ?? (calibration ? calibration.sizeAt(effMigrationY) : null);
          const massEst = massCalibration && m.net > 0 ? massCalibration.massAt(m.net) : null;
          return { ...m, number: i + 1, share, ratio, sizeEst, massEst };
        });

        return {
          lane,
          laneIdx,
          profile: prof,
          baseline,
          netProfile,
          metrics: enriched,
          totalNet,
          totalBandsSignal,
          totalLaneSignal,
          loadingRatio: 1,
          loadingDeviationPct: 0,
          normFactor: 1,
        };
      } catch {
        return {
          lane,
          laneIdx,
          profile: new Float32Array(0),
          baseline: new Float32Array(0),
          netProfile: new Float32Array(0),
          metrics: [],
          totalNet: 0,
          totalBandsSignal: 0,
          totalLaneSignal: 0,
          loadingRatio: 1,
          loadingDeviationPct: 0,
          normFactor: 1,
        };
      }
    });

    // Compute relative loading comparisons against reference lane
    const refItem = (s.loadingRefLaneId ? rawLanes.find(l => l.lane.id === s.loadingRefLaneId) : null) || rawLanes[0];
    const refTotal = refItem && refItem.totalLaneSignal > 0 ? refItem.totalLaneSignal : 1;

    return rawLanes.map(item => {
      const loadingRatio = refTotal > 0 ? item.totalLaneSignal / refTotal : 1;
      const loadingDeviationPct = (loadingRatio - 1) * 100;
      const normFactor = item.totalLaneSignal > 0 ? refTotal / item.totalLaneSignal : 1;
      return {
        ...item,
        loadingRatio,
        loadingDeviationPct,
        normFactor,
      };
    });
  }, [plane, lanes, bandMap, s.polarity, s.bgMethod, s.rollingRadius, s.prominence, s.refBandId, s.loadingRefLaneId, calibration, massCalibration, effectiveLadderLaneId, activeLadder]);

  const selectedLane = useMemo(() => lanes.find(l => l.id === selectedLaneId) || lanes[0] || null, [lanes, selectedLaneId]);
  const selectedLaneIdx = useMemo(() => lanes.findIndex(l => l.id === selectedLane?.id), [lanes, selectedLane]);
  const laneAnalysis = useMemo(() => allLanesAnalysis.find(a => a.lane.id === selectedLane?.id) || null, [allLanesAnalysis, selectedLane]);

  // Whole-lane loading comparison statistics across all lanes
  const loadingStats = useMemo(() => {
    const valid = allLanesAnalysis.filter(a => a.totalLaneSignal > 0);
    if (valid.length === 0) return { mean: 0, stdDev: 0, cvPct: 0, min: 0, max: 0 };
    const mean = valid.reduce((acc, a) => acc + a.totalLaneSignal, 0) / valid.length;
    const variance = valid.reduce((acc, a) => acc + Math.pow(a.totalLaneSignal - mean, 2), 0) / valid.length;
    const stdDev = Math.sqrt(variance);
    const cvPct = mean > 0 ? (stdDev / mean) * 100 : 0;
    const min = Math.min(...valid.map(a => a.totalLaneSignal));
    const max = Math.max(...valid.map(a => a.totalLaneSignal));
    return { mean, stdDev, cvPct, min, max };
  }, [allLanesAnalysis]);

  // AI suggestion for automatic gel crop and tilt angle
  const cropSuggestion = useMemo(() => {
    if (!plane) return null;
    return suggestGelCropAndTilt(plane, s.polarity);
  }, [plane, s.polarity]);

  // Helper to render extracted lane slice with min/max contrast clipping & display adjustments
  function getLaneStripDataUrl(l: Lane | null, width = 440, height = 38): string | null {
    if (!plane || !l) return null;
    const offscreen = document.createElement('canvas');
    offscreen.width = width;
    offscreen.height = height;
    const ctx = offscreen.getContext('2d');
    if (!ctx) return null;

    const imgData = ctx.createImageData(width, height);
    const data = imgData.data;

    const laneY0 = l.y0;
    const laneY1 = l.y1;
    const laneLen = Math.max(1, laneY1 - laneY0);
    const halfW = l.width / 2;

    const minC = s.minClip ?? 0;
    const maxC = s.maxClip ?? 1;
    const gamma = s.gamma ?? 1;
    const clipRange = Math.max(0.01, maxC - minC);

    for (let c = 0; c < width; c++) {
      const t = c / (width - 1);
      const curY = laneY0 + t * laneLen;
      const curCenterX = l.x + t * l.tilt;

      for (let r = 0; r < height; r++) {
        const v = (r / (height - 1) - 0.5) * 2;
        const curX = curCenterX + v * halfW;

        const gx = Math.max(0, Math.min(plane.width - 1, Math.round(curX)));
        const gy = Math.max(0, Math.min(plane.height - 1, Math.round(curY)));
        const rawVal = plane.data[gy * plane.width + gx] ?? 0;

        // Display adjustments (visualization only, does not alter raw signal integration)
        let adj = Math.max(0, Math.min(1, (rawVal - minC) / clipRange));
        if (gamma !== 1) adj = Math.pow(adj, 1 / gamma);
        adj = (adj - 0.5) * s.contrast + 0.5;
        adj = adj * s.brightness;
        if (s.invertDisplay) adj = 1 - adj;
        adj = Math.max(0, Math.min(1, adj));

        const gray = Math.round(adj * 255);
        const pIdx = (r * width + c) * 4;
        data[pIdx] = gray;
        data[pIdx + 1] = gray;
        data[pIdx + 2] = gray;
        data[pIdx + 3] = 255;
      }
    }

    ctx.putImageData(imgData, 0, 0);
    return offscreen.toDataURL();
  }

  // Sampled horizontal slice of the selected lane matching the profile x-axis (440px)
  const laneStripDataUrl = useMemo(() => {
    return getLaneStripDataUrl(selectedLane, 440, 38);
  }, [plane, selectedLane, s.brightness, s.contrast, s.invertDisplay, s.minClip, s.maxClip, s.gamma]);

  function removePeakFromLane(laneId: string, bandId: string) {
    const laneItem = allLanesAnalysis.find(a => a.lane.id === laneId);
    if (!laneItem) return;
    const currentBands = bandMap[laneId] || laneItem.metrics.map((m, i) => {
      const py = m.peakY ?? 0;
      return {
        id: m.bandId || `b-${Math.round(py)}-${i}`,
        y0: m.y0 ?? Math.max(0, py - 5),
        y1: m.y1 ?? py + 5,
        peakY: py,
      };
    });
    const updated = currentBands.filter(b => b.id !== bandId);
    setBandMap(prev => ({ ...prev, [laneId]: updated }));
    if (s.refBandId === bandId) {
      set({ refBandId: '' });
    }
  }

  /**
   * Add or move a band at a lane-relative position `relTarget` (0 at the lane top → laneLen at the
   * bottom), auto-fitting it to the real peak. Band peakY/y0/y1 are stored lane-relative, matching
   * detectBands/toBands and the profile card. With `moveId` the band with that id is repositioned
   * (width re-derived from the profile); without it a fresh band is inserted. If a detected peak
   * sits near `relTarget` the band snaps to it; otherwise it keeps a small default width.
   */
  function placeBandAt(laneId: string, relTarget: number, moveId?: string) {
    if (!plane) return;
    const lane = lanes.find(l => l.id === laneId);
    if (!lane) return;
    const laneLen = Math.max(1, lane.y1 - lane.y0);
    const rel = Math.max(0, Math.min(laneLen, relTarget));
    let peakY = Math.round(rel);
    let y0 = Math.max(0, peakY - 8);
    let y1 = Math.min(laneLen, peakY + 8);
    try {
      const prof = laneProfile(sampleLane(plane, lane, s.polarity));
      const fit = refitBandNear(prof, rel, 14, { minProminence: s.prominence });
      if (fit) { peakY = Math.round(fit.index); y0 = Math.round(fit.y0); y1 = Math.round(fit.y1); }
    } catch { /* keep the default width if profile sampling fails */ }

    const laneItem = allLanesAnalysis.find(a => a.lane.id === laneId);
    const currentBands = bandMap[laneId] || (laneItem?.metrics.map((m, i) => ({
      id: m.bandId || `b-${Math.round(m.peakY ?? 0)}-${i}`,
      y0: m.y0 ?? Math.max(0, (m.peakY ?? 0) - 5),
      y1: m.y1 ?? (m.peakY ?? 0) + 5,
      peakY: m.peakY ?? 0,
    })) || []);

    const updated = moveId
      ? currentBands.map(b => (b.id === moveId ? { ...b, peakY, y0, y1 } : b))
      : [...currentBands.filter(b => Math.abs((b.peakY ?? 0) - peakY) > 2), {
          id: `band-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          peakY, y0, y1,
        }];
    setBandMap(prev => ({ ...prev, [laneId]: updated.sort((a, b) => (a.peakY ?? 0) - (b.peakY ?? 0)) }));
  }

  /** Re-run band detection on the selected lane (replaces the current band set). */
  function handleAutoFindBands() {
    if (!selectedLane || !plane) return;
    const prof = laneProfile(sampleLane(plane, selectedLane, s.polarity));
    const peaks = detectBands(prof, { minProminence: s.prominence });
    setBandMap(prev => ({
      ...prev,
      [selectedLane.id]: toBands(peaks).sort((a, b) => (a.peakY ?? 0) - (b.peakY ?? 0)),
    }));
  }

  // Click on Profile SVG (curve or physical lane strip) to add/select/remove bands
  function handleProfileSvgClick(e: MouseEvent) {
    if (!selectedLane || !plane) return;
    const svg = (e.currentTarget as SVGSVGElement);
    const rect = svg.getBoundingClientRect();
    const xRatio = (e.clientX - rect.left) / rect.width;
    const yRatio = (e.clientY - rect.top) / rect.height;
    // viewBox is "0 0 500 280" — map client Y by the viewBox height (was 320, which offset every click).
    const svgX = xRatio * 500;
    const svgY = yRatio * 280;

    // Interactive band area: x in [40, 480], y in [15, 195] (the curve region above the lane strip).
    if (svgX >= 38 && svgX <= 482 && svgY >= 15 && svgY <= 195) {
      const frac = Math.max(0, Math.min(1, (svgX - 40) / 440));
      const laneLen = selectedLane.y1 - selectedLane.y0;
      const relTarget = frac * laneLen; // lane-relative (0 = top, laneLen = bottom)

      const currentBands = bandMap[selectedLane.id] || (laneAnalysis?.metrics.map(m => ({
        id: m.bandId,
        y0: Math.max(0, (m.peakY ?? relTarget) - 8),
        y1: (m.peakY ?? relTarget) + 8,
        peakY: m.peakY ?? relTarget,
      })) || []);
      const existing = currentBands.find(b => Math.abs((b.peakY ?? 0) - relTarget) <= 8);

      // Ctrl/Cmd/Alt + click: remove the band (matches the ✕ badge and table).
      if (e.ctrlKey || e.metaKey || e.altKey) {
        if (existing) removePeakFromLane(selectedLane.id, existing.id);
        return;
      }
      // Shift + click: always ADD a new band at this position (auto-fitted to the nearest peak).
      if (e.shiftKey) {
        placeBandAt(selectedLane.id, relTarget);
        return;
      }
      // Plain click: if on a band, MOVE it here (auto-fit to the real peak); otherwise ADD one.
      if (existing) {
        placeBandAt(selectedLane.id, relTarget, existing.id);
      } else {
        placeBandAt(selectedLane.id, relTarget);
      }
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
    const minC = s.minClip ?? 0;
    const maxC = s.maxClip ?? 1;
    const gamma = s.gamma ?? 1;
    const clipRange = Math.max(0.01, maxC - minC);

    for (let i = 0; i < raw.length; i++) {
      let val = raw[i]!;
      // Contrast clipping (visualization only, unclipped data used for densitometry)
      val = Math.max(0, Math.min(1, (val - minC) / clipRange));
      if (gamma !== 1) val = Math.pow(val, 1 / gamma);
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
          const drawY = (l.y0 ?? 0) + band.peakY;
          const isRef = band.bandId === s.refBandId || (band as { id?: string }).id === s.refBandId;
          ctx.strokeStyle = isRef ? '#10b981' : isSelected ? '#2563eb' : isLadder ? '#d97706' : '#94a3b8';
          ctx.lineWidth = isRef ? 2.5 : isSelected ? 2 : 1.5;
          ctx.setLineDash([]);
          ctx.beginPath();
          ctx.moveTo(l.x - half, drawY);
          ctx.lineTo(l.x + half, drawY);
          ctx.stroke();

          // Band peak handle dot
          ctx.fillStyle = isRef ? '#10b981' : isSelected ? '#2563eb' : '#64748b';
          ctx.beginPath();
          ctx.arc(l.x, drawY, isRef ? 3.5 : isSelected ? 3 : 2, 0, 2 * Math.PI);
          ctx.fill();

          // If this is the active reference band, show a neat [Ref] tag
          if (isRef) {
            ctx.font = 'bold 9px sans-serif';
            ctx.fillStyle = '#10b981';
            ctx.fillText('Ref', l.x - half - 20, drawY + 3);
          }

          // MW annotation text if calibrated
          if (showMwLabels && calibration) {
            const sz = band.sizeEst;
            if (sz !== null) {
              const text = formatSize(sz, activeLadder.kind);
              ctx.font = 'bold 10px sans-serif';
              ctx.fillStyle = isRef ? 'rgba(6, 78, 59, 0.85)' : 'rgba(0, 0, 0, 0.75)';
              const txtW = ctx.measureText(text).width;
              ctx.fillRect(l.x + half + 2, drawY - 7, txtW + 4, 14);
              ctx.fillStyle = '#ffffff';
              ctx.fillText(text, l.x + half + 4, drawY + 4);
            }
          }

          // Mass annotation text if calibrated
          if (s.showMassLabels && massCalibration) {
            const ms = band.massEst;
            if (ms !== null) {
              const text = formatMass(ms, massCalibration.unit);
              ctx.font = 'bold 9px sans-serif';
              ctx.fillStyle = 'rgba(5, 150, 105, 0.85)';
              const txtW = ctx.measureText(text).width;
              ctx.fillRect(l.x - half - txtW - 6, drawY - 7, txtW + 4, 14);
              ctx.fillStyle = '#ffffff';
              ctx.fillText(text, l.x - half - txtW - 4, drawY + 4);
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
  }, [plane, lanes, selectedLane, allLanesAnalysis, s.brightness, s.contrast, s.invertDisplay, s.minClip, s.maxClip, s.gamma, s.ladderLaneId, calibration, activeLadder, isCropping, cropBox, laneLabels, showMwLabels, showLaneHeaders, s.viewTab]);

  // Print root mirror: identical render into the print-only canvas (PDF export via print stylesheet).
  // Runs exactly when the on-screen canvas is redrawn — never on unrelated re-renders.
  useEffect(() => {
    const src = canvasRef.current;
    const dst = printCanvasRef.current;
    if (!src || !dst || !plane) return;
    dst.width = src.width;
    dst.height = src.height;
    const ctx = dst.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(src, 0, 0);
  }, [plane, lanes, selectedLane, allLanesAnalysis, s.brightness, s.contrast, s.invertDisplay, s.minClip, s.maxClip, s.gamma, s.ladderLaneId, calibration, activeLadder, isCropping, cropBox, laneLabels, showMwLabels, showLaneHeaders]);

  // Mouse Interaction: Shift-click to add line, narrow border hitbox to resize, whole body to move
  function handleMouseDown(e: MouseEvent) {
    const coords = getCanvasCoords(e);
    hasDraggedRef.current = false;

    if (isCropping) {
      cropStartRef.current = coords;
      setCropBox({ x: coords.x, y: coords.y, w: 0, h: 0 });
      return;
    }

    // Shift+Click on canvas: quick lane (line) placement!
    if (e.shiftKey && plane) {
      hasDraggedRef.current = true;
      const defaultWidth = lanes.length > 0
        ? Math.round(lanes.reduce((acc, l) => acc + l.width, 0) / lanes.length)
        : 26;
      const y0 = lanes.length > 0 ? lanes[0]!.y0 : Math.round(plane.height * 0.05);
      const y1 = lanes.length > 0 ? lanes[0]!.y1 : Math.round(plane.height * 0.95);
      const newLane: Lane = {
        id: `lane-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        x: Math.round(coords.x),
        y0,
        y1,
        width: defaultWidth,
        tilt: lanes.length > 0 ? lanes[0]!.tilt : 0,
      };
      const nextLanes = [...lanes, newLane].sort((a, b) => a.x - b.x);
      setLanes(nextLanes);
      setSelectedLaneId(newLane.id);
      return;
    }

    // Check if mouse is on a lane border (resize) or lane center/body/header (move)
    for (const lane of lanes) {
      const half = lane.width / 2;
      const leftBorder = lane.x - half;
      const rightBorder = lane.x + half;
      const inY = coords.y >= Math.min(lane.y0, lane.y1) - 20 && coords.y <= Math.max(lane.y0, lane.y1);

      if (inY) {
        // Dedicated header badge move handle (above lane.y0)
        if (coords.y < Math.min(lane.y0, lane.y1) && Math.abs(coords.x - lane.x) <= Math.max(20, half)) {
          setSelectedLaneId(lane.id);
          setDragState({ type: 'move', laneId: lane.id, startX: coords.x, origX: lane.x, origWidth: lane.width });
          return;
        }

        // Narrow border hitbox for resize (3-5px) so it never covers the move zone!
        const borderHitWidth = Math.min(5, Math.max(3, lane.width * 0.12));
        if (Math.abs(coords.x - leftBorder) <= borderHitWidth) {
          setSelectedLaneId(lane.id);
          setDragState({
            type: 'resize',
            laneId: lane.id,
            edge: 'left',
            startX: coords.x,
            origX: lane.x,
            origWidth: lane.width,
            fixedX: lane.x + half,
          });
          return;
        }
        if (Math.abs(coords.x - rightBorder) <= borderHitWidth) {
          setSelectedLaneId(lane.id);
          setDragState({
            type: 'resize',
            laneId: lane.id,
            edge: 'right',
            startX: coords.x,
            origX: lane.x,
            origWidth: lane.width,
            fixedX: lane.x - half,
          });
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
        let newWidth: number;
        let newX: number;
        if (dragState.edge === 'right') {
          const anchorLeft = dragState.fixedX ?? (dragState.origX - dragState.origWidth / 2);
          newWidth = Math.max(8, Math.min(plane.width, coords.x - anchorLeft));
          newX = anchorLeft + newWidth / 2;
        } else {
          const anchorRight = dragState.fixedX ?? (dragState.origX + dragState.origWidth / 2);
          newWidth = Math.max(8, Math.min(plane.width, anchorRight - coords.x));
          newX = anchorRight - newWidth / 2;
        }
        setLanes(prev => prev.map(l => l.id === dragState.laneId ? { ...l, x: Math.round(newX), width: Math.round(newWidth) } : l));
      }
      return;
    }

    // Hover cursor updates
    if (isCropping) {
      setCanvasCursor('crosshair');
      return;
    }

    if (e.shiftKey) {
      setCanvasCursor('crosshair');
      return;
    }

    let nextCursor = 'default';
    for (const lane of lanes) {
      const half = lane.width / 2;
      const inY = coords.y >= Math.min(lane.y0, lane.y1) - 20 && coords.y <= Math.max(lane.y0, lane.y1);
      if (inY) {
        const borderHitWidth = Math.min(5, Math.max(3, lane.width * 0.12));
        if (Math.abs(coords.x - (lane.x - half)) <= borderHitWidth || Math.abs(coords.x - (lane.x + half)) <= borderHitWidth) {
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

    // Lane-relative click position (band peakY/y0/y1 are stored relative to the lane top).
    const relClick = Math.max(0, Math.min(clickedLane.y1 - clickedLane.y0, clickY - clickedLane.y0));

    // Current bands for this lane
    const currentBands = bandMap[clickedLane.id] || (() => {
      const analysisItem = allLanesAnalysis.find(a => a.lane.id === clickedLane!.id);
      return analysisItem?.metrics.map(m => ({
        id: m.bandId,
        y0: m.y0 ?? Math.max(0, (m.peakY ?? relClick) - 8),
        y1: m.y1 ?? (m.peakY ?? relClick) + 8,
        peakY: m.peakY ?? relClick,
      })) || [];
    })();

    // Check if clicked near an existing band peak
    const existingBandIdx = currentBands.findIndex(b => Math.abs((b.peakY ?? (b.y0 + b.y1) / 2) - relClick) <= 8);

    if (existingBandIdx !== -1) {
      const existingBand = currentBands[existingBandIdx]!;
      if (e.ctrlKey || e.metaKey || e.altKey) {
        // Ctrl/Cmd/Alt + click: remove the band.
        setBandMap(prev => ({ ...prev, [clickedLane!.id]: currentBands.filter((_, idx) => idx !== existingBandIdx) }));
        if (s.refBandId === existingBand.id) set({ refBandId: '' });
      } else if (e.shiftKey) {
        // Shift + click: add a NEW band here (auto-fitted to the real peak).
        placeBandAt(clickedLane!.id, relClick);
      } else {
        // Plain click on an existing band: set or toggle reference band (synced with profile curve)
        set({ refBandId: s.refBandId === existingBand.id ? '' : existingBand.id });
      }
    } else {
      // No band here: add one at this position (auto-fitted).
      placeBandAt(clickedLane!.id, relClick);
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

  /** Rasterise the raw plane through the same display pipeline as the on-screen renderer. */
  function rasterizeDisplay(): HTMLCanvasElement | null {
    if (!plane) return null;
    const out = applyDisplayTransform(plane.data, {
      brightness: s.brightness,
      contrast: s.contrast,
      minClip: s.minClip ?? 0,
      maxClip: s.maxClip ?? 1,
      gamma: s.gamma ?? 1,
      invert: s.invertDisplay,
    });
    const cnv = document.createElement('canvas');
    cnv.width = plane.width;
    cnv.height = plane.height;
    const ctx = cnv.getContext('2d');
    if (!ctx) return null;
    const img = ctx.createImageData(plane.width, plane.height);
    for (let i = 0; i < out.length; i++) {
      const byte = Math.round(out[i]! * 255);
      img.data[i * 4] = byte;
      img.data[i * 4 + 1] = byte;
      img.data[i * 4 + 2] = byte;
      img.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    return cnv;
  }

  /** Resolved band annotations (formatted text) shared by the SVG and print exports. */
  function resolvedBands(): BandAnnotation[] {
    const out: BandAnnotation[] = [];
    for (const item of allLanesAnalysis) {
      for (const m of item.metrics) {
        if (m.peakY === undefined) continue;
        out.push({
          laneId: item.lane.id,
          y: (item.lane.y0 ?? 0) + m.peakY,
          sizeText: showMwLabels && calibration && m.sizeEst ? formatSize(m.sizeEst, activeLadder.kind) : null,
          massText: s.showMassLabels && massCalibration && m.massEst !== null ? formatMass(m.massEst, massCalibration.unit) : null,
        });
      }
    }
    return out;
  }

  /** SVG export: embedded image + every annotation as vector text (spec §6). */
  function handleExportSvg() {
    if (!plane) return;
    const cnv = rasterizeDisplay();
    if (!cnv) return;
    const method = activeLadder.kind === 'protein' ? 'protein' : 'DNA';
    const subtitle = `${plane.width} × ${plane.height} px · Bio-Bench vector export · ${new Date().toISOString().slice(0, 10)}`;
    const svg = buildGelSvg({
      width: plane.width,
      height: plane.height,
      imageDataUrl: cnv.toDataURL('image/png'),
      display: { brightness: s.brightness, contrast: s.contrast, minClip: s.minClip ?? 0, maxClip: s.maxClip ?? 1, gamma: s.gamma ?? 1, invert: s.invertDisplay },
      lanes,
      laneLabels,
      ladderLaneId: s.ladderLaneId,
      selectedLaneId: selectedLane?.id ?? null,
      showHeaders: showLaneHeaders,
      showMwLabels,
      showMassLabels: s.showMassLabels,
      bands: resolvedBands(),
      title: gelTitle,
      subtitle,
      footnote: `Quantification: raw-pixel densitometry with ${s.bgMethod} baseline; ${method} ladder calibration (${s.calibMethod}); compare bands within one gel only.`,
    });
    downloadText(svg, `${imageName.replace(/\.[^/.]+$/, '')}_annotated.svg`, 'image/svg+xml;charset=utf-8');
  }

  /** PDF export via the print stylesheet (spec §6): the print root renders the annotated image at 100 %. */
  function handlePrintGel() {
    window.print();
  }

  // Lane Management
  function handleAddLane() {
    if (!plane) return;
    const refLane = lanes[lanes.length - 1] || lanes[0];
    const newX = refLane ? Math.min(plane.width - 25, refLane.x + (refLane.width || 50)) : Math.round(plane.width / 4);
    const newLane: Lane = {
      id: `lane-${Date.now()}`,
      x: newX,
      width: refLane ? refLane.width : Math.max(20, Math.round(plane.width / 8)),
      y0: refLane ? refLane.y0 : 0,
      y1: refLane ? refLane.y1 : plane.height,
      tilt: refLane ? refLane.tilt : 0,
    };
    const updated = [...lanes, newLane];
    setLanes(updated);
    setSelectedLaneId(newLane.id);
    if (!s.ladderLaneId || !lanes.some(l => l.id === s.ladderLaneId)) {
      set({ ladderLaneId: newLane.id });
    }
  }

  function handleAutoLanes() {
    if (!plane) return;
    const currentIdx = lanes.findIndex(l => l.id === selectedLaneId);
    const ladderIdx = lanes.findIndex(l => l.id === s.ladderLaneId);
    const loadingRefIdx = s.loadingRefLaneId ? lanes.findIndex(l => l.id === s.loadingRefLaneId) : -1;
    const massLaneIdx = s.massLaneId ? lanes.findIndex(l => l.id === s.massLaneId) : -1;
    const detected = autoLanes(plane, { x: 0, y: 0, w: plane.width, h: plane.height }, s.polarity);
    setLanes(detected);
    // Lanes get new ids, so drop stale per-lane band annotations (they re-detect on the fly).
    setBandMap({});
    if (detected.length > 0) {
      const keepIdx = currentIdx >= 0 && currentIdx < detected.length ? currentIdx : 0;
      setSelectedLaneId(detected[keepIdx]!.id);
      const keepLadderIdx = ladderIdx >= 0 && ladderIdx < detected.length ? ladderIdx : 0;
      set({
        ladderLaneId: detected[keepLadderIdx]!.id,
        loadingRefLaneId: loadingRefIdx >= 0 && loadingRefIdx < detected.length ? detected[loadingRefIdx]!.id : '',
        massLaneId: massLaneIdx >= 0 && massLaneIdx < detected.length ? detected[massLaneIdx]!.id : '',
      });
    }
  }

  function handleEqualLanes() {
    if (!plane) return;
    const currentIdx = lanes.findIndex(l => l.id === selectedLaneId);
    const ladderIdx = lanes.findIndex(l => l.id === s.ladderLaneId);
    const loadingRefIdx = s.loadingRefLaneId ? lanes.findIndex(l => l.id === s.loadingRefLaneId) : -1;
    const massLaneIdx = s.massLaneId ? lanes.findIndex(l => l.id === s.massLaneId) : -1;
    const eq = equalLanes(numLanesInput, { x: 0, y: 0, w: plane.width, h: plane.height });
    setLanes(eq);
    if (eq.length > 0) {
      const keepIdx = currentIdx >= 0 && currentIdx < eq.length ? currentIdx : 0;
      setSelectedLaneId(eq[keepIdx]!.id);
      const keepLadderIdx = ladderIdx >= 0 && ladderIdx < eq.length ? ladderIdx : 0;
      set({
        ladderLaneId: eq[keepLadderIdx]!.id,
        loadingRefLaneId: loadingRefIdx >= 0 && loadingRefIdx < eq.length ? eq[loadingRefIdx]!.id : '',
        massLaneId: massLaneIdx >= 0 && massLaneIdx < eq.length ? eq[massLaneIdx]!.id : '',
      });
    }
  }

  function handleDeleteSelectedLane() {
    if (!selectedLane) return;
    const updated = lanes.filter(l => l.id !== selectedLane.id);
    setLanes(updated);
    if (updated.length > 0) {
      setSelectedLaneId(updated[0]!.id);
      if (s.ladderLaneId === selectedLane.id) set({ ladderLaneId: updated[0]!.id });
    } else {
      setSelectedLaneId('');
      setBandMap({});
      set({ ladderLaneId: '', refBandId: '', loadingRefLaneId: '', massLaneId: '' });
    }
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
    const massUnit = massCalibration?.unit || 'ng';
    const rows = [
      ['Lane_Number', 'Lane_ID', 'Lane_Custom_Name', 'Band_Number', 'Migration_Y_px', 'Estimated_Size', 'Size_Unit', 'Calibrated_Mass', 'Mass_Unit', 'Raw_Area', 'Baseline_Area', 'Net_Intensity', 'Percent_Of_Lane', 'Ratio_To_Reference', 'Saturated'],
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
            unit,
            m.massEst ? Number(m.massEst.toFixed(2)) : '',
            massUnit,
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

  // Export Whole-Lane Loading CSV
  function handleExportLoadingCsv() {
    const rows = [
      ['Lane_Number', 'Lane_ID', 'Lane_Custom_Name', 'Total_Integrated_Signal_OD_px', 'Total_Bands_Signal_OD_px', 'Relative_Loading_Ratio', 'Loading_Deviation_Pct', 'TPN_Normalization_Factor', 'Is_Reference_Lane'],
      ...allLanesAnalysis.map(item => {
        let label = laneLabels[item.lane.id] || `Lane ${item.laneIdx + 1}`;
        if (stripLanePrefix) {
          label = label.replace(/^(?:L\d+|Lane\s*\d+)[\s:\-_]*/i, '').trim() || label;
        }
        const isRef = item.lane.id === (s.loadingRefLaneId || allLanesAnalysis[0]?.lane.id);
        return [
          item.laneIdx + 1,
          stripLanePrefix ? item.lane.id.replace(/^l/i, '') : item.lane.id,
          label,
          Number(item.totalLaneSignal.toFixed(1)),
          Number(item.totalBandsSignal.toFixed(1)),
          Number(item.loadingRatio.toFixed(3)),
          Number(item.loadingDeviationPct.toFixed(2)),
          Number(item.normFactor.toFixed(3)),
          isRef ? 'YES' : 'NO',
        ];
      }),
    ];
    downloadText(toCsv(rows), `${imageName.replace(/\.[^/.]+$/, '')}_lane_loading_comparison.csv`, 'text/csv;charset=utf-8');
  }

  return (
    <>
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
          <details class="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 space-y-3 group">
            <summary class="cursor-pointer flex items-center justify-between">
              <span class="text-xs font-semibold text-slate-500 uppercase tracking-wider">Orientation & Crop</span>
              <button
                type="button"
                onClick={handleResetAllTransforms}
                class="text-[11px] text-slate-400 hover:text-accent-600 transition underline"
              >
                Reset Image
              </button>
            </summary>

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

            {/* Auto Gel Straighten & Crop Suggestion */}
            {cropSuggestion && (Math.abs(cropSuggestion.rotation) > 0.1 || cropSuggestion.crop.w < (plane?.width ?? 0) - 10 || cropSuggestion.crop.h < (plane?.height ?? 0) - 10) && (
              <div class="rounded-lg bg-indigo-50 dark:bg-indigo-950/40 p-2.5 border border-indigo-200 dark:border-indigo-800 text-xs space-y-1.5 mt-2">
                <div class="flex items-center justify-between font-semibold text-indigo-900 dark:text-indigo-200">
                  <span>🪄 Auto Alignment Suggestion</span>
                  <span class="text-[10px] mono bg-indigo-200/60 dark:bg-indigo-900/60 px-1.5 py-0.5 rounded">
                    {cropSuggestion.rotation >= 0 ? `+${cropSuggestion.rotation.toFixed(1)}°` : `${cropSuggestion.rotation.toFixed(1)}°`}
                  </span>
                </div>
                <p class="text-[11px] text-indigo-700 dark:text-indigo-300 leading-tight">
                  Suggested tilt: <span class="mono font-semibold">{cropSuggestion.rotation.toFixed(1)}°</span>. Suggested crop: <span class="mono font-semibold">{cropSuggestion.crop.w} × {cropSuggestion.crop.h} px</span>.
                </p>
                <button
                  type="button"
                  onClick={handleApplySuggestion}
                  class="w-full py-1 text-xs font-semibold rounded-md bg-indigo-600 hover:bg-indigo-700 text-white transition shadow-2xs"
                >
                  🪄 Apply Auto Straighten & Crop
                </button>
              </div>
            )}
          </details>

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

          {/* Densitometric Mass / Quantity Calibration Card */}
          <details class="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 space-y-3">
            <summary class="cursor-pointer flex items-center justify-between">
              <span class="text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider block">
                Mass Densitometry
              </span>
              <label class="flex items-center gap-1 text-[11px] text-slate-500 cursor-pointer" onClick={(e: Event) => e.stopPropagation()}>
                <input
                  type="checkbox"
                  checked={s.showMassLabels}
                  onChange={(e) => set({ showMassLabels: (e.target as HTMLInputElement).checked })}
                  class="rounded text-emerald-600"
                />
                Show ng
              </label>
            </summary>

            <div>
              <label class="text-xs font-medium text-slate-500 block mb-1">Standard Lane / Well</label>
              <select
                value={s.massLaneId}
                onChange={(e) => set({ massLaneId: (e.target as HTMLSelectElement).value })}
                class="w-full text-xs px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 dark:bg-slate-900 font-medium"
              >
                <option value="">None (Uncalibrated)</option>
                {lanes.map((l, i) => (
                  <option key={l.id} value={l.id}>
                    Lane {i + 1} {laneLabels[l.id] ? `(${laneLabels[l.id]})` : ''}
                  </option>
                ))}
              </select>
            </div>

            {s.massLaneId && (
              <>
                <div>
                  <label class="text-xs font-medium text-slate-500 block mb-1">Standard Preset</label>
                  <select
                    value={s.massPresetId}
                    onChange={(e) => set({ massPresetId: (e.target as HTMLSelectElement).value })}
                    class="w-full text-xs px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 dark:bg-slate-900"
                  >
                    {MASS_STANDARD_PRESETS.map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label class="text-xs font-medium text-slate-500 block mb-1">Curve Fit Model</label>
                  <select
                    value={s.massCalibMethod}
                    onChange={(e) => set({ massCalibMethod: (e.target as HTMLSelectElement).value as MassCalibrationModel })}
                    class="w-full text-xs px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 dark:bg-slate-900"
                  >
                    <option value="linear">Linear (y = mx + b)</option>
                    <option value="linear_zero">Linear through Origin (y = mx)</option>
                    <option value="quadratic">Quadratic (Curvature)</option>
                    <option value="power">Power Law (Allometric)</option>
                  </select>
                </div>

                {massCalibration ? (
                  <div class="rounded-lg bg-emerald-50 p-2 text-xs text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 space-y-1">
                    <div class="font-bold">✓ Mass Calibrated ({massCalibration.points.length} standards)</div>
                    <div class="text-[11px] font-mono">R² = {massCalibration.r2.toFixed(4)}</div>
                  </div>
                ) : (
                  <div class="rounded-lg bg-amber-50 p-2 text-xs text-amber-800 dark:bg-amber-950/50 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                    Select a lane with detected bands to calibrate mass.
                  </div>
                )}
              </>
            )}
          </details>

          {/* Densitometry & Background Parameters */}
          <details class="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 space-y-3">
            <summary class="cursor-pointer text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Densitometry & Background
            </summary>
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
                <span class="font-mono font-semibold text-slate-700 dark:text-slate-300">
                  {s.prominence <= 0.03 ? 'Very High (Faint bands)' : s.prominence <= 0.08 ? 'Standard' : 'Strict (Major bands)'} ({(s.prominence * 100).toFixed(0)}%)
                </span>
              </div>
              <input
                type="range"
                min="0.01"
                max="0.30"
                step="0.01"
                value={s.prominence}
                onInput={(e) => {
                  const val = parseFloat((e.target as HTMLInputElement).value);
                  set({ prominence: val });
                  setBandMap({});
                }}
                class="w-full accent-accent-600 cursor-pointer"
                title="Slide left for high sensitivity (faint bands), right for strict (strong bands only)"
              />
              <div class="flex justify-between text-[10px] text-slate-400 mt-0.5">
                <span>◀ High Sensitivity (Faint)</span>
                <span>Strict (Strong Only) ▶</span>
              </div>
            </div>
          </details>

          {/* Annotations & Titles Card */}
          <details class="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 space-y-3">
            <summary class="cursor-pointer text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Gel Annotations
            </summary>
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
          </details>

          {/* Display Adjustments */}
          <details class="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 space-y-2">
            <summary class="cursor-pointer font-semibold text-xs uppercase tracking-wider text-slate-500">
              Display Adjustments
            </summary>
            <div class="pt-2 space-y-2.5 text-xs">
              <div>
                <div class="flex justify-between text-slate-500 mb-1">
                  <span>Brightness</span>
                  <span class="mono font-semibold">{s.brightness.toFixed(2)}×</span>
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
                <div class="flex justify-between text-slate-500 mb-1">
                  <span>Contrast</span>
                  <span class="mono font-semibold">{s.contrast.toFixed(2)}×</span>
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
              <div>
                <div class="flex justify-between text-slate-500 mb-1">
                  <span>Min Contrast Clip (Black Level)</span>
                  <span class="mono font-semibold">{Math.round((s.minClip ?? 0) * 100)}%</span>
                </div>
                <input
                  type="range"
                  min="0.0"
                  max="0.7"
                  step="0.01"
                  value={s.minClip ?? 0}
                  onInput={(e) => set({ minClip: parseFloat((e.target as HTMLInputElement).value) })}
                  class="w-full accent-accent-600"
                />
              </div>
              <div>
                <div class="flex justify-between text-slate-500 mb-1">
                  <span>Max Contrast Clip (White Level)</span>
                  <span class="mono font-semibold">{Math.round((s.maxClip ?? 1) * 100)}%</span>
                </div>
                <input
                  type="range"
                  min="0.3"
                  max="1.0"
                  step="0.01"
                  value={s.maxClip ?? 1}
                  onInput={(e) => set({ maxClip: parseFloat((e.target as HTMLInputElement).value) })}
                  class="w-full accent-accent-600"
                />
              </div>
              <div>
                <div class="flex justify-between text-slate-500 mb-1">
                  <span>Gamma Curve</span>
                  <span class="mono font-semibold">{(s.gamma ?? 1).toFixed(2)}</span>
                </div>
                <input
                  type="range"
                  min="0.4"
                  max="2.5"
                  step="0.05"
                  value={s.gamma ?? 1}
                  onInput={(e) => set({ gamma: parseFloat((e.target as HTMLInputElement).value) })}
                  class="w-full accent-accent-600"
                />
              </div>
              <div class="flex items-center justify-between pt-1">
                <label class="flex items-center gap-2 text-slate-700 dark:text-slate-300 cursor-pointer font-medium">
                  <input
                    type="checkbox"
                    checked={s.invertDisplay}
                    onChange={(e) => set({ invertDisplay: (e.target as HTMLInputElement).checked })}
                    class="rounded border-slate-300"
                  />
                  Invert Display
                </label>
                <button
                  type="button"
                  onClick={() => set({ brightness: 1, contrast: 1, minClip: 0, maxClip: 1, gamma: 1, invertDisplay: false })}
                  class="px-2 py-0.5 rounded border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-[11px] text-slate-500 font-medium"
                >
                  Reset Display
                </button>
              </div>
              <p class="text-[10px] text-slate-400 italic pt-0.5 leading-normal">
                Adjusts visualization &amp; strip contrast only without altering raw linear densitometry data.
              </p>
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
                  const isLoadingRef = l.id === s.loadingRefLaneId;
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
                            : isLoadingRef
                              ? 'bg-blue-100 text-blue-900 hover:bg-blue-200 dark:bg-blue-950 dark:text-blue-200'
                              : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'
                      }`}
                    >
                      {customName ? `L${i + 1}: ${customName}` : `L${i + 1}`}{isLadder ? ' 🏷️' : ''}{isLoadingRef ? ' ⚖️' : ''}
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
                <button
                  type="button"
                  onClick={handleAutoFindBands}
                  disabled={!selectedLane}
                  class="px-2.5 py-1 text-xs font-medium bg-amber-50 hover:bg-amber-100 text-amber-700 dark:bg-amber-950 dark:hover:bg-amber-900 dark:text-amber-300 rounded-lg transition disabled:opacity-50"
                  title="Re-detect bands in the selected lane using the current prominence"
                >
                  ✨ Auto-Find Bands
                </button>
                <button
                  type="button"
                  onClick={() => setBandMap({})}
                  class="px-2.5 py-1 text-xs font-medium bg-amber-100/60 hover:bg-amber-200/60 text-amber-800 dark:bg-amber-900/40 dark:hover:bg-amber-800/50 dark:text-amber-200 rounded-lg transition"
                  title="Reset manually edited bands and re-detect across all lanes using current prominence"
                >
                  ✨ Re-detect All Bands
                </button>
                <button
                  type="button"
                  onClick={handleGridFromPlaced}
                  disabled={lanes.length < 2}
                  class="px-2.5 py-1 text-xs font-medium bg-indigo-50 hover:bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:hover:bg-indigo-900 dark:text-indigo-300 rounded-lg transition disabled:opacity-50"
                  title="Detect lane pitch and interpolate grid based on 2 or more placed lanes"
                >
                  ✨ Grid from Placed ({lanes.length})
                </button>

                <span class="text-slate-300 dark:text-slate-700 select-none">|</span>

                <div class="flex items-center gap-1">
                  <input
                    type="number"
                    min="1"
                    max="50"
                    value={numLanesInput}
                    onInput={(e) => setNumLanesInput(Math.max(1, parseInt((e.target as HTMLInputElement).value) || 1))}
                    class="w-10 px-1 py-1 text-xs rounded-lg border border-slate-300 dark:border-slate-700 dark:bg-slate-900 mono text-center"
                    title="Number of equal lanes"
                  />
                  <button
                    type="button"
                    onClick={handleEqualLanes}
                    class="px-2 py-1 text-xs font-medium bg-slate-100 hover:bg-slate-200 rounded-lg dark:bg-slate-800 dark:hover:bg-slate-700 transition"
                  >
                    Equal
                  </button>
                </div>
                {(selectedLane || lanes.length > 0) && (
                  <>
                    <span class="text-slate-300 dark:text-slate-700 select-none">|</span>
                    {selectedLane && (
                      <button
                        type="button"
                        onClick={handleDeleteSelectedLane}
                        class="px-2 py-1 text-xs text-red-600 hover:bg-red-50 rounded-lg dark:hover:bg-red-950/40 transition"
                        title="Delete current lane"
                      >
                        ✕ L{selectedLaneIdx + 1}
                      </button>
                    )}
                    {lanes.length > 0 && (
                      <button
                        type="button"
                        onClick={handleClearAllLanes}
                        class="px-2 py-1 text-xs text-rose-600 hover:bg-rose-50 rounded-lg dark:hover:bg-rose-950/40 transition font-medium"
                        title="Clear all lanes from image"
                      >
                        Clear All
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* Selected Lane Custom Label & Sliders */}
            {selectedLane && (
              <div class="grid gap-2 sm:grid-cols-3 text-xs bg-slate-50 p-2 rounded-lg dark:bg-slate-800/50 items-center">
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
            <button
              type="button"
              onClick={handleExportSvg}
              class="px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 transition flex items-center gap-1.5"
              title="Vector export: annotations stay crisp text at any zoom"
            >
              📐 Export SVG
            </button>
            <button
              type="button"
              onClick={handlePrintGel}
              class="px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 transition flex items-center gap-1.5"
              title="Print or save as PDF via the print stylesheet"
            >
              🖨️ Print / PDF
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

                {/* Compact gesture hints */}
                <div class="flex items-center justify-between text-[10px] text-slate-400 px-1 py-0.5">
                  <span><strong>Shift+Click</strong> = place lane · <strong>Shift+Click</strong> in lane = add band · <strong>Ctrl+Click</strong> band = remove</span>
                  {selectedLane && (
                    <span class="text-accent-600 dark:text-accent-400 font-semibold text-[11px]">Active: L{selectedLaneIdx + 1}</span>
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
                    title="Click or drag lanes. Shift+Click to add band, Ctrl+click to remove."
                  />
                </div>


              </div>

              {/* Densitometry Profile Card for Active Lane */}
              <div class="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 space-y-3">
                <div class="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-2.5 dark:border-slate-800">
                  <div class="space-y-1">
                    <div class="flex flex-wrap items-center gap-2">
                      <h3 class="font-bold text-sm text-slate-900 dark:text-slate-100">
                        Densitometry Profile — Lane {selectedLaneIdx + 1}
                      </h3>
                      {selectedLane && selectedLane.id === s.ladderLaneId && (
                        <span class="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
                          🏷️ Standard Ladder Lane
                        </span>
                      )}
                      {selectedLane && selectedLane.id === s.loadingRefLaneId && (
                        <span class="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300 border border-blue-300 dark:border-blue-800">
                          ⚖️ Loading Ref
                        </span>
                      )}
                      {selectedLane && selectedLane.id === s.massLaneId && (
                        <span class="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300 border border-purple-300 dark:border-purple-800">
                          📊 Mass Std
                        </span>
                      )}
                    </div>
                    <p class="text-xs text-slate-500">
                      Migration distance $Y$ (top → bottom) vs band optical density & physical lane strip
                    </p>
                    <p class="text-[11px] text-slate-400 dark:text-slate-500">
                      Click a band to set ref/move · <kbd class="font-mono">Shift</kbd>+Click to add ·{' '}
                      <kbd class="font-mono">Ctrl</kbd>/<kbd class="font-mono">Cmd</kbd>+Click to remove — bands auto-fit to the real peak
                    </p>
                  </div>

                  <div class="flex flex-wrap items-center gap-3 text-xs">
                    {selectedLane && (
                      <div class="flex flex-wrap items-center gap-1.5">
                        {selectedLane.id === s.ladderLaneId ? (
                          <button
                            type="button"
                            onClick={() => set({ ladderLaneId: '' })}
                            class="px-2 py-1 text-[11px] font-medium text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded transition"
                            title="Unset standard ladder designation"
                          >
                            ✕ Unset Ladder
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => set({ ladderLaneId: selectedLane.id })}
                            class="px-2.5 py-1 text-xs font-medium rounded-lg border border-slate-300 bg-white hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition shadow-2xs"
                            title="Set this lane as the Molecular Weight Standard Ladder"
                          >
                            ⭐ Set as Standard Ladder
                          </button>
                        )}
                        {selectedLane.id === s.loadingRefLaneId ? (
                          <button
                            type="button"
                            onClick={() => set({ loadingRefLaneId: '' })}
                            class="px-2 py-1 text-[11px] font-medium text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded transition"
                            title="Unset loading reference designation"
                          >
                            ✕ Unset Loading Ref
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => set({ loadingRefLaneId: selectedLane.id })}
                            class="px-2 py-1 text-xs font-medium rounded-lg border border-slate-300 bg-white hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition shadow-2xs"
                            title="Set this lane as the Loading Reference"
                          >
                            ⚖️ Set as Loading Ref
                          </button>
                        )}
                      </div>
                    )}
                    <div class="flex items-center gap-2 border-l border-slate-200 dark:border-slate-700 pl-2">
                      <span class="flex items-center gap-1.5 font-medium text-accent-600">
                        <span class="w-3 h-0.5 bg-accent-600 rounded"></span> Signal
                      </span>
                      <span class="flex items-center gap-1.5 font-medium text-amber-500">
                        <span class="w-3 h-0.5 bg-amber-500 rounded border-t border-dashed"></span> Baseline
                      </span>
                    </div>
                  </div>
                </div>

                {laneAnalysis && laneAnalysis.profile.length > 0 ? (
                  <div class="space-y-3">
                    <svg viewBox="0 0 500 280" onClick={handleProfileSvgClick} class="w-full h-auto rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 select-none cursor-crosshair">
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
                              e.stopPropagation();
                              if (e.ctrlKey || e.metaKey) {
                                if (selectedLane) removePeakFromLane(selectedLane.id, m.bandId);
                              } else {
                                set({ refBandId: m.bandId });
                              }
                            }}
                          >
                            {/* Vertical alignment line from curve down to top edge of lane strip (stops at y=201, DOES NOT cross the raw image) */}
                            <line
                              x1={px}
                              y1={py}
                              x2={px}
                              y2="201"
                              stroke={isRef ? '#10b981' : '#ef4444'}
                              stroke-width="1.2"
                              stroke-dasharray="2 2"
                              stroke-opacity="0.85"
                            />

                            {/* Top alignment tick line pointing to lane strip (does not cross image) */}
                            <line
                              x1={px}
                              y1="197"
                              x2={px}
                              y2="202"
                              stroke={isRef ? '#10b981' : '#ef4444'}
                              stroke-width="2"
                            />

                            {/* Bottom alignment tick line pointing from lane strip down to the remove badge (does not cross image) */}
                            <line
                              x1={px}
                              y1="242"
                              x2={px}
                              y2="257"
                              stroke={isRef ? '#10b981' : '#ef4444'}
                              stroke-width="2"
                            />

                            {/* Dot on curve */}
                            <circle cx={px} cy={py} r={isRef ? 5 : 4} fill={isRef ? '#10b981' : '#ef4444'} stroke="#ffffff" stroke-width="1.5" />

                            {/* Number above curve */}
                            <text x={px} y={py - 6} font-size="9" text-anchor="middle" fill="#64748b" font-weight="bold">
                              #{m.number}
                            </text>

                            {/* Remove-band (✕) badge in a dedicated row beneath the physical lane strip,
                                centred on this band's peak. Kept off the strip itself so the gel bands
                                stay clean and easy to read; click to remove the band (Ctrl/Cmd+Click on
                                the marker above still works). */}
                            <g
                              class="cursor-pointer"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (selectedLane) removePeakFromLane(selectedLane.id, m.bandId);
                              }}
                              title={`Remove Band #${m.number} from Lane ${selectedLaneIdx + 1}`}
                            >
                              <circle
                                cx={px}
                                cy="265"
                                r="8.5"
                                fill="rgba(15, 23, 42, 0.72)"
                                stroke={isRef ? '#10b981' : '#f87171'}
                                stroke-width="1.2"
                              />
                              <text
                                x={px}
                                y="268.6"
                                font-size="10"
                                font-weight="bold"
                                text-anchor="middle"
                                fill={isRef ? '#a7f3d0' : '#fecaca'}
                                class="pointer-events-none"
                              >
                                ✕
                              </text>
                            </g>
                          </g>
                        );
                      })}


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
                              {(() => {
                                const isLadderLane = selectedLane?.id === s.ladderLaneId;
                                const sortedLadderSizes = [...activeLadder.sizes].sort((a, b) => b - a);
                                const sortedLaneMetrics = isLadderLane
                                  ? [...laneAnalysis.metrics].sort((a, b) => (a.peakY ?? 0) - (b.peakY ?? 0))
                                  : [];
                                return laneAnalysis.metrics.map(m => {
                                  const isRef = m.bandId === s.refBandId;
                                  const peakIdx = Math.min(laneAnalysis.profile.length - 1, Math.round(m.peakY ?? 0));
                                  const peakVal = laneAnalysis.profile[peakIdx] ?? 0;
                                  const ladderBandIdx = isLadderLane ? sortedLaneMetrics.findIndex(p => p.bandId === m.bandId) : -1;
                                  const nominalStdSize = (isLadderLane && ladderBandIdx >= 0 && ladderBandIdx < sortedLadderSizes.length)
                                    ? sortedLadderSizes[ladderBandIdx]
                                    : null;
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
                                      <td class="px-3 py-2">
                                        {nominalStdSize != null ? (
                                          <div class="flex items-center gap-1.5">
                                            <span class="font-bold text-accent-600 dark:text-accent-400">
                                              {formatSize(nominalStdSize, activeLadder.kind)}
                                            </span>
                                            <span class="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                                              Std Ladder
                                            </span>
                                          </div>
                                        ) : m.sizeEst ? (
                                          <span class="font-bold text-accent-600 dark:text-accent-400">
                                            {formatSize(m.sizeEst, activeLadder.kind)}
                                          </span>
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
                                });
                              })()}
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

          {/* TAB 2: Calibration Curves (MW and Mass Densitometry) */}
          {s.viewTab === 'calib' && (
            <div class="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 space-y-4">
              <div class="flex flex-wrap items-baseline justify-between gap-2 border-b border-slate-100 pb-3 dark:border-slate-800">
                <div>
                  <h3 class="font-bold text-base text-slate-900 dark:text-slate-100">
                    {s.calibSubTab === 'mw' ? 'Molecular Weight Calibration Curve' : 'Mass Densitometry Calibration Curve'}
                  </h3>
                  <p class="text-xs text-slate-500">
                    {s.calibSubTab === 'mw'
                      ? 'Semi-log regression: Migration distance Y (pixels) vs Log₁₀(Molecular Weight / Size)'
                      : 'Densitometric Mass Quantification: Net Optical Density (OD · px) vs Known Mass (ng / µg)'}
                  </p>
                </div>

                <div class="flex items-center gap-3">
                  {/* Sub-tab switcher */}
                  <div class="flex rounded-lg border border-slate-200 dark:border-slate-700 p-0.5 bg-slate-50 dark:bg-slate-950 text-xs">
                    <button
                      type="button"
                      onClick={() => set({ calibSubTab: 'mw' })}
                      class={`px-3 py-1.5 font-semibold rounded-md transition ${s.calibSubTab === 'mw' ? 'bg-accent-600 text-white shadow-sm' : 'text-slate-600 dark:text-slate-400'}`}
                    >
                      Molecular Weight (MW)
                    </button>
                    <button
                      type="button"
                      onClick={() => set({ calibSubTab: 'mass' })}
                      class={`px-3 py-1.5 font-semibold rounded-md transition ${s.calibSubTab === 'mass' ? 'bg-accent-600 text-white shadow-sm' : 'text-slate-600 dark:text-slate-400'}`}
                    >
                      Mass / Densitometry (ng)
                    </button>
                  </div>

                  {s.calibSubTab === 'mw' && calibration && (
                    <div class="hidden sm:flex items-center gap-3 text-xs">
                      <span class="font-medium text-slate-500">Model: <strong class="text-slate-800 dark:text-slate-200">{s.calibMethod}</strong></span>
                      {calibration.r2 !== undefined && (
                        <span class="font-medium text-slate-500">R²: <strong class="text-emerald-600 dark:text-emerald-400">{calibration.r2.toFixed(4)}</strong></span>
                      )}
                    </div>
                  )}

                  {s.calibSubTab === 'mass' && massCalibration && (
                    <div class="hidden sm:flex items-center gap-3 text-xs">
                      <span class="font-medium text-slate-500">Model: <strong class="text-slate-800 dark:text-slate-200">{s.massCalibMethod}</strong></span>
                      <span class="font-medium text-slate-500">R²: <strong class="text-emerald-600 dark:text-emerald-400">{massCalibration.r2.toFixed(4)}</strong></span>
                    </div>
                  )}
                </div>
              </div>

              {s.calibSubTab === 'mw' ? (
                <div class="space-y-4">
                  <div class="flex flex-wrap items-center justify-between gap-3 bg-slate-50 dark:bg-slate-950 p-3 rounded-xl border border-slate-200 dark:border-slate-800 text-xs">
                    <div class="flex flex-wrap items-center gap-3">
                      <div>
                        <span class="text-slate-500 font-medium mr-1.5">Ladder Lane:</span>
                        <select
                          value={s.ladderLaneId}
                          onChange={(e) => set({ ladderLaneId: (e.target as HTMLSelectElement).value })}
                          class="px-2 py-1 rounded border border-slate-300 dark:border-slate-700 dark:bg-slate-900 font-semibold"
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
                        <span class="text-slate-500 font-medium mr-1.5">Ladder Preset:</span>
                        <select
                          value={s.ladderId}
                          onChange={(e) => set({ ladderId: (e.target as HTMLSelectElement).value })}
                          class="px-2 py-1 rounded border border-slate-300 dark:border-slate-700 dark:bg-slate-900 font-semibold"
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
                      </div>

                      <div>
                        <span class="text-slate-500 font-medium mr-1.5">Regression Model:</span>
                        <select
                          value={s.calibMethod}
                          onChange={(e) => set({ calibMethod: (e.target as HTMLSelectElement).value as 'linear' | 'piecewise' | 'spline' })}
                          class="px-2 py-1 rounded border border-slate-300 dark:border-slate-700 dark:bg-slate-900 font-semibold"
                        >
                          <option value="piecewise">Piecewise Log-Linear</option>
                          <option value="linear">Global Log-Linear (y = mx + b)</option>
                          <option value="spline">Monotonic Cubic Spline</option>
                        </select>
                      </div>
                    </div>

                    {calibration && (
                      <div class="flex items-center gap-3 font-mono">
                        <span class="text-slate-600 dark:text-slate-400 font-semibold">
                          {calibration.points.length} standards paired
                        </span>
                        {calibration.r2 !== undefined && (
                          <span class="text-emerald-600 font-bold">R² = {calibration.r2.toFixed(4)}</span>
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
              ) : (
                /* Mass / Densitometry Sub-Tab */
                <div class="space-y-4">
                  <div class="flex flex-wrap items-center justify-between gap-3 bg-slate-50 dark:bg-slate-950 p-3 rounded-xl border border-slate-200 dark:border-slate-800 text-xs">
                    <div class="flex flex-wrap items-center gap-3">
                      <div>
                        <span class="text-slate-500 font-medium mr-1.5">Standard Lane / Well:</span>
                        <select
                          value={s.massLaneId}
                          onChange={(e) => set({ massLaneId: (e.target as HTMLSelectElement).value })}
                          class="px-2 py-1 rounded border border-slate-300 dark:border-slate-700 dark:bg-slate-900 font-semibold"
                        >
                          <option value="">Select Lane...</option>
                          {lanes.map((l, i) => (
                            <option key={l.id} value={l.id}>
                              Lane {i + 1} {laneLabels[l.id] ? `(${laneLabels[l.id]})` : ''}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <span class="text-slate-500 font-medium mr-1.5">Preset:</span>
                        <select
                          value={s.massPresetId}
                          onChange={(e) => set({ massPresetId: (e.target as HTMLSelectElement).value })}
                          class="px-2 py-1 rounded border border-slate-300 dark:border-slate-700 dark:bg-slate-900"
                        >
                          {MASS_STANDARD_PRESETS.map(p => (
                            <option key={p.id} value={p.id}>{p.name}</option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <span class="text-slate-500 font-medium mr-1.5">Model:</span>
                        <select
                          value={s.massCalibMethod}
                          onChange={(e) => set({ massCalibMethod: (e.target as HTMLSelectElement).value as MassCalibrationModel })}
                          class="px-2 py-1 rounded border border-slate-300 dark:border-slate-700 dark:bg-slate-900"
                        >
                          <option value="linear">Linear (y = mx + b)</option>
                          <option value="linear_zero">Linear Origin (y = mx)</option>
                          <option value="quadratic">Quadratic (Polynomial)</option>
                          <option value="power">Power Law</option>
                        </select>
                      </div>
                    </div>

                    {massCalibration && (
                      <div class="flex items-center gap-3 font-mono">
                        <span class="text-slate-600 dark:text-slate-400 font-semibold">{massCalibration.formula}</span>
                        <span class="text-emerald-600 font-bold">R² = {massCalibration.r2.toFixed(4)}</span>
                      </div>
                    )}
                  </div>

                  {massCalibration && massCalibration.points.length >= 2 ? (
                    <div class="space-y-4">
                      {/* SVG Plot for Mass Calibration */}
                      <svg viewBox="0 0 600 320" class="w-full h-auto rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                        {/* Axes */}
                        <line x1="60" y1="20" x2="60" y2="270" stroke="#94a3b8" stroke-width="1.5" />
                        <line x1="60" y1="270" x2="570" y2="270" stroke="#94a3b8" stroke-width="1.5" />

                        <text x="315" y="305" font-size="11" text-anchor="middle" fill="#64748b" font-weight="600">
                          Net Optical Density / Integrated Intensity (OD · px)
                        </text>
                        <text transform="rotate(-90 20 145)" x="20" y="145" font-size="11" text-anchor="middle" fill="#64748b" font-weight="600">
                          Known Mass ({massCalibration.unit})
                        </text>

                        {(() => {
                          const pts = massCalibration.points;
                          const minX = 0;
                          const maxX = Math.max(10, Math.max(...pts.map(p => p.netIntensity)) * 1.15);
                          const rangeX = Math.max(1, maxX - minX);

                          const minY = 0;
                          const maxY = Math.max(10, Math.max(...pts.map(p => p.knownMass)) * 1.15);
                          const rangeY = Math.max(1, maxY - minY);

                          // Curve
                          const curveSteps = 60;
                          const curvePts: [number, number][] = [];
                          for (let sIdx = 0; sIdx <= curveSteps; sIdx++) {
                            const netVal = minX + (sIdx / curveSteps) * rangeX;
                            const massVal = massCalibration.massAt(netVal);
                            const xSvg = 60 + ((netVal - minX) / rangeX) * 500;
                            const ySvg = 270 - ((massVal - minY) / rangeY) * 240;
                            curvePts.push([xSvg, Math.max(20, Math.min(270, ySvg))]);
                          }

                          return (
                            <>
                              {/* Fitted Curve */}
                              {curvePts.length > 1 && (
                                <path
                                  d={curvePts.reduce((acc, [cx, cy], i) => i === 0 ? `M ${cx} ${cy}` : `${acc} L ${cx} ${cy}`, '')}
                                  fill="none"
                                  stroke="#10b981"
                                  stroke-width="2.5"
                                />
                              )}

                              {/* Calibration Standard Points */}
                              {pts.map((pt, i) => {
                                const sx = 60 + ((pt.netIntensity - minX) / rangeX) * 500;
                                const sy = 270 - ((pt.knownMass - minY) / rangeY) * 240;
                                return (
                                  <g key={i}>
                                    <circle cx={sx} cy={sy} r="5.5" fill="#10b981" stroke="#ffffff" stroke-width="1.5" />
                                    <text x={sx} y={sy - 9} font-size="9" text-anchor="middle" fill="#059669" font-weight="bold">
                                      {pt.knownMass} {pt.unit || 'ng'}
                                    </text>
                                  </g>
                                );
                              })}

                              {/* Sample Bands from selected lane */}
                              {selectedLane && laneAnalysis && laneAnalysis.lane.id !== s.massLaneId && laneAnalysis.metrics.map((m) => {
                                if (m.massEst === null || m.net <= 0) return null;
                                const sx = 60 + ((m.net - minX) / rangeX) * 500;
                                const sy = 270 - ((m.massEst - minY) / rangeY) * 240;
                                if (sx > 570 || sy < 20 || sy > 270) return null;
                                return (
                                  <g key={m.bandId}>
                                    <polygon
                                      points={`${sx},${sy - 5} ${sx + 5},${sy} ${sx},${sy + 5} ${sx - 5},${sy}`}
                                      fill="#3b82f6"
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

                      {/* Standards Table with inputs for user customization */}
                      <div class="rounded-xl border border-slate-200 dark:border-slate-800 p-4 space-y-3 bg-white dark:bg-slate-900">
                        <div class="flex items-center justify-between">
                          <h4 class="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
                            Standard Bands in Lane {lanes.findIndex(l => l.id === s.massLaneId) + 1}
                          </h4>
                          <span class="text-[11px] text-slate-500">Edit known mass for each band to customize standard curve</span>
                        </div>

                        <div class="overflow-x-auto">
                          <table class="w-full text-xs text-left">
                            <thead class="bg-slate-50 dark:bg-slate-950 text-slate-500 font-semibold border-b border-slate-200 dark:border-slate-800">
                              <tr>
                                <th class="p-2">Band #</th>
                                <th class="p-2">Net OD (Signal)</th>
                                <th class="p-2">Known Mass ({massCalibration.unit})</th>
                                <th class="p-2">Fitted Mass</th>
                                <th class="p-2">Residual Error</th>
                              </tr>
                            </thead>
                            <tbody class="divide-y divide-slate-100 dark:divide-slate-800 font-mono">
                              {massCalibration.points.map((p, idx) => {
                                const res = massCalibration.residuals[idx];
                                return (
                                  <tr key={p.bandId}>
                                    <td class="p-2 font-bold font-sans">Band {idx + 1}</td>
                                    <td class="p-2 font-bold">{p.netIntensity.toFixed(1)}</td>
                                    <td class="p-2">
                                      <input
                                        type="number"
                                        value={customMassMap[p.bandId] ?? p.knownMass}
                                        onInput={(e) => {
                                          const val = parseFloat((e.target as HTMLInputElement).value);
                                          if (!isNaN(val) && val > 0) {
                                            setCustomMassMap(prev => ({ ...prev, [p.bandId]: val }));
                                          }
                                        }}
                                        class="w-24 px-2 py-1 rounded border border-slate-300 dark:border-slate-700 dark:bg-slate-800 text-xs font-bold font-mono"
                                        step="any"
                                      />
                                    </td>
                                    <td class="p-2 text-emerald-600 font-bold">{res?.fittedMass.toFixed(1)} {massCalibration.unit}</td>
                                    <td class="p-2 text-slate-500">{res ? `${(res.fraction * 100).toFixed(1)}%` : '-'}</td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div class="py-12 text-center text-slate-400 text-xs">
                      Please select a lane with at least 2 detected bands in the dropdown above to calibrate mass densitometry.
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* TAB 3: Comprehensive Quantification & Line Loading Across All Lanes */}
          {s.viewTab === 'quant' && (
            <div class="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 space-y-4">
              <div class="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3 dark:border-slate-800">
                <div>
                  <h3 class="font-bold text-base text-slate-900 dark:text-slate-100">
                    {s.quantSubView === 'loading'
                      ? 'Whole-Lane Loading Comparison & Ponceau S / TPN Normalization'
                      : 'Band Quantification & Relative Amounts'}
                  </h3>
                  <p class="text-xs text-slate-500">
                    {s.quantSubView === 'loading'
                      ? 'Total integrated optical density across all lines to verify equal sample loading, CV%, and compute TPN correction factors'
                      : 'Background-subtracted optical densities, relative percentage shares, and calibrated molecular weights'}
                  </p>
                </div>

                <div class="flex flex-wrap items-center gap-2">
                  {/* Sub-view toggle: Bands vs Loading */}
                  <div class="flex rounded-lg border border-slate-200 dark:border-slate-700 p-0.5 bg-slate-50 dark:bg-slate-950 text-xs">
                    <button
                      type="button"
                      onClick={() => set({ quantSubView: 'bands' })}
                      class={`px-3 py-1.5 font-semibold rounded-md transition ${
                        s.quantSubView === 'bands' ? 'bg-accent-600 text-white shadow-xs' : 'text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      🎯 Band Quantification
                    </button>
                    <button
                      type="button"
                      onClick={() => set({ quantSubView: 'loading' })}
                      class={`px-3 py-1.5 font-semibold rounded-md transition ${
                        s.quantSubView === 'loading' ? 'bg-accent-600 text-white shadow-xs' : 'text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      🧪 Line Loading (Ponceau S)
                    </button>
                  </div>

                  {s.quantSubView === 'bands' && (
                    <>
                      {/* Lane Cards vs Unified Table toggle */}
                      <div class="flex rounded-lg border border-slate-200 dark:border-slate-700 p-0.5 text-xs">
                        <button
                          type="button"
                          onClick={() => setQuantLayoutMode('cards')}
                          class={`px-2.5 py-1 rounded-md font-medium transition ${
                            quantLayoutMode === 'cards' ? 'bg-slate-800 text-white dark:bg-slate-200 dark:text-slate-900' : 'text-slate-600 dark:text-slate-400'
                          }`}
                          title="Show extracted gel strip alongside each lane table"
                        >
                          🖼️ Strips &amp; Tables
                        </button>
                        <button
                          type="button"
                          onClick={() => setQuantLayoutMode('table')}
                          class={`px-2.5 py-1 rounded-md font-medium transition ${
                            quantLayoutMode === 'table' ? 'bg-slate-800 text-white dark:bg-slate-200 dark:text-slate-900' : 'text-slate-600 dark:text-slate-400'
                          }`}
                          title="Show unified flat table"
                        >
                          📄 Unified Table
                        </button>
                      </div>

                      {/* All vs Selected lane filter */}
                      <div class="flex rounded-lg border border-slate-200 dark:border-slate-700 p-0.5 text-xs">
                        <button
                          type="button"
                          onClick={() => set({ tableMode: 'all' })}
                          class={`px-2.5 py-1 rounded-md font-medium transition ${
                            s.tableMode === 'all' ? 'bg-accent-600 text-white' : 'text-slate-600 dark:text-slate-400'
                          }`}
                        >
                          All ({lanes.length})
                        </button>
                        <button
                          type="button"
                          onClick={() => set({ tableMode: 'selected' })}
                          class={`px-2.5 py-1 rounded-md font-medium transition ${
                            s.tableMode === 'selected' ? 'bg-accent-600 text-white' : 'text-slate-600 dark:text-slate-400'
                          }`}
                        >
                          Lane {selectedLaneIdx + 1}
                        </button>
                      </div>
                    </>
                  )}

                  <div class="flex items-center gap-2">
                    <label class="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400 select-none cursor-pointer">
                      <input
                        type="checkbox"
                        checked={stripLanePrefix}
                        onChange={(e) => setStripLanePrefix((e.target as HTMLInputElement).checked)}
                        class="rounded border-slate-300 dark:border-slate-700 text-accent-600 focus:ring-accent-500"
                      />
                      <span>Omit L1/L2 prefix</span>
                    </label>

                    {s.quantSubView === 'loading' && (
                      <button
                        type="button"
                        onClick={handleExportLoadingCsv}
                        class="px-2.5 py-1.5 text-xs font-semibold rounded-lg bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 hover:bg-indigo-100 dark:hover:bg-indigo-900 transition"
                      >
                        Export Loading CSV
                      </button>
                    )}

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

              {s.quantSubView === 'loading' ? (
                /* LINE LOADING COMPARISON (PONCEAU S / TPN MODE) */
                <div class="space-y-4">
                  {/* KPI Summary Dashboard */}
                  <div class="grid gap-3 sm:grid-cols-4">
                    <div class="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/60 p-3 space-y-1">
                      <span class="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">Reference Line (Lane)</span>
                      <select
                        value={s.loadingRefLaneId || allLanesAnalysis[0]?.lane.id || ''}
                        onChange={(e) => set({ loadingRefLaneId: (e.target as HTMLSelectElement).value })}
                        class="w-full text-xs px-2 py-1 rounded border border-slate-300 dark:border-slate-700 dark:bg-slate-800 font-semibold"
                      >
                        {allLanesAnalysis.map((item, idx) => (
                          <option key={item.lane.id} value={item.lane.id}>
                            Lane {idx + 1}{laneLabels[item.lane.id] ? ` (${laneLabels[item.lane.id]})` : ''}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div class="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/60 p-3 space-y-1">
                      <span class="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">Mean Whole-Lane Signal</span>
                      <div class="text-base font-bold text-slate-900 dark:text-slate-100 mono">
                        {loadingStats.mean.toFixed(1)} <span class="text-xs text-slate-400 font-normal">OD · px</span>
                      </div>
                    </div>

                    <div class="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/60 p-3 space-y-1">
                      <span class="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">Loading Variation (CV%)</span>
                      <div class="flex items-center gap-2">
                        <span class="text-base font-bold mono text-slate-900 dark:text-slate-100">
                          {loadingStats.cvPct.toFixed(1)}%
                        </span>
                        <span
                          class={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                            loadingStats.cvPct <= 10
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300'
                              : loadingStats.cvPct <= 20
                                ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300'
                                : 'bg-rose-100 text-rose-800 dark:bg-rose-950/80 dark:text-rose-300'
                          }`}
                        >
                          {loadingStats.cvPct <= 10 ? 'Equal (≤10%)' : loadingStats.cvPct <= 20 ? 'Moderate (10-20%)' : 'High Variation (>20%)'}
                        </span>
                      </div>
                    </div>

                    <div class="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/60 p-3 space-y-1">
                      <span class="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">Loading Quality</span>
                      <div class="text-xs font-medium text-slate-700 dark:text-slate-300 pt-0.5">
                        {loadingStats.cvPct <= 10
                          ? '✅ Equal loading verified. Proceed to target quantification.'
                          : loadingStats.cvPct <= 20
                            ? '⚠️ Minor loading deviation. Apply TPN factor to correct bands.'
                            : '❌ Significant variation detected. Normalize target bands using TPN factor.'}
                      </div>
                    </div>
                  </div>

                  {/* Loading Chart — wired to the shared reference lane so the chart, its own
                      "Ref Loading Lane" dropdown, and the table below all stay in sync. */}
                  <BandQuantChart
                    analysis={allLanesAnalysis}
                    ladderKind={activeLadder.kind}
                    laneLabels={laneLabels}
                    selectedLaneId={selectedLane?.id}
                    onSelectLane={setSelectedLaneId}
                    ladderLaneId={effectiveLadderLaneId}
                    ladderSizes={activeLadder.sizes}
                    initialMode="loading"
                    loadingRefLaneId={s.loadingRefLaneId}
                    onSetLoadingRefLane={(laneId) => set({ loadingRefLaneId: laneId })}
                    plane={plane ?? undefined}
                    display={plane ? { minClip: s.minClip, maxClip: s.maxClip, gamma: s.gamma, contrast: s.contrast, brightness: s.brightness, invert: s.invertDisplay } : undefined}
                  />

                  {/* Whole-Lane Loading Table with Extracted Gel Strips */}
                  <div class="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
                    <table class="w-full text-xs text-left">
                      <thead class="bg-slate-50 dark:bg-slate-800/60 text-slate-500 uppercase tracking-wider text-[10px] border-b border-slate-200 dark:border-slate-800">
                        <tr>
                          <th class="px-3 py-2 font-semibold">Lane</th>
                          <th class="px-3 py-2 font-semibold min-w-[140px]">Physical Lane Strip</th>
                          <th class="px-3 py-2 font-semibold text-right">Total Integrated Signal</th>
                          <th class="px-3 py-2 font-semibold text-right">Bands Net Signal</th>
                          <th class="px-3 py-2 font-semibold text-right">Relative Ratio</th>
                          <th class="px-3 py-2 font-semibold text-right">Loading Deviation</th>
                          <th class="px-3 py-2 font-semibold text-right text-indigo-600 dark:text-indigo-400">TPN Factor</th>
                          <th class="px-3 py-2 font-semibold text-center">Status</th>
                          <th class="px-3 py-2 font-semibold text-center">Action</th>
                        </tr>
                      </thead>
                      <tbody class="divide-y divide-slate-100 dark:divide-slate-800">
                        {allLanesAnalysis.map((item) => {
                          const isRef = item.lane.id === (s.loadingRefLaneId || allLanesAnalysis[0]?.lane.id);
                          const customName = laneLabels[item.lane.id];
                          const dev = item.loadingDeviationPct;
                          const stripUrl = getLaneStripDataUrl(item.lane, 220, 24);

                          return (
                            <tr
                              key={item.lane.id}
                              class={`hover:bg-slate-50 dark:hover:bg-slate-800/40 transition ${
                                isRef ? 'bg-indigo-50/50 dark:bg-indigo-950/25' : ''
                              }`}
                            >
                              <td class="px-3 py-2.5 font-bold">
                                <span class="rounded bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5">
                                  {customName ? `L${item.laneIdx + 1}: ${customName}` : `L${item.laneIdx + 1}`}
                                </span>
                              </td>
                              <td class="px-3 py-2">
                                {stripUrl && (
                                  <img
                                    src={stripUrl}
                                    alt={`Lane ${item.laneIdx + 1} strip`}
                                    class="h-6 w-44 rounded border border-slate-300 dark:border-slate-700 object-cover"
                                  />
                                )}
                              </td>
                              <td class="px-3 py-2.5 mono text-right font-bold text-slate-900 dark:text-slate-100">
                                {item.totalLaneSignal.toFixed(1)}
                              </td>
                              <td class="px-3 py-2.5 mono text-right text-slate-500">
                                {item.totalBandsSignal.toFixed(1)}
                              </td>
                              <td class="px-3 py-2.5 mono text-right font-semibold">
                                {isRef ? (
                                  <span class="text-indigo-600 dark:text-indigo-400 font-bold">1.000 (Ref)</span>
                                ) : (
                                  `${item.loadingRatio.toFixed(3)}×`
                                )}
                              </td>
                              <td class="px-3 py-2.5 mono text-right font-medium">
                                {isRef ? (
                                  <span class="text-slate-400">0.0%</span>
                                ) : (
                                  <span
                                    class={
                                      Math.abs(dev) <= 10
                                        ? 'text-emerald-600 dark:text-emerald-400'
                                        : Math.abs(dev) <= 20
                                          ? 'text-amber-600 dark:text-amber-400'
                                          : 'text-rose-600 dark:text-rose-400'
                                    }
                                  >
                                    {dev > 0 ? `+${dev.toFixed(1)}%` : `${dev.toFixed(1)}%`}
                                  </span>
                                )}
                              </td>
                              <td class="px-3 py-2.5 mono text-right font-bold text-indigo-600 dark:text-indigo-400">
                                {item.normFactor.toFixed(3)}×
                              </td>
                              <td class="px-3 py-2.5 text-center">
                                {isRef ? (
                                  <span class="rounded bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 px-2 py-0.5 text-[10px] font-bold">
                                    Reference Line
                                  </span>
                                ) : Math.abs(dev) <= 15 ? (
                                  <span class="rounded bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 px-2 py-0.5 text-[10px] font-bold">
                                    Equal (±15%)
                                  </span>
                                ) : dev > 15 ? (
                                  <span class="rounded bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300 px-2 py-0.5 text-[10px] font-bold">
                                    Overloaded
                                  </span>
                                ) : (
                                  <span class="rounded bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300 px-2 py-0.5 text-[10px] font-bold">
                                    Underloaded
                                  </span>
                                )}
                              </td>
                              <td class="px-3 py-2.5 text-center">
                                {isRef ? (
                                  <span class="text-indigo-600 dark:text-indigo-400 font-bold text-xs">✓ Active Ref</span>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => set({ loadingRefLaneId: item.lane.id })}
                                    class="px-2 py-1 rounded text-xs font-semibold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition"
                                  >
                                    Set as Ref
                                  </button>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Ponceau S & Total Protein Normalization (TPN) Guidance */}
                  <div class="rounded-xl border border-indigo-200 bg-indigo-50/60 p-4 dark:border-indigo-900/60 dark:bg-indigo-950/30 text-xs text-indigo-900 dark:text-indigo-200 space-y-1.5">
                    <div class="font-bold flex items-center gap-1.5">
                      <span>💡 Scientific Recommendation: Total Protein Normalization (Ponceau S / Coomassie)</span>
                    </div>
                    <p class="leading-relaxed">
                      Leading journal guidelines (e.g. <em>Journal of Biological Chemistry</em>, <em>Nature</em>) mandate <strong>Total Protein Normalization (TPN)</strong> using reversible stains like Ponceau S or whole-lane Coomassie rather than single housekeeping genes (actin, tubulin, GAPDH). Housekeeping markers frequently saturate or vary under experimental treatments. Multiply your target protein band signal by the calculated <strong>TPN Factor</strong> to obtain rigorous, publication-grade normalized data.
                    </p>
                  </div>
                </div>
              ) : (
                /* BAND QUANTIFICATION & AMOUNTS (WITH EXTRACTED LANE STRIPS) */
                <div class="space-y-4">
                  {/* Band Quantification Chart */}
                  <BandQuantChart
                    analysis={allLanesAnalysis}
                    ladderKind={activeLadder.kind}
                    laneLabels={laneLabels}
                    selectedLaneId={selectedLane?.id}
                    onSelectLane={setSelectedLaneId}
                    ladderLaneId={effectiveLadderLaneId}
                    ladderSizes={activeLadder.sizes}
                    plane={plane ?? undefined}
                    display={plane ? { minClip: s.minClip, maxClip: s.maxClip, gamma: s.gamma, contrast: s.contrast, brightness: s.brightness, invert: s.invertDisplay } : undefined}
                  />

                  {quantLayoutMode === 'cards' ? (
                    /* LANE CARDS WITH EXTRACTED GEL STRIPS CLOSE TO DATA TABLE */
                    <div class="space-y-4">
                      {(s.tableMode === 'all' ? allLanesAnalysis : [laneAnalysis].filter(Boolean) as LaneAnalysisItem[]).map((item) => {
                        const isSelected = item.lane.id === selectedLane?.id;
                        const isLadder = item.lane.id === s.ladderLaneId;
                        const isLoadingRef = item.lane.id === (s.loadingRefLaneId || allLanesAnalysis[0]?.lane.id);
                        const customName = laneLabels[item.lane.id];
                        const stripUrl = getLaneStripDataUrl(item.lane, 560, 36);

                        return (
                          <div
                            key={item.lane.id}
                            class={`rounded-xl border bg-white dark:bg-slate-900 overflow-hidden shadow-2xs space-y-3 p-4 transition ${
                              isSelected
                                ? 'border-accent-400 dark:border-accent-600 ring-1 ring-accent-400/30'
                                : 'border-slate-200 dark:border-slate-800'
                            }`}
                          >
                            <div class="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2.5 dark:border-slate-800">
                              <div class="flex items-center gap-2">
                                <span class="font-bold text-sm text-slate-900 dark:text-slate-100">
                                  Lane {item.laneIdx + 1}{customName ? `: ${customName}` : ''}
                                </span>
                                {isLadder && (
                                  <span class="text-[10px] font-semibold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 px-1.5 py-0.5 rounded">
                                    Standard Ladder
                                  </span>
                                )}
                                {isLoadingRef && (
                                  <span class="text-[10px] font-semibold bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300 px-1.5 py-0.5 rounded">
                                    Loading Ref (1.00×)
                                  </span>
                                )}
                              </div>

                              <div class="flex items-center gap-3 text-xs">
                                <span class="text-slate-500">
                                  Total Net OD: <strong class="text-slate-900 dark:text-slate-100 mono">{item.totalNet.toFixed(1)}</strong>
                                </span>
                                <span class="text-slate-500">
                                  Bands: <strong class="text-slate-900 dark:text-slate-100">{item.metrics.length}</strong>
                                </span>
                                <button
                                  type="button"
                                  onClick={() => setSelectedLaneId(item.lane.id)}
                                  class={`px-2 py-0.5 rounded text-[11px] font-medium transition ${
                                    isSelected
                                      ? 'bg-accent-600 text-white'
                                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200'
                                  }`}
                                >
                                  {isSelected ? 'Active Lane' : 'Select'}
                                </button>
                              </div>
                            </div>

                            {/* Extracted Lane Strip with Direct Alignment Band Flags */}
                            <div class="space-y-1">
                              <div class="flex items-center justify-between text-[11px] text-slate-400">
                                <span>Extracted Physical Lane Strip &amp; Band Position:</span>
                                <span>Top / Well (y₀) → Bottom / Front (y₁)</span>
                              </div>
                              <div class="relative rounded-lg overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-950/20">
                                <svg viewBox="0 0 560 56" class="w-full h-auto block select-none">
                                  {stripUrl && (
                                    <image x="0" y="16" width="560" height="36" href={stripUrl} preserveAspectRatio="none" />
                                  )}
                                  <rect x="0" y="16" width="560" height="36" fill="none" stroke="#94a3b8" stroke-width="0.8" stroke-opacity="0.5" />
                                  {item.metrics.map(m => {
                                    if (m.peakY === undefined) return null;
                                    const frac = m.peakY / (item.lane.y1 - item.lane.y0 || 1);
                                    const px = frac * 560;
                                    const isBandRef = m.bandId === s.refBandId;
                                    const szLabel = m.sizeEst ? formatSize(m.sizeEst, activeLadder.kind) : '';

                                    return (
                                      <g
                                        key={m.bandId}
                                        class="cursor-pointer"
                                        onClick={() => set({ refBandId: isBandRef ? '' : m.bandId })}
                                        title={`Band #${m.number}${szLabel ? ` (${szLabel})` : ''} - Click to set as reference band`}
                                      >
                                        <line x1={px} y1="0" x2={px} y2="52" stroke={isBandRef ? '#10b981' : '#ef4444'} stroke-width="1.5" stroke-dasharray="2 1" />
                                        <rect x={px - 14} y="1" width="28" height="13" rx="2" fill={isBandRef ? '#10b981' : '#1e293b'} opacity="0.9" />
                                        <text x={px} y="10.5" font-size="8" font-weight="bold" fill="#ffffff" text-anchor="middle">
                                          #{m.number}
                                        </text>
                                        {szLabel && (
                                          <text x={px} y="54" font-size="7" font-weight="bold" fill="#0284c7" text-anchor="middle">
                                            {szLabel}
                                          </text>
                                        )}
                                      </g>
                                    );
                                  })}
                                </svg>
                              </div>
                            </div>

                            {/* Band Data Table for this lane */}
                            {item.metrics.length > 0 ? (
                              <div class="overflow-x-auto rounded-lg border border-slate-100 dark:border-slate-800">
                                <table class="w-full text-xs text-left">
                                  <thead class="bg-slate-50 dark:bg-slate-800/50 text-slate-500 uppercase tracking-wider text-[10px]">
                                    <tr>
                                      <th class="px-2.5 py-1.5 font-semibold">Band #</th>
                                      <th class="px-2.5 py-1.5 font-semibold">Migration Y</th>
                                      <th class="px-2.5 py-1.5 font-semibold">Est. Size</th>
                                      <th class="px-2.5 py-1.5 font-semibold text-right text-emerald-600 dark:text-emerald-400">Calibrated Mass</th>
                                      <th class="px-2.5 py-1.5 font-semibold text-right">Raw Area</th>
                                      <th class="px-2.5 py-1.5 font-semibold text-right">Baseline</th>
                                      <th class="px-2.5 py-1.5 font-semibold text-right text-slate-900 dark:text-slate-100">Net Intensity (Amount)</th>
                                      <th class="px-2.5 py-1.5 font-semibold text-right">% of Lane</th>
                                      <th class="px-2.5 py-1.5 font-semibold text-right">Ratio to Ref</th>
                                      <th class="px-2.5 py-1.5 font-semibold text-center">Status</th>
                                      <th class="px-2.5 py-1.5 font-semibold text-center">Action</th>
                                    </tr>
                                  </thead>
                                  <tbody class="divide-y divide-slate-100 dark:divide-slate-800">
                                    {item.metrics.map(m => {
                                      const isBandRef = m.bandId === s.refBandId;
                                      const isSaturated = m.saturation >= SATURATION_WARN;
                                      return (
                                        <tr
                                          key={m.bandId}
                                          class={`hover:bg-slate-50 dark:hover:bg-slate-800/40 transition ${
                                            isBandRef ? 'bg-emerald-50/50 dark:bg-emerald-950/20' : ''
                                          }`}
                                        >
                                          <td class="px-2.5 py-2 font-bold">
                                            <span class="rounded bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5">#{m.number}</span>
                                          </td>
                                          <td class="px-2.5 py-2 mono text-slate-600 dark:text-slate-400">
                                            {m.peakY !== undefined ? `${m.peakY.toFixed(1)} px` : '-'}
                                          </td>
                                          <td class="px-2.5 py-2 font-bold text-accent-600 dark:text-accent-400">
                                            {m.sizeEst ? formatSize(m.sizeEst, activeLadder.kind) : '-'}
                                          </td>
                                          <td class="px-2.5 py-2 mono text-right font-bold text-emerald-600 dark:text-emerald-400">
                                            {m.massEst ? formatMass(m.massEst, massCalibration?.unit) : '-'}
                                          </td>
                                          <td class="px-2.5 py-2 mono text-right text-slate-500">{m.raw.toFixed(1)}</td>
                                          <td class="px-2.5 py-2 mono text-right text-slate-500">{m.background.toFixed(1)}</td>
                                          <td class="px-2.5 py-2 mono text-right font-bold text-slate-900 dark:text-slate-100">
                                            {m.net.toFixed(1)}
                                          </td>
                                          <td class="px-2.5 py-2 mono text-right font-medium">{m.share.toFixed(1)}%</td>
                                          <td class="px-2.5 py-2 mono text-right">
                                            {isBandRef ? <span class="text-emerald-600 font-bold">1.00 (Ref)</span> : m.ratio.toFixed(2)}
                                          </td>
                                          <td class="px-2.5 py-2 text-center">
                                            {isSaturated ? (
                                              <span class="rounded bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-300 px-1.5 py-0.5 text-[10px] font-bold">
                                                Saturated
                                              </span>
                                            ) : (
                                              <span class="text-slate-400 text-[10px]">Linear</span>
                                            )}
                                          </td>
                                          <td class="px-2.5 py-2 text-center">
                                            <button
                                              type="button"
                                              onClick={() => removePeakFromLane(item.lane.id, m.bandId)}
                                              class="px-2 py-0.5 rounded text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-xs font-semibold transition"
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
                              <p class="text-xs text-slate-400 italic py-1">No bands detected in this lane. Click on gel image or lane profile to add.</p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    /* UNIFIED COMPACT FLAT DATA TABLE */
                    <div class="overflow-x-auto">
                      <table class="w-full text-xs text-left">
                        <thead>
                          <tr class="border-b border-slate-200 dark:border-slate-700 text-slate-500 uppercase tracking-wider">
                            {s.tableMode === 'all' && <th class="pb-2 font-semibold">Lane</th>}
                            <th class="pb-2 font-semibold">Band #</th>
                            <th class="pb-2 font-semibold">Migration Y</th>
                            <th class="pb-2 font-semibold">Est. Size</th>
                            <th class="pb-2 font-semibold text-right text-emerald-600 dark:text-emerald-400">Calibrated Mass</th>
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
                                  <td class="py-2.5 mono">{m.peakY ? `${m.peakY.toFixed(1)} px` : '-'}</td>
                                  <td class="py-2.5 font-bold text-accent-600 dark:text-accent-400">
                                    {m.sizeEst ? formatSize(m.sizeEst, activeLadder.kind) : '-'}
                                  </td>
                                  <td class="py-2.5 mono text-right font-bold text-emerald-600 dark:text-emerald-400">
                                    {m.massEst ? formatMass(m.massEst, massCalibration?.unit) : '-'}
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
                  )}
                </div>
              )}
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
      {/* Print/PDF export root: visible only in print, shows the annotated image at 100 % with title + method.
          The inline display:none is a belt-and-suspenders guard: even a stale or partial stylesheet that
          lacks the `.print-only { display: none }` rule can never render this mirrored canvas on screen.
          The @media print rule (display:block !important) still wins over the inline style when printing. */}
      <div class="print-only" style={{ display: 'none' }}>
        {plane && (
          <div style="margin: 0 auto; text-align: center; font-family: Helvetica, Arial, sans-serif;">
            <div style="font-size: 18px; font-weight: bold; margin: 12px 0 4px;">{gelTitle || 'Gel export'}</div>
            <div style="font-size: 11px; color: #475569; margin-bottom: 8px;">
              {plane.width} × {plane.height} px · {new Date().toISOString().slice(0, 10)} · Bio-Bench
            </div>
            <canvas ref={printCanvasRef} style="max-width: 100%; height: auto; border: 1px solid #e2e8f0;" />
            <div style="font-size: 10px; color: #475569; margin-top: 8px;">
              Quantification: raw-pixel densitometry with {s.bgMethod} baseline; {activeLadder.kind === 'protein' ? 'protein' : 'DNA'} ladder
              calibration ({s.calibMethod}); compare bands within one gel only.
            </div>
          </div>
        )}
      </div>
    </>
  );
}
