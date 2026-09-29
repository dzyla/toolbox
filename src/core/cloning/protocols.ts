/* Bench protocols for the assembly methods, built from the amount calculators. */

import type { AssemblyAmounts, InfusionAmounts } from './amounts';
import type { CloningProtocol } from './protocol';

const pmolText = (pmol: number) => `${Number(pmol.toPrecision(3))} pmol`;
const ngText = (ng: number) => `${Number(ng.toPrecision(3))} ng`;

/** NEBuilder HiFi DNA Assembly (NEB E2621 / E5520) reaction. */
export function nebuilderProtocol(plan: AssemblyAmounts): CloningProtocol {
  return {
    title: 'NEBuilder HiFi DNA Assembly',
    source: 'NEBuilder HiFi DNA Assembly protocol (NEB E2621); amounts follow the NEBuilder Protocol Calculator',
    reactions: [{
      title: 'Assembly reaction',
      totalVolumeUl: plan.totalVolumeUl,
      components: [
        ...plan.fragments.map(fragment => ({
          name: `${fragment.name} (${fragment.bp.toLocaleString()} bp${fragment.isVector ? ', vector' : ''})`,
          stock: `${fragment.ngPerUl} ng/µL`,
          amount: `${pmolText(fragment.pmol)} (${ngText(fragment.ng)})`,
          volumeUl: fragment.volumeUl,
        })),
        { name: 'NEBuilder HiFi DNA Assembly Master Mix', stock: '2X', volumeUl: plan.masterMixUl },
        { name: 'Deionized water', volumeUl: null },
      ],
      notes: plan.notes,
    }],
    steps: [
      { text: 'Assemble on ice. Total DNA should be 0.03–0.2 pmol for 2–3 fragments, or 0.2–0.5 pmol for 4–6 fragments.' },
      { text: `Incubate in a thermocycler at 50 °C for ${plan.incubationMinutes} minutes.`, temperatureC: 50, minutes: plan.incubationMinutes },
      { text: 'Place on ice, or store at −20 °C.' },
      { text: `Transform ${Number(plan.transformUl.toFixed(1))} µL (10 % of the reaction) into 50 µL of competent cells.` },
    ],
  };
}

/** In-Fusion Snap Assembly (Takara) reaction. */
export function infusionProtocol(plan: InfusionAmounts, vectorName: string): CloningProtocol {
  return {
    title: 'In-Fusion Snap Assembly',
    source: 'Takara Bio In-Fusion Snap Assembly user manual',
    reactions: [{
      title: 'Assembly reaction',
      totalVolumeUl: plan.totalVolumeUl,
      components: [
        { name: `${vectorName} (linearised vector)`, amount: `${ngText(plan.vector.ng)} (${pmolText(plan.vector.pmol)})`, volumeUl: plan.vector.volumeUl },
        ...plan.inserts.map(insert => ({ name: `${insert.name} (${insert.bp.toLocaleString()} bp)`, amount: `${ngText(insert.ng)} (${pmolText(insert.pmol)})`, volumeUl: insert.volumeUl })),
        { name: 'In-Fusion Snap Assembly Master Mix', stock: '5X', volumeUl: plan.premixUl },
        { name: 'Deionized water', volumeUl: null },
      ],
      notes: plan.notes,
    }],
    steps: [
      { text: 'Use purified PCR products or gel-purified linearised vector; do not use unpurified restriction digests.' },
      { text: `Incubate at ${plan.incubation}.`, temperatureC: 50, minutes: 15 },
      { text: `Transform ${plan.transformUl} µL into 50 µL of Stellar Competent Cells (never more than 5 µL).` },
    ],
  };
}
