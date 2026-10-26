/**
 * Legacy PDB -> StructureModel. Fixed-column slicing in a single pass over the lines;
 * SEQRES supplies full sequences, COMPND the entities, and modelled residues are aligned
 * to SEQRES afterwards so the result matches what the mmCIF reader produces.
 */
import type {
  AtomTable, Entity, Ligand, PolymerChain, SeqResidue, StructureHeader, StructureModel,
} from './model';
import { newBuilder, finish, type Builder } from './mmcif';
import { MODIFIED_PARENT, STANDARD_COMPS, guessPolymerType, numberingJumpWarning, residueFactory } from './residues';

const WATER = new Set(['HOH', 'DOD', 'WAT']);
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

/** One residue (or ligand) instance of the first model, in file order. */
interface Instance { chain: string; seq: number; ins: string; comp: string; het: boolean; atomCount: number; afterTer: boolean }

const num = (s: string): number => {
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
};

/** `KEY: value; KEY: value` text from COMPND/SOURCE records (continuation lines already joined). */
function parseKeyed(lines: string[]): { key: string; value: string }[] {
  const out: { key: string; value: string }[] = [];
  for (const seg of lines.join(' ').split(';')) {
    const i = seg.indexOf(':');
    const key = i > 0 ? seg.slice(0, i).trim() : '';
    if (key && /^[A-Z0-9_ ]+$/.test(key)) out.push({ key, value: seg.slice(i + 1).trim() });
    else if (out.length && seg.trim()) out[out.length - 1]!.value += ` ${seg.trim()}`;
  }
  return out;
}

function isoDate(d: string): string | undefined {
  const m = /^(\d{2})-([A-Z]{3})-(\d{2})$/.exec(d);
  const mon = m ? MONTHS.indexOf(m[2]!) : -1;
  if (!m || mon < 0) return undefined;
  const yy = parseInt(m[3]!, 10);
  return `${yy >= 60 ? 1900 + yy : 2000 + yy}-${String(mon + 1).padStart(2, '0')}-${m[1]}`;
}

const sentenceCase = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();

/** Element symbol from columns 77-78, else guessed from the atom name. */
function elementOf(line: string, name: string, het: boolean): string {
  const el = line.slice(76, 78).trim();
  if (el) return el.toUpperCase();
  if (name[0] === ' ') return (name[1] ?? '').toUpperCase();
  const letters = name.replace(/^[0-9\s]+/, '');
  return (het ? letters.slice(0, 2).trim() : letters.slice(0, 1)).toUpperCase();
}

/** One alignment attempt anchored at `first`; `hits` counts steps that matched the auth numbering. */
function alignFrom(seq: string[], insts: Instance[], first: number): { idx: number[]; hits: number } | null {
  const idx = [first];
  let hits = 0;
  for (let n = 1; n < insts.length; n++) {
    const inst = insts[n]!;
    const prev = idx[n - 1]!;
    const step = Math.max(1, inst.seq - insts[n - 1]!.seq);
    let k = -1;
    if (seq[prev + step] === inst.comp) {
      k = prev + step;
      hits++;
    } else {
      k = prev + 1;
      while (k < seq.length && seq[k] !== inst.comp) k++;
      if (k >= seq.length) return null;
    }
    idx.push(k);
  }
  return { idx, hits };
}

/**
 * Index in `seq` for each polymer instance, matching residue names in order. Several start
 * positions can match the first name, so the one whose later steps agree best with the auth
 * numbering wins (a gap of n in numbering is a gap of n in SEQRES); otherwise the earliest.
 * Null when the instances cannot be placed.
 */
function align(seq: string[], insts: Instance[]): number[] | null {
  if (!insts.length) return [];
  let best: { idx: number[]; hits: number } | null = null;
  for (let k = 0; k < seq.length && (!best || best.hits < insts.length - 1); k++) {
    if (seq[k] !== insts[0]!.comp) continue;
    const r = alignFrom(seq, insts, k);
    if (r && (!best || r.hits > best.hits)) best = r;
  }
  return best ? best.idx : null;
}

