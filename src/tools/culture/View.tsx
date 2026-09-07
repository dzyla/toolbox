import { useMemo, useState } from 'preact/hooks';
import {
  CULTURE_VESSELS,
  CELL_LINE_PRESETS,
  calculateDoublingTime,
  calculateSeeding,
  fitGrowthObservations,
  calculateHarvestTime,
  type CultureVessel,
  type CellLinePreset,
  type GrowthObservation,
} from '@/core/cells/culture';
import { ToolLayout } from '@/app/components/ToolLayout';
import { SciencePanel, scienceText } from '@/app/components/SciencePanel';
import { ActionBar } from '@/app/components/ActionBar';
import { DecimalInput } from '@/app/components/DecimalInput';
import { useUrlState } from '@/lib/url-state';
import { SCIENCE } from './science';

interface State {
  activeTab: 'passaging' | 'doubling' | 'harvest';
  selectedCellLineId: string;
  // Passaging inputs
  harvestConc: number; // cells/mL
  targetDensity: number; // cells/cm^2
  selectedVesselId: string;
  vesselCount: number;
  splitRatio: number;
  passagingMode: 'density' | 'split';
  // Doubling time inputs
  doublingMode: 'interval' | 'multipoint';
  initialCount: number;
  finalCount: number;
  elapsedHours: number;
  observations: GrowthObservation[];
  obsTargetCount: number;
  // Harvest availability predictor
  harvestStartCount: number;
  harvestTargetCount: number;
  harvestDoublingHours: number;
  harvestStartDateTime: string;
}

const DEFAULT_OBSERVATIONS: GrowthObservation[] = [
  { timeHours: 0, count: 100_000 },
  { timeHours: 24, count: 210_000 },
  { timeHours: 48, count: 430_000 },
  { timeHours: 72, count: 880_000 },
];

const getNowDateTimeString = () => {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
};

const DEFAULTS: State = {
  activeTab: 'passaging',
  selectedCellLineId: 'hek293t',
  harvestConc: 1_500_000,
  targetDensity: 25_000,
  selectedVesselId: 'flask-t75',
  vesselCount: 2,
  splitRatio: 5,
  passagingMode: 'density',
  doublingMode: 'interval',
  initialCount: 200_000,
  finalCount: 1_600_000,
  elapsedHours: 48,
  observations: DEFAULT_OBSERVATIONS,
  obsTargetCount: 2_000_000,
  harvestStartCount: 200_000,
  harvestTargetCount: 2_000_000,
  harvestDoublingHours: 20,
  harvestStartDateTime: '2026-09-05T09:00',
};

