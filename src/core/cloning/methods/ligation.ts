/* Restriction-enzyme cloning: digest a vector and an insert, ligate with T4 DNA ligase.

   Rules:
   - Sticky ends ligate when kind (5′/3′), length and overhang letters agree (so BamHI and
     BglII ends are compatible); blunt ends ligate to blunt ends. Fill-in of 5′ overhangs and
     chew-back of 3′ overhangs (T4 DNA polymerase / Klenow / Quick Blunting) can make any
     two ends blunt-compatible.
   - Ligase needs a 5′ phosphate at a nick: restriction ends have one, PCR products do not
     unless the primers were phosphorylated or the insert is treated with T4 PNK.
   - Reaction: NEB T4 DNA Ligase (M0202) protocol; insert amount from the molar ratio with
     the NEBioCalculator formula. */

import type { Finding } from '../types';
import { ligate, type ProductJunction } from '../assemble';
import { restrictionSites } from '@/core/nucleic/sequence';
import { digest, findEnzyme, type DigestFragment } from '../digest';
import { ligationInsertNg } from '../amounts';
import {
  bluntEnds, dephosphorylate, flipMolecule, phosphorylate, describeEnd, type Molecule,
} from '../molecule';
import type { CloningProtocol } from '../protocol';

export interface LigationInput {
  vector: Molecule;
  insert: Molecule;
  /** Enzymes that open the vector (none if it is already linear). */
  vectorEnzymes: string[];
  /** Enzymes that release the insert (none if it is already the fragment to clone). */
  insertEnzymes: string[];
  /** Override which digest fragment to use (index into the digest, source order). */
  vectorFragment?: number;
  insertFragment?: number;
  /** Fill in / chew back both molecules to blunt ends before ligating. */
  makeBlunt?: boolean;
  dephosphorylateVector?: boolean;
  phosphorylateInsert?: boolean;
}

export interface LigationAmountsInput {
  vectorNg: number;
  /** Insert:vector molar ratio (NEB: 3:1 for cohesive ends, up to 10:1 for blunt). */
  ratio: number;
  vectorNgPerUl: number;
  insertNgPerUl: number;
}

export interface FragmentChoice {
  index: number;
  length: number;
  leftEnzyme: string | null;
  rightEnzyme: string | null;
}

export interface LigationDesign {
  product: Molecule | null;
  junctions: ProductJunction[];
  vectorFragment: Molecule | null;
  insertFragment: Molecule | null;
  vectorChoices: FragmentChoice[];
  insertChoices: FragmentChoice[];
  /** Was the insert forced into one orientation? False means both orientations ligate. */
  directional: boolean;
  /** The insert had to be flipped to fit (reverse orientation of the source). */
  insertFlipped: boolean;
  /** Restriction sites regenerated at the junctions (enzyme name per junction). */
  regeneratedSites: string[][];
  findings: Finding[];
}

function choices(fragments: DigestFragment[]): FragmentChoice[] {
  return fragments.map((fragment, index) => ({ index, length: fragment.molecule.sequence.length, leftEnzyme: fragment.leftEnzyme, rightEnzyme: fragment.rightEnzyme }));
}

function warning(code: string, message: string): Finding {
  return { code, severity: 'warning', message };
}

function blocker(code: string, message: string): Finding {
  return { code, severity: 'blocker', message };
}

