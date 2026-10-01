import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import { newId } from './id';

export interface Project {
  id: string; toolId: string; name: string; createdAt: number; updatedAt: number;
  /** Tool-owned state schema version, so tools can migrate old projects. */
  version: number; state: unknown; thumbnail?: Blob; assets?: Record<string, Blob>;
}
interface Schema extends DBSchema {
  projects: { key: string; value: Project; indexes: { updatedAt: number } };
}
let dbp: Promise<IDBPDatabase<Schema>> | undefined;
function db() {
  dbp ??= openDB<Schema>('biobench', 1, {
    upgrade(d) { d.createObjectStore('projects', { keyPath: 'id' }).createIndex('updatedAt', 'updatedAt'); }
  });
  return dbp;
}

export async function listRecent(limit = 12): Promise<Project[]> {
  const d = await db();
  const out: Project[] = [];
  let cur = await d.transaction('projects').store.index('updatedAt').openCursor(null, 'prev');
  while (cur && out.length < limit) { out.push(cur.value); cur = await cur.continue(); }
  return out;
}
export async function getProject(id: string) { return (await db()).get('projects', id); }
export async function saveProject(p: Omit<Project, 'createdAt' | 'updatedAt'> & Partial<Pick<Project, 'createdAt' | 'updatedAt'>>): Promise<Project> {
  const now = Date.now();
  const existing = await getProject(p.id);
  const full: Project = { ...p, createdAt: p.createdAt ?? existing?.createdAt ?? now, updatedAt: now };
  await (await db()).put('projects', full);
  return full;
}
export async function deleteProject(id: string) { await (await db()).delete('projects', id); }

type B64 = { type: string; data: string };
async function b64(b: Blob): Promise<B64> {
  const bytes = new Uint8Array(await b.arrayBuffer());
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return { type: b.type, data: btoa(s) };
}
const unb64 = (o: B64) => new Blob([Uint8Array.from(atob(o.data), c => c.charCodeAt(0))], { type: o.type });

async function encodeProject(p: Project) {
  const assets: Record<string, B64> = {};
  for (const [k, v] of Object.entries(p.assets ?? {})) assets[k] = await b64(v);
  return { ...p, thumbnail: p.thumbnail ? await b64(p.thumbnail) : undefined, assets };
}
interface EncodedProject { id: string; toolId: string; name: string; createdAt?: number; updatedAt?: number; version: number; state: unknown; thumbnail?: B64; assets?: Record<string, B64> }
function decodeProject(src: EncodedProject) {
  const assets: Record<string, Blob> = {};
  for (const [k, v] of Object.entries(src.assets ?? {})) assets[k] = unb64(v);
  return { toolId: src.toolId, name: src.name, version: src.version, state: src.state, thumbnail: src.thumbnail ? unb64(src.thumbnail) : undefined, assets };
}
function checkEncoded(p: unknown): asserts p is EncodedProject {
  const o = p as Partial<EncodedProject> | null;
  if (!o || typeof o.id !== 'string' || typeof o.toolId !== 'string' || typeof o.name !== 'string' || typeof o.version !== 'number') {
    throw new Error('Project entry is malformed');
  }
}

/** Single JSON file with blobs base64-encoded; readable on any device. */
export async function exportProject(id: string): Promise<Blob> {
  const p = await getProject(id);
  if (!p) throw new Error(`No project ${id}`);
  const doc = { format: 'biobench-project', formatVersion: 1, project: await encodeProject(p) };
  return new Blob([JSON.stringify(doc)], { type: 'application/json' });
}
export async function importProject(file: Blob): Promise<Project> {
  const doc = JSON.parse(await file.text());
  if (doc?.format !== 'biobench-project') throw new Error('Not a Bio-Bench project file');
  checkEncoded(doc.project);
  return saveProject({ id: newId(), ...decodeProject(doc.project) });
}

/** Every project on this device in one file, so work survives cleared browser data or a new machine. */
export async function exportBackup(): Promise<{ blob: Blob; count: number }> {
  const all = await (await db()).getAll('projects');
  const projects = [];
  for (const p of all) projects.push(await encodeProject(p));
  const doc = { format: 'biobench-backup', formatVersion: 1, exportedAt: Date.now(), projects };
  return { blob: new Blob([JSON.stringify(doc)], { type: 'application/json' }), count: projects.length };
}

export interface RestoreSummary { added: number; updated: number; skipped: number }

/**
 * Restores a backup keeping original ids and timestamps. A project already on this device is replaced
 * only when the backup copy is newer, so restoring never discards later local work.
 */
export async function importBackup(file: Blob): Promise<RestoreSummary> {
  let doc: { format?: string; projects?: unknown[] };
  try { doc = JSON.parse(await file.text()); } catch { throw new Error('Not a Bio-Bench backup file'); }
  if (doc?.format !== 'biobench-backup' || !Array.isArray(doc.projects)) throw new Error('Not a Bio-Bench backup file');
  const d = await db();
  const summary: RestoreSummary = { added: 0, updated: 0, skipped: 0 };
  for (const entry of doc.projects) {
    try { checkEncoded(entry); } catch { summary.skipped++; continue; }
    const existing = await d.get('projects', entry.id);
    const updatedAt = entry.updatedAt ?? Date.now();
    if (existing && existing.updatedAt >= updatedAt) { summary.skipped++; continue; }
    await d.put('projects', { id: entry.id, createdAt: entry.createdAt ?? updatedAt, updatedAt, ...decodeProject(entry) });
    if (existing) summary.updated++; else summary.added++;
  }
  return summary;
}
