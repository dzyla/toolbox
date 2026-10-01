import { describe, it, expect } from 'vitest';
import { saveProject, listRecent, getProject, deleteProject, exportProject, importProject, exportBackup, importBackup } from '@/lib/projects';

describe('projects', () => {
  it('saves, lists by recency, gets, deletes', async () => {
    const a = await saveProject({ id: 'a', toolId: 'molarity', name: 'A', version: 1, state: { x: 1 } });
    await new Promise(r => setTimeout(r, 5));
    const b = await saveProject({ id: 'b', toolId: 'gel', name: 'B', version: 1, state: { y: 2 }, thumbnail: new Blob(['png'], { type: 'image/png' }) });
    expect(a.createdAt).toBeLessThanOrEqual(b.createdAt);
    const recent = await listRecent(10);
    expect(recent.map(p => p.id)).toEqual(['b', 'a']);
    expect((await getProject('b'))?.thumbnail).toBeInstanceOf(Blob);
    await deleteProject('a');
    expect(await getProject('a')).toBeUndefined();
  });
  it('exports and imports with blobs and a fresh id', async () => {
    await saveProject({ id: 'c', toolId: 'gel', name: 'C', version: 2, state: { k: 'v' }, assets: { img: new Blob(['abc'], { type: 'text/plain' }) } });
    const blob = await exportProject('c');
    const p = await importProject(blob);
    expect(p.id).not.toBe('c');
    expect(p.state).toEqual({ k: 'v' });
    expect(await p.assets!.img!.text()).toBe('abc');
    expect(p.version).toBe(2);
  });
  it('backs up every project and restores without overwriting newer local work', async () => {
    await saveProject({ id: 'bk1', toolId: 'gel', name: 'One', version: 1, state: { n: 1 }, assets: { f: new Blob(['zz'], { type: 'text/plain' }) } });
    await saveProject({ id: 'bk2', toolId: 'dsf', name: 'Two', version: 1, state: { n: 2 } });
    const { blob, count } = await exportBackup();
    expect(count).toBeGreaterThanOrEqual(2);

    await deleteProject('bk1');
    await new Promise(r => setTimeout(r, 5));
    await saveProject({ id: 'bk2', toolId: 'dsf', name: 'Two (edited)', version: 1, state: { n: 99 } });

    const summary = await importBackup(blob);
    expect(summary.added).toBe(1);
    const one = await getProject('bk1');
    expect(one?.state).toEqual({ n: 1 });
    expect(await one!.assets!.f!.text()).toBe('zz');
    // The newer local edit wins over the older backup copy.
    expect((await getProject('bk2'))?.name).toBe('Two (edited)');
    expect(summary.skipped).toBeGreaterThanOrEqual(1);
  });
  it('rejects files that are not backups', async () => {
    await expect(importBackup(new Blob(['{"format":"nope"}']))).rejects.toThrow(/backup/);
    await expect(importBackup(new Blob(['not json']))).rejects.toThrow(/backup/);
  });
});
