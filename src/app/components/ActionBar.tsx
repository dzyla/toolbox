import { useState } from 'preact/hooks';

export interface ActionBarProps {
  onCopy: () => string;
  shareUrl?: () => string;
  /** Adds a "Save project" button; the promise settles when the save finished (success or error shown by the tool). */
  onSaveProject?: () => Promise<void>;
  /** Status line from the tool's project hook, e.g. "Saved … on this device." */
  projectStatus?: { kind: string; message: string };
}

export function ActionBar({ onCopy, shareUrl, onSaveProject, projectStatus }: ActionBarProps) {
  const [msg, setMsg] = useState('');
  const [saving, setSaving] = useState(false);
  const flash = (m: string) => { setMsg(m); setTimeout(() => setMsg(''), 1500); };
  const copy = async (text: string, m: string) => { try { await navigator.clipboard.writeText(text); flash(m); } catch { flash('Copy failed'); } };
  const save = async () => {
    if (!onSaveProject) return;
    setSaving(true);
    try { await onSaveProject(); } finally { setSaving(false); }
  };
  return (
    <div class="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white/90 p-2 backdrop-blur dark:border-slate-700 dark:bg-slate-900/90">
      <button type="button" class="rounded-lg bg-accent-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-accent-700" onClick={() => copy(onCopy(), 'Result copied')}>Copy result</button>
      {shareUrl && <button type="button" class="rounded-lg border border-slate-300 px-3 py-1.5 text-sm dark:border-slate-700" onClick={() => copy(shareUrl(), 'Link copied')}>Share link</button>}
      {onSaveProject && (
        <button type="button" disabled={saving} class="rounded-lg border border-slate-300 px-3 py-1.5 text-sm disabled:opacity-60 dark:border-slate-700" onClick={() => void save()}>
          {saving ? 'Saving…' : 'Save project'}
        </button>
      )}
      <span role="status" class="text-xs text-slate-500 dark:text-slate-400">{msg}</span>
      {projectStatus?.message && (
        <span role={projectStatus.kind === 'error' ? 'alert' : 'status'} class={`w-full text-xs ${projectStatus.kind === 'error' ? 'text-rose-700 dark:text-rose-400' : 'text-slate-600 dark:text-slate-400'}`}>
          {projectStatus.message}
        </span>
      )}
    </div>
  );
}
