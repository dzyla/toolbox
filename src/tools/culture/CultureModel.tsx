import { useUrlState } from '@/lib/url-state';
import { useMemo, useState } from 'preact/hooks';
import { CELL_LINE_PRESETS, CULTURE_VESSELS, calculateDoublingTime, calculateHarvestTime, calculateSeeding, fitGrowthObservations, type CellLinePreset, type CultureVessel, type GrowthObservation } from '@/core/cells/culture';
import { scienceText } from '@/app/components/SciencePanel';
import { SCIENCE } from './science';

export interface State {
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
export const DEFAULT_OBSERVATIONS: GrowthObservation[] = [
  { timeHours: 0, count: 100_000 },
  { timeHours: 24, count: 210_000 },
  { timeHours: 48, count: 430_000 },
  { timeHours: 72, count: 880_000 },
];
export const getNowDateTimeString = () => {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
};
export const DEFAULTS: State = {
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
export function ExponentPills({
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
      <span class="text-[10px] uppercase font-bold tracking-wider text-slate-500 dark:text-slate-400 select-none">{label}</span>
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

export function useCultureModel() {
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

  return {
    stateSig,
    shareUrl,
    s,
    set,
    newObsTime,
    setNewObsTime,
    newObsCount,
    setNewObsCount,
    selectedVessel,
    selectedCellLine,
    handleSelectCellLine,
    seedingResult,
    doublingResult,
    multiPointResult,
    harvestResult,
    handleAddObservation,
    handleRemoveObservation,
    copyText,
  };
}

export type CultureModel = ReturnType<typeof useCultureModel>;
