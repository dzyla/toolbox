import { useMemo, useState } from 'preact/hooks';
import { useUrlState } from '@/lib/url-state';
import { ToolLayout } from '@/app/components/ToolLayout';
import { ActionBar } from '@/app/components/ActionBar';
import { SciencePanel, scienceText } from '@/app/components/SciencePanel';
import { LineChart, type Series } from '@/app/components/LineChart';
import { SCIENCE } from './science';
import {
  solveStepwise, singleStep, speciesTable, deltaG, deltaGSingleStep,
  chengPrusoff, hillSeries, titration, targetLigandStepwise, targetLigandSingleStep,
  kdFromRates, kObs, tHalfObs, tHalfDissociation, associationCourse, dissociationCourse,
  mixRecipe, serialDilutionPlan, massToNM, nmToMass,
  type Model, type TargetMode, type SingleStepResult, type StepwiseResult, type SpeciesRow, type DeltaG,
} from '@/core/binding/equilibrium';

type ConcUnit = 'nM' | 'µM' | 'mM' | 'mg/mL';
type KdUnit = 'nM' | 'µM' | 'mM';

const UNIT_SCALE: Record<string, number> = {
  nM: 1,
  'µM': 1e3,
  mM: 1e6,
  M: 1e9,
};

function toNM(val: number, unit: ConcUnit, mw_kDa: number): number {
  if (unit === 'mg/mL') {
    if (!(mw_kDa > 0)) throw new RangeError('Enter a positive molecular weight to use mg/mL.');
    return massToNM(val, mw_kDa);
  }
  return val * (UNIT_SCALE[unit] ?? 1);
}

function fromNM(val_nM: number, unit: ConcUnit, mw_kDa: number): number {
  if (unit === 'mg/mL') {
    if (!(mw_kDa > 0)) return NaN;
    return nmToMass(val_nM, mw_kDa);
  }
  return val_nM / (UNIT_SCALE[unit] ?? 1);
}

interface State {
  model: Model;
  n: number;
  alpha: number;
  p1Val: number;
  p1Unit: ConcUnit;
  p2Val: number;
  p2Unit: ConcUnit;
  kdVal: number;
  kdUnit: KdUnit;
  mwP1: number;
  mwP2: number;
  tempC: number;
  activeTab: 'status' | 'curves' | 'hill' | 'target' | 'ki' | 'mix' | 'kinetics';
  targetFrac: number;
  targetMode: TargetMode;
  ic50: number;
  inhibL: number;
  mixV: number;
  mixP1Stock: number;
  mixP2Stock: number;
  dilutionHigh: number;
  dilutionLow: number;
  dilutionFactor: number;
  kon: number;
  koff: number;
}

const DEFAULTS: State = {
  model: 'stepwise',
  n: 1,
  alpha: 1.0,
  p1Val: 10,
  p1Unit: 'nM',
  p2Val: 50,
  p2Unit: 'nM',
  kdVal: 100,
  kdUnit: 'nM',
  mwP1: 150,
  mwP2: 25,
  tempC: 25,
  activeTab: 'status',
  targetFrac: 50,
  targetMode: 'any_bound',
  ic50: 50,
  inhibL: 10,
  mixV: 50,
  mixP1Stock: 100,
  mixP2Stock: 500,
  dilutionHigh: 1000,
  dilutionLow: 1,
  dilutionFactor: 2,
  kon: 1e5,
  koff: 1e-3,
};

const FIELD = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900';

type CalcResult =
  | { type: 'stepwise'; res: StepwiseResult; rows: SpeciesRow[]; dg: DeltaG; error?: undefined }
  | { type: 'single_step'; res: SingleStepResult; rows: SpeciesRow[]; dg: { total: DeltaG; perSite: DeltaG }; error?: undefined }
  | { type: 'error'; error: string };

