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

/**
 * Ionic-strength lines. Reported only when something was actually counted, and any excluded component
 * is named so "about 0.14 M" cannot read as the whole solution when two phosphates sit outside the model.
 */
export function ionicStrengthLines(result: MixtureResult): string[] {
  const names = result.notCounted.join(', ');
  if (result.buffers.length === 0 && result.ionicStrength === 0) {
    return result.notCounted.length === 0 ? []
      : [`Ionic strength is not estimated: none of these components is in the ionic-strength model (${names}).`];
  }
  const lines = [`Ionic strength about ${Number(result.ionicStrength.toPrecision(3))} M.`];
  if (result.notCounted.length > 0) lines.push(`That excludes ${names}, whose ions are not in the ionic-strength model.`);
  return lines;
}

export function recipeText(result: MixtureResult, volumeLabel: string, workingTemp_C: number, science: string): string {
  return [
    `Buffer recipe — ${volumeLabel}`,
    ...result.rows.map(row => `${row.name}: ${displayAmount(row.amount, row.unit)}${row.mass_g === undefined ? '' : ` (${Number(row.mass_g.toPrecision(4))} g by density)`}`),
    ...phLines(result, workingTemp_C),
    ...ionicStrengthLines(result),
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
