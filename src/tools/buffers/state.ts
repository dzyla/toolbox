import type { QValue } from '@/app/components/Quantity';
import type { MixtureComponent } from '@/core/buffers/mixture';
import { findSystem, type BufferSystem } from '@/core/buffers/pka';
import type { RecipeTarget, RecipeUnit } from '@/core/buffers/recipe';
import { isPositiveNumber, isRecord } from '@/lib/local-library';

export interface BufferEditor {
  systemId: string;
  mode: 'premade' | 'design';
  stockConc: number; stockUnit: 'M' | 'mM'; stockPH: number; stockTemp_C: number;
  pH: number;
  /** undefined = the pH is specified at the working temperature. */
  pHTemp_C?: number;
  method: 'titrate' | 'mix-forms';
  formId: string; formId2?: string;
  titrantConc_M: number;
}

export interface EditorComponent {
  id: string; query: string; name: string; kind: 'solid' | 'stock' | 'buffer';
  mw?: number; waters?: number;
  stockConc?: number; stockUnit?: RecipeUnit; density?: number;
  target: RecipeTarget;
  buffer?: BufferEditor;
}

export interface State { volume: QValue; workingTemp_C: number; ionicCorrection: boolean; components: EditorComponent[] }
export interface Preset { id: string; name: string; finalVolume_L: number; source: string; components: MixtureComponent[] }

let nextId = 1;
export const newId = () => `buffer-row-${nextId++}`;

export const DEFAULT_COMPONENT: EditorComponent = {
  id: 'buffer-row-0', query: 'Tris-base', name: 'Tris-base', kind: 'solid', mw: 121.14,
  waters: 0, target: { value: 10, unit: 'mM' },
};
export const DEFAULTS: State = {
  volume: { value: 500, unit: 'mL' }, workingTemp_C: 25, ionicCorrection: true, components: [DEFAULT_COMPONENT],
};

/** The weighable forms with the fewest and the most protons removed, used as the acid/base pair for mixing. */
export function mixDefaults(system: BufferSystem): { formId: string; formId2: string } {
  const lo = system.forms.reduce((a, f) => f.protonsRemoved < a.protonsRemoved ? f : a);
  const hi = system.forms.reduce((a, f) => f.protonsRemoved > a.protonsRemoved ? f : a);
  return { formId: lo.id, formId2: hi.id };
}

/** pKa closest to neutral: the step a bench scientist means by "the buffer's pKa". */
const mainPKa = (system: BufferSystem) =>
  system.steps.reduce((a, s) => Math.abs(s.pKa25 - 7) < Math.abs(a - 7) ? s.pKa25 : a, system.steps[0]!.pKa25);

export function defaultBuffer(systemId = 'tris'): BufferEditor {
  const system = findSystem(systemId) ?? findSystem('tris')!;
  const startS = system.z0 === 1 ? 1 : 0;
  const start = system.forms.find(f => f.protonsRemoved === startS) ?? system.forms[0]!;
  const pH = Math.round(mainPKa(system) * 2) / 2;
  return {
    systemId: system.id, mode: 'design', stockConc: 1, stockUnit: 'M', stockPH: pH, stockTemp_C: 25,
    pH, method: 'titrate', formId: start.id, titrantConc_M: 1,
  };
}

export function toMixture(c: EditorComponent, workingTemp_C: number): MixtureComponent {
  if (c.kind === 'solid') return { name: c.name, kind: 'solid', mw: c.mw, waters: c.waters, target: c.target };
  if (c.kind === 'stock') {
    return {
      name: c.name, kind: 'stock', stockConc: (c.stockConc !== undefined && !isNaN(c.stockConc)) ? c.stockConc : 1,
      stockUnit: c.stockUnit ?? 'M', target: c.target, density: c.density,
    };
  }
  const b = c.buffer ?? defaultBuffer();
  const target = { value: c.target.value, unit: c.target.unit === 'M' ? 'M' as const : 'mM' as const };
  if (b.mode === 'premade') {
    return { kind: 'buffer', mode: 'premade', name: c.name, systemId: b.systemId, target, stockConc: b.stockConc, stockUnit: b.stockUnit, stockPH: b.stockPH, stockTemp_C: b.stockTemp_C };
  }
  return {
    kind: 'buffer', mode: 'design', name: c.name, systemId: b.systemId, target, pH: b.pH, pHTemp_C: b.pHTemp_C ?? workingTemp_C,
    method: b.method, formId: b.formId, formId2: b.formId2, titrantConc_M: b.titrantConc_M,
  };
}

export function fromMixture(c: MixtureComponent): EditorComponent {
  if (c.kind !== 'buffer') {
    return { ...c, id: newId(), query: c.name, waters: c.kind === 'solid' ? c.waters ?? 0 : undefined };
  }
  const defaults = defaultBuffer(c.systemId);
  const buffer: BufferEditor = c.mode === 'premade'
    ? { ...defaults, mode: 'premade', stockConc: c.stockConc, stockUnit: c.stockUnit, stockPH: c.stockPH, stockTemp_C: c.stockTemp_C }
    : { ...defaults, mode: 'design', pH: c.pH, pHTemp_C: c.pHTemp_C, method: c.method, formId: c.formId, formId2: c.formId2, titrantConc_M: c.titrantConc_M };
  return { id: newId(), query: c.name, name: c.name, kind: 'buffer', target: c.target, buffer };
}

/** Validator for stored and preset components: the old solid/stock shapes plus the new buffer shape. */
export function isMixtureComponent(c: unknown): c is MixtureComponent {
  if (!isRecord(c) || typeof c.name !== 'string' || !isRecord(c.target)) return false;
  if (c.kind === 'solid') return true;
  if (c.kind === 'stock') return isPositiveNumber(c.stockConc) && typeof c.stockUnit === 'string';
  if (c.kind !== 'buffer' || typeof c.systemId !== 'string' || !findSystem(c.systemId)) return false;
  if (c.mode === 'premade') return isPositiveNumber(c.stockConc) && Number.isFinite(c.stockPH) && Number.isFinite(c.stockTemp_C);
  return c.mode === 'design' && Number.isFinite(c.pH) && Number.isFinite(c.pHTemp_C)
    && (c.method === 'titrate' || c.method === 'mix-forms') && typeof c.formId === 'string' && isPositiveNumber(c.titrantConc_M);
}
