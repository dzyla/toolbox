import { useMemo } from 'preact/hooks';
import { sampleLane, laneProfile, detectBands } from '@/core/gel/profile';
import { sharedCrossLaneBaseline, baselineFor, integrateLaneSignal } from '@/core/gel/background';
import { quantifyBands } from '@/core/gel/quant';
import { fitCalibration, fitMassCalibration, MASS_STANDARD_PRESETS, type Calibration, type CalibrationPoint, type MassCalibration, type MassCalibrationPoint } from '@/core/gel/calibration';
import { suggestGelCropAndTilt } from '@/core/gel/transform';
import { type Lane } from '@/core/gel/types';
import { type LaneAnalysisItem, toBands } from '../analysis';
import type { GelCore, GelLadders } from '../workspace';

/** Size and mass calibrations, the all-lanes densitometry analysis and derived selections. */
export function useGelAnalysis(core: GelCore, ladders: GelLadders) {
  const { bandMap, customMassMap, lanes, plane, s, selectedLaneId } = core;
  const { activeLadder } = ladders;

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

  return {
    effectiveLadderLaneId,
    calibration,
    massCalibration,
    allLanesAnalysis,
    selectedLane,
    selectedLaneIdx,
    laneAnalysis,
    loadingStats,
    cropSuggestion,
    getLaneStripDataUrl,
    laneStripDataUrl,
  };
}

export type GelAnalysis = ReturnType<typeof useGelAnalysis>;
