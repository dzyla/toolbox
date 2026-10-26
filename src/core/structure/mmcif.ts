/**
 * mmCIF -> StructureModel. Entities, chains and sequences come from the entity
 * categories when present; otherwise they are rebuilt from the atoms. Atoms go into one
 * columnar AtomTable per model, filled in a single pass over `_atom_site`.
 */
import { parseCifBlocks, type CifBlock, type CifCategory } from './cif';
import type {
  AtomTable, Entity, Ligand, PolymerChain, SeqResidue, StructureHeader, StructureModel,
} from './model';
import {
  MODIFIED_PARENT, guessPolymerType, isPolymerComp, numberingJumpWarning, polymerTypeFromCif, residueFactory,
} from './residues';

const WATER = new Set(['HOH', 'DOD', 'WAT']);

/** One residue (or ligand) instance in the first model, in file order. */
interface Instance {
  asym: string; authAsym: string; entityId: string;
  labelSeq: number; authSeq: number; ins: string; comp: string; atomCount: number;
}

export interface Builder {
  modelNumber: number;
  xyz: number[]; b: number[]; occ: number[]; het: number[]; hyd: number[];
  atomName: string[]; element: string[]; compId: string[];
  labelAsym: string[]; labelSeq: number[]; authAsym: string[]; authSeq: number[]; ins: string[];
  entityId: string[];
  altOf: Map<string, string>;
}

export function newBuilder(modelNumber: number): Builder {
  return {
    modelNumber, xyz: [], b: [], occ: [], het: [], hyd: [], atomName: [], element: [], compId: [],
    labelAsym: [], labelSeq: [], authAsym: [], authSeq: [], ins: [], entityId: [], altOf: new Map(),
  };
}

export function finish(b: Builder): AtomTable {
  return {
    modelNumber: b.modelNumber, count: b.atomName.length,
    xyz: Float32Array.from(b.xyz), bFactor: Float32Array.from(b.b), occupancy: Float32Array.from(b.occ),
    isHetatm: Uint8Array.from(b.het), isHydrogen: Uint8Array.from(b.hyd),
    atomName: b.atomName, element: b.element, compId: b.compId,
    labelAsymId: b.labelAsym, labelSeqId: Int32Array.from(b.labelSeq),
    authAsymId: b.authAsym, authSeqId: Int32Array.from(b.authSeq), insCode: b.ins,
    entityId: b.entityId,
  };
}

const int = (s: string | undefined): number => {
  if (s === undefined) return 0;
  const n = parseInt(s, 10);
  return Number.isFinite(n) ? n : 0;
};

const num = (s: string | undefined): number => {
  if (s === undefined) return 0;
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
};

