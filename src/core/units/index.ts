/* Unit parsing, conversion and formatting. SI bases: M (mol/L), L, g, mol, g/L, m, Bq, Gy, Pa, J, K, m². */
export type Dim = 'concentration' | 'volume' | 'mass' | 'amount' | 'massconc' | 'length' | 'activity' | 'radiation' | 'pressure' | 'energy' | 'temperature' | 'area';
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
  // US customary volume units use US liquid definitions.
  volume: { ...withPrefixes('L', 1, ['', 'm', 'µ', 'n', 'p']), tsp: 0.00492892159375, tbsp: 0.01478676478125, 'fl oz': 0.0295735295625, cup: 0.2365882365, pt: 0.473176473, qt: 0.946352946, gal: 3.785411784 },
  // Avoirdupois mass units; ton means the US short ton.
  mass: { ...withPrefixes('g', 1, ['k', '', 'm', 'µ', 'n', 'p']), gr: 0.06479891, oz: 28.349523125, lb: 453.59237, stone: 6350.29318, ton: 907184.74 },
  amount: withPrefixes('mol', 1, ['', 'm', 'µ', 'n', 'p', 'f']),
  massconc: { 'g/L': 1, 'mg/mL': 1, 'µg/µL': 1, 'mg/L': 1e-3, 'µg/mL': 1e-3, 'ng/µL': 1e-3, 'µg/L': 1e-6, 'ng/mL': 1e-6, 'pg/µL': 1e-6, 'ng/L': 1e-9, 'pg/mL': 1e-9, '%': 10 },
  length: { m: 1, cm: 1e-2, mm: 1e-3, 'µm': 1e-6, nm: 1e-9, 'Å': 1e-10, pm: 1e-12, in: 0.0254, ft: 0.3048, yd: 0.9144, mi: 1609.344 },
  // Radioactivity: 1 Ci = 3.7e10 Bq (defined from the early-1900s ²²⁶Ra activity), 1 kBq = 1e3 Bq, 1 MBq = 1e6 Bq, 1 GBq = 1e9 Bq
  activity: { Bq: 1, kBq: 1e3, MBq: 1e6, GBq: 1e9, TBq: 1e12, Ci: 3.7e10, mCi: 3.7e7, uCi: 3.7e4, 'µCi': 3.7e4, nCi: 37 },
  // Absorbed / equivalent dose: SI base Gy (J/kg); 1 rem = 0.01 Sv, 1 mrem = 1e-5 Sv; sieverts track by prefix
  radiation: { Gy: 1, mGy: 1e-3, uGy: 1e-6, 'µGy': 1e-6, Sv: 1, mSv: 1e-3, uSv: 1e-6, 'µSv': 1e-6, rem: 0.01, mrem: 1e-5 },
  // Pressure: 1 atm = 101325 Pa (standard atmosphere), 1 bar = 1e5 Pa, 1 mmHg ≈ 133.322 Pa (Torr, 101325/760)
  pressure: { Pa: 1, kPa: 1e3, MPa: 1e6, bar: 1e5, mbar: 100, mmHg: 133.322368, Torr: 133.322368, atm: 101325, psi: 6894.757 },
  // Energy: cal and BTU are thermochemical and International Table values, respectively.
  energy: { J: 1, kJ: 1e3, cal: 4.184, kcal: 4184, eV: 1.602176634e-19, BTU: 1055.05585262, kWh: 3.6e6 },
  // Factors provide dimension lookup; conversion uses the absolute-Kelvin transforms below.
  temperature: { K: 1, '°C': 1, '°F': 5 / 9 },
  area: { 'mm²': 1e-6, 'cm²': 1e-4, 'm²': 1, 'in²': 0.00064516, 'ft²': 0.09290304, 'yd²': 0.83612736, acre: 4046.8564224 },
};

const DISPLAY: Record<Dim, string[]> = {
  concentration: ['M', 'mM', 'µM', 'nM', 'pM', 'fM'],
  volume: ['L', 'mL', 'µL', 'nL', 'pL'],
  mass: ['kg', 'g', 'mg', 'µg', 'ng', 'pg'],
  amount: ['mol', 'mmol', 'µmol', 'nmol', 'pmol', 'fmol'],
  massconc: ['mg/mL', 'µg/mL', 'ng/mL', 'pg/mL'],
  length: ['m', 'cm', 'mm', 'µm', 'nm', 'Å'],
  activity: ['Bq', 'kBq', 'MBq', 'GBq', 'TBq', 'Ci'],
  radiation: ['Gy', 'mGy', 'µGy', 'Sv', 'mSv', 'µSv'],
  pressure: ['Pa', 'kPa', 'MPa', 'bar', 'mmHg', 'atm'],
  energy: ['kWh', 'BTU', 'kcal', 'kJ', 'J', 'cal', 'eV'],
  temperature: ['K', '°C', '°F'],
  area: ['acre', 'ft²', 'in²', 'm²', 'cm²', 'mm²'],
};

/** Accept common ASCII spellings: uL → µL, ml → mL, ug/ml → µg/mL, A → Å, F → °F. */
export function normaliseUnit(unit: string): string {
  let u = unit.trim().replace(/\s+/g, ' ');
  u = u.replace(/^u(?=[A-Za-z])/, 'µ').replace(/\/u(?=[A-Za-z])/, '/µ');
  u = u.replace(/^([µmnpk]?)l$/, (_, p: string) => `${p}L`).replace(/\/([µmnpk]?)l$/, (_, p: string) => `/${p}L`);
  u = u.replace(/^(A|Angstrom|angstrom)$/, 'Å');
  const lower = u.toLowerCase();
  if (lower === 'c' || lower === '°c' || lower === 'degc' || lower === 'celsius') u = '°C';
  if (lower === 'f' || lower === '°f' || lower === 'degf' || lower === 'fahrenheit') u = '°F';
  if (lower === 'k' || lower === 'kelvin') u = 'K';
  if (lower === 'floz' || lower === 'fl. oz' || lower === 'fl oz') u = 'fl oz';
  const area = u.match(/^([A-Za-zµ]+)(?:\^?2|²)$/);
  if (area) {
    const base = area[1] === 'um' ? 'µm' : area[1]!;
    const candidate = `${base}²`;
    if (candidate in UNITS.area) u = candidate;
  }
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
  if (d === 'temperature') {
    if (u === 'K') return q.value;
    if (u === '°C') return q.value + 273.15;
    return (q.value - 32) * 5 / 9 + 273.15;
  }
  return q.value * UNITS[d][u]!;
}

export function fromSI(si: number, unit: string): number {
  const u = normaliseUnit(unit);
  const d = dimOf(u);
  if (!d) throw new UnitError(`Unknown unit "${unit}"`);
  if (d === 'temperature') {
    if (u === 'K') return si;
    if (u === '°C') return si - 273.15;
    return (si - 273.15) * 9 / 5 + 32;
  }
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
  const m = text.trim().match(/^([-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?)\s*([A-Za-zµÅ°%][A-Za-zµÅ°²/^ 0-9]*)$/);
  if (!m) return null;
  const value = Number(m[1]);
  const unit = normaliseUnit(m[2]!);
  const d = dimOf(unit);
  if (!d || (dim && d !== dim) || !Number.isFinite(value)) return null;
  return { value, unit, si: toSI({ value, unit }), dim: d };
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