export function parsePdbToModel(text: string, name = 'structure'): StructureModel {
  const warnings: string[] = [];
  const header: StructureHeader = { organisms: [] };
  const titleLines: string[] = [];
  const expdta: string[] = [];
  const compnd: string[] = [];
  const source: string[] = [];
  const seqres = new Map<string, string[]>();
  const modParent = new Map<string, string>();
  const hetName = new Map<string, string>();
  const builders: Builder[] = [];
  const instances: Instance[] = [];
  let cur: Builder | undefined;
  let last: Instance | undefined;
  const terChains = new Set<string>();

  for (const line of text.split(/\r?\n/)) {
    // padEnd: a bare `TER` (tleap, GROMACS) or `END` line is shorter than the 6-column record name.
    switch (line.slice(0, 6).padEnd(6)) {
      case 'ATOM  ':
      case 'HETATM': {
        if (!cur) {
          cur = newBuilder(builders.length + 1);
          builders.push(cur);
        }
        const het = line.charCodeAt(0) === 72; // 'H'
        const atom = line.slice(12, 16);
        const alt = line.charAt(16).trim();
        const comp = line.slice(17, 20).trim();
        const chain = line.charAt(21).trim();
        const seq = parseInt(line.slice(22, 26), 10) || 0;
        const ins = line.charAt(26).trim();
        if (alt) {
          // Keep only the first alt id seen for this residue; blank-alt atoms are always kept.
          const key = `${chain}|${seq}|${ins}`;
          const first = cur.altOf.get(key);
          if (first === undefined) cur.altOf.set(key, alt);
          else if (first !== alt) break;
        }
        const element = elementOf(line, atom, het);
        const b = cur;
        b.xyz.push(num(line.slice(30, 38)), num(line.slice(38, 46)), num(line.slice(46, 54)));
        const occ = line.slice(54, 60).trim();
        b.occ.push(occ ? num(occ) : 1);
        b.b.push(num(line.slice(60, 66)));
        b.het.push(het ? 1 : 0);
        b.hyd.push(element === 'H' || element === 'D' ? 1 : 0);
        b.atomName.push(atom.trim());
        b.element.push(element);
        b.compId.push(comp);
        b.labelAsym.push(chain);
        b.labelSeq.push(0);
        b.authAsym.push(chain);
        b.authSeq.push(seq);
        b.ins.push(ins);
        b.entityId.push('');
        if (b === builders[0]) {
          if (last && last.chain === chain && last.seq === seq && last.ins === ins && last.comp === comp) {
            last.atomCount++;
          } else {
            last = { chain, seq, ins, comp, het, atomCount: 1, afterTer: terChains.has(chain) };
            instances.push(last);
          }
        }
        break;
      }
      case 'MODEL ':
        cur = newBuilder(parseInt(line.slice(10, 14), 10) || builders.length + 1);
        builders.push(cur);
        break;
      case 'TER   ':
        // HETATM residues after a chain's TER are never polymer (ATOM records always are); only the
        // first model's TERs matter. A bare TER (no chain column) ends the last atom's chain.
        if (builders.length <= 1) terChains.add(line.charAt(21).trim() || (last?.chain ?? ''));
        break;
      case 'ENDMDL':
        cur = undefined;
        break;
      case 'SEQRES': {
        const chain = line.charAt(11).trim();
        let list = seqres.get(chain);
        if (!list) seqres.set(chain, (list = []));
        for (const c of line.slice(19, 71).split(/\s+/)) if (c) list.push(c);
        break;
      }
      case 'MODRES': {
        const c = line.slice(12, 15).trim();
        const p = line.slice(24, 27).trim();
        if (c && p && !modParent.has(c)) modParent.set(c, p);
        break;
      }
      case 'HETNAM': {
        const id = line.slice(11, 14).trim();
        const t = line.slice(15, 70).trim();
        if (id && t) hetName.set(id, hetName.has(id) ? `${hetName.get(id)} ${t}` : t);
        break;
      }
      case 'COMPND': compnd.push(line.slice(10, 80).trim()); break;
      case 'SOURCE': source.push(line.slice(10, 80).trim()); break;
      case 'TITLE ': titleLines.push(line.slice(10, 80).trim()); break;
      case 'EXPDTA': expdta.push(line.slice(10, 80).trim()); break;
      case 'HEADER': {
        const m = /(\d{2}-[A-Z]{3}-\d{2})\s+(\w{4})\s*$/.exec(line);
        if (m) {
          header.id = m[2]!;
          const d = isoDate(m[1]!);
          if (d) header.depositionDate = d;
        }
        break;
      }
      case 'REMARK': {
        const m = /^REMARK {3}2 RESOLUTION\.\s+(\d+(?:\.\d+)?)/.exec(line);
        if (m && header.resolution === undefined) header.resolution = parseFloat(m[1]!);
        break;
      }
      default:
    }
  }

  // Header.
  const title = titleLines.join(' ').trim();
  if (title) header.title = title;
  const method = expdta.join(' ').split(';').map((s) => s.trim()).filter(Boolean).join(' / ');
  if (method) header.method = method;
  for (const { key, value } of parseKeyed(source)) {
    if (key === 'ORGANISM_SCIENTIFIC' && value) {
      const o = sentenceCase(value);
      if (!header.organisms.includes(o)) header.organisms.push(o);
    }
  }

  const models: AtomTable[] = builders.map(finish);
  if (models.length === 0) warnings.push('No atom coordinates found in the file');

  // COMPND entities.
  const compEntities: { id: string; description: string; chains: string[] }[] = [];
  for (const { key, value } of parseKeyed(compnd)) {
    if (key === 'MOL_ID') compEntities.push({ id: value, description: '', chains: [] });
    else if (key === 'MOLECULE' && compEntities.length) compEntities[compEntities.length - 1]!.description = value;
    else if (key === 'CHAIN' && compEntities.length) {
      compEntities[compEntities.length - 1]!.chains.push(...value.split(/[\s,]+/).filter(Boolean));
    }
  }
  const compOfChain = new Map<string, { id: string; description: string }>();
  for (const e of compEntities) for (const c of e.chains) if (!compOfChain.has(c)) compOfChain.set(c, e);

  const makeResidue = residueFactory((comp) => modParent.get(comp) ?? MODIFIED_PARENT[comp], warnings);

  // Polymer vs ligand instances.
  const seqSets = new Map<string, Set<string>>();
  for (const [c, list] of seqres) seqSets.set(c, new Set(list));
  const polyByChain = new Map<string, Instance[]>();
  for (const c of seqres.keys()) polyByChain.set(c, []);
  const ligandInsts: Instance[] = [];
  // Last polymer instance per chain, to judge whether a standard-named HETATM continues the chain.
  const lastPoly = new Map<string, Instance>();
  const isPolymer = (i: Instance): boolean => {
    if (WATER.has(i.comp) || (i.het && i.afterTer)) return false;
    if (!i.het) return true;
    if (!STANDARD_COMPS.has(i.comp)) return modParent.has(i.comp) || i.comp in MODIFIED_PARENT;
    // A standard residue written as HETATM is polymer only when SEQRES has it and it is contiguous.
    const prev = lastPoly.get(i.chain);
    return !!seqSets.get(i.chain)?.has(i.comp) && !!prev && i.seq - prev.seq <= 1;
  };
  for (const i of instances) {
    if (WATER.has(i.comp)) continue;
    if (isPolymer(i)) {
      lastPoly.set(i.chain, i);
      let list = polyByChain.get(i.chain);
      if (!list) polyByChain.set(i.chain, (list = []));
      list.push(i);
    } else {
      ligandInsts.push(i);
    }
  }

  // Chains and entities.
  const chains: PolymerChain[] = [];
  const entities: Entity[] = [];
  const reserved = new Set(compEntities.map((e) => e.id));
  const byId = new Map<string, Entity>();
  const bySeq = new Map<string, Entity>();
  let counter = 0;
  const nextId = (): string => {
    do counter++; while (reserved.has(String(counter)));
    return String(counter);
  };
  const lookup = new Map<string, { seqId: number; entityId: string }>();

  for (const [chain, insts] of polyByChain) {
    const seq = seqres.get(chain);
    const idx = seq ? align(seq, insts) : null;
    if (seq && !idx && insts.length) warnings.push(`Atoms do not match SEQRES for chain ${chain}; using the modelled sequence`);
    let residues: SeqResidue[];
    if (seq && (idx || insts.length === 0)) {
      const at = new Map<number, Instance>();
      (idx ?? []).forEach((k, n) => at.set(k, insts[n]!));
      residues = seq.map((comp, k) => {
        const i = at.get(k);
        return makeResidue(k + 1, comp, !!i, i ? { seqId: i.seq, insCode: i.ins } : undefined);
      });
    } else {
      residues = insts.map((i, k) => makeResidue(k + 1, i.comp, true, { seqId: i.seq, insCode: i.ins }));
      const jump = seq ? undefined : numberingJumpWarning(chain, insts.map((i) => i.seq));
      if (jump) warnings.push(jump);
    }
    const sequence = residues.map((r) => r.oneLetter).join('');
    const type = guessPolymerType(residues.map((r) => r.compId));
    const comp = compOfChain.get(chain);
    let ent: Entity | undefined;
    if (comp) {
      ent = byId.get(comp.id);
      if (!ent) {
        ent = { id: comp.id, kind: 'polymer', polymerType: type, description: comp.description, sequence, labelAsymIds: [] };
        byId.set(comp.id, ent);
        entities.push(ent);
      }
    } else {
      const key = `${type}:${sequence}`;
      ent = bySeq.get(key);
      if (!ent) {
        ent = { id: nextId(), kind: 'polymer', polymerType: type, description: '', sequence, labelAsymIds: [] };
        bySeq.set(key, ent);
        entities.push(ent);
      }
    }
    ent.labelAsymIds.push(chain);
    chains.push({ labelAsymId: chain, authAsymId: chain, entityId: ent.id, residues });
    for (const [k, r] of residues.entries()) {
      if (r.modelled) lookup.set(`${chain}|${r.auth!.seqId}|${r.auth!.insCode}`, { seqId: k + 1, entityId: ent.id });
    }
  }

  // Polymer atoms get their sequence index and entity (ligands and waters keep 0 / '').
  for (const t of models) {
    let pc = '';
    let ps = NaN;
    let pi = '';
    let hit: { seqId: number; entityId: string } | undefined;
    for (let a = 0; a < t.count; a++) {
      const c = t.authAsymId[a]!;
      const s = t.authSeqId[a]!;
      const ic = t.insCode[a]!;
      if (c !== pc || s !== ps || ic !== pi) {
        pc = c; ps = s; pi = ic;
        hit = lookup.get(`${c}|${s}|${ic}`);
      }
      if (hit && !WATER.has(t.compId[a]!)) {
        t.labelSeqId[a] = hit.seqId;
        t.entityId[a] = hit.entityId;
      }
    }
  }

  const ligands: Ligand[] = ligandInsts.map((i) => ({
    compId: i.comp, name: hetName.get(i.comp) ?? i.comp, entityId: '', labelAsymId: i.chain,
    authAsymId: i.chain, authSeqId: i.seq, atomCount: i.atomCount,
  }));

  return { name, format: 'pdb', header, entities, chains, ligands, models, warnings };
}
