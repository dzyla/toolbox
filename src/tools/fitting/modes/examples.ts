/* Synthetic, deterministic example data for the multi-series analyses. Generated from the same rate laws the fits use,
   with small repeatable noise, so the fitted values can be checked against the "truth" stated in each label. */
import { inhibitionVelocity, morrisonFraction } from '@/core/fitting/global';
import { itcHeats } from '@/core/fitting/itc';

const noise = (i: number, a: number) => a * Math.sin(i * 5.713 + 0.9);

/** Competitive inhibitor: Vmax 100, Km 4, Ki 5 (units arbitrary: [S] and [I] in µM, v in µM/min). */
export function inhibitionExample(): string {
  const S = [0.5, 1, 2, 4, 8, 16, 32];
  const I = [0, 2, 5, 10, 20];
  let k = 0;
  const rows = I.flatMap(i => S.map(s => `${s}\t${i}\t${(inhibitionVelocity('competitive', s, i, [100, 4, 5, 5]) * (1 + noise(k++, 0.012))).toFixed(2)}`));
  return `# Synthetic example: competitive inhibitor, true Vmax = 100, Km = 4, Ki = 5\n# [S]\t[I]\tv\n${rows.join('\n')}`;
}

/** Tight-binding inhibitor: [E] = 5 nM, Ki,app = 1.5 nM. */
export function morrisonExample(): string {
  const I = [0, 0.5, 1, 2, 3, 4, 6, 8, 12, 20];
  const rows = I.map((x, i) => `${x}\t${(100 * morrisonFraction(5, x, 1.5) + noise(i, 0.4)).toFixed(2)}`);
  return `# Synthetic example: tight-binding inhibitor, true [E] = 5 nM, Ki,app = 1.5 nM\n# [I] (nM)\tactivity (% of uninhibited)\n${rows.join('\n')}`;
}

/** One-site ITC on an iTC200-like setup: 20 µM macromolecule in the cell, 200 µM ligand; n = 1.0, K = 1e6 M⁻¹, ΔH = −9 kcal/mol. */
export function itcExample(): string {
  const volumes = [0.4, ...Array.from({ length: 19 }, () => 2)];
  const dQ = itcHeats({ cellVolumeUl: 200, cellConcUm: 20, syringeConcUm: 200, volumesUl: volumes }, 1, 1e6, -9000).dQ;
  const rows = dQ.map((q, i) => `${volumes[i]}\t${(q * 1e6 + noise(i, 0.12)).toFixed(3)}`);
  return `# Synthetic example: n = 1.0, K = 1e6 M^-1 (KD = 1 µM), ΔH = -9 kcal/mol; cell 20 µM (200 µL), syringe 200 µM\n# volume (µL)\theat (µcal)\n${rows.join('\n')}`;
}

/** Six-concentration 1:1 sensorgram set: kon = 2e5 M⁻¹s⁻¹, koff = 1e-3 s⁻¹ (KD = 5 nM), Rmax = 100; injection ends at 300 s. */
export function sprExample(): string {
  const concNm = [1.5625, 3.125, 6.25, 12.5, 25, 50];
  const t = Array.from({ length: 121 }, (_, i) => i * 8);
  const kon = 2e5, koff = 1e-3, rmax = 100, td = 300;
  const cols = concNm.map((c, j) => {
    const kobs = kon * c * 1e-9 + koff, req = (rmax * kon * c * 1e-9) / kobs;
    return t.map((x, i) => ((x <= td ? req * (1 - Math.exp(-kobs * x)) : req * (1 - Math.exp(-kobs * td)) * Math.exp(-koff * (x - td))) + noise(i + j * 17, 0.15)).toFixed(3));
  });
  const header = `Time (s)\t${concNm.map(c => `${c} nM`).join('\t')}`;
  const rows = t.map((x, i) => `${x}\t${cols.map(c => c[i]).join('\t')}`);
  return `# Synthetic example: kon = 2e5 M^-1 s^-1, koff = 1e-3 s^-1 (KD = 5 nM), Rmax = 100; injection stops at 300 s\n${header}\n${rows.join('\n')}`;
}
