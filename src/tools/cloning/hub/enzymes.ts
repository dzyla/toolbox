import { cutCounts, cutSites, ENZYME_TABLE, findEnzyme } from '@/core/cloning/digest';
import type { Molecule } from '@/core/cloning/molecule';

const COMMON_MCS = ['EcoRI', 'HindIII', 'BamHI', 'KpnI', 'SacI', 'XbaI', 'SalI', 'PstI', 'SphI', 'NdeI', 'XhoI', 'NcoI', 'NotI'];
/** NEB sells the enzymes the tools' protocols are written for; list them before other suppliers'. */
const isNeb = (name: string) => (findEnzyme(name)?.suppliers ?? '').includes('N');

/** Names of enzymes that cut a circular or linear molecule exactly once, NEB enzymes first. */
export function singleCutters(molecule: Pick<Molecule, 'sequence' | 'topology'>): string[] {
  const counts = cutCounts(molecule, ENZYME_TABLE);
  return ENZYME_TABLE.filter(enzyme => counts.get(enzyme.name) === 1).map(enzyme => enzyme.name)
    .sort((a, b) => Number(isNeb(b)) - Number(isNeb(a)) || a.localeCompare(b));
}

/** Two single cutters to open a vector with: the first common polylinker enzymes, else the first two listed. */
export function suggestPair(cutters: string[]): [string, string] {
  const common = COMMON_MCS.filter(name => cutters.includes(name));
  const pool = common.length >= 2 ? common : cutters;
  return [pool[0] ?? '', pool[1] ?? pool[0] ?? ''];
}

/**
 * Order two enzymes so the kept fragment (from the first enzyme's cut around to the second's)
 * is the larger arc of a circular molecule (a backbone) or the smaller one (an excised insert).
 */
export function orderEnzymes(molecule: Pick<Molecule, 'sequence' | 'topology'>, a: string, b: string, keep: 'larger' | 'smaller'): [string, string] {
  const first = findEnzyme(a);
  const second = findEnzyme(b);
  if (!first || !second || a === b) return [a, b];
  const siteA = cutSites(molecule, [first])[0];
  const siteB = cutSites(molecule, [second])[0];
  if (!siteA || !siteB) return [a, b];
  const n = molecule.sequence.length;
  const arcAtoB = (((siteB.cutTop - siteA.cutTop) % n) + n) % n;
  const aFirstIsLarger = arcAtoB >= n - arcAtoB;
  return (keep === 'larger') === aFirstIsLarger ? [a, b] : [b, a];
}
