import { BufferRecipeError, solveRecipe, type RecipeComponent, type RecipeRow } from './recipe';
import { PKA_REFERENCE_TEMP_C, findSystem } from './pka';
import { DAVIES_LIMIT_M, bufferIonicStrength, effectivePKas, fractions, meanCharge, meanProtonsRemoved, solvePHForCharge } from './speciation';

interface BufferBase { kind: 'buffer'; name: string; systemId: string; target: { value: number; unit: 'M' | 'mM' } }
export interface PremadeBuffer extends BufferBase {
  mode: 'premade'; stockConc: number; stockUnit: 'M' | 'mM'; stockPH: number; stockTemp_C: number;
}
export interface DesignBuffer extends BufferBase {
  mode: 'design'; pH: number; pHTemp_C: number; method: 'titrate' | 'mix-forms';
  formId: string; formId2?: string; titrantConc_M: number;
}
export type BufferComponent = PremadeBuffer | DesignBuffer;
export type MixtureComponent = RecipeComponent | BufferComponent;

export interface MixtureOptions { finalVolume_L: number; workingTemp_C: number; ionicCorrection: boolean }
export interface MixtureRow extends RecipeRow { componentIndex: number; role: 'component' | 'titrant' }
export interface BufferReport {
  componentIndex: number;
  name: string;
  /** pH the user asked for (design) or the stock pH (premade). */
  pHSet: number;
  /** Temperature that pH refers to. */
  setTemp_C: number;
  /** pH the finished mixture is predicted to read at the working temperature. */
  pHWorking: number;
  /** Predicted pH minus pHSet; warn when its magnitude exceeds 0.1. */
  drift: number;
  /** Equivalents of titrant per mole of buffer (design/titrate only); negative = acid. */
  titrantEquiv?: number;
  /** True when pHSet is more than 1.5 units from every pKa', so the mixture barely buffers. */
  outOfRange: boolean;
  /**
   * False when the step governing pHSet has no published dpKa/dT, so pHWorking carries no temperature
   * correction at all (only the ionic-strength term moves). The UI must say so rather than let the
   * near-zero drift read as a claim that the buffer does not move with temperature.
   */
  temperatureCorrected: boolean;
}
export interface MixtureResult {
  rows: MixtureRow[];
  buffers: BufferReport[];
  ionicStrength: number;
  /** Names of molar components whose ions are not part of the ionic-strength estimate. */
  notCounted: string[];
  /** Plain-language caveats (e.g. ionic strength beyond the Davies equation's range). */
  warnings: string[];
}

/** ionic weight per mole of salt: 0.5 * sum(n_i z_i^2) for the dissociated ions. */
const SALTS: { test: RegExp; weight: number }[] = [
  { test: /sodium chloride|\bnacl\b/i, weight: 1 },
  { test: /potassium chloride|\bkcl\b/i, weight: 1 },
  { test: /ammonium chloride|nh4cl/i, weight: 1 },
  { test: /sodium acetate/i, weight: 1 },
  { test: /magnesium chloride|mgcl2|calcium chloride|cacl2/i, weight: 3 },
  { test: /ammonium sulfate|\(nh4\)2so4/i, weight: 3 },
  { test: /magnesium sulfate|mgso4/i, weight: 4 },
];

const molar = (t: { value: number; unit: string }): number | undefined =>
  t.unit === 'M' ? t.value : t.unit === 'mM' ? t.value / 1000 : undefined;

const positive = (v: number, label: string) => {
  if (!Number.isFinite(v) || v <= 0) throw new BufferRecipeError(`${label} must be a positive number`);
};

interface Resolved { rows: MixtureRow[]; report: BufferReport; ionic: number; stockIonic?: number }
const BUFFERING_RANGE = 1.5;

