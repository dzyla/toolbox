/* DNA amounts for cloning reactions.

   dsDNA molecular weight: MW = 36.04 + 615.94 × bp g/mol (NEBioCalculator / NEBuilder
   Protocol Calculator; 615.94 is the mean mass of a Na-salt base pair, 36.04 the
   2 × H2O of the linear ends). */

export function dsDnaMolecularWeight(bp: number): number {
  return 36.04 + 615.94 * bp;
}

/** pmol/µL from ng/µL. */
export function pmolPerUl(ngPerUl: number, bp: number): number {
  return ngPerUl * 1000 / dsDnaMolecularWeight(bp);
}

export function pmolToNg(pmol: number, bp: number): number {
  return pmol * dsDnaMolecularWeight(bp) / 1000;
}

/**
 * Insert mass for a ligation at the given insert:vector molar ratio (NEBioCalculator):
 * insert ng = vector ng × insert bp / vector bp × ratio.
 */
export function ligationInsertNg(vectorNg: number, vectorBp: number, insertBp: number, ratio: number): number {
  return vectorNg * insertBp / vectorBp * ratio;
}

export interface AssemblyFragmentAmountInput {
  name: string;
  bp: number;
  ngPerUl: number;
  isVector: boolean;
}

export interface AssemblyFragmentAmount extends AssemblyFragmentAmountInput {
  pmol: number;
  ng: number;
  volumeUl: number;
}

export interface AssemblyAmounts {
  fragments: AssemblyFragmentAmount[];
  totalPmol: number;
  dnaVolumeUl: number;
  waterUl: number;
  masterMixUl: number;
  totalVolumeUl: number;
  incubationMinutes: number;
  transformUl: number;
  notes: string[];
}

/**
 * NEBuilder HiFi amounts (NEB E2621/E5520 protocol; NEBuilder Protocol Calculator rules).
 * 2–3 fragments: vector:insert 1:2 (inserts ≤ 200 bp at 5-fold), 0.03–0.2 pmol total;
 * 4–6 fragments: 0.05 pmol each. 10 µL 2X master mix in 20 µL; 50 °C for 15 min
 * (≤ 3 fragments) or 60 min (> 3).
 */
export function nebuilderAmounts(input: AssemblyFragmentAmountInput[]): AssemblyAmounts {
  const n = input.length;
  const notes: string[] = [];
  const vectors = input.filter(fragment => fragment.isVector).length;
  const small = input.filter(fragment => fragment.bp <= 200).length;
  let pmols: number[];
  if (n >= 4) {
    pmols = input.map(() => 0.05);
  } else if (n === 1) {
    pmols = [0.05];
  } else {
    const large = n - small - vectors;
    const total = n === 2 ? 0.25 * small + 0.05 * vectors + 0.1 * large : 0.25 * small + 0.025 * vectors + 0.05 * large;
    const unit = total / (2 * (n - small) - vectors + 5 * small);
    pmols = input.map(fragment => fragment.bp <= 200 ? 5 * unit : fragment.isVector ? unit : 2 * unit);
  }
  const fragments = input.map((fragment, index): AssemblyFragmentAmount => {
    const pmol = pmols[index]!;
    const volumeUl = pmol / pmolPerUl(fragment.ngPerUl, fragment.bp);
    if (volumeUl < 0.2) notes.push(`Dilute ${fragment.name}: it needs only ${volumeUl.toFixed(2)} µL, which is too little to pipette accurately.`);
    return { ...fragment, pmol, ng: pmolToNg(pmol, fragment.bp), volumeUl };
  });
  const dnaVolumeUl = fragments.reduce((sum, fragment) => sum + fragment.volumeUl, 0);
  let totalVolumeUl = 20;
  if (dnaVolumeUl > 10) {
    totalVolumeUl = 2 * dnaVolumeUl;
    notes.push('The DNA exceeds 10 µL, so the master mix is scaled up to keep it at 1X. Use 10 % of the reaction for transformation.');
  }
  if (totalVolumeUl > 30) notes.push('The reaction exceeds 30 µL; concentrate the fragments if possible.');
  if (vectors > 1) notes.push('Only one fragment should be marked as the vector.');
  if (n > 6) notes.push('More than 6 fragments is outside the validated NEBuilder range.');
  input.filter(fragment => fragment.bp < 120).forEach(fragment => notes.push(`${fragment.name} is shorter than 120 bp; fragments this short assemble poorly.`));
  return {
    fragments,
    totalPmol: pmols.reduce((sum, pmol) => sum + pmol, 0),
    dnaVolumeUl,
    waterUl: Math.max(0, totalVolumeUl / 2 - dnaVolumeUl),
    masterMixUl: totalVolumeUl / 2,
    totalVolumeUl,
    incubationMinutes: n > 3 ? 60 : 15,
    transformUl: totalVolumeUl * 0.1,
    notes,
  };
}