function ExponentPills({
  value,
  onChange,
  exponents = [4, 5, 6, 7, 8],
  label = 'Quick scale:',
}: {
  value: number;
  onChange: (val: number) => void;
  exponents?: number[];
  label?: string;
}) {
  const currentExp = value > 0 ? Math.floor(Math.log10(value)) : null;

  const handleExp = (exp: number) => {
    if (!value || value <= 0 || isNaN(value)) {
      onChange(Math.pow(10, exp));
      return;
    }
    let mantissa: number;
    if (value >= 0.5 && value < 10) {
      mantissa = Math.round(value * 1000) / 1000;
    } else {
      const expOld = Math.floor(Math.log10(value));
      mantissa = Math.round((value / Math.pow(10, expOld)) * 1000) / 1000;
    }
    onChange(mantissa * Math.pow(10, exp));
  };

  const expSymbols: Record<number, string> = {
    3: '×10³',
    4: '×10⁴',
    5: '×10⁵',
    6: '×10⁶',
    7: '×10⁷',
    8: '×10⁸',
    9: '×10⁹',
  };

  return (
    <div class="flex items-center gap-1.5 flex-wrap pt-1">
      <span class="text-[10px] uppercase font-bold tracking-wider text-slate-400 select-none">{label}</span>
      <div class="flex gap-1 flex-wrap">
        {exponents.map(exp => {
          const isActive = currentExp === exp;
          return (
            <button
              key={exp}
              type="button"
              onClick={() => handleExp(exp)}
              class={`px-2 py-0.5 rounded text-[11px] font-mono font-medium transition border cursor-pointer ${
                isActive
                  ? 'bg-accent-600 text-white border-accent-600 shadow-2xs font-bold'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
              title={`Scale value to 10^${exp}`}
            >
              {expSymbols[exp] || `10^${exp}`}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function CultureView() {
  const [stateSig, shareUrl] = useUrlState<State>('culture', DEFAULTS);
  const s = stateSig.value;
  const set = (patch: Partial<State>) => { stateSig.value = { ...stateSig.value, ...patch }; };

  const [newObsTime, setNewObsTime] = useState<string>('96');
  const [newObsCount, setNewObsCount] = useState<number>(1_800_000);

  const selectedVessel: CultureVessel = useMemo(() => {
    return CULTURE_VESSELS.find(v => v.id === s.selectedVesselId) || CULTURE_VESSELS[10]!;
  }, [s.selectedVesselId]);

  const selectedCellLine: CellLinePreset | null = useMemo(() => {
    return CELL_LINE_PRESETS.find(c => c.id === s.selectedCellLineId) || null;
  }, [s.selectedCellLineId]);

  const handleSelectCellLine = (id: string) => {
    set({ selectedCellLineId: id });
    const preset = CELL_LINE_PRESETS.find(c => c.id === id);
    if (preset) {
      set({
        targetDensity: preset.recommendedDensityPerCm2,
        harvestConc: preset.typicalHarvestConcCellsPerMl,
        harvestDoublingHours: preset.doublingTimeHours,
      });
    }
  };

  // Passaging Seeding Calculation
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

  // Doubling 2-Point Calculation
  const doublingResult = useMemo(() => {
    try {
      return calculateDoublingTime(s.initialCount, s.finalCount, s.elapsedHours);
    } catch (err) {
      return { error: (err as Error).message };
    }
  }, [s.initialCount, s.finalCount, s.elapsedHours]);

  // Multi-point Growth Observations Fit
  const multiPointResult = useMemo(() => {
    try {
      const fit = fitGrowthObservations(s.observations || DEFAULT_OBSERVATIONS);
      const targetPred = fit.calculateTimeToTarget(s.obsTargetCount);
      return { fit, targetPred };
    } catch (err) {
      return { error: (err as Error).message };
    }
  }, [s.observations, s.obsTargetCount]);

  // Harvest Availability Predictor
  const harvestResult = useMemo(() => {
    try {
      return calculateHarvestTime({
        initialCount: s.harvestStartCount,
        targetCount: s.harvestTargetCount,
        doublingTimeHours: s.harvestDoublingHours,
        startDateTime: s.harvestStartDateTime || getNowDateTimeString(),
      });
    } catch (err) {
      return { error: (err as Error).message };
    }
  }, [s.harvestStartCount, s.harvestTargetCount, s.harvestDoublingHours, s.harvestStartDateTime]);

  const handleAddObservation = () => {
    const timeVal = parseFloat(newObsTime);
    if (isNaN(timeVal) || newObsCount <= 0) return;
    const current = [...(s.observations || DEFAULT_OBSERVATIONS)];
    current.push({ timeHours: timeVal, count: newObsCount });
    current.sort((a, b) => a.timeHours - b.timeHours);
    set({ observations: current });
    setNewObsTime(`${timeVal + 24}`);
    setNewObsCount(newObsCount * 2);
  };

  const handleRemoveObservation = (index: number) => {
    const current = [...(s.observations || DEFAULT_OBSERVATIONS)];
    current.splice(index, 1);
    set({ observations: current });
  };

  const copyText = useMemo(() => {
    if (s.activeTab === 'passaging') {
      if ('error' in seedingResult) return seedingResult.error!;
      return [
        `Cell Culture Passaging: ${selectedVessel.name}`,
        `Seeding Volume per Vessel: ${(seedingResult.volumePerVesselMl * 1000).toFixed(1)} µL (${(seedingResult.cellsPerVessel).toLocaleString()} cells)`,
        `Media to Top Up: ${(selectedVessel.typicalVolumeMl - seedingResult.volumePerVesselMl).toFixed(2)} mL (Total ${selectedVessel.typicalVolumeMl} mL)`,
        `Total Seeding Volume (${s.vesselCount} vessels): ${(seedingResult.totalVolumeNeededMl).toFixed(2)} mL`,
        '',
        scienceText(SCIENCE),
      ].join('\n');
    }
    if (s.activeTab === 'doubling') {
      if (s.doublingMode === 'multipoint') {
        if ('error' in multiPointResult) return multiPointResult.error!;
        const { fit, targetPred } = multiPointResult;
        return [
          `Multi-Point Exponential Growth Fit:`,
          `Observed Doubling Time: ${fit.doublingTimeHours.toFixed(1)} hours (R² = ${fit.rSquared.toFixed(4)})`,
          `Specific Growth Rate (µ): ${fit.growthRatePerHour.toFixed(4)} h⁻¹`,
          `Estimated Initial Seeding N₀: ${Math.round(fit.initialCountEstimate).toLocaleString()} cells`,
          `Time to Target (${s.obsTargetCount.toLocaleString()} cells): ${targetPred.totalHoursFromZero.toFixed(1)} h from start (${targetPred.hoursFromLastObs.toFixed(1)} h from latest observation)`,
          '',
          scienceText(SCIENCE),
        ].join('\n');
      }
      if ('error' in doublingResult) return doublingResult.error!;
      return [
        `Doubling Time: ${doublingResult.doublingTimeHours.toFixed(1)} hours`,
        `Growth Rate: ${doublingResult.growthRatePerHour.toFixed(4)} h⁻¹`,
        `Population Doublings: ${doublingResult.populationDoublings.toFixed(2)} doublings over ${s.elapsedHours} h`,
        '',
        scienceText(SCIENCE),
      ].join('\n');
    }
    if ('error' in harvestResult) return harvestResult.error!;
    return [
      `Cell Harvest Availability Predictor:`,
      `Target Harvest Date/Time: ${harvestResult.targetDateFormatted}`,
      `Total Incubation Required: ${harvestResult.daysAndHoursText}`,
      `Doublings Required: ${harvestResult.doublingsRequired.toFixed(2)} generations`,
      `Window (±10% variance): ${harvestResult.windowEarlyFormatted} to ${harvestResult.windowLateFormatted}`,
      '',
      scienceText(SCIENCE),
    ].join('\n');
  }, [s.activeTab, s.doublingMode, seedingResult, doublingResult, multiPointResult, harvestResult, selectedVessel, s.vesselCount, s.elapsedHours, s.obsTargetCount]);

  return (
    <ToolLayout
      icon="🧫"
      title="Cell Culture & Passaging"
      blurb="Calculate seeding densities, vessel scaling, doubling time, and harvest availability forecasting."
      mobileResultSummary={
        s.activeTab === 'passaging' ? (
          'error' in seedingResult ? (
            <span class="text-rose-600 dark:text-rose-400 font-semibold">{seedingResult.error}</span>
          ) : (
            <span>Seed <strong class="text-accent-700 dark:text-accent-300 font-mono">{(seedingResult.volumePerVesselMl * 1000).toFixed(1)} µL</strong> ({seedingResult.cellsPerVessel.toLocaleString()} cells)</span>
          )
        ) : s.activeTab === 'doubling' ? (
          s.doublingMode === 'multipoint' ? (
            'error' in multiPointResult ? (
              <span class="text-rose-600 dark:text-rose-400 font-semibold">{multiPointResult.error}</span>
            ) : (
              <span>Td: <strong class="text-accent-700 dark:text-accent-300 font-mono">{multiPointResult.fit.doublingTimeHours.toFixed(1)} h</strong> (R²={multiPointResult.fit.rSquared.toFixed(3)})</span>
            )
          ) : (
            'error' in doublingResult ? (
              <span class="text-rose-600 dark:text-rose-400 font-semibold">{doublingResult.error}</span>
            ) : (
              <span>Doubling time: <strong class="text-accent-700 dark:text-accent-300 font-mono">{doublingResult.doublingTimeHours.toFixed(1)} h</strong></span>
            )
          )
        ) : (
          'error' in harvestResult ? (
            <span class="text-rose-600 dark:text-rose-400 font-semibold">{harvestResult.error}</span>
          ) : (
            <span>Available: <strong class="text-accent-700 dark:text-accent-300 font-mono">{harvestResult.targetDateFormatted}</strong> ({harvestResult.hoursRequired.toFixed(1)} h)</span>
          )
        )
      }
      inputs={
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
              class={`py-1.5 rounded-lg text-center transition cursor-pointer ${s.activeTab === 'passaging' ? 'bg-white dark:bg-slate-700 shadow-xs text-slate-900 dark:text-slate-100' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'}`}
            >
              Passaging &amp; Seeding
            </button>
            <button
              type="button"
              onClick={() => set({ activeTab: 'doubling' })}
              class={`py-1.5 rounded-lg text-center transition cursor-pointer ${s.activeTab === 'doubling' ? 'bg-white dark:bg-slate-700 shadow-xs text-slate-900 dark:text-slate-100' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'}`}
            >
              Doubling Time &amp; Growth
            </button>
            <button
              type="button"
              onClick={() => set({ activeTab: 'harvest' })}
              class={`py-1.5 rounded-lg text-center transition cursor-pointer ${s.activeTab === 'harvest' ? 'bg-white dark:bg-slate-700 shadow-xs text-slate-900 dark:text-slate-100' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'}`}
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
                <label class="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Harvest Cell Concentration (cells / mL)
                </label>
                <DecimalInput
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
                  <DecimalInput
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
                <label class="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
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
          )}

          {/* TAB 2: DOUBLING TIME & MULTI-POINT OBSERVATIONS */}
          {s.activeTab === 'doubling' && (
            <div class="space-y-4 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 shadow-xs">
              <div class="flex rounded-lg bg-slate-100 p-1 dark:bg-slate-800 text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => set({ doublingMode: 'interval' })}
                  class={`flex-1 py-1 rounded-md transition cursor-pointer ${s.doublingMode === 'interval' ? 'bg-white shadow-2xs text-slate-900 dark:bg-slate-700 dark:text-slate-100' : 'text-slate-600 dark:text-slate-400'}`}
                >
                  2-Point Count Interval
                </button>
                <button
                  type="button"
                  onClick={() => set({ doublingMode: 'multipoint' })}
                  class={`flex-1 py-1 rounded-md transition cursor-pointer ${s.doublingMode === 'multipoint' ? 'bg-white shadow-2xs text-slate-900 dark:bg-slate-700 dark:text-slate-100' : 'text-slate-600 dark:text-slate-400'}`}
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
                    <DecimalInput
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
                    <DecimalInput
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
                    <input
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
                      class="text-[11px] text-slate-500 hover:underline cursor-pointer"
                    >
                      Reset Example Points
                    </button>
                  </div>

                  {/* Observations list */}
                  <div class="space-y-1.5 max-h-48 overflow-y-auto">
                    {(s.observations || DEFAULT_OBSERVATIONS).map((obs, idx) => (
                      <div key={idx} class="flex items-center gap-2 p-1.5 rounded-lg bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 text-xs">
                        <span class="font-mono text-slate-400 w-5 text-center">#{idx + 1}</span>
                        <div class="flex-1 flex items-center gap-1">
                          <span class="text-slate-500 text-[11px]">t:</span>
                          <span class="font-mono font-semibold text-slate-800 dark:text-slate-200">{obs.timeHours} h</span>
                        </div>
                        <div class="flex-2 flex items-center gap-1">
                          <span class="text-slate-500 text-[11px]">Count:</span>
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
                        <label class="block text-[10px] text-slate-500 mb-0.5">Elapsed Time (h):</label>
                        <input
                          type="number"
                          min="0"
                          step="any"
                          value={newObsTime}
                          onInput={e => setNewObsTime((e.target as HTMLInputElement).value)}
                          class="w-full text-xs p-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono"
                        />
                      </div>
                      <div>
                        <label class="block text-[10px] text-slate-500 mb-0.5">Cell Count:</label>
                        <DecimalInput
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
                    <DecimalInput
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
                <DecimalInput
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
                <DecimalInput
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
                <input
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
      }
      results={
        <div class="space-y-4">
          {/* RESULTS FOR TAB 1: PASSAGING */}
          {s.activeTab === 'passaging' && (
            'error' in seedingResult ? (
              <p role="alert" class="text-sm text-red-600">{seedingResult.error}</p>
            ) : (
              <>
                <div class="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <div class="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 shadow-xs">
                    <span class="text-xs text-slate-500 block font-semibold uppercase tracking-wider">Suspension per Vessel</span>
                    <span data-testid="suspension-vol" class="font-mono text-2xl font-bold text-slate-900 dark:text-slate-100">
                      {seedingResult.volumePerVesselMl >= 1
                        ? `${seedingResult.volumePerVesselMl.toFixed(2)} mL`
                        : `${(seedingResult.volumePerVesselMl * 1000).toFixed(0)} µL`}
                    </span>
                    <span class="text-[11px] text-slate-400 block">cell suspension</span>
                  </div>

                  <div class="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 shadow-xs">
                    <span class="text-xs text-slate-500 block font-semibold uppercase tracking-wider">Media Top-Up</span>
                    <span class="font-mono text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                      {Math.max(0, selectedVessel.typicalVolumeMl - seedingResult.volumePerVesselMl).toFixed(2)} mL
                    </span>
                    <span class="text-[11px] text-slate-400 block">fresh media per vessel</span>
                  </div>

                  <div class="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 shadow-xs">
                    <span class="text-xs text-slate-500 block font-semibold uppercase tracking-wider">Cells per Vessel</span>
                    <span class="font-mono text-2xl font-bold text-accent-600 dark:text-accent-400">
                      {seedingResult.cellsPerVessel.toLocaleString()}
                    </span>
                    <span class="text-[11px] text-slate-400 block">total seeded</span>
                  </div>
                </div>

                <div class="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 space-y-2 text-xs shadow-xs">
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
          )}

          {/* RESULTS FOR TAB 2: DOUBLING TIME */}
          {s.activeTab === 'doubling' && (
            s.doublingMode === 'interval' ? (
              'error' in doublingResult ? (
                <p role="alert" class="text-sm text-red-600">{doublingResult.error}</p>
              ) : (
                <>
                  <div class="grid grid-cols-3 gap-3">
                    <div class="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 shadow-xs">
                      <span class="text-xs text-slate-500 block font-semibold uppercase tracking-wider">Doubling Time (Td)</span>
                      <span data-testid="doubling-time" class="font-mono text-2xl font-bold text-slate-900 dark:text-slate-100">
                        {doublingResult.doublingTimeHours.toFixed(1)} h
                      </span>
                      <span class="text-[11px] text-slate-400 block">{(doublingResult.doublingTimeHours / 24).toFixed(2)} days</span>
                    </div>

                    <div class="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 shadow-xs">
                      <span class="text-xs text-slate-500 block font-semibold uppercase tracking-wider">Growth Rate (µ)</span>
                      <span class="font-mono text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                        {doublingResult.growthRatePerHour.toFixed(3)}
                      </span>
                      <span class="text-[11px] text-slate-400 block">per hour</span>
                    </div>

                    <div class="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 shadow-xs">
                      <span class="text-xs text-slate-500 block font-semibold uppercase tracking-wider">Population Doublings</span>
                      <span class="font-mono text-2xl font-bold text-accent-600 dark:text-accent-400">
                        {doublingResult.populationDoublings.toFixed(2)}
                      </span>
                      <span class="text-[11px] text-slate-400 block">generations</span>
                    </div>
                  </div>

                  {selectedCellLine && (
                    <div class="rounded-2xl border border-indigo-200 bg-indigo-50/50 p-4 dark:border-indigo-900/40 dark:bg-indigo-950/20 text-xs space-y-1.5">
                      <div class="flex items-center justify-between font-semibold text-indigo-900 dark:text-indigo-200">
                        <span>{selectedCellLine.name} Literature Benchmark Comparison</span>
                        <span>Literature Td: {selectedCellLine.doublingTimeHours} h</span>
                      </div>
                      <p class="text-slate-600 dark:text-slate-400">
                        Observed doubling time is <strong class="text-slate-900 dark:text-slate-100">{doublingResult.doublingTimeHours.toFixed(1)} h</strong> (
                        {((doublingResult.doublingTimeHours / selectedCellLine.doublingTimeHours) * 100).toFixed(0)}% of typical {selectedCellLine.name} rate).
                        {Math.abs(doublingResult.doublingTimeHours - selectedCellLine.doublingTimeHours) <= 3
                          ? ' Consistent with standard healthy exponential growth.'
                          : doublingResult.doublingTimeHours > selectedCellLine.doublingTimeHours
                          ? ' Proliferation is slower than standard. Check confluence, serum batch, or viability.'
                          : ' Proliferation is faster than standard.'}
                      </p>
                    </div>
                  )}
                </>
              )
            ) : (
              'error' in multiPointResult ? (
                <p role="alert" class="text-sm text-red-600">{multiPointResult.error}</p>
              ) : (
                <>
                  <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div class="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 shadow-xs text-center">
                      <span class="text-xs text-slate-500 block font-semibold uppercase tracking-wider">Fitted Td</span>
                      <span data-testid="multipoint-td" class="font-mono text-2xl font-bold text-accent-600 dark:text-accent-400">
                        {multiPointResult.fit.doublingTimeHours.toFixed(1)} h
                      </span>
                      <span class="text-[11px] text-slate-400 block">{(multiPointResult.fit.doublingTimeHours / 24).toFixed(2)} days</span>
                    </div>

                    <div class="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 shadow-xs text-center">
                      <span class="text-xs text-slate-500 block font-semibold uppercase tracking-wider">Goodness of Fit</span>
                      <span class="font-mono text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                        {multiPointResult.fit.rSquared.toFixed(4)}
                      </span>
                      <span class="text-[11px] text-slate-400 block">R² coefficient</span>
                    </div>

                    <div class="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 shadow-xs text-center">
                      <span class="text-xs text-slate-500 block font-semibold uppercase tracking-wider">Growth Rate (µ)</span>
                      <span class="font-mono text-2xl font-bold text-slate-900 dark:text-slate-100">
                        {multiPointResult.fit.growthRatePerHour.toFixed(4)}
                      </span>
                      <span class="text-[11px] text-slate-400 block">h⁻¹</span>
                    </div>

                    <div class="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 shadow-xs text-center">
                      <span class="text-xs text-slate-500 block font-semibold uppercase tracking-wider">Fitted N₀</span>
                      <span class="font-mono text-2xl font-bold text-indigo-600 dark:text-indigo-400">
                        {Math.round(multiPointResult.fit.initialCountEstimate).toLocaleString()}
                      </span>
                      <span class="text-[11px] text-slate-400 block">estimated initial</span>
                    </div>
                  </div>

                  {/* Target prediction card */}
                  <div class="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-4 dark:border-emerald-900/40 dark:bg-emerald-950/20 space-y-2">
                    <div class="flex items-center justify-between">
                      <span class="text-xs font-bold uppercase tracking-wider text-emerald-900 dark:text-emerald-200">
                        Target Availability Forecast
                      </span>
                      <span class="text-xs font-mono font-bold text-emerald-700 dark:text-emerald-300">
                        Target: {s.obsTargetCount.toLocaleString()} cells
                      </span>
                    </div>
                    <div class="grid grid-cols-2 gap-3 pt-1">
                      <div class="bg-white dark:bg-slate-900 p-3 rounded-xl border border-emerald-100 dark:border-emerald-800">
                        <span class="text-[11px] text-slate-500 block">Total time from t=0:</span>
                        <span class="font-mono text-xl font-bold text-slate-900 dark:text-slate-100">
                          {multiPointResult.targetPred.totalHoursFromZero.toFixed(1)} h
                        </span>
                        <span class="text-[10px] text-slate-400 block">({(multiPointResult.targetPred.totalHoursFromZero / 24).toFixed(1)} days)</span>
                      </div>
                      <div class="bg-white dark:bg-slate-900 p-3 rounded-xl border border-emerald-100 dark:border-emerald-800">
                        <span class="text-[11px] text-slate-500 block">Remaining from last count:</span>
                        <span class="font-mono text-xl font-bold text-emerald-600 dark:text-emerald-400">
                          {multiPointResult.targetPred.hoursFromLastObs.toFixed(1)} h
                        </span>
                        <span class="text-[10px] text-slate-400 block">({(multiPointResult.targetPred.hoursFromLastObs / 24).toFixed(1)} days)</span>
                      </div>
                    </div>
                  </div>

                  {/* Regression fit table */}
                  <div class="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 space-y-2">
                    <span class="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 block">
                      Observation Residuals &amp; Exponential Fit
                    </span>
                    <div class="overflow-x-auto">
                      <table class="w-full text-xs">
                        <thead>
                          <tr class="border-b border-slate-200 dark:border-slate-800 text-slate-400 text-left">
                            <th class="py-1 px-2">Point</th>
                            <th class="py-1 px-2">Elapsed Time</th>
                            <th class="py-1 px-2">Observed Cells</th>
                            <th class="py-1 px-2">Fitted Cells</th>
                            <th class="py-1 px-2">Deviation</th>
                          </tr>
                        </thead>
                        <tbody class="divide-y divide-slate-100 dark:divide-slate-800 font-mono">
                          {multiPointResult.fit.predictions.map((p, idx) => (
                            <tr key={idx} class="text-slate-700 dark:text-slate-300">
                              <td class="py-1.5 px-2 text-slate-400">#{idx + 1}</td>
                              <td class="py-1.5 px-2">{p.timeHours} h</td>
                              <td class="py-1.5 px-2 font-bold">{p.observedCount.toLocaleString()}</td>
                              <td class="py-1.5 px-2 text-slate-500">{Math.round(p.fittedCount).toLocaleString()}</td>
                              <td class="py-1.5 px-2">
                                <span class={Math.abs(p.residual / p.observedCount) < 0.1 ? 'text-emerald-600' : 'text-amber-600'}>
                                  {p.residual >= 0 ? '+' : ''}{Math.round(p.residual).toLocaleString()} ({((p.residual / p.observedCount) * 100).toFixed(1)}%)
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              )
            )
          )}

          {/* RESULTS FOR TAB 3: HARVEST PREDICTOR */}
          {s.activeTab === 'harvest' && (
            'error' in harvestResult ? (
              <p role="alert" class="text-sm text-red-600">{harvestResult.error}</p>
            ) : (
              <>
                <div class="rounded-2xl border-2 border-accent-500/40 bg-accent-50/40 dark:bg-accent-950/20 p-5 space-y-3 shadow-xs">
                  <span class="text-xs font-bold uppercase tracking-wider text-accent-800 dark:text-accent-300 block">
                    Estimated Cells Ready Time
                  </span>
                  <div class="flex flex-wrap items-baseline gap-3">
                    <span data-testid="target-ready-datetime" class="font-mono text-3xl font-extrabold text-slate-900 dark:text-white">
                      {harvestResult.targetDateFormatted}
                    </span>
                    <span class="text-sm font-semibold text-accent-700 dark:text-accent-300">
                      in {harvestResult.daysAndHoursText}
                    </span>
                  </div>
                  <div class="text-xs text-slate-600 dark:text-slate-400 pt-1">
                    Based on <strong>{harvestResult.doublingsRequired.toFixed(2)} doublings</strong> from {s.harvestStartCount.toLocaleString()} to {s.harvestTargetCount.toLocaleString()} cells (Td = {s.harvestDoublingHours} h).
                  </div>
                </div>

                <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div class="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 text-center shadow-xs">
                    <span class="text-xs text-slate-500 block font-semibold uppercase tracking-wider">Required Doublings</span>
                    <span class="font-mono text-2xl font-bold text-slate-900 dark:text-slate-100">
                      {harvestResult.doublingsRequired.toFixed(2)}
                    </span>
                    <span class="text-[11px] text-slate-400 block">generations</span>
                  </div>

                  <div class="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 text-center shadow-xs">
                    <span class="text-xs text-slate-500 block font-semibold uppercase tracking-wider">Total Incubation</span>
                    <span class="font-mono text-2xl font-bold text-indigo-600 dark:text-indigo-400">
                      {harvestResult.hoursRequired.toFixed(1)} h
                    </span>
                    <span class="text-[11px] text-slate-400 block">{(harvestResult.hoursRequired / 24).toFixed(2)} days</span>
                  </div>

                  <div class="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 text-center shadow-xs">
                    <span class="text-xs text-slate-500 block font-semibold uppercase tracking-wider">Fold Expansion</span>
                    <span class="font-mono text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                      {(s.harvestTargetCount / s.harvestStartCount).toFixed(1)}×
                    </span>
                    <span class="text-[11px] text-slate-400 block">biomass increase</span>
                  </div>
                </div>

                {/* Biological Tolerance Window */}
                <div class="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 space-y-2 shadow-xs">
                  <div class="flex items-center justify-between">
                    <span class="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                      Biological Variation Tolerance Window (±10% Td)
                    </span>
                    <span class="text-[11px] text-slate-400">Earliest to Latest Window</span>
                  </div>
                  <div class="grid grid-cols-2 gap-3 text-xs pt-1">
                    <div class="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/40">
                      <span class="text-[11px] text-emerald-700 dark:text-emerald-400 block font-semibold">Earliest Availability (−10% Td):</span>
                      <span class="font-mono text-sm font-bold text-emerald-950 dark:text-emerald-200">
                        {harvestResult.windowEarlyFormatted}
                      </span>
                      <span class="text-[10px] text-emerald-600/80 dark:text-emerald-400/80 block mt-0.5">
                        after {harvestResult.windowEarlyHours.toFixed(1)} h
                      </span>
                    </div>

                    <div class="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/40">
                      <span class="text-[11px] text-amber-700 dark:text-amber-400 block font-semibold">Latest Availability (+10% Td):</span>
                      <span class="font-mono text-sm font-bold text-amber-950 dark:text-amber-200">
                        {harvestResult.windowLateFormatted}
                      </span>
                      <span class="text-[10px] text-amber-600/80 dark:text-amber-400/80 block mt-0.5">
                        after {harvestResult.windowLateHours.toFixed(1)} h
                      </span>
                    </div>
                  </div>
                  <p class="text-[11px] text-slate-500 dark:text-slate-400 pt-1">
                    Accounts for lag-phase variations, passaging stress, and standard biological cell cycle fluctuation.
                  </p>
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
