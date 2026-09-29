/* Primer output model and order formats shared by every cloning method. */

export interface DesignedPrimer {
  name: string;
  /** Full primer 5′→3′, upper case. */
  sequence: string;
  /** 5′ tail (homology arm, extension, mutation) that does not bind the template. */
  tail: string;
  /** Template-binding 3′ part. */
  anneal: string;
  /** Tm of the template-binding part, °C, by the method's Tm rule. */
  annealTmC: number;
  /** Tm of the full primer when relevant, °C. */
  fullTmC?: number;
  gcPercent: number;
  /** What the primer amplifies, e.g. the fragment name. */
  target: string;
  direction: 'forward' | 'reverse';
  notes: string[];
}

/** Vendor display convention: tail in lower case, annealing part in upper case. */
export function displayPrimer(primer: Pick<DesignedPrimer, 'tail' | 'anneal'>): string {
  return primer.tail.toLowerCase() + primer.anneal.toUpperCase();
}

export function gcPercent(sequence: string): number {
  if (!sequence.length) return 0;
  const gc = [...sequence.toUpperCase()].filter(base => base === 'G' || base === 'C').length;
  return (gc / sequence.length) * 100;
}

function csvCell(value: string | number): string {
  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function primersToCsv(primers: DesignedPrimer[]): string {
  const header = ['Name', 'Sequence (5′→3′)', 'Length', 'Tail', 'Anneal', 'Anneal Tm (°C)', 'Full Tm (°C)', 'GC %', 'Target', 'Notes'];
  const rows = primers.map(primer => [
    primer.name,
    displayPrimer(primer),
    primer.sequence.length,
    primer.tail.toLowerCase(),
    primer.anneal,
    primer.annealTmC.toFixed(1),
    primer.fullTmC === undefined ? '' : primer.fullTmC.toFixed(1),
    primer.gcPercent.toFixed(0),
    primer.target,
    primer.notes.join('; '),
  ]);
  return [header, ...rows].map(row => row.map(csvCell).join(',')).join('\n') + '\n';
}

/** IDT bulk-input format: name, sequence, scale, purification (tab-separated). */
export function primersToIdtBulk(primers: DesignedPrimer[], scale = '25nm', purification = 'STD'): string {
  return primers.map(primer => [primer.name, primer.sequence.toUpperCase(), scale, purification].join('\t')).join('\n') + '\n';
}
