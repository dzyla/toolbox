/** Helpers shared by the sequence strip and the model hook: residue names, numbering, lookups. */
import type { Entity, PolymerChain, ResidueRef, SeqResidue, StructureModel } from '@/core/structure';

export const BLOCK_LENGTH = 10;

export type Numbering = 'auth' | 'label';

const TYPE_NAME = { protein: 'Protein', dna: 'DNA', rna: 'RNA', other: 'Polymer' } as const;

/** What an entity is called in the UI: its description, or its polymer type when the file has none. */
export const entityName = (e: Entity | undefined): string =>
  e?.description || TYPE_NAME[e?.polymerType ?? 'other'];

export const chainLabel = (c: PolymerChain): string => `${c.labelAsymId} [auth ${c.authAsymId}]`;

/** The residue's number in the chosen scheme; `fallback` when auth numbering is asked for but missing. */
export function residueNumber(r: SeqResidue, numbering: Numbering): { text: string; fallback: boolean } {
  if (numbering === 'auth' && r.auth) return { text: `${r.auth.seqId}${r.auth.insCode}`, fallback: false };
  return { text: String(r.seqId), fallback: numbering === 'auth' };
}

/** Accessible name, always in auth numbering (label numbering when the file gives no auth number). */
export const residueName = (c: PolymerChain, r: SeqResidue): string =>
  `Residue ${c.authAsymId} ${residueNumber(r, 'auth').text} ${r.compId}`;

export const isModified = (r: SeqResidue): boolean => !!r.parentCompId;
export const isUnknown = (r: SeqResidue): boolean => r.oneLetter === 'X' && !r.parentCompId;

/** Tooltip for the residues that need one: modified, unknown, not modelled. */
export function residueTitle(r: SeqResidue): string | undefined {
  const parts: string[] = [];
  if (r.parentCompId) parts.push(`${r.compId} (modified, parent ${r.parentCompId})`);
  else if (isUnknown(r)) parts.push(`${r.compId} (unknown, shown as X)`);
  if (!r.modelled) parts.push('Not modelled');
  return parts.length ? parts.join(' · ') : undefined;
}

/** A Mol* reference for a residue that has coordinates; null for unmodelled residues. */
export const residueRef = (c: PolymerChain, r: SeqResidue): ResidueRef | null =>
  r.modelled && r.auth ? { authAsymId: c.authAsymId, authSeqId: r.auth.seqId, insCode: r.auth.insCode } : null;

/** Mol* references for the modelled residues of a label seq range (inclusive); unmodelled ones are skipped. */
export function refsInRange(c: PolymerChain, from: number, to: number): ResidueRef[] {
  const out: ResidueRef[] = [];
  for (const r of c.residues) {
    if (r.seqId < from || r.seqId > to) continue;
    const ref = residueRef(c, r);
    if (ref) out.push(ref);
  }
  return out;
}

export const refKey = (r: ResidueRef): string => `${r.authAsymId}\u0000${r.authSeqId}\u0000${r.insCode}`;

/** Where a modelled residue sits in the polymer chains, looked up by its auth reference. */
export interface ResidueLocation { labelAsymId: string; seqId: number; index: number }

export function indexResidues(m: StructureModel): Map<string, ResidueLocation> {
  const map = new Map<string, ResidueLocation>();
  for (const c of m.chains) {
    c.residues.forEach((r, index) => {
      const ref = residueRef(c, r);
      if (ref && !map.has(refKey(ref))) map.set(refKey(ref), { labelAsymId: c.labelAsymId, seqId: r.seqId, index });
    });
  }
  return map;
}

export interface ChainGroup { entityId: string; label: string; chains: PolymerChain[] }

/** Polymer chains grouped by entity, in file order: `Entity 1 · Protein sopB · chains A, B, C (3 copies)`. */
export function chainGroups(m: StructureModel): ChainGroup[] {
  const groups = new Map<string, PolymerChain[]>();
  for (const c of m.chains) {
    const list = groups.get(c.entityId);
    if (list) list.push(c);
    else groups.set(c.entityId, [c]);
  }
  return Array.from(groups, ([entityId, chains]) => {
    const e = m.entities.find(x => x.id === entityId);
    const ids = chains.map(c => c.labelAsymId).join(', ');
    const n = chains.length;
    return {
      entityId,
      chains,
      label: `Entity ${entityId} · ${entityName(e)} · ${n === 1 ? 'chain' : 'chains'} ${ids} (${n} ${n === 1 ? 'copy' : 'copies'})`,
    };
  });
}