export interface InfusionAmounts {
  vector: { ng: number; volumeUl: number; pmol: number };
  inserts: Array<{ name: string; bp: number; ng: number; pmol: number; volumeUl: number }>;
  premixUl: number;
  waterUl: number;
  totalVolumeUl: number;
  incubation: string;
  transformUl: number;
  notes: string[];
}

/**
 * In-Fusion Snap Assembly reaction (Takara manual): 50–200 ng linearised vector and a
 * 2:1 insert:vector molar ratio (2:2:1 for two inserts), 2 µL 5X master mix in 10 µL
 * (doubled to 20 µL when vector + insert exceed 7 µL), 15 min at 50 °C, then 2.5 µL
 * into 50 µL competent cells (never more than 5 µL). Inserts under 0.5 kb: at most 50 ng.
 */
export function infusionAmounts(
  vector: { bp: number; ngPerUl: number },
  inserts: Array<{ name: string; bp: number; ngPerUl: number }>,
  vectorNg = 100,
): InfusionAmounts {
  const notes: string[] = [];
  if (vectorNg < 50 || vectorNg > 200) notes.push('Takara recommends 50–200 ng of linearised vector.');
  const vectorVolume = vectorNg / vector.ngPerUl;
  const vectorPmol = vectorNg * 1000 / dsDnaMolecularWeight(vector.bp);
  const rows = inserts.map(insert => {
    let ng = pmolToNg(2 * vectorPmol, insert.bp);
    if (insert.bp < 500 && ng > 50) {
      ng = 50;
      notes.push(`${insert.name} is under 0.5 kb; its amount was capped at 50 ng (the molar ratio is above 2:1).`);
    }
    if (ng < 10) notes.push(`${insert.name} needs only ${ng.toFixed(1)} ng; Takara recommends at least 10 ng, so raise the vector amount or accept a higher molar ratio.`);
    if (ng > 200) notes.push(`${insert.name} needs ${Math.round(ng)} ng, above the 200 ng recommended maximum.`);
    return { name: insert.name, bp: insert.bp, ng, pmol: ng * 1000 / dsDnaMolecularWeight(insert.bp), volumeUl: ng / insert.ngPerUl };
  });
  const dnaVolume = vectorVolume + rows.reduce((sum, row) => sum + row.volumeUl, 0);
  const large = dnaVolume > 7;
  const totalVolumeUl = large ? 20 : 10;
  const premixUl = large ? 4 : 2;
  const waterUl = totalVolumeUl - premixUl - dnaVolume;
  if (waterUl < 0) notes.push('The DNA volume is too large even for a 20 µL reaction; concentrate the vector or inserts.');
  if (large) notes.push('Vector plus inserts exceed 7 µL, so the reaction is doubled to 20 µL.');
  if (inserts.length > 2) notes.push('Takara suggests 20 bp homology and validated ratios for up to four fragments; check the manual for more than two inserts.');
  return {
    vector: { ng: vectorNg, volumeUl: vectorVolume, pmol: vectorPmol },
    inserts: rows,
    premixUl,
    waterUl: Math.max(0, waterUl),
    totalVolumeUl,
    incubation: '50 °C for 15 min, then place on ice',
    transformUl: Math.min(5, totalVolumeUl / 4),
    notes,
  };
}