function readAtoms(cat: CifCategory | undefined): { models: AtomTable[]; instances: Instance[] } {
  const instances: Instance[] = [];
  if (!cat || cat.rowCount === 0) return { models: [], instances };
  const builders = new Map<string, Builder>();
  const order: Builder[] = [];
  let curKey = '';
  let cur: Builder | undefined;
  let first: Builder | undefined;
  let last: Instance | undefined;

  for (let r = 0; r < cat.rowCount; r++) {
    const mk = cat.get('pdbx_PDB_model_num', r) ?? '1';
    if (!cur || mk !== curKey) {
      curKey = mk;
      cur = builders.get(mk);
      if (!cur) {
        cur = newBuilder(int(mk));
        builders.set(mk, cur);
        order.push(cur);
        first ??= cur;
      }
    }
    const labelAsymRaw = cat.get('label_asym_id', r);
    const authAsymRaw = cat.get('auth_asym_id', r);
    const asym = labelAsymRaw ?? authAsymRaw ?? '';
    const authAsym = authAsymRaw ?? asym;
    const labelSeq = int(cat.get('label_seq_id', r));
    const authSeq = int(cat.get('auth_seq_id', r) ?? cat.get('label_seq_id', r));
    const ins = cat.get('pdbx_PDB_ins_code', r) ?? '';
    const name = cat.get('label_atom_id', r) ?? cat.get('auth_atom_id', r) ?? '';

    const alt = cat.get('label_alt_id', r);
    if (alt !== undefined) {
      // Keep only the first alt id seen for this residue; blank-alt atoms are always kept.
      const key = `${asym}|${labelSeq || authSeq}|${ins}`;
      const first = cur.altOf.get(key);
      if (first === undefined) cur.altOf.set(key, alt);
      else if (first !== alt) continue;
    }

    const comp = cat.get('label_comp_id', r) ?? cat.get('auth_comp_id', r) ?? '';
    const element = (cat.get('type_symbol', r) ?? '').toUpperCase();
    const entityId = cat.get('label_entity_id', r) ?? '';
    cur.xyz.push(num(cat.get('Cartn_x', r)), num(cat.get('Cartn_y', r)), num(cat.get('Cartn_z', r)));
    cur.b.push(num(cat.get('B_iso_or_equiv', r)));
    const occ = cat.get('occupancy', r);
    cur.occ.push(occ === undefined ? 1 : num(occ));
    cur.het.push(cat.get('group_PDB', r) === 'HETATM' ? 1 : 0);
    cur.hyd.push(element === 'H' || element === 'D' ? 1 : 0);
    cur.atomName.push(name);
    cur.element.push(element);
    cur.compId.push(comp);
    cur.labelAsym.push(asym);
    cur.labelSeq.push(labelSeq);
    cur.authAsym.push(authAsym);
    cur.authSeq.push(authSeq);
    cur.ins.push(ins);
    cur.entityId.push(entityId);

    if (cur === first) {
      if (last && last.asym === asym && last.authAsym === authAsym && last.authSeq === authSeq
        && last.ins === ins && last.labelSeq === labelSeq && last.comp === comp) {
        last.atomCount++;
      } else {
        last = { asym, authAsym, entityId, labelSeq, authSeq, ins, comp, atomCount: 1 };
        instances.push(last);
      }
    }
  }
  return { models: order.map(finish), instances };
}

const uniquePush = (list: string[], v: string | undefined) => {
  if (v !== undefined && !list.includes(v)) list.push(v);
};

function readHeader(block: CifBlock): StructureHeader {
  const c = block.categories;
  const header: StructureHeader = { organisms: [] };
  const id = c.get('_entry')?.get('id', 0);
  if (id !== undefined) header.id = id;
  const title = c.get('_struct')?.get('title', 0);
  if (title !== undefined) header.title = title;
  const exptl = c.get('_exptl');
  if (exptl) {
    const methods: string[] = [];
    for (let r = 0; r < exptl.rowCount; r++) {
      const m = exptl.get('method', r);
      if (m !== undefined) methods.push(m);
    }
    if (methods.length) header.method = methods.join(' / ');
  }
  const res = [
    c.get('_refine')?.get('ls_d_res_high', 0),
    c.get('_em_3d_reconstruction')?.get('resolution', 0),
    c.get('_reflns')?.get('d_resolution_high', 0),
  ].map((v) => (v === undefined ? NaN : parseFloat(v))).find((v) => Number.isFinite(v));
  if (res !== undefined) header.resolution = res;
  const sources: [string, string][] = [
    ['_entity_src_gen', 'pdbx_gene_src_scientific_name'],
    ['_entity_src_nat', 'pdbx_organism_scientific'],
    ['_pdbx_entity_src_syn', 'organism_scientific'],
  ];
  for (const [cat, field] of sources) {
    const t = c.get(cat);
    if (t) for (let r = 0; r < t.rowCount; r++) uniquePush(header.organisms, t.get(field, r));
  }
  const date = c.get('_pdbx_database_status')?.get('recvd_initial_deposition_date', 0);
  if (date !== undefined) header.depositionDate = date;
  return header;
}

