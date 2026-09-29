import { useEffect } from 'preact/hooks';
import { importErrorMessage } from '@/lib/file-import';
import { decodeImageFile, sourceInfoOf } from '@/lib/image';
import { demoGel } from '@/core/gel/synthetic';
import { autoLanes, equalLanes } from '@/core/gel/lanes';
import { detectPolarity } from '@/core/gel/quant';
import { transformPlane, type Geometry } from '@/core/gel/transform';
import type { GelCore, GelAnalysis, GelProject } from '../workspace';

/** Image loading (demo, upload) and orientation/crop transforms. */
export function useGelImage(core: GelCore, analysis: GelAnalysis, projectApi: GelProject) {
  const { basePlane, cropBox, lanes, originalPlane, plane, set, setBandMap, setBasePlane, setCropBox, setCustomMassMap, setDeskewAngle, setImageError, setImageName, setIsCropping, setLanes, setOriginalPlane, setPlane, setSelectedLaneId, setSourceInfo, setAppliedTransforms } = core;
  const { cropSuggestion } = analysis;
  const { project } = projectApi;

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
    setSourceInfo({ format: 'demo', bitDepth: 32, lossy: false, rescaled: false });
    setAppliedTransforms([]);
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
    setImageError('');
    try {
      const decoded = await decodeImageFile(file);
      project.detach();
      const newPlane = { width: decoded.width, height: decoded.height, data: decoded.data };
      setOriginalPlane(newPlane);
      setBasePlane(newPlane);
      setPlane(newPlane);
      setImageName(file.name);
      setSourceInfo(sourceInfoOf(decoded));
      setAppliedTransforms([]);
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
      setImageError(importErrorMessage(err, file.name));
    }
  }

  // Transformations
  function applyRotation(deltaDeg: number) {
    if (!plane) return;
    const g: Geometry = { rotation: deltaDeg, flipH: false, flipV: false };
    const rotated = transformPlane(plane, g);
    setBasePlane(rotated);
    setPlane(rotated);
    setAppliedTransforms(t => [...t, `rotate ${deltaDeg}° (exact)`]);
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
    setAppliedTransforms(t => [...t, `flip ${horizontal ? 'horizontal' : 'vertical'} (exact)`]);
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
    setAppliedTransforms(t => [...t, 'crop (exact)']);
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
    setAppliedTransforms([]);
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
    setAppliedTransforms(t => [...t, `auto crop + deskew ${rotation.toFixed(2)}° (resampled)`]);
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

  return {
    loadDemo,
    handleFileUpload,
    applyRotation,
    applyFlip,
    handleDeskewChange,
    handleApplyCrop,
    handleResetAllTransforms,
    handleApplySuggestion,
  };
}

export type GelImage = ReturnType<typeof useGelImage>;