function resolveBuffer(c: BufferComponent, index: number, I: number, opts: MixtureOptions): Resolved {
  const system = findSystem(c.systemId);
  if (!system) throw new BufferRecipeError(`${c.name}: unknown buffer system`);
  const conc = molar(c.target);
  if (conc === undefined || !(conc > 0)) throw new BufferRecipeError(`${c.name}: buffer concentration must be positive and in M or mM`);
  const moles = conc * opts.finalVolume_L;
  const correct = opts.ionicCorrection;
  const useKas = effectivePKas(system, opts.workingTemp_C, I, correct);
  const rows: MixtureRow[] = [];
  let Q: number, pHSet: number, setTemp: number, titrantEquiv: number | undefined, stockIonic: number | undefined;
  /** Protons removed in the weighed form, so the ionic strength can keep its spectator counter-ions. */
  let spectatorP: number | undefined;
  if (!Number.isFinite(opts.workingTemp_C)) throw new BufferRecipeError('Working temperature must be a number');

  if (c.mode === 'premade') {
    positive(c.stockConc, `${c.name} stock concentration`);
    const stockM = c.stockUnit === 'M' ? c.stockConc : c.stockConc / 1000;
    if (conc > stockM) throw new BufferRecipeError(`${c.name}: target is above the stock concentration`);
    if (!Number.isFinite(c.stockPH) || !Number.isFinite(c.stockTemp_C)) throw new BufferRecipeError(`${c.name}: stock pH and temperature must be numbers`);
    let Is = 0;
    for (let i = 0; i < 60; i++) {
      Is = bufferIonicStrength(system, stockM, fractions(c.stockPH, effectivePKas(system, c.stockTemp_C, Is, correct)));
    }
    stockIonic = Is;
    Q = meanCharge(system, fractions(c.stockPH, effectivePKas(system, c.stockTemp_C, Is, correct)));
    pHSet = c.stockPH; setTemp = c.stockTemp_C;
    rows.push({ name: `${c.name} (${c.stockConc} ${c.stockUnit}, pH ${c.stockPH})`, amount: (conc / stockM) * opts.finalVolume_L * 1000, unit: 'mL', componentIndex: index, role: 'component' });
  } else {
    if (!Number.isFinite(c.pH) || !Number.isFinite(c.pHTemp_C)) throw new BufferRecipeError(`${c.name}: pH and temperature must be numbers`);
    const setKas = effectivePKas(system, c.pHTemp_C, I, correct);
    const fr = fractions(c.pH, setKas);
    const m = meanProtonsRemoved(fr);
    Q = system.z0 - m; pHSet = c.pH; setTemp = c.pHTemp_C;
    const form = system.forms.find(f => f.id === c.formId);
    if (!form) throw new BufferRecipeError(`${c.name}: choose a starting form`);
    if (c.method === 'titrate') {
      positive(c.titrantConc_M, 'Titrant concentration');
      spectatorP = form.protonsRemoved;
      rows.push({ name: form.label, amount: moles * form.mw, unit: 'g', componentIndex: index, role: 'component' });
      titrantEquiv = m - form.protonsRemoved;
      if (Math.abs(titrantEquiv) > 1e-9) {
        const base = titrantEquiv > 0;
        rows.push({ name: `${base ? 'NaOH' : 'HCl'} ${c.titrantConc_M} M (approx., finish with pH meter)`, amount: (Math.abs(titrantEquiv) * moles / c.titrantConc_M) * 1000, unit: 'mL', componentIndex: index, role: 'titrant' });
      }
    } else {
      const other = system.forms.find(f => f.id === c.formId2);
      if (!other) throw new BufferRecipeError(`${c.name}: choose a second form to mix`);
      const [a, b] = form.protonsRemoved <= other.protonsRemoved ? [form, other] : [other, form];
      if (a.protonsRemoved === b.protonsRemoved) throw new BufferRecipeError(`${c.name}: the two forms differ by no protons; pick an acid and a base form`);
      const xb = (m - a.protonsRemoved) / (b.protonsRemoved - a.protonsRemoved);
      if (xb < -1e-9 || xb > 1 + 1e-9) throw new BufferRecipeError(`${c.name}: pH ${c.pH} cannot be reached by mixing ${a.label} and ${b.label}; use the titrate method`);
      const xbc = Math.min(1, Math.max(0, xb));
      rows.push({ name: a.label, amount: moles * (1 - xbc) * a.mw, unit: 'g', componentIndex: index, role: 'component' });
      rows.push({ name: b.label, amount: moles * xbc * b.mw, unit: 'g', componentIndex: index, role: 'component' });
    }
  }

  let pHWorking: number;
  try { pHWorking = solvePHForCharge(system, Q, useKas); } catch (error) {
    if (error instanceof RangeError) throw new BufferRecipeError(`${c.name}: the pH at the working temperature could not be solved`);
    throw error;
  }
  const ionic = bufferIonicStrength(system, conc, fractions(pHWorking, useKas), spectatorP);
  // The step nearest the set pH governs both the buffering range and which dpKa/dT applies.
  const setKas = effectivePKas(system, setTemp, I, correct);
  let governing = 0;
  setKas.forEach((pKa, j) => { if (Math.abs(pHSet - pKa) < Math.abs(pHSet - setKas[governing]!)) governing = j; });
  const nearest = Math.abs(pHSet - setKas[governing]!);
  return {
    rows, ionic, stockIonic,
    report: {
      componentIndex: index, name: c.name, pHSet, setTemp_C: setTemp, pHWorking, drift: pHWorking - pHSet, titrantEquiv,
      outOfRange: nearest > BUFFERING_RANGE, temperatureCorrected: system.steps[governing]!.temperatureData,
    },
  };
}

