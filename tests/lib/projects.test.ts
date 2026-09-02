import { describe, it, expect } from 'vitest';
import { saveProject, listRecent, getProject, deleteProject, exportProject, importProject } from '@/lib/projects';

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
});
