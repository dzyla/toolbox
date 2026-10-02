import type { MixtureResult } from '@/core/buffers/mixture';
import { formatSI } from '@/core/units';

export function displayAmount(amount: number, unit: 'g' | 'mL'): string {
  return unit === 'g' ? formatSI(amount, 'mass').text : formatSI(amount / 1000, 'volume').text;
}

const ph = (v: number) => String(Number(v.toFixed(2)));

export function phLines(result: MixtureResult, workingTemp_C: number): string[] {
  return result.buffers.map(b => {
    const changed = b.setTemp_C !== workingTemp_C || Math.abs(b.drift) >= 0.005;
    return `${b.name}: pH ${ph(b.pHSet)} at ${b.setTemp_C} °C${changed ? ` → pH ${ph(b.pHWorking)} at ${workingTemp_C} °C` : ''}`;
  });
}

export function recipeText(result: MixtureResult, volumeLabel: string, workingTemp_C: number, science: string): string {
  return [
    `Buffer recipe — ${volumeLabel}`,
    ...result.rows.map(row => `${row.name}: ${displayAmount(row.amount, row.unit)}${row.mass_g === undefined ? '' : ` (${Number(row.mass_g.toPrecision(4))} g by density)`}`),
    ...phLines(result, workingTemp_C),
    `Ionic strength about ${Number(result.ionicStrength.toPrecision(3))} M.`,
    ...result.warnings,
    `Bring to ${volumeLabel} with water.`, '', science,
  ].join('\n');
}

export function recipeCsvRows(result: MixtureResult): (string | number)[][] {
  return [
    ['Component', 'Amount', 'Unit', 'Mass from density (g)'],
    ...result.rows.map(row => [row.name, Number(row.amount.toPrecision(8)), row.unit, row.mass_g ?? '']),
  ];
}
