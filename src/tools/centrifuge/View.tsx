import { useMemo } from 'preact/hooks';
import { CentrifugeError, kFactor, rcf, rpm, runTime } from '@/core/centrifuge';
import { toSI, UnitError } from '@/core/units';
import { Quantity, type QValue } from '@/app/components/Quantity';
import { ActionBar } from '@/app/components/ActionBar';
import { SciencePanel, scienceText } from '@/app/components/SciencePanel';
import { ToolLayout } from '@/app/components/ToolLayout';
import { useUrlState } from '@/lib/url-state';
import { SCIENCE } from './science';
import rotorsData from '@/data/rotors.json';

export interface RotorProfile {
  id: string;
  manufacturer: string;
  model: string;
  category: string;
  maxRpm: number;
  maxRcf: number;
  rminMm: number;
  rmaxMm: number;
  ravgMm: number;
  kFactor?: number;
  tubeCapacity: string;
  notes?: string;
}

const ROTORS = rotorsData as RotorProfile[];

interface State {
  solve: 'rcf' | 'rpm';
  rotorId: string;
  radius: QValue;
  speed: number;
  force: number;
  kSpeed: number;
  rmin: QValue;
  rmax: QValue;
  sedimentation: number;
}

const DEFAULTS: State = {
  solve: 'rcf',
  rotorId: '',
  radius: { value: 100, unit: 'mm' },
  speed: 10_000,
  force: 11_180,
  kSpeed: 50_000,
  rmin: { value: 35.9, unit: 'mm' },
  rmax: { value: 91.9, unit: 'mm' },
  sedimentation: 100,
};

const fieldClass = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900';
const mm = (value: QValue) => toSI(value) * 1000;

