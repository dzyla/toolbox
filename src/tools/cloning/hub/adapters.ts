import { gcPercent, type DesignedPrimer } from '@/core/cloning/oligo';
import type { InfusionDesign } from '@/core/cloning/methods/infusion';
import type { SdmDesign } from '@/core/cloning/methods/basechanger';

export function infusionPrimers(design: InfusionDesign): DesignedPrimer[] {
  return design.primers.map(primer => ({
    name: primer.name,
    sequence: primer.sequence,
    tail: primer.extension + primer.site,
    anneal: primer.anneal,
    annealTmC: primer.annealTm,
    gcPercent: primer.gc,
    target: primer.target,
    direction: primer.direction,
    notes: [
      primer.extension ? `${primer.extension.length} nt extension${primer.site ? ` + ${primer.site.length} nt site` : ''}` : primer.role === 'vector' ? 'plain primer (inverse PCR)' : '',
    ].filter(Boolean),
  }));
}

export function sdmPrimers(design: SdmDesign): DesignedPrimer[] {
  return [design.forward, design.reverse].map(primer => ({
    name: primer.name,
    sequence: primer.sequence,
    tail: primer.tail,
    anneal: primer.anneal,
    annealTmC: primer.annealTm,
    gcPercent: gcPercent(primer.sequence),
    target: design.label,
    direction: primer.direction,
    notes: primer.direction === 'forward' ? [`Ta ${design.ta} °C`] : [],
  }));
}
