import { describe, expect, it } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/preact';
import { deleteDraft, loadDraft, saveDraft, useDraftText } from '@/lib/drafts';

function Editor({ onRestore }: { onRestore?: (v: string) => void }) {
  const [text, setText] = useDraftText('test:raw', () => 'demo', onRestore);
  return (
    <div>
      <textarea aria-label="raw" value={text} onInput={e => setText((e.target as HTMLTextAreaElement).value)} />
      <button type="button" onClick={() => setText('preset', { persist: false })}>preset</button>
    </div>
  );
}

describe('drafts', () => {
  it('round-trips a draft', async () => {
    await saveDraft('k', 'value');
    expect(await loadDraft('k')).toBe('value');
    await deleteDraft('k');
    expect(await loadDraft('k')).toBeUndefined();
  });

  it('restores an edited value after remount and reports the restore', async () => {
    await deleteDraft('test:raw');
    const first = render(<Editor />);
    fireEvent.input(screen.getByLabelText('raw'), { target: { value: 'imported plate' } });
    await waitFor(async () => expect(await loadDraft('test:raw')).toBe('imported plate'));
    first.unmount();

    const restored: string[] = [];
    render(<Editor onRestore={v => restored.push(v)} />);
    await waitFor(() => expect((screen.getByLabelText('raw') as HTMLTextAreaElement).value).toBe('imported plate'));
    expect(restored).toEqual(['imported plate']);
  });

  it('does not keep bundled examples as drafts', async () => {
    await saveDraft('test:raw', 'old import');
    render(<Editor />);
    await waitFor(() => expect((screen.getByLabelText('raw') as HTMLTextAreaElement).value).toBe('old import'));
    fireEvent.click(screen.getByText('preset'));
    await waitFor(async () => expect(await loadDraft('test:raw')).toBeUndefined());
  });
});
