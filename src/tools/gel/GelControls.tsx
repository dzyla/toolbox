import { ImportAlert } from '@/app/components/ImportAlert';
import { MASS_STANDARD_PRESETS, type MassCalibrationModel, type CalibrationModel } from '@/core/gel/calibration';
import { type Polarity } from '@/core/gel/types';
import { LADDERS } from './workspace';
import type { GelWorkspace } from './workspace';

/** Left-hand controls: image source, orientation, calibration presets, densitometry, annotations, display and lanes. */
export function GelControls({ g }: { g: GelWorkspace }) {
  const {
    applyFlip,
    applyRotation,
    calibration,
    cropBox,
    cropSuggestion,
    customLadderError,
    customLadderFileRef,
    customLadderKind,
    customLadderName,
    customLadderSizesStr,
    customLadders,
    deskewAngle,
    fileInputRef,
    gelTitle,
    handleApplyCrop,
    handleApplySuggestion,
    handleCustomLadderFileUpload,
    handleDeleteCustomLadder,
    handleDeskewChange,
    handleFileUpload,
    handleResetAllTransforms,
    handleSaveCustomLadder,
    imageError,
    imageName,
    isCropping,
    laneLabels,
    lanes,
    loadDemo,
    massCalibration,
    plane,
    project,
    s,
    set,
    setBandMap,
    setLadderSizeMap,
    setCropBox,
    setCustomLadderKind,
    setCustomLadderName,
    setCustomLadderSizesStr,
    setGelTitle,
    setIsCropping,
    setShowCustomLadderModal,
    showCustomLadderModal,
  } = g;
  return (
    <div class="space-y-4">
      {/* Image Source Card */}
      <div class="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 space-y-3">
        <div class="flex items-center justify-between">
          <span class="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Image Source</span>
          <span class="text-xs text-slate-500 dark:text-slate-400 truncate max-w-[140px] mono">{imageName || 'None'}</span>
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
            onClick={() => {
              project.detach();
              loadDemo();
            }}
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
          onChange={e => {
            const input = e.target as HTMLInputElement;
            const file = input.files?.[0];
            input.value = '';
            if (file) void handleFileUpload(file);
          }}
        />
        <ImportAlert message={imageError} />

        <div>
          <label class="text-xs font-medium text-slate-500 dark:text-slate-400 block mb-1">Signal Polarity</label>
          <select
            aria-label="Signal Polarity"
            value={s.polarity}
            onChange={e => set({ polarity: (e.target as HTMLSelectElement).value as Polarity })}
            class="w-full text-xs px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 dark:bg-slate-900"
          >
            <option value="dark">Dark bands on light (Coomassie, Silver, UV ethidium)</option>
            <option value="light">Light bands on dark (Chemiluminescence, Fluorescence)</option>
          </select>
        </div>
      </div>

      {/* Image Orientation, Crop & Deskew Card */}
      <details class="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 space-y-3 group">
        <summary class="cursor-pointer text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
          Orientation & Crop
        </summary>
        {/* Kept outside <summary>: interactive controls cannot nest inside the disclosure toggle. */}
        <div class="flex justify-end">
          <button
            type="button"
            onClick={handleResetAllTransforms}
            class="text-[11px] text-slate-500 dark:text-slate-400 hover:text-accent-600 transition underline"
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
          <div class="flex justify-between text-xs text-slate-500 dark:text-slate-400 mb-1">
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
              onInput={e => handleDeskewChange(parseFloat((e.target as HTMLInputElement).value))}
              class="w-full accent-accent-600"
            />
            <button
              type="button"
              onClick={() => handleDeskewChange(0)}
              class="text-[11px] px-1.5 py-0.5 rounded border border-slate-300 dark:border-slate-700 text-slate-500 dark:text-slate-400"
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
              onClick={() => {
                setIsCropping(true);
                setCropBox(null);
              }}
              class="w-full py-1.5 text-xs font-semibold rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-200 transition"
            >
              ✂️ Select Crop Area
            </button>
          ) : (
            <div class="space-y-2 rounded-lg bg-sky-50 dark:bg-sky-950/40 p-2.5 border border-sky-200 dark:border-sky-800">
              <span class="text-xs text-sky-800 dark:text-sky-200 block font-medium">Drag a bounding box across the gel to crop:</span>
              {cropBox && cropBox.w > 0 && (
                <span class="text-[11px] mono text-sky-700 dark:text-sky-300 block">
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
                  onClick={() => {
                    setIsCropping(false);
                    setCropBox(null);
                  }}
                  class="py-1 px-2.5 text-xs font-medium rounded-md border border-slate-300 dark:border-slate-700"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Auto Gel Straighten & Crop Suggestion */}
        {cropSuggestion &&
          (Math.abs(cropSuggestion.rotation) > 0.1 ||
            cropSuggestion.crop.w < (plane?.width ?? 0) - 10 ||
            cropSuggestion.crop.h < (plane?.height ?? 0) - 10) && (
            <div class="rounded-lg bg-indigo-50 dark:bg-indigo-950/40 p-2.5 border border-indigo-200 dark:border-indigo-800 text-xs space-y-1.5 mt-2">
              <div class="flex items-center justify-between font-semibold text-indigo-900 dark:text-indigo-200">
                <span>🪄 Auto Alignment Suggestion</span>
                <span class="text-[10px] mono bg-indigo-200/60 dark:bg-indigo-900/60 px-1.5 py-0.5 rounded">
                  {cropSuggestion.rotation >= 0 ? `+${cropSuggestion.rotation.toFixed(1)}°` : `${cropSuggestion.rotation.toFixed(1)}°`}
                </span>
              </div>
              <p class="text-[11px] text-indigo-700 dark:text-indigo-300 leading-tight">
                Suggested tilt: <span class="mono font-semibold">{cropSuggestion.rotation.toFixed(1)}°</span>. Suggested crop:{' '}
                <span class="mono font-semibold">
                  {cropSuggestion.crop.w} × {cropSuggestion.crop.h} px
                </span>
                .
              </p>
              <button
                type="button"
                onClick={handleApplySuggestion}
                class="w-full py-1 text-xs font-semibold rounded-md bg-indigo-600 hover:bg-indigo-700 text-white transition shadow-2xs"
              >
                🪄 Apply Auto Straighten & Crop
              </button>
            </div>
          )}
      </details>

      {/* Molecular Weight Calibration Presets */}
      <div class="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 space-y-3">
        <span class="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
          Molecular Weight Calibration
        </span>
        <div>
          <label class="text-xs font-medium text-slate-500 dark:text-slate-400 block mb-1">Ladder Lane</label>
          <select
            aria-label="Ladder Lane"
            value={s.ladderLaneId}
            onChange={e => set({ ladderLaneId: (e.target as HTMLSelectElement).value })}
            class="w-full text-xs px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 dark:bg-slate-900"
          >
            <option value="">Select standard ladder lane…</option>
            {lanes.map((l, i) => (
              <option key={l.id} value={l.id}>
                Lane {i + 1}
                {laneLabels[l.id] ? ` (${laneLabels[l.id]})` : ''}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label class="text-xs font-medium text-slate-500 dark:text-slate-400 block mb-1">Standard Ladder Preset</label>
          <select
            aria-label="Standard Ladder Preset"
            value={s.ladderId}
            onChange={e => set({ ladderId: (e.target as HTMLSelectElement).value })}
            class="w-full text-xs px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 dark:bg-slate-900"
          >
            <optgroup label="Built-in Standard Ladders">
              {LADDERS.map(l => (
                <option key={l.id} value={l.id}>
                  {l.name} [{l.kind.toUpperCase()}]
                </option>
              ))}
            </optgroup>
            {customLadders.length > 0 && (
              <optgroup label="Custom Uploaded Ladders">
                {customLadders.map(l => (
                  <option key={l.id} value={l.id}>
                    ⭐ {l.name} [{l.kind.toUpperCase()}]
                  </option>
                ))}
              </optgroup>
            )}
          </select>

          <div class="flex items-center justify-between pt-1">
            <button
              type="button"
              onClick={() => setShowCustomLadderModal(prev => !prev)}
              class="text-xs text-accent-600 dark:text-accent-400 hover:underline font-medium flex items-center gap-1"
            >
              {showCustomLadderModal ? '▲ Close Custom Ladder' : '➕ Upload / Custom Ladder…'}
            </button>
            {s.ladderId.startsWith('custom-') && (
              <button
                type="button"
                onClick={() => handleDeleteCustomLadder(s.ladderId)}
                class="text-[11px] text-rose-700 dark:text-rose-400 hover:underline font-medium"
                title="Delete this custom ladder"
              >
                🗑️ Delete Custom Ladder
              </button>
            )}
          </div>

          {showCustomLadderModal && (
            <div class="mt-2 rounded-xl border border-accent-200 bg-accent-50/50 p-3 dark:border-accent-900/60 dark:bg-accent-950/20 space-y-2 text-xs">
              <span class="font-bold text-slate-800 dark:text-slate-200 block">Create / Upload Custom Ladder</span>
              <div>
                <label class="block text-[11px] text-slate-500 dark:text-slate-400 mb-0.5">Ladder Name</label>
                <input
                  aria-label="Ladder Name"
                  type="text"
                  placeholder="e.g. Lab Custom Protein Standard"
                  value={customLadderName}
                  onInput={e => setCustomLadderName((e.target as HTMLInputElement).value)}
                  class="w-full px-2 py-1 rounded border border-slate-300 dark:border-slate-700 dark:bg-slate-900"
                />
              </div>
              <div class="flex gap-4 pt-0.5">
                <label class="flex items-center gap-1 cursor-pointer">
                  <input
                    type="radio"
                    name="customKind"
                    checked={customLadderKind === 'protein'}
                    onChange={() => setCustomLadderKind('protein')}
                  />
                  <span>Protein (kDa)</span>
                </label>
                <label class="flex items-center gap-1 cursor-pointer">
                  <input type="radio" name="customKind" checked={customLadderKind === 'dna'} onChange={() => setCustomLadderKind('dna')} />
                  <span>DNA (bp)</span>
                </label>
              </div>
              <div>
                <div class="flex justify-between items-center mb-0.5">
                  <label class="block text-[11px] text-slate-500 dark:text-slate-400">Band Sizes (descending)</label>
                  <button
                    type="button"
                    onClick={() => customLadderFileRef.current?.click()}
                    class="text-[10px] text-accent-600 dark:text-accent-400 hover:underline font-semibold"
                  >
                    📁 Import JSON/CSV
                  </button>
                  <input
                    ref={customLadderFileRef}
                    type="file"
                    accept=".json,.csv,.txt"
                    class="hidden"
                    onChange={e => {
                      const f = (e.target as HTMLInputElement).files?.[0];
                      if (f) handleCustomLadderFileUpload(f);
                    }}
                  />
                </div>
                <textarea
                  rows={2}
                  placeholder={
                    customLadderKind === 'protein'
                      ? '250, 150, 100, 75, 50, 37, 25, 15, 10'
                      : '10000, 8000, 6000, 5000, 4000, 3000, 2000, 1000, 500'
                  }
                  value={customLadderSizesStr}
                  onInput={e => setCustomLadderSizesStr((e.target as HTMLTextAreaElement).value)}
                  class="w-full px-2 py-1 rounded border border-slate-300 dark:border-slate-700 dark:bg-slate-900 font-mono text-[11px]"
                />
              </div>
              {customLadderError && <p class="text-[11px] text-rose-700 dark:text-rose-400 font-medium">{customLadderError}</p>}
              <div class="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleSaveCustomLadder}
                  class="flex-1 py-1 rounded bg-accent-600 text-white font-semibold hover:bg-accent-700 transition"
                >
                  Save & Use Ladder
                </button>
                <button
                  type="button"
                  onClick={() => setShowCustomLadderModal(false)}
                  class="px-2.5 py-1 rounded border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>

        <div>
          <label class="text-xs font-medium text-slate-500 dark:text-slate-400 block mb-1">Fitting Model</label>
          <select
            aria-label="Fitting Model"
            value={s.calibMethod}
            onChange={e => set({ calibMethod: (e.target as HTMLSelectElement).value as CalibrationModel })}
            class="w-full text-xs px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 dark:bg-slate-900"
          >
            <option value="piecewise">Piecewise Linear (Recommended)</option>
            <option value="linear">Global Linear Semi-Log</option>
            <option value="monotone">Monotone cubic spline</option>
          </select>
        </div>

        {calibration && (
          <div class="rounded-lg bg-emerald-50 p-2 text-xs text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
            ✓ Calibrated ({calibration.points.length} ladder bands matched).
          </div>
        )}
      </div>

      {/* Densitometric Mass / Quantity Calibration Card */}
      <details class="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 space-y-3">
        <summary class="cursor-pointer text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
          Mass Densitometry
        </summary>
        <label class="flex items-center justify-end gap-1 text-[11px] text-slate-500 dark:text-slate-400 cursor-pointer">
          <input
            type="checkbox"
            checked={s.showMassLabels}
            onChange={e => set({ showMassLabels: (e.target as HTMLInputElement).checked })}
            class="rounded text-emerald-700 dark:text-emerald-400"
          />
          Show ng
        </label>

        <div>
          <label class="text-xs font-medium text-slate-500 dark:text-slate-400 block mb-1">Standard Lane / Well</label>
          <select
            aria-label="Standard Lane / Well"
            value={s.massLaneId}
            onChange={e => set({ massLaneId: (e.target as HTMLSelectElement).value })}
            class="w-full text-xs px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 dark:bg-slate-900 font-medium"
          >
            <option value="">None (Uncalibrated)</option>
            {lanes.map((l, i) => (
              <option key={l.id} value={l.id}>
                Lane {i + 1} {laneLabels[l.id] ? `(${laneLabels[l.id]})` : ''}
              </option>
            ))}
          </select>
        </div>

        {s.massLaneId && (
          <>
            <div>
              <label class="text-xs font-medium text-slate-500 dark:text-slate-400 block mb-1">Standard Preset</label>
              <select
                aria-label="Standard Preset"
                value={s.massPresetId}
                onChange={e => set({ massPresetId: (e.target as HTMLSelectElement).value })}
                class="w-full text-xs px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 dark:bg-slate-900"
              >
                {MASS_STANDARD_PRESETS.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label class="text-xs font-medium text-slate-500 dark:text-slate-400 block mb-1">Curve Fit Model</label>
              <select
                aria-label="Curve Fit Model"
                value={s.massCalibMethod}
                onChange={e => set({ massCalibMethod: (e.target as HTMLSelectElement).value as MassCalibrationModel })}
                class="w-full text-xs px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 dark:bg-slate-900"
              >
                <option value="linear">Linear (y = mx + b)</option>
                <option value="linear_zero">Linear through Origin (y = mx)</option>
                <option value="quadratic">Quadratic (Curvature)</option>
                <option value="power">Power Law (Allometric)</option>
              </select>
            </div>

            {massCalibration ? (
              <div class="rounded-lg bg-emerald-50 p-2 text-xs text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 space-y-1">
                <div class="font-bold">✓ Mass Calibrated ({massCalibration.points.length} standards)</div>
                <div class="text-[11px] font-mono">R² = {massCalibration.r2.toFixed(4)}</div>
              </div>
            ) : (
              <div class="rounded-lg bg-amber-50 p-2 text-xs text-amber-800 dark:bg-amber-950/50 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                Select a lane with detected bands to calibrate mass.
              </div>
            )}
          </>
        )}
      </details>

      {/* Densitometry & Background Parameters */}
      <details class="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 space-y-3">
        <summary class="cursor-pointer text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
          Densitometry & Background
        </summary>
        <div>
          <label class="text-xs font-medium text-slate-500 dark:text-slate-400 block mb-1">Baseline Method</label>
          <select
            aria-label="Baseline Method"
            value={s.bgMethod}
            onChange={e => set({ bgMethod: (e.target as HTMLSelectElement).value as 'shared' | 'rolling' | 'valley' | 'none' })}
            class="w-full text-xs px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 dark:bg-slate-900"
          >
            <option value="shared">Shared Cross-Lane Baseline (Recommended for Multi-Lane Comparison)</option>
            <option value="rolling">Rolling Ball (Per-Lane)</option>
            <option value="valley">Valley-to-Valley (Per-Lane)</option>
            <option value="none">None (No Subtraction)</option>
          </select>
        </div>

        {s.bgMethod === 'shared' && (
          <p class="text-[11px] text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/60 p-2 rounded-lg leading-relaxed">
            💡 <strong>Shared Baseline</strong> applies uniform background subtraction across all lanes, eliminating individual baseline
            distortion for accurate quantitative Western blots and lane comparisons.
          </p>
        )}

        {(s.bgMethod === 'rolling' || s.bgMethod === 'shared') && (
          <div>
            <div class="flex justify-between text-xs text-slate-500 dark:text-slate-400 mb-1">
              <span>Smoothing Radius</span>
              <span>{s.rollingRadius} px</span>
            </div>
            <input
              type="range"
              min="5"
              max="100"
              step="5"
              value={s.rollingRadius}
              onInput={e => set({ rollingRadius: parseInt((e.target as HTMLInputElement).value) })}
              class="w-full accent-accent-600"
            />
          </div>
        )}

        <div>
          <div class="flex justify-between text-xs text-slate-500 dark:text-slate-400 mb-1">
            <span>Band Sensitivity</span>
            <span class="font-mono font-semibold text-slate-700 dark:text-slate-300">
              {s.prominence <= 0.03 ? 'Very High (Faint bands)' : s.prominence <= 0.08 ? 'Standard' : 'Strict (Major bands)'} (
              {(s.prominence * 100).toFixed(0)}%)
            </span>
          </div>
          <input
            type="range"
            min="0.01"
            max="0.30"
            step="0.01"
            value={s.prominence}
            onInput={e => {
              const val = parseFloat((e.target as HTMLInputElement).value);
              set({ prominence: val });
              setBandMap({}); setLadderSizeMap({});
            }}
            class="w-full accent-accent-600 cursor-pointer"
            title="Slide left for high sensitivity (faint bands), right for strict (strong bands only)"
          />
          <div class="flex justify-between text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
            <span>◀ High Sensitivity (Faint)</span>
            <span>Strict (Strong Only) ▶</span>
          </div>
        </div>
      </details>

      {/* Annotations & Titles Card */}
      <details class="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 space-y-3">
        <summary class="cursor-pointer text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
          Gel Annotations
        </summary>
        <div>
          <label class="text-xs font-medium text-slate-500 dark:text-slate-400 block mb-1">Gel Export Title</label>
          <input
            aria-label="Gel Export Title"
            type="text"
            value={gelTitle}
            onInput={e => setGelTitle((e.target as HTMLInputElement).value)}
            class="w-full text-xs px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 dark:bg-slate-900"
            placeholder="e.g. SDS-PAGE 12% Tris-Glycine"
          />
        </div>
      </details>

      {/* Display Adjustments */}
      <details class="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 space-y-2">
        <summary class="cursor-pointer font-semibold text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400">
          Display Adjustments
        </summary>
        <div class="pt-2 space-y-2.5 text-xs">
          <div>
            <div class="flex justify-between text-slate-500 dark:text-slate-400 mb-1">
              <span>Brightness</span>
              <span class="mono font-semibold">{s.brightness.toFixed(2)}×</span>
            </div>
            <input
              type="range"
              min="0.2"
              max="3"
              step="0.05"
              value={s.brightness}
              onInput={e => set({ brightness: parseFloat((e.target as HTMLInputElement).value) })}
              class="w-full"
            />
          </div>
          <div>
            <div class="flex justify-between text-slate-500 dark:text-slate-400 mb-1">
              <span>Contrast</span>
              <span class="mono font-semibold">{s.contrast.toFixed(2)}×</span>
            </div>
            <input
              type="range"
              min="0.2"
              max="3"
              step="0.05"
              value={s.contrast}
              onInput={e => set({ contrast: parseFloat((e.target as HTMLInputElement).value) })}
              class="w-full"
            />
          </div>
          <div>
            <div class="flex justify-between text-slate-500 dark:text-slate-400 mb-1">
              <span>Min Contrast Clip (Black Level)</span>
              <span class="mono font-semibold">{Math.round((s.minClip ?? 0) * 100)}%</span>
            </div>
            <input
              type="range"
              min="0.0"
              max="0.7"
              step="0.01"
              value={s.minClip ?? 0}
              onInput={e => set({ minClip: parseFloat((e.target as HTMLInputElement).value) })}
              class="w-full accent-accent-600"
            />
          </div>
          <div>
            <div class="flex justify-between text-slate-500 dark:text-slate-400 mb-1">
              <span>Max Contrast Clip (White Level)</span>
              <span class="mono font-semibold">{Math.round((s.maxClip ?? 1) * 100)}%</span>
            </div>
            <input
              type="range"
              min="0.3"
              max="1.0"
              step="0.01"
              value={s.maxClip ?? 1}
              onInput={e => set({ maxClip: parseFloat((e.target as HTMLInputElement).value) })}
              class="w-full accent-accent-600"
            />
          </div>
          <div>
            <div class="flex justify-between text-slate-500 dark:text-slate-400 mb-1">
              <span>Gamma Curve</span>
              <span class="mono font-semibold">{(s.gamma ?? 1).toFixed(2)}</span>
            </div>
            <input
              type="range"
              min="0.4"
              max="2.5"
              step="0.05"
              value={s.gamma ?? 1}
              onInput={e => set({ gamma: parseFloat((e.target as HTMLInputElement).value) })}
              class="w-full accent-accent-600"
            />
          </div>
          <div class="flex items-center justify-between pt-1">
            <label class="flex items-center gap-2 text-slate-700 dark:text-slate-300 cursor-pointer font-medium">
              <input
                type="checkbox"
                checked={s.invertDisplay}
                onChange={e => set({ invertDisplay: (e.target as HTMLInputElement).checked })}
                class="rounded border-slate-300"
              />
              Invert Display
            </label>
            <button
              type="button"
              onClick={() => set({ brightness: 1, contrast: 1, minClip: 0, maxClip: 1, gamma: 1, invertDisplay: false })}
              class="px-2 py-0.5 rounded border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-[11px] text-slate-500 dark:text-slate-400 font-medium"
            >
              Reset Display
            </button>
          </div>
          <p class="text-[10px] text-slate-500 dark:text-slate-400 italic pt-0.5 leading-normal">
            Adjusts visualization &amp; strip contrast only without altering raw linear densitometry data.
          </p>
        </div>
      </details>
    </div>
  );
}
