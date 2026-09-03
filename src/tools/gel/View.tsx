import { useEffect, useRef, useState, useMemo } from 'preact/hooks';
import { useUrlState } from '@/lib/url-state';
import { downloadText, downloadBlob, toCsv } from '@/lib/export';
import { decodeImageFile } from '@/lib/image';
import { demoGel } from '@/core/gel/synthetic';
import { autoLanes, equalLanes } from '@/core/gel/lanes';
import { sampleLane, laneProfile, detectBands } from '@/core/gel/profile';
import { rollingBaseline, valleyBaseline } from '@/core/gel/background';
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
}

const LADDERS = laddersData.ladders as unknown as StandardLadder[];

interface State {
  polarity: Polarity;
  brightness: number;
  contrast: number;
  invertDisplay: boolean;
  bgMethod: 'rolling' | 'valley' | 'none';
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
  brightness: 1.0,
  contrast: 1.0,
  invertDisplay: false,
  bgMethod: 'rolling',
  rollingRadius: 30,
  prominence: 0.05,
  ladderLaneId: '',
  ladderId: 'biorad-precision-plus-all-blue',
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
    return lanes.map((lane, laneIdx) => {
      try {
        const dens = sampleLane(plane, lane, s.polarity);
        const prof = laneProfile(dens);
        const bands = bandMap[lane.id] || toBands(detectBands(prof, { minProminence: s.prominence }));

        let baseline: Float32Array;
        if (s.bgMethod === 'rolling') {
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
  }, [plane, lanes, selectedLane, allLanesAnalysis, s.brightness, s.contrast, s.invertDisplay, s.ladderLaneId, calibration, activeLadder, isCropping, cropBox, laneLabels, showMwLabels, showLaneHeaders]);

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

  function updateSelectedLane(patch: Partial<Lane>) {
    if (!selectedLane) return;
    setLanes(lanes.map(l => l.id === selectedLane.id ? { ...l, ...patch } : l));
  }

  // Export CSV
  function handleExportCsv() {
    const rows = [
      ['Lane_Number', 'Lane_ID', 'Lane_Custom_Name', 'Band_Number', 'Migration_Y_px', 'Estimated_Size', 'Raw_Area', 'Baseline_Area', 'Net_Intensity', 'Percent_Of_Lane', 'Ratio_To_Reference', 'Saturated'],
      ...allLanesAnalysis.flatMap(item =>
        item.metrics.map(m => [
          item.laneIdx + 1,
          item.lane.id,
          laneLabels[item.lane.id] || `Lane ${item.laneIdx + 1}`,
          m.number,
          m.peakY ? Number(m.peakY.toFixed(2)) : '',
          m.sizeEst ? Number(m.sizeEst.toFixed(1)) : '',
          Number(m.raw.toFixed(1)),
          Number(m.background.toFixed(1)),
          Number(m.net.toFixed(1)),
          Number(m.share.toFixed(2)),
          Number(m.ratio.toFixed(2)),
          m.saturation >= SATURATION_WARN ? 'YES' : 'NO',
        ])
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
                {LADDERS.map(l => (
                  <option key={l.id} value={l.id}>{l.name} [{l.kind.toUpperCase()}]</option>
                ))}
              </select>
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
          {s.viewTab === 'gel' && (
            <div class="grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
              {/* Gel Canvas Card */}
              <div class="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 space-y-2">
                <div class="flex items-center justify-between">
                  <div class="flex items-center gap-2">
                    <h3 class="font-bold text-sm text-slate-900 dark:text-slate-100">Gel Image & Annotations</h3>
                    <span class="text-xs text-slate-400 mono">
                      {plane ? `${plane.width} × ${plane.height} px` : ''}
                    </span>
                  </div>
                  <div class="flex items-center gap-3 text-xs text-slate-500">
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

                <div class="overflow-auto max-h-[700px] border border-slate-200 rounded-xl dark:border-slate-800 flex justify-center bg-slate-950/5">
                  <canvas
                    ref={canvasRef}
                    onMouseDown={handleMouseDown}
                    onMouseMove={handleMouseMove}
                    onMouseUp={handleMouseUp}
                    style={{ cursor: canvasCursor }}
                    class="max-w-full h-auto block select-none"
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
                      Migration distance $Y$ (top → bottom) vs band optical density
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
                    <svg viewBox="0 0 500 240" class="w-full h-auto rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                      {/* Grid Lines */}
                      <line x1="40" y1="20" x2="40" y2="200" stroke="#94a3b8" stroke-width="1" stroke-opacity="0.3" />
                      <line x1="40" y1="200" x2="480" y2="200" stroke="#94a3b8" stroke-width="1" stroke-opacity="0.3" />

                      {/* Signal Curve */}
                      <path
                        d={laneAnalysis.profile.reduce((acc, val, i) => {
                          const x = 40 + (i / laneAnalysis.profile.length) * 440;
                          const y = 200 - Math.min(1, Math.max(0, val)) * 170;
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
                          const y = 200 - Math.min(1, Math.max(0, val)) * 170;
                          return i === 0 ? `M ${x} ${y}` : `${acc} L ${x} ${y}`;
                        }, '')}
                        fill="none"
                        stroke="#f59e0b"
                        stroke-dasharray="3 3"
                        stroke-width="1.5"
                      />

                      {/* Peak Markers */}
                      {laneAnalysis.metrics.map((m) => {
                        if (m.peakY === undefined) return null;
                        const frac = m.peakY / (laneAnalysis.lane.y1 - laneAnalysis.lane.y0 || 1);
                        const px = 40 + frac * 440;
                        const val = laneAnalysis.profile[Math.min(laneAnalysis.profile.length - 1, Math.round(frac * laneAnalysis.profile.length))] ?? 0;
                        const py = 200 - Math.min(1, Math.max(0, val)) * 170;
                        const isRef = m.bandId === s.refBandId;

                        return (
                          <g
                            key={m.bandId}
                            class="cursor-pointer"
                            onClick={(e) => {
                              if (e.ctrlKey || e.metaKey) {
                                // remove
                                const updated = (bandMap[selectedLane?.id || ''] || []).filter(b => b.id !== m.bandId);
                                setBandMap(prev => ({ ...prev, [selectedLane!.id]: updated }));
                              } else {
                                set({ refBandId: m.bandId });
                              }
                            }}
                          >
                            <circle cx={px} cy={py} r={isRef ? 5 : 4} fill={isRef ? '#10b981' : '#ef4444'} stroke="#ffffff" stroke-width="1.5" />
                            <text x={px} y={py - 8} font-size="9" text-anchor="middle" fill="#64748b" font-weight="bold">
                              #{m.number}
                            </text>
                          </g>
                        );
                      })}
                    </svg>

                    {/* Peak quick chips */}
                    <div class="space-y-1.5">
                      <span class="text-xs font-semibold text-slate-500 uppercase tracking-wider block">
                        Detected Peaks in Lane {selectedLaneIdx + 1} ({laneAnalysis.metrics.length})
                      </span>
                      <div class="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto">
                        {laneAnalysis.metrics.map(m => (
                          <div
                            key={m.bandId}
                            class={`inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-medium border ${
                              m.bandId === s.refBandId
                                ? 'bg-emerald-50 border-emerald-300 text-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-200'
                                : 'bg-slate-50 border-slate-200 text-slate-700 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300'
                            }`}
                          >
                            <span>#{m.number}: {m.sizeEst ? formatSize(m.sizeEst, activeLadder.kind) : `${Math.round(m.peakY ?? 0)}px`}</span>
                            <span class="text-slate-400">({m.share.toFixed(1)}%)</span>
                            <button
                              type="button"
                              onClick={() => {
                                const updated = (bandMap[selectedLane?.id || ''] || []).filter(b => b.id !== m.bandId);
                                setBandMap(prev => ({ ...prev, [selectedLane!.id]: updated }));
                              }}
                              class="text-slate-400 hover:text-red-600 ml-1"
                              title="Delete band"
                            >
                              ✕
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : (
                  <p class="text-xs text-slate-400 py-8 text-center">No densitometry profile data available for this lane.</p>
                )}
              </div>
            </div>
          )}

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

                  <button
                    type="button"
                    onClick={handleExportCsv}
                    class="px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                  >
                    Export All Lanes CSV
                  </button>
                </div>
              </div>

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
              const summary = `Gel & Blot Analysis Summary\nImage: ${imageName}\nLanes: ${lanes.length}`;
              return `${summary}\n\n${scienceText(SCIENCE)}`;
            }}
            shareUrl={shareUrl}
          />
          <button
            type="button"
            onClick={handleExportCsv}
            class="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800 transition"
          >
            Export All Lanes CSV
          </button>
        </div>
      }
      science={<SciencePanel science={SCIENCE} />}
    />
  );
}
