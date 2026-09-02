/* Molarity and dilution. All arguments and results are SI: M (mol/L), L, g, g/mol. */
export class InputError extends Error {}
const pos = (x: number, name: string) => { if (!(x > 0) || !Number.isFinite(x)) throw new InputError(`${name} must be a positive number`); };

/** m = C · V · MW  (g = mol/L · L · g/mol) */
export function massForSolution(conc_M: number, volume_L: number, mw: number): number {
  pos(conc_M, 'Concentration'); pos(volume_L, 'Volume'); pos(mw, 'Molecular weight');
  return conc_M * volume_L * mw;
}
export function molarityFromMass(mass_g: number, volume_L: number, mw: number): number {
  pos(mass_g, 'Mass'); pos(volume_L, 'Volume'); pos(mw, 'Molecular weight');
  return mass_g / mw / volume_L;
}
export function volumeForMass(mass_g: number, conc_M: number, mw: number): number {
  pos(mass_g, 'Mass'); pos(conc_M, 'Concentration'); pos(mw, 'Molecular weight');
  return mass_g / mw / conc_M;
}

export type DilutionInput = { c1?: number; v1?: number; c2?: number; v2?: number };
/** C1·V1 = C2·V2 with exactly one unknown. Diluent = V2 − V1. */
export function solveDilution(d: DilutionInput) {
  const keys = ['c1', 'v1', 'c2', 'v2'] as const;
  const unknown = keys.filter(k => d[k] === undefined);
  if (unknown.length !== 1) throw new InputError('Leave exactly one field to solve for');
  for (const k of keys) if (d[k] !== undefined) pos(d[k]!, k.toUpperCase());
  const solved = unknown[0]!;
  const r = { c1: d.c1 ?? NaN, v1: d.v1 ?? NaN, c2: d.c2 ?? NaN, v2: d.v2 ?? NaN };
  if (solved === 'v1') r.v1 = r.c2 * r.v2 / r.c1;
  if (solved === 'c2') r.c2 = r.c1 * r.v1 / r.v2;
  if (solved === 'c1') r.c1 = r.c2 * r.v2 / r.v1;
  if (solved === 'v2') r.v2 = r.c1 * r.v1 / r.c2;
  if (r.c2 > r.c1) throw new InputError('Final concentration exceeds the stock: a dilution cannot concentrate');
  return { ...r, diluent: r.v2 - r.v1, solved };
}
