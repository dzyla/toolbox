/**
 * Residue naming helpers for the structure viewer: one-letter codes, modified-residue
 * parents and polymer-type classification.
 */
import { AA_3TO1, NUCLEIC_TO1 } from '@/core/protein/structure';
import type { PolymerType } from './model';

/** Modified residue -> parent residue, used when the file does not say (fallback table). */
export const MODIFIED_PARENT: Record<string, string> = {
  MSE: 'MET', SEP: 'SER', TPO: 'THR', PTR: 'TYR', HYP: 'PRO', MLY: 'LYS', CSO: 'CYS',
  CSD: 'CYS', KCX: 'LYS', PCA: 'GLU', M3L: 'LYS', CME: 'CYS',
  PSU: 'U', '5MC': 'C', '1MA': 'A', '2MG': 'G', H2U: 'U', OMG: 'G', OMC: 'C',
};

/** Unmodified residues: these never get a parentCompId. */
export const STANDARD_COMPS: ReadonlySet<string> = new Set([
  'ALA', 'ARG', 'ASN', 'ASP', 'CYS', 'GLN', 'GLU', 'GLY', 'HIS', 'ILE', 'LEU', 'LYS', 'MET',
  'PHE', 'PRO', 'SER', 'THR', 'TRP', 'TYR', 'VAL', 'SEC', 'PYL', 'UNK',
  'A', 'C', 'G', 'U', 'I', 'N', 'DA', 'DC', 'DG', 'DT', 'DU', 'DI',
]);

const lookup = (c: string): string | undefined =>
  c === 'UNK' ? 'X' : c === 'N' ? 'N' : (AA_3TO1[c] ?? NUCLEIC_TO1[c]);

/** True when the component is a standard or known modified polymer residue. */
export function isPolymerComp(compId: string): boolean {
  const c = compId.toUpperCase();
  return c in AA_3TO1 || c in NUCLEIC_TO1 || c in MODIFIED_PARENT || c === 'UNK' || c === 'N';
}

/** One-letter code for a residue; `parent` (when known) decides modified residues. 'X' if unknown. */
export function oneLetterFor(compId: string, parent?: string): string {
  const c = compId.toUpperCase();
  if (parent) {
    const p = parent.toUpperCase();
    const viaParent = lookup(p) ?? lookup(MODIFIED_PARENT[p] ?? '');
    if (viaParent) return viaParent;
  }
  const direct = lookup(c);
  if (direct) return direct;
  const fallback = MODIFIED_PARENT[c];
  return (fallback && lookup(fallback)) || 'X';
}

export function polymerTypeFromCif(type: string): PolymerType {
  const t = type.toLowerCase();
  if (t.includes('hybrid') || t.includes('peptide nucleic')) return 'other';
  if (t.startsWith('polypeptide')) return 'protein';
  if (t.includes('polydeoxyribonucleotide')) return 'dna';
  if (t.includes('polyribonucleotide')) return 'rna';
  return 'other';
}
