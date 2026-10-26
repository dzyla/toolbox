import { describe, expect, it, vi } from 'vitest';
import { render, waitFor } from '@testing-library/preact';
import { MolstarViewer, type MolstarHandle } from '@/tools/structure/MolstarViewer';

const METHODS = ['load', 'setRepresentation', 'setColoring', 'highlight', 'select', 'focus', 'snapshot'] as const;

describe('MolstarViewer (test environment: host only, no Mol*)', () => {
  it('renders the viewer host and hands over a handle with all seven methods once', async () => {
    const onReady = vi.fn<(h: MolstarHandle) => void>();
    const { container } = render(<MolstarViewer label="1UBQ" height={400} showControls={false} onReady={onReady} />);

    const host = container.querySelector('[role="region"]') as HTMLElement;
    expect(host).toBeTruthy();
    expect(host.getAttribute('aria-label')).toContain('1UBQ');
    await waitFor(() => expect(onReady).toHaveBeenCalledTimes(1));

    const handle = onReady.mock.calls[0]![0];
    for (const m of METHODS) expect(typeof handle[m], m).toBe('function');
  });

  it('handle methods resolve immediately and do nothing', async () => {
    let handle: MolstarHandle | undefined;
    render(<MolstarViewer label="X" height={300} showControls={false} onReady={h => { handle = h; }} />);
    await waitFor(() => expect(handle).toBeTruthy());
    const h = handle!;
    await expect(h.load('data_x', 'mmcif', 'X', 0)).resolves.toBeUndefined();
    await expect(h.setRepresentation('surface')).resolves.toBeUndefined();
    await expect(h.setColoring('uncertainty')).resolves.toBeUndefined();
    expect(() => h.highlight([{ authAsymId: 'A', authSeqId: 1, insCode: '' }])).not.toThrow();
    expect(() => h.select([])).not.toThrow();
    expect(() => h.focus([])).not.toThrow();
    const png = await h.snapshot();
    expect(png).toBeInstanceOf(Blob);
    expect(png.type).toBe('image/png');
  });

  it('re-rendering with a new height or showControls does not call onReady again', async () => {
    const onReady = vi.fn<(h: MolstarHandle) => void>();
    const { rerender, container } = render(<MolstarViewer label="1UBQ" height={400} showControls={false} onReady={onReady} />);
    await waitFor(() => expect(onReady).toHaveBeenCalledTimes(1));

    rerender(<MolstarViewer label="1UBQ" height={800} showControls={false} onReady={onReady} />);
    rerender(<MolstarViewer label="1UBQ" height={800} showControls onReady={onReady} />);
    rerender(<MolstarViewer label="4HHB" height={500} showControls={false} onReady={onReady} />);
    await new Promise(r => setTimeout(r, 20));

    expect(onReady).toHaveBeenCalledTimes(1);
    const host = container.querySelector('[role="region"]') as HTMLElement;
    expect(host.style.height).toBe('500px');
  });
});
