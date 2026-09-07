import { useMemo } from 'preact/hooks';
import { useUrlState } from '@/lib/url-state';
import { ToolLayout } from '@/app/components/ToolLayout';
import { ActionBar } from '@/app/components/ActionBar';
import { Quantity, type QValue } from '@/app/components/Quantity';
import { SciencePanel, scienceText } from '@/app/components/SciencePanel';
import { DecimalInput } from '@/app/components/DecimalInput';
import { SCIENCE } from './science';
import {
  DETERGENT_DATABASE,
  DETERGENT_LIST,
  type ConcentrationUnit,
  type DetergentInfo,
  assessDialyzability,
  calculateComplexMw,
  calculateDetergentProteinRatio,
  calculateMicelles,
  calculateStockDilution,
  convertConcentration,
  mmToPercent,
  partitionDetergent,
} from '@/core/detergents';

interface State {
  detergentId: string;
  // Custom detergent properties
  customName: string;
  customMw: number;
  customCmcMm: number;
  customNagg: number;
  customMicelleMwKDa: number;
  // Total detergent concentration and sample volume
  totalConc: QValue;
  sampleVolume: QValue;
  // Target membrane protein parameters
  includeProtein: boolean;
  proteinMw: QValue;
  stoichiometry: number;
  proteinConc: QValue;
  // Working buffer preparation / stock dilution
  stockConc: QValue;
  bufferVolume: QValue;
  targetMode: 'match_sample' | 'cmc_mult' | 'manual';
  targetCmcMultiplier: number;
  manualTargetConc: QValue;
}

const DEFAULTS: State = {
  detergentId: 'ddm',
  customName: 'Custom Detergent',
  customMw: 500,
  customCmcMm: 1.0,
  customNagg: 100,
  customMicelleMwKDa: 50,
  totalConc: { value: 0.03, unit: '%' }, // ~0.59 mM DDM, ~3.5x CMC
  sampleVolume: { value: 1.0, unit: 'mL' },
  includeProtein: true,
  proteinMw: { value: 45, unit: 'kDa' },
  stoichiometry: 1,
  proteinConc: { value: 2.0, unit: 'mg/mL' },
  stockConc: { value: 10, unit: '%' },
  bufferVolume: { value: 50, unit: 'mL' },
  targetMode: 'match_sample',
  targetCmcMultiplier: 2.0,
  manualTargetConc: { value: 0.03, unit: '%' },
};

const FIELD = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900 text-xs font-semibold';

