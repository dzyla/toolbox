import { autoLanes, equalLanes, gridLanesFromPlaced } from '@/core/gel/lanes';
import { type Lane } from '@/core/gel/types';
import type { GelCore, GelAnalysis } from '../workspace';

/** Lane creation, detection and editing. */
export function useGelLanes(core: GelCore, analysis: GelAnalysis) {
  const { lanes, numLanesInput, plane, s, selectedLaneId, set, setBandMap, setLadderSizeMap, setLanes, setSelectedLaneId } = core;
  const { selectedLane } = analysis;

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
    setBandMap({}); setLadderSizeMap({});
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
      setBandMap({}); setLadderSizeMap({});
      set({ ladderLaneId: '', refBandId: '', loadingRefLaneId: '', massLaneId: '' });
    }
  }

  function handleClearAllLanes() {
    setLanes([]);
    setSelectedLaneId('');
    setBandMap({}); setLadderSizeMap({});
    set({ ladderLaneId: '', refBandId: '' });
  }

  function updateSelectedLane(patch: Partial<Lane>) {
    if (!selectedLane) return;
    setLanes(lanes.map(l => l.id === selectedLane.id ? { ...l, ...patch } : l));
  }

  return {
    handleGridFromPlaced,
    handleAddLane,
    handleAutoLanes,
    handleEqualLanes,
    handleDeleteSelectedLane,
    handleClearAllLanes,
    updateSelectedLane,
  };
}

export type GelLanes = ReturnType<typeof useGelLanes>;
