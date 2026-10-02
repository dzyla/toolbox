import type { MixtureResult } from '@/core/buffers/mixture';
import { toSI } from '@/core/units';
import type { QValue } from '@/app/components/Quantity';
import { displayAmount, ionicStrengthLines } from '../recipe-text';
import type { EditorComponent } from '../state';

export interface RecipeSheetProps {
  result: MixtureResult; components: EditorComponent[]; volume: QValue; workingTemp_C: number;
  checked: Record<string, boolean>; onToggle: (key: string) => void;
}

export function prepSteps(result: MixtureResult, volume: QValue, volumeL: number, workingTemp_C: number): string[] {
  const titrated = result.buffers.filter(b => b.titrantEquiv !== undefined && Math.abs(b.titrantEquiv) > 1e-9);
  const steps = [
    `Add ~80% of final volume of purified water (${Math.round(volumeL * 800)} mL) to a beaker.`,
    'Weigh out or pipette each component listed above and dissolve with magnetic stirring.',
  ];
  if (titrated.length > 0) {
    const where = [...new Set(titrated.map(b => b.setTemp_C))].map(t => `${t} °C`).join(' / ');
    steps.push(`Add the listed acid or base while watching a pH meter calibrated at ${where}. The volume is an estimate; stop at the target pH.`);
  } else if (result.buffers.length === 0) {
    steps.push('If the recipe specifies a pH, adjust with concentrated HCl or NaOH.');
  }
  steps.push(`Transfer to a graduated cylinder, bring to final volume (${volume.value} ${volume.unit}) with water${workingTemp_C < 15 ? ' (cool the solution to its working temperature first)' : ''}, and sterile filter (0.22 µm) or autoclave as appropriate.`);
  return steps;
}

export function RecipeSheet({ result, components, volume, workingTemp_C, checked, onToggle }: RecipeSheetProps) {
  const volumeL = toSI(volume);
  const ionicLines = ionicStrengthLines(result);
  return (
    <div data-testid="buffer-results" class="space-y-5">
      <div class="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <div class="flex flex-wrap items-baseline justify-between gap-2 border-b border-slate-100 pb-3 dark:border-slate-800">
          <div>
            <h2 class="text-lg font-bold text-slate-900 dark:text-slate-100">Preparation Protocol — {volume.value} {volume.unit}</h2>
            <p class="text-xs text-slate-500 dark:text-slate-400">Weigh and dissolve each component in order into purified water</p>
          </div>
          <span class="rounded-full bg-accent-50 px-3 py-1 text-xs font-semibold text-accent-700 dark:bg-accent-950 dark:text-accent-300">
            {components.length} Components
          </span>
        </div>

        <ul class="divide-y divide-slate-100 dark:divide-slate-800" aria-label="Weigh-out list">
          {result.rows.map((row, idx) => {
            const comp = components[row.componentIndex];
            const key = `${idx}:${row.name}`;
            const isChecked = !!checked[key];
            const report = result.buffers.find(b => b.componentIndex === row.componentIndex);
            return (
              <li
                key={key}
                onClick={() => onToggle(key)}
                class={`flex cursor-pointer flex-wrap items-center justify-between gap-3 rounded-xl border px-2 py-3 transition ${isChecked ? 'border-emerald-200 bg-emerald-50/50 opacity-60 dark:border-emerald-800/60 dark:bg-emerald-950/20' : 'border-transparent hover:bg-slate-50/70 dark:hover:bg-slate-800/30'}`}
              >
                <div class="flex items-center gap-3">
                  <input
                    type="checkbox"
                    aria-label={`${row.name} added`}
                    checked={isChecked}
                    onChange={() => onToggle(key)}
                    onClick={e => e.stopPropagation()}
                    class="h-4 w-4 shrink-0 cursor-pointer rounded accent-emerald-600"
                  />
                  <div class="space-y-0.5">
                    <h4 class={`text-base font-bold transition ${isChecked ? 'text-slate-500 line-through dark:text-slate-400' : 'text-slate-900 dark:text-slate-100'}`}>{row.name}</h4>
                    <div class="flex flex-wrap items-center gap-x-2 text-xs text-slate-500 dark:text-slate-400">
                      {row.role === 'titrant' && <span>pH adjustment · approximate</span>}
                      {row.role === 'component' && comp && (
                        <span>Target: <strong class="text-slate-700 dark:text-slate-300">{comp.target.value} {comp.target.unit}</strong></span>
                      )}
                      {row.role === 'component' && comp?.kind === 'solid' && comp.mw && <span>· MW {comp.mw.toFixed(2)} g/mol</span>}
                      {row.role === 'component' && comp?.kind === 'stock' && <span>· Stock: {comp.stockConc} {comp.stockUnit}</span>}
                      {row.role === 'component' && report && <span>· pH {Number(report.pHSet.toFixed(2))} at {report.setTemp_C} °C</span>}
                      {row.mass_g !== undefined && <span>({Number(row.mass_g.toPrecision(4))} g by density)</span>}
                    </div>
                  </div>
                </div>
                <div class="ml-auto text-right">
                  <span class={`inline-block rounded-xl border px-3.5 py-1.5 font-mono text-base font-bold shadow-xs transition ${isChecked ? 'border-emerald-200 bg-emerald-100/60 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300' : 'border-accent-200 bg-accent-50 text-accent-700 dark:border-accent-800 dark:bg-accent-950/70 dark:text-accent-300'}`}>
                    {displayAmount(row.amount, row.unit)}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>

        {ionicLines.length > 0 && (
          <div data-testid="ionic-strength" class="space-y-1 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-300">
            {ionicLines.map(line => <p key={line}>{line}</p>)}
          </div>
        )}

        {result.warnings.length > 0 && (
          <ul role="status" aria-label="Warnings" class="space-y-1 rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-700/60 dark:bg-amber-950/30 dark:text-amber-200">
            {result.warnings.map(w => <li key={w}>⚠ {w}</li>)}
          </ul>
        )}

        <div class="space-y-1.5 rounded-xl bg-slate-50 p-3.5 text-xs text-slate-600 dark:bg-slate-800/60 dark:text-slate-300">
          <strong class="block font-semibold text-slate-900 dark:text-slate-100">Preparation Steps:</strong>
          <ol class="list-inside list-decimal space-y-1 text-slate-500 dark:text-slate-400">
            {prepSteps(result, volume, volumeL, workingTemp_C).map(step => <li key={step}>{step}</li>)}
          </ol>
        </div>
      </div>
    </div>
  );
}
