import { useMemo } from 'preact/hooks';
import {
  CULTURE_VESSELS,
  calculateDoublingTime,
  calculateSeeding,
  type CultureVessel,
} from '@/core/cells/culture';
import { ToolLayout } from '@/app/components/ToolLayout';
import { SciencePanel, scienceText } from '@/app/components/SciencePanel';
import { ActionBar } from '@/app/components/ActionBar';
import { useUrlState } from '@/lib/url-state';
import { SCIENCE } from './science';

interface State {
  activeTab: 'passaging' | 'doubling';
  // Passaging inputs
  harvestConc: number; // cells/mL
  targetDensity: number; // cells/cm^2
  selectedVesselId: string;
  vesselCount: number;
  splitRatio: number;
  passagingMode: 'density' | 'split';
  // Doubling time inputs
  initialCount: number;
  finalCount: number;
  elapsedHours: number;
}

const DEFAULTS: State = {
  activeTab: 'passaging',
  harvestConc: 1_000_000,
  targetDensity: 20_000,
  selectedVesselId: 'flask-t75',
  vesselCount: 2,
  splitRatio: 5,
  passagingMode: 'density',
  initialCount: 200_000,
  finalCount: 1_600_000,
  elapsedHours: 48,
};

export default function CultureView() {
  const [stateSig, shareUrl] = useUrlState<State>('culture', DEFAULTS);
  const s = stateSig.value;
  const set = (patch: Partial<State>) => { stateSig.value = { ...stateSig.value, ...patch }; };

  const selectedVessel: CultureVessel = useMemo(() => {
    return CULTURE_VESSELS.find(v => v.id === s.selectedVesselId) || CULTURE_VESSELS[10]!;
  }, [s.selectedVesselId]);

  const seedingResult = useMemo(() => {
    try {
      const effectiveDensity = s.passagingMode === 'split'
        ? (selectedVessel.typicalMaxCells * 0.8) / (s.splitRatio * selectedVessel.areaCm2)
        : s.targetDensity;

      return calculateSeeding({
        targetDensityPerCm2: effectiveDensity,
        vesselAreaCm2: selectedVessel.areaCm2,
        vesselCount: s.vesselCount,
        stockConcentrationCellsPerMl: s.harvestConc,
      });
    } catch (err) {
      return { error: (err as Error).message };
    }
  }, [s.passagingMode, s.splitRatio, s.targetDensity, selectedVessel, s.vesselCount, s.harvestConc]);

  const doublingResult = useMemo(() => {
    try {
      return calculateDoublingTime(s.initialCount, s.finalCount, s.elapsedHours);
    } catch (err) {
      return { error: (err as Error).message };
    }
  }, [s.initialCount, s.finalCount, s.elapsedHours]);

  const copyText = s.activeTab === 'passaging'
    ? ('error' in seedingResult ? seedingResult.error! : [
        `Cell Culture Passaging: ${selectedVessel.name}`,
        `Seeding Volume per Vessel: ${(seedingResult.volumePerVesselMl * 1000).toFixed(1)} µL (${(seedingResult.cellsPerVessel).toLocaleString()} cells)`,
        `Media to Top Up: ${(selectedVessel.typicalVolumeMl - seedingResult.volumePerVesselMl).toFixed(2)} mL (Total ${selectedVessel.typicalVolumeMl} mL)`,
        `Total Seeding Volume (${s.vesselCount} vessels): ${(seedingResult.totalVolumeNeededMl).toFixed(2)} mL`,
        '',
        scienceText(SCIENCE),
      ].join('\n'))
    : ('error' in doublingResult ? doublingResult.error! : [
        `Doubling Time: ${doublingResult.doublingTimeHours.toFixed(1)} hours`,
        `Growth Rate: ${doublingResult.growthRatePerHour.toFixed(4)} h⁻¹`,
        `Population Doublings: ${doublingResult.populationDoublings.toFixed(2)} doublings over ${s.elapsedHours} h`,
        '',
        scienceText(SCIENCE),
      ].join('\n'));

  return (
    <ToolLayout
      icon="🧫"
      title="Cell Culture & Passaging"
      blurb="Calculate seeding densities, vessel volume scaling, doubling time, and split ratios."
      inputs={
        <div class="space-y-4">
          <div class="flex gap-2">
            <button
              type="button"
              onClick={() => set({ activeTab: 'passaging' })}
              class={`flex-1 py-1.5 rounded-full text-xs font-semibold transition ${s.activeTab === 'passaging' ? 'bg-accent-600 text-white' : 'border border-slate-300 dark:border-slate-700'}`}
            >
              Passaging & Seeding
            </button>
            <button
              type="button"
              onClick={() => set({ activeTab: 'doubling' })}
              class={`flex-1 py-1.5 rounded-full text-xs font-semibold transition ${s.activeTab === 'doubling' ? 'bg-accent-600 text-white' : 'border border-slate-300 dark:border-slate-700'}`}
            >
              Doubling Time & Growth
            </button>
          </div>

          {s.activeTab === 'passaging' ? (
            <div class="space-y-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
              <div>
                <label class="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                  Destination Culture Vessel
                </label>
                <select
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
                <label class="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                  Harvest Cell Concentration (cells / mL)
                </label>
                <input
                  type="number"
                  min="1000"
                  step="50000"
                  value={s.harvestConc}
                  onInput={(e) => set({ harvestConc: parseFloat((e.target as HTMLInputElement).value) || 1 })}
                  class="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-900"
                />
              </div>

              <div class="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => set({ passagingMode: 'density' })}
                  class={`py-1.5 rounded-lg text-xs font-semibold border transition ${s.passagingMode === 'density' ? 'bg-accent-600 text-white border-accent-600' : 'border-slate-300 dark:border-slate-700'}`}
                >
                  By Target Density
                </button>
                <button
                  type="button"
                  onClick={() => set({ passagingMode: 'split' })}
                  class={`py-1.5 rounded-lg text-xs font-semibold border transition ${s.passagingMode === 'split' ? 'bg-accent-600 text-white border-accent-600' : 'border-slate-300 dark:border-slate-700'}`}
                >
                  By Split Ratio (1:X)
                </button>
              </div>

              {s.passagingMode === 'density' ? (
                <div>
                  <label class="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                    Target Seeding Density (cells / cm²)
                  </label>
                  <input
                    type="number"
                    min="100"
                    step="1000"
                    value={s.targetDensity}
                    onInput={(e) => set({ targetDensity: parseFloat((e.target as HTMLInputElement).value) || 0 })}
                    class="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-900"
                  />
                  <span class="text-[11px] text-slate-400 mt-1 block">
                    Typical: 10,000–30,000 cells/cm² for routine maintenance.
                  </span>
                </div>
              ) : (
                <div>
                  <label class="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                    Split Ratio (1:X)
                  </label>
                  <input
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
                <label class="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                  Number of Vessels to Seed
                </label>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={s.vesselCount}
                  onInput={(e) => set({ vesselCount: parseInt((e.target as HTMLInputElement).value) || 1 })}
                  class="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-900"
                />
              </div>
            </div>
          ) : (
            <div class="space-y-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
              <div>
                <label class="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                  Initial Cell Count (N₀)
                </label>
                <input
                  type="number"
                  min="1000"
                  step="10000"
                  value={s.initialCount}
                  onInput={(e) => set({ initialCount: parseFloat((e.target as HTMLInputElement).value) || 1 })}
                  class="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-900"
                />
              </div>
              <div>
                <label class="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                  Final Harvest Count (Nt)
                </label>
                <input
                  type="number"
                  min="1000"
                  step="50000"
                  value={s.finalCount}
                  onInput={(e) => set({ finalCount: parseFloat((e.target as HTMLInputElement).value) || 1 })}
                  class="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-900"
                />
              </div>
              <div>
                <label class="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                  Elapsed Time (hours)
                </label>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={s.elapsedHours}
                  onInput={(e) => set({ elapsedHours: parseFloat((e.target as HTMLInputElement).value) || 1 })}
                  class="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-900"
                />
              </div>
            </div>
          )}
        </div>
      }
      results={
        <div class="space-y-4">
          {s.activeTab === 'passaging' ? (
            'error' in seedingResult ? (
              <p role="alert" class="text-sm text-red-600">{seedingResult.error}</p>
            ) : (
              <>
                <div class="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <div class="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                    <span class="text-xs text-slate-500 block">Suspension per Vessel</span>
                    <span data-testid="suspension-vol" class="font-mono text-2xl font-bold text-slate-900 dark:text-slate-100">
                      {seedingResult.volumePerVesselMl >= 1
                        ? `${seedingResult.volumePerVesselMl.toFixed(2)} mL`
                        : `${(seedingResult.volumePerVesselMl * 1000).toFixed(0)} µL`}
                    </span>
                    <span class="text-[11px] text-slate-400 block">cell suspension</span>
                  </div>

                  <div class="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                    <span class="text-xs text-slate-500 block">Media Top-Up</span>
                    <span class="font-mono text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                      {Math.max(0, selectedVessel.typicalVolumeMl - seedingResult.volumePerVesselMl).toFixed(2)} mL
                    </span>
                    <span class="text-[11px] text-slate-400 block">fresh media per vessel</span>
                  </div>

                  <div class="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                    <span class="text-xs text-slate-500 block">Cells per Vessel</span>
                    <span class="font-mono text-2xl font-bold text-accent-600 dark:text-accent-400">
                      {seedingResult.cellsPerVessel.toLocaleString()}
                    </span>
                    <span class="text-[11px] text-slate-400 block">total seeded</span>
                  </div>
                </div>

                <div class="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 space-y-2 text-xs">
                  <h4 class="font-bold text-slate-900 dark:text-slate-100 text-sm">Passaging Protocol Recipe</h4>
                  <div class="space-y-1.5 text-slate-600 dark:text-slate-400">
                    <p>1. Prepare <strong>{s.vesselCount} × {selectedVessel.name}</strong> ({selectedVessel.areaCm2} cm² growth area each).</p>
                    <p>2. Pipette <strong>{seedingResult.volumePerVesselMl >= 1 ? `${seedingResult.volumePerVesselMl.toFixed(2)} mL` : `${(seedingResult.volumePerVesselMl * 1000).toFixed(0)} µL`}</strong> of cell suspension into each vessel.</p>
                    <p>3. Add <strong>{Math.max(0, selectedVessel.typicalVolumeMl - seedingResult.volumePerVesselMl).toFixed(2)} mL</strong> fresh media to bring total working volume to <strong>{selectedVessel.typicalVolumeMl} mL</strong>.</p>
                    <p>4. Total stock suspension required across all vessels: <strong>{seedingResult.totalVolumeNeededMl.toFixed(2)} mL</strong>.</p>
                  </div>
                </div>
              </>
            )
          ) : (
            'error' in doublingResult ? (
              <p role="alert" class="text-sm text-red-600">{doublingResult.error}</p>
            ) : (
              <>
                <div class="grid grid-cols-3 gap-3">
                  <div class="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                    <span class="text-xs text-slate-500 block">Doubling Time (Td)</span>
                    <span data-testid="doubling-time" class="font-mono text-2xl font-bold text-slate-900 dark:text-slate-100">
                      {doublingResult.doublingTimeHours.toFixed(1)} h
                    </span>
                    <span class="text-[11px] text-slate-400 block">{(doublingResult.doublingTimeHours / 24).toFixed(2)} days</span>
                  </div>

                  <div class="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                    <span class="text-xs text-slate-500 block">Growth Rate (µ)</span>
                    <span class="font-mono text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                      {doublingResult.growthRatePerHour.toFixed(3)}
                    </span>
                    <span class="text-[11px] text-slate-400 block">per hour</span>
                  </div>

                  <div class="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                    <span class="text-xs text-slate-500 block">Population Doublings</span>
                    <span class="font-mono text-2xl font-bold text-accent-600 dark:text-accent-400">
                      {doublingResult.populationDoublings.toFixed(2)}
                    </span>
                    <span class="text-[11px] text-slate-400 block">doublings</span>
                  </div>
                </div>
              </>
            )
          )}
        </div>
      }
      actions={<ActionBar onCopy={() => copyText} shareUrl={shareUrl} />}
      science={<SciencePanel science={SCIENCE} />}
    />
  );
}