export default function BindingView() {
  const [state] = useUrlState('bb.binding', DEFAULTS);
  const s = state.value;
  const set = (patch: Partial<State>) => { state.value = { ...state.value, ...patch }; };

  // Freeze reference for saturation curve
  const [frozenCurve, setFrozenCurve] = useState<{ x: number[]; y: number[]; label: string } | null>(null);

  // Conversion to nM for calculations
  const parsed = useMemo(() => {
    try {
      const p1_nM = toNM(s.p1Val, s.p1Unit, s.mwP1);
      const p2_nM = toNM(s.p2Val, s.p2Unit, s.mwP2);
      const kd_nM = s.kdVal * (UNIT_SCALE[s.kdUnit] ?? 1);
      return { p1_nM, p2_nM, kd_nM, error: '' };
    } catch (e) {
      return { p1_nM: 0, p2_nM: 0, kd_nM: 0, error: e instanceof Error ? e.message : 'Invalid inputs' };
    }
  }, [s.p1Val, s.p1Unit, s.p2Val, s.p2Unit, s.kdVal, s.kdUnit, s.mwP1, s.mwP2]);

  // Main equilibrium solve
  const eqResult = useMemo<CalcResult | null>(() => {
    if (parsed.error) return null;
    try {
      const { p1_nM, p2_nM, kd_nM } = parsed;
      if (s.model === 'single_step') {
        const res = singleStep(p1_nM, p2_nM, kd_nM, s.n);
        const rows = speciesTable(
          { probs: [res.p1Free / p1_nM, res.complex / p1_nM], concs: [res.p1Free, res.complex] },
          s.mwP1 > 0 ? s.mwP1 : undefined,
          s.mwP2 > 0 ? s.mwP2 : undefined
        );
        const dg = deltaGSingleStep(kd_nM, s.n, s.tempC);
        return { type: 'single_step', res, rows, dg };
      } else {
        const res = solveStepwise(p1_nM, p2_nM, kd_nM, s.n, s.alpha);
        const rows = speciesTable(
          res,
          s.mwP1 > 0 ? s.mwP1 : undefined,
          s.mwP2 > 0 ? s.mwP2 : undefined
        );
        const dg = deltaG(kd_nM, s.tempC);
        return { type: 'stepwise', res, rows, dg };
      }
    } catch (e) {
      return { type: 'error', error: e instanceof Error ? e.message : 'Equilibrium calculation failed' };
    }
  }, [parsed, s.model, s.n, s.alpha, s.tempC, s.mwP1, s.mwP2]);

  // Titration & curves
  const titrationData = useMemo(() => {
    if (parsed.error || !eqResult || eqResult.type === 'error') return null;
    try {
      const { p1_nM, kd_nM } = parsed;
      const start = Math.max(0.01, kd_nM / 100);
      const end = Math.max(100, kd_nM * 100, p1_nM * s.n * 10);
      const titr = titration({
        model: s.model,
        P1: p1_nM,
        Kd: kd_nM,
        n: s.n,
        alpha: s.alpha,
        start,
        end,
        points: 80,
        log: true,
      });
      const hill = hillSeries(titr.Lfree, titr.theta);
      return { titr, hill, error: '' };
    } catch (e) {
      return { error: e instanceof Error ? e.message : 'Titration failed' };
    }
  }, [parsed, eqResult, s.model, s.n, s.alpha]);

  // Target solver
  const targetResult = useMemo(() => {
    if (parsed.error) return null;
    try {
      const frac = s.targetFrac / 100;
      const { p1_nM, kd_nM } = parsed;
      let req_nM = 0;
      if (s.model === 'single_step') {
        req_nM = targetLigandSingleStep(p1_nM, kd_nM, s.n, frac);
      } else {
        req_nM = targetLigandStepwise(p1_nM, kd_nM, s.n, s.alpha, s.targetMode, frac);
      }
      const reqDisp = fromNM(req_nM, s.p2Unit, s.mwP2);
      return { req_nM, reqDisp, error: '' };
    } catch (e) {
      return { req_nM: NaN, reqDisp: NaN, error: e instanceof Error ? e.message : 'Target solver error' };
    }
  }, [parsed, s.model, s.n, s.alpha, s.targetFrac, s.targetMode, s.p2Unit, s.mwP2]);

  // Cheng-Prusoff Ki
  const kiResult = useMemo(() => {
    if (parsed.error) return null;
    try {
      const ki = chengPrusoff(s.ic50, s.inhibL, parsed.kd_nM);
      return { ki, error: '' };
    } catch (e) {
      return { ki: NaN, error: e instanceof Error ? e.message : 'Ki calculation failed' };
    }
  }, [parsed, s.ic50, s.inhibL]);

  // Mix & Dilution
  const mixData = useMemo(() => {
    try {
      const recipe = mixRecipe({
        p1Total: s.p1Val,
        p2Total: s.p2Val,
        p1Stock: s.mixP1Stock,
        p2Stock: s.mixP2Stock,
        finalVolume: s.mixV,
      });
      const dilPlan = serialDilutionPlan({
        high: s.dilutionHigh,
        low: s.dilutionLow,
        factor: s.dilutionFactor,
      });
      return { recipe, dilPlan, error: '' };
    } catch (e) {
      return { error: e instanceof Error ? e.message : 'Mix calculation failed' };
    }
  }, [s.p1Val, s.p2Val, s.mixP1Stock, s.mixP2Stock, s.mixV, s.dilutionHigh, s.dilutionLow, s.dilutionFactor]);

  // Kinetics
  const kineticsData = useMemo(() => {
    try {
      const kd_calc = kdFromRates(s.kon, s.koff) * 1e9; // to nM
      const l_M = parsed.p2_nM * 1e-9;
      const kobs = kObs(s.kon, s.koff, l_M);
      const thalfAssoc = tHalfObs(s.kon, s.koff, l_M);
      const thalfDiss = tHalfDissociation(s.koff);
      const assocCurve = associationCourse(s.kon, s.koff, l_M, thalfAssoc * 5);
      const dissCurve = dissociationCourse(s.koff, thalfDiss * 5);
      return { kd_calc, kobs, thalfAssoc, thalfDiss, assocCurve, dissCurve, error: '' };
    } catch (e) {
      return { kd_calc: 0, kobs: 0, thalfAssoc: 0, thalfDiss: 0, assocCurve: null, dissCurve: null, error: e instanceof Error ? e.message : 'Kinetics error' };
    }
  }, [s.kon, s.koff, parsed.p2_nM]);

  const copyText = () => {
    if (!eqResult || eqResult.type === 'error') return 'No results calculated';
    const lines = [
      `Binding Equilibrium (${s.model}):`,
      `P1 Total: ${s.p1Val} ${s.p1Unit}, P2 Total: ${s.p2Val} ${s.p2Unit}, Kd: ${s.kdVal} ${s.kdUnit}, n: ${s.n}`,
    ];
    if (eqResult.type === 'stepwise') {
      const res = eqResult.res;
      lines.push(`Free P1: ${res.p1Free.toFixed(2)} nM (${(res.probs[0]! * 100).toFixed(1)}%)`);
      lines.push(`Free P2: ${res.L.toFixed(2)} nM`);
      lines.push(`Saturation (θ): ${(res.theta * 100).toFixed(1)}%`);
      lines.push(`ΔG°: ${eqResult.dg.kJ.toFixed(2)} kJ/mol (${eqResult.dg.kcal.toFixed(2)} kcal/mol)`);
    } else {
      const res = eqResult.res;
      lines.push(`Free P1: ${res.p1Free.toFixed(2)} nM (${((res.p1Free / parsed.p1_nM) * 100).toFixed(1)}%)`);
      lines.push(`Free P2: ${res.p2Free.toFixed(2)} nM`);
      lines.push(`Complex: ${res.complex.toFixed(2)} nM`);
      lines.push(`ΔG° (per site): ${eqResult.dg.perSite.kJ.toFixed(2)} kJ/mol`);
    }
    return `${lines.join('\n')}\n\n${scienceText(SCIENCE)}`;
  };

  const handleFreeze = () => {
    if (!titrationData || ('error' in titrationData && titrationData.error) || !titrationData.titr) return;
    setFrozenCurve({
      x: titrationData.titr.Ltot,
      y: titrationData.titr.theta.map(v => v * 100),
      label: `Ref: Kd ${s.kdVal} ${s.kdUnit}, n=${s.n}`,
    });
  };

  return (
    <ToolLayout
      icon="🧲"
      title="Binding Equilibrium Calculator"
      blurb="Equilibrium solvers for 1:1, n-mer, and cooperative multi-site binding with thermodynamics and kinetics."
      mobileResultSummary={
        eqResult?.type === 'single_step' && eqResult.res ? (
          <span>Bound: <strong class="text-accent-700 dark:text-accent-300 font-mono">{(eqResult.res.fractionBound * 100).toFixed(1)}%</strong>{eqResult.dg?.total?.kcal !== undefined ? <span> · ΔG <strong class="font-mono">{eqResult.dg.total.kcal.toFixed(2)} kcal/mol</strong></span> : ''}</span>
        ) : eqResult?.type === 'stepwise' && eqResult.res ? (
          <span>Saturation: <strong class="text-accent-700 dark:text-accent-300 font-mono">{(eqResult.res.theta * 100).toFixed(1)}%</strong> ({eqResult.res.boundSites.toFixed(2)} / {s.n} sites)</span>
        ) : null
      }
      inputs={
        <div class="space-y-4">
          <details class="rounded-xl border border-slate-200 p-3 dark:border-slate-700" open>
            <summary class="cursor-pointer font-medium">Experimental Settings & Molecular Weights</summary>
            <div class="mt-3 grid gap-3 sm:grid-cols-3">
              <div>
                <label class="block text-xs font-medium text-slate-600 dark:text-slate-400">P1 MW (kDa)</label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  class={FIELD}
                  value={s.mwP1}
                  onInput={e => set({ mwP1: Number((e.target as HTMLInputElement).value) })}
                />
              </div>
              <div>
                <label class="block text-xs font-medium text-slate-600 dark:text-slate-400">P2 MW (kDa)</label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  class={FIELD}
                  value={s.mwP2}
                  onInput={e => set({ mwP2: Number((e.target as HTMLInputElement).value) })}
                />
              </div>
              <div>
                <label class="block text-xs font-medium text-slate-600 dark:text-slate-400">Temperature (°C)</label>
                <input
                  type="number"
                  step="any"
                  class={FIELD}
                  value={s.tempC}
                  onInput={e => set({ tempC: Number((e.target as HTMLInputElement).value) })}
                />
              </div>
            </div>
          </details>

          <div>
            <label class="block text-sm font-medium mb-1">Binding Model</label>
            <select
              class={FIELD}
              value={s.model}
              onChange={e => set({ model: (e.target as HTMLSelectElement).value as Model })}
            >
              <option value="stepwise">Stepwise Adair (n identical sites, cooperativity α)</option>
              <option value="single_step">Single-step n-mer assembly (P1 + n·P2 ⇌ Complex)</option>
            </select>
          </div>

          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block text-sm font-medium mb-1">Stoichiometry n</label>
              <input
                type="number"
                min="1"
                max="10"
                step="1"
                class={FIELD}
                value={s.n}
                onInput={e => set({ n: Math.max(1, parseInt((e.target as HTMLInputElement).value) || 1) })}
              />
            </div>
            {s.model === 'stepwise' ? (
              <div>
                <label class="block text-sm font-medium mb-1">Cooperativity (α)</label>
                <input
                  type="number"
                  min="0.001"
                  step="0.1"
                  class={FIELD}
                  value={s.alpha}
                  onInput={e => set({ alpha: Number((e.target as HTMLInputElement).value) })}
                />
                <span class="text-[11px] text-slate-500">α=1 indep, &lt;1 pos, &gt;1 neg</span>
              </div>
            ) : null}
          </div>

          <div>
            <label class="block text-sm font-medium mb-1">Protein 1 Total</label>
            <div class="flex gap-2">
              <input
                type="number"
                min="0"
                step="any"
                class={`${FIELD} flex-1`}
                value={s.p1Val}
                onInput={e => set({ p1Val: Number((e.target as HTMLInputElement).value) })}
              />
              <select
                class="rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900"
                value={s.p1Unit}
                onChange={e => set({ p1Unit: (e.target as HTMLSelectElement).value as ConcUnit })}
              >
                <option value="nM">nM</option>
                <option value="µM">µM</option>
                <option value="mM">mM</option>
                <option value="mg/mL">mg/mL</option>
              </select>
            </div>
          </div>

          <div>
            <label class="block text-sm font-medium mb-1">Protein 2 Total</label>
            <div class="flex gap-2">
              <input
                type="number"
                min="0"
                step="any"
                class={`${FIELD} flex-1`}
                value={s.p2Val}
                onInput={e => set({ p2Val: Number((e.target as HTMLInputElement).value) })}
              />
              <select
                class="rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900"
                value={s.p2Unit}
                onChange={e => set({ p2Unit: (e.target as HTMLSelectElement).value as ConcUnit })}
              >
                <option value="nM">nM</option>
                <option value="µM">µM</option>
                <option value="mM">mM</option>
                <option value="mg/mL">mg/mL</option>
              </select>
            </div>
          </div>

          <div>
            <label class="block text-sm font-medium mb-1">Dissociation Constant (Kd)</label>
            <div class="flex gap-2">
              <input
                type="number"
                min="0"
                step="any"
                class={`${FIELD} flex-1`}
                value={s.kdVal}
                onInput={e => set({ kdVal: Number((e.target as HTMLInputElement).value) })}
              />
              <select
                class="rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900"
                value={s.kdUnit}
                onChange={e => set({ kdUnit: (e.target as HTMLSelectElement).value as KdUnit })}
              >
                <option value="nM">nM</option>
                <option value="µM">µM</option>
                <option value="mM">mM</option>
              </select>
            </div>
            {s.model === 'single_step' && s.n > 1 && (
              <span class="text-xs text-amber-600 dark:text-amber-400">
                Single-step Kd has units of conc^{s.n} ({s.kdUnit}^{s.n}).
              </span>
            )}
          </div>
        </div>
      }
      results={
        <div class="space-y-4">
          {parsed.error && <div role="alert" class="rounded-lg border border-red-300 bg-red-50 p-4 text-red-800">{parsed.error}</div>}
          {eqResult && eqResult.type === 'error' && (
            <div role="alert" class="rounded-lg border border-red-300 bg-red-50 p-4 text-red-800">{eqResult.error}</div>
          )}

          {/* Sub-tab Navigation */}
          <div class="flex flex-wrap gap-2 border-b border-slate-200 pb-2 dark:border-slate-700">
            {(
              [
                ['status', 'Equilibrium'],
                ['curves', 'Curves & Saturation'],
                ['hill', 'Hill Plot'],
                ['target', 'Target Solver'],
                ['ki', 'Inhibition (Ki)'],
                ['mix', 'Mix & Dilution'],
                ['kinetics', 'Kinetics'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                class={`min-h-9 rounded-lg px-3 text-sm font-medium transition ${
                  s.activeTab === id
                    ? 'bg-accent-600 text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'
                }`}
                onClick={() => set({ activeTab: id })}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Tab 1: Equilibrium */}
          {s.activeTab === 'status' && eqResult && eqResult.type !== 'error' && (
            <div class="space-y-4" data-testid="equilibrium-result">
              <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div class="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
                  <div class="text-xs text-slate-500">Free P1</div>
                  <div class="mono text-lg font-bold">
                    {eqResult.type === 'stepwise'
                      ? `${fromNM(eqResult.res.p1Free, s.p1Unit, s.mwP1).toFixed(2)} ${s.p1Unit}`
                      : `${fromNM(eqResult.res.p1Free, s.p1Unit, s.mwP1).toFixed(2)} ${s.p1Unit}`}
                  </div>
                  <div class="text-xs text-slate-500">
                    {eqResult.type === 'stepwise'
                      ? `${(eqResult.res.probs[0]! * 100).toFixed(1)}% of total`
                      : `${((eqResult.res.p1Free / parsed.p1_nM) * 100).toFixed(1)}% of total`}
                  </div>
                </div>

                <div class="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
                  <div class="text-xs text-slate-500">Free P2</div>
                  <div class="mono text-lg font-bold">
                    {eqResult.type === 'stepwise'
                      ? `${fromNM(eqResult.res.L, s.p2Unit, s.mwP2).toFixed(2)} ${s.p2Unit}`
                      : `${fromNM(eqResult.res.p2Free, s.p2Unit, s.mwP2).toFixed(2)} ${s.p2Unit}`}
                  </div>
                </div>

                <div class="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
                  <div class="text-xs text-slate-500">Site Saturation (θ)</div>
                  <div class="mono text-lg font-bold text-accent-600">
                    {eqResult.type === 'stepwise'
                      ? `${(eqResult.res.theta * 100).toFixed(1)}%`
                      : `${((eqResult.res.complex / parsed.p1_nM) * 100).toFixed(1)}%`}
                  </div>
                </div>

                <div class="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
                  <div class="text-xs text-slate-500">Standard ΔG° ({s.tempC} °C)</div>
                  <div class="mono text-sm font-semibold">
                    {eqResult.type === 'stepwise'
                      ? `${eqResult.dg.kJ.toFixed(1)} kJ/mol`
                      : `${eqResult.dg.perSite.kJ.toFixed(1)} kJ/mol`}
                  </div>
                  <div class="text-xs text-slate-500">
                    {eqResult.type === 'stepwise'
                      ? `${eqResult.dg.kcal.toFixed(1)} kcal/mol`
                      : `${eqResult.dg.perSite.kcal.toFixed(1)} kcal/mol`}
                  </div>
                </div>
              </div>

              {/* Species Breakdown Table */}
              <div class="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
                <h3 class="mb-2 font-medium">Species Breakdown</h3>
                <div class="overflow-x-auto">
                  <table class="w-full text-left text-sm">
                    <thead>
                      <tr class="border-b border-slate-200 dark:border-slate-700 text-xs text-slate-500">
                        <th class="pb-1">Species</th>
                        <th class="pb-1">Fraction</th>
                        <th class="pb-1">Concentration (nM)</th>
                        {s.mwP1 > 0 && <th class="pb-1">Mass conc (mg/mL)</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {eqResult.rows.map(row => (
                        <tr key={row.k} class="border-b border-slate-100 dark:border-slate-800">
                          <td class="py-1">
                            {row.k === 0 ? 'P1 (unbound)' : `P1·(P2)${row.k > 1 ? `_${row.k}` : ''}`}
                          </td>
                          <td class="mono py-1">{(row.fraction * 100).toFixed(1)}%</td>
                          <td class="mono py-1">{row.conc_nM.toFixed(2)}</td>
                          {s.mwP1 > 0 && <td class="mono py-1">{row.massConc_mg_per_mL?.toFixed(4) ?? '—'}</td>}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* Tab 2: Curves & Saturation */}
          {s.activeTab === 'curves' && titrationData && !('error' in titrationData && titrationData.error) && titrationData.titr && (
            <div class="space-y-4">
              <div class="flex items-center justify-between">
                <span class="text-sm font-medium">Saturation Curve & Reference</span>
                <button
                  type="button"
                  class="rounded-lg border border-slate-300 px-3 py-1 text-xs hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
                  onClick={handleFreeze}
                >
                  {frozenCurve ? 'Update Freeze Reference' : 'Freeze Reference Curve'}
                </button>
              </div>

              {(() => {
                const titr = titrationData.titr;
                const chartSeries: Series[] = [
                  {
                    name: 'Current θ',
                    x: titr.Ltot,
                    y: titr.theta.map(v => v * 100),
                    color: '#4f46e5',
                  },
                ];
                if (frozenCurve) {
                  chartSeries.push({
                    name: frozenCurve.label,
                    x: frozenCurve.x,
                    y: frozenCurve.y,
                    color: '#94a3b8',
                    dashed: true,
                  });
                }
                return (
                  <LineChart
                    title="Fractional Saturation vs Total Ligand"
                    xLabel="Total Ligand (nM)"
                    yLabel="Saturation (%)"
                    series={chartSeries}
                    xLog
                    exportName="binding-saturation-curve"
                  />
                );
              })()}

              {/* Species Landscape */}
              {titrationData.titr.species && (
                <div class="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
                  <h4 class="mb-2 text-sm font-medium">Species Landscape</h4>
                  <LineChart
                    title="Species Distribution"
                    xLabel="Total Ligand (nM)"
                    yLabel="Concentration (nM)"
                    series={titrationData.titr.species.map((curve: number[], k: number) => ({
                      name: k === 0 ? 'P1' : `P1·(P2)${k > 1 ? `_${k}` : ''}`,
                      x: titrationData.titr.Ltot,
                      y: curve,
                    }))}
                    xLog
                    exportName="binding-species-landscape"
                  />
                </div>
              )}
            </div>
          )}

          {/* Tab 3: Hill Plot */}
          {s.activeTab === 'hill' && titrationData && !('error' in titrationData && titrationData.error) && titrationData.hill && (
            <div class="space-y-4">
              <div class="rounded-xl border border-slate-200 p-4 dark:border-slate-700">
                <div class="flex items-baseline justify-between">
                  <h3 class="font-semibold">Hill Analysis on Free Ligand</h3>
                  <span class="mono text-lg font-bold text-accent-600">
                    nH = {Number.isFinite(titrationData.hill.slope) ? titrationData.hill.slope.toFixed(3) : '—'}
                  </span>
                </div>
                <p class="mt-1 text-xs text-slate-500">
                  Computed by linear regression of log(θ/(1−θ)) against log[L]free over 0.1 &lt; θ &lt; 0.9.
                  R² = {Number.isFinite(titrationData.hill.r2) ? titrationData.hill.r2.toFixed(4) : '—'}
                </p>

                {titrationData.hill.points.length > 2 && (
                  <div class="mt-3">
                    <LineChart
                      title="Hill Plot: log(θ / (1 - θ)) vs log([L]free / nM)"
                      xLabel="log10 [L]free"
                      yLabel="log10(θ / (1 - θ))"
                      series={[
                        {
                          name: 'Data',
                          x: titrationData.hill.points.map(p => p.logL),
                          y: titrationData.hill.points.map(p => p.logOdds),
                          color: '#0891b2',
                        },
                      ]}
                      exportName="binding-hill-plot"
                    />
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Tab 4: Target Solver */}
          {s.activeTab === 'target' && targetResult && (
            <div class="space-y-4 rounded-xl border border-slate-200 p-4 dark:border-slate-700">
              <h3 class="font-semibold">Target Occupancy Solver</h3>
              <p class="text-sm text-slate-500">
                Calculate the exact total amount of Protein 2 required to achieve a target saturation.
              </p>
              <div class="grid gap-3 sm:grid-cols-2">
                <div>
                  <label class="block text-sm font-medium mb-1">Target Saturation (%)</label>
                  <input
                    type="number"
                    min="1"
                    max="99"
                    step="1"
                    class={FIELD}
                    value={s.targetFrac}
                    onInput={e => set({ targetFrac: Number((e.target as HTMLInputElement).value) })}
                  />
                </div>
                {s.model === 'stepwise' && (
                  <div>
                    <label class="block text-sm font-medium mb-1">Target Criterion</label>
                    <select
                      class={FIELD}
                      value={s.targetMode}
                      onChange={e => set({ targetMode: (e.target as HTMLSelectElement).value as TargetMode })}
                    >
                      <option value="any_bound">Site Saturation (overall θ)</option>
                      <option value="fully_bound">Fully Bound Complex [P1·(P2)n]</option>
                    </select>
                  </div>
                )}
              </div>

              {targetResult.error ? (
                <div role="alert" class="text-sm text-red-600">{targetResult.error}</div>
              ) : (
                <div class="mt-4 rounded-lg bg-slate-50 p-3 dark:bg-slate-800/50">
                  <div class="text-xs text-slate-500">Required Total Protein 2:</div>
                  <div class="mono text-2xl font-bold text-accent-600">
                    {targetResult.reqDisp.toFixed(2)} {s.p2Unit}
                  </div>
                  <div class="mono text-xs text-slate-500 mt-1">
                    ({targetResult.req_nM.toFixed(1)} nM total; free: {(targetResult.req_nM - (s.targetFrac / 100) * parsed.p1_nM * s.n).toFixed(1)} nM)
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Tab 5: Ki Calculator */}
          {s.activeTab === 'ki' && kiResult && (
            <div class="space-y-4 rounded-xl border border-slate-200 p-4 dark:border-slate-700">
              <h3 class="font-semibold">Cheng–Prusoff Ki Calculator</h3>
              <p class="text-sm text-slate-500">
                Calculates the inhibition constant Ki for a competitive inhibitor using Ki = IC50 / (1 + [L]/Kd).
              </p>
              <div class="grid gap-3 sm:grid-cols-2">
                <div>
                  <label class="block text-sm font-medium mb-1">IC50 (nM)</label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    class={FIELD}
                    value={s.ic50}
                    onInput={e => set({ ic50: Number((e.target as HTMLInputElement).value) })}
                  />
                </div>
                <div>
                  <label class="block text-sm font-medium mb-1">Substrate / Ligand [L] (nM)</label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    class={FIELD}
                    value={s.inhibL}
                    onInput={e => set({ inhibL: Number((e.target as HTMLInputElement).value) })}
                  />
                </div>
              </div>

              <div class="mt-4 rounded-lg bg-slate-50 p-3 dark:bg-slate-800/50">
                <div class="text-xs text-slate-500">Inhibition Constant (Ki):</div>
                <div class="mono text-2xl font-bold text-accent-600">
                  {Number.isFinite(kiResult.ki) ? `${kiResult.ki.toFixed(2)} nM` : '—'}
                </div>
              </div>
            </div>
          )}

          {/* Tab 6: Mix & Dilution */}
          {s.activeTab === 'mix' && mixData && (
            <div class="space-y-4 rounded-xl border border-slate-200 p-4 dark:border-slate-700">
              <h3 class="font-semibold">Reaction Mix Helper</h3>
              <div class="grid gap-3 sm:grid-cols-3">
                <div>
                  <label class="block text-xs text-slate-500">Final Volume (µL)</label>
                  <input
                    type="number"
                    min="1"
                    step="any"
                    class={FIELD}
                    value={s.mixV}
                    onInput={e => set({ mixV: Number((e.target as HTMLInputElement).value) })}
                  />
                </div>
                <div>
                  <label class="block text-xs text-slate-500">P1 Stock ({s.p1Unit})</label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    class={FIELD}
                    value={s.mixP1Stock}
                    onInput={e => set({ mixP1Stock: Number((e.target as HTMLInputElement).value) })}
                  />
                </div>
                <div>
                  <label class="block text-xs text-slate-500">P2 Stock ({s.p2Unit})</label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    class={FIELD}
                    value={s.mixP2Stock}
                    onInput={e => set({ mixP2Stock: Number((e.target as HTMLInputElement).value) })}
                  />
                </div>
              </div>

              {mixData.error && <p role="alert" class="text-sm text-red-600">{mixData.error}</p>}

              {mixData.recipe && (
                <div class="rounded-lg bg-slate-50 p-3 dark:bg-slate-800/50">
                  <div class="text-xs font-semibold uppercase text-slate-500 mb-1">Pipetting Recipe:</div>
                  <ul class="text-sm space-y-1">
                    <li>• P1 Stock: <strong class="mono">{mixData.recipe.v1.toFixed(2)} µL</strong></li>
                    <li>• P2 Stock: <strong class="mono">{mixData.recipe.v2.toFixed(2)} µL</strong></li>
                    <li>• Buffer / Diluent: <strong class="mono">{mixData.recipe.buffer.toFixed(2)} µL</strong></li>
                  </ul>
                </div>
              )}

              <hr class="border-slate-200 dark:border-slate-700 my-4" />

              <h4 class="font-semibold text-sm">Serial Dilution Scheme for P2</h4>
              <div class="grid gap-3 sm:grid-cols-3">
                <div>
                  <label class="block text-xs text-slate-500">High Conc</label>
                  <input
                    type="number"
                    min="0"
                    class={FIELD}
                    value={s.dilutionHigh}
                    onInput={e => set({ dilutionHigh: Number((e.target as HTMLInputElement).value) })}
                  />
                </div>
                <div>
                  <label class="block text-xs text-slate-500">Low Conc</label>
                  <input
                    type="number"
                    min="0"
                    class={FIELD}
                    value={s.dilutionLow}
                    onInput={e => set({ dilutionLow: Number((e.target as HTMLInputElement).value) })}
                  />
                </div>
                <div>
                  <label class="block text-xs text-slate-500">Dilution Factor</label>
                  <input
                    type="number"
                    min="1.1"
                    step="any"
                    class={FIELD}
                    value={s.dilutionFactor}
                    onInput={e => set({ dilutionFactor: Number((e.target as HTMLInputElement).value) })}
                  />
                </div>
              </div>

              {mixData.dilPlan && (
                <div class="overflow-x-auto mt-2">
                  <table class="w-full text-left text-xs">
                    <thead>
                      <tr class="border-b border-slate-200 dark:border-slate-700">
                        <th class="pb-1">Tube</th>
                        <th class="pb-1">Target Conc</th>
                        <th class="pb-1">Recipe</th>
                      </tr>
                    </thead>
                    <tbody>
                      {mixData.dilPlan.tubes.map(tube => (
                        <tr key={tube.tube} class="border-b border-slate-100 dark:border-slate-800">
                          <td class="py-1 mono font-semibold">#{tube.tube}</td>
                          <td class="py-1 mono">{tube.conc.toFixed(2)}</td>
                          <td class="py-1 text-slate-600 dark:text-slate-400">{tube.recipe}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Tab 7: Kinetics */}
          {s.activeTab === 'kinetics' && kineticsData && (
            <div class="space-y-4 rounded-xl border border-slate-200 p-4 dark:border-slate-700">
              <h3 class="font-semibold">Pseudo-First-Order Kinetics</h3>
              <div class="grid gap-3 sm:grid-cols-2">
                <div>
                  <label class="block text-sm font-medium mb-1">kon (M⁻¹s⁻¹)</label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    class={FIELD}
                    value={s.kon}
                    onInput={e => set({ kon: Number((e.target as HTMLInputElement).value) })}
                  />
                </div>
                <div>
                  <label class="block text-sm font-medium mb-1">koff (s⁻¹)</label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    class={FIELD}
                    value={s.koff}
                    onInput={e => set({ koff: Number((e.target as HTMLInputElement).value) })}
                  />
                </div>
              </div>

              <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div class="rounded-lg bg-slate-50 p-3 dark:bg-slate-800/50">
                  <div class="text-xs text-slate-500">Calculated Kd:</div>
                  <div class="mono text-lg font-bold">{kineticsData.kd_calc.toFixed(2)} nM</div>
                </div>
                <div class="rounded-lg bg-slate-50 p-3 dark:bg-slate-800/50">
                  <div class="text-xs text-slate-500">Observed rate kobs:</div>
                  <div class="mono text-lg font-bold">{kineticsData.kobs.toFixed(4)} s⁻¹</div>
                </div>
                <div class="rounded-lg bg-slate-50 p-3 dark:bg-slate-800/50">
                  <div class="text-xs text-slate-500">Association t½:</div>
                  <div class="mono text-lg font-bold">{kineticsData.thalfAssoc.toFixed(1)} s</div>
                </div>
                <div class="rounded-lg bg-slate-50 p-3 dark:bg-slate-800/50">
                  <div class="text-xs text-slate-500">Dissociation t½:</div>
                  <div class="mono text-lg font-bold">{kineticsData.thalfDiss.toFixed(1)} s</div>
                </div>
              </div>

              {kineticsData.assocCurve && (
                <div class="mt-3">
                  <LineChart
                    title="Association Time Course"
                    xLabel="Time (s)"
                    yLabel="Fraction Bound"
                    series={[
                      {
                        name: 'Association',
                        x: kineticsData.assocCurve.t,
                        y: kineticsData.assocCurve.fraction,
                        color: '#16a34a',
                      },
                    ]}
                    exportName="binding-association"
                  />
                </div>
              )}
            </div>
          )}
        </div>
      }
      actions={<ActionBar onCopy={copyText} />}
      science={<SciencePanel science={SCIENCE} />}
    />
  );
}
