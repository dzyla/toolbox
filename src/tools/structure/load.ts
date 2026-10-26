import { FileImportError, MAX_TEXT_IMPORT_BYTES, readBinaryFile } from '@/lib/file-import';

export interface StructureSource {
  text: string;
  name: string;
  origin: 'demo' | 'rcsb' | 'file';
  rcsbId?: string;
}

const BAD_ID = 'Enter a 4-character PDB ID (e.g. 1UBQ) or an extended ID (pdb_00001ubq)';

/** Classic IDs upper-cased ('1UBQ'); extended IDs lower-cased ('pdb_00001ubq'); null when neither. */
export function normaliseRcsbId(input: string): string | null {
  const s = input.trim();
  if (/^[1-9][A-Za-z0-9]{3}$/.test(s)) return s.toUpperCase();
  if (/^pdb_[0-9a-z]{8}$/i.test(s)) return s.toLowerCase();
  return null;
}

export async function fetchRcsbEntry(input: string, fetchImpl: typeof fetch = fetch): Promise<StructureSource> {
  const id = normaliseRcsbId(input);
  if (!id) throw new Error(BAD_ID);
  let res: Response;
  try {
    res = await fetchImpl(`https://files.rcsb.org/download/${id}.cif`);
  } catch {
    throw new Error('Could not reach RCSB. Check your connection; recently opened entries work offline.');
  }
  if (res.status === 404) throw new Error(`RCSB has no entry ${id}`);
  if (!res.ok) throw new Error(`RCSB returned HTTP ${res.status} for ${id}`);
  return { text: await res.text(), name: id, origin: 'rcsb', rcsbId: id };
}

async function gunzip(bytes: Uint8Array, fileName: string): Promise<Uint8Array> {
  try {
    const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream('gzip'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  } catch {
    throw new FileImportError(`${fileName} could not be decompressed (the gzip data is damaged).`);
  }
}

export async function readStructureFile(file: File): Promise<StructureSource> {
  let bytes: Uint8Array = new Uint8Array(await readBinaryFile(file, MAX_TEXT_IMPORT_BYTES));
  if (bytes.length === 0) throw new FileImportError(`${file.name} is empty.`);
  if (bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b) bytes = await gunzip(bytes, file.name);
  const head = bytes.subarray(0, 1024);
  if (head.includes(0) || (head[0] === 0x89 && head[1] === 0x50)) {
    throw new FileImportError(`${file.name} is not a structure file (it looks like binary data). Use a PDB or mmCIF file, optionally .gz.`);
  }
  const text = new TextDecoder('utf-8').decode(bytes);
  if (!text.trim()) throw new FileImportError(`${file.name} is empty.`);
  const name = file.name.replace(/\.gz$/i, '').replace(/\.[^./]+$/, '') || file.name;
  return { text, name, origin: 'file' };
}

export async function loadDemo(): Promise<StructureSource> {
  const { default: text } = await import('./demo/1ubq.cif?raw');
  return { text, name: '1UBQ', origin: 'demo', rcsbId: '1UBQ' };
}
