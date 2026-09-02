import { signal } from '@preact/signals';

export type Route =
  | { name: 'home' }
  | { name: 'tool'; toolId: string; projectId?: string; state?: string }
  | { name: 'notfound'; hash: string };

export function parseRoute(hash: string): Route {
  const h = hash.replace(/^#/, '');
  if (h === '' || h === '/') return { name: 'home' };
  const [path, query = ''] = h.split('?') as [string, string?];
  const m = path.match(/^\/t\/([a-z0-9-]+)(?:\/p\/([A-Za-z0-9_-]+))?\/?$/);
  if (!m) return { name: 'notfound', hash };
  const r: Route = { name: 'tool', toolId: m[1]! };
  if (m[2]) r.projectId = m[2];
  const s = new URLSearchParams(query).get('s');
  if (s) r.state = s;
  return r;
}

export function toHash(route: Route): string {
  if (route.name === 'home') return '#/';
  if (route.name === 'notfound') return route.hash;
  let h = `#/t/${route.toolId}`;
  if (route.projectId) h += `/p/${route.projectId}`;
  if (route.state) h += `?s=${route.state}`;
  return h;
}

const initial = typeof location !== 'undefined' ? location.hash : '';
export const route = signal<Route>(parseRoute(initial));

if (typeof window !== 'undefined') {
  window.addEventListener('hashchange', () => { route.value = parseRoute(location.hash); });
}

export function navigate(r: Route) { location.hash = toHash(r); }
/** Update the URL without a hashchange event (used for tool state). */
export function replaceState(r: Route) {
  history.replaceState(null, '', toHash(r));
  route.value = r;
}