export function parseMmcif(text: string, name = 'structure'): StructureModel {
  const block = parseCifBlocks(text)[0];
  if (!block) throw new Error('No data block found in the mmCIF file');
  const cats = block.categories;
  const warnings: string[] = [];

  const { models, instances } = readAtoms(cats.get('_atom_site'));
  if (models.length === 0) warnings.push('No atom coordinates found in the file');

  // Modified-residue parents: mod_residue > chem_comp > fallback table.
  const modParent = new Map<string, string>();
  const modCat = cats.get('_pdbx_struct_mod_residue');
  if (modCat) {
    for (let r = 0; r < modCat.rowCount; r++) {
      const c = modCat.get('label_comp_id', r);
      const p = modCat.get('parent_comp_id', r);
      if (c && p && !modParent.has(c)) modParent.set(c, p);
    }
  }
  const chemName = new Map<string, string>();
  const chemParent = new Map<string, string>();
  const chemCat = cats.get('_chem_comp');
  if (chemCat) {
    for (let r = 0; r < chemCat.rowCount; r++) {
      const id = chemCat.get('id', r);
      if (!id) continue;
      const n = chemCat.get('name', r);
      if (n !== undefined) chemName.set(id, n);
      const p = chemCat.get('mon_nstd_parent_comp_id', r)?.split(/[\s,]+/)[0];
      if (p) chemParent.set(id, p);
    }
  }

  const makeResidue = residueFactory((comp) => modParent.get(comp) ?? chemParent.get(comp) ?? MODIFIED_PARENT[comp], warnings);

  // Atom-derived lookups (first model).
  const authOfAsym = new Map<string, string>();
  const entityOfAsym = new Map<string, string>();
  const instByResidue = new Map<string, Instance>();
  for (const i of instances) {
    if (!authOfAsym.has(i.asym)) authOfAsym.set(i.asym, i.authAsym);
    if (i.entityId && !entityOfAsym.has(i.asym)) entityOfAsym.set(i.asym, i.entityId);
    if (i.labelSeq > 0) instByResidue.set(`${i.asym}:${i.labelSeq}`, i);
  }

  // Chains built from atoms without label_seq_id: their polymer atoms get the residue index the
  // chain was given (as the PDB reader does), so interfaces and exports see them as polymer.
  const stampKey = (asym: string, authSeq: number, ins: string, comp: string) => `${asym}|${authSeq}|${ins}|${comp}`;
  const stamps = new Map<string, number>();
  const chainFromInstances = (list: Instance[], authChain: string): SeqResidue[] => {
    const residues = residuesFromInstances(list, makeResidue);
    if (!list.every((i) => i.labelSeq > 0)) {
      list.forEach((i, k) => {
        const key = stampKey(i.asym, i.authSeq, i.ins, i.comp);
        if (!stamps.has(key)) stamps.set(key, residues[k]!.seqId);
      });
    }
    const jump = numberingJumpWarning(authChain, list.map((i) => i.authSeq));
    if (jump) warnings.push(jump);
    return residues;
  };

  const entities: Entity[] = [];
  const chains: PolymerChain[] = [];
  const entCat = cats.get('_entity');
  const hasEntities = !!entCat && entCat.rowCount > 0;
  const entIndex = new Map<string, Entity>();

  const isPolymerInstance = (i: Instance): boolean => {
    const ent = entIndex.get(i.entityId);
    if (hasEntities && ent) return ent.kind === 'polymer';
    return i.labelSeq > 0 || isPolymerComp(i.comp);
  };

  if (hasEntities) {
    for (let r = 0; r < entCat!.rowCount; r++) {
      const id = entCat!.get('id', r);
      if (id === undefined) continue;
      const t = entCat!.get('type', r) ?? 'non-polymer';
      const kind = t === 'polymer' || t === 'branched' || t === 'water' ? t : 'non-polymer';
      const e: Entity = { id, kind, description: entCat!.get('pdbx_description', r) ?? '', sequence: '', labelAsymIds: [] };
      entities.push(e);
      entIndex.set(id, e);
    }
    const polyCat = cats.get('_entity_poly');
    const canon = new Map<string, string>();
    if (polyCat) {
      for (let r = 0; r < polyCat.rowCount; r++) {
        const e = entIndex.get(polyCat.get('entity_id', r) ?? '');
        if (!e) continue;
        e.polymerType = polymerTypeFromCif(polyCat.get('type', r) ?? '');
        const s = polyCat.get('pdbx_seq_one_letter_code_can', r);
        if (s !== undefined) canon.set(e.id, s.replace(/\s+/g, ''));
      }
    }
    for (const e of entities) if (e.kind === 'polymer' && !e.polymerType) e.polymerType = 'protein';

    // Asym ids per entity, in _struct_asym order (else first appearance in the atoms).
    const asymOrder: [string, string][] = [];
    const saCat = cats.get('_struct_asym');
    if (saCat && saCat.rowCount > 0) {
      for (let r = 0; r < saCat.rowCount; r++) {
        const a = saCat.get('id', r);
        const e = saCat.get('entity_id', r);
        if (a !== undefined && e !== undefined) asymOrder.push([a, e]);
      }
    } else {
      for (const [a, e] of entityOfAsym) asymOrder.push([a, e]);
    }
    for (const [a, e] of asymOrder) entIndex.get(e)?.labelAsymIds.push(a);

    // Per-position residues of each entity.
    const polySeq = new Map<string, { nums: number[]; comps: string[] }>();
    const psCat = cats.get('_entity_poly_seq');
    if (psCat) {
      const dupes = new Map<string, number>();
      const seenNum = new Set<string>();
      for (let r = 0; r < psCat.rowCount; r++) {
        const eid = psCat.get('entity_id', r);
        const n = int(psCat.get('num', r));
        const comp = psCat.get('mon_id', r);
        if (eid === undefined || comp === undefined) continue;
        const key = `${eid}:${n}`;
        if (seenNum.has(key)) { dupes.set(eid, (dupes.get(eid) ?? 0) + 1); continue; }
        seenNum.add(key);
        let s = polySeq.get(eid);
        if (!s) polySeq.set(eid, (s = { nums: [], comps: [] }));
        s.nums.push(n);
        s.comps.push(comp);
      }
      for (const [eid, n] of dupes) {
        warnings.push(`Entity ${eid}: ${n} sequence position(s) with microheterogeneity; kept the first residue type`);
      }
    }

    // Author numbering and modelled state from the scheme.
    const schemeCat = cats.get('_pdbx_poly_seq_scheme');
    const schemeRows = new Map<string, Map<number, number>>();
    if (schemeCat) {
      for (let r = 0; r < schemeCat.rowCount; r++) {
        const a = schemeCat.get('asym_id', r);
        if (a === undefined) continue;
        let m = schemeRows.get(a);
        if (!m) schemeRows.set(a, (m = new Map()));
        const s = int(schemeCat.get('seq_id', r));
        if (!m.has(s)) m.set(s, r);
      }
    }

    for (const [asym, eid] of asymOrder) {
      const ent = entIndex.get(eid);
      if (!ent || ent.kind !== 'polymer') continue;
      const ps = polySeq.get(eid);
      const rows = schemeRows.get(asym);
      let residues: SeqResidue[];
      let authAsym = authOfAsym.get(asym);
      if (ps) {
        residues = ps.nums.map((n, k) => {
          const comp = ps.comps[k]!;
          if (rows && schemeCat) {
            const row = rows.get(n);
            if (row === undefined) return makeResidue(n, comp, false);
            const modelled = schemeCat.get('pdb_mon_id', row) !== undefined;
            const pdbNum = schemeCat.get('pdb_seq_num', row) ?? schemeCat.get('auth_seq_num', row);
            const auth = pdbNum === undefined ? undefined
              : { seqId: int(pdbNum), insCode: schemeCat.get('pdb_ins_code', row) ?? '' };
            return makeResidue(n, comp, modelled, auth);
          }
          const inst = instByResidue.get(`${asym}:${n}`);
          return makeResidue(n, comp, !!inst, inst ? { seqId: inst.authSeq, insCode: inst.ins } : undefined);
        });
        if (rows && schemeCat) {
          const strand = schemeCat.get('pdb_strand_id', rows.values().next().value as number);
          if (strand !== undefined) authAsym = strand;
        }
      } else {
        residues = chainFromInstances(instances.filter((i) => i.asym === asym && isPolymerInstance(i)), authAsym ?? asym);
      }
      if (!ent.sequence) ent.sequence = canon.get(eid) ?? residues.map((x) => x.oneLetter).join('');
      chains.push({ labelAsymId: asym, authAsymId: authAsym ?? asym, entityId: eid, residues });
    }
    for (const e of entities) {
      if (e.kind === 'polymer' && !e.sequence) e.sequence = canon.get(e.id) ?? '';
    }
  } else {
    buildFromAtoms(instances, models, entities, chains, entIndex);
  }
  if (stamps.size) {
    for (const t of models) {
      for (let k = 0; k < t.count; k++) {
        if (t.labelSeqId[k]! > 0 || WATER.has(t.compId[k]!)) continue;
        const seqId = stamps.get(stampKey(t.labelAsymId[k]!, t.authSeqId[k]!, t.insCode[k]!, t.compId[k]!));
        if (seqId !== undefined) t.labelSeqId[k] = seqId;
      }
    }
  }

  // Ligands: non-polymer, non-water residue instances of the first model.
  const ligands: Ligand[] = [];
  for (const i of instances) {
    if (WATER.has(i.comp) || entIndex.get(i.entityId)?.kind === 'water') continue;
    if (isPolymerInstance(i)) continue;
    ligands.push({
      compId: i.comp, name: chemName.get(i.comp) ?? i.comp, entityId: i.entityId,
      labelAsymId: i.asym, authAsymId: i.authAsym, authSeqId: i.authSeq, atomCount: i.atomCount,
    });
  }

  return { name, format: 'mmcif', header: readHeader(block), entities, chains, ligands, models, warnings };

  function buildFromAtoms(
    insts: Instance[], tables: AtomTable[], ents: Entity[], outChains: PolymerChain[], index: Map<string, Entity>,
  ): void {
    const byAsym = new Map<string, Instance[]>();
    for (const i of insts) {
      if (WATER.has(i.comp) || !(i.labelSeq > 0 || isPolymerComp(i.comp))) continue;
      let list = byAsym.get(i.asym);
      if (!list) byAsym.set(i.asym, (list = []));
      list.push(i);
    }
    const bySeq = new Map<string, Entity>();
    const asymToEntity = new Map<string, string>();
    for (const [asym, list] of byAsym) {
      const residues = chainFromInstances(list, list[0]!.authAsym);
      const seq = residues.map((x) => x.oneLetter).join('');
      const type = guessPolymerType(list.map((i) => i.comp));
      const key = `${type}:${seq}`;
      let ent = bySeq.get(key);
      if (!ent) {
        ent = { id: String(ents.length + 1), kind: 'polymer', polymerType: type, description: '', sequence: seq, labelAsymIds: [] };
        bySeq.set(key, ent);
        ents.push(ent);
        index.set(ent.id, ent);
      }
      ent.labelAsymIds.push(asym);
      asymToEntity.set(asym, ent.id);
      outChains.push({ labelAsymId: asym, authAsymId: list[0]!.authAsym, entityId: ent.id, residues });
    }
    // Keep polymer atoms consistent with the generated entity ids; ligands and waters have
    // no entity table here, so their entity id is cleared ('').
    for (const t of tables) {
      for (let k = 0; k < t.count; k++) {
        const id = asymToEntity.get(t.labelAsymId[k]!);
        const comp = t.compId[k]!;
        const poly = id !== undefined && !WATER.has(comp) && (t.labelSeqId[k]! > 0 || isPolymerComp(comp));
        t.entityId[k] = poly ? id : '';
      }
    }
    for (const i of insts) {
      const id = asymToEntity.get(i.asym);
      const poly = id !== undefined && !WATER.has(i.comp) && (i.labelSeq > 0 || isPolymerComp(i.comp));
      i.entityId = poly ? id : '';
    }
  }
}

/** Residues of one chain from atom instances: label_seq_id when every residue has one, else 1..n. */
function residuesFromInstances(
  list: Instance[],
  make: (seqId: number, comp: string, modelled: boolean, auth: { seqId: number; insCode: string }) => SeqResidue,
): SeqResidue[] {
  const useLabel = list.every((i) => i.labelSeq > 0);
  return list.map((i, k) => make(useLabel ? i.labelSeq : k + 1, i.comp, true, { seqId: i.authSeq, insCode: i.ins }));
}