export function solveMixture(components: MixtureComponent[], opts: MixtureOptions): MixtureResult {
  positive(opts.finalVolume_L, 'Final volume');
  if (!Number.isFinite(opts.workingTemp_C)) throw new BufferRecipeError('Working temperature must be a number');
  let saltI = 0;
  const notCounted: string[] = [];
  components.forEach(c => {
    if (c.kind === 'buffer') return;
    const conc = molar(c.target);
    const salt = SALTS.find(s => s.test.test(c.name));
    if (conc !== undefined && salt) saltI += conc * salt.weight;
    else notCounted.push(c.name);
  });

  const solveAll = (I: number) => components.map((c, i) => c.kind === 'buffer' ? resolveBuffer(c, i, I, opts) : undefined);
  let I = saltI;
  let resolved = solveAll(I);
  for (let i = 0; i < 60; i++) {
    const next = saltI + resolved.reduce((a, r) => a + (r?.ionic ?? 0), 0);
    const done = Math.abs(next - I) < 1e-9;
    I = done ? next : 0.5 * (I + next);
    resolved = solveAll(I);
    if (done) break;
  }

  const rows: MixtureRow[] = [];
  const buffers: BufferReport[] = [];
  components.forEach((c, i) => {
    const r = resolved[i];
    if (c.kind === 'buffer' && r) { rows.push(...r.rows); buffers.push(r.report); return; }
    const [row] = solveRecipe([c as RecipeComponent], opts.finalVolume_L);
    rows.push({ ...row!, componentIndex: i, role: 'component' });
  });
  const warnings: string[] = [];
  if (opts.ionicCorrection && buffers.length > 0 && I > DAVIES_LIMIT_M) warnings.push(`Ionic strength ${I.toFixed(2)} M is above the ${DAVIES_LIMIT_M} M range of the Davies equation, so the activity correction is held at its ${DAVIES_LIMIT_M} M value instead of being extrapolated. Both the component amounts and the predicted pH are approximate here: set the pH with a meter after dissolving everything.`);
  if (opts.ionicCorrection && buffers.length > 0 && (opts.workingTemp_C < 0 || opts.workingTemp_C > 50)) warnings.push('Temperature is outside 0–50 °C, the range of the activity-coefficient fit; the ionic-strength correction is approximate.');
  buffers.forEach(b => {
    if (b.temperatureCorrected) return;
    const away = [...new Set([b.setTemp_C, opts.workingTemp_C].filter(t => t !== PKA_REFERENCE_TEMP_C))];
    if (away.length === 0) return;
    const temps = away.map(t => `${t} °C`).join(' and ');
    const c = components[b.componentIndex]!;
    // Design rows derive the weigh-out and titrant from the pKa at the set temperature, so an
    // uncorrected pKa moves the amounts too; a premade stock is a plain dilution and does not.
    const amounts = c.kind === 'buffer' && c.mode === 'design' && b.setTemp_C !== PKA_REFERENCE_TEMP_C;
    warnings.push(`${c.name}: no published temperature coefficient (dpKa/dT) for the pKa governing pH ${Number(b.pHSet.toFixed(2))}, so its ${PKA_REFERENCE_TEMP_C} °C pKa is used unchanged at ${temps}. The predicted pH is not corrected for temperature${amounts ? ', and neither are the amounts below' : ''} — most amine buffers move 0.01–0.03 pH per °C, so set the pH with a meter at ${opts.workingTemp_C} °C.`);
  });
  buffers.forEach(b => {
    if (b.outOfRange) warnings.push(`${components[b.componentIndex]!.name}: pH ${b.pHSet} is more than ${BUFFERING_RANGE} units from every pKa of this buffer, so it barely buffers and the predicted pH at the working temperature is unreliable.`);
  });
  resolved.forEach((r, i) => {
    if (opts.ionicCorrection && r?.stockIonic !== undefined && r.stockIonic > DAVIES_LIMIT_M) warnings.push(`${components[i]!.name}: the stock's own ionic strength (${r.stockIonic.toFixed(2)} M) is above the ${DAVIES_LIMIT_M} M Davies range, so its activity correction is held at the ${DAVIES_LIMIT_M} M value and its predicted pH shift on dilution is approximate.`);
  });
  return { rows, buffers, ionicStrength: I, notCounted, warnings };
}