function pick(molecule: Molecule, enzymes: string[], role: 'vector' | 'insert', override: number | undefined, findings: Finding[]): { fragment: Molecule | null; choices: FragmentChoice[] } {
  if (!enzymes.length) {
    if (molecule.topology === 'circular') {
      findings.push(blocker('NEEDS_ENZYME', `The ${role} is circular: choose the enzyme(s) that ${role === 'vector' ? 'open it' : 'release the insert'}.`));
      return { fragment: null, choices: [] };
    }
    return { fragment: molecule, choices: [] };
  }
  const result = digest(molecule, enzymes);
  if (result.unknown.length) {
    findings.push(blocker('UNKNOWN_ENZYME', `${result.unknown.join(', ')} ${result.unknown.length > 1 ? 'are' : 'is'} not in the enzyme list.`));
    return { fragment: null, choices: [] };
  }
  const missing = enzymes.filter(name => !result.sites.some(site => site.enzyme === name));
  if (missing.length) {
    findings.push(blocker('NO_SITE', `${missing.join(' and ')} ${missing.length > 1 ? 'do' : 'does'} not cut the ${role}.`));
    return { fragment: null, choices: [] };
  }
  const list = choices(result.fragments);
  // Fragments bounded by two enzyme cuts (the ends of a linear molecule are not cuts).
  const bounded = result.fragments.map((fragment, index) => ({ fragment, index })).filter(entry => entry.fragment.leftEnzyme && entry.fragment.rightEnzyme);
  if (!bounded.length) {
    findings.push(blocker('NO_FRAGMENT', `No ${role} fragment lies between two cuts.`));
    return { fragment: null, choices: list };
  }
  let chosen = bounded[0]!;
  if (override !== undefined && result.fragments[override]) chosen = { fragment: result.fragments[override]!, index: override };
  else if (role === 'vector') chosen = bounded.reduce((a, b) => b.fragment.molecule.sequence.length > a.fragment.molecule.sequence.length ? b : a);
  else chosen = bounded.reduce((a, b) => b.fragment.molecule.sequence.length < a.fragment.molecule.sequence.length ? b : a);
  // A circular molecule is opened once per enzyme; a linear one is cut at each end, twice in all.
  const expectedCuts = molecule.topology === 'circular' ? enzymes.length : 2;
  if (result.sites.length > expectedCuts) {
    const extra = [...new Set(enzymes.filter(name => result.sites.filter(site => site.enzyme === name).length > 1))].join(', ');
    findings.push(warning('MULTIPLE_SITES', `The ${role} has ${result.sites.length} cut sites for ${enzymes.join(' + ')} (${extra || 'extra sites'} cut more than the design needs), giving ${result.fragments.length} fragments; check that fragment ${chosen.index + 1} is the one you want.`));
  }
  return { fragment: chosen.fragment.molecule, choices: list };
}

/** Enzymes whose recognition site is recreated across each junction of a circular product. */
function regenerated(product: Molecule, junctions: ProductJunction[], enzymes: string[]): string[][] {
  const n = product.sequence.length;
  return junctions.map(junction => {
    const names: string[] = [];
    for (const name of new Set(enzymes)) {
      const enzyme = findEnzyme(name);
      if (!enzyme) continue;
      const span = enzyme.site.length;
      const around = ((junction.position % n) + n) % n;
      const window = (product.sequence + product.sequence).slice(around + n - span, around + n + span);
      const sites = restrictionSites(window, [enzyme], { circular: false });
      // A site counts if it straddles the junction (starts before it and ends after it).
      if (sites.some(site => site.position - 1 < span && site.position - 1 + span > span)) names.push(name);
    }
    return names;
  });
}

export function designLigation(input: LigationInput): LigationDesign {
  const findings: Finding[] = [];
  const empty = (extra: Finding[], partial: Partial<LigationDesign> = {}): LigationDesign => ({
    product: null, junctions: [], vectorFragment: null, insertFragment: null, vectorChoices: [], insertChoices: [],
    directional: false, insertFlipped: false, regeneratedSites: [], findings: [...findings, ...extra], ...partial,
  });

  const vector = pick(input.vector, input.vectorEnzymes, 'vector', input.vectorFragment, findings);
  const insert = pick(input.insert, input.insertEnzymes, 'insert', input.insertFragment, findings);
  if (!vector.fragment || !insert.fragment) return empty([], { vectorChoices: vector.choices, insertChoices: insert.choices });

  let v = vector.fragment;
  let i = insert.fragment;
  if (input.makeBlunt) { v = bluntEnds(v); i = bluntEnds(i); }
  if (input.phosphorylateInsert) i = phosphorylate(i);
  if (input.dephosphorylateVector) v = dephosphorylate(v);

  const forward = ligate([v, i], true, 'Ligation product');
  const reverse = ligate([v, flipMolecule(i)], true, 'Ligation product');
  const forwardOk = forward.product !== null;
  const reverseOk = reverse.product !== null;

  const details = {
    vectorFragment: v, insertFragment: i, vectorChoices: vector.choices, insertChoices: insert.choices,
  };
  if (!forwardOk && !reverseOk) {
    const blockers = forward.findings.filter(finding => finding.severity === 'blocker');
    const hint = blockers.some(finding => finding.code === 'INCOMPATIBLE_ENDS') && !input.makeBlunt
      ? ' Blunting both molecules (fill-in of 5′ overhangs, chew-back of 3′ overhangs) would make the ends compatible, at the cost of directionality and of the sites.'
      : '';
    return empty([
      ...blockers.map(finding => ({ ...finding, message: `${finding.message}${hint}` })),
    ], details);
  }

  const useForward = forwardOk;
  const chosen = (useForward ? forward : reverse);
  const directional = !(forwardOk && reverseOk);
  if (!directional) {
    findings.push(warning('NOT_DIRECTIONAL', `The insert can ligate in either orientation (left ${describeEnd(i, 'left')}, right ${describeEnd(i, 'right')}); expect a mixture. Screen by colony PCR or a diagnostic digest, or use two different enzymes.`));
  }
  findings.push(...chosen.findings);
  const regen = regenerated(chosen.product!, chosen.junctions, [...input.vectorEnzymes, ...input.insertEnzymes]);
  return {
    product: chosen.product,
    junctions: chosen.junctions,
    ...details,
    insertFragment: useForward ? i : flipMolecule(i),
    directional,
    insertFlipped: !useForward,
    regeneratedSites: regen,
    findings,
  };
}

