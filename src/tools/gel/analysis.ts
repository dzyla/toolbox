/* Gel lane analysis view model and cross-lane target-band matching (pure, DOM-free). */
import { detectBands } from '@/core/gel/profile';
import { type BandMetrics } from '@/core/gel/quant';
import { formatSize, type MassFlags } from '@/core/gel/calibration';
import { type Lane, type Band } from '@/core/gel/types';

export interface LaneAnalysisItem {
  lane: Lane;
  laneIdx: number;
  profile: Float32Array;
  baseline: Float32Array;
  netProfile: Float32Array;
  metrics: (Omit<BandMetrics, 'saturation'> & { saturation: number | null; number: number; share: number; ratio: number; sizeEst: number | null; massEst: number | null; massFlags: MassFlags | null; ladderAssigned: number | null; sizeResidualPct: number | null })[];
  totalNet: number;
  totalBandsSignal: number;
  totalLaneSignal: number;
  loadingRatio: number;
  loadingDeviationPct: number;
  normFactor: number;
}

export type QuantBandMetric = LaneAnalysisItem['metrics'][number];

export function toBands(peaks: ReturnType<typeof detectBands>): Band[] {
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

/** Label suffix marking a mass that is extrapolated (" *") and/or below the limit of quantitation (" <LOQ"). */
export function massFlagSuffix(flags: MassFlags | null | undefined): string {
  if (!flags) return '';
  return (flags.extrapolated ? ' *' : '') + (flags.belowLoq ? ' <LOQ' : '');
}
