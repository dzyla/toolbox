import { Quantity, type QValue } from '@/app/components/Quantity';
import { NumberField } from './ui';

export function ConditionsBar({ volume, workingTemp_C, ionicCorrection, onVolume, onTemp, onIonic }: {
  volume: QValue; workingTemp_C: number; ionicCorrection: boolean;
  onVolume: (v: QValue) => void; onTemp: (t: number) => void; onIonic: (on: boolean) => void;
}) {
  return (
    <div class="grid grid-cols-1 items-end gap-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 sm:grid-cols-2">
      <Quantity id="buffer-volume" label="Final Volume" value={volume} units={['L', 'mL']} onChange={onVolume} />
      <NumberField label="Working temperature (°C)" value={workingTemp_C} onValue={onTemp} />
      <label class="flex items-center gap-2 sm:col-span-2 text-xs font-medium text-slate-700 dark:text-slate-300">
        <input type="checkbox" aria-label="Ionic-strength correction" checked={ionicCorrection} onChange={e => onIonic((e.target as HTMLInputElement).checked)} class="h-4 w-4 accent-accent-600" />
        Ionic-strength correction
      </label>
    </div>
  );
}
