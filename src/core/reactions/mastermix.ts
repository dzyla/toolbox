export class MasterMixError extends Error {}
export interface MasterMixInput {
  reactionVolume: number; reactions: number; excessPercent: number; deadVolume: number;
  components: { name: string; perReaction: number }[];
}
export interface MasterMixResult { effectiveReactions: number; totalVolume: number; rows: { name: string; perReaction: number; total: number }[] }

const positive = (value: number, label: string) => {
  if (!Number.isFinite(value) || value <= 0) throw new MasterMixError(`${label} must be a positive number`);
};
const nonNegative = (value: number, label: string) => {
  if (!Number.isFinite(value) || value < 0) throw new MasterMixError(`${label} must be zero or greater`);
};

/** Scale per-reaction reagent volumes, including percentage excess and a total dead volume. */
export function masterMix(input: MasterMixInput): MasterMixResult {
  positive(input.reactionVolume, 'Reaction volume');
  positive(input.reactions, 'Number of reactions');
  if (!Number.isInteger(input.reactions)) throw new MasterMixError('Number of reactions must be an integer');
  nonNegative(input.excessPercent, 'Excess'); nonNegative(input.deadVolume, 'Dead volume');
  let used = 0;
  for (const component of input.components) {
    if (!component.name.trim()) throw new MasterMixError('Each component needs a name');
    nonNegative(component.perReaction, `${component.name} volume`);
    used += component.perReaction;
  }
  if (used > input.reactionVolume) throw new MasterMixError('Component volumes exceed the per-reaction volume');
  const effectiveReactions = input.reactions * (1 + input.excessPercent / 100);
  const totalVolume = input.reactionVolume * effectiveReactions + input.deadVolume;
  const scale = totalVolume / input.reactionVolume;
  const rows = input.components.map(component => ({ ...component, total: component.perReaction * scale }));
  const water = input.reactionVolume - used;
  rows.push({ name: 'Water', perReaction: water, total: water * scale });
  return { effectiveReactions, totalVolume, rows };
}

export interface MasterMixPreset {
  id: string;
  name: string;
  description: string;
  reactionVolume: number;
  excessPercent: number;
  deadVolume: number;
  components: { name: string; perReaction: number }[];
}

export const MASTER_MIX_PRESETS: MasterMixPreset[] = [
  {
    id: 'q5_2x',
    name: 'NEB Q5 2X High-Fidelity PCR',
    description: 'Ultra high-fidelity amplification with 2X master mix (50 µL reaction).',
    reactionVolume: 50,
    excessPercent: 10,
    deadVolume: 20,
    components: [
      { name: 'Q5 High-Fidelity 2X Master Mix', perReaction: 25 },
      { name: '10 µM Forward Primer', perReaction: 2.5 },
      { name: '10 µM Reverse Primer', perReaction: 2.5 },
      { name: 'DNA Template', perReaction: 1.0 },
    ],
  },
  {
    id: 'standard_taq',
    name: 'Standard Taq DNA Polymerase PCR',
    description: 'Classic 3-component Taq amplification with separate buffer and dNTPs (50 µL reaction).',
    reactionVolume: 50,
    excessPercent: 10,
    deadVolume: 20,
    components: [
      { name: '10X Standard Taq Reaction Buffer', perReaction: 5.0 },
      { name: '10 mM dNTP Solution Mix', perReaction: 1.0 },
      { name: '10 µM Forward Primer', perReaction: 1.0 },
      { name: '10 µM Reverse Primer', perReaction: 1.0 },
      { name: 'Taq DNA Polymerase (5 U/µL)', perReaction: 0.25 },
      { name: 'DNA Template', perReaction: 1.0 },
    ],
  },
  {
    id: 'neb_kld',
    name: 'NEB KLD Enzyme Mix (Kinase, Ligase, DpnI)',
    description: 'Post-PCR circularization and template removal for site-directed mutagenesis (10 µL reaction).',
    reactionVolume: 10,
    excessPercent: 10,
    deadVolume: 10,
    components: [
      { name: 'Q5 PCR Product', perReaction: 1.0 },
      { name: '2X KLD Reaction Buffer', perReaction: 5.0 },
      { name: '10X KLD Enzyme Mix', perReaction: 1.0 },
    ],
  },
  {
    id: 'infusion_hd',
    name: 'Takara In-Fusion HD Cloning',
    description: 'Seamless homologous recombination cloning of 15 bp overlapping ends (10 µL reaction).',
    reactionVolume: 10,
    excessPercent: 10,
    deadVolume: 10,
    components: [
      { name: '5X In-Fusion HD Enzyme Premix', perReaction: 2.0 },
      { name: 'Linearized Vector DNA (50-100 ng)', perReaction: 1.0 },
      { name: 'Purified PCR Insert (2:1 molar ratio)', perReaction: 2.0 },
    ],
  },
  {
    id: 'blunt_ligation_peg',
    name: 'Blunt-End T4 DNA Ligation with PEG',
    description: 'High-efficiency blunt-end ligation enhanced by macromolecular crowding (5% PEG-6000, 20 µL reaction).',
    reactionVolume: 20,
    excessPercent: 10,
    deadVolume: 15,
    components: [
      { name: '10X T4 DNA Ligase Buffer', perReaction: 2.0 },
      { name: '50% PEG-4000/6000 Solution (5% final)', perReaction: 2.0 },
      { name: 'Linearized Vector DNA', perReaction: 2.0 },
      { name: 'Blunt Insert DNA (3X molar ratio)', perReaction: 4.0 },
      { name: 'T4 DNA Ligase (High Concentration)', perReaction: 1.0 },
    ],
  },
  {
    id: 'cohesive_ligation',
    name: 'Cohesive / Sticky-End Restriction Ligation',
    description: 'Standard cohesive overhang ligation with T4 DNA Ligase (20 µL reaction).',
    reactionVolume: 20,
    excessPercent: 10,
    deadVolume: 15,
    components: [
      { name: '10X T4 DNA Ligase Buffer', perReaction: 2.0 },
      { name: 'Digested Vector DNA (50 ng)', perReaction: 2.0 },
      { name: 'Digested Insert DNA (3:1 molar ratio)', perReaction: 4.0 },
      { name: 'T4 DNA Ligase (400 U/µL)', perReaction: 1.0 },
    ],
  },
  {
    id: 'golden_gate',
    name: 'Golden Gate Type IIS Assembly (BsaI / BsmBI)',
    description: 'One-pot restriction-ligation assembly using Type IIS enzymes and T4 Ligase (20 µL reaction).',
    reactionVolume: 20,
    excessPercent: 10,
    deadVolume: 15,
    components: [
      { name: '10X T4 DNA Ligase Buffer', perReaction: 2.0 },
      { name: 'Destination Vector (~20 fmol)', perReaction: 1.5 },
      { name: 'Insert Modules Mix (~40 fmol each)', perReaction: 4.0 },
      { name: 'Type IIS Enzyme (BsaI-HFv2 / BsmBI-v2)', perReaction: 1.0 },
      { name: 'T4 DNA Ligase (High Concentration)', perReaction: 1.0 },
    ],
  },
];