export default function DetergentView() {
  const [stateSig, shareUrl] = useUrlState<State>('detergent', DEFAULTS);
  const s = stateSig.value;
  const set = (patch: Partial<State>) => {
    stateSig.value = { ...stateSig.value, ...patch };
  };

  // Resolve active detergent parameters
  const activeDet: DetergentInfo = useMemo(() => {
    if (s.detergentId !== 'custom' && s.detergentId in DETERGENT_DATABASE) {
      return DETERGENT_DATABASE[s.detergentId as keyof typeof DETERGENT_DATABASE];
    }
    const mw = Math.max(1, s.customMw || 500);
    const cmcMm = Math.max(1e-5, s.customCmcMm || 1.0);
    const nagg = Math.max(1, Math.round(s.customNagg || 100));
    const micelleMw = Math.max(0.1, s.customMicelleMwKDa || (nagg * mw) / 1000);
    const dial = assessDialyzability(cmcMm);
    return {
      id: 'custom',
      name: s.customName || 'Custom',
      fullName: s.customName || 'Custom Detergent',
      category: 'non-ionic',
      molecularWeight: mw,
      cmcMm,
      cmcPct: mmToPercent(cmcMm, mw),
      aggregationNumber: nagg,
      micelleMwKDa: micelleMw,
      dialyzability: dial.rating,
      recommendedWorkingMultiplier: [1.5, 3.0],
      description: 'User-specified detergent with custom chemical and micellar parameters.',
    };
  }, [
    s.detergentId,
    s.customName,
    s.customMw,
    s.customCmcMm,
    s.customNagg,
    s.customMicelleMwKDa,
  ]);

  // Handle total concentration in mM
  const totalConcMm = useMemo(() => {
    const val = Math.max(0, s.totalConc.value || 0);
    const unit = (s.totalConc.unit || '%') as ConcentrationUnit;
    return convertConcentration(val, unit, 'mM', activeDet.molecularWeight);
  }, [s.totalConc, activeDet.molecularWeight]);

  // Handle sample volume in mL
  const sampleVolumeMl = useMemo(() => {
    const val = Math.max(0, s.sampleVolume.value || 0);
    const u = s.sampleVolume.unit || 'mL';
    if (u === 'µL') return val / 1000;
    if (u === 'L') return val * 1000;
    return val;
  }, [s.sampleVolume]);

  // Handle protein MW in kDa
  const proteinMwKDa = useMemo(() => {
    const val = Math.max(0.1, s.proteinMw.value || 0);
    const u = s.proteinMw.unit || 'kDa';
    return u === 'Da' ? val / 1000 : val;
  }, [s.proteinMw]);

  // Handle protein concentration in mg/mL
  const proteinConcMgMl = useMemo(() => {
    const val = Math.max(0, s.proteinConc.value || 0);
    const u = s.proteinConc.unit || 'mg/mL';
    if (u === 'g/L') return val;
    if (u === 'µM') {
      // (µM * MW_kDa) / 1000 = mg/mL
      return (val * proteinMwKDa) / 1000;
    }
    return val;
  }, [s.proteinConc, proteinMwKDa]);

  // Calculations
  const partition = useMemo(() => {
    return partitionDetergent(totalConcMm, activeDet.cmcMm, activeDet.molecularWeight);
  }, [totalConcMm, activeDet.cmcMm, activeDet.molecularWeight]);

  const micelles = useMemo(() => {
    return calculateMicelles(
      partition.micellarConcMm,
      partition.freeConcMm,
      activeDet.aggregationNumber,
      sampleVolumeMl
    );
  }, [
    partition.micellarConcMm,
    partition.freeConcMm,
    activeDet.aggregationNumber,
    sampleVolumeMl,
  ]);

  const complex = useMemo(() => {
    return calculateComplexMw(proteinMwKDa, activeDet.micelleMwKDa, s.stoichiometry);
  }, [proteinMwKDa, activeDet.micelleMwKDa, s.stoichiometry]);

  const dialyzability = useMemo(() => {
    return assessDialyzability(activeDet.cmcMm);
  }, [activeDet.cmcMm]);

  const proteinRatio = useMemo(() => {
    return calculateDetergentProteinRatio(
      proteinMwKDa,
      proteinConcMgMl,
      totalConcMm,
      partition.micellarConcMm,
      activeDet.aggregationNumber
    );
  }, [
    proteinMwKDa,
    proteinConcMgMl,
    totalConcMm,
    partition.micellarConcMm,
    activeDet.aggregationNumber,
  ]);

  // Buffer preparation calculations
  const targetBufferVolMl = useMemo(() => {
    const val = Math.max(0.01, s.bufferVolume.value || 0);
    const u = s.bufferVolume.unit || 'mL';
    if (u === 'µL') return val / 1000;
    if (u === 'L') return val * 1000;
    return val;
  }, [s.bufferVolume]);

  const dilution = useMemo(() => {
    try {
      let targetVal = s.totalConc.value;
      let targetUnit = s.totalConc.unit as ConcentrationUnit;

      if (s.targetMode === 'cmc_mult') {
        const mult = Math.max(0.01, s.targetCmcMultiplier || 2.0);
        targetVal = mult * activeDet.cmcMm;
        targetUnit = 'mM';
      } else if (s.targetMode === 'manual') {
        targetVal = s.manualTargetConc.value;
        targetUnit = s.manualTargetConc.unit as ConcentrationUnit;
      }

      return calculateStockDilution(
        s.stockConc.value,
        s.stockConc.unit as ConcentrationUnit,
        targetVal,
        targetUnit,
        targetBufferVolMl,
        activeDet.molecularWeight,
        activeDet.cmcMm
      );
    } catch {
      return null;
    }
  }, [
    s.stockConc,
    s.targetMode,
    s.totalConc,
    s.targetCmcMultiplier,
    s.manualTargetConc,
    targetBufferVolMl,
    activeDet.molecularWeight,
    activeDet.cmcMm,
  ]);

  // Quick preset helper to set total concentration to a multiple of CMC
  const setCmcMultiplier = (mult: number) => {
    const targetMm = mult * activeDet.cmcMm;
    const currentUnit = s.totalConc.unit as ConcentrationUnit;
    const converted = convertConcentration(targetMm, 'mM', currentUnit, activeDet.molecularWeight);
    const rounded = Number(converted.toPrecision(4));
    set({ totalConc: { value: rounded, unit: currentUnit } });
  };

  // Copy result summary
  const copySummary = () => {
    const lines = [
      `Detergent & Membrane Protein Analysis:`,
      `Detergent: ${activeDet.name} (${activeDet.fullName})`,
      `  MW: ${activeDet.molecularWeight} g/mol | CMC: ${activeDet.cmcMm} mM (${activeDet.cmcPct}% w/v) | Nagg: ${activeDet.aggregationNumber} | Micelle MW: ${activeDet.micelleMwKDa} kDa`,
      `  Total Concentration: ${totalConcMm.toFixed(3)} mM (${partition.totalConcPct.toFixed(4)}% w/v, ${partition.totalConcMgMl.toFixed(3)} mg/mL) [${partition.cmcRatio.toFixed(1)}× CMC]`,
      `  Partitioning: Free Monomer = ${partition.freeConcMm.toFixed(3)} mM | Micellar = ${partition.micellarConcMm.toFixed(3)} mM (${(partition.micellarFraction * 100).toFixed(1)}%)`,
      `  Sample Volume: ${sampleVolumeMl} mL | Total Micelles: ${micelles.micelleCount.toExponential(2)} particles (${micelles.micelleConcUm.toFixed(2)} µM)`,
      `  Dialyzability: ${dialyzability.label} (${dialyzability.score}/100) — ${dialyzability.monomerDiffusibility}`,
    ];

    if (s.includeProtein) {
      lines.push(
        `Target Protein: ${s.proteinMw.value} ${s.proteinMw.unit} × ${s.stoichiometry} = ${complex.proteinTotalMwKDa} kDa`
      );
      lines.push(
        `Protein-Detergent Complex (PDC) MW: ${complex.complexMwKDa.toFixed(1)} kDa (Protein: ${(complex.proteinMassFraction * 100).toFixed(1)}%, Micelle: ${(complex.detergentMassFraction * 100).toFixed(1)}%)`
      );
      lines.push(`Stokes Radius Rh: ~${complex.estimatedStokesRadiusNm.toFixed(2)} nm`);
      lines.push(
        `Micelle:Protein Stoichiometry: ${proteinRatio.micellesPerProtein.toFixed(2)} micelles/protein (${proteinRatio.status})`
      );
    }

    if (dilution) {
      lines.push(
        `Working Buffer Recipe: ${dilution.stockVolumeUl >= 1000 ? `${dilution.stockVolumeMl.toFixed(3)} mL` : `${dilution.stockVolumeUl.toFixed(1)} µL`} of ${s.stockConc.value}${s.stockConc.unit} stock + ${dilution.bufferVolumeMl.toFixed(2)} mL buffer -> ${dilution.finalCmcMultiplier.toFixed(1)}× CMC`
      );
    }

    return `${lines.join('\n')}\n\n${scienceText(SCIENCE)}`;
  };

  return (
    <ToolLayout
      icon="🫧"
      title="Detergent & Membrane Protein Calculator"
      blurb="Model critical micelle concentration (CMC) partitioning, free vs micellar detergent fractions, absolute micelle count, protein-detergent complex (PDC) MW, SEC sizing, and dialyzability."
      wide={true}
      mobileResultSummary={
        <span>
          PDC:{' '}
          <strong class="font-mono text-accent-700 dark:text-accent-300">
            {complex.complexMwKDa.toFixed(1)} kDa
          </strong>
          {' • '}
          <span
            class={
              partition.isAboveCmc
                ? 'font-semibold text-emerald-600 dark:text-emerald-400'
                : 'font-semibold text-amber-600 dark:text-amber-400'
            }
          >
            {partition.cmcRatio.toFixed(1)}× CMC
          </span>
          {' • '}
          <span class="font-mono">{partition.micellarConcMm.toFixed(2)} mM micellar</span>
        </span>
      }
      inputs={
        <div class="space-y-4">
          {/* Detergent Selector Card */}
          <div class="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 shadow-sm">
            <div class="flex items-center justify-between">
              <label class="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                Detergent Selection
              </label>
              <span class="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                {activeDet.category}
              </span>
            </div>

            <select
              id="detergent-select"
              aria-label="Select Detergent"
              value={s.detergentId}
              onChange={(e) => set({ detergentId: (e.target as HTMLSelectElement).value })}
              class={FIELD}
            >
              {DETERGENT_LIST.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} — {d.fullName} (CMC {d.cmcMm} mM / {d.cmcPct}%)
                </option>
              ))}
              <option value="custom">Custom Detergent (User Defined)</option>
            </select>

            {/* Detergent Quick Badge & Literature Note */}
            <div class="rounded-xl border border-slate-200/80 bg-slate-50/70 p-2.5 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-950/40 dark:text-slate-300 space-y-1.5">
              <div class="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11px]">
                <span>
                  MW: <strong class="text-slate-900 dark:text-slate-100">{activeDet.molecularWeight}</strong> g/mol
                </span>
                <span>•</span>
                <span>
                  CMC: <strong class="text-accent-600 dark:text-accent-400">{activeDet.cmcMm} mM</strong> ({activeDet.cmcPct}%)
                </span>
                <span>•</span>
                <span>
                  N<sub>agg</sub>: <strong>{activeDet.aggregationNumber}</strong>
                </span>
                <span>•</span>
                <span>
                  Micelle: <strong>{activeDet.micelleMwKDa} kDa</strong>
                </span>
              </div>
              <p class="text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
                {activeDet.description}
              </p>
            </div>

            {/* Custom detergent inputs */}
            {s.detergentId === 'custom' && (
              <div class="space-y-2.5 rounded-xl border border-dashed border-accent-300 bg-accent-50/40 p-3 text-xs dark:border-accent-800 dark:bg-accent-950/20">
                <span class="font-semibold text-accent-800 dark:text-accent-300">Custom Detergent Parameters</span>
                <div class="grid grid-cols-2 gap-2">
                  <div>
                    <label class="block text-[11px] text-slate-500 mb-0.5">Detergent Name</label>
                    <input
                      type="text"
                      value={s.customName}
                      onInput={(e) => set({ customName: (e.target as HTMLInputElement).value })}
                      class="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 dark:border-slate-700 dark:bg-slate-900 text-xs font-semibold"
                    />
                  </div>
                  <div>
                    <label class="block text-[11px] text-slate-500 mb-0.5">Monomer MW (g/mol)</label>
                    <DecimalInput
                      class="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 dark:border-slate-700 dark:bg-slate-900 text-xs font-mono"
                      value={s.customMw}
                      onChange={(customMw) => set({ customMw })}
                      min={1}
                      step={10}
                    />
                  </div>
                  <div>
                    <label class="block text-[11px] text-slate-500 mb-0.5">CMC (mM)</label>
                    <DecimalInput
                      class="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 dark:border-slate-700 dark:bg-slate-900 text-xs font-mono"
                      value={s.customCmcMm}
                      onChange={(customCmcMm) => set({ customCmcMm })}
                      min={0.0001}
                      step={0.1}
                    />
                  </div>
                  <div>
                    <label class="block text-[11px] text-slate-500 mb-0.5">Aggregation Number (Nagg)</label>
                    <DecimalInput
                      class="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 dark:border-slate-700 dark:bg-slate-900 text-xs font-mono"
                      value={s.customNagg}
                      onChange={(customNagg) => set({ customNagg })}
                      min={1}
                      step={5}
                    />
                  </div>
                  <div class="col-span-2">
                    <label class="block text-[11px] text-slate-500 mb-0.5">Micelle MW (kDa)</label>
                    <DecimalInput
                      class="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 dark:border-slate-700 dark:bg-slate-900 text-xs font-mono"
                      value={s.customMicelleMwKDa}
                      onChange={(customMicelleMwKDa) => set({ customMicelleMwKDa })}
                      min={0.1}
                      step={1}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Sample Concentration & Volume */}
          <div class="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 shadow-sm">
            <label class="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300">
              Detergent Sample Parameters
            </label>

            <Quantity
              id="total-detergent-conc"
              label="Total Detergent Concentration"
              value={s.totalConc}
              units={['%', 'mM', 'mg/mL']}
              onChange={(totalConc) => set({ totalConc })}
              hint={`1× CMC = ${activeDet.cmcMm} mM (${activeDet.cmcPct}% w/v)`}
            />

            {/* Quick CMC Multiplier Presets */}
            <div class="space-y-1">
              <span class="block text-[11px] font-medium text-slate-500 dark:text-slate-400">
                Quick Jump to CMC Multiples:
              </span>
              <div class="flex flex-wrap gap-1.5">
                {[1, 1.5, 2, 3, 5, 10].map((mult) => (
                  <button
                    key={mult}
                    type="button"
                    onClick={() => setCmcMultiplier(mult)}
                    class="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-accent-50 hover:text-accent-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-accent-950/50 dark:hover:text-accent-300 transition"
                  >
                    {mult}× CMC
                  </button>
                ))}
              </div>
            </div>

            <Quantity
              id="sample-volume"
              label="Sample Solution Volume"
              value={s.sampleVolume}
              units={['mL', 'µL', 'L']}
              onChange={(sampleVolume) => set({ sampleVolume })}
            />
          </div>

          {/* Target Membrane Protein Section */}
          <div class="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 shadow-sm">
            <div class="flex items-center justify-between">
              <label class="text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                Target Membrane Protein
              </label>
              <label class="inline-flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400 cursor-pointer">
                <input
                  type="checkbox"
                  checked={s.includeProtein}
                  onChange={(e) => set({ includeProtein: (e.target as HTMLInputElement).checked })}
                  class="rounded border-slate-300 text-accent-600 focus:ring-accent-500"
                />
                <span>Include Protein</span>
              </label>
            </div>

            {s.includeProtein && (
              <div class="space-y-3 pt-1">
                <Quantity
                  id="protein-mw"
                  label="Protein Monomer MW"
                  value={s.proteinMw}
                  units={['kDa', 'Da']}
                  onChange={(proteinMw) => set({ proteinMw })}
                />

                <div class="grid grid-cols-2 gap-3">
                  <div>
                    <label class="block text-xs text-slate-500 mb-1">Subunit Stoichiometry</label>
                    <select
                      id="stoichiometry-select"
                      aria-label="Subunit Stoichiometry"
                      value={s.stoichiometry}
                      onChange={(e) => set({ stoichiometry: parseInt((e.target as HTMLSelectElement).value, 10) || 1 })}
                      class={FIELD}
                    >
                      <option value="1">1 (Monomer)</option>
                      <option value="2">2 (Homodimer)</option>
                      <option value="3">3 (Trimer)</option>
                      <option value="4">4 (Tetramer)</option>
                      <option value="5">5 (Pentamer)</option>
                      <option value="6">6 (Hexamer)</option>
                      <option value="8">8 (Octamer)</option>
                    </select>
                  </div>
                  <div>
                    <Quantity
                      id="protein-conc"
                      label="Protein Concentration"
                      value={s.proteinConc}
                      units={['mg/mL', 'µM', 'g/L']}
                      onChange={(proteinConc) => set({ proteinConc })}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Working Buffer Preparation Calculator */}
          <div class="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 shadow-sm">
            <label class="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300">
              Working Buffer Preparation
            </label>

            <Quantity
              id="stock-conc"
              label="Stock Solution Concentration"
              value={s.stockConc}
              units={['%', 'mM', 'mg/mL']}
              onChange={(stockConc) => set({ stockConc })}
              hint="Typical detergent stocks are prepared at 10% (w/v) or 100 mM"
            />

            <Quantity
              id="buffer-volume"
              label="Target Buffer Volume to Prepare"
              value={s.bufferVolume}
              units={['mL', 'L', 'µL']}
              onChange={(bufferVolume) => set({ bufferVolume })}
            />

            <div>
              <label class="block text-xs text-slate-500 mb-1">Target Buffer Detergent Level</label>
              <div class="grid grid-cols-3 gap-1 rounded-lg border border-slate-200 p-0.5 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs">
                <button
                  type="button"
                  onClick={() => set({ targetMode: 'match_sample' })}
                  class={`py-1 font-semibold rounded-md transition ${s.targetMode === 'match_sample' ? 'bg-accent-600 text-white shadow-xs' : 'text-slate-600 dark:text-slate-400'}`}
                >
                  Match Sample
                </button>
                <button
                  type="button"
                  onClick={() => set({ targetMode: 'cmc_mult' })}
                  class={`py-1 font-semibold rounded-md transition ${s.targetMode === 'cmc_mult' ? 'bg-accent-600 text-white shadow-xs' : 'text-slate-600 dark:text-slate-400'}`}
                >
                  Multiple of CMC
                </button>
                <button
                  type="button"
                  onClick={() => set({ targetMode: 'manual' })}
                  class={`py-1 font-semibold rounded-md transition ${s.targetMode === 'manual' ? 'bg-accent-600 text-white shadow-xs' : 'text-slate-600 dark:text-slate-400'}`}
                >
                  Custom Conc
                </button>
              </div>
            </div>

            {s.targetMode === 'cmc_mult' && (
              <div>
                <label class="block text-xs text-slate-500 mb-1">CMC Multiplier (e.g. 2× CMC)</label>
                <DecimalInput
                  class="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900 text-xs font-mono"
                  value={s.targetCmcMultiplier}
                  onChange={(targetCmcMultiplier) => set({ targetCmcMultiplier })}
                  min={0.1}
                  step={0.5}
                />
              </div>
            )}

            {s.targetMode === 'manual' && (
              <Quantity
                id="manual-target-conc"
                label="Target Buffer Concentration"
                value={s.manualTargetConc}
                units={['%', 'mM', 'mg/mL']}
                onChange={(manualTargetConc) => set({ manualTargetConc })}
              />
            )}
          </div>
        </div>
      }
      results={
        <div class="space-y-4">
          {/* Below CMC Warning Banner */}
          {!partition.isAboveCmc && (
            <div class="rounded-xl border border-amber-300 bg-amber-50 p-3.5 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
              ⚠️ <strong>Sub-CMC Alert:</strong> Detergent concentration ({totalConcMm.toFixed(3)} mM) is below the Critical Micelle Concentration ({activeDet.cmcMm} mM). No detergent micelles exist in solution; only free monomers are present. Membrane proteins will likely aggregate or precipitate!
            </div>
          )}

          {/* Primary Top Summary Cards Grid */}
          <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
            {/* Card 1: Micelle vs Free Partition */}
            <div class="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 shadow-sm flex flex-col justify-between">
              <div>
                <span class="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  CMC Phase Partition
                </span>
                <div class="mt-1 text-2xl font-black font-mono text-accent-600 dark:text-accent-400">
                  {partition.cmcRatio.toFixed(1)}×{' '}
                  <span class="text-sm font-semibold text-slate-500">CMC</span>
                </div>
                <div class="mt-1 text-xs text-slate-600 dark:text-slate-400">
                  Total: <strong class="font-mono text-slate-900 dark:text-slate-100">{totalConcMm.toFixed(2)} mM</strong> ({partition.totalConcPct.toFixed(3)}%)
                </div>
              </div>

              <div class="mt-3 space-y-1.5 pt-2 border-t border-slate-100 dark:border-slate-800">
                <div class="flex justify-between text-[11px]">
                  <span class="text-slate-500">Free Monomer:</span>
                  <span class="font-mono font-semibold">{partition.freeConcMm.toFixed(3)} mM</span>
                </div>
                <div class="flex justify-between text-[11px]">
                  <span class="text-slate-500">Micellar:</span>
                  <span class="font-mono font-semibold text-accent-600 dark:text-accent-400">
                    {partition.micellarConcMm.toFixed(3)} mM ({(partition.micellarFraction * 100).toFixed(0)}%)
                  </span>
                </div>
                {/* Visual fraction bar */}
                <div class="h-1.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700 flex">
                  <div
                    class="bg-slate-400 dark:bg-slate-500 h-full transition-all"
                    style={{ width: `${(1 - partition.micellarFraction) * 100}%` }}
                    title={`Free monomer: ${((1 - partition.micellarFraction) * 100).toFixed(1)}%`}
                  />
                  <div
                    class="bg-accent-600 h-full transition-all"
                    style={{ width: `${partition.micellarFraction * 100}%` }}
                    title={`Micellar detergent: ${(partition.micellarFraction * 100).toFixed(1)}%`}
                  />
                </div>
              </div>
            </div>

            {/* Card 2: Absolute Micelle Count */}
            <div class="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 shadow-sm flex flex-col justify-between">
              <div>
                <span class="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  Micelle Particle Count
                </span>
                <div class="mt-1 text-2xl font-black font-mono text-slate-900 dark:text-slate-100">
                  {micelles.micelleConcUm < 1000
                    ? `${micelles.micelleConcUm.toFixed(1)} µM`
                    : `${(micelles.micelleConcUm / 1000).toFixed(2)} mM`}
                </div>
                <div class="mt-1 text-xs text-slate-500">
                  In {sampleVolumeMl} mL solution
                </div>
              </div>

              <div class="mt-3 space-y-1 pt-2 border-t border-slate-100 dark:border-slate-800 text-[11px]">
                <div class="flex justify-between">
                  <span class="text-slate-500">Total Micelles:</span>
                  <span class="font-mono font-bold text-accent-600 dark:text-accent-400">
                    {micelles.micelleCount > 0 ? micelles.micelleCount.toExponential(2) : '0'}
                  </span>
                </div>
                <div class="flex justify-between">
                  <span class="text-slate-500">Monomers/Micelle:</span>
                  <span class="font-mono">{activeDet.aggregationNumber}</span>
                </div>
                <div class="flex justify-between">
                  <span class="text-slate-500">Free Monomers:</span>
                  <span class="font-mono">{micelles.freeMonomerCount.toExponential(2)}</span>
                </div>
              </div>
            </div>

            {/* Card 3: Complex MW (PDC) */}
            <div class="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 shadow-sm flex flex-col justify-between">
              <div>
                <span class="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  Complex MW (PDC)
                </span>
                <div class="mt-1 text-2xl font-black font-mono text-emerald-600 dark:text-emerald-400">
                  {complex.complexMwKDa.toFixed(1)}{' '}
                  <span class="text-sm font-semibold text-slate-500">kDa</span>
                </div>
                <div class="mt-1 text-xs text-slate-500">
                  Protein {complex.proteinTotalMwKDa} kDa + Micelle {complex.micelleMwKDa} kDa
                </div>
              </div>

              <div class="mt-3 space-y-1 pt-2 border-t border-slate-100 dark:border-slate-800 text-[11px]">
                <div class="flex justify-between">
                  <span class="text-slate-500">Protein Mass:</span>
                  <span class="font-mono">{(complex.proteinMassFraction * 100).toFixed(1)}%</span>
                </div>
                <div class="flex justify-between">
                  <span class="text-slate-500">Micelle Mass:</span>
                  <span class="font-mono">{(complex.detergentMassFraction * 100).toFixed(1)}%</span>
                </div>
                <div class="flex justify-between">
                  <span class="text-slate-500">Stokes Radius R<sub>h</sub>:</span>
                  <span class="font-mono font-semibold">~{complex.estimatedStokesRadiusNm.toFixed(2)} nm</span>
                </div>
              </div>
            </div>

            {/* Card 4: Dialyzability */}
            <div class="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 shadow-sm flex flex-col justify-between">
              <div>
                <span class="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  Dialyzability
                </span>
                <div class="mt-1 text-lg font-black">
                  <span
                    class={`inline-block px-2.5 py-1 rounded-full text-xs font-bold ${
                      dialyzability.rating === 'easily_dialyzed'
                        ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                        : dialyzability.rating === 'slowly_dialyzed'
                        ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                        : 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                    }`}
                  >
                    {dialyzability.label}
                  </span>
                </div>
                <div class="mt-1 text-xs text-slate-500">
                  Score: <strong class="font-mono">{dialyzability.score} / 100</strong>
                </div>
              </div>

              <div class="mt-3 pt-2 border-t border-slate-100 dark:border-slate-800 text-[11px] text-slate-500 leading-tight">
                {activeDet.cmcMm >= 2.0
                  ? 'Readily passes dialysis membrane pores (MWCO 3.5–14 kDa).'
                  : activeDet.cmcMm >= 0.5
                  ? 'Slow dialysis; multiple large buffer exchanges required.'
                  : 'Micelles retained; requires Bio-Beads SM-2 or cyclodextrin.'}
              </div>
            </div>
          </div>

          {/* Section: Protein Stoichiometry & Micellar Coverage */}
          {s.includeProtein && (
            <div class="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 shadow-sm space-y-3">
              <div class="flex items-center justify-between border-b border-slate-100 pb-2.5 dark:border-slate-800">
                <div>
                  <h3 class="text-sm font-bold text-slate-900 dark:text-slate-100">
                    Membrane Protein &amp; Micelle Stoichiometry
                  </h3>
                  <p class="text-xs text-slate-500">
                    Calculated from {s.proteinMw.value} {s.proteinMw.unit} ({s.stoichiometry > 1 ? `${s.stoichiometry}-mer` : 'monomer'}) at {s.proteinConc.value} {s.proteinConc.unit}
                  </p>
                </div>
                <span
                  class={`px-2.5 py-1 rounded-full text-xs font-bold ${
                    proteinRatio.status === 'optimal_monodisperse'
                      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                      : proteinRatio.status === 'insufficient_micelles'
                      ? 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                      : 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300'
                  }`}
                >
                  {proteinRatio.status === 'optimal_monodisperse'
                    ? '✓ Optimal Monodisperse'
                    : proteinRatio.status === 'insufficient_micelles'
                    ? '⚠️ Insufficient Micelles'
                    : 'ℹ️ High Micelle Excess'}
                </span>
              </div>

              <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div class="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
                  <span class="text-slate-400 block text-[11px]">Micelles per Protein</span>
                  <span class="text-lg font-bold font-mono text-accent-600 dark:text-accent-400">
                    {proteinRatio.micellesPerProtein.toFixed(2)}
                  </span>
                  <span class="text-[10px] text-slate-400 block">Target: 1.0–3.0</span>
                </div>
                <div class="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
                  <span class="text-slate-400 block text-[11px]">Detergent : Protein Molar Ratio</span>
                  <span class="text-lg font-bold font-mono text-slate-800 dark:text-slate-200">
                    {proteinRatio.detergentMolarRatio.toFixed(0)} : 1
                  </span>
                  <span class="text-[10px] text-slate-400 block">Total monomers vs protein</span>
                </div>
                <div class="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
                  <span class="text-slate-400 block text-[11px]">Protein Molarity</span>
                  <span class="text-lg font-bold font-mono text-slate-800 dark:text-slate-200">
                    {proteinRatio.proteinMolarConcUm.toFixed(1)} µM
                  </span>
                  <span class="text-[10px] text-slate-400 block">{proteinConcMgMl.toFixed(2)} mg/mL</span>
                </div>
                <div class="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
                  <span class="text-slate-400 block text-[11px]">Micelle Molarity</span>
                  <span class="text-lg font-bold font-mono text-slate-800 dark:text-slate-200">
                    {micelles.micelleConcUm.toFixed(1)} µM
                  </span>
                  <span class="text-[10px] text-slate-400 block">Agg. Number = {activeDet.aggregationNumber}</span>
                </div>
              </div>

              <div class="rounded-xl border border-slate-100 bg-slate-50/70 p-3 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-950/40 dark:text-slate-300">
                <p class="leading-relaxed">{proteinRatio.message}</p>
              </div>
            </div>
          )}

          {/* Section: SEC Column Selection & Cryo-EM Particle Sizing */}
          <div class="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 shadow-sm space-y-3">
            <div class="flex items-center justify-between border-b border-slate-100 pb-2.5 dark:border-slate-800">
              <div>
                <h3 class="text-sm font-bold text-slate-900 dark:text-slate-100">
                  Size Exclusion Chromatography (SEC) Sizing
                </h3>
                <p class="text-xs text-slate-500">
                  PDC behaves as a spherical particle of {complex.complexMwKDa.toFixed(1)} kDa (Stokes radius R<sub>h</sub> ≈ {complex.estimatedStokesRadiusNm.toFixed(2)} nm)
                </p>
              </div>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
              {complex.secColumns.map((col) => (
                <div
                  key={col.name}
                  class={`p-3.5 rounded-xl border transition ${
                    col.suitability === 'optimal'
                      ? 'border-emerald-300 bg-emerald-50/50 dark:border-emerald-800 dark:bg-emerald-950/30'
                      : col.suitability === 'acceptable'
                      ? 'border-amber-200 bg-amber-50/30 dark:border-amber-900 dark:bg-amber-950/20'
                      : 'border-slate-200 bg-slate-50/50 dark:border-slate-800 dark:bg-slate-950/20'
                  }`}
                >
                  <div class="flex items-center justify-between mb-1.5">
                    <span class="font-bold text-xs text-slate-800 dark:text-slate-200">{col.name}</span>
                    <span
                      class={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                        col.suitability === 'optimal'
                          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-300'
                          : col.suitability === 'acceptable'
                          ? 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-300'
                          : 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-400'
                      }`}
                    >
                      {col.suitability}
                    </span>
                  </div>
                  <div class="text-[11px] font-mono text-slate-500 mb-2">
                    Range: {col.fractionationRangeKDa[0]} – {col.fractionationRangeKDa[1]} kDa
                  </div>
                  <p class="text-[11px] text-slate-600 dark:text-slate-400 leading-snug">
                    {col.notes}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Section: Working Buffer Recipe & Stock Dilution */}
          {dilution && (
            <div class="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 shadow-sm space-y-3">
              <div class="flex items-center justify-between border-b border-slate-100 pb-2.5 dark:border-slate-800">
                <div>
                  <h3 class="text-sm font-bold text-slate-900 dark:text-slate-100">
                    Buffer Preparation &amp; Pipetting Protocol
                  </h3>
                  <p class="text-xs text-slate-500">
                    Recipe to prepare {s.bufferVolume.value} {s.bufferVolume.unit} of {activeDet.name} buffer ({dilution.finalCmcMultiplier.toFixed(1)}× CMC)
                  </p>
                </div>
                <span class="rounded-lg bg-accent-50 px-2.5 py-1 font-mono text-xs font-bold text-accent-700 dark:bg-accent-950 dark:text-accent-300">
                  {dilution.dilutionFactor.toFixed(1)}× Dilution
                </span>
              </div>

              <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div class="rounded-xl border border-accent-200 bg-accent-50/50 p-3.5 dark:border-accent-800 dark:bg-accent-950/30">
                  <span class="block text-xs font-semibold text-accent-900 dark:text-accent-200 uppercase tracking-wider mb-1">
                    Step 1: Measure Stock Detergent
                  </span>
                  <div class="text-2xl font-black font-mono text-accent-700 dark:text-accent-300">
                    {dilution.stockVolumeUl >= 1000
                      ? `${dilution.stockVolumeMl.toFixed(3)} mL`
                      : `${dilution.stockVolumeUl.toFixed(1)} µL`}
                  </div>
                  <span class="text-[11px] text-accent-800/80 dark:text-accent-300/80">
                    From {s.stockConc.value} {s.stockConc.unit} {activeDet.name} stock solution
                  </span>
                </div>

                <div class="rounded-xl border border-slate-200 bg-slate-50/80 p-3.5 dark:border-slate-800 dark:bg-slate-950/40">
                  <span class="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                    Step 2: Add Buffer / Milli-Q Water
                  </span>
                  <div class="text-2xl font-black font-mono text-slate-900 dark:text-slate-100">
                    {dilution.bufferVolumeMl.toFixed(2)} mL
                  </div>
                  <span class="text-[11px] text-slate-500">
                    Bring total volume to exactly {targetBufferVolMl} mL
                  </span>
                </div>
              </div>

              <div class="text-[11px] text-slate-500 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono pt-1">
                <span>Final Target Conc: <strong>{dilution.targetConcMm.toFixed(3)} mM</strong></span>
                <span>•</span>
                <span><strong>{dilution.targetConcPct.toFixed(4)}% (w/v)</strong></span>
                <span>•</span>
                <span><strong>{dilution.targetConcMgMl.toFixed(3)} mg/mL</strong></span>
              </div>
            </div>
          )}

          {/* Section: Detergent Concentration Matrix */}
          <div class="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 shadow-sm space-y-3">
            <h3 class="text-sm font-bold text-slate-900 dark:text-slate-100">
              Concentration Conversion Matrix ({activeDet.name})
            </h3>
            <div class="overflow-x-auto">
              <table class="w-full text-left text-xs font-mono">
                <thead>
                  <tr class="border-b border-slate-200 dark:border-slate-700 text-slate-400">
                    <th class="py-2 pr-4 font-semibold">Fraction</th>
                    <th class="py-2 pr-4 font-semibold">mM</th>
                    <th class="py-2 pr-4 font-semibold">% (w/v)</th>
                    <th class="py-2 font-semibold">mg/mL</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-slate-100 dark:divide-slate-800">
                  <tr>
                    <td class="py-2 pr-4 text-slate-500 font-sans font-medium">Critical Micelle Conc (CMC)</td>
                    <td class="py-2 pr-4 text-accent-600 dark:text-accent-400 font-bold">{activeDet.cmcMm}</td>
                    <td class="py-2 pr-4">{activeDet.cmcPct}%</td>
                    <td class="py-2">{((activeDet.cmcMm * activeDet.molecularWeight) / 1000).toFixed(3)}</td>
                  </tr>
                  <tr>
                    <td class="py-2 pr-4 text-slate-500 font-sans font-medium">Current Total Sample</td>
                    <td class="py-2 pr-4 font-bold">{totalConcMm.toFixed(3)}</td>
                    <td class="py-2 pr-4">{partition.totalConcPct.toFixed(4)}%</td>
                    <td class="py-2">{partition.totalConcMgMl.toFixed(3)}</td>
                  </tr>
                  <tr>
                    <td class="py-2 pr-4 text-slate-500 font-sans font-medium">Free Monomer Fraction</td>
                    <td class="py-2 pr-4">{partition.freeConcMm.toFixed(3)}</td>
                    <td class="py-2 pr-4">{partition.freeConcPct.toFixed(4)}%</td>
                    <td class="py-2">{partition.freeConcMgMl.toFixed(3)}</td>
                  </tr>
                  <tr>
                    <td class="py-2 pr-4 text-slate-500 font-sans font-medium">Micellar Aggregate Fraction</td>
                    <td class="py-2 pr-4">{partition.micellarConcMm.toFixed(3)}</td>
                    <td class="py-2 pr-4">{partition.micellarConcPct.toFixed(4)}%</td>
                    <td class="py-2">{partition.micellarConcMgMl.toFixed(3)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Section: Dialysis Removal Strategy */}
          <div class="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 shadow-sm space-y-2.5">
            <h3 class="text-sm font-bold text-slate-900 dark:text-slate-100">
              Detergent Removal &amp; Exchange Protocols
            </h3>
            <p class="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              {dialyzability.description}
            </p>
            <div class="space-y-1.5 pt-1">
              <span class="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                Recommended Experimental Techniques:
              </span>
              <ul class="space-y-1 text-xs text-slate-600 dark:text-slate-300">
                {dialyzability.removalStrategy.map((strat) => (
                  <li key={strat} class="flex items-start gap-2">
                    <span class="text-accent-600 dark:text-accent-400 shrink-0">•</span>
                    <span>{strat}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      }
      actions={<ActionBar onCopy={copySummary} shareUrl={shareUrl} />}
      science={<SciencePanel science={SCIENCE} />}
    />
  );
}
