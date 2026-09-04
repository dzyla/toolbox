import { useMemo } from 'preact/hooks';
import { useUrlState } from '@/lib/url-state';
import { ToolLayout } from '@/app/components/ToolLayout';
import { ActionBar } from '@/app/components/ActionBar';
import { SciencePanel, scienceText } from '@/app/components/SciencePanel';
import { SCIENCE } from './science';
import {
  approxMolecularWeight, massConcToMolar,
  a260ToMassConc, copyNumber, oligoMass, oligoNmol,
  oligoExtinctionCoefficient, quantifyOligoA260,
  type NaType,
} from '@/core/nucleic/quant';
import {
  cleanNucleic,
} from '@/core/nucleic/sequence';
import {
  tmWallace, tmBasic, tmNearestNeighbour, type SaltCorrection,
} from '@/core/nucleic/tm';

interface State {
  tab: 'convert' | 'a260' | 'copy' | 'oligo' | 'tm';
  naType: NaType;
  length: number;
  ngPerUl: number;
  molar_nM: number;
  a260: number;
  a260Dilution: number;
  a260Path: number;
  copyNg: number;
  copies: number;
  oligoSeq: string;
  oligoUg: number;
  oligoResuspendConc_uM: number;
  oligoA260: number;
  oligoDilution: number;
  oligoPath: number;
  tmSeq: string;
  primerConc_nM: number;
  naConc_mM: number;
  mgConc_mM: number;
  saltModel: SaltCorrection;
}

const DEFAULTS: State = {
  tab: 'convert',
  naType: 'dsDNA',
  length: 1000,
  ngPerUl: 50,
  molar_nM: 76.92,
  a260: 1.0,
  a260Dilution: 1.0,
  a260Path: 1.0,
  copyNg: 100,
  copies: 9.26e10,
  oligoSeq: 'ATGCAAAGGGTTT',
  oligoUg: 10,
  oligoResuspendConc_uM: 100,
  oligoA260: 0,
  oligoDilution: 1.0,
  oligoPath: 1.0,
  tmSeq: 'ACGTACGTACGTACGT',
  primerConc_nM: 250,
  naConc_mM: 50,
  mgConc_mM: 0,
  saltModel: 'owczarzy2004',
};

const FIELD = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900';

