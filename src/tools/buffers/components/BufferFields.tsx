import type { ComponentChildren } from 'preact';
import { BUFFER_SYSTEMS, findSystem } from '@/core/buffers/pka';
import type { BufferReport } from '@/core/buffers/mixture';
import type { BufferEditor, EditorComponent } from '../state';
import { NumberField, Segmented, fieldClass, labelClass } from './ui';
import { PhCheck } from './PhCheck';

export interface BufferFieldsProps {
  component: EditorComponent; index: number; workingTemp_C: number;
  report?: BufferReport; ionicStrength: number;
  onBuffer: (patch: Partial<BufferEditor>) => void;
  onMethod: (method: BufferEditor['method']) => void;
}

export function BufferFields({ component, index, workingTemp_C, report, ionicStrength, onBuffer, onMethod }: BufferFieldsProps) {
  const b = component.buffer!;
  const system = findSystem(b.systemId) ?? BUFFER_SYSTEMS[0]!;
  const suffix = index === 0 ? '' : ` ${index + 1}`;
  const canMix = new Set(system.forms.map(f => f.protonsRemoved)).size > 1;
  const formOptions = system.forms.map(f => <option key={f.id} value={f.id}>{f.label}</option>);
  const select = (label: string, value: string, onChange: (v: string) => void, children: ComponentChildren) => (
    <div class="min-w-0">
      <span class={labelClass}>{label}</span>
      <select aria-label={`${label}${suffix}`} value={value} onChange={e => onChange((e.target as HTMLSelectElement).value)} class={`${fieldClass} py-1.5 text-xs`}>{children}</select>
    </div>
  );

  return (
    <div class="space-y-2.5 pt-0.5">
      <p class="break-words text-[10px] leading-snug text-slate-500 dark:text-slate-400">
        <span class="font-semibold uppercase tracking-wider">pKa source</span> — {system.source}
      </p>

      <Segmented<BufferEditor['mode']>
        label={`Buffer mode${suffix}`}
        value={b.mode}
        options={[{ value: 'design', label: 'Make to pH' }, { value: 'premade', label: 'Premade stock' }]}
        onChange={mode => onBuffer({ mode })}
      />

      {b.mode === 'premade' ? (
        <div class="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          <NumberField label="Stock concentration" ariaLabel={`Premade stock concentration${suffix}`} value={b.stockConc} onValue={stockConc => onBuffer({ stockConc })} />
          {select('Stock unit', b.stockUnit, v => onBuffer({ stockUnit: v as 'M' | 'mM' }), <><option>M</option><option>mM</option></>)}
          <NumberField label="Stock pH" ariaLabel={`Stock pH${suffix}`} value={b.stockPH} onValue={stockPH => onBuffer({ stockPH })} />
          <NumberField label="pH measured at (°C)" ariaLabel={`Stock pH temperature (°C)${suffix}`} value={b.stockTemp_C} onValue={stockTemp_C => onBuffer({ stockTemp_C })} />
        </div>
      ) : (
        <div class="space-y-2.5">
          <div class="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            <NumberField label="Target pH" ariaLabel={`Target pH${suffix}`} value={b.pH} onValue={pH => onBuffer({ pH })} />
            <div>
              <span class={labelClass}>pH measured at (°C)</span>
              <input
                aria-label={`pH measured at (°C)${suffix}`}
                type="number" step="any"
                placeholder={String(workingTemp_C)}
                value={b.pHTemp_C ?? ''}
                onInput={e => { const v = (e.target as HTMLInputElement).value; onBuffer({ pHTemp_C: v === '' ? undefined : Number(v) }); }}
                class={`${fieldClass} mono py-1.5 text-xs`}
              />
            </div>
            {select('Method', b.method, v => onMethod(v as BufferEditor['method']), <>
              <option value="titrate">Acid / base</option>
              <option value="mix-forms" disabled={!canMix}>Mix two forms</option>
            </>)}
            {b.method === 'titrate' && <NumberField label="Titrant (M)" ariaLabel={`Titrant concentration (M)${suffix}`} value={b.titrantConc_M} onValue={titrantConc_M => onBuffer({ titrantConc_M })} />}
          </div>
          {b.method === 'titrate'
            ? select('Starting form', b.formId, v => onBuffer({ formId: v }), formOptions)
            : <div class="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              {select('Acid form', b.formId, v => onBuffer({ formId: v }), formOptions)}
              {select('Base form', b.formId2 ?? b.formId, v => onBuffer({ formId2: v }), formOptions)}
            </div>}
        </div>
      )}

      <PhCheck
        report={report}
        workingTemp_C={workingTemp_C}
        ionicStrength={ionicStrength}
        onAdjustAtWorking={b.mode === 'design' && b.pHTemp_C !== undefined ? () => onBuffer({ pHTemp_C: undefined }) : undefined}
      />
    </div>
  );
}
