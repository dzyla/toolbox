import { useState, useRef, useEffect } from "preact/hooks";
import {
  type MrcData,
  parseMrc,
  generateDemoClasses,
  generateDemo3DVolume,
  renderSliceToCanvas,
} from "@/core/cryoem";

interface MrcViewerProps {
  expanded?: boolean;
  onToggleExpand?: () => void;
}

export function MrcViewer({ expanded, onToggleExpand }: MrcViewerProps = {}) {
  const [mrcData, setMrcData] = useState<MrcData>(() => generateDemoClasses(12, 64));
  const [viewMode, setViewMode] = useState<"gallery" | "orthoslice" | "mip">("gallery");
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(() => new Set(Array.from({ length: 12 }, (_, i) => i)));
  const [blackLevel, setBlackLevel] = useState<number>(0.05);
  const [whiteLevel, setWhiteLevel] = useState<number>(0.95);
  const [invert, setInvert] = useState<boolean>(false);
  const [gamma, setGamma] = useState<number>(1.0);
  const [cols, setCols] = useState<number>(4);
  const [cardSize, setCardSize] = useState<"compact" | "normal" | "large">("normal");
  const [showScaleBar, setShowScaleBar] = useState<boolean>(true);
  const [scaleBarLengthA, setScaleBarLengthA] = useState<number>(50);
  const [showLabels, setShowLabels] = useState<boolean>(true);

  // Publication Export Settings Drawer & Options
  const [showExportOptions, setShowExportOptions] = useState<boolean>(false);
  const [exportShowNumbers, setExportShowNumbers] = useState<boolean>(true);
  const [exportCols, setExportCols] = useState<string>("auto");

  // Orthoslice coordinates
  const [orthoX, setOrthoX] = useState<number>(() => Math.floor(mrcData.header.nx / 2));
  const [orthoY, setOrthoY] = useState<number>(() => Math.floor(mrcData.header.ny / 2));
  const [orthoZ, setOrthoZ] = useState<number>(() => Math.floor(mrcData.header.nz / 2));

  // 3D Maximum Intensity Projection (MIP) state
  const [mipPlane, setMipPlane] = useState<"all" | "xy" | "xz" | "yz">("all");
  const [mipFullVolume, setMipFullVolume] = useState<boolean>(true);
  const [mipSlabRange, setMipSlabRange] = useState<{ start: number; end: number }>(() => ({
    start: 0,
    end: Math.max(0, mrcData.header.nz - 1),
  }));

  const [loadingError, setLoadingError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Canvas refs for orthoslices
  const canvasXyRef = useRef<HTMLCanvasElement>(null);
  const canvasXzRef = useRef<HTMLCanvasElement>(null);
  const canvasYzRef = useRef<HTMLCanvasElement>(null);

  // Canvas refs for 3D MIP
  const canvasMipXyRef = useRef<HTMLCanvasElement>(null);
  const canvasMipXzRef = useRef<HTMLCanvasElement>(null);
  const canvasMipYzRef = useRef<HTMLCanvasElement>(null);
  const canvasMipSingleRef = useRef<HTMLCanvasElement>(null);

  const totalSlices = mrcData.slices.length;

  // Keep orthoslice and MIP coordinates inside bounds when dataset changes
  useEffect(() => {
    setOrthoX(Math.floor(mrcData.header.nx / 2));
    setOrthoY(Math.floor(mrcData.header.ny / 2));
    setOrthoZ(Math.floor(mrcData.header.nz / 2));
    setMipSlabRange({ start: 0, end: Math.max(0, mrcData.header.nz - 1) });
    setSelectedIndices(new Set(Array.from({ length: mrcData.slices.length }, (_, i) => i)));
    if (mrcData.header.is3DVolume) {
      if (viewMode === "gallery") {
        setViewMode("orthoslice");
      }
    } else {
      setViewMode("gallery");
    }
  }, [mrcData]);

  // Update orthoslice canvases
  useEffect(() => {
    if (viewMode !== "orthoslice") return;

    if (canvasXyRef.current) {
      const orthoXy = mrcData.getOrthoslice("xy", orthoZ);
      renderSliceToCanvas(canvasXyRef.current, orthoXy.data, orthoXy.width, orthoXy.height, {
        blackLevel,
        whiteLevel,
        invert,
        gamma,
      });
    }

    if (canvasXzRef.current) {
      const orthoXz = mrcData.getOrthoslice("xz", orthoY);
      renderSliceToCanvas(canvasXzRef.current, orthoXz.data, orthoXz.width, orthoXz.height, {
        blackLevel,
        whiteLevel,
        invert,
        gamma,
      });
    }

    if (canvasYzRef.current) {
      const orthoYz = mrcData.getOrthoslice("yz", orthoX);
      renderSliceToCanvas(canvasYzRef.current, orthoYz.data, orthoYz.width, orthoYz.height, {
        blackLevel,
        whiteLevel,
        invert,
        gamma,
      });
    }
  }, [mrcData, viewMode, orthoX, orthoY, orthoZ, blackLevel, whiteLevel, invert, gamma]);

  // Update 3D MIP canvases
  useEffect(() => {
    if (viewMode !== "mip") return;

    const s = mipFullVolume ? 0 : mipSlabRange.start;
    const e = mipFullVolume ? mrcData.header.nz - 1 : mipSlabRange.end;

    if (mipPlane === "all") {
      if (canvasMipXyRef.current) {
        const mipXy = mrcData.getMaxProjection("xy", s, e);
        renderSliceToCanvas(canvasMipXyRef.current, mipXy.data, mipXy.width, mipXy.height, {
          blackLevel,
          whiteLevel,
          invert,
          gamma,
        });
      }
      if (canvasMipXzRef.current) {
        const mipXz = mrcData.getMaxProjection("xz", mipFullVolume ? 0 : undefined, mipFullVolume ? mrcData.header.ny - 1 : undefined);
        renderSliceToCanvas(canvasMipXzRef.current, mipXz.data, mipXz.width, mipXz.height, {
          blackLevel,
          whiteLevel,
          invert,
          gamma,
        });
      }
      if (canvasMipYzRef.current) {
        const mipYz = mrcData.getMaxProjection("yz", mipFullVolume ? 0 : undefined, mipFullVolume ? mrcData.header.nx - 1 : undefined);
        renderSliceToCanvas(canvasMipYzRef.current, mipYz.data, mipYz.width, mipYz.height, {
          blackLevel,
          whiteLevel,
          invert,
          gamma,
        });
      }
    } else {
      if (canvasMipSingleRef.current) {
        const mip = mrcData.getMaxProjection(mipPlane, s, e);
        renderSliceToCanvas(canvasMipSingleRef.current, mip.data, mip.width, mip.height, {
          blackLevel,
          whiteLevel,
          invert,
          gamma,
        });
      }
    }
  }, [mrcData, viewMode, mipPlane, mipFullVolume, mipSlabRange, blackLevel, whiteLevel, invert, gamma]);

  function handleFile(file: File) {
    setLoadingError(null);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const buffer = e.target?.result as ArrayBuffer;
        if (!buffer) return;
        const parsed = parseMrc(buffer);
        setMrcData(parsed);
      } catch (err) {
        setLoadingError((err as Error).message);
      }
    };
    reader.onerror = () => {
      setLoadingError("Failed to read file from disk.");
    };
    reader.readAsArrayBuffer(file);
  }

  function toggleSelect(index: number) {
    const next = new Set(selectedIndices);
    if (next.has(index)) {
      next.delete(index);
    } else {
      next.add(index);
    }
    setSelectedIndices(next);
  }

  function selectAll() {
    setSelectedIndices(new Set(Array.from({ length: totalSlices }, (_, i) => i)));
  }

  function selectNone() {
    setSelectedIndices(new Set());
  }

  function invertSelection() {
    const next = new Set<number>();
    for (let i = 0; i < totalSlices; i++) {
      if (!selectedIndices.has(i)) next.add(i);
    }
    setSelectedIndices(next);
  }

  function applyPreset(preset: "cryo" | "ns" | "high" | "reset") {
    if (preset === "cryo") {
      setInvert(false);
      setBlackLevel(0.05);
      setWhiteLevel(0.95);
      setGamma(1.0);
    } else if (preset === "ns") {
      setInvert(true);
      setBlackLevel(0.08);
      setWhiteLevel(0.92);
      setGamma(1.1);
    } else if (preset === "high") {
      setBlackLevel(0.15);
      setWhiteLevel(0.85);
      setGamma(1.25);
    } else if (preset === "reset") {
      setInvert(false);
      setBlackLevel(0.05);
      setWhiteLevel(0.95);
      setGamma(1.0);
    }
  }

  // Publication PNG Export
  function exportPublicationPng() {
    const selectedList = Array.from(selectedIndices).sort((a, b) => a - b);
    if (selectedList.length === 0) {
      alert("Please select at least one particle or class average to export.");
      return;
    }

    const { nx, ny, pixelSize } = mrcData.header;
    const scaleFactor = 2; // 2x supersampling
    const cellW = nx * scaleFactor;
    const cellH = ny * scaleFactor;
    const activeCols = exportCols === "auto" ? cols : parseInt(exportCols, 10);
    const numCols = Math.min(activeCols, selectedList.length);
    const numRows = Math.ceil(selectedList.length / numCols);
    const gap = 12;
    const pad = 24;

    const totalW = pad * 2 + numCols * cellW + (numCols - 1) * gap;
    const totalH = pad * 2 + numRows * cellH + (numRows - 1) * gap;

    const exportCanvas = document.createElement("canvas");
    exportCanvas.width = totalW;
    exportCanvas.height = totalH;
    const ctx = exportCanvas.getContext("2d");
    if (!ctx) return;

    // Background
    ctx.fillStyle = invert ? "#ffffff" : "#090d16";
    ctx.fillRect(0, 0, totalW, totalH);

    // Scratch canvas for individual slice rendering
    const scratchCanvas = document.createElement("canvas");

    selectedList.forEach((sliceIdx, i) => {
      const col = i % numCols;
      const row = Math.floor(i / numCols);
      const posX = pad + col * (cellW + gap);
      const posY = pad + row * (cellH + gap);

      const sliceData = mrcData.slices[sliceIdx]!;
      renderSliceToCanvas(scratchCanvas, sliceData, nx, ny, {
        blackLevel,
        whiteLevel,
        invert,
        gamma,
      });

      // Draw particle thumbnail
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(scratchCanvas, posX, posY, cellW, cellH);

      // Border outline
      ctx.strokeStyle = invert ? "#e2e8f0" : "#1e293b";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(posX, posY, cellW, cellH);

      // Optional label
      if (exportShowNumbers) {
        ctx.fillStyle = invert ? "#0f172a" : "#f8fafc";
        ctx.font = "bold 16px monospace";
        ctx.textAlign = "left";
        ctx.fillText(`#${sliceIdx + 1}`, posX + 8, posY + 20);
      }
    });

    // Optional Scale Bar on last item or bottom corner
    if (showScaleBar && pixelSize > 0) {
      const barLengthPx = (scaleBarLengthA / pixelSize) * scaleFactor;
      const barX = totalW - pad - barLengthPx - 8;
      const barY = totalH - pad - 16;

      ctx.fillStyle = invert ? "#0f172a" : "#ffffff";
      ctx.fillRect(barX, barY, barLengthPx, 5);

      ctx.font = "bold 14px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(`${scaleBarLengthA} Å`, barX + barLengthPx / 2, barY - 6);
    }

    const dataUrl = exportCanvas.toDataURL("image/png");
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = `cryoem_classes_${selectedList.length}particles.png`;
    a.click();
  }

  // Export 3D MIP as PNG
  function exportMipPng() {
    const activeCanvas = mipPlane === "all" ? canvasMipXyRef.current : canvasMipSingleRef.current;
    if (!activeCanvas) return;
    const dataUrl = activeCanvas.toDataURL("image/png");
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = `cryoem_mip_${mipPlane === "all" ? "xy" : mipPlane}.png`;
    a.click();
  }

  // Export Selected as MRCS binary file
  function exportSelectedMrcs() {
    const selectedList = Array.from(selectedIndices).sort((a, b) => a - b);
    if (selectedList.length === 0) {
      alert("Please select at least one particle to export.");
      return;
    }

    const { nx, ny, pixelSize } = mrcData.header;
    const nzSelected = selectedList.length;
    const sliceBytes = nx * ny * 4; // float32
    const totalBytes = 1024 + nzSelected * sliceBytes;

    const buffer = new ArrayBuffer(totalBytes);
    const view = new DataView(buffer);

    // Standard little-endian MRC header
    view.setInt32(0, nx, true);
    view.setInt32(4, ny, true);
    view.setInt32(8, nzSelected, true);
    view.setInt32(12, 2, true); // float32 mode

    view.setInt32(28, nx, true);
    view.setInt32(32, ny, true);
    view.setInt32(36, nzSelected, true);

    view.setFloat32(40, nx * pixelSize, true);
    view.setFloat32(44, ny * pixelSize, true);
    view.setFloat32(48, nzSelected * pixelSize, true);
    view.setFloat32(52, 90, true);
    view.setFloat32(56, 90, true);
    view.setFloat32(60, 90, true);

    view.setInt32(64, 1, true); // mapc
    view.setInt32(68, 2, true); // mapr
    view.setInt32(72, 3, true); // maps

    // MAP stamp
    const mapStr = "MAP ";
    for (let i = 0; i < 4; i++) {
      view.setUint8(208 + i, mapStr.charCodeAt(i));
    }
    // Machine stamp (little endian)
    view.setUint8(212, 0x44);
    view.setUint8(213, 0x44);

    // Copy selected float arrays
    let offset = 1024;
    for (const idx of selectedList) {
      const slice = mrcData.slices[idx]!;
      const floatTarget = new Float32Array(buffer, offset, nx * ny);
      floatTarget.set(slice);
      offset += sliceBytes;
    }

    const blob = new Blob([buffer], { type: "application/octet-stream" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `selected_classes_${nzSelected}.mrcs`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div class="space-y-4">
      {/* Top Action Bar & File Loader */}
      <div class="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 shadow-sm space-y-3">
        <div class="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
          <div>
            <div class="flex flex-wrap items-center gap-2">
              <h2 class="text-base font-bold text-slate-900 dark:text-slate-100">
                Cryo-EM / NS MRC Particle &amp; Volume Viewer
              </h2>
              <span class="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded-full bg-amber-100 text-amber-800 border border-amber-300 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800">
                Research Preview
              </span>
              {onToggleExpand && (
                <button
                  type="button"
                  onClick={onToggleExpand}
                  class={`px-2 py-0.5 rounded text-[11px] font-semibold transition border ${
                    expanded
                      ? "bg-accent-100 text-accent-800 border-accent-300 dark:bg-accent-950 dark:text-accent-300 dark:border-accent-700"
                      : "bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-300 dark:border-slate-700"
                  }`}
                  title={expanded ? "Collapse full width to restore sidebar" : "Expand viewer across full width"}
                >
                  {expanded ? "⤢ Collapse Sidebar" : "⤢ Expand Fullscreen"}
                </button>
              )}
            </div>
            <p class="text-xs text-slate-500">
              Curate 2D class average stacks (.mrcs), inspect 3D orthogonal slices, and generate 3D Maximum Intensity Projections (MIP).
            </p>
          </div>

          <div class="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setMrcData(generateDemoClasses(16, 64))}
              class="px-2.5 py-1.5 text-xs font-semibold rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:hover:bg-indigo-900 dark:text-indigo-300 transition"
            >
              Demo 2D Classes (Example 2D)
            </button>
            <button
              type="button"
              onClick={() => setMrcData(generateDemo3DVolume(48))}
              class="px-2.5 py-1.5 text-xs font-semibold rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:hover:bg-emerald-900 dark:text-emerald-300 transition"
            >
              Demo 3D Volume (Shell)
            </button>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              class="px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-900 text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white transition"
            >
              Upload MRC / MRCS
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".mrc,.mrcs,.map,.ccp4"
              class="hidden"
              onChange={(e) => {
                const file = (e.target as HTMLInputElement).files?.[0];
                if (file) handleFile(file);
              }}
            />
          </div>
        </div>

        {/* Research Preview Notice Banner */}
        <div class="p-3 rounded-xl bg-amber-50/90 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 text-amber-900 dark:text-amber-200 text-xs flex items-start gap-2.5">
          <span class="text-base leading-none">⚠️</span>
          <div class="space-y-0.5">
            <div class="font-bold text-xs">Research Preview — Active Development</div>
            <p class="text-[11px] leading-relaxed text-amber-800 dark:text-amber-300">
              This is a research preview: a lot of things are here, but they need some work. All outputs, scale bars, contrast adjustments, and 3D projections should be evaluated by a researcher before using it for actual work.
            </p>
          </div>
        </div>

        {loadingError && (
          <div role="alert" class="p-3 text-xs rounded-xl bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300 border border-rose-200 dark:border-rose-900">
            <strong>Error loading file:</strong> {loadingError}
          </div>
        )}

        {/* Header Metadata Badges */}
        <div class="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs">
          <div class="p-2 rounded-xl bg-slate-50 dark:bg-slate-800/60">
            <span class="text-slate-400 block text-[11px]">Dimensions (X×Y×Z)</span>
            <span class="font-mono font-bold text-slate-800 dark:text-slate-200">
              {mrcData.header.nx} × {mrcData.header.ny} × {mrcData.header.nz}
            </span>
          </div>

          <div class="p-2 rounded-xl bg-slate-50 dark:bg-slate-800/60">
            <span class="text-slate-400 block text-[11px]">Pixel Size</span>
            <span class="font-mono font-bold text-slate-800 dark:text-slate-200">
              {mrcData.header.pixelSize.toFixed(3)} Å/px
            </span>
          </div>

          <div class="p-2 rounded-xl bg-slate-50 dark:bg-slate-800/60">
            <span class="text-slate-400 block text-[11px]">Mode / Data Type</span>
            <span class="font-mono font-bold text-slate-800 dark:text-slate-200">
              Mode {mrcData.header.mode} ({mrcData.header.mode === 2 ? "Float32" : mrcData.header.mode === 0 ? "Int8" : "Int16"})
            </span>
          </div>

          <div class="p-2 rounded-xl bg-slate-50 dark:bg-slate-800/60">
            <span class="text-slate-400 block text-[11px]">Density Range</span>
            <span class="font-mono font-bold text-slate-800 dark:text-slate-200 truncate">
              {mrcData.header.dmin.toFixed(2)} to {mrcData.header.dmax.toFixed(2)}
            </span>
          </div>

          <div class="p-2 rounded-xl bg-slate-50 dark:bg-slate-800/60">
            <span class="text-slate-400 block text-[11px]">Type Classification</span>
            <span class="font-mono font-bold text-emerald-600 dark:text-emerald-400">
              {mrcData.header.is3DVolume ? "3D Density Map" : "2D Particle Stack"}
            </span>
          </div>
        </div>

        {/* View Mode Switcher & Export Actions */}
        <div class="flex flex-wrap items-center justify-between gap-2 pt-1">
          <div class="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => setViewMode("gallery")}
              class={`px-3 py-1.5 text-xs font-semibold rounded-lg transition ${
                viewMode === "gallery"
                  ? "bg-accent-600 text-white shadow-xs"
                  : "bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300"
              }`}
            >
              2D Particle Gallery ({totalSlices} classes)
            </button>
            <button
              type="button"
              onClick={() => setViewMode("orthoslice")}
              class={`px-3 py-1.5 text-xs font-semibold rounded-lg transition ${
                viewMode === "orthoslice"
                  ? "bg-accent-600 text-white shadow-xs"
                  : "bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300"
              }`}
            >
              3D Orthoslice Scrubber (XY, XZ, YZ)
            </button>
            <button
              type="button"
              onClick={() => setViewMode("mip")}
              class={`px-3 py-1.5 text-xs font-semibold rounded-lg transition ${
                viewMode === "mip"
                  ? "bg-accent-600 text-white shadow-xs"
                  : "bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300"
              }`}
            >
              3D Maximum Projection (MIP)
            </button>
          </div>

          {viewMode === "gallery" && (
            <div class="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowExportOptions(v => !v)}
                class="px-2.5 py-1.5 text-xs font-semibold rounded-lg border border-emerald-300 dark:border-emerald-800 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 transition flex items-center gap-1"
              >
                <span>⚙️ Export Options</span>
                <span class="text-[10px]">{showExportOptions ? "▲" : "▼"}</span>
              </button>
              <button
                type="button"
                onClick={exportPublicationPng}
                class="px-3 py-1.5 text-xs font-semibold rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 shadow-xs transition"
              >
                Export Publication Grid (PNG)
              </button>
              <button
                type="button"
                onClick={exportSelectedMrcs}
                class="px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
              >
                Export Selected (.mrcs)
              </button>
            </div>
          )}

          {viewMode === "mip" && (
            <button
              type="button"
              onClick={exportMipPng}
              class="px-3 py-1.5 text-xs font-semibold rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 shadow-xs transition flex items-center gap-1"
            >
              <span>Export Maximum Projection (PNG)</span>
            </button>
          )}
        </div>

        {/* Publication Export Settings Drawer */}
        {viewMode === "gallery" && showExportOptions && (
          <div class="p-3 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 text-xs space-y-2.5">
            <div class="flex items-center justify-between font-semibold text-slate-800 dark:text-slate-200">
              <span>Publication Figure Export Settings</span>
              <span class="text-[11px] text-slate-400 font-normal">Customizes output PNG image layout</span>
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* Check if to add number or not */}
              <label class="flex items-center gap-2 p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={exportShowNumbers}
                  onChange={(e) => setExportShowNumbers((e.target as HTMLInputElement).checked)}
                  class="rounded text-accent-600 accent-accent-600"
                />
                <span class="text-slate-700 dark:text-slate-300 font-medium">Add class numbers (#) to output image</span>
              </label>

              {/* How many columns should be in the output image */}
              <label class="flex items-center gap-2 p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 cursor-pointer">
                <span class="text-slate-700 dark:text-slate-300 font-medium whitespace-nowrap">Output columns:</span>
                <select
                  aria-label="Output columns"
                  id="output-cols"
                  value={exportCols}
                  onChange={(e) => setExportCols((e.target as HTMLSelectElement).value)}
                  class="flex-1 rounded-md border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2 py-1 font-mono text-xs"
                >
                  <option value="auto">Auto (match screen: {cols})</option>
                  <option value="1">1 column</option>
                  <option value="2">2 columns</option>
                  <option value="3">3 columns</option>
                  <option value="4">4 columns</option>
                  <option value="5">5 columns</option>
                  <option value="6">6 columns</option>
                  <option value="8">8 columns</option>
                  <option value="10">10 columns</option>
                </select>
              </label>

              {/* Scale bar length for export */}
              <label class="flex items-center gap-2 p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 cursor-pointer">
                <span class="text-slate-700 dark:text-slate-300 font-medium whitespace-nowrap">Scale bar length:</span>
                <select
                  aria-label="Scale bar length"
                  value={scaleBarLengthA}
                  onChange={(e) => setScaleBarLengthA(parseInt((e.target as HTMLSelectElement).value, 10))}
                  class="flex-1 rounded-md border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2 py-1 font-mono text-xs"
                >
                  <option value={25}>25 Å</option>
                  <option value={50}>50 Å</option>
                  <option value={100}>100 Å</option>
                  <option value={200}>200 Å</option>
                </select>
              </label>
            </div>
          </div>
        )}
      </div>

      {/* Contrast, Leveling & Display Panel */}
      <div class="rounded-2xl border border-slate-200 bg-white p-3.5 sm:p-4 dark:border-slate-800 dark:bg-slate-900 shadow-sm space-y-3">
        <div class="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-2">
          <span class="text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
            Contrast, Leveling &amp; Display Settings
          </span>

          {/* Quick Presets */}
          <div class="flex items-center gap-1.5 text-xs">
            <span class="text-slate-400 text-[11px]">Presets:</span>
            <button
              type="button"
              onClick={() => applyPreset("cryo")}
              class="px-2 py-0.5 rounded bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-medium transition"
              title="Cryo-EM preset: normal contrast (light density on dark ice)"
            >
              ❄️ Cryo-EM
            </button>
            <button
              type="button"
              onClick={() => applyPreset("ns")}
              class="px-2 py-0.5 rounded bg-amber-50 hover:bg-amber-100 dark:bg-amber-950 dark:hover:bg-amber-900 text-amber-800 dark:text-amber-300 font-medium transition"
              title="Negative Stain (NS) preset: inverted contrast (dark particles on light stain)"
            >
              🧪 NS (Invert)
            </button>
            <button
              type="button"
              onClick={() => applyPreset("high")}
              class="px-2 py-0.5 rounded bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-medium transition"
            >
              ⚡ High Contrast
            </button>
            <button
              type="button"
              onClick={() => applyPreset("reset")}
              class="px-2 py-0.5 rounded bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-medium transition"
            >
              ↺ Reset
            </button>
          </div>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
          <div>
            <div class="flex justify-between mb-1">
              <label class="text-slate-600 dark:text-slate-400">Black Level (Floor)</label>
              <span class="font-mono text-slate-500">{(blackLevel * 100).toFixed(0)}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="0.45"
              step="0.01"
              value={blackLevel}
              onInput={(e) => setBlackLevel(parseFloat((e.target as HTMLInputElement).value))}
              class="w-full accent-accent-600"
            />
          </div>

          <div>
            <div class="flex justify-between mb-1">
              <label class="text-slate-600 dark:text-slate-400">White Level (Ceiling)</label>
              <span class="font-mono text-slate-500">{(whiteLevel * 100).toFixed(0)}%</span>
            </div>
            <input
              type="range"
              min="0.55"
              max="1.0"
              step="0.01"
              value={whiteLevel}
              onInput={(e) => setWhiteLevel(parseFloat((e.target as HTMLInputElement).value))}
              class="w-full accent-accent-600"
            />
          </div>

          <div>
            <div class="flex justify-between mb-1">
              <label class="text-slate-600 dark:text-slate-400">Gamma Correction</label>
              <span class="font-mono text-slate-500">{gamma.toFixed(2)}</span>
            </div>
            <input
              type="range"
              min="0.5"
              max="2.5"
              step="0.05"
              value={gamma}
              onInput={(e) => setGamma(parseFloat((e.target as HTMLInputElement).value))}
              class="w-full accent-accent-600"
            />
          </div>

          <div class="flex flex-col justify-center space-y-2">
            <label class="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={invert}
                onChange={(e) => setInvert((e.target as HTMLInputElement).checked)}
                class="rounded text-accent-600 accent-accent-600"
              />
              <span class="text-slate-700 dark:text-slate-300">Invert Contrast (Negative Stain / NS)</span>
            </label>

            <label class="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={showScaleBar}
                onChange={(e) => setShowScaleBar((e.target as HTMLInputElement).checked)}
                class="rounded text-accent-600 accent-accent-600"
              />
              <span class="text-slate-700 dark:text-slate-300">Include Scale Bar ({scaleBarLengthA} Å)</span>
            </label>
          </div>
        </div>
      </div>

      {/* 2D Gallery Mode */}
      {viewMode === "gallery" && (
        <div class="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 shadow-sm space-y-4">
          <div class="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
            <div class="flex flex-wrap items-center gap-2 text-xs">
              <span class="text-slate-500 font-medium">
                Selected: <strong class="text-slate-900 dark:text-slate-100">{selectedIndices.size}</strong> of {totalSlices}
              </span>
              <button
                type="button"
                onClick={selectAll}
                class="px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 font-medium"
              >
                All
              </button>
              <button
                type="button"
                onClick={selectNone}
                class="px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 font-medium"
              >
                None
              </button>
              <button
                type="button"
                onClick={invertSelection}
                class="px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 font-medium"
              >
                Invert
              </button>
            </div>

            <div class="flex flex-wrap items-center gap-3 text-xs">
              {/* Check if to add number or not on screen cards */}
              <label class="flex items-center gap-1.5 cursor-pointer select-none text-slate-600 dark:text-slate-400">
                <input
                  type="checkbox"
                  checked={showLabels}
                  onChange={(e) => setShowLabels((e.target as HTMLInputElement).checked)}
                  class="rounded text-accent-600 accent-accent-600"
                />
                <span>Show # on cards</span>
              </label>

              {/* Card Zoom */}
              <div class="flex items-center gap-1">
                <span class="text-slate-400">Size:</span>
                <div class="flex rounded-lg bg-slate-100 dark:bg-slate-800 p-0.5">
                  <button
                    type="button"
                    onClick={() => setCardSize("compact")}
                    class={`px-2 py-0.5 rounded text-[11px] font-medium transition ${
                      cardSize === "compact"
                        ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs"
                        : "text-slate-500 hover:text-slate-900 dark:hover:text-slate-100"
                    }`}
                  >
                    Compact
                  </button>
                  <button
                    type="button"
                    onClick={() => setCardSize("normal")}
                    class={`px-2 py-0.5 rounded text-[11px] font-medium transition ${
                      cardSize === "normal"
                        ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs"
                        : "text-slate-500 hover:text-slate-900 dark:hover:text-slate-100"
                    }`}
                  >
                    Normal
                  </button>
                  <button
                    type="button"
                    onClick={() => setCardSize("large")}
                    class={`px-2 py-0.5 rounded text-[11px] font-medium transition ${
                      cardSize === "large"
                        ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs"
                        : "text-slate-500 hover:text-slate-900 dark:hover:text-slate-100"
                    }`}
                  >
                    Large
                  </button>
                </div>
              </div>

              {/* Display Columns */}
              <div class="flex items-center gap-1.5">
                <label class="text-slate-500">Columns:</label>
                <select
                  aria-label="Display columns"
                  value={cols}
                  onChange={(e) => setCols(parseInt((e.target as HTMLSelectElement).value, 10))}
                  class="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 font-mono"
                >
                  <option value={2}>2 cols</option>
                  <option value={3}>3 cols</option>
                  <option value={4}>4 cols</option>
                  <option value={5}>5 cols</option>
                  <option value={6}>6 cols</option>
                  <option value={8}>8 cols</option>
                  <option value={10}>10 cols</option>
                </select>
              </div>
            </div>
          </div>

          {/* Grid of particle cards */}
          <div
            class="grid gap-3"
            style={{
              gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
            }}
          >
            {mrcData.slices.map((slice, idx) => (
              <ParticleThumbnailCard
                key={idx}
                index={idx}
                sliceData={slice}
                nx={mrcData.header.nx}
                ny={mrcData.header.ny}
                pixelSize={mrcData.header.pixelSize}
                isSelected={selectedIndices.has(idx)}
                onToggle={() => toggleSelect(idx)}
                blackLevel={blackLevel}
                whiteLevel={whiteLevel}
                invert={invert}
                gamma={gamma}
                showNumber={showLabels}
                cardSize={cardSize}
              />
            ))}
          </div>
        </div>
      )}

      {/* 3D Orthoslice Mode */}
      {viewMode === "orthoslice" && (
        <div class="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 shadow-sm space-y-4">
          <div class="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-2">
            <div>
              <h3 class="font-bold text-sm text-slate-900 dark:text-slate-100">
                Synchronized 3-Plane Orthogonal Slicer
              </h3>
              <p class="text-xs text-slate-500">
                Scrub along X (Sagittal), Y (Coronal), and Z (Axial) to inspect 3D density interiors, symmetry axes, and micelle envelopes.
              </p>
            </div>
            <span class="text-xs font-mono text-slate-400">
              Voxel size: {mrcData.header.pixelSize.toFixed(3)} Å
            </span>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* XY Axial View */}
            <div class="space-y-2.5 p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40">
              <div class="flex items-center justify-between text-xs font-semibold">
                <span class="text-slate-700 dark:text-slate-300">XY Plane (Axial)</span>
                <span class="font-mono text-accent-600 dark:text-accent-400">
                  Z: {orthoZ + 1} / {mrcData.header.nz} ({((orthoZ + 1) * mrcData.header.pixelSize).toFixed(1)} Å)
                </span>
              </div>
              <div class="flex justify-center bg-black rounded-lg overflow-hidden p-1 shadow-inner">
                <canvas ref={canvasXyRef} class="w-full max-w-[320px] aspect-square object-contain" />
              </div>
              <input
                type="range"
                min="0"
                max={mrcData.header.nz - 1}
                value={orthoZ}
                onInput={(e) => setOrthoZ(parseInt((e.target as HTMLInputElement).value, 10))}
                class="w-full accent-accent-600"
              />
            </div>

            {/* XZ Coronal View */}
            <div class="space-y-2.5 p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40">
              <div class="flex items-center justify-between text-xs font-semibold">
                <span class="text-slate-700 dark:text-slate-300">XZ Plane (Coronal)</span>
                <span class="font-mono text-accent-600 dark:text-accent-400">
                  Y: {orthoY + 1} / {mrcData.header.ny} ({((orthoY + 1) * mrcData.header.pixelSize).toFixed(1)} Å)
                </span>
              </div>
              <div class="flex justify-center bg-black rounded-lg overflow-hidden p-1 shadow-inner">
                <canvas ref={canvasXzRef} class="w-full max-w-[320px] aspect-square object-contain" />
              </div>
              <input
                type="range"
                min="0"
                max={mrcData.header.ny - 1}
                value={orthoY}
                onInput={(e) => setOrthoY(parseInt((e.target as HTMLInputElement).value, 10))}
                class="w-full accent-accent-600"
              />
            </div>

            {/* YZ Sagittal View */}
            <div class="space-y-2.5 p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40">
              <div class="flex items-center justify-between text-xs font-semibold">
                <span class="text-slate-700 dark:text-slate-300">YZ Plane (Sagittal)</span>
                <span class="font-mono text-accent-600 dark:text-accent-400">
                  X: {orthoX + 1} / {mrcData.header.nx} ({((orthoX + 1) * mrcData.header.pixelSize).toFixed(1)} Å)
                </span>
              </div>
              <div class="flex justify-center bg-black rounded-lg overflow-hidden p-1 shadow-inner">
                <canvas ref={canvasYzRef} class="w-full max-w-[320px] aspect-square object-contain" />
              </div>
              <input
                type="range"
                min="0"
                max={mrcData.header.nx - 1}
                value={orthoX}
                onInput={(e) => setOrthoX(parseInt((e.target as HTMLInputElement).value, 10))}
                class="w-full accent-accent-600"
              />
            </div>
          </div>
        </div>
      )}

      {/* 3D Maximum Intensity Projection (MIP) Mode */}
      {viewMode === "mip" && (
        <div class="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 shadow-sm space-y-4">
          <div class="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
            <div>
              <h3 class="font-bold text-sm sm:text-base text-slate-900 dark:text-slate-100">
                3D Maximum Intensity Projection (MIP)
              </h3>
              <p class="text-xs text-slate-500">
                Projects maximum voxel density along viewing rays to visualize macromolecular envelopes, viral capsids, and high-density structural cores without slice ambiguity.
              </p>
            </div>

            {/* Projection Plane Switcher */}
            <div class="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-0.5 rounded-lg text-xs">
              <button
                type="button"
                onClick={() => setMipPlane("all")}
                class={`px-2.5 py-1 rounded font-medium transition ${
                  mipPlane === "all"
                    ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100"
                }`}
              >
                All 3 Planes
              </button>
              <button
                type="button"
                onClick={() => setMipPlane("xy")}
                class={`px-2.5 py-1 rounded font-medium transition ${
                  mipPlane === "xy"
                    ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100"
                }`}
              >
                XY (Axial)
              </button>
              <button
                type="button"
                onClick={() => setMipPlane("xz")}
                class={`px-2.5 py-1 rounded font-medium transition ${
                  mipPlane === "xz"
                    ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100"
                }`}
              >
                XZ (Coronal)
              </button>
              <button
                type="button"
                onClick={() => setMipPlane("yz")}
                class={`px-2.5 py-1 rounded font-medium transition ${
                  mipPlane === "yz"
                    ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100"
                }`}
              >
                YZ (Sagittal)
              </button>
            </div>
          </div>

          {/* Slab Range / Full Volume Scrubber */}
          <div class="p-3 rounded-xl bg-slate-50 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-800 space-y-2 text-xs">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <div class="flex items-center gap-3">
                <span class="font-semibold text-slate-700 dark:text-slate-300">Projection Depth:</span>
                <label class="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="radio"
                    name="mipDepth"
                    checked={mipFullVolume}
                    onChange={() => setMipFullVolume(true)}
                    class="text-accent-600 accent-accent-600"
                  />
                  <span>Full Volume ({mrcData.header.nz} slices)</span>
                </label>
                <label class="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="radio"
                    name="mipDepth"
                    checked={!mipFullVolume}
                    onChange={() => setMipFullVolume(false)}
                    class="text-accent-600 accent-accent-600"
                  />
                  <span>Sub-volume Slab Range</span>
                </label>
              </div>

              <span class="font-mono text-slate-500">
                {mipFullVolume
                  ? `Full volume slab: 1 to ${mrcData.header.nz}`
                  : `Slices ${mipSlabRange.start + 1} to ${mipSlabRange.end + 1} (${((mipSlabRange.end - mipSlabRange.start + 1) * mrcData.header.pixelSize).toFixed(1)} Å slab)`}
              </span>
            </div>

            {!mipFullVolume && (
              <div class="grid grid-cols-2 gap-4 pt-1">
                <div>
                  <div class="flex justify-between mb-1 text-[11px] text-slate-500">
                    <span>Slab Start Slice</span>
                    <span class="font-mono">{mipSlabRange.start + 1}</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max={mipSlabRange.end}
                    value={mipSlabRange.start}
                    onInput={(e) => setMipSlabRange(r => ({ ...r, start: parseInt((e.target as HTMLInputElement).value, 10) }))}
                    class="w-full accent-accent-600"
                  />
                </div>
                <div>
                  <div class="flex justify-between mb-1 text-[11px] text-slate-500">
                    <span>Slab End Slice</span>
                    <span class="font-mono">{mipSlabRange.end + 1}</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max={mrcData.header.nz - 1}
                    value={mipSlabRange.end}
                    onInput={(e) => setMipSlabRange(r => ({ ...r, end: parseInt((e.target as HTMLInputElement).value, 10) }))}
                    class="w-full accent-accent-600"
                  />
                </div>
              </div>
            )}
          </div>

          {/* MIP Multi-Plane View */}
          {mipPlane === "all" ? (
            <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* XY Axial MIP */}
              <div class="space-y-2 p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40">
                <div class="flex items-center justify-between text-xs font-semibold">
                  <span class="text-slate-800 dark:text-slate-200">XY Plane (Axial)</span>
                  <span class="text-slate-400 font-mono text-[11px]">along Z</span>
                </div>
                <div class="flex justify-center bg-black rounded-lg overflow-hidden p-1 shadow-inner">
                  <canvas ref={canvasMipXyRef} class="w-full max-w-[320px] aspect-square object-contain" />
                </div>
                <div class="text-[11px] text-slate-400 font-mono text-center">
                  {(mrcData.header.nx * mrcData.header.pixelSize).toFixed(1)} × {(mrcData.header.ny * mrcData.header.pixelSize).toFixed(1)} Å
                </div>
              </div>

              {/* XZ Coronal MIP */}
              <div class="space-y-2 p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40">
                <div class="flex items-center justify-between text-xs font-semibold">
                  <span class="text-slate-800 dark:text-slate-200">XZ Plane (Coronal)</span>
                  <span class="text-slate-400 font-mono text-[11px]">along Y</span>
                </div>
                <div class="flex justify-center bg-black rounded-lg overflow-hidden p-1 shadow-inner">
                  <canvas ref={canvasMipXzRef} class="w-full max-w-[320px] aspect-square object-contain" />
                </div>
                <div class="text-[11px] text-slate-400 font-mono text-center">
                  {(mrcData.header.nx * mrcData.header.pixelSize).toFixed(1)} × {(mrcData.header.nz * mrcData.header.pixelSize).toFixed(1)} Å
                </div>
              </div>

              {/* YZ Sagittal MIP */}
              <div class="space-y-2 p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40">
                <div class="flex items-center justify-between text-xs font-semibold">
                  <span class="text-slate-800 dark:text-slate-200">YZ Plane (Sagittal)</span>
                  <span class="text-slate-400 font-mono text-[11px]">along X</span>
                </div>
                <div class="flex justify-center bg-black rounded-lg overflow-hidden p-1 shadow-inner">
                  <canvas ref={canvasMipYzRef} class="w-full max-w-[320px] aspect-square object-contain" />
                </div>
                <div class="text-[11px] text-slate-400 font-mono text-center">
                  {(mrcData.header.ny * mrcData.header.pixelSize).toFixed(1)} × {(mrcData.header.nz * mrcData.header.pixelSize).toFixed(1)} Å
                </div>
              </div>
            </div>
          ) : (
            /* Single Large MIP View */
            <div class="flex flex-col items-center justify-center p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40 space-y-3">
              <div class="flex items-center justify-between w-full max-w-[480px] text-xs font-semibold">
                <h4 class="font-bold text-slate-800 dark:text-slate-200">
                  Maximum Intensity Projection: {mipPlane === "xy" ? "XY Plane (Axial - Projected along Z)" : mipPlane === "xz" ? "XZ Plane (Coronal - Projected along Y)" : "YZ Plane (Sagittal - Projected along X)"}
                </h4>
                <span class="font-mono text-slate-400">
                  {mipPlane === "xy"
                    ? `${(mrcData.header.nx * mrcData.header.pixelSize).toFixed(1)} × ${(mrcData.header.ny * mrcData.header.pixelSize).toFixed(1)} Å`
                    : mipPlane === "xz"
                    ? `${(mrcData.header.nx * mrcData.header.pixelSize).toFixed(1)} × ${(mrcData.header.nz * mrcData.header.pixelSize).toFixed(1)} Å`
                    : `${(mrcData.header.ny * mrcData.header.pixelSize).toFixed(1)} × ${(mrcData.header.nz * mrcData.header.pixelSize).toFixed(1)} Å`}
                </span>
              </div>
              <div class="bg-black rounded-xl overflow-hidden p-2 shadow-xl border border-slate-700 w-full max-w-[480px] aspect-square flex items-center justify-center">
                <canvas ref={canvasMipSingleRef} class="w-full h-full object-contain" />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ParticleThumbnailCard({
  index,
  sliceData,
  nx,
  ny,
  pixelSize,
  isSelected,
  onToggle,
  blackLevel,
  whiteLevel,
  invert,
  gamma,
  showNumber,
  cardSize,
}: {
  index: number;
  sliceData: Float32Array;
  nx: number;
  ny: number;
  pixelSize: number;
  isSelected: boolean;
  onToggle: () => void;
  blackLevel: number;
  whiteLevel: number;
  invert: boolean;
  gamma: number;
  showNumber: boolean;
  cardSize: "compact" | "normal" | "large";
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    renderSliceToCanvas(canvasRef.current, sliceData, nx, ny, {
      blackLevel,
      whiteLevel,
      invert,
      gamma,
    });
  }, [sliceData, nx, ny, blackLevel, whiteLevel, invert, gamma]);

  const pSizeClass = cardSize === "compact" ? "p-1" : cardSize === "large" ? "p-2.5" : "p-1.5";

  return (
    <div
      onClick={onToggle}
      class={`group relative cursor-pointer rounded-xl border ${pSizeClass} transition select-none ${
        isSelected
          ? "border-accent-500 bg-accent-50/30 dark:border-accent-500 dark:bg-accent-950/30 ring-2 ring-accent-500/20"
          : "border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 opacity-60 hover:opacity-100"
      }`}
    >
      <div class="flex items-center justify-between px-1 pb-1 text-[11px] font-mono">
        {showNumber ? (
          <span class="font-bold text-slate-700 dark:text-slate-300">#{index + 1}</span>
        ) : (
          <span class="text-slate-400">·</span>
        )}
        <input
          type="checkbox"
          checked={isSelected}
          onChange={(e) => {
            e.stopPropagation();
            onToggle();
          }}
          class="rounded text-accent-600 accent-accent-600 cursor-pointer"
        />
      </div>

      <div class="overflow-hidden rounded-lg bg-black flex justify-center items-center">
        <canvas ref={canvasRef} class="w-full aspect-square object-contain" />
      </div>

      <div class="pt-1 text-[10px] text-slate-400 text-center font-mono truncate">
        {(nx * pixelSize).toFixed(0)} Å box
      </div>
    </div>
  );
}
