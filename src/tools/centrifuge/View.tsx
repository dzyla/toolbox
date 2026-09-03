import { useMemo } from 'preact/hooks';
import { CentrifugeError, kFactor, rcf, rpm, runTime } from '@/core/centrifuge';
import { toSI, UnitError } from '@/core/units';
import { Quantity, type QValue } from '@/app/components/Quantity';
import { ActionBar } from '@/app/components/ActionBar';
import { SciencePanel, scienceText } from '@/app/components/SciencePanel';
import { ToolLayout } from '@/app/components/ToolLayout';
import { useUrlState } from '@/lib/url-state';
import { SCIENCE } from './science';

interface State {
  solve: 'rcf' | 'rpm'; radius: QValue; speed: number; force: number;
  kSpeed: number; rmin: QValue; rmax: QValue; sedimentation: number;
}
const DEFAULTS: State = {
  solve: 'rcf', radius: { value: 100, unit: 'mm' }, speed: 10_000, force: 11_180,
  kSpeed: 50_000, rmin: { value: 35.9, unit: 'mm' }, rmax: { value: 91.9, unit: 'mm' }, sedimentation: 100,
};
const fieldClass = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900';
const mm = (value: QValue) => toSI(value) * 1000;

export default function View() {
  const [state, shareUrl] = useUrlState<State>('centrifuge', DEFAULTS);
  const s = state.value;
  const set = (patch: Partial<State>) => { state.value = { ...state.value, ...patch }; };
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
    `Centrifuge: ${primaryText}`,
    `Rotor k-factor: ${Number(calculation.k!.toPrecision(4))}`,
    `Estimated pelleting time: ${Number(calculation.time!.toPrecision(4))} h`, '', scienceText(SCIENCE),
  ].join('\n');

  return <ToolLayout icon="🌀" title="Centrifuge" blurb="Convert RPM and RCF, estimate rotor k-factor and pelleting time."
    inputs={<>
      <div class="flex gap-2"><button type="button" aria-pressed={s.solve === 'rcf'} onClick={() => set({ solve: 'rcf' })}
        class={`rounded-full px-3 py-1 text-sm ${s.solve === 'rcf' ? 'bg-accent-600 text-white' : 'border border-slate-300 dark:border-slate-700'}`}>Calculate RCF</button>
        <button type="button" aria-pressed={s.solve === 'rpm'} onClick={() => set({ solve: 'rpm' })}
          class={`rounded-full px-3 py-1 text-sm ${s.solve === 'rpm' ? 'bg-accent-600 text-white' : 'border border-slate-300 dark:border-slate-700'}`}>Calculate RPM</button></div>
      <Quantity id="centrifuge-radius" label="Rotor radius" value={s.radius} units={['mm', 'cm']} onChange={radius => set({ radius })} />
      {s.solve === 'rcf' ? <label><span class="mb-1 block text-sm font-medium">Speed (RPM)</span><input aria-label="Speed (RPM)" type="number" min="1" value={s.speed}
        onInput={event => set({ speed: Number((event.target as HTMLInputElement).value) })} class={fieldClass} /></label>
        : <label><span class="mb-1 block text-sm font-medium">Force (RCF / × g)</span><input aria-label="Force (RCF / × g)" type="number" min="1" value={s.force}
          onInput={event => set({ force: Number((event.target as HTMLInputElement).value) })} class={fieldClass} /></label>}
      <fieldset class="space-y-3 rounded-xl border border-slate-200 p-3 dark:border-slate-700"><legend class="px-1 text-sm font-semibold">k-factor and pelleting time</legend>
        <label><span class="mb-1 block text-sm font-medium">Rotor speed (RPM)</span><input type="number" min="1" value={s.kSpeed}
          onInput={event => set({ kSpeed: Number((event.target as HTMLInputElement).value) })} class={fieldClass} /></label>
        <div class="grid gap-3 sm:grid-cols-2"><Quantity id="centrifuge-rmin" label="Minimum radius" value={s.rmin} units={['mm', 'cm']} onChange={rmin => set({ rmin })} />
          <Quantity id="centrifuge-rmax" label="Maximum radius" value={s.rmax} units={['mm', 'cm']} onChange={rmax => set({ rmax })} /></div>
        <label><span class="mb-1 block text-sm font-medium">Sedimentation coefficient (S)</span><input type="number" min="0" step="any" value={s.sedimentation}
          onInput={event => set({ sedimentation: Number((event.target as HTMLInputElement).value) })} class={fieldClass} /></label>
      </fieldset>
    </>}
    results={calculation.error ? <p role="alert" class="text-red-600">{calculation.error}</p> : <div class="space-y-4">
      <div><p class="text-sm text-slate-500">{s.solve === 'rcf' ? 'Relative centrifugal force' : 'Required speed'}</p><p data-testid="centrifuge-result" class="font-mono text-2xl font-bold">{primaryText}</p></div>
      <div class="grid grid-cols-2 gap-3"><div class="rounded-xl bg-slate-50 p-3 dark:bg-slate-800"><p class="text-xs text-slate-500">Rotor k-factor</p><p data-testid="k-result" class="font-mono text-xl">{Number(calculation.k!.toPrecision(4))}</p></div>
        <div class="rounded-xl bg-slate-50 p-3 dark:bg-slate-800"><p class="text-xs text-slate-500">Pelleting time</p><p class="font-mono text-xl">{Number(calculation.time!.toPrecision(3))} h</p></div></div>
    </div>}
    actions={<ActionBar onCopy={() => copyText} shareUrl={shareUrl} />}
    science={<SciencePanel science={SCIENCE} />} />;
}
