import { signal, computed, effect } from '@preact/signals';

export type Theme = 'light' | 'dark' | 'system';
const KEY = 'bb.theme';
export const theme = signal<Theme>('system');
const systemDark = signal(false);
export const resolvedDark = computed(() => theme.value === 'system' ? systemDark.value : theme.value === 'dark');

let initialised = false;
export function initTheme() {
  if (initialised) return;
  initialised = true;
  try { const s = localStorage.getItem(KEY); if (s === 'light' || s === 'dark') theme.value = s; } catch { /* private mode */ }
  const mq = typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : null;
  systemDark.value = !!mq?.matches;
  mq?.addEventListener?.('change', e => { systemDark.value = e.matches; });
  effect(() => { document.documentElement.classList.toggle('dark', resolvedDark.value); });
}

export function setTheme(t: Theme) {
  theme.value = t;
  try { if (t === 'system') localStorage.removeItem(KEY); else localStorage.setItem(KEY, t); } catch { /* ignore */ }
}
