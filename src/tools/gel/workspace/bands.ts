import { sampleLane, laneProfile, detectBands, refitBandNear } from '@/core/gel/profile';
import { toBands } from '../analysis';
import type { GelCore, GelAnalysis } from '../workspace';

/** Band placement, removal and detection on the selected lane profile. */
export function useGelBands(core: GelCore, analysis: GelAnalysis) {
  const { bandMap, lanes, plane, s, set, setBandMap } = core;
  const { allLanesAnalysis, laneAnalysis, selectedLane } = analysis;

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

  return {
    removePeakFromLane,
    placeBandAt,
    handleAutoFindBands,
    handleProfileSvgClick,
  };
}

export type GelBands = ReturnType<typeof useGelBands>;
