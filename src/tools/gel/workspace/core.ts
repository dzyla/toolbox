import { useEffect, useRef, useState } from 'preact/hooks';
import type { SourceInfo } from '@/lib/image';
import { useUrlState } from '@/lib/url-state';
import { type Plane, type Lane, type Band } from '@/core/gel/types';
import { DEFAULTS, migrateState, type State } from '../workspace-model';

/** Link settings, image planes, lanes, bands, annotations, layout and canvas refs. */
export function useGelCore() {

  const [stateSig, shareUrl] = useUrlState<State>('gel', DEFAULTS);
  const s = migrateState(stateSig.value);
  const set = (patch: Partial<State>) => { stateSig.value = { ...migrateState(stateSig.value), ...patch }; };

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
  const [imageError, setImageError] = useState('');

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

  // Densitometric Mass Calibration
  const [customMassMap, setCustomMassMap] = useState<Record<string, number>>({});
  // Manual ladder overrides: a number pins that band's size, null excludes the band from calibration.
  const [ladderSizeMap, setLadderSizeMap] = useState<Record<string, number | null>>({});

  // Where the pixels came from and what was done to them (data-quality panel, methods text).
  const [sourceInfo, setSourceInfo] = useState<SourceInfo | null>(null);
  const [appliedTransforms, setAppliedTransforms] = useState<string[]>([]);

  return {
    sourceInfo,
    setSourceInfo,
    appliedTransforms,
    setAppliedTransforms,
    stateSig,
    shareUrl,
    s,
    set,
    originalPlane,
    setOriginalPlane,
    basePlane,
    setBasePlane,
    plane,
    setPlane,
    imageName,
    setImageName,
    lanes,
    setLanes,
    selectedLaneId,
    setSelectedLaneId,
    bandMap,
    setBandMap,
    numLanesInput,
    setNumLanesInput,
    gelTitle,
    setGelTitle,
    laneLabels,
    setLaneLabels,
    showMwLabels,
    setShowMwLabels,
    showLaneHeaders,
    setShowLaneHeaders,
    stripLanePrefix,
    setStripLanePrefix,
    gelLayout,
    setGelLayout,
    canvasZoom,
    setCanvasZoom,
    imageError,
    setImageError,
    deskewAngle,
    setDeskewAngle,
    isCropping,
    setIsCropping,
    cropBox,
    setCropBox,
    cropStartRef,
    dragState,
    setDragState,
    hasDraggedRef,
    canvasCursor,
    setCanvasCursor,
    quantLayoutMode,
    setQuantLayoutMode,
    canvasRef,
    printCanvasRef,
    fileInputRef,
    customMassMap,
    setCustomMassMap,
    ladderSizeMap,
    setLadderSizeMap,
  };
}

export type GelCore = ReturnType<typeof useGelCore>;
