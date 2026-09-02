/* Unit parsing, conversion and formatting. SI bases: M (mol/L), L, g, mol, g/L, m. */
export type Dim = 'concentration' | 'volume' | 'mass' | 'amount' | 'massconc' | 'length';
export interface Quantity { value: number; unit: string }
export class UnitError extends Error {}

const P = { k: 1e3, '': 1, m: 1e-3, 'µ': 1e-6, n: 1e-9, p: 1e-12, f: 1e-15 } as const;

function withPrefixes(base: string, factor: number, prefixes: (keyof typeof P)[]) {
  const out: Record<string, number> = {};
  for (const p of prefixes) out[`${p}${base}`] = P[p] * factor;
  return out;
}

/** Factor from each unit to the SI base of its dimension. */
export const UNITS: Record<Dim, Record<string, number>> = {
  concentration: withPrefixes('M', 1, ['', 'm', 'µ', 'n', 'p', 'f']),
  volume: withPrefixes('L', 1, ['', 'm', 'µ', 'n', 'p']),
  mass: withPrefixes('g', 1, ['k', '', 'm', 'µ', 'n', 'p']),
  amount: withPrefixes('mol', 1, ['', 'm', 'µ', 'n', 'p', 'f']),
  massconc: { 'g/L': 1, 'mg/mL': 1, 'µg/µL': 1, 'mg/L': 1e-3, 'µg/mL': 1e-3, 'ng/µL': 1e-3, 'µg/L': 1e-6, 'ng/mL': 1e-6, 'pg/µL': 1e-6, 'ng/L': 1e-9, 'pg/mL': 1e-9, '%': 10 },
  length: { m: 1, cm: 1e-2, mm: 1e-3, 'µm': 1e-6, nm: 1e-9, 'Å': 1e-10, pm: 1e-12 },
};

const DISPLAY: Record<Dim, string[]> = {
  concentration: ['M', 'mM', 'µM', 'nM', 'pM', 'fM'],
  volume: ['L', 'mL', 'µL', 'nL', 'pL'],
  mass: ['kg', 'g', 'mg', 'µg', 'ng', 'pg'],
  amount: ['mol', 'mmol', 'µmol', 'nmol', 'pmol', 'fmol'],
  massconc: ['mg/mL', 'µg/mL', 'ng/mL', 'pg/mL'],
  length: ['m', 'cm', 'mm', 'µm', 'nm', 'Å'],
};

/** Accept common ASCII spellings: uL → µL, ml → mL, ug/ml → µg/mL, A → Å. */
export function normaliseUnit(unit: string): string {
  let u = unit.trim();
  u = u.replace(/^u(?=[A-Za-z])/, 'µ').replace(/\/u(?=[A-Za-z])/, '/µ');
  u = u.replace(/^([µmnpk]?)l$/, (_, p: string) => `${p}L`).replace(/\/([µmnpk]?)l$/, (_, p: string) => `/${p}L`);
  u = u.replace(/^(A|Angstrom|angstrom)$/, 'Å');
  return u;
}

export function dimOf(unit: string): Dim | undefined {
  const u = normaliseUnit(unit);
  for (const d of Object.keys(UNITS) as Dim[]) if (u in UNITS[d]) return d;
  return undefined;
}

export function toSI(q: Quantity): number {
  const u = normaliseUnit(q.unit);
  const d = dimOf(u);
  if (!d) throw new UnitError(`Unknown unit "${q.unit}"`);
  return q.value * UNITS[d][u]!;
}

export function fromSI(si: number, unit: string): number {
  const u = normaliseUnit(unit);
  const d = dimOf(u);
  if (!d) throw new UnitError(`Unknown unit "${unit}"`);
  return si / UNITS[d][u]!;
}

export function convert(value: number, from: string, to: string): number {
  const df = dimOf(from), dt = dimOf(to);
  if (!df || !dt) throw new UnitError(`Unknown unit "${!df ? from : to}"`);
  if (df !== dt) throw new UnitError(`Cannot convert ${from} (${df}) to ${to} (${dt})`);
  return fromSI(toSI({ value, unit: from }), to);
}

/** Parse "10 mM", "2.5uL", "1e-7 M". Returns null if unparseable or of the wrong dimension. */
export function parseQuantity(text: string, dim?: Dim): { value: number; unit: string; si: number; dim: Dim } | null {
  const m = text.trim().match(/^([-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?)\s*([A-Za-zµÅ%][A-Za-zµÅ/]*)$/);
  if (!m) return null;
  const value = Number(m[1]);
  const unit = normaliseUnit(m[2]!);
  const d = dimOf(unit);
  if (!d || (dim && d !== dim) || !Number.isFinite(value)) return null;
  return { value, unit, si: value * UNITS[d][unit]!, dim: d };
}

/** Choose a display unit so that 1 ≤ |value| < 1000 where possible. */
export function formatSI(si: number, dim: Dim, opts: { sig?: number; units?: string[] } = {}) {
  const sig = opts.sig ?? 4;
  const units = opts.units ?? DISPLAY[dim];
  let unit = units[units.length - 1]!;
  if (si === 0 || !Number.isFinite(si)) unit = units[Math.min(1, units.length - 1)]!;
  else {
    let found = false;
    for (const u of units) { const v = Math.abs(fromSI(si, u)); if (v >= 1 && v < 1000) { unit = u; found = true; break; } }
    if (!found && Math.abs(fromSI(si, units[0]!)) >= 1000) unit = units[0]!;
  }
  const value = Number(fromSI(si, unit).toPrecision(sig));
  return { value, unit, text: `${value} ${unit}` };
}
