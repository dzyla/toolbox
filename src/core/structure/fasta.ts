/** FASTA output for a StructureModel: whole structure, one entity, one chain or a residue range. */
import type { Entity, PolymerChain, StructureModel } from './model';

export type FastaScope =
  | { kind: 'all' }
  | { kind: 'entity'; entityId: string }
  | { kind: 'chain'; labelAsymId: string }
  | { kind: 'range'; labelAsymId: string; from: number; to: number };

export interface FastaOptions { mode: 'full' | 'modelled'; gap: '-' | '' }

const DEFAULT_OPTS: FastaOptions = { mode: 'full', gap: '-' };

const TYPE_NAME = { protein: 'Protein', dna: 'DNA', rna: 'RNA', other: 'Polymer' } as const;

const entryId = (m: StructureModel): string => m.header.id ?? m.name;

function describe(e: Entity | undefined): string {
  if (!e) return '';
  return e.description || TYPE_NAME[e.polymerType ?? 'other'];
}

const chainLabel = (chains: PolymerChain[], plural = true): string => {
  return `${plural ? 'Chains' : 'Chain'} ${chains.map((c) => c.labelAsymId).join(', ')} [auth ${chains.map((c) => c.authAsymId).join(', ')}]`;
};

/** Residue letters of a chain (optionally restricted to seqId range) honouring mode and gap. */
function letters(chain: PolymerChain, opts: FastaOptions, from = -Infinity, to = Infinity): string {
  let out = '';
  for (const r of chain.residues) {
    if (r.seqId < from || r.seqId > to) continue;
    if (r.modelled || opts.mode === 'full') out += r.oneLetter;
    else out += opts.gap;
  }
  return out;
}

function entityRecord(m: StructureModel, e: Entity, opts: FastaOptions): string {
  const chains = m.chains.filter((c) => c.entityId === e.id);
  const id = `>${entryId(m)}_${e.id}`;
  if (opts.mode === 'modelled') {
    const first = chains[0];
    if (!first) return '';
    return `${id} | ${chainLabel(chains)} | ${describe(e)} | modelled residues of chain ${first.labelAsymId}\n${letters(first, opts)}\n`;
  }
  return `${id} | ${chainLabel(chains)} | ${describe(e)}\n${e.sequence}\n`;
}

export function toFasta(m: StructureModel, scope: FastaScope, opts: FastaOptions = DEFAULT_OPTS): string {
  if (scope.kind === 'all') {
    return m.entities.filter((e) => e.kind === 'polymer').map((e) => entityRecord(m, e, opts)).join('');
  }
  if (scope.kind === 'entity') {
    const e = m.entities.find((x) => x.id === scope.entityId && x.kind === 'polymer');
    return e ? entityRecord(m, e, opts) : '';
  }
  const chain = m.chains.find((c) => c.labelAsymId === scope.labelAsymId);
  if (!chain) return '';
  const e = m.entities.find((x) => x.id === chain.entityId);
  const head = `>${entryId(m)}_${chain.entityId} | ${chainLabel([chain], false)} | ${describe(e)}`;
  if (scope.kind === 'chain') return `${head}\n${letters(chain, opts)}\n`;
  return `${head} | residues ${scope.from}-${scope.to}\n${letters(chain, opts, scope.from, scope.to)}\n`;
}
