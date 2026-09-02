import { useState } from 'preact/hooks';

export function ActionBar({ onCopy, shareUrl }: { onCopy: () => string; shareUrl?: () => string }) {
  const [msg, setMsg] = useState('');
  const flash = (m: string) => { setMsg(m); setTimeout(() => setMsg(''), 1500); };
  const copy = async (text: string, m: string) => { try { await navigator.clipboard.writeText(text); flash(m); } catch { flash('Copy failed'); } };
  return (
    <div class="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white/90 p-2 backdrop-blur dark:border-slate-700 dark:bg-slate-900/90">
      <button type="button" class="rounded-lg bg-accent-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-accent-700" onClick={() => copy(onCopy(), 'Result copied')}>Copy result</button>
      {shareUrl && <button type="button" class="rounded-lg border border-slate-300 px-3 py-1.5 text-sm dark:border-slate-700" onClick={() => copy(shareUrl(), 'Link copied')}>Share link</button>}
      <span role="status" class="text-xs text-slate-500">{msg}</span>
    </div>
  );
}