/** T4 DNA Ligase reaction (NEB M0202) with insert amount from the requested molar ratio. */
export function ligationProtocol(design: LigationDesign, amounts: LigationAmountsInput): CloningProtocol | null {
  if (!design.product || !design.vectorFragment || !design.insertFragment) return null;
  const vectorBp = design.vectorFragment.sequence.length;
  const insertBp = design.insertFragment.sequence.length;
  const insertNg = ligationInsertNg(amounts.vectorNg, vectorBp, insertBp, amounts.ratio);
  const blunt = design.junctions.some(junction => junction.kind === 'blunt');
  const notes: string[] = [];
  if (amounts.ratio < 1 || amounts.ratio > 10) notes.push('NEB recommends insert:vector ratios between 1:1 and 10:1 (3:1 is typical).');
  if (blunt && amounts.ratio < 3) notes.push('Blunt-end ligations work best at a higher insert:vector ratio (up to 10:1) and with more ligase.');
  return {
    title: `${blunt ? 'Blunt' : 'Cohesive'}-end ligation with T4 DNA Ligase`,
    source: 'NEB T4 DNA Ligase (M0202) protocol; insert mass from the NEBioCalculator ligation formula',
    reactions: [{
      title: 'Ligation reaction',
      totalVolumeUl: 20,
      components: [
        { name: 'T4 DNA Ligase Buffer', stock: '10X', volumeUl: 2 },
        { name: `Vector (${vectorBp.toLocaleString()} bp)`, stock: `${amounts.vectorNgPerUl} ng/µL`, amount: `${amounts.vectorNg} ng`, volumeUl: amounts.vectorNg / amounts.vectorNgPerUl },
        { name: `Insert (${insertBp.toLocaleString()} bp)`, stock: `${amounts.insertNgPerUl} ng/µL`, amount: `${Number(insertNg.toPrecision(3))} ng (${amounts.ratio}:1 molar)`, volumeUl: insertNg / amounts.insertNgPerUl },
        { name: 'T4 DNA Ligase', stock: '400 U/µL', volumeUl: 1 },
        { name: 'Nuclease-free water', volumeUl: null },
      ],
      notes,
    }],
    steps: [
      { text: 'Assemble on ice, adding the T4 DNA Ligase last. Mix by pipetting; do not vortex.' },
      blunt
        ? { text: 'Incubate at room temperature for 2 hours (or 16 °C overnight).', temperatureC: 25, minutes: 120 }
        : { text: 'Incubate at room temperature for 10 minutes (or 16 °C overnight for the highest efficiency).', temperatureC: 25, minutes: 10 },
      { text: 'Heat inactivate at 65 °C for 10 minutes.', temperatureC: 65, minutes: 10 },
      { text: 'Chill on ice, then transform 1–5 µL into 50 µL of competent cells.' },
      { text: 'Controls: vector only with ligase (background from uncut or self-ligated vector) and vector only without ligase (uncut vector).' },
    ],
  };
}
