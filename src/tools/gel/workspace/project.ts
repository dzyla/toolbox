import { mergeLinkState } from '@/lib/url-state';
import { useToolProject } from '@/lib/use-tool-project';
import { canvasThumbnail } from '@/lib/image';
import { gelProjectSnapshot, restoreGelProject } from '../project';
import type { GelCore } from '../workspace';
import { DEFAULTS } from '../workspace-model';

/** Save/restore of gel projects (/p/:id). */
export function useGelProject(projectId: string | undefined, core: GelCore) {
  const { bandMap, canvasRef, customMassMap, gelLayout, gelTitle, imageName, laneLabels, lanes, plane, selectedLaneId, setBandMap, setLadderSizeMap, setBasePlane, setCropBox, setCustomMassMap, setDeskewAngle, setGelLayout, setGelTitle, setImageError, setImageName, setIsCropping, setLaneLabels, setLanes, setOriginalPlane, setPlane, setSelectedLaneId, setShowLaneHeaders, setShowMwLabels, setStripLanePrefix, setSourceInfo, setAppliedTransforms, showLaneHeaders, showMwLabels, stateSig, stripLanePrefix } = core;

  // Saved projects: restore from /p/:id and save the working image + annotations on this device.
  const project = useToolProject('gel', projectId, async stored => {
    const { plane: savedPlane, data } = await restoreGelProject(stored);
    setOriginalPlane(savedPlane);
    setBasePlane(savedPlane);
    setPlane(savedPlane);
    setImageName(data.imageName);
    setGelTitle(data.gelTitle);
    setDeskewAngle(0);
    setIsCropping(false);
    setCropBox(null);
    setLanes(data.lanes);
    setSelectedLaneId(data.selectedLaneId);
    setBandMap(data.bandMap);
    setLadderSizeMap({});
    setLaneLabels(data.laneLabels);
    setCustomMassMap(data.customMassMap);
    setSourceInfo(null);
    setAppliedTransforms([]);
    setShowMwLabels(data.display.showMwLabels);
    setShowLaneHeaders(data.display.showLaneHeaders);
    setStripLanePrefix(data.display.stripLanePrefix);
    setGelLayout(data.display.gelLayout);
    stateSig.value = mergeLinkState(DEFAULTS, data.settings);
  });

  async function handleSaveProject() {
    if (!plane) return;
    let snapshot;
    try {
      snapshot = gelProjectSnapshot(plane, {
        imageName, gelTitle, lanes, selectedLaneId, bandMap, laneLabels, customMassMap,
        display: { showMwLabels, showLaneHeaders, stripLanePrefix, gelLayout },
        settings: { ...stateSig.value },
      }, await canvasThumbnail(canvasRef.current));
    } catch (err) {
      setImageError(err instanceof Error ? err.message : String(err));
      return;
    }
    await project.save(snapshot);
  }

  return {
    project,
    handleSaveProject,
  };
}

export type GelProject = ReturnType<typeof useGelProject>;