export default function View() {
  const [state, shareUrl] = useUrlState<State>('centrifuge', DEFAULTS);
  const s = state.value;
  const set = (patch: Partial<State>) => { state.value = { ...state.value, ...patch }; };

  const selectedRotor = useMemo(() => ROTORS.find(r => r.id === s.rotorId) || null, [s.rotorId]);

  function handleSelectRotor(id: string) {
    set({ rotorId: id });
    const r = ROTORS.find(item => item.id === id);
    if (r) {
      set({
        radius: { value: r.rmaxMm, unit: 'mm' },
        rmin: { value: r.rminMm, unit: 'mm' },
        rmax: { value: r.rmaxMm, unit: 'mm' },
        speed: Math.min(s.speed || r.maxRpm, r.maxRpm),
        kSpeed: r.maxRpm,
      });
    }
  }

  const calculation = useMemo(() => {
    try {
      const primary = s.solve === 'rcf' ? rcf(s.speed, mm(s.radius)) : rpm(s.force, mm(s.radius));
      const k = kFactor(s.kSpeed, mm(s.rmax), mm(s.rmin));
      return { primary, k, time: runTime(k, s.sedimentation) };
    } catch (error) {
      if (error instanceof CentrifugeError || error instanceof UnitError) return { error: error.message };
      throw error;
    }
  }, [s]);

  const primaryText = calculation.error ? '' : s.solve === 'rcf'
    ? `${Math.round(calculation.primary!).toLocaleString('en-US')} × g`
    : `${Math.round(calculation.primary!).toLocaleString('en-US')} RPM`;

  const copyText = calculation.error ? calculation.error : [
    selectedRotor ? `Rotor: ${selectedRotor.manufacturer} ${selectedRotor.model}` : '',
    `Centrifuge: ${primaryText}`,
    `Rotor k-factor: ${Number(calculation.k!.toPrecision(4))}`,
    `Estimated pelleting time: ${Number(calculation.time!.toPrecision(4))} h`, '', scienceText(SCIENCE),
  ].filter(Boolean).join('\n');

  // Group rotors by category for select dropdown
  const rotorCategories = useMemo(() => {
    const map = new Map<string, RotorProfile[]>();
    for (const r of ROTORS) {
      const list = map.get(r.category) || [];
      list.push(r);
      map.set(r.category, list);
    }
    return Array.from(map.entries());
  }, []);

  const isOverSpeed = selectedRotor && (s.solve === 'rcf' ? s.speed > selectedRotor.maxRpm : calculation.primary && calculation.primary > selectedRotor.maxRpm);

  return (
    <ToolLayout
      icon="🌀"
      title="Centrifuge & Rotor Calculator"
      blurb="Convert RPM and RCF, browse Beckman & ultracentrifuge rotors, estimate k-factor and pelleting time."
      mobileResultSummary={
        calculation.error ? (
          <span class="text-rose-600 dark:text-rose-400 font-semibold">{calculation.error}</span>
        ) : (
          <div class="flex items-center justify-between gap-2">
            <div>
              <span class="text-[10px] text-slate-500 block">{s.solve === 'rcf' ? 'Centrifugal Force' : 'Speed'}</span>
              <strong class="font-mono text-base text-accent-700 dark:text-accent-300">{primaryText}</strong>
            </div>
            <div class="text-right">
              <span class="text-[10px] text-slate-500 block">k-factor / Pelleting</span>
              <span class="font-mono text-xs font-semibold text-slate-700 dark:text-slate-300">
                k={Number(calculation.k!.toPrecision(3))} · {Number(calculation.time!.toPrecision(2))} h
              </span>
            </div>
          </div>
        )
      }
      inputs={
        <>
          <div class="flex gap-2">
            <button
              type="button"
              aria-pressed={s.solve === 'rcf'}
              onClick={() => set({ solve: 'rcf' })}
              class={`rounded-full px-3 py-1.5 text-xs sm:text-sm font-semibold transition ${s.solve === 'rcf' ? 'bg-accent-600 text-white shadow-xs' : 'border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
            >
              Calculate RCF (× g)
            </button>
            <button
              type="button"
              aria-pressed={s.solve === 'rpm'}
              onClick={() => set({ solve: 'rpm' })}
              class={`rounded-full px-3 py-1.5 text-xs sm:text-sm font-semibold transition ${s.solve === 'rpm' ? 'bg-accent-600 text-white shadow-xs' : 'border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
            >
              Calculate RPM
            </button>
          </div>

          {/* Rotor Preset Selector */}
          <div class="space-y-1.5 rounded-xl border border-slate-200 bg-slate-50/50 p-3 dark:border-slate-800 dark:bg-slate-900/50">
            <label for="rotor-select" class="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
              Rotor Profile (Beckman & Ultra)
            </label>
            <select
              id="rotor-select"
              aria-label="Rotor Profile (Beckman & Ultra)"
              value={s.rotorId}
              onChange={(e) => handleSelectRotor((e.target as HTMLSelectElement).value)}
              class={fieldClass}
            >
              <option value="">Custom Rotor (Manual Radii)</option>
              {rotorCategories.map(([category, list]) => (
                <optgroup key={category} label={category}>
                  {list.map(r => (
                    <option key={r.id} value={r.id}>
                      {r.manufacturer} {r.model} ({r.tubeCapacity}) — max {r.maxRpm.toLocaleString()} RPM
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>

            {selectedRotor && (
              <div class="mt-2 text-xs space-y-1 text-slate-600 dark:text-slate-400 bg-white dark:bg-slate-800 p-2.5 rounded-lg border border-slate-200 dark:border-slate-700">
                <div class="flex items-center justify-between font-semibold text-slate-900 dark:text-slate-100">
                  <span>{selectedRotor.model}</span>
                  <span class="text-accent-600 dark:text-accent-400 font-mono">{selectedRotor.maxRcf.toLocaleString()} × g max</span>
                </div>
                <div class="grid grid-cols-2 gap-1 text-[11px]">
                  <span>Capacity: <strong class="text-slate-800 dark:text-slate-200">{selectedRotor.tubeCapacity}</strong></span>
                  <span>Max Speed: <strong class="text-slate-800 dark:text-slate-200">{selectedRotor.maxRpm.toLocaleString()} RPM</strong></span>
                  <span>r_min: <strong class="mono">{selectedRotor.rminMm} mm</strong></span>
                  <span>r_max: <strong class="mono">{selectedRotor.rmaxMm} mm</strong></span>
                  {selectedRotor.kFactor && (
                    <span class="col-span-2">Nominal k-factor: <strong class="mono text-emerald-600 dark:text-emerald-400">{selectedRotor.kFactor}</strong></span>
                  )}
                </div>
                {selectedRotor.notes && (
                  <p class="text-[11px] text-slate-500 italic pt-1 border-t border-slate-100 dark:border-slate-700">
                    {selectedRotor.notes}
                  </p>
                )}
              </div>
            )}
          </div>

          <Quantity id="centrifuge-radius" label="Rotor radius (r_max or r_avg)" value={s.radius} units={['mm', 'cm']} onChange={radius => set({ radius })} />

          {s.solve === 'rcf' ? (
            <div>
              <label class="block">
                <span class="mb-1 block text-sm font-medium">Speed (RPM)</span>
                <input
                  aria-label="Speed (RPM)"
                  type="number"
                  min="1"
                  value={s.speed}
                  onInput={event => set({ speed: Number((event.target as HTMLInputElement).value) })}
                  class={fieldClass}
                />
              </label>
              <div class="mt-2 flex flex-wrap items-center gap-1.5">
                <span class="text-[11px] text-slate-400 font-medium mr-0.5">Presets:</span>
                {[1000, 3000, 5000, 10000, 14000, 16000].map(rpmVal => (
                  <button
                    key={rpmVal}
                    type="button"
                    onClick={() => set({ speed: rpmVal })}
                    class={`rounded-md px-2 py-0.5 text-xs font-mono transition border ${s.speed === rpmVal ? 'bg-accent-600 text-white border-accent-600' : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'}`}
                  >
                    {rpmVal.toLocaleString()}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div>
              <label class="block">
                <span class="mb-1 block text-sm font-medium">Force (RCF / × g)</span>
                <input
                  aria-label="Force (RCF / × g)"
                  type="number"
                  min="1"
                  value={s.force}
                  onInput={event => set({ force: Number((event.target as HTMLInputElement).value) })}
                  class={fieldClass}
                />
              </label>
              <div class="mt-2 flex flex-wrap items-center gap-1.5">
                <span class="text-[11px] text-slate-400 font-medium mr-0.5">Presets:</span>
                {[300, 1000, 3000, 10000, 14000, 20000].map(rcfVal => (
                  <button
                    key={rcfVal}
                    type="button"
                    onClick={() => set({ force: rcfVal })}
                    class={`rounded-md px-2 py-0.5 text-xs font-mono transition border ${s.force === rcfVal ? 'bg-accent-600 text-white border-accent-600' : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'}`}
                  >
                    {rcfVal.toLocaleString()} × g
                  </button>
                ))}
              </div>
            </div>
          )}

          {isOverSpeed && (
            <div class="rounded-lg bg-amber-50 p-2.5 text-xs text-amber-900 border border-amber-300 dark:bg-amber-950 dark:text-amber-200 dark:border-amber-700 flex items-center gap-2">
              <span>⚠️</span>
              <span>
                Speed exceeds manufacturer rating for {selectedRotor?.model} ({selectedRotor?.maxRpm.toLocaleString()} RPM).
              </span>
            </div>
          )}

          <fieldset class="space-y-3 rounded-xl border border-slate-200 p-3 dark:border-slate-700">
            <legend class="px-1 text-sm font-semibold">k-factor and pelleting time</legend>
            <label>
              <span class="mb-1 block text-sm font-medium">Rotor speed for k-factor (RPM)</span>
              <input
                type="number"
                min="1"
                value={s.kSpeed}
                onInput={event => set({ kSpeed: Number((event.target as HTMLInputElement).value) })}
                class={fieldClass}
              />
            </label>
            <div class="grid gap-3 sm:grid-cols-2">
              <Quantity id="centrifuge-rmin" label="Minimum radius (r_min)" value={s.rmin} units={['mm', 'cm']} onChange={rmin => set({ rmin })} />
              <Quantity id="centrifuge-rmax" label="Maximum radius (r_max)" value={s.rmax} units={['mm', 'cm']} onChange={rmax => set({ rmax })} />
            </div>
            <label>
              <span class="mb-1 block text-sm font-medium">Sedimentation coefficient (S / Svedberg)</span>
              <input
                type="number"
                min="0"
                step="any"
                value={s.sedimentation}
                onInput={event => set({ sedimentation: Number((event.target as HTMLInputElement).value) })}
                class={fieldClass}
              />
            </label>
          </fieldset>
        </>
      }
      results={
        calculation.error ? (
          <p role="alert" class="text-red-600">{calculation.error}</p>
        ) : (
          <div class="space-y-4">
            <div>
              <p class="text-sm text-slate-500">{s.solve === 'rcf' ? 'Relative centrifugal force' : 'Required speed'}</p>
              <p data-testid="centrifuge-result" class="font-mono text-2xl font-bold">{primaryText}</p>
            </div>
            <div class="grid grid-cols-2 gap-3">
              <div class="rounded-xl bg-slate-50 p-3 dark:bg-slate-800">
                <p class="text-xs text-slate-500">Rotor k-factor</p>
                <p data-testid="k-result" class="font-mono text-xl font-bold">{Number(calculation.k!.toPrecision(4))}</p>
              </div>
              <div class="rounded-xl bg-slate-50 p-3 dark:bg-slate-800">
                <p class="text-xs text-slate-500">Estimated pelleting time</p>
                <p class="font-mono text-xl font-bold">{Number(calculation.time!.toPrecision(3))} h</p>
              </div>
            </div>
            {selectedRotor && (
              <div class="text-xs text-slate-500 bg-slate-50 dark:bg-slate-800/60 p-2.5 rounded-lg">
                Selected: <strong class="text-slate-800 dark:text-slate-200">{selectedRotor.manufacturer} {selectedRotor.model}</strong> ({selectedRotor.tubeCapacity}) · {selectedRotor.category}
              </div>
            )}
          </div>
        )
      }
      actions={<ActionBar onCopy={() => copyText} shareUrl={shareUrl} />}
      science={<SciencePanel science={SCIENCE} />}
    />
  );
}
