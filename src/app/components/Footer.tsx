export const REPO = 'https://github.com/dzyla/toolbox';

export function Footer() {
  return (
    <footer class="mt-12 border-t border-slate-200 py-6 text-center text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
      <p>Bio-Bench v{__APP_VERSION__} · free and open source (AGPL-3.0) · no accounts, no tracking, works offline</p>
      <p class="mt-1 space-x-3">
        <a class="underline" href={`${REPO}/issues/new?template=wrong-value.yml`}>Report a wrong value</a>
        <a class="underline" href={`${REPO}/issues/new?template=tool-request.yml`}>Request a tool</a>
        <a class="underline" href={`${REPO}#citing`}>Cite</a>
        <a class="underline" href={REPO}>Source</a>
      </p>
    </footer>
  );
}
