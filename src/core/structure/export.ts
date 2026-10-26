/** Writers for a chain selection of one model: mmCIF (round-trips through parseMmcif) and PDB. */
import type { AtomTable, StructureModel } from './model';

function selected(m: StructureModel, modelIndex: number, labelAsymIds: string[]): { t: AtomTable | undefined; idx: number[] } {
  const t = m.models[modelIndex];
  if (!t) return { t, idx: [] };
  const set = new Set(labelAsymIds);
  const idx: number[] = [];
  for (let i = 0; i < t.count; i++) if (set.has(t.labelAsymId[i]!)) idx.push(i);
  return { t, idx };
}

const cifValue = (v: string, empty = '?'): string => {
  if (v === '') return empty;
  if (!/[\s'"#]/.test(v) && !/^[_$[\];]/.test(v)) return v;
  if (!v.includes("'")) return `'${v}'`;
  if (!v.includes('"')) return `"${v}"`;
  return `'${v.replace(/'/g, '')}'`;
};

const COLUMNS = [
  'group_PDB', 'id', 'type_symbol', 'label_atom_id', 'label_alt_id', 'label_comp_id', 'label_asym_id',
  'label_entity_id', 'label_seq_id', 'pdbx_PDB_ins_code', 'Cartn_x', 'Cartn_y', 'Cartn_z', 'occupancy',
  'B_iso_or_equiv', 'auth_seq_id', 'auth_comp_id', 'auth_asym_id', 'auth_atom_id', 'pdbx_PDB_model_num',
];

export function writeMmcif(m: StructureModel, modelIndex: number, labelAsymIds: string[]): string {
  const { t, idx } = selected(m, modelIndex, labelAsymIds);
  const name = (m.header.id ?? m.name).replace(/\s+/g, '_') || 'structure';
  const lines = [`data_${name}`, '#', `_entry.id ${cifValue(name)}`, '#', 'loop_'];
  for (const c of COLUMNS) lines.push(`_atom_site.${c}`);
  if (t) {
    idx.forEach((i, n) => {
      const comp = t.compId[i]!, nm = t.atomName[i]!;
      const f = (k: number) => t.xyz[3 * i + k]!.toFixed(3);
      lines.push([
        t.isHetatm[i] ? 'HETATM' : 'ATOM', n + 1, cifValue(t.element[i]!), cifValue(nm), '.', cifValue(comp),
        cifValue(t.labelAsymId[i]!), cifValue(t.entityId[i]!), t.labelSeqId[i]! > 0 ? t.labelSeqId[i] : '.',
        cifValue(t.insCode[i]!), f(0), f(1), f(2), t.occupancy[i]!.toFixed(2), t.bFactor[i]!.toFixed(2),
        t.authSeqId[i], cifValue(comp), cifValue(t.authAsymId[i]!), cifValue(nm), t.modelNumber,
      ].join(' '));
    });
  }
  lines.push('#');
  return lines.join('\n') + '\n';
}

export interface PdbExport { text: string; warnings: string[] }

const pad = (s: string, n: number) => s.padStart(n, ' ');

export function writePdb(m: StructureModel, modelIndex: number, labelAsymIds: string[]): PdbExport {
  const { t, idx } = selected(m, modelIndex, labelAsymIds);
  const warnings: string[] = [];
  const out: string[] = [];
  if (t) {
    const chainsSeen = new Set<string>();
    let longIds = false;
    let serial = 0;
    let prev = -1;
    const ter = () => {
      serial++;
      const p = prev;
      out.push(`TER   ${pad(String(serial % 100000), 5)}      ${t.compId[p]!.slice(0, 3).padStart(3)} ${(t.authAsymId[p]!).charAt(0) || ' '}${pad(String(t.authSeqId[p]), 4)}${t.insCode[p] || ' '}`);
    };
    for (const i of idx) {
      chainsSeen.add(t.labelAsymId[i]!);
      if (t.authAsymId[i]!.length > 1) longIds = true;
      if (prev >= 0 && t.labelSeqId[prev]! > 0
        && (t.labelAsymId[prev] !== t.labelAsymId[i] || t.labelSeqId[i]! <= 0)) ter();
      serial++;
      prev = i;
      const el = t.element[i]!;
      const nm = t.atomName[i]!;
      const nameField = nm.length >= 4 || el.length > 1 ? nm.slice(0, 4).padEnd(4) : ` ${nm}`.padEnd(4);
      const f = (k: number) => t.xyz[3 * i + k]!.toFixed(3).padStart(8);
      const b = Math.min(t.bFactor[i]!, 999.99);
      out.push(
        `${t.isHetatm[i] ? 'HETATM' : 'ATOM  '}${pad(String(serial % 100000), 5)} ${nameField} ${t.compId[i]!.slice(0, 3).padStart(3)} `
        + `${t.authAsymId[i]!.charAt(0) || ' '}${pad(String(t.authSeqId[i]), 4)}${t.insCode[i]!.charAt(0) || ' '}   `
        + `${f(0)}${f(1)}${f(2)}${t.occupancy[i]!.toFixed(2).padStart(6)}${b.toFixed(2).padStart(6)}          ${el.slice(0, 2).padStart(2)}`,
      );
    }
    if (prev >= 0 && t.labelSeqId[prev]! > 0) ter();
    if (chainsSeen.size > 62) warnings.push('More than 62 chains: PDB format cannot hold them all');
    if (longIds) warnings.push('Chain IDs longer than one character (e.g. AA) are truncated in PDB format');
    if (serial > 99999) warnings.push('More than 99,999 atoms: serial numbers overflow in PDB format');
  }
  out.push('END');
  return { text: out.join('\n') + '\n', warnings };
}
