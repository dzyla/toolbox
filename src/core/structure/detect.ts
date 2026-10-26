/** Format sniffing and the single entry point that reads either supported structure format. */
import type { StructureFormat, StructureModel } from './model';
import { parseMmcif } from './mmcif';
import { parsePdbToModel } from './pdb';

/** Content decides; the file extension only breaks a tie (both signatures present). */
export function detectFormat(text: string, filename?: string): StructureFormat | null {
  const isCif = /^data_/m.test(text) && /^_atom_site\./m.test(text);
  const isPdb = /^(ATOM  |HETATM)/m.test(text);
  if (isCif && isPdb) {
    const pdbName = /\.(pdb|ent)$/i.test(filename ?? '');
    return pdbName && !/^\s*data_/.test(text) ? 'pdb' : 'mmcif';
  }
  if (isCif) return 'mmcif';
  if (isPdb) return 'pdb';
  return null;
}

/** Parse a PDB or mmCIF file; throws when the format is not recognised or no atoms were read. */
export function parseStructure(text: string, filename?: string): StructureModel {
  const format = detectFormat(text, filename);
  if (!format) throw new Error('Not a PDB or mmCIF structure file');
  const base = filename?.replace(/^.*[\\/]/, '').replace(/\.[^.]*$/, '');
  const name = base || 'structure';
  const model = format === 'pdb' ? parsePdbToModel(text, name) : parseMmcif(text, name);
  if (!model.models[0] || model.models[0].count === 0) throw new Error('Not a PDB or mmCIF structure file');
  return model;
}
