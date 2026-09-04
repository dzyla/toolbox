export const REPO = 'https://github.com/dzyla/toolbox';
export const AUTHOR_URL = 'https://github.com/dzyla';

export function Footer() {
  return (
    <footer class="mt-12 border-t border-slate-200 py-6 text-center text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
      <p>
        Bio-Bench v{__APP_VERSION__} · Developed by{' '}
        <a
          class="underline font-semibold text-slate-700 dark:text-slate-200 hover:text-accent-600 dark:hover:text-accent-400"
          href={AUTHOR_URL}
          target="_blank"
          rel="noopener noreferrer"
        >
          Dawid Zyla
        </a>{' '}
        · free and open source (AGPL-3.0) · no accounts, no tracking, works offline
      </p>
      <p class="mt-1 space-x-3">
        <a class="underline" href={`${REPO}/issues/new?template=wrong-value.yml`}>Report a wrong value</a>
        <a class="underline" href={`${REPO}/issues/new?template=tool-request.yml`}>Request a tool</a>
        <a class="underline" href={`${REPO}#citing`}>Cite</a>
        <a class="underline" href={REPO}>Source</a>
      </p>
    </footer>
  );
}
