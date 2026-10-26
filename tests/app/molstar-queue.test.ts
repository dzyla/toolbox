import { describe, expect, it } from 'vitest';
import { createViewerQueue, type ViewerOps, type ViewerStyle } from '@/tools/structure/viewer-queue';

/** Fake Mol* operations that record start/end order and the style each one saw. */
function fakeOps() {
  const log: string[] = [];
  let running = 0;
  let overlap = false;
  const gates = new Map<string, () => void>();
  const step = async (name: string, wait: boolean) => {
    running += 1;
    if (running > 1) overlap = true;
    log.push(`start ${name}`);
    if (wait) await new Promise<void>(r => gates.set(name, r));
    else await Promise.resolve();
    log.push(`end ${name}`);
    running -= 1;
  };
  const slow = new Set<string>();
  const ops: ViewerOps = {
    isDisposed: () => false,
    async load(isCurrent, _data, _format, label, _modelIndex, style: ViewerStyle) {
      await step(`load ${label}`, slow.has(label));
      if (isCurrent()) log.push(`shown ${label} as ${style.representation}/${style.coloring ?? 'default'}`);
    },
    applyRepresentation: style => step(`repr ${style.representation}`, false),
    applyColoring: style => step(`colour ${style.coloring}`, false),
  };
  return { ops, log, slow, gates, overlap: () => overlap };
}

const flush = () => new Promise(r => setTimeout(r, 0));

describe('Mol* viewer queue (R17)', () => {
  it('a representation change during a load waits for it, and runs before a later load', async () => {
    const f = fakeOps();
    f.slow.add('A');
    const q = createViewerQueue(f.ops);
    const a = q.load('data', 'mmcif', 'A', 0);
    const r = q.setRepresentation('surface');
    const c = q.setColoring('entity-id');
    await flush();
    expect(f.log).toEqual(['start load A']);
    const b = q.load('data', 'mmcif', 'B', 0);
    f.gates.get('load A')!();
    await Promise.all([a, r, c, b]);
    expect(f.overlap()).toBe(false);
    expect(f.log).toEqual([
      'start load A', 'end load A',            // superseded by B: never shown
      'start repr surface', 'end repr surface',
      'start colour entity-id', 'end colour entity-id',
      'start load B', 'end load B',
      'shown B as surface/entity-id',          // the later load keeps the chosen style
    ]);
  });

  it('a superseded load that has not started is skipped', async () => {
    const f = fakeOps();
    f.slow.add('A');
    const q = createViewerQueue(f.ops);
    const a = q.load('d', 'mmcif', 'A', 0);
    await flush();                                  // A has started
    const b = q.load('d', 'mmcif', 'B', 0);         // superseded by C before its turn
    const c = q.load('d', 'pdb', 'C', 0);
    f.gates.get('load A')!();
    await Promise.all([a, b, c]);
    expect(f.log).toEqual(['start load A', 'end load A', 'start load C', 'end load C', 'shown C as auto/default']);
  });

  it('a failing step rejects its own call but does not stall the queue', async () => {
    const f = fakeOps();
    const q = createViewerQueue({ ...f.ops, applyRepresentation: async () => { throw new Error('boom'); } });
    await expect(q.setRepresentation('spacefill')).rejects.toThrow('boom');
    await q.load('d', 'mmcif', 'A', 0);
    expect(f.log).toContain('shown A as spacefill/default');
  });

  it('does nothing once disposed', async () => {
    const f = fakeOps();
    let disposed = false;
    const q = createViewerQueue({ ...f.ops, isDisposed: () => disposed });
    disposed = true;
    await q.load('d', 'mmcif', 'A', 0);
    await q.setColoring('chain-id');
    expect(f.log).toEqual([]);
  });
});
