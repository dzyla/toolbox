/* NEB PCR polymerases as offered by the NEBuilder Assembly Tool (v2.11.2): product,
   Tm-calculator buffer (monovalent-cation equivalent, mM) and annealing-temperature rule. */

export type TaRule = 'q5' | 'q5u' | 'phusion' | 'taq' | 'longamp' | 'vent' | 'none';

export interface NebPolymerase {
  id: string;
  name: string;
  catalog: string;
  /** Buffer monovalent-cation equivalent used for Tm, mM. */
  monovalentMm: number;
  taRule: TaRule;
}

const BUFFER_MM = {
  standardTaq: 60, thermopol: 50, hemoKlenTaq: 70, crimsonTaq: 55, longAmp: 100, multiplex: 100,
  phusion: 222, oneTaqStd: 64, oneTaqGc: 120, q5: 150, q5u: 170,
} as const;

function product(id: string, name: string, catalog: string, monovalentMm: number, taRule: TaRule): NebPolymerase {
  return { id, name, catalog, monovalentMm, taRule };
}

export const NEB_POLYMERASES: NebPolymerase[] = [
  product('q5-0', 'Q5 High-Fidelity DNA Polymerase', 'M0491', BUFFER_MM.q5, 'q5'),
  product('q5-1', 'Q5 High-Fidelity 2X Master Mix', 'M0492', BUFFER_MM.q5, 'q5'),
  product('q5hs-0', 'Q5 Hot Start High-Fidelity DNA Polymerase', 'M0493', BUFFER_MM.q5, 'q5'),
  product('q5hs-1', 'Q5 Hot Start High-Fidelity 2X Master Mix', 'M0494', BUFFER_MM.q5, 'q5'),
  product('q5u-0', 'Q5U Hot Start High-Fidelity DNA Polymerase', 'M0515', BUFFER_MM.q5u, 'q5u'),
  product('phusion-1', 'Phusion High-Fidelity DNA Polymerase (HF Buffer)', '—', BUFFER_MM.phusion, 'phusion'),
  product('phusion-0', 'Phusion High-Fidelity DNA Polymerase (GC Buffer)', '—', BUFFER_MM.phusion, 'phusion'),
  product('phusion-5', 'Phusion High-Fidelity PCR Master Mix (HF Buffer)', 'M0531', BUFFER_MM.phusion, 'phusion'),
  product('phusion-4', 'Phusion High-Fidelity PCR Master Mix (GC Buffer)', 'M0532', BUFFER_MM.phusion, 'phusion'),
  product('phusionflex-0', 'Phusion Hot Start Flex DNA Polymerase (HF Buffer)', 'M0535', BUFFER_MM.phusion, 'phusion'),
  product('phusionflex-1', 'Phusion Hot Start Flex DNA Polymerase (GC Buffer)', 'M0535', BUFFER_MM.phusion, 'phusion'),
  product('phusionflex-2', 'Phusion Hot Start Flex 2X Master Mix', 'M0536', BUFFER_MM.phusion, 'phusion'),
  product('onetaq-0', 'OneTaq DNA Polymerase (Standard Buffer)', 'M0480', BUFFER_MM.oneTaqStd, 'taq'),
  product('onetaq-1', 'OneTaq DNA Polymerase (GC Buffer)', 'M0480', BUFFER_MM.oneTaqGc, 'taq'),
  product('onetaq-2', 'OneTaq 2X Master Mix with Standard Buffer', 'M0482', BUFFER_MM.oneTaqStd, 'taq'),
  product('onetaq-3', 'OneTaq 2X Master Mix with GC Buffer', 'M0483', BUFFER_MM.oneTaqGc, 'taq'),
  product('onetaqhs-0', 'OneTaq Hot Start DNA Polymerase (Standard Buffer)', 'M0481', BUFFER_MM.oneTaqStd, 'taq'),
  product('onetaqhs-1', 'OneTaq Hot Start DNA Polymerase (GC Buffer)', 'M0481', BUFFER_MM.oneTaqGc, 'taq'),
  product('taq-0', 'Taq DNA Polymerase with Standard Taq Buffer', 'M0273', BUFFER_MM.standardTaq, 'taq'),
  product('taq-2', 'Taq DNA Polymerase with ThermoPol Buffer', 'M0267', BUFFER_MM.thermopol, 'taq'),
  product('taqmaster-0', 'Taq 2X Master Mix', 'M0270', BUFFER_MM.standardTaq, 'taq'),
  product('hstaq-0', 'Hot Start Taq DNA Polymerase', 'M0495', BUFFER_MM.standardTaq, 'taq'),
  product('hstaq-1', 'Hot Start Taq 2X Master Mix', 'M0496', BUFFER_MM.standardTaq, 'taq'),
  product('epimarkhs-0', 'EpiMark Hot Start Taq DNA Polymerase', 'M0490', BUFFER_MM.standardTaq, 'taq'),
  product('ctaq-0', 'Crimson Taq DNA Polymerase', 'M0324', BUFFER_MM.crimsonTaq, 'taq'),
  product('hktaq-0', 'Hemo KlenTaq', 'M0332', BUFFER_MM.hemoKlenTaq, 'taq'),
  product('multiplex-0', 'Multiplex PCR 5X Master Mix', 'M0284', BUFFER_MM.multiplex, 'taq'),
  product('lataq-0', 'LongAmp Taq DNA Polymerase', 'M0323', BUFFER_MM.longAmp, 'longamp'),
  product('lataq-1', 'LongAmp Taq 2X Master Mix', 'M0287', BUFFER_MM.longAmp, 'longamp'),
  product('lahstaq-0', 'LongAmp Hot Start Taq DNA Polymerase', 'M0534', BUFFER_MM.longAmp, 'longamp'),
  product('vent-0', 'Vent DNA Polymerase', 'M0254', BUFFER_MM.thermopol, 'vent'),
  product('deepvent-0', 'Deep Vent DNA Polymerase', 'M0258', BUFFER_MM.thermopol, 'vent'),
];

export function findPolymerase(id: string): NebPolymerase | undefined {
  return NEB_POLYMERASES.find(polymerase => polymerase.id === id);
}

/** NEB Tm method and default primer concentration for a polymerase. */
export function primerDefaults(polymerase: NebPolymerase): { method: 4 | 5; primerNm: number } {
  if (polymerase.taRule === 'phusion') return { method: 5, primerNm: 500 };
  if (polymerase.taRule === 'q5' || polymerase.taRule === 'q5u') return { method: 4, primerNm: 500 };
  return { method: 4, primerNm: 200 };
}

/**
 * Annealing temperature for a primer pair (NEB Tm Calculator rules).
 * `lowerTm` is the lower of the two primer Tms, `shorterLength` the shorter anneal length.
 */
export function annealingTemperature(rule: TaRule, lowerTm: number, shorterLength: number): number {
  let ta = lowerTm;
  switch (rule) {
    case 'q5': if (shorterLength > 7) ta = lowerTm + 1; ta = Math.min(ta, 72); break;
    case 'q5u': if (shorterLength > 7) ta = lowerTm + 2; ta = Math.min(ta, 72); break;
    case 'phusion': ta = Math.min(0.93 * lowerTm + 7.5, 72); break;
    case 'taq': if (shorterLength > 7) ta = lowerTm - 5; ta = Math.min(ta, 68); break;
    case 'longamp': if (shorterLength > 7) ta = lowerTm - 5; ta = Math.min(ta, 65); break;
    case 'vent': if (shorterLength > 20) ta = lowerTm - 2; ta = Math.min(ta, 72); break;
    case 'none': break;
  }
  return Math.round(ta * 10) / 10;
}
