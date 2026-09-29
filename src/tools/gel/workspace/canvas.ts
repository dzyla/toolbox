import { useEffect } from 'preact/hooks';
import { formatSize, formatMass } from '@/core/gel/calibration';
import { type Lane } from '@/core/gel/types';
import { massFlagSuffix } from '../analysis';
import type { GelCore, GelLadders, GelAnalysis, GelBands } from '../workspace';

/** Canvas drawing and pointer interaction (lanes, bands, crop). */
export function useGelCanvas(core: GelCore, ladders: GelLadders, analysis: GelAnalysis, bands: GelBands) {
  const { bandMap, canvasRef, cropBox, cropStartRef, dragState, hasDraggedRef, isCropping, laneLabels, lanes, plane, printCanvasRef, s, set, setBandMap, setCanvasCursor, setCropBox, setDragState, setLanes, setSelectedLaneId, showLaneHeaders, showMwLabels } = core;
  const { activeLadder } = ladders;
  const { allLanesAnalysis, calibration, massCalibration, selectedLane } = analysis;
  const { placeBandAt } = bands;
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
              const text = formatMass(ms, massCalibration.unit) + massFlagSuffix(band.massFlags);
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

  return {
    getCanvasCoords,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    handleCanvasClick,
  };
}

export type GelCanvas = ReturnType<typeof useGelCanvas>;
