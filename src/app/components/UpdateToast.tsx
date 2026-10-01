import { useEffect } from 'preact/hooks';
import { useRegisterSW } from 'virtual:pwa-register/preact';

export function UpdateToast() {
  const { needRefresh: [needRefresh], offlineReady: [offlineReady, setOfflineReady], updateServiceWorker } = useRegisterSW();
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
        <button type="button" class="rounded-lg bg-accent-600 px-3 py-1 text-sm text-white" onClick={() => updateServiceWorker(true)}>Update</button>
      </> : <>
        <span class="text-sm">Ready to work offline.</span>
        <button type="button" class="text-sm underline" onClick={() => setOfflineReady(false)}>OK</button>
      </>}
    </div>
  );
}
