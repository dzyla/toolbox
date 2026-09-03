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
