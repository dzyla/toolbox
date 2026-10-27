import { useEffect, useState } from 'preact/hooks';
import { useRegisterSW } from 'virtual:pwa-register/preact';

/**
 * Switch to the new version and reload. The plugin's own handler only reloads on
 * `controllerchange`, which a tab that no worker controls (first visit, hard refresh) never
 * receives; there the new worker may even have taken over already, leaving nothing waiting.
 * So reload on whichever comes first: the page's controller changing, or the waiting worker
 * becoming active; with nothing waiting, reload straight away.
 */
async function applyUpdate(skipWaiting: () => Promise<void>) {
  let done = false;
  const reload = () => {
    if (done) return;
    done = true;
    window.location.reload();
  };
  const sw = navigator.serviceWorker;
  const waiting = (await sw?.getRegistration())?.waiting ?? null;
  if (!waiting) {
    reload();
    return;
  }
  sw.addEventListener('controllerchange', reload);
  waiting.addEventListener('statechange', () => { if (waiting.state === 'activated') reload(); });
  await skipWaiting();
}

export function UpdateToast() {
  const { needRefresh: [needRefresh], offlineReady: [offlineReady, setOfflineReady], updateServiceWorker } = useRegisterSW();
  const [updating, setUpdating] = useState(false);
  // The "ready offline" notice is informational: dismiss it by itself so it does not sit on top of the tool.
  useEffect(() => {
    if (!offlineReady || needRefresh) return;
    const t = setTimeout(() => setOfflineReady(false), 6000);
    return () => clearTimeout(t);
  }, [offlineReady, needRefresh]);
  if (!needRefresh && !offlineReady) return null;
  return (
    <div role="status" class="fixed bottom-4 left-1/2 z-40 flex -translate-x-1/2 items-center gap-3 rounded-xl border border-slate-300 bg-white px-4 py-2 shadow-lg dark:border-slate-700 dark:bg-slate-900">
      {needRefresh ? <>
        <span class="text-sm">A new version is available.</span>
        <button type="button" disabled={updating} class="rounded-lg bg-accent-600 px-3 py-1 text-sm text-white disabled:opacity-60"
          onClick={() => { setUpdating(true); void applyUpdate(() => updateServiceWorker(true)).catch(() => window.location.reload()); }}>
          {updating ? 'Updating…' : 'Update'}
        </button>
      </> : <>
        <span class="text-sm">Ready to work offline.</span>
        <button type="button" class="text-sm underline" onClick={() => setOfflineReady(false)}>OK</button>
      </>}
    </div>
  );
}
