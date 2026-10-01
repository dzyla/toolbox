import { CELL_LINE_PRESETS, CULTURE_VESSELS } from '@/core/cells/culture';
import { DecimalInput } from '@/app/components/DecimalInput';
import type { CultureModel } from '../CultureModel';
import { DEFAULT_OBSERVATIONS, ExponentPills, getNowDateTimeString } from '../CultureModel';

export function InputsPanel({ m }: { m: CultureModel }) {
  const {
    handleAddObservation,
    handleRemoveObservation,
    handleSelectCellLine,
    newObsCount,
    newObsTime,
    s,
    selectedCellLine,
    set,
    setNewObsCount,
    setNewObsTime,
  } = m;
  return (
    <div class="space-y-4">
      {/* Cell Line Presets Card */}
      <div class="space-y-1.5 rounded-xl border border-slate-200 bg-white p-3.5 dark:border-slate-800 dark:bg-slate-900 shadow-xs">
        <div class="flex items-center justify-between">
          <label class="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
            Cell Line Preset:
          </label>
          {selectedCellLine && (
            <span class="text-[11px] font-semibold text-accent-600 dark:text-accent-400">
              Td ≈ {selectedCellLine.doublingTimeHours} h
            </span>
          )}
        </div>
        <select
          aria-label="Cell Line Preset"
          value={s.selectedCellLineId}
          onChange={e => handleSelectCellLine((e.target as HTMLSelectElement).value)}
          class="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium dark:border-slate-700 dark:bg-slate-900"
        >
          <option value="custom">— Custom / User-Defined —</option>
          {CELL_LINE_PRESETS.map(c => (
            <option key={c.id} value={c.id}>
              {c.name} ({c.organism}) · Td ≈ {c.doublingTimeHours}h · {c.recommendedDensityPerCm2.toLocaleString()} cells/cm²
            </option>
          ))}
        </select>
        {selectedCellLine && (
          <p class="text-[11px] text-slate-500 dark:text-slate-400 pt-0.5">
            {selectedCellLine.description}
          </p>
        )}
      </div>

      {/* Navigation Tabs */}
      <div class="grid grid-cols-3 gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl text-xs font-semibold">
        <button
          type="button"
          onClick={() => set({ activeTab: 'passaging' })}
          class={`py-1.5 rounded-lg text-center transition cursor-pointer ${s.activeTab === 'passaging' ? 'bg-white dark:bg-slate-700 shadow-xs text-slate-900 dark:text-slate-100' : 'text-slate-600 dark:text-slate-300 hover:text-slate-900'}`}
        >
          Passaging &amp; Seeding
        </button>
        <button
          type="button"
          onClick={() => set({ activeTab: 'doubling' })}
          class={`py-1.5 rounded-lg text-center transition cursor-pointer ${s.activeTab === 'doubling' ? 'bg-white dark:bg-slate-700 shadow-xs text-slate-900 dark:text-slate-100' : 'text-slate-600 dark:text-slate-300 hover:text-slate-900'}`}
        >
          Doubling Time &amp; Growth
        </button>
        <button
          type="button"
          onClick={() => set({ activeTab: 'harvest' })}
          class={`py-1.5 rounded-lg text-center transition cursor-pointer ${s.activeTab === 'harvest' ? 'bg-white dark:bg-slate-700 shadow-xs text-slate-900 dark:text-slate-100' : 'text-slate-600 dark:text-slate-300 hover:text-slate-900'}`}
        >
          Harvest Predictor
        </button>
      </div>

      {/* TAB 1: PASSAGING & SEEDING */}
      {s.activeTab === 'passaging' && (
        <div class="space-y-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 shadow-xs">
          <div>
            <label class="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Destination Culture Vessel
            </label>
            <select aria-label="Destination Culture Vessel"
              value={s.selectedVesselId}
              onChange={(e) => set({ selectedVesselId: (e.target as HTMLSelectElement).value })}
              class="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-900"
            >
              {CULTURE_VESSELS.map(v => (
                <option key={v.id} value={v.id}>
                  {v.name} ({v.areaCm2} cm² · {v.typicalVolumeMl} mL)
                </option>
              ))}
            </select>
          </div>

          <div>
            <label class="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Harvest Cell Concentration (cells / mL)
            </label>
            <DecimalInput aria-label="Harvest Cell Concentration (cells / mL)"
              min={1}
              value={s.harvestConc}
              onChange={(val) => set({ harvestConc: val || 1 })}
              placeholder="e.g. 1.5e6, 1500000"
              class="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-900"
            />
            <ExponentPills
              value={s.harvestConc}
              onChange={val => set({ harvestConc: val || 1 })}
              exponents={[4, 5, 6, 7, 8]}
              label="Exponent pill:"
            />
          </div>

          <div class="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => set({ passagingMode: 'density' })}
              class={`py-1.5 rounded-lg text-xs font-semibold border transition cursor-pointer ${s.passagingMode === 'density' ? 'bg-accent-600 text-white border-accent-600' : 'border-slate-300 dark:border-slate-700'}`}
            >
              By Target Density
            </button>
            <button
              type="button"
              onClick={() => set({ passagingMode: 'split' })}
              class={`py-1.5 rounded-lg text-xs font-semibold border transition cursor-pointer ${s.passagingMode === 'split' ? 'bg-accent-600 text-white border-accent-600' : 'border-slate-300 dark:border-slate-700'}`}
            >
              By Split Ratio (1:X)
            </button>
          </div>

          {s.passagingMode === 'density' ? (
            <div>
              <label class="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Target Seeding Density (cells / cm²)
              </label>
              <DecimalInput aria-label="Target Seeding Density (cells / cm²)"
                min={0}
                value={s.targetDensity}
                onChange={(val) => set({ targetDensity: val || 0 })}
                placeholder="e.g. 25000"
                class="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-900"
              />
              <ExponentPills
                value={s.targetDensity}
                onChange={val => set({ targetDensity: val || 0 })}
                exponents={[3, 4, 5, 6]}
                label="Exponent pill:"
              />
            </div>
          ) : (
            <div>
              <label class="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Split Ratio (1:X)
              </label>
              <input aria-label="Split Ratio (1:X)"
                type="number"
                min="2"
                max="20"
                step="1"
                value={s.splitRatio}
                onInput={(e) => set({ splitRatio: parseInt((e.target as HTMLInputElement).value) || 2 })}
                class="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-900"
              />
            </div>
          )}

          <div>
            <label class="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Number of Vessels to Seed
            </label>
            <input aria-label="Number of Vessels to Seed"
              type="number"
              min="1"
              step="1"
              value={s.vesselCount}
              onInput={(e) => set({ vesselCount: parseInt((e.target as HTMLInputElement).value) || 1 })}
              class="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-900"
            />
          </div>
        </div>
      )}

      {/* TAB 2: DOUBLING TIME & MULTI-POINT OBSERVATIONS */}
      {s.activeTab === 'doubling' && (
        <div class="space-y-4 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 shadow-xs">
          <div class="flex rounded-lg bg-slate-100 p-1 dark:bg-slate-800 text-xs font-semibold">
            <button
              type="button"
              onClick={() => set({ doublingMode: 'interval' })}
              class={`flex-1 py-1 rounded-md transition cursor-pointer ${s.doublingMode === 'interval' ? 'bg-white shadow-2xs text-slate-900 dark:bg-slate-700 dark:text-slate-100' : 'text-slate-600 dark:text-slate-300'}`}
            >
              2-Point Count Interval
            </button>
            <button
              type="button"
              onClick={() => set({ doublingMode: 'multipoint' })}
              class={`flex-1 py-1 rounded-md transition cursor-pointer ${s.doublingMode === 'multipoint' ? 'bg-white shadow-2xs text-slate-900 dark:bg-slate-700 dark:text-slate-100' : 'text-slate-600 dark:text-slate-300'}`}
            >
              Multi-Point Observations (t₁, N₁, t₂, N₂…)
            </button>
          </div>

          {s.doublingMode === 'interval' ? (
            <div class="space-y-3">
              {selectedCellLine && (
                <button
                  type="button"
                  onClick={() => {
                    const n0 = 200_000;
                    const doublings = 48 / selectedCellLine.doublingTimeHours;
                    const nt = Math.round(n0 * Math.pow(2, doublings));
                    set({ initialCount: n0, finalCount: nt, elapsedHours: 48 });
                  }}
                  class="text-[11px] text-accent-600 dark:text-accent-400 hover:underline font-medium block text-left cursor-pointer"
                >
                  ⚡ Prefill with {selectedCellLine.name} 48-hour growth model (Td ≈ {selectedCellLine.doublingTimeHours}h)
                </button>
              )}

              <div>
                <label class="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Initial Cell Count (N₀)
                </label>
                <DecimalInput aria-label="Initial Cell Count (N₀)"
                  min={1}
                  value={s.initialCount}
                  onChange={(val) => set({ initialCount: val || 1 })}
                  placeholder="e.g. 200000"
                  class="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-900"
                />
                <ExponentPills
                  value={s.initialCount}
                  onChange={val => set({ initialCount: val || 1 })}
                  exponents={[4, 5, 6, 7, 8]}
                  label="Exponent pill:"
                />
              </div>

              <div>
                <label class="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Final Harvest Count (Nt)
                </label>
                <DecimalInput aria-label="Final Harvest Count (Nt)"
                  min={1}
                  value={s.finalCount}
                  onChange={(val) => set({ finalCount: val || 1 })}
                  placeholder="e.g. 1600000"
                  class="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-900"
                />
                <ExponentPills
                  value={s.finalCount}
                  onChange={val => set({ finalCount: val || 1 })}
                  exponents={[4, 5, 6, 7, 8]}
                  label="Exponent pill:"
                />
              </div>

              <div>
                <label class="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Elapsed Time (hours)
                </label>
                <input aria-label="Elapsed Time (hours)"
                  type="number"
                  min="0.01"
                  step="any"
                  value={s.elapsedHours}
                  onInput={(e) => set({ elapsedHours: parseFloat((e.target as HTMLInputElement).value) || 1 })}
                  class="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-900"
                />
              </div>
            </div>
          ) : (
            <div class="space-y-3">
              <div class="flex items-center justify-between">
                <span class="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                  Growth Observations Table
                </span>
                <button
                  type="button"
                  onClick={() => set({ observations: DEFAULT_OBSERVATIONS })}
                  class="text-[11px] text-slate-500 dark:text-slate-400 hover:underline cursor-pointer"
                >
                  Reset Example Points
                </button>
              </div>

              {/* Observations list */}
              <div class="space-y-1.5 max-h-48 overflow-y-auto">
                {(s.observations || DEFAULT_OBSERVATIONS).map((obs, idx) => (
                  <div key={idx} class="flex items-center gap-2 p-1.5 rounded-lg bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 text-xs">
                    <span class="font-mono text-slate-500 dark:text-slate-400 w-5 text-center">#{idx + 1}</span>
                    <div class="flex-1 flex items-center gap-1">
                      <span class="text-slate-500 dark:text-slate-400 text-[11px]">t:</span>
                      <span class="font-mono font-semibold text-slate-800 dark:text-slate-200">{obs.timeHours} h</span>
                    </div>
                    <div class="flex-2 flex items-center gap-1">
                      <span class="text-slate-500 dark:text-slate-400 text-[11px]">Count:</span>
                      <span class="font-mono font-bold text-slate-900 dark:text-slate-100">{obs.count.toLocaleString()}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveObservation(idx)}
                      disabled={(s.observations || DEFAULT_OBSERVATIONS).length <= 2}
                      class="text-rose-500 hover:text-rose-700 text-xs px-1.5 py-0.5 disabled:opacity-30 cursor-pointer"
                      title="Delete observation point"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>

              {/* Add observation form */}
              <div class="p-2.5 rounded-lg border border-dashed border-slate-300 dark:border-slate-700 space-y-2">
                <span class="text-[11px] font-bold text-slate-600 dark:text-slate-400 block">
                  + Add New Observation Point:
                </span>
                <div class="grid grid-cols-2 gap-2">
                  <div>
                    <label class="block text-[10px] text-slate-500 dark:text-slate-400 mb-0.5">Elapsed Time (h):</label>
                    <input aria-label="Elapsed Time (h)"
                      type="number"
                      min="0"
                      step="any"
                      value={newObsTime}
                      onInput={e => setNewObsTime((e.target as HTMLInputElement).value)}
                      class="w-full text-xs p-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono"
                    />
                  </div>
                  <div>
                    <label class="block text-[10px] text-slate-500 dark:text-slate-400 mb-0.5">Cell Count:</label>
                    <DecimalInput aria-label="Cell Count"
                      min={1}
                      value={newObsCount}
                      onChange={v => setNewObsCount(v || 1)}
                      class="w-full text-xs p-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono"
                    />
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleAddObservation}
                  class="w-full py-1 text-xs font-semibold rounded bg-slate-800 text-white dark:bg-slate-200 dark:text-slate-900 hover:bg-slate-700 transition cursor-pointer"
                >
                  + Add Observation Point
                </button>
              </div>

              {/* Target for Prediction */}
              <div class="pt-2 border-t border-slate-100 dark:border-slate-800">
                <label class="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Predict Time to Reach Target Yield (cells):
                </label>
                <DecimalInput aria-label="Predict Time to Reach Target Yield (cells)"
                  min={1}
                  value={s.obsTargetCount}
                  onChange={v => set({ obsTargetCount: v || 1 })}
                  placeholder="e.g. 2000000"
                  class="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-900"
                />
                <ExponentPills
                  value={s.obsTargetCount}
                  onChange={v => set({ obsTargetCount: v || 1 })}
                  exponents={[5, 6, 7, 8]}
                  label="Exponent pill:"
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: HARVEST & AVAILABILITY PREDICTOR */}
      {s.activeTab === 'harvest' && (
        <div class="space-y-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 shadow-xs">
          <div class="flex items-center justify-between">
            <span class="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
              Harvest Time &amp; Date Forecaster
            </span>
            {selectedCellLine && (
              <button
                type="button"
                onClick={() => set({ harvestDoublingHours: selectedCellLine.doublingTimeHours })}
                class="text-[11px] text-accent-600 dark:text-accent-400 hover:underline font-medium cursor-pointer"
              >
                Use {selectedCellLine.name} Td ({selectedCellLine.doublingTimeHours}h)
              </button>
            )}
          </div>

          <div>
            <label class="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Start Date &amp; Time:
            </label>
            <div class="flex gap-2">
              <input
                type="datetime-local"
                value={s.harvestStartDateTime || getNowDateTimeString()}
                onChange={e => set({ harvestStartDateTime: (e.target as HTMLInputElement).value })}
                class="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-mono dark:border-slate-700 dark:bg-slate-900"
              />
              <button
                type="button"
                onClick={() => set({ harvestStartDateTime: getNowDateTimeString() })}
                class="px-2.5 py-1 text-xs font-medium rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                title="Set to current date and time"
              >
                Now
              </button>
            </div>
          </div>

          <div>
            <label class="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Initial Seeded Count (N₀):
            </label>
            <DecimalInput aria-label="Initial Seeded Count (N₀)"
              min={1}
              value={s.harvestStartCount}
              onChange={v => set({ harvestStartCount: v || 1 })}
              class="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-900"
            />
            <ExponentPills
              value={s.harvestStartCount}
              onChange={v => set({ harvestStartCount: v || 1 })}
              exponents={[4, 5, 6, 7]}
              label="Exponent pill:"
            />
          </div>

          <div>
            <label class="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Target Harvest Count (N_target):
            </label>
            <DecimalInput aria-label="Target Harvest Count (N_target)"
              min={1}
              value={s.harvestTargetCount}
              onChange={v => set({ harvestTargetCount: v || 1 })}
              class="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-900"
            />
            <ExponentPills
              value={s.harvestTargetCount}
              onChange={v => set({ harvestTargetCount: v || 1 })}
              exponents={[5, 6, 7, 8]}
              label="Exponent pill:"
            />
          </div>

          <div>
            <label class="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Expected Doubling Time Td (hours):
            </label>
            <input aria-label="Expected Doubling Time Td (hours)"
              type="number"
              min="0.5"
              step="0.5"
              value={s.harvestDoublingHours}
              onInput={e => set({ harvestDoublingHours: parseFloat((e.target as HTMLInputElement).value) || 20 })}
              class="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-900 font-mono"
            />
          </div>
        </div>
      )}
    </div>
  );
}
