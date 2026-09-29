import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/preact';
import GelView from '@/tools/gel/View';
import ProtocolsView from '@/tools/protocols/View';
import { route } from '@/app/router';
import { deleteProject, getProject, listRecent, saveProject } from '@/lib/projects';
import { gelProjectSnapshot, restoreGelProject, MAX_SAVED_PIXELS } from '@/tools/gel/project';
import { protocolProjectSnapshot, restoreProtocolProject } from '@/tools/protocols/project';
import { BUNDLED_PROTOCOLS } from '@/core/protocols';
import { encodeState as encodeLink } from '@/lib/url-state';

const plane = { width: 4, height: 3, data: Float32Array.from({ length: 12 }, (_, i) => i / 11) };
const gelData = {
  imageName: 'western.tif',
  gelTitle: 'Anti-His blot',
  lanes: [{ id: 'l1', x: 1, y0: 0, y1: 3, width: 1, tilt: 0 }],
  selectedLaneId: 'l1',
  bandMap: { l1: [{ id: 'b1', y0: 0, y1: 1, peakY: 0.5, manual: true }] },
  laneLabels: { l1: 'Lysate' },
  customMassMap: { b1: 250 },
  display: { showMwLabels: false, showLaneHeaders: true, stripLanePrefix: true, gelLayout: 'stacked' as const },
  settings: { polarity: 'light', prominence: 0.1 },
  laneMeta: {},
  ladderSizeMap: {},
  sourceInfo: null,
  appliedTransforms: [] as string[],
};

describe('gel projects', () => {
  it('round-trips the working image, lanes, bands and settings through the projects store', async () => {
    await saveProject({ id: 'gel-rt', toolId: 'gel', ...gelProjectSnapshot(plane, gelData) });
    const restored = await restoreGelProject((await getProject('gel-rt'))!);
    expect(restored.plane.width).toBe(4);
    expect(Array.from(restored.plane.data)).toEqual(Array.from(plane.data));
    expect(restored.data).toEqual(gelData);
    await deleteProject('gel-rt');
  });

  it('rejects damaged or oversized projects with a readable message', async () => {
    const snap = gelProjectSnapshot(plane, gelData);
    const base = { id: 'x', toolId: 'gel', name: 'x', version: 1, createdAt: 0, updatedAt: 0 };
    await expect(restoreGelProject({ ...base, state: snap.state, assets: {} })).rejects.toThrow(/image is missing/);
    await expect(restoreGelProject({ ...base, state: snap.state, assets: { 'plane.f32': new Blob([new Uint8Array(8)]) } })).rejects.toThrow(/incomplete/);
    await expect(restoreGelProject({ ...base, state: { ...snap.state, lanes: [{ id: 3 }] }, assets: snap.assets })).rejects.toThrow(/lane layout/);
    await expect(restoreGelProject({ ...base, state: { schemaVersion: 99 }, assets: snap.assets })).rejects.toThrow(/unsupported format/);
    const huge = { width: MAX_SAVED_PIXELS + 1, height: 1, data: new Float32Array(1) };
    expect(() => gelProjectSnapshot(huge, gelData)).toThrow(/Crop it first/);
  });

  it('opens a saved gel from /p/:id and saves back into the same project', async () => {
    await saveProject({ id: 'gel-open', toolId: 'gel', ...gelProjectSnapshot(plane, gelData) });
    route.value = { name: 'tool', toolId: 'gel', projectId: 'gel-open' };
    render(<GelView projectId="gel-open" />);
    expect(await screen.findByText('Opened saved project: Anti-His blot.')).toBeTruthy();
    expect((screen.getByDisplayValue('Anti-His blot') as HTMLInputElement).value).toBe('Anti-His blot');
    fireEvent.click(screen.getByRole('button', { name: 'Save project' }));
    expect(await screen.findByText(/Saved "Anti-His blot" on this device/)).toBeTruthy();
    expect((await listRecent()).filter(p => p.toolId === 'gel' && p.id === 'gel-open')).toHaveLength(1);
    await deleteProject('gel-open');
  });
});

describe('gel project schema 2', () => {
  const stored = (snap: ReturnType<typeof gelProjectSnapshot>) => ({ ...snap, id: 'p', toolId: 'gel', updatedAt: 0, createdAt: 0 });
  it('round-trips lane metadata, ladder overrides and source info', async () => {
    const snap = gelProjectSnapshot(plane, { ...gelData, laneMeta: { l1: { condition: 'ctrl', replicate: 1, excluded: false } },
      ladderSizeMap: { b1: 250, b2: null }, sourceInfo: { format: 'tiff', bitDepth: 16, lossy: false, rescaled: false }, appliedTransforms: ['crop (exact)'] });
    const { data } = await restoreGelProject(stored(snap));
    expect(data.laneMeta.l1!.condition).toBe('ctrl');
    expect(data.ladderSizeMap).toEqual({ b1: 250, b2: null });
    expect(data.sourceInfo!.bitDepth).toBe(16);
    expect(data.appliedTransforms).toEqual(['crop (exact)']);
  });
  it('opens a schema 1 project with empty metadata', async () => {
    const snap = gelProjectSnapshot(plane, gelData);
    (snap.state as { schemaVersion: number }).schemaVersion = 1;
    for (const k of ['laneMeta', 'ladderSizeMap', 'sourceInfo', 'appliedTransforms']) delete (snap.state as unknown as Record<string, unknown>)[k];
    const { data } = await restoreGelProject(stored(snap));
    expect(data.laneMeta).toEqual({});
    expect(data.sourceInfo).toBeNull();
  });
});

describe('protocol runs', () => {
  it('saves step progress and restores it, including custom protocols', async () => {
    const protocol = JSON.parse(JSON.stringify(BUNDLED_PROTOCOLS[0]!));
    protocol.steps[0].completed = true;
    protocol.steps[1].completed = true;
    await saveProject({ id: 'run-1', toolId: 'protocols', ...protocolProjectSnapshot(protocol, protocol.id) });
    route.value = { name: 'tool', toolId: 'protocols', projectId: 'run-1' };
    render(<ProtocolsView projectId="run-1" />);
    await waitFor(() => expect(screen.getByTestId('progress-text').textContent).toMatch(/^2 \//));
    expect(screen.getByText(/Opened saved project/)).toBeTruthy();
    await deleteProject('run-1');
  });

  it('rejects runs with damaged steps', () => {
    const base = { id: 'x', toolId: 'protocols', name: 'x', version: 1, createdAt: 0, updatedAt: 0 };
    expect(() => restoreProtocolProject({ ...base, state: { schemaVersion: 1, protocol: { id: 'p', title: 't', steps: [{ id: 1 }] } } })).toThrow(/steps are damaged/);
  });

  it('starts on the protocol named in the link, not always the first one', () => {
    const second = BUNDLED_PROTOCOLS[1]!;
    route.value = { name: 'tool', toolId: 'protocols', state: undefined };
    const { unmount } = render(<ProtocolsView />);
    unmount();
    // Encode a link that selects the second protocol.
    route.value = { name: 'tool', toolId: 'protocols', state: encodeLink({ protocolId: second.id }) };
    render(<ProtocolsView />);
    expect(screen.getByTestId('progress-text').textContent).toMatch(new RegExp(`/ ${second.steps.length} completed`));
  });
});

