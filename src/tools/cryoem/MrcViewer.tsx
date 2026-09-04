import { useState, useRef, useEffect, useMemo } from 'preact/hooks';
import {
  type MrcData,
  parseMrc,
  generateDemoClasses,
  generateDemo3DVolume,
  renderSliceToCanvas,
} from '@/core/cryoem';

export function MrcViewer() {
  const [mrcData, setMrcData] = useState<MrcData>(() => generateDemoClasses(12, 64));
  const [viewMode, setViewMode] = useState<'gallery' | 'orthoslice'>('gallery');
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(() => new Set(Array.from({ length: 12 }, (_, i) => i)));
  const [blackLevel, setBlackLevel] = useState<number>(0.05);
  const [whiteLevel, setWhiteLevel] = useState<number>(0.95);
  const [invert, setInvert] = useState<boolean>(false);
  const [gamma, setGamma] = useState<number>(1.0);
  const [cols, setCols] = useState<number>(4);
  const [showScaleBar, setShowScaleBar] = useState<boolean>(true);
  const [scaleBarLengthA, setScaleBarLengthA] = useState<number>(50);
  const [showLabels, setShowLabels] = useState<boolean>(true);

  // Orthoslice coordinates
  const [orthoX, setOrthoX] = useState<number>(() => Math.floor(mrcData.header.nx / 2));
  const [orthoY, setOrthoY] = useState<number>(() => Math.floor(mrcData.header.ny / 2));
  const [orthoZ, setOrthoZ] = useState<number>(() => Math.floor(mrcData.header.nz / 2));

  const [loadingError, setLoadingError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Canvas refs for orthoslices
  const canvasXyRef = useRef<HTMLCanvasElement>(null);
  const canvasXzRef = useRef<HTMLCanvasElement>(null);
  const canvasYzRef = useRef<HTMLCanvasElement>(null);

  const totalSlices = mrcData.slices.length;

  // Keep orthoslice coordinates inside bounds when dataset changes
  useEffect(() => {
    setOrthoX(Math.floor(mrcData.header.nx / 2));
    setOrthoY(Math.floor(mrcData.header.ny / 2));
    setOrthoZ(Math.floor(mrcData.header.nz / 2));
    setSelectedIndices(new Set(Array.from({ length: mrcData.slices.length }, (_, i) => i)));
    if (mrcData.header.is3DVolume) {
      setViewMode('orthoslice');
    } else {
      setViewMode('gallery');
    }
  }, [mrcData]);

  // Update orthoslice canvases
  useEffect(() => {
    if (viewMode !== 'orthoslice') return;

    if (canvasXyRef.current) {
      const orthoXy = mrcData.getOrthoslice('xy', orthoZ);
      renderSliceToCanvas(canvasXyRef.current, orthoXy.data, orthoXy.width, orthoXy.height, {
        blackLevel,
        whiteLevel,
        invert,
        gamma,
      });
    }

    if (canvasXzRef.current) {
      const orthoXz = mrcData.getOrthoslice('xz', orthoY);
      renderSliceToCanvas(canvasXzRef.current, orthoXz.data, orthoXz.width, orthoXz.height, {
        blackLevel,
        whiteLevel,
        invert,
        gamma,
      });
    }

    if (canvasYzRef.current) {
      const orthoYz = mrcData.getOrthoslice('yz', orthoX);
      renderSliceToCanvas(canvasYzRef.current, orthoYz.data, orthoYz.width, orthoYz.height, {
        blackLevel,
        whiteLevel,
        invert,
        gamma,
      });
    }
  }, [mrcData, viewMode, orthoX, orthoY, orthoZ, blackLevel, whiteLevel, invert, gamma]);

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
      setLoadingError('Failed to read file from disk.');
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

  // Publication PNG Export
  function exportPublicationPng() {
    const selectedList = Array.from(selectedIndices).sort((a, b) => a - b);
    if (selectedList.length === 0) {
      alert('Please select at least one particle or class average to export.');
      return;
    }

    const { nx, ny, pixelSize } = mrcData.header;
    const scaleFactor = 2; // 2x supersampling
    const cellW = nx * scaleFactor;
    const cellH = ny * scaleFactor;
    const numCols = Math.min(cols, selectedList.length);
    const numRows = Math.ceil(selectedList.length / numCols);
    const gap = 12;
    const pad = 24;

    const totalW = pad * 2 + numCols * cellW + (numCols - 1) * gap;
    const totalH = pad * 2 + numRows * cellH + (numRows - 1) * gap;

    const exportCanvas = document.createElement('canvas');
    exportCanvas.width = totalW;
    exportCanvas.height = totalH;
    const ctx = exportCanvas.getContext('2d');
    if (!ctx) return;

    // Background
    ctx.fillStyle = invert ? '#ffffff' : '#090d16';
    ctx.fillRect(0, 0, totalW, totalH);

    // Scratch canvas for individual slice rendering
    const scratchCanvas = document.createElement('canvas');

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
      ctx.strokeStyle = invert ? '#e2e8f0' : '#1e293b';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(posX, posY, cellW, cellH);

      // Optional label
      if (showLabels) {
        ctx.fillStyle = invert ? '#0f172a' : '#f8fafc';
        ctx.font = 'bold 16px monospace';
        ctx.textAlign = 'left';
        ctx.fillText(`#${sliceIdx + 1}`, posX + 8, posY + 20);
      }
    });

    // Optional Scale Bar on last item or bottom corner
    if (showScaleBar && pixelSize > 0) {
      const barLengthPx = (scaleBarLengthA / pixelSize) * scaleFactor;
      const barX = totalW - pad - barLengthPx - 8;
      const barY = totalH - pad - 16;

      ctx.fillStyle = invert ? '#0f172a' : '#ffffff';
      ctx.fillRect(barX, barY, barLengthPx, 5);

      ctx.font = 'bold 14px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`${scaleBarLengthA} Å`, barX + barLengthPx / 2, barY - 6);
    }

    const dataUrl = exportCanvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `cryoem_classes_${selectedList.length}particles.png`;
    a.click();
  }

  // Export Selected as MRCS binary file
  function exportSelectedMrcs() {
    const selectedList = Array.from(selectedIndices).sort((a, b) => a - b);
    if (selectedList.length === 0) {
      alert('Please select at least one particle to export.');
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
    const mapStr = 'MAP ';
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

    const blob = new Blob([buffer], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
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
            <h2 class="text-base font-bold text-slate-900 dark:text-slate-100">
              Cryo-EM MRC / MRCS Particle &amp; Volume Viewer
            </h2>
            <p class="text-xs text-slate-500">
              Load 2D class average stacks (.mrcs) or 3D density maps (.mrc / .map) for publication figure curation and orthoslice slicing.
            </p>
          </div>

          <div class="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setMrcData(generateDemoClasses(16, 64))}
              class="px-2.5 py-1.5 text-xs font-semibold rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:hover:bg-indigo-900 dark:text-indigo-300 transition"
            >
              Demo 2D Classes (Ribosome)
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
              Mode {mrcData.header.mode} ({mrcData.header.mode === 2 ? 'Float32' : mrcData.header.mode === 0 ? 'Int8' : 'Int16'})
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
              {mrcData.header.is3DVolume ? '3D Density Map' : '2D Particle Stack'}
            </span>
          </div>
        </div>

        {/* View Mode Switcher */}
        <div class="flex items-center justify-between pt-1">
          <div class="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setViewMode('gallery')}
              class={`px-3 py-1.5 text-xs font-semibold rounded-lg transition ${
                viewMode === 'gallery'
                  ? 'bg-accent-600 text-white'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
              }`}
            >
              2D Particle Gallery ({totalSlices} classes)
            </button>
            <button
              type="button"
              onClick={() => setViewMode('orthoslice')}
              class={`px-3 py-1.5 text-xs font-semibold rounded-lg transition ${
                viewMode === 'orthoslice'
                  ? 'bg-accent-600 text-white'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
              }`}
            >
              3D Orthoslice Scrubber (XY, XZ, YZ)
            </button>
          </div>

          {viewMode === 'gallery' && (
            <div class="flex items-center gap-2">
              <button
                type="button"
                onClick={exportPublicationPng}
                class="px-3 py-1.5 text-xs font-semibold rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm transition"
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
        </div>
      </div>

      {/* Shared Display & Contrast Controls */}
      <div class="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 shadow-sm space-y-3">
        <span class="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
          Contrast, Leveling &amp; Publication Settings
        </span>

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
              <span class="text-slate-700 dark:text-slate-300">Invert Contrast (Dark on Light)</span>
            </label>

            {viewMode === 'gallery' && (
              <label class="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={showScaleBar}
                  onChange={(e) => setShowScaleBar((e.target as HTMLInputElement).checked)}
                  class="rounded text-accent-600 accent-accent-600"
                />
                <span class="text-slate-700 dark:text-slate-300">Include Scale Bar (50 Å)</span>
              </label>
            )}
          </div>
        </div>
      </div>

      {/* 2D Gallery Mode */}
      {viewMode === 'gallery' && (
        <div class="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 shadow-sm space-y-4">
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div class="flex items-center gap-2 text-xs">
              <span class="text-slate-500 font-medium">
                Selected: <strong class="text-slate-900 dark:text-slate-100">{selectedIndices.size}</strong> of {totalSlices}
              </span>
              <button
                type="button"
                onClick={selectAll}
                class="px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300"
              >
                All
              </button>
              <button
                type="button"
                onClick={selectNone}
                class="px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300"
              >
                None
              </button>
              <button
                type="button"
                onClick={invertSelection}
                class="px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300"
              >
                Invert
              </button>
            </div>

            <div class="flex items-center gap-2 text-xs">
              <label class="text-slate-500">Columns:</label>
              <select
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
              </select>
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
              />
            ))}
          </div>
        </div>
      )}

      {/* 3D Orthoslice Mode */}
      {viewMode === 'orthoslice' && (
        <div class="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 shadow-sm space-y-4">
          <div class="border-b border-slate-100 dark:border-slate-800 pb-2">
            <h3 class="font-bold text-sm text-slate-900 dark:text-slate-100">
              Synchronized 3-Plane Orthogonal Slicer
            </h3>
            <p class="text-xs text-slate-500">
              Scrub along X (Sagittal), Y (Coronal), and Z (Axial) to inspect 3D density interiors, symmetry axes, and micelle envelopes.
            </p>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* XY Axial View */}
            <div class="space-y-2 p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40">
              <div class="flex items-center justify-between text-xs font-semibold">
                <span class="text-slate-700 dark:text-slate-300">XY Plane (Axial)</span>
                <span class="font-mono text-accent-600 dark:text-accent-400">Z: {orthoZ + 1} / {mrcData.header.nz}</span>
              </div>
              <div class="flex justify-center bg-black rounded-lg overflow-hidden p-1">
                <canvas ref={canvasXyRef} class="w-full max-w-[240px] aspect-square object-contain" />
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
            <div class="space-y-2 p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40">
              <div class="flex items-center justify-between text-xs font-semibold">
                <span class="text-slate-700 dark:text-slate-300">XZ Plane (Coronal)</span>
                <span class="font-mono text-accent-600 dark:text-accent-400">Y: {orthoY + 1} / {mrcData.header.ny}</span>
              </div>
              <div class="flex justify-center bg-black rounded-lg overflow-hidden p-1">
                <canvas ref={canvasXzRef} class="w-full max-w-[240px] aspect-square object-contain" />
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
            <div class="space-y-2 p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40">
              <div class="flex items-center justify-between text-xs font-semibold">
                <span class="text-slate-700 dark:text-slate-300">YZ Plane (Sagittal)</span>
                <span class="font-mono text-accent-600 dark:text-accent-400">X: {orthoX + 1} / {mrcData.header.nx}</span>
              </div>
              <div class="flex justify-center bg-black rounded-lg overflow-hidden p-1">
                <canvas ref={canvasYzRef} class="w-full max-w-[240px] aspect-square object-contain" />
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

  return (
    <div
      onClick={onToggle}
      class={`group relative cursor-pointer rounded-xl border p-1.5 transition select-none ${
        isSelected
          ? 'border-accent-500 bg-accent-50/30 dark:border-accent-500 dark:bg-accent-950/30 ring-2 ring-accent-500/20'
          : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 opacity-60 hover:opacity-100'
      }`}
    >
      <div class="flex items-center justify-between px-1 pb-1 text-[11px] font-mono">
        <span class="font-bold text-slate-700 dark:text-slate-300">#{index + 1}</span>
        <input
          type="checkbox"
          checked={isSelected}
          onChange={(e) => {
            e.stopPropagation();
            onToggle();
          }}
          class="rounded text-accent-600 accent-accent-600"
        />
      </div>

      <div class="overflow-hidden rounded-lg bg-black flex justify-center items-center">
        <canvas ref={canvasRef} class="w-full aspect-square object-contain" />
      </div>

      <div class="pt-1 text-[10px] text-slate-400 text-center font-mono">
        {(nx * pixelSize).toFixed(0)} Å box
      </div>
    </div>
  );
}