export default function NucleicView() {
  const [state] = useUrlState('bb.nucleic', DEFAULTS);
  const s = state.value;
  const set = (patch: Partial<State>) => { state.value = { ...state.value, ...patch }; };

  // Conversions
  const convResults = useMemo(() => {
    try {
      if (!(s.length > 0)) return null;
      const mw = approxMolecularWeight(s.length, s.naType);
      const calculatedMolar = massConcToMolar(s.ngPerUl, s.length, s.naType);
      return { mw, calculatedMolar, error: '' };
    } catch (e) {
      return { mw: 0, calculatedMolar: 0, error: e instanceof Error ? e.message : 'Conversion error' };
    }
  }, [s.length, s.naType, s.ngPerUl]);

  // A260
  const a260Results = useMemo(() => {
    try {
      const conc = a260ToMassConc(s.a260, s.naType, s.a260Dilution, s.a260Path);
      const molar = s.length > 0 ? massConcToMolar(conc, s.length, s.naType) : 0;
      return { conc, molar, error: '' };
    } catch (e) {
      return { conc: 0, molar: 0, error: e instanceof Error ? e.message : 'A260 calculation error' };
    }
  }, [s.a260, s.naType, s.a260Dilution, s.a260Path, s.length]);

  // Copy number
  const copyResults = useMemo(() => {
    try {
      if (!(s.length > 0)) return null;
      const num = copyNumber(s.copyNg, s.length, s.naType);
      return { num, error: '' };
    } catch (e) {
      return { num: 0, error: e instanceof Error ? e.message : 'Copy number error' };
    }
  }, [s.copyNg, s.length, s.naType]);

  // Oligo mass & quantification
  const oligoResults = useMemo(() => {
    try {
      const clean = cleanNucleic(s.oligoSeq).seq;
      if (!clean) return null;
      const type = s.naType === 'ssRNA' ? 'RNA' : 'DNA';
      const mw = oligoMass(clean, type);
      const ec = oligoExtinctionCoefficient(clean, type);
      const nmol = s.oligoUg > 0 ? oligoNmol(s.oligoUg, mw) : 0;
      const resuspendConc = s.oligoResuspendConc_uM > 0 ? s.oligoResuspendConc_uM : 100;
      const resuspendUl = nmol > 0 ? (nmol / resuspendConc) * 1000 : 0;
      const nmolPerOd = ec > 0 ? 1e6 / ec : 0;
      const ugPerOd = ec > 0 ? (mw * 1e3) / ec : 0;
      const a260Quant = s.oligoA260 > 0
        ? quantifyOligoA260(s.oligoA260, clean, type, s.oligoPath || 1, s.oligoDilution || 1)
        : null;

      return {
        mw,
        ec,
        nmol,
        len: clean.length,
        resuspendConc,
        resuspendUl,
        nmolPerOd,
        ugPerOd,
        a260Quant,
        error: '',
      };
    } catch (e) {
      return {
        mw: 0,
        ec: 0,
        nmol: 0,
        len: 0,
        resuspendConc: 100,
        resuspendUl: 0,
        nmolPerOd: 0,
        ugPerOd: 0,
        a260Quant: null,
        error: e instanceof Error ? e.message : 'Oligo calculation error',
      };
    }
  }, [s.oligoSeq, s.naType, s.oligoUg, s.oligoResuspendConc_uM, s.oligoA260, s.oligoPath, s.oligoDilution]);

  // Melting temp
  const tmResults = useMemo(() => {
    try {
      const clean = cleanNucleic(s.tmSeq).seq;
      if (!clean) return null;
      const wallace = tmWallace(clean);
      const basic = tmBasic(clean);
      const nn = tmNearestNeighbour(clean, {
        primerNM: s.primerConc_nM,
        naMM: s.naConc_mM,
        mgMM: s.mgConc_mM,
        saltCorrection: s.saltModel,
      });
      return { success: true as const, wallace, basic, nn, len: clean.length };
    } catch (e) {
      return { success: false as const, error: e instanceof Error ? e.message : 'Tm calculation error' };
    }
  }, [s.tmSeq, s.primerConc_nM, s.naConc_mM, s.mgConc_mM, s.saltModel]);

  const copyText = () => {
    const lines = [`Nucleic Acids Calculator (${s.tab}):`];
    if (s.tab === 'convert' && convResults && !convResults.error) {
      lines.push(`${s.ngPerUl} ng/µL of ${s.length} bp/nt ${s.naType} = ${convResults.calculatedMolar.toFixed(2)} nM (MW ${convResults.mw.toLocaleString()} g/mol)`);
    } else if (s.tab === 'a260' && a260Results && !a260Results.error) {
      lines.push(`A260 ${s.a260} gives ${a260Results.conc.toFixed(2)} µg/mL (${a260Results.molar.toFixed(2)} nM at ${s.length} bp/nt)`);
    } else if (s.tab === 'copy' && copyResults && !copyResults.error) {
      lines.push(`${s.copyNg} ng of ${s.length} bp ${s.naType} contains ${copyResults.num.toExponential(3)} copies`);
    } else if (s.tab === 'oligo' && oligoResults && !oligoResults.error) {
      lines.push(`Oligo (${oligoResults.len} nt): MW ${oligoResults.mw.toFixed(2)} Da, ε₂₆₀ = ${oligoResults.ec.toLocaleString()} M⁻¹cm⁻¹; ${s.oligoUg} µg = ${oligoResults.nmol.toFixed(2)} nmol (${oligoResults.resuspendUl.toFixed(1)} µL for ${oligoResults.resuspendConc} µM stock)`);
    } else if (s.tab === 'tm' && tmResults && tmResults.success) {
      lines.push(`Tm for ${s.tmSeq} (${tmResults.len} nt): NN Tm = ${tmResults.nn.tm.toFixed(1)} °C, Basic Tm = ${tmResults.basic.tm.toFixed(1)} °C, Wallace Tm = ${tmResults.wallace.tm.toFixed(1)} °C`);
    }
    return `${lines.join('\n')}\n\n${scienceText(SCIENCE)}`;
  };

  return (
    <ToolLayout
      icon="🧫"
      title="Nucleic Acids Calculator"
      blurb="Conversions between mass and molar concentration, A260 quantification, copy number, exact oligo mass and thermodynamic melting temperatures."
      mobileResultSummary={
        s.tab === 'convert' && convResults ? (
          <div class="flex items-center justify-between gap-2">
            <div>
              <span class="text-[10px] text-slate-500 block">Molar Concentration</span>
              <strong class="font-mono text-base text-accent-700 dark:text-accent-300">
                {convResults.calculatedMolar >= 1000 ? `${(convResults.calculatedMolar / 1000).toFixed(2)} µM` : `${convResults.calculatedMolar.toFixed(2)} nM`}
              </strong>
            </div>
            <div class="text-right">
              <span class="text-[10px] text-slate-500 block">Approx MW</span>
              <span class="font-mono text-xs font-semibold text-slate-700 dark:text-slate-300">
                {convResults.mw >= 1e6 ? `${(convResults.mw / 1e6).toFixed(2)} MDa` : `${(convResults.mw / 1e3).toFixed(1)} kDa`}
              </span>
            </div>
          </div>
        ) : s.tab === 'a260' && a260Results ? (
          <div class="flex items-center justify-between gap-2">
            <div>
              <span class="text-[10px] text-slate-500 block">Calculated Concentration</span>
              <strong class="font-mono text-base text-accent-700 dark:text-accent-300">{a260Results.conc.toFixed(2)} ng/µL</strong>
            </div>
            {a260Results.molar > 0 && (
              <div class="text-right">
                <span class="text-[10px] text-slate-500 block">Molar</span>
                <span class="font-mono text-xs font-semibold text-slate-700 dark:text-slate-300">{a260Results.molar.toFixed(2)} nM</span>
              </div>
            )}
          </div>
        ) : s.tab === 'copy' && copyResults ? (
          <span>Copy count: <strong class="font-mono text-accent-700 dark:text-accent-300">{copyResults.num.toExponential(3)} copies</strong></span>
        ) : s.tab === 'oligo' && oligoResults ? (
          <span>Oligo MW: <strong class="font-mono">{oligoResults.mw.toFixed(1)} Da</strong> · <strong class="font-mono text-accent-700 dark:text-accent-300">{oligoResults.nmol.toFixed(2)} nmol</strong> · <span class="font-mono text-xs">ε₂₆₀ {oligoResults.ec.toLocaleString()}</span></span>
        ) : s.tab === 'tm' && tmResults && tmResults.nn ? (
          <span>Tm (Nearest Neighbor): <strong class="font-mono text-accent-700 dark:text-accent-300">{tmResults.nn.tm.toFixed(1)} °C</strong></span>
        ) : null
      }
      inputs={
        <div class="space-y-4">
          <div class="flex flex-wrap gap-2 border-b border-slate-200 pb-2 dark:border-slate-700">
            {(
              [
                ['convert', 'Mass ↔ Molar'],
                ['a260', 'A260 Quantification'],
                ['copy', 'Copy Number'],
                ['oligo', 'Oligo Mass'],
                ['tm', 'Melting Temp (Tm)'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                class={`min-h-9 rounded-lg px-3 text-sm font-medium transition ${
                  s.tab === id
                    ? 'bg-accent-600 text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'
                }`}
                onClick={() => set({ tab: id })}
              >
                {label}
              </button>
            ))}
          </div>

          <div>
            <label class="block text-sm font-medium mb-1">Nucleic Acid Type</label>
            <select
              class={FIELD}
              value={s.naType}
              onChange={e => set({ naType: (e.target as HTMLSelectElement).value as NaType })}
            >
              <option value="dsDNA">dsDNA (650 g/mol/bp)</option>
              <option value="ssDNA">ssDNA (330 g/mol/nt)</option>
              <option value="ssRNA">ssRNA (340 g/mol/nt)</option>
            </select>
          </div>

          {s.tab === 'convert' && (
            <div class="space-y-3">
              <div>
                <label class="block text-sm font-medium mb-1">Length (bp or nt)</label>
                <input
                  type="number"
                  min="1"
                  class={FIELD}
                  value={s.length}
                  onInput={e => set({ length: Math.max(1, parseInt((e.target as HTMLInputElement).value) || 1) })}
                />
              </div>

              <div>
                <label class="block text-sm font-medium mb-1">Mass Concentration (ng/µL or µg/mL)</label>
                <input
                  type="number"
                  step="any"
                  min="0"
                  class={FIELD}
                  value={s.ngPerUl}
                  onInput={e => set({ ngPerUl: Number((e.target as HTMLInputElement).value) })}
                />
              </div>
            </div>
          )}

          {s.tab === 'a260' && (
            <div class="space-y-3">
              <div>
                <label class="block text-sm font-medium mb-1">A260 Absorbance</label>
                <input
                  type="number"
                  step="0.001"
                  min="0"
                  class={FIELD}
                  value={s.a260}
                  onInput={e => set({ a260: Number((e.target as HTMLInputElement).value) })}
                />
              </div>

              <div class="grid grid-cols-2 gap-3">
                <div>
                  <label class="block text-sm font-medium mb-1">Dilution Factor</label>
                  <input
                    type="number"
                    step="1"
                    min="1"
                    class={FIELD}
                    value={s.a260Dilution}
                    onInput={e => set({ a260Dilution: Number((e.target as HTMLInputElement).value) })}
                  />
                </div>
                <div>
                  <label class="block text-sm font-medium mb-1">Path Length (cm)</label>
                  <input
                    type="number"
                    step="0.1"
                    min="0.01"
                    class={FIELD}
                    value={s.a260Path}
                    onInput={e => set({ a260Path: Number((e.target as HTMLInputElement).value) })}
                  />
                </div>
              </div>

              <div>
                <label class="block text-sm font-medium mb-1">Length for Molarity (optional)</label>
                <input
                  type="number"
                  min="1"
                  class={FIELD}
                  value={s.length}
                  onInput={e => set({ length: Number((e.target as HTMLInputElement).value) })}
                />
              </div>
            </div>
          )}

          {s.tab === 'copy' && (
            <div class="space-y-3">
              <div>
                <label class="block text-sm font-medium mb-1">Length (bp or nt)</label>
                <input
                  type="number"
                  min="1"
                  class={FIELD}
                  value={s.length}
                  onInput={e => set({ length: Math.max(1, parseInt((e.target as HTMLInputElement).value) || 1) })}
                />
              </div>

              <div>
                <label class="block text-sm font-medium mb-1">Mass (ng)</label>
                <input
                  type="number"
                  step="any"
                  min="0"
                  class={FIELD}
                  value={s.copyNg}
                  onInput={e => set({ copyNg: Number((e.target as HTMLInputElement).value) })}
                />
              </div>
            </div>
          )}

          {s.tab === 'oligo' && (
            <div class="space-y-3">
              <div>
                <label class="block text-sm font-medium mb-1">Oligo Sequence (5′ → 3′)</label>
                <textarea
                  rows={3}
                  class={`${FIELD} mono`}
                  value={s.oligoSeq}
                  onInput={e => set({ oligoSeq: (e.target as HTMLTextAreaElement).value })}
                />
              </div>

              <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label class="block text-sm font-medium mb-1">Mass (µg)</label>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    class={FIELD}
                    value={s.oligoUg}
                    onInput={e => set({ oligoUg: Number((e.target as HTMLInputElement).value) })}
                  />
                </div>
                <div>
                  <label class="block text-sm font-medium mb-1">Stock Target Conc (µM)</label>
                  <input
                    type="number"
                    step="any"
                    min="0.1"
                    class={FIELD}
                    value={s.oligoResuspendConc_uM ?? 100}
                    onInput={e => set({ oligoResuspendConc_uM: Number((e.target as HTMLInputElement).value) })}
                  />
                </div>
              </div>

              <div class="rounded-lg border border-slate-200 p-3 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/40">
                <span class="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
                  Optional A260 Spectrophotometry (NanoDrop / UV)
                </span>
                <div class="grid grid-cols-3 gap-2">
                  <div>
                    <label class="block text-xs text-slate-500 mb-1">A260</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      class={FIELD}
                      value={s.oligoA260 ?? 0}
                      onInput={e => set({ oligoA260: Number((e.target as HTMLInputElement).value) })}
                    />
                  </div>
                  <div>
                    <label class="block text-xs text-slate-500 mb-1">Dilution</label>
                    <input
                      type="number"
                      step="1"
                      min="1"
                      class={FIELD}
                      value={s.oligoDilution ?? 1}
                      onInput={e => set({ oligoDilution: Number((e.target as HTMLInputElement).value) })}
                    />
                  </div>
                  <div>
                    <label class="block text-xs text-slate-500 mb-1">Path (cm)</label>
                    <input
                      type="number"
                      step="0.1"
                      min="0.01"
                      class={FIELD}
                      value={s.oligoPath ?? 1.0}
                      onInput={e => set({ oligoPath: Number((e.target as HTMLInputElement).value) })}
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {s.tab === 'tm' && (
            <div class="space-y-3">
              <div>
                <label class="block text-sm font-medium mb-1">Primer / Oligo Sequence (5′ → 3′)</label>
                <textarea
                  rows={2}
                  class={`${FIELD} mono`}
                  value={s.tmSeq}
                  onInput={e => set({ tmSeq: (e.target as HTMLTextAreaElement).value })}
                />
              </div>

              <div class="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <div>
                  <label class="block text-xs font-medium mb-1">Oligo Conc (nM)</label>
                  <input
                    type="number"
                    min="1"
                    class={FIELD}
                    value={s.primerConc_nM}
                    onInput={e => set({ primerConc_nM: Number((e.target as HTMLInputElement).value) })}
                  />
                </div>
                <div>
                  <label class="block text-xs font-medium mb-1">Na⁺ / Monovalent (mM)</label>
                  <input
                    type="number"
                    min="0"
                    class={FIELD}
                    value={s.naConc_mM}
                    onInput={e => set({ naConc_mM: Number((e.target as HTMLInputElement).value) })}
                  />
                </div>
                <div>
                  <label class="block text-xs font-medium mb-1">Mg²⁺ (mM)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.5"
                    class={FIELD}
                    value={s.mgConc_mM}
                    onInput={e => set({ mgConc_mM: Number((e.target as HTMLInputElement).value) })}
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      }
      results={
        <div class="space-y-4">
          {s.tab === 'convert' && convResults && (
            <div class="space-y-4" data-testid="nucleic-convert-result">
              {convResults.error ? (
                <div role="alert" class="text-red-600">{convResults.error}</div>
              ) : (
                <div class="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  <div class="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
                    <div class="text-xs text-slate-500">Molar Concentration</div>
                    <div class="mono text-2xl font-bold text-accent-600">
                      {convResults.calculatedMolar >= 1000
                        ? `${(convResults.calculatedMolar / 1000).toFixed(2)} µM`
                        : `${convResults.calculatedMolar.toFixed(2)} nM`}
                    </div>
                  </div>

                  <div class="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
                    <div class="text-xs text-slate-500">Mass Concentration</div>
                    <div class="mono text-2xl font-bold">
                      {s.ngPerUl} ng/µL
                    </div>
                    <div class="text-xs text-slate-500">(= µg/mL)</div>
                  </div>

                  <div class="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
                    <div class="text-xs text-slate-500">Estimated MW</div>
                    <div class="mono text-lg font-bold">
                      {(convResults.mw / 1000).toFixed(1)} kDa
                    </div>
                    <div class="text-xs text-slate-500">{convResults.mw.toLocaleString()} g/mol</div>
                  </div>
                </div>
              )}
            </div>
          )}

          {s.tab === 'a260' && a260Results && (
            <div class="space-y-4" data-testid="nucleic-a260-result">
              {a260Results.error ? (
                <div role="alert" class="text-red-600">{a260Results.error}</div>
              ) : (
                <div class="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  <div class="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
                    <div class="text-xs text-slate-500">Concentration</div>
                    <div class="mono text-2xl font-bold text-accent-600">
                      {a260Results.conc.toFixed(2)} ng/µL
                    </div>
                    <div class="text-xs text-slate-500">({(a260Results.conc / 1000).toFixed(3)} mg/mL)</div>
                  </div>

                  {a260Results.molar > 0 && (
                    <div class="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
                      <div class="text-xs text-slate-500">Molar Concentration</div>
                      <div class="mono text-2xl font-bold">
                        {a260Results.molar >= 1000
                          ? `${(a260Results.molar / 1000).toFixed(2)} µM`
                          : `${a260Results.molar.toFixed(2)} nM`}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {s.tab === 'copy' && copyResults && (
            <div class="space-y-4" data-testid="nucleic-copy-result">
              {copyResults.error ? (
                <div role="alert" class="text-red-600">{copyResults.error}</div>
              ) : (
                <div class="rounded-xl border border-slate-200 p-4 dark:border-slate-700">
                  <div class="text-xs text-slate-500">Calculated Copies</div>
                  <div class="mono text-3xl font-bold text-accent-600 mt-1">
                    {copyResults.num.toExponential(3)}
                  </div>
                  <div class="text-xs text-slate-500 mt-2">
                    in {s.copyNg} ng of {s.length} bp/nt {s.naType}
                  </div>
                </div>
              )}
            </div>
          )}

          {s.tab === 'oligo' && oligoResults && (
            <div class="space-y-4" data-testid="nucleic-oligo-result">
              {oligoResults.error ? (
                <div role="alert" class="text-red-600">{oligoResults.error}</div>
              ) : (
                <div class="space-y-3">
                  <div class="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    <div class="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
                      <div class="text-xs text-slate-500">Exact Anhydrous MW</div>
                      <div class="mono text-2xl font-bold text-accent-600">
                        {oligoResults.mw.toFixed(2)} Da
                      </div>
                      <div class="text-xs text-slate-500">5′-OH / 3′-OH free acid</div>
                    </div>

                    <div class="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
                      <div class="text-xs text-slate-500">Extinction Coeff (ε₂₆₀)</div>
                      <div class="mono text-2xl font-bold text-accent-600">
                        {oligoResults.ec.toLocaleString()}
                      </div>
                      <div class="text-xs text-slate-500">M⁻¹ cm⁻¹ (nearest-neighbor)</div>
                    </div>

                    <div class="rounded-xl border border-slate-200 p-3 dark:border-slate-700 col-span-2 sm:col-span-1">
                      <div class="text-xs text-slate-500">Quantity from Mass</div>
                      <div class="mono text-2xl font-bold">
                        {oligoResults.nmol.toFixed(2)} nmol
                      </div>
                      <div class="text-xs text-slate-500">from {s.oligoUg} µg ({oligoResults.len} nt)</div>
                    </div>
                  </div>

                  <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div class="rounded-xl border border-accent-300 bg-accent-50/40 p-3 dark:border-accent-800 dark:bg-accent-950/20">
                      <div class="text-xs font-semibold text-accent-700 dark:text-accent-300">
                        Stock Resuspension ({oligoResults.resuspendConc} µM)
                      </div>
                      <div class="mono text-2xl font-bold text-accent-600 mt-1">
                        {oligoResults.resuspendUl.toFixed(1)} µL
                      </div>
                      <div class="text-xs text-slate-600 dark:text-slate-400 mt-1">
                        Add {oligoResults.resuspendUl.toFixed(1)} µL buffer (TE or sterile H₂O) to dissolve {s.oligoUg} µg ({oligoResults.nmol.toFixed(2)} nmol)
                      </div>
                    </div>

                    <div class="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
                      <div class="text-xs text-slate-500">OD₂₆₀ Conversion Factors</div>
                      <div class="mono text-base font-semibold mt-1">
                        1 OD₂₆₀ = {oligoResults.nmolPerOd.toFixed(2)} nmol
                      </div>
                      <div class="mono text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                        1 OD₂₆₀ = {oligoResults.ugPerOd.toFixed(2)} µg (in 1.0 mL)
                      </div>
                    </div>
                  </div>

                  {oligoResults.a260Quant && (
                    <div class="rounded-xl border border-emerald-300 bg-emerald-50/30 p-3 dark:border-emerald-800 dark:bg-emerald-950/20">
                      <div class="text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                        Spectrophotometric A260 Concentration ({s.oligoA260} AU)
                      </div>
                      <div class="grid grid-cols-2 gap-2 mt-2">
                        <div>
                          <div class="text-xs text-slate-500">Molar Concentration</div>
                          <div class="mono text-lg font-bold text-emerald-600 dark:text-emerald-400">
                            {oligoResults.a260Quant.molarConcUM.toFixed(2)} µM
                          </div>
                        </div>
                        <div>
                          <div class="text-xs text-slate-500">Mass Concentration</div>
                          <div class="mono text-lg font-bold text-emerald-600 dark:text-emerald-400">
                            {oligoResults.a260Quant.massConcUgPerMl.toFixed(2)} µg/mL (ng/µL)
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {s.tab === 'tm' && tmResults && (
            <div class="space-y-4" data-testid="nucleic-tm-result">
              {!tmResults.success ? (
                <div role="alert" class="text-red-600">{tmResults.error}</div>
              ) : (
                <div class="space-y-4">
                  <div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <div class="rounded-xl border border-accent-300 bg-accent-50/30 p-3 dark:border-accent-800 dark:bg-accent-950/20">
                      <div class="text-xs font-semibold text-accent-700 dark:text-accent-300">
                        Nearest-Neighbour Tm
                      </div>
                      <div class="mono text-3xl font-bold text-accent-600 mt-1">
                        {Number.isFinite(tmResults.nn.tm) ? `${tmResults.nn.tm.toFixed(1)} °C` : '—'}
                      </div>
                      <div class="text-xs text-slate-500 mt-1">
                        SantaLucia 1998 ({s.saltModel})
                      </div>
                    </div>

                    <div class="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
                      <div class="text-xs text-slate-500">Basic Marmur Tm</div>
                      <div class="mono text-2xl font-bold mt-1">
                        {Number.isFinite(tmResults.basic.tm) ? `${tmResults.basic.tm.toFixed(1)} °C` : '—'}
                      </div>
                      <div class="text-xs text-slate-500 mt-1">Valid for N ≥ 14</div>
                    </div>

                    <div class="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
                      <div class="text-xs text-slate-500">Wallace Rule Tm</div>
                      <div class="mono text-2xl font-bold mt-1">
                        {Number.isFinite(tmResults.wallace.tm) ? `${tmResults.wallace.tm.toFixed(1)} °C` : '—'}
                      </div>
                      <div class="text-xs text-slate-500 mt-1">2(A+T) + 4(G+C), N &lt; 14</div>
                    </div>
                  </div>

                  {tmResults.nn.warnings.length > 0 && (
                    <div class="rounded-lg bg-amber-50 p-3 text-xs text-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
                      {tmResults.nn.warnings.join(' ')}
                    </div>
                  )}
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
