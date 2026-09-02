# Phase 1 — Bio-Bench scaffold Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the new Bio-Bench app shell (home, registry, router, theme, projects, URL state, PWA, deploy) with one real tool proving the pattern end to end, while the legacy tools keep working under `/legacy/`.

**Architecture:** Vite + TypeScript + Preact single-page app with hash routing. Science lives in DOM-free `src/core/` (Vitest reference tests). Tools register in `src/tools/registry.ts`; Home, nav and search are generated from it. Projects persist in IndexedDB; calculator state is encoded in the URL hash. Legacy HTML moves to `legacy/` untouched and is copied into `dist/legacy/` on deploy.

**Tech Stack:** vite 8, typescript 7, preact 10 + @preact/signals, tailwindcss 4 (@tailwindcss/vite), vitest 4 + happy-dom + @testing-library/preact, fake-indexeddb, idb 8, lz-string, vite-plugin-pwa, eslint 10 + typescript-eslint, @playwright/test.

**Spec:** `docs/superpowers/specs/2026-09-02-bio-bench-rebuild-design.md` (sections 2, 3, 4, 7, 8, 9, 10, 11 phase 1).

## Global Constraints

- `src/core/**` never imports from `src/app`, `src/tools`, `src/lib` and never touches `window`, `document`, `localStorage`, `fetch`, `navigator` (ESLint enforced).
- Every exported `core` function has a Vitest test; every constant carries a source comment.
- Name: **Bio-Bench**. License: AGPL-3.0 for code, CC-BY-4.0 for `src/data/**`.
- Hash routes only (`#/…`). Vite `base` comes from `BASE_PATH` env (default `/`).
- No analytics, no telemetry, no accounts. Only `localStorage` key prefix: `bb.`.
- Commit after every task: `feat(app): …`, `chore: …`, `test: …`.
- `npm test` must pass before each commit (`vitest run` + legacy node tests).

---

### Task 1: Move legacy tools to `legacy/` and keep their tests green

**Files:**
- Move: every root `*.html`, `*.js`, `shared.css` → `legacy/`
- Modify: `tests/legacy/load.js` (ROOT → `legacy/`), `.github/workflows/static.yml` (delete; replaced in Task 10)
- Create: `legacy/README.md`

- [ ] **Step 1: Move files with git**

```bash
mkdir -p legacy
git mv index.html bio_bench.html binding_calculator.html color_generator.html gel_annotator.html protein_params.html text_counter.html text_detector.html legacy/
git mv definitions.js labConstants.js bio_align_engine.js binding_engine.js shared.css legacy/
git rm .github/workflows/static.yml
```

- [ ] **Step 2: Point the harness at `legacy/`**

In `tests/legacy/load.js` change `export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');` to `export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'legacy');`

- [ ] **Step 3: legacy/README.md**

```markdown
# Legacy tools

The original standalone tools, frozen. They are deployed under `/legacy/` until
each has been ported to the new Bio-Bench app. Science fixes from the 2026-09-02
audit are applied here; new features go into `src/`.
```

- [ ] **Step 4: Run and commit**

Run: `node --test tests/legacy/*.test.js` → 18 pass.
```bash
git add -A && git commit -m "chore: move legacy tools to legacy/"
```

---

### Task 2: Vite + Preact + TypeScript + Tailwind toolchain

**Files:**
- Create: `package.json` (replace), `vite.config.ts`, `tsconfig.json`, `index.html`, `src/main.tsx`, `src/app/App.tsx`, `src/styles/app.css`, `vitest.config.ts`, `eslint.config.js`, `.gitignore`, `tests/setup.ts`
- Test: `tests/app/smoke.test.tsx`

**Interfaces:**
- Produces: `npm run dev|build|preview|test|test:legacy|lint|typecheck`.

- [ ] **Step 1: package.json**

```json
{
  "name": "bio-bench",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "license": "AGPL-3.0-only",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "typecheck": "tsc --noEmit",
    "lint": "eslint src tests",
    "test:unit": "vitest run",
    "test:legacy": "node --test tests/legacy/*.test.js",
    "test": "npm run test:unit && npm run test:legacy",
    "e2e": "playwright test"
  },
  "dependencies": {
    "@preact/signals": "^2.11.1",
    "idb": "^8.0.3",
    "lz-string": "^1.5.0",
    "preact": "^10.29.8"
  },
  "devDependencies": {
    "@playwright/test": "^1.62.1",
    "@preact/preset-vite": "^2.10.6",
    "@tailwindcss/vite": "^4.3.3",
    "@testing-library/preact": "^3.2.4",
    "@types/lz-string": "^1.5.0",
    "eslint": "^10.9.1",
    "fake-indexeddb": "^6.0.0",
    "happy-dom": "^18.0.0",
    "tailwindcss": "^4.3.3",
    "typescript": "^5.9.0",
    "typescript-eslint": "^8.69.0",
    "vite": "^8.2.2",
    "vite-plugin-pwa": "^1.3.0",
    "vitest": "^4.1.11"
  }
}
```

(TypeScript is pinned to 5.x because typescript-eslint 8 targets it; if `npm install` reports a peer conflict, keep 5.x.)

- [ ] **Step 2: vite.config.ts**

```ts
import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: process.env.BASE_PATH ?? '/',
  plugins: [
    preact(),
    tailwindcss(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['favicon.svg', 'icons/*.svg', 'icons/*.png'],
      manifest: {
        name: 'Bio-Bench',
        short_name: 'Bio-Bench',
        description: 'Free, offline lab calculators, sequence tools and gel analysis.',
        theme_color: '#0f172a',
        background_color: '#f8fafc',
        display: 'standalone',
        start_url: '.',
        scope: '.',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      },
      workbox: { globPatterns: ['**/*.{js,css,html,svg,png,woff2}'], navigateFallbackDenylist: [/^\/legacy\//] }
    })
  ],
  build: { target: 'es2022', sourcemap: true }
});
```

- [ ] **Step 3: tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "jsx": "react-jsx",
    "jsxImportSource": "preact",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "skipLibCheck": true,
    "isolatedModules": true,
    "resolveJsonModule": true,
    "types": ["vite/client", "vite-plugin-pwa/preact"],
    "paths": { "@/*": ["./src/*"] },
    "baseUrl": "."
  },
  "include": ["src", "tests/app", "tests/core", "tests/lib", "tests/setup.ts", "vite.config.ts", "vitest.config.ts"]
}
```

- [ ] **Step 4: index.html, main.tsx, App.tsx, app.css**

`index.html`:
```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
    <meta name="color-scheme" content="light dark" />
    <meta name="theme-color" media="(prefers-color-scheme: light)" content="#f8fafc" />
    <meta name="theme-color" media="(prefers-color-scheme: dark)" content="#0f172a" />
    <title>Bio-Bench</title>
    <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
    <script>
      try {
        var t = localStorage.getItem('bb.theme');
        var d = t ? t === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
        document.documentElement.classList.toggle('dark', d);
      } catch (e) {}
    </script>
  </head>
  <body class="bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
    <div id="app"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`src/main.tsx`:
```tsx
import { render } from 'preact';
import { App } from './app/App';
import './styles/app.css';

render(<App />, document.getElementById('app')!);
```

`src/app/App.tsx` (minimal for this task; grows in Task 4):
```tsx
export function App() {
  return <main class="p-6"><h1 class="text-2xl font-bold">Bio-Bench</h1></main>;
}
```

`src/styles/app.css`:
```css
@import "tailwindcss";
@custom-variant dark (&:where(.dark, .dark *));

@theme {
  --font-sans: "Inter", ui-sans-serif, system-ui, sans-serif;
  --font-mono: ui-monospace, SFMono-Regular, Menlo, monospace;
  --color-accent-50: #eef2ff;
  --color-accent-500: #6366f1;
  --color-accent-600: #4f46e5;
  --color-accent-700: #4338ca;
}

html { scroll-behavior: smooth; -webkit-font-smoothing: antialiased; }
body { font-family: var(--font-sans); }
.mono { font-family: var(--font-mono); }
```

- [ ] **Step 5: vitest.config.ts, tests/setup.ts, eslint.config.js, .gitignore**

`vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config';
import preact from '@preact/preset-vite';

export default defineConfig({
  plugins: [preact()],
  resolve: { alias: { '@': new URL('./src', import.meta.url).pathname } },
  test: {
    environment: 'happy-dom',
    include: ['tests/app/**/*.test.{ts,tsx}', 'tests/core/**/*.test.ts', 'tests/lib/**/*.test.ts'],
    setupFiles: ['tests/setup.ts']
  }
});
```

`tests/setup.ts`:
```ts
import 'fake-indexeddb/auto';
```

`eslint.config.js`:
```js
import tseslint from 'typescript-eslint';

export default tseslint.config(
  ...tseslint.configs.recommended,
  {
    files: ['src/core/**/*.ts'],
    rules: {
      'no-restricted-globals': ['error', 'window', 'document', 'localStorage', 'sessionStorage', 'fetch', 'navigator', 'indexedDB'],
      'no-restricted-imports': ['error', { patterns: ['**/app/**', '**/tools/**', '**/lib/**', 'preact', 'preact/*', '@preact/*'] }]
    }
  },
  { ignores: ['dist', 'legacy', 'node_modules', 'dev-dist'] }
);
```

`.gitignore`:
```
node_modules
dist
dev-dist
playwright-report
test-results
.DS_Store
```

- [ ] **Step 6: Smoke test**

`tests/app/smoke.test.tsx`:
```tsx
import { render, screen } from '@testing-library/preact';
import { describe, it, expect } from 'vitest';
import { App } from '@/app/App';

describe('App', () => {
  it('renders the Bio-Bench heading', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: /Bio-Bench/ })).toBeTruthy();
  });
});
```

- [ ] **Step 7: Install, run, build, commit**

Run: `npm install` then `npm run typecheck && npm run lint && npm test && npm run build`. Expected: all pass; `dist/index.html` exists. (`favicon.svg` and icons come in Task 9; the build warns but succeeds without them.)

```bash
git add -A && git commit -m "chore: Vite + Preact + TypeScript + Tailwind scaffold with Vitest and ESLint"
```

---

### Task 3: Tool registry and hash router

**Files:**
- Create: `src/tools/registry.ts`, `src/app/router.ts`
- Test: `tests/app/registry.test.ts`, `tests/app/router.test.ts`

**Interfaces:**
- Produces:

```ts
// src/tools/registry.ts
export type Category = 'calculators' | 'sequences' | 'gels' | 'counting' | 'plates' | 'timing' | 'figures';
export interface ToolProps { projectId?: string }
export interface ToolMeta {
  id: string; name: string; category: Category; icon: string; blurb: string;
  keywords: string[]; hasProjects?: boolean; status?: 'ready' | 'legacy' | 'planned';
  legacyHref?: string;                     // for status 'legacy'
  load?: () => Promise<{ default: import('preact').ComponentType<ToolProps> }>;
}
export const CATEGORIES: Record<Category, { label: string; blurb: string; order: number }>;
export const TOOLS: ToolMeta[];
export function findTool(id: string): ToolMeta | undefined;
export function searchTools(query: string): ToolMeta[];   // '' → all, else by name/blurb/keywords, case-insensitive
export function toolsByCategory(): { category: Category; label: string; blurb: string; tools: ToolMeta[] }[];
```

```ts
// src/app/router.ts
export type Route = { name: 'home' } | { name: 'tool'; toolId: string; projectId?: string; state?: string } | { name: 'notfound'; hash: string };
export function parseRoute(hash: string): Route;   // '#/', '', '#' → home; '#/t/molarity' → tool; '#/t/molarity/p/abc' → tool+project; '#/t/molarity?s=XYZ' → tool+state
export function toHash(route: Route): string;
export const route: import('@preact/signals').Signal<Route>;  // updated on hashchange
export function navigate(route: Route): void;
export function replaceState(route: Route): void;               // history.replaceState, no hashchange event
```

- [ ] **Step 1: Tests**

`tests/app/registry.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { TOOLS, CATEGORIES, findTool, searchTools, toolsByCategory } from '@/tools/registry';

describe('registry', () => {
  it('has unique ids and valid categories', () => {
    const ids = TOOLS.map(t => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const t of TOOLS) expect(CATEGORIES[t.category]).toBeTruthy();
    for (const t of TOOLS) expect(t.status === 'legacy' ? t.legacyHref : t.status === 'ready' ? t.load : true).toBeTruthy();
  });
  it('finds and searches', () => {
    expect(findTool('molarity')?.name).toMatch(/Molarity/);
    expect(searchTools('').length).toBe(TOOLS.length);
    expect(searchTools('C1V1').map(t => t.id)).toContain('molarity');
    expect(searchTools('zzzz-none')).toEqual([]);
  });
  it('groups by category in order', () => {
    const groups = toolsByCategory();
    const orders = groups.map(g => CATEGORIES[g.category].order);
    expect(orders).toEqual([...orders].sort((a, b) => a - b));
    for (const g of groups) expect(g.tools.length).toBeGreaterThan(0);
  });
});
```

`tests/app/router.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { parseRoute, toHash } from '@/app/router';

describe('router', () => {
  it('parses home', () => {
    for (const h of ['', '#', '#/']) expect(parseRoute(h)).toEqual({ name: 'home' });
  });
  it('parses tool routes', () => {
    expect(parseRoute('#/t/molarity')).toEqual({ name: 'tool', toolId: 'molarity' });
    expect(parseRoute('#/t/molarity/p/abc123')).toEqual({ name: 'tool', toolId: 'molarity', projectId: 'abc123' });
    expect(parseRoute('#/t/molarity?s=N4Ig')).toEqual({ name: 'tool', toolId: 'molarity', state: 'N4Ig' });
  });
  it('round-trips', () => {
    const r = { name: 'tool', toolId: 'gel', projectId: 'p1' } as const;
    expect(parseRoute(toHash(r))).toEqual(r);
    expect(toHash({ name: 'home' })).toBe('#/');
    expect(toHash({ name: 'tool', toolId: 'molarity', state: 'AB' })).toBe('#/t/molarity?s=AB');
  });
  it('flags unknown', () => {
    expect(parseRoute('#/nope').name).toBe('notfound');
  });
});
```

- [ ] **Step 2: Implement registry**

```ts
// src/tools/registry.ts
import type { ComponentType } from 'preact';

export type Category = 'calculators' | 'sequences' | 'gels' | 'counting' | 'plates' | 'timing' | 'figures';
export interface ToolProps { projectId?: string }
export interface ToolMeta {
  id: string; name: string; category: Category; icon: string; blurb: string;
  keywords: string[]; hasProjects?: boolean; status?: 'ready' | 'legacy' | 'planned';
  legacyHref?: string;
  load?: () => Promise<{ default: ComponentType<ToolProps> }>;
}

export const CATEGORIES: Record<Category, { label: string; blurb: string; order: number }> = {
  calculators: { label: 'Calculators', blurb: 'Molarity, buffers, centrifuge, mixes', order: 1 },
  sequences:   { label: 'Sequences & Proteins', blurb: 'Protein parameters, DNA tools, alignment', order: 2 },
  gels:        { label: 'Gels & Images', blurb: 'Annotate, quantify, measure', order: 3 },
  counting:    { label: 'Counting', blurb: 'Colonies, cells, tallies', order: 4 },
  plates:      { label: 'Plates & Culture', blurb: 'Layouts, seeding, passaging', order: 5 },
  timing:      { label: 'Timing & Protocols', blurb: 'Timers and step-by-step protocols', order: 6 },
  figures:     { label: 'Figures', blurb: 'Colours and export helpers', order: 7 },
};

const L = (file: string) => `legacy/${file}`;

export const TOOLS: ToolMeta[] = [
  { id: 'molarity', name: 'Molarity & Dilution', category: 'calculators', icon: '⚖️',
    blurb: 'Mass, moles, concentration and C1V1 = C2V2', keywords: ['molarity', 'dilution', 'c1v1', 'mass', 'moles', 'mw', 'stock'],
    status: 'ready', load: () => import('./molarity/View') },
  { id: 'buffers', name: 'Buffer & Media Recipes', category: 'calculators', icon: '🧪',
    blurb: 'Recipes from stocks and solids, hydrates, presets', keywords: ['buffer', 'recipe', 'tae', 'pbs', 'hepes', 'tris'],
    status: 'legacy', legacyHref: L('bio_bench.html') },
  { id: 'centrifuge', name: 'Centrifuge', category: 'calculators', icon: '🌀',
    blurb: 'RPM ↔ RCF and k-factor', keywords: ['rpm', 'rcf', 'g force', 'rotor', 'k-factor'],
    status: 'legacy', legacyHref: L('bio_bench.html') },
  { id: 'master-mix', name: 'Master Mix', category: 'calculators', icon: '🧫',
    blurb: 'Reaction mixes with excess and dead volume', keywords: ['pcr', 'master mix', 'reaction'],
    status: 'legacy', legacyHref: L('bio_bench.html') },
  { id: 'ammonium-sulfate', name: 'Ammonium Sulfate', category: 'calculators', icon: '🧂',
    blurb: 'Salt to add for a saturation cut', keywords: ['ammonium sulfate', 'precipitation', 'saturation'],
    status: 'legacy', legacyHref: L('bio_bench.html') },
  { id: 'cryoem', name: 'Cryo-EM', category: 'calculators', icon: '❄️',
    blurb: 'Pixel size, Nyquist, box sizes', keywords: ['cryo-em', 'nyquist', 'box size', 'pixel'],
    status: 'legacy', legacyHref: L('bio_bench.html') },
  { id: 'protein', name: 'Protein Workbench', category: 'sequences', icon: '🧬',
    blurb: 'MW, pI, ε280, instability, digests, plots', keywords: ['protein', 'pi', 'extinction', 'protparam', 'mw', 'digest'],
    status: 'legacy', legacyHref: L('protein_params.html') },
  { id: 'protein-conc', name: 'Protein Concentration', category: 'sequences', icon: '📏',
    blurb: 'A280 to mg/mL and µM', keywords: ['a280', 'concentration', 'nanodrop', 'bradford'],
    status: 'legacy', legacyHref: L('bio_bench.html') },
  { id: 'nucleic', name: 'Nucleic Acids', category: 'sequences', icon: '🧫',
    blurb: 'ng/µL to nM, Tm, oligo mass', keywords: ['dna', 'rna', 'tm', 'primer', 'oligo', 'a260'],
    status: 'legacy', legacyHref: L('bio_bench.html') },
  { id: 'sequence', name: 'Sequence Viewer', category: 'sequences', icon: '🔤',
    blurb: 'View, edit and annotate sequences', keywords: ['sequence', 'fasta', 'viewer'],
    status: 'legacy', legacyHref: L('bio_bench.html') },
  { id: 'align', name: 'Alignment', category: 'sequences', icon: '🔗',
    blurb: 'Pairwise global and local alignment', keywords: ['alignment', 'blosum', 'needleman', 'smith-waterman'],
    status: 'legacy', legacyHref: L('bio_bench.html') },
  { id: 'binding', name: 'Binding Calculator', category: 'sequences', icon: '🧲',
    blurb: 'Kd, complex fractions, cooperativity, Ki', keywords: ['kd', 'binding', 'affinity', 'cheng-prusoff', 'hill'],
    status: 'legacy', legacyHref: L('binding_calculator.html') },
  { id: 'gel', name: 'Gel / Blot', category: 'gels', icon: '🩻',
    blurb: 'Annotate lanes, ladders and bands; quantify', keywords: ['gel', 'blot', 'western', 'ladder', 'densitometry'],
    status: 'legacy', legacyHref: L('gel_annotator.html'), hasProjects: true },
  { id: 'measure', name: 'Image Measurer', category: 'gels', icon: '📐',
    blurb: 'Calibrate and measure distances and areas', keywords: ['measure', 'scale bar', 'distance', 'area'],
    status: 'planned' },
  { id: 'colonies', name: 'Colony Counter', category: 'counting', icon: '🔴',
    blurb: 'Count colonies on a plate photo, on device', keywords: ['colony', 'cfu', 'plate', 'count'],
    status: 'planned' },
  { id: 'hemocytometer', name: 'Hemocytometer', category: 'counting', icon: '🔬',
    blurb: 'Cell counts, viability and seeding', keywords: ['hemocytometer', 'cells', 'viability', 'trypan'],
    status: 'planned' },
  { id: 'tally', name: 'Tally Counter', category: 'counting', icon: '🔢',
    blurb: 'Named counters with limits', keywords: ['counter', 'tally'],
    status: 'planned' },
  { id: 'plate', name: 'Plate Layout', category: 'plates', icon: '🟦',
    blurb: 'Lay out 6 to 384 wells', keywords: ['plate', '96', '384', 'wells', 'layout'],
    status: 'planned' },
  { id: 'culture', name: 'Cell Culture', category: 'plates', icon: '🧫',
    blurb: 'Passaging and seeding density', keywords: ['cell culture', 'passage', 'seeding', 'confluence'],
    status: 'planned' },
  { id: 'timers', name: 'Timers', category: 'timing', icon: '⏱️',
    blurb: 'Multiple countdowns and a stopwatch', keywords: ['timer', 'stopwatch', 'countdown'],
    status: 'planned' },
  { id: 'protocols', name: 'Protocols', category: 'timing', icon: '📋',
    blurb: 'Step-by-step protocols with timers', keywords: ['protocol', 'steps', 'checklist'],
    status: 'planned', hasProjects: true },
  { id: 'colors', name: 'Figure Colours', category: 'figures', icon: '🎨',
    blurb: 'Palettes, colour-blind check, PyMOL export', keywords: ['colors', 'palette', 'pymol', 'colorblind'],
    status: 'legacy', legacyHref: L('color_generator.html') },
];

export function findTool(id: string): ToolMeta | undefined { return TOOLS.find(t => t.id === id); }

export function searchTools(query: string): ToolMeta[] {
  const q = query.trim().toLowerCase();
  if (!q) return TOOLS;
  return TOOLS.filter(t => t.name.toLowerCase().includes(q) || t.blurb.toLowerCase().includes(q) || t.keywords.some(k => k.includes(q)));
}

export function toolsByCategory() {
  return (Object.keys(CATEGORIES) as Category[])
    .sort((a, b) => CATEGORIES[a].order - CATEGORIES[b].order)
    .map(category => ({ category, ...CATEGORIES[category], tools: TOOLS.filter(t => t.category === category) }))
    .filter(g => g.tools.length > 0);
}
```

`./molarity/View` does not exist yet; create a placeholder `src/tools/molarity/View.tsx` exporting `export default function View() { return <div>Molarity</div>; }` so typecheck passes; Task 7 replaces it.

- [ ] **Step 3: Implement router**

```ts
// src/app/router.ts
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
export function replaceState(r: Route) {
  history.replaceState(null, '', toHash(r));
  route.value = r;
}
```

- [ ] **Step 4: Run and commit**

Run: `npm run typecheck && npm run lint && npm test`
```bash
git add -A && git commit -m "feat(app): tool registry and hash router"
```

---

### Task 4: App shell — layout, nav, theme, tool host

**Files:**
- Create: `src/app/theme.ts`, `src/app/components/Nav.tsx`, `src/app/components/Footer.tsx`, `src/app/pages/ToolPage.tsx`, `src/app/pages/NotFound.tsx`
- Modify: `src/app/App.tsx`
- Test: `tests/app/theme.test.ts`, `tests/app/shell.test.tsx`

**Interfaces:**
- Produces: `theme: Signal<'light'|'dark'|'system'>`, `resolvedDark: ReadonlySignal<boolean>`, `setTheme(t)`, `initTheme()` (reads `bb.theme`, applies `.dark` on `<html>`, listens to media changes).
- `ToolPage` loads `tool.load()` lazily, shows a loading row, renders the tool with `projectId`; for `legacy` status renders a card linking to `legacyHref` (opens in same tab, relative to `import.meta.env.BASE_URL`); for `planned` shows a "coming soon" card with a link to the GitHub tool-request issue.

- [ ] **Step 1: Tests**

`tests/app/theme.test.ts`:
```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { theme, setTheme, initTheme, resolvedDark } from '@/app/theme';

describe('theme', () => {
  beforeEach(() => { localStorage.clear(); document.documentElement.classList.remove('dark'); });
  it('defaults to system and applies dark class when set', () => {
    initTheme();
    expect(theme.value).toBe('system');
    setTheme('dark');
    expect(resolvedDark.value).toBe(true);
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(localStorage.getItem('bb.theme')).toBe('dark');
    setTheme('light');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });
});
```

`tests/app/shell.test.tsx`:
```tsx
import { render, screen } from '@testing-library/preact';
import { describe, it, expect } from 'vitest';
import { App } from '@/app/App';
import { route } from '@/app/router';

describe('shell', () => {
  it('shows home by default with the search box and categories', async () => {
    route.value = { name: 'home' };
    render(<App />);
    expect(screen.getByRole('searchbox')).toBeTruthy();
    expect(await screen.findByText('Calculators')).toBeTruthy();
  });
  it('shows a legacy link card for legacy tools', async () => {
    route.value = { name: 'tool', toolId: 'protein' };
    render(<App />);
    expect(await screen.findByRole('link', { name: /Open Protein Workbench/ })).toBeTruthy();
  });
  it('shows not found for unknown tools', async () => {
    route.value = { name: 'tool', toolId: 'nothing-here' };
    render(<App />);
    expect(await screen.findByText(/not found/i)).toBeTruthy();
  });
});
```

- [ ] **Step 2: theme.ts**

```ts
import { signal, computed, effect } from '@preact/signals';

export type Theme = 'light' | 'dark' | 'system';
const KEY = 'bb.theme';
export const theme = signal<Theme>('system');
const systemDark = signal(false);
export const resolvedDark = computed(() => theme.value === 'system' ? systemDark.value : theme.value === 'dark');

let initialised = false;
export function initTheme() {
  if (initialised) return; initialised = true;
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
```

- [ ] **Step 3: Nav, Footer, ToolPage, NotFound, App**

`src/app/components/Nav.tsx`:
```tsx
import { route, navigate } from '../router';
import { theme, setTheme, resolvedDark } from '../theme';
import { findTool } from '@/tools/registry';

export function Nav() {
  const r = route.value;
  const tool = r.name === 'tool' ? findTool(r.toolId) : undefined;
  const cycle = () => setTheme(theme.value === 'system' ? (resolvedDark.value ? 'light' : 'dark') : theme.value === 'dark' ? 'light' : 'dark');
  return (
    <header class="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur dark:border-slate-800 dark:bg-slate-900/90">
      <div class="mx-auto flex max-w-6xl items-center gap-3 px-4 py-2">
        <a href="#/" onClick={e => { e.preventDefault(); navigate({ name: 'home' }); }} class="flex items-center gap-2 font-bold">
          <span aria-hidden="true">🧬</span> Bio-Bench
        </a>
        {tool && <span class="truncate text-sm text-slate-500 dark:text-slate-400">/ {tool.icon} {tool.name}</span>}
        <div class="flex-1" />
        <button type="button" onClick={cycle} aria-label="Toggle dark mode"
          class="rounded-full border border-slate-200 px-3 py-1 text-sm dark:border-slate-700">
          {resolvedDark.value ? '☀️ Light' : '🌙 Dark'}
        </button>
      </div>
    </header>
  );
}
```

`src/app/components/Footer.tsx`:
```tsx
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
```
Add to `vite.config.ts` `define: { __APP_VERSION__: JSON.stringify(process.env.npm_package_version ?? '0.0.0') }` and to `src/vite-env.d.ts`: `declare const __APP_VERSION__: string;`. In `vitest.config.ts` add the same `define`.

`src/app/pages/ToolPage.tsx`:
```tsx
import { useEffect, useState } from 'preact/hooks';
import type { ComponentType } from 'preact';
import { findTool, type ToolProps } from '@/tools/registry';
import { NotFound } from './NotFound';
import { REPO } from '../components/Footer';

export function ToolPage({ toolId, projectId }: { toolId: string; projectId?: string }) {
  const tool = findTool(toolId);
  const [Comp, setComp] = useState<ComponentType<ToolProps> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setComp(null); setError(null);
    if (!tool?.load) return;
    let alive = true;
    tool.load().then(m => { if (alive) setComp(() => m.default); }).catch(e => { if (alive) setError(String(e)); });
    return () => { alive = false; };
  }, [toolId]);

  if (!tool) return <NotFound what={`Tool "${toolId}"`} />;

  if (tool.status === 'legacy') {
    const href = `${import.meta.env.BASE_URL}${tool.legacyHref}`;
    return (
      <section class="mx-auto max-w-xl p-6">
        <h1 class="text-2xl font-bold">{tool.icon} {tool.name}</h1>
        <p class="mt-2 text-slate-600 dark:text-slate-300">{tool.blurb}</p>
        <p class="mt-4 text-sm text-slate-500">This tool has not been ported to the new app yet. The original version is still available and its calculations have been audited and corrected.</p>
        <a href={href} class="mt-4 inline-block rounded-lg bg-accent-600 px-4 py-2 font-semibold text-white hover:bg-accent-700">Open {tool.name}</a>
      </section>
    );
  }
  if (tool.status === 'planned') {
    return (
      <section class="mx-auto max-w-xl p-6">
        <h1 class="text-2xl font-bold">{tool.icon} {tool.name}</h1>
        <p class="mt-2 text-slate-600 dark:text-slate-300">{tool.blurb}</p>
        <p class="mt-4 text-sm text-slate-500">Planned. Tell us what you need from it:</p>
        <a href={`${REPO}/issues/new?template=tool-request.yml&title=${encodeURIComponent(tool.name)}`} class="mt-2 inline-block underline">Open a tool request</a>
      </section>
    );
  }
  if (error) return <div role="alert" class="m-6 rounded-lg border border-red-300 bg-red-50 p-4 text-red-800">Failed to load tool: {error}</div>;
  if (!Comp) return <div class="p-6 text-slate-500">Loading {tool.name}…</div>;
  return <Comp projectId={projectId} />;
}
```

`src/app/pages/NotFound.tsx`:
```tsx
import { navigate } from '../router';
export function NotFound({ what = 'Page' }: { what?: string }) {
  return (
    <section class="mx-auto max-w-xl p-6">
      <h1 class="text-2xl font-bold">{what} not found</h1>
      <button type="button" class="mt-4 underline" onClick={() => navigate({ name: 'home' })}>Back to Home</button>
    </section>
  );
}
```

`src/app/App.tsx`:
```tsx
import { useEffect } from 'preact/hooks';
import { route } from './router';
import { initTheme } from './theme';
import { Nav } from './components/Nav';
import { Footer } from './components/Footer';
import { Home } from './pages/Home';
import { ToolPage } from './pages/ToolPage';
import { NotFound } from './pages/NotFound';

export function App() {
  useEffect(() => { initTheme(); }, []);
  const r = route.value;
  return (
    <div class="flex min-h-screen flex-col">
      <Nav />
      <main class="flex-1">
        {r.name === 'home' && <Home />}
        {r.name === 'tool' && <ToolPage toolId={r.toolId} projectId={r.projectId} />}
        {r.name === 'notfound' && <NotFound />}
      </main>
      <Footer />
    </div>
  );
}
```

`src/app/pages/Home.tsx` for this task is a stub that satisfies the shell test (Task 6 replaces it):
```tsx
import { toolsByCategory } from '@/tools/registry';
export function Home() {
  return (
    <section class="mx-auto max-w-6xl p-4">
      <input type="search" role="searchbox" placeholder="Search tools" class="w-full rounded-lg border p-2" />
      {toolsByCategory().map(g => <h2 key={g.category} class="mt-6 font-semibold">{g.label}</h2>)}
    </section>
  );
}
```

- [ ] **Step 4: Run and commit**

Run: `npm run typecheck && npm run lint && npm test`
```bash
git add -A && git commit -m "feat(app): shell with nav, theme, tool host and legacy/planned cards"
```

---

### Task 5: `core/units` — quantity parsing, conversion, formatting

**Files:**
- Create: `src/core/units/index.ts`
- Test: `tests/core/units.test.ts`

**Interfaces:**
```ts
export type Dim = 'concentration' | 'volume' | 'mass' | 'amount' | 'massconc' | 'length';
export interface Quantity { value: number; unit: string }          // as entered
export const UNITS: Record<Dim, Record<string, number>>;           // unit → factor to SI base (M, L, g, mol, g/L, m)
export function parseQuantity(text: string, dim?: Dim): { value: number; unit: string; si: number; dim: Dim } | null;
export function toSI(q: Quantity): number;                         // throws UnitError for unknown unit
export function fromSI(si: number, unit: string): number;
export function convert(value: number, from: string, to: string): number;   // throws UnitError if dims differ
export function dimOf(unit: string): Dim | undefined;
export function formatSI(si: number, dim: Dim, opts?: { sig?: number; units?: string[] }): { value: number; unit: string; text: string };  // picks the unit that gives 1 ≤ |value| < 1000
export class UnitError extends Error {}
```

- [ ] **Step 1: Tests**

```ts
// tests/core/units.test.ts
import { describe, it, expect } from 'vitest';
import { parseQuantity, toSI, convert, formatSI, dimOf, UnitError } from '@/core/units';

describe('units', () => {
  it('parses text with prefixes and unicode', () => {
    expect(parseQuantity('10 mM')).toMatchObject({ value: 10, unit: 'mM', si: 0.01, dim: 'concentration' });
    expect(parseQuantity('2.5 µL')).toMatchObject({ value: 2.5, unit: 'µL', si: 2.5e-6, dim: 'volume' });
    expect(parseQuantity('2.5 uL')).toMatchObject({ unit: 'µL' });
    expect(parseQuantity('1e-7 M')).toMatchObject({ si: 1e-7 });
    expect(parseQuantity('5 mg/mL')).toMatchObject({ dim: 'massconc', si: 5 });
    expect(parseQuantity('100 ng/µL')).toMatchObject({ dim: 'massconc', si: 0.1 });
    expect(parseQuantity('12', 'volume')).toBeNull();
    expect(parseQuantity('abc')).toBeNull();
    expect(parseQuantity('10 mM', 'volume')).toBeNull();
  });
  it('converts within a dimension and refuses across', () => {
    expect(convert(1, 'mL', 'µL')).toBeCloseTo(1000);
    expect(convert(250, 'nM', 'µM')).toBeCloseTo(0.25);
    expect(convert(1, 'mg', 'g')).toBeCloseTo(0.001);
    expect(() => convert(1, 'mL', 'mM')).toThrow(UnitError);
    expect(() => toSI({ value: 1, unit: 'furlong' })).toThrow(UnitError);
  });
  it('formats with a sensible unit', () => {
    expect(formatSI(0.00025, 'concentration')).toMatchObject({ value: 250, unit: 'µM' });
    expect(formatSI(0.0125, 'volume').text).toBe('12.5 mL');
    expect(formatSI(0, 'mass').text).toBe('0 g');
    expect(formatSI(2.5e-9, 'amount', { sig: 2 }).text).toBe('2.5 nmol');
    expect(formatSI(1500, 'mass').text).toBe('1.5 kg');
  });
  it('knows dimensions', () => {
    expect(dimOf('pM')).toBe('concentration');
    expect(dimOf('Å')).toBe('length');
    expect(dimOf('nope')).toBeUndefined();
  });
});
```

- [ ] **Step 2: Implement**

```ts
// src/core/units/index.ts
export type Dim = 'concentration' | 'volume' | 'mass' | 'amount' | 'massconc' | 'length';
export interface Quantity { value: number; unit: string }
export class UnitError extends Error {}

const P = { k: 1e3, '': 1, m: 1e-3, 'µ': 1e-6, n: 1e-9, p: 1e-12, f: 1e-15 } as const;

function withPrefixes(base: string, factor: number, prefixes: (keyof typeof P)[]) {
  const out: Record<string, number> = {};
  for (const p of prefixes) out[`${p}${base}`] = P[p] * factor;
  return out;
}

/** Factors to SI base per dimension: M, L, g, mol, g/L, m. */
export const UNITS: Record<Dim, Record<string, number>> = {
  concentration: withPrefixes('M', 1, ['', 'm', 'µ', 'n', 'p', 'f']),
  volume: withPrefixes('L', 1, ['', 'm', 'µ', 'n', 'p']),
  mass: withPrefixes('g', 1, ['k', '', 'm', 'µ', 'n', 'p']),
  amount: withPrefixes('mol', 1, ['', 'm', 'µ', 'n', 'p', 'f']),
  massconc: { 'g/L': 1, 'mg/mL': 1, 'µg/µL': 1, 'mg/L': 1e-3, 'µg/mL': 1e-3, 'ng/µL': 1e-3, 'µg/L': 1e-6, 'ng/mL': 1e-6, 'pg/µL': 1e-6, 'ng/L': 1e-9, 'pg/mL': 1e-9, '%': 10 },
  length: { m: 1, cm: 1e-2, mm: 1e-3, 'µm': 1e-6, nm: 1e-9, 'Å': 1e-10, pm: 1e-12 },
};

const DISPLAY: Record<Dim, string[]> = {
  concentration: ['M', 'mM', 'µM', 'nM', 'pM', 'fM'],
  volume: ['L', 'mL', 'µL', 'nL', 'pL'],
  mass: ['kg', 'g', 'mg', 'µg', 'ng', 'pg'],
  amount: ['mol', 'mmol', 'µmol', 'nmol', 'pmol', 'fmol'],
  massconc: ['mg/mL', 'µg/mL', 'ng/mL', 'pg/mL'],
  length: ['m', 'cm', 'mm', 'µm', 'nm', 'Å'],
};

function normaliseUnit(u: string): string {
  return u.trim().replace(/u(?=[LMgm]|mol|g\/)/g, 'µ').replace(/ul\b/i, 'µL').replace(/^l$/, 'L').replace(/\/ul$/i, '/µL').replace(/\/ml$/i, '/mL').replace(/\bml\b/i, 'mL').replace(/A(?:ngstrom)?$/, 'Å');
}

export function dimOf(unit: string): Dim | undefined {
  const u = normaliseUnit(unit);
  for (const d of Object.keys(UNITS) as Dim[]) if (u in UNITS[d]) return d;
  return undefined;
}

export function toSI(q: Quantity): number {
  const u = normaliseUnit(q.unit);
  const d = dimOf(u);
  if (!d) throw new UnitError(`Unknown unit "${q.unit}"`);
  return q.value * UNITS[d][u]!;
}

export function fromSI(si: number, unit: string): number {
  const u = normaliseUnit(unit);
  const d = dimOf(u);
  if (!d) throw new UnitError(`Unknown unit "${unit}"`);
  return si / UNITS[d][u]!;
}

export function convert(value: number, from: string, to: string): number {
  const df = dimOf(from), dt = dimOf(to);
  if (!df || !dt) throw new UnitError(`Unknown unit "${!df ? from : to}"`);
  if (df !== dt) throw new UnitError(`Cannot convert ${from} (${df}) to ${to} (${dt})`);
  return fromSI(toSI({ value, unit: from }), to);
}

export function parseQuantity(text: string, dim?: Dim) {
  const m = text.trim().match(/^([-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?)\s*([A-Za-zµÅ%][A-Za-zµÅ/]*)$/);
  if (!m) return null;
  const value = Number(m[1]);
  const unit = normaliseUnit(m[2]!);
  const d = dimOf(unit);
  if (!d || (dim && d !== dim) || !Number.isFinite(value)) return null;
  return { value, unit, si: value * UNITS[d][unit]!, dim: d };
}

export function formatSI(si: number, dim: Dim, opts: { sig?: number; units?: string[] } = {}) {
  const sig = opts.sig ?? 4;
  const units = opts.units ?? DISPLAY[dim];
  let unit = units[units.length - 1]!;
  if (si === 0) unit = units.includes('g') ? 'g' : units[Math.min(1, units.length - 1)]!;
  else {
    for (const u of units) { const v = Math.abs(fromSI(si, u)); if (v >= 1 && v < 1000) { unit = u; break; } }
    if (Math.abs(fromSI(si, units[0]!)) >= 1000) unit = units[0]!;
  }
  const value = Number(fromSI(si, unit).toPrecision(sig));
  return { value, unit, text: `${value} ${unit}` };
}
```

Adjust the `si === 0` branch so that mass formats as `0 g`, volume as `0 mL`, concentration as `0 mM` (the test only pins mass); simplest: `unit = units[Math.min(1, units.length - 1)]!` for all dims and put `'g'` second in the mass list, which it already is.

- [ ] **Step 3: Run and commit**

Run: `npm test`
```bash
git add -A && git commit -m "feat(core): units parsing, conversion and formatting with tests"
```

---

### Task 6: `lib/url-state` and `lib/projects` (IndexedDB)

**Files:**
- Create: `src/lib/url-state.ts`, `src/lib/projects.ts`, `src/lib/id.ts`
- Test: `tests/lib/url-state.test.ts`, `tests/lib/projects.test.ts`

**Interfaces:**
```ts
// url-state
export function encodeState(obj: unknown): string;                 // lz-string compressToEncodedURIComponent(JSON)
export function decodeState<T>(s: string | undefined, fallback: T): T;   // fallback on any error
export function useUrlState<T extends object>(toolId: string, defaults: T): [Signal<T>, () => string];
//   reads route.state on mount; writes debounced (300 ms) via replaceState; second element returns a full shareable URL
// projects
export interface Project { id: string; toolId: string; name: string; createdAt: number; updatedAt: number; version: number; state: unknown; thumbnail?: Blob; assets?: Record<string, Blob> }
export async function listRecent(limit?: number): Promise<Project[]>;   // by updatedAt desc
export async function getProject(id: string): Promise<Project | undefined>;
export async function saveProject(p: Omit<Project, 'createdAt' | 'updatedAt'> & Partial<Pick<Project, 'createdAt' | 'updatedAt'>>): Promise<Project>;
export async function deleteProject(id: string): Promise<void>;
export async function exportProject(id: string): Promise<Blob>;     // JSON with blobs base64
export async function importProject(file: Blob): Promise<Project>;   // new id
// id
export function newId(): string;   // 12-char base32 from crypto.getRandomValues
```

- [ ] **Step 1: Tests**

`tests/lib/url-state.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { encodeState, decodeState } from '@/lib/url-state';

describe('url-state', () => {
  it('round-trips and is URL safe', () => {
    const s = { a: 1, b: 'x y', c: [1, 2, { d: null }] };
    const enc = encodeState(s);
    expect(enc).toMatch(/^[A-Za-z0-9+\-$]*$/);
    expect(decodeState(enc, {})).toEqual(s);
  });
  it('falls back on garbage', () => {
    expect(decodeState('!!!', { z: 1 })).toEqual({ z: 1 });
    expect(decodeState(undefined, { z: 1 })).toEqual({ z: 1 });
  });
});
```

`tests/lib/projects.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { saveProject, listRecent, getProject, deleteProject, exportProject, importProject } from '@/lib/projects';

describe('projects', () => {
  it('saves, lists by recency, gets, deletes', async () => {
    const a = await saveProject({ id: 'a', toolId: 'molarity', name: 'A', version: 1, state: { x: 1 } });
    await new Promise(r => setTimeout(r, 5));
    const b = await saveProject({ id: 'b', toolId: 'gel', name: 'B', version: 1, state: { y: 2 }, thumbnail: new Blob(['png'], { type: 'image/png' }) });
    expect(a.createdAt).toBeLessThanOrEqual(b.createdAt);
    const recent = await listRecent(10);
    expect(recent.map(p => p.id)).toEqual(['b', 'a']);
    expect((await getProject('b'))?.thumbnail).toBeInstanceOf(Blob);
    await deleteProject('a');
    expect(await getProject('a')).toBeUndefined();
  });
  it('exports and imports with blobs and a fresh id', async () => {
    await saveProject({ id: 'c', toolId: 'gel', name: 'C', version: 2, state: { k: 'v' }, assets: { img: new Blob(['abc'], { type: 'text/plain' }) } });
    const blob = await exportProject('c');
    const p = await importProject(blob);
    expect(p.id).not.toBe('c');
    expect(p.state).toEqual({ k: 'v' });
    expect(await p.assets!.img!.text()).toBe('abc');
    expect(p.version).toBe(2);
  });
});
```

- [ ] **Step 2: Implement**

`src/lib/id.ts`:
```ts
const ALPHABET = 'abcdefghijklmnopqrstuvwxyz234567';
export function newId(): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, b => ALPHABET[b % 32]!).join('');
}
```

`src/lib/url-state.ts`:
```ts
import { signal, effect, type Signal } from '@preact/signals';
import { useMemo, useEffect } from 'preact/hooks';
import LZString from 'lz-string';
import { route, replaceState, toHash } from '@/app/router';

export function encodeState(obj: unknown): string {
  return LZString.compressToEncodedURIComponent(JSON.stringify(obj));
}
export function decodeState<T>(s: string | undefined, fallback: T): T {
  if (!s) return fallback;
  try {
    const json = LZString.decompressFromEncodedURIComponent(s);
    if (!json) return fallback;
    const v = JSON.parse(json);
    return (v && typeof v === 'object') ? { ...fallback, ...v } : fallback;
  } catch { return fallback; }
}

export function useUrlState<T extends object>(toolId: string, defaults: T): [Signal<T>, () => string] {
  const state = useMemo(() => {
    const r = route.peek();
    return signal<T>(decodeState(r.name === 'tool' && r.toolId === toolId ? r.state : undefined, defaults));
  }, [toolId]);
  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | undefined;
    const stop = effect(() => {
      const s = state.value;
      if (t) clearTimeout(t);
      t = setTimeout(() => {
        const r = route.peek();
        if (r.name === 'tool' && r.toolId === toolId && !r.projectId) replaceState({ ...r, state: encodeState(s) });
      }, 300);
    });
    return () => { stop(); if (t) clearTimeout(t); };
  }, [state, toolId]);
  const shareUrl = () => `${location.origin}${location.pathname}${toHash({ name: 'tool', toolId, state: encodeState(state.value) })}`;
  return [state, shareUrl];
}
```

`src/lib/projects.ts`:
```ts
import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import { newId } from './id';

export interface Project {
  id: string; toolId: string; name: string; createdAt: number; updatedAt: number;
  version: number; state: unknown; thumbnail?: Blob; assets?: Record<string, Blob>;
}
interface Schema extends DBSchema {
  projects: { key: string; value: Project; indexes: { updatedAt: number } };
}
let dbp: Promise<IDBPDatabase<Schema>> | undefined;
function db() {
  dbp ??= openDB<Schema>('biobench', 1, {
    upgrade(d) { d.createObjectStore('projects', { keyPath: 'id' }).createIndex('updatedAt', 'updatedAt'); }
  });
  return dbp;
}

export async function listRecent(limit = 12): Promise<Project[]> {
  const d = await db();
  const out: Project[] = [];
  let cur = await d.transaction('projects').store.index('updatedAt').openCursor(null, 'prev');
  while (cur && out.length < limit) { out.push(cur.value); cur = await cur.continue(); }
  return out;
}
export async function getProject(id: string) { return (await db()).get('projects', id); }
export async function saveProject(p: Omit<Project, 'createdAt' | 'updatedAt'> & Partial<Pick<Project, 'createdAt' | 'updatedAt'>>): Promise<Project> {
  const now = Date.now();
  const existing = await getProject(p.id);
  const full: Project = { ...p, createdAt: p.createdAt ?? existing?.createdAt ?? now, updatedAt: now };
  await (await db()).put('projects', full);
  return full;
}
export async function deleteProject(id: string) { await (await db()).delete('projects', id); }

const b64 = async (b: Blob) => ({ type: b.type, data: btoa(String.fromCharCode(...new Uint8Array(await b.arrayBuffer()))) });
const unb64 = (o: { type: string; data: string }) => new Blob([Uint8Array.from(atob(o.data), c => c.charCodeAt(0))], { type: o.type });

export async function exportProject(id: string): Promise<Blob> {
  const p = await getProject(id);
  if (!p) throw new Error(`No project ${id}`);
  const assets: Record<string, { type: string; data: string }> = {};
  for (const [k, v] of Object.entries(p.assets ?? {})) assets[k] = await b64(v);
  const doc = { format: 'biobench-project', formatVersion: 1, project: { ...p, thumbnail: p.thumbnail ? await b64(p.thumbnail) : undefined, assets } };
  return new Blob([JSON.stringify(doc)], { type: 'application/json' });
}
export async function importProject(file: Blob): Promise<Project> {
  const doc = JSON.parse(await file.text());
  if (doc?.format !== 'biobench-project') throw new Error('Not a Bio-Bench project file');
  const src = doc.project;
  const assets: Record<string, Blob> = {};
  for (const [k, v] of Object.entries(src.assets ?? {})) assets[k] = unb64(v as { type: string; data: string });
  return saveProject({ id: newId(), toolId: src.toolId, name: src.name, version: src.version, state: src.state, thumbnail: src.thumbnail ? unb64(src.thumbnail) : undefined, assets });
}
```

- [ ] **Step 3: Run and commit**

Run: `npm run typecheck && npm test`
```bash
git add -A && git commit -m "feat(lib): URL-encoded tool state and IndexedDB project store"
```

---

### Task 7: Home page — search, recent projects, categories

**Files:**
- Create: `src/app/pages/Home.tsx` (replace stub), `src/app/components/ToolCard.tsx`, `src/app/components/ProjectCard.tsx`, `src/lib/format.ts`
- Test: `tests/app/home.test.tsx`

**Interfaces:**
- `relativeTime(ts: number, now?: number): string` → 'just now', '5 min ago', '3 h ago', '2 d ago', else locale date.
- `ToolCard({ tool })` renders name, icon, blurb, status pill ('Legacy' / 'Planned', none for ready) and navigates on click.
- `ProjectCard({ project })` renders thumbnail (object URL, revoked on unmount) or tool icon, name, tool name, relative time; navigates to `#/t/<toolId>/p/<id>`.
- `Home` = search box (filters live), recent projects row (hidden when empty), category sections.

- [ ] **Step 1: Test**

```tsx
// tests/app/home.test.tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/preact';
import { describe, it, expect } from 'vitest';
import { Home } from '@/app/pages/Home';
import { saveProject } from '@/lib/projects';
import { relativeTime } from '@/lib/format';

describe('Home', () => {
  it('filters tools by search', async () => {
    render(<Home />);
    const box = screen.getByRole('searchbox');
    fireEvent.input(box, { target: { value: 'rpm' } });
    await waitFor(() => expect(screen.getByText('Centrifuge')).toBeTruthy());
    expect(screen.queryByText('Molarity & Dilution')).toBeNull();
    fireEvent.input(box, { target: { value: 'zzzz' } });
    await waitFor(() => expect(screen.getByText(/No tools match/)).toBeTruthy());
  });
  it('lists recent projects', async () => {
    await saveProject({ id: 'h1', toolId: 'gel', name: 'My gel', version: 1, state: {} });
    render(<Home />);
    expect(await screen.findByText('My gel')).toBeTruthy();
  });
  it('relative time', () => {
    const now = 1_700_000_000_000;
    expect(relativeTime(now - 10_000, now)).toBe('just now');
    expect(relativeTime(now - 5 * 60_000, now)).toBe('5 min ago');
    expect(relativeTime(now - 3 * 3_600_000, now)).toBe('3 h ago');
    expect(relativeTime(now - 2 * 86_400_000, now)).toBe('2 d ago');
  });
});
```

- [ ] **Step 2: Implement**

`src/lib/format.ts`:
```ts
export function relativeTime(ts: number, now = Date.now()): string {
  const s = Math.max(0, (now - ts) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 14 * 86400) return `${Math.floor(s / 86400)} d ago`;
  return new Date(ts).toLocaleDateString();
}
```

`src/app/components/ToolCard.tsx`:
```tsx
import { navigate } from '../router';
import type { ToolMeta } from '@/tools/registry';

export function ToolCard({ tool }: { tool: ToolMeta }) {
  const pill = tool.status === 'legacy' ? 'Legacy' : tool.status === 'planned' ? 'Planned' : null;
  return (
    <button type="button" onClick={() => navigate({ name: 'tool', toolId: tool.id })}
      class="flex w-full items-start gap-3 rounded-xl border border-slate-200 bg-white p-3 text-left transition hover:border-accent-500 hover:shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <span class="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-slate-100 text-xl dark:bg-slate-800" aria-hidden="true">{tool.icon}</span>
      <span class="min-w-0 flex-1">
        <span class="flex items-center gap-2 font-semibold">{tool.name}
          {pill && <span class="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-500 dark:bg-slate-800 dark:text-slate-400">{pill}</span>}
        </span>
        <span class="block truncate text-sm text-slate-500 dark:text-slate-400">{tool.blurb}</span>
      </span>
    </button>
  );
}
```

`src/app/components/ProjectCard.tsx`:
```tsx
import { useEffect, useState } from 'preact/hooks';
import { navigate } from '../router';
import { findTool } from '@/tools/registry';
import { relativeTime } from '@/lib/format';
import type { Project } from '@/lib/projects';

export function ProjectCard({ project }: { project: Project }) {
  const tool = findTool(project.toolId);
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!project.thumbnail) return;
    const u = URL.createObjectURL(project.thumbnail);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [project.thumbnail]);
  return (
    <button type="button" onClick={() => navigate({ name: 'tool', toolId: project.toolId, projectId: project.id })}
      class="w-44 shrink-0 overflow-hidden rounded-xl border border-slate-200 bg-white text-left hover:border-accent-500 dark:border-slate-700 dark:bg-slate-900">
      <div class="grid h-28 place-items-center bg-slate-100 dark:bg-slate-800">
        {url ? <img src={url} alt="" class="h-full w-full object-cover" /> : <span class="text-3xl" aria-hidden="true">{tool?.icon ?? '📄'}</span>}
      </div>
      <div class="p-2">
        <div class="truncate text-sm font-semibold">{project.name}</div>
        <div class="truncate text-xs text-slate-500 dark:text-slate-400">{tool?.name ?? project.toolId} · {relativeTime(project.updatedAt)}</div>
      </div>
    </button>
  );
}
```

`src/app/pages/Home.tsx`:
```tsx
import { useEffect, useState } from 'preact/hooks';
import { searchTools, toolsByCategory, CATEGORIES, type Category } from '@/tools/registry';
import { listRecent, type Project } from '@/lib/projects';
import { ToolCard } from '../components/ToolCard';
import { ProjectCard } from '../components/ProjectCard';

export function Home() {
  const [q, setQ] = useState('');
  const [recent, setRecent] = useState<Project[]>([]);
  useEffect(() => { listRecent(12).then(setRecent).catch(() => setRecent([])); }, []);

  const groups = q.trim()
    ? (() => { const hits = searchTools(q); return (Object.keys(CATEGORIES) as Category[]).sort((a, b) => CATEGORIES[a].order - CATEGORIES[b].order).map(c => ({ category: c, ...CATEGORIES[c], tools: hits.filter(t => t.category === c) })).filter(g => g.tools.length); })()
    : toolsByCategory();

  return (
    <section class="mx-auto max-w-6xl p-4">
      <div class="py-4">
        <h1 class="text-3xl font-extrabold tracking-tight">Lab tools that show their work.</h1>
        <p class="mt-1 text-slate-600 dark:text-slate-300">Free, offline, no account. Every result comes with its formula and references.</p>
        <input type="search" role="searchbox" value={q} onInput={e => setQ((e.target as HTMLInputElement).value)}
          placeholder="Search tools: molarity, kDa, TAE, rpm…" aria-label="Search tools"
          class="mt-4 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-base shadow-sm focus:border-accent-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900" />
      </div>

      {!q && recent.length > 0 && (
        <div class="mb-6">
          <h2 class="mb-2 text-sm font-bold uppercase tracking-wide text-slate-500">Recent projects</h2>
          <div class="flex gap-3 overflow-x-auto pb-2">{recent.map(p => <ProjectCard key={p.id} project={p} />)}</div>
        </div>
      )}

      {groups.length === 0 && <p class="py-8 text-center text-slate-500">No tools match “{q}”.</p>}
      <div class="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        {groups.map(g => (
          <div key={g.category} class="rounded-2xl border border-slate-200 bg-slate-100/60 p-3 dark:border-slate-800 dark:bg-slate-900/40">
            <h2 class="mb-1 px-1 font-bold">{g.label}</h2>
            <p class="mb-3 px-1 text-xs text-slate-500">{g.blurb}</p>
            <div class="space-y-2">{g.tools.map(t => <ToolCard key={t.id} tool={t} />)}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 3: Run and commit**

Run: `npm run typecheck && npm run lint && npm test`
```bash
git add -A && git commit -m "feat(app): home with search, recent projects and category cards"
```

---

### Task 8: First real tool — Molarity & Dilution (core + view + Science panel + share)

**Files:**
- Create: `src/core/reactions/molarity.ts`, `src/app/components/Quantity.tsx`, `src/app/components/SciencePanel.tsx`, `src/app/components/ActionBar.tsx`, `src/app/components/ToolLayout.tsx`, `src/tools/molarity/View.tsx` (replace placeholder), `src/tools/molarity/science.ts`
- Test: `tests/core/molarity.test.ts`, `tests/app/molarity.test.tsx`

**Interfaces:**
```ts
// core/reactions/molarity.ts  (SI in, SI out: M, L, g, g/mol)
export function massForSolution(conc_M: number, volume_L: number, mw: number): number;          // g
export function molarityFromMass(mass_g: number, volume_L: number, mw: number): number;        // M
export function volumeForMass(mass_g: number, conc_M: number, mw: number): number;             // L
export type DilutionInput = { c1?: number; v1?: number; c2?: number; v2?: number };            // exactly one undefined
export function solveDilution(d: DilutionInput): { c1: number; v1: number; c2: number; v2: number; diluent: number; solved: keyof DilutionInput };
//   throws InputError if not exactly one unknown, any value ≤ 0, or c2 > c1 (cannot concentrate by dilution)
export class InputError extends Error {}
```
- `Quantity` props: `{ label: string; value: { value: number; unit: string }; units: string[]; onChange(v): void; hint?: string; error?: string; id: string }` — number input + unit select; typing "10 mM" into the number field parses and switches unit.
- `SciencePanel({ science })` where `science: { title: string; formulas: string[]; assumptions: string[]; references: { text: string; url?: string }[]; verified: string }` renders a `<details>` with the sections; `formulas` are plain text (no MathJax).
- `ActionBar({ onCopy, shareUrl, science })` renders Copy result, Share link (copies `shareUrl()` to clipboard, shows "Copied"), Science toggle.
- `ToolLayout({ title, icon, blurb, inputs, results, actions })` two-column responsive skeleton.

- [ ] **Step 1: Core tests**

```ts
// tests/core/molarity.test.ts
import { describe, it, expect } from 'vitest';
import { massForSolution, molarityFromMass, volumeForMass, solveDilution, InputError } from '@/core/reactions/molarity';

describe('molarity', () => {
  it('mass for 10 mM NaCl in 500 mL = 292.2 mg', () => {
    expect(massForSolution(0.01, 0.5, 58.44)).toBeCloseTo(0.2922, 4);
  });
  it('round trips', () => {
    const m = massForSolution(0.25, 0.02, 121.14);
    expect(molarityFromMass(m, 0.02, 121.14)).toBeCloseTo(0.25, 10);
    expect(volumeForMass(m, 0.25, 121.14)).toBeCloseTo(0.02, 10);
  });
  it('dilution solves each unknown', () => {
    expect(solveDilution({ c1: 1, c2: 0.1, v2: 0.01 })).toMatchObject({ v1: 0.001, diluent: 0.009, solved: 'v1' });
    expect(solveDilution({ c1: 1, v1: 0.001, v2: 0.01 })).toMatchObject({ c2: 0.1, solved: 'c2' });
    expect(solveDilution({ v1: 0.001, c2: 0.1, v2: 0.01 })).toMatchObject({ c1: 1, solved: 'c1' });
    expect(solveDilution({ c1: 1, v1: 0.001, c2: 0.1 })).toMatchObject({ v2: 0.01, solved: 'v2' });
  });
  it('rejects impossible input', () => {
    expect(() => solveDilution({ c1: 1, c2: 0.1 })).toThrow(InputError);
    expect(() => solveDilution({ c1: 0.1, c2: 1, v2: 0.01 })).toThrow(/concentrate/);
    expect(() => solveDilution({ c1: -1, c2: 0.1, v2: 0.01 })).toThrow(InputError);
  });
});
```

- [ ] **Step 2: Core implementation**

```ts
// src/core/reactions/molarity.ts
export class InputError extends Error {}
const pos = (x: number, name: string) => { if (!(x > 0) || !Number.isFinite(x)) throw new InputError(`${name} must be a positive number`); };

/** m = C · V · MW  (g = mol/L · L · g/mol) */
export function massForSolution(conc_M: number, volume_L: number, mw: number): number {
  pos(conc_M, 'concentration'); pos(volume_L, 'volume'); pos(mw, 'molecular weight');
  return conc_M * volume_L * mw;
}
export function molarityFromMass(mass_g: number, volume_L: number, mw: number): number {
  pos(mass_g, 'mass'); pos(volume_L, 'volume'); pos(mw, 'molecular weight');
  return mass_g / mw / volume_L;
}
export function volumeForMass(mass_g: number, conc_M: number, mw: number): number {
  pos(mass_g, 'mass'); pos(conc_M, 'concentration'); pos(mw, 'molecular weight');
  return mass_g / mw / conc_M;
}

export type DilutionInput = { c1?: number; v1?: number; c2?: number; v2?: number };
/** C1·V1 = C2·V2 with exactly one unknown. Diluent = V2 − V1. */
export function solveDilution(d: DilutionInput) {
  const keys = ['c1', 'v1', 'c2', 'v2'] as const;
  const unknown = keys.filter(k => d[k] === undefined);
  if (unknown.length !== 1) throw new InputError('Leave exactly one field empty');
  for (const k of keys) if (d[k] !== undefined) pos(d[k]!, k.toUpperCase());
  const solved = unknown[0]!;
  const r = { c1: d.c1 ?? NaN, v1: d.v1 ?? NaN, c2: d.c2 ?? NaN, v2: d.v2 ?? NaN };
  if (solved === 'v1') r.v1 = r.c2 * r.v2 / r.c1;
  if (solved === 'c2') r.c2 = r.c1 * r.v1 / r.v2;
  if (solved === 'c1') r.c1 = r.c2 * r.v2 / r.v1;
  if (solved === 'v2') r.v2 = r.c1 * r.v1 / r.c2;
  if (r.c2 > r.c1) throw new InputError('Final concentration exceeds stock: a dilution cannot concentrate');
  return { ...r, diluent: r.v2 - r.v1, solved };
}
```

- [ ] **Step 3: Shared components**

`src/app/components/Quantity.tsx`:
```tsx
import { parseQuantity } from '@/core/units';

export interface QValue { value: number; unit: string }
export function Quantity({ id, label, value, units, onChange, hint, error, placeholder }:
  { id: string; label: string; value: QValue; units: string[]; onChange: (v: QValue) => void; hint?: string; error?: string; placeholder?: string }) {
  const onInput = (e: Event) => {
    const t = (e.target as HTMLInputElement).value;
    const parsed = parseQuantity(t);
    if (parsed && units.includes(parsed.unit)) { onChange({ value: parsed.value, unit: parsed.unit }); return; }
    const n = Number(t);
    onChange({ value: Number.isFinite(n) ? n : NaN, unit: value.unit });
  };
  return (
    <label for={id} class="block">
      <span class="mb-1 block text-sm font-medium">{label}</span>
      <span class="flex overflow-hidden rounded-lg border border-slate-300 bg-white focus-within:border-accent-500 dark:border-slate-700 dark:bg-slate-900">
        <input id={id} type="text" inputMode="decimal" value={Number.isFinite(value.value) ? String(value.value) : ''} onInput={onInput} placeholder={placeholder}
          aria-invalid={!!error} class="mono min-w-0 flex-1 bg-transparent px-3 py-2 outline-none" />
        <select aria-label={`${label} unit`} value={value.unit} onChange={e => onChange({ ...value, unit: (e.target as HTMLSelectElement).value })}
          class="border-l border-slate-200 bg-slate-50 px-2 text-sm dark:border-slate-700 dark:bg-slate-800">
          {units.map(u => <option key={u} value={u}>{u}</option>)}
        </select>
      </span>
      {error ? <span class="mt-1 block text-xs text-red-600">{error}</span> : hint ? <span class="mt-1 block text-xs text-slate-500">{hint}</span> : null}
    </label>
  );
}
```

`src/app/components/SciencePanel.tsx`:
```tsx
export interface Science { title: string; formulas: string[]; assumptions: string[]; references: { text: string; url?: string }[]; verified: string }
export function SciencePanel({ science, open }: { science: Science; open?: boolean }) {
  return (
    <details open={open} class="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
      <summary class="cursor-pointer font-semibold">Science: {science.title}</summary>
      <div class="mt-3 space-y-3 text-sm">
        <div><h4 class="font-medium">Formulas</h4><ul class="mono mt-1 list-inside list-disc">{science.formulas.map(f => <li key={f}>{f}</li>)}</ul></div>
        <div><h4 class="font-medium">Assumptions</h4><ul class="mt-1 list-inside list-disc">{science.assumptions.map(a => <li key={a}>{a}</li>)}</ul></div>
        <div><h4 class="font-medium">References</h4><ul class="mt-1 list-inside list-disc">{science.references.map(r => <li key={r.text}>{r.url ? <a class="underline" href={r.url} target="_blank" rel="noopener">{r.text}</a> : r.text}</li>)}</ul></div>
        <p class="text-xs text-slate-500">Last verified: {science.verified}</p>
      </div>
    </details>
  );
}
export function scienceText(s: Science): string {
  return [`Method: ${s.title}`, ...s.formulas.map(f => `  ${f}`), 'Assumptions:', ...s.assumptions.map(a => `  - ${a}`), 'References:', ...s.references.map(r => `  - ${r.text}${r.url ? ` ${r.url}` : ''}`), `Verified: ${s.verified}`].join('\n');
}
```

`src/app/components/ActionBar.tsx`:
```tsx
import { useState } from 'preact/hooks';
export function ActionBar({ onCopy, shareUrl }: { onCopy: () => string; shareUrl?: () => string }) {
  const [msg, setMsg] = useState('');
  const flash = (m: string) => { setMsg(m); setTimeout(() => setMsg(''), 1500); };
  const copy = async (text: string, m: string) => { try { await navigator.clipboard.writeText(text); flash(m); } catch { flash('Copy failed'); } };
  return (
    <div class="flex flex-wrap items-center gap-2">
      <button type="button" class="rounded-lg bg-accent-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-accent-700" onClick={() => copy(onCopy(), 'Result copied')}>Copy result</button>
      {shareUrl && <button type="button" class="rounded-lg border border-slate-300 px-3 py-1.5 text-sm dark:border-slate-700" onClick={() => copy(shareUrl(), 'Link copied')}>Share link</button>}
      <span role="status" class="text-xs text-slate-500">{msg}</span>
    </div>
  );
}
```

`src/app/components/ToolLayout.tsx`:
```tsx
import type { ComponentChildren } from 'preact';
export function ToolLayout({ icon, title, blurb, inputs, results, actions, science }:
  { icon: string; title: string; blurb: string; inputs: ComponentChildren; results: ComponentChildren; actions: ComponentChildren; science: ComponentChildren }) {
  return (
    <section class="mx-auto max-w-6xl p-4">
      <header class="mb-4"><h1 class="text-2xl font-bold">{icon} {title}</h1><p class="text-slate-600 dark:text-slate-300">{blurb}</p></header>
      <div class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <div class="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">{inputs}</div>
        <div class="space-y-4">
          <div class="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">{results}</div>
          <div class="sticky bottom-2">{actions}</div>
          {science}
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Tool view and science**

`src/tools/molarity/science.ts`:
```ts
import type { Science } from '@/app/components/SciencePanel';
export const SCIENCE: Science = {
  title: 'Molarity and dilution',
  formulas: ['mass (g) = C (mol/L) × V (L) × MW (g/mol)', 'C1 × V1 = C2 × V2', 'diluent = V2 − V1'],
  assumptions: ['Volumes are additive (true for dilute aqueous solutions).', 'MW is for the exact form you weigh (hydrate, salt): use the Buffer tool for a chemical list.', 'Purity 100 %.'],
  references: [{ text: 'IUPAC Gold Book: amount concentration', url: 'https://goldbook.iupac.org/terms/view/A00295' }],
  verified: '2026-09-02',
};
```

`src/tools/molarity/View.tsx`:
```tsx
import { useState } from 'preact/hooks';
import { useUrlState } from '@/lib/url-state';
import { toSI, formatSI } from '@/core/units';
import { massForSolution, solveDilution, InputError, type DilutionInput } from '@/core/reactions/molarity';
import { Quantity, type QValue } from '@/app/components/Quantity';
import { SciencePanel, scienceText } from '@/app/components/SciencePanel';
import { ActionBar } from '@/app/components/ActionBar';
import { ToolLayout } from '@/app/components/ToolLayout';
import { SCIENCE } from './science';

const CONC = ['M', 'mM', 'µM', 'nM'];
const VOL = ['L', 'mL', 'µL'];

interface State { tab: 'mass' | 'dilution'; conc: QValue; vol: QValue; mw: number; c1: QValue; v1: QValue; c2: QValue; v2: QValue; blank: 'c1' | 'v1' | 'c2' | 'v2' }
const DEFAULTS: State = { tab: 'mass', conc: { value: 10, unit: 'mM' }, vol: { value: 500, unit: 'mL' }, mw: 58.44,
  c1: { value: 1, unit: 'M' }, v1: { value: NaN, unit: 'mL' }, c2: { value: 100, unit: 'mM' }, v2: { value: 10, unit: 'mL' }, blank: 'v1' };

export default function View() {
  const [state, shareUrl] = useUrlState<State>('molarity', DEFAULTS);
  const s = state.value;
  const set = (patch: Partial<State>) => { state.value = { ...s, ...patch }; };
  const [err, setErr] = useState<string | null>(null);

  let massText = '', dilText = '';
  try {
    setErr(null);
    if (s.tab === 'mass') {
      const g = massForSolution(toSI(s.conc), toSI(s.vol), s.mw);
      massText = `Weigh ${formatSI(g, 'mass').text} and make up to ${s.vol.value} ${s.vol.unit} for ${s.conc.value} ${s.conc.unit} (MW ${s.mw} g/mol).`;
    } else {
      const inp: DilutionInput = {};
      for (const k of ['c1', 'v1', 'c2', 'v2'] as const) if (k !== s.blank && Number.isFinite(s[k].value)) inp[k] = toSI(s[k]);
      const r = solveDilution(inp);
      const cU = (k: 'c1' | 'c2') => formatSI(r[k], 'concentration').text, vU = (k: 'v1' | 'v2') => formatSI(r[k], 'volume').text;
      dilText = `Take ${vU('v1')} of ${cU('c1')} stock and add ${formatSI(r.diluent, 'volume').text} diluent for ${vU('v2')} at ${cU('c2')}.`;
    }
  } catch (e) {
    if (e instanceof InputError || (e as Error).name === 'UnitError') { if (err !== (e as Error).message) setErr((e as Error).message); } else throw e;
  }
  const result = s.tab === 'mass' ? massText : dilText;

  const tabBtn = (t: State['tab'], label: string) => (
    <button type="button" onClick={() => set({ tab: t })} aria-pressed={s.tab === t}
      class={`rounded-full px-3 py-1 text-sm ${s.tab === t ? 'bg-accent-600 text-white' : 'border border-slate-300 dark:border-slate-700'}`}>{label}</button>
  );
  const dil = (k: 'c1' | 'v1' | 'c2' | 'v2', label: string, units: string[]) => (
    <div class="flex items-end gap-2">
      <div class="flex-1"><Quantity id={`mol-${k}`} label={label} value={s[k]} units={units} onChange={v => set({ [k]: v } as Partial<State>)} placeholder={s.blank === k ? 'solve for this' : ''} /></div>
      <label class="mb-2 flex items-center gap-1 text-xs"><input type="radio" name="blank" checked={s.blank === k} onChange={() => set({ blank: k, [k]: { ...s[k], value: NaN } } as Partial<State>)} /> solve</label>
    </div>
  );

  return (
    <ToolLayout icon="⚖️" title="Molarity & Dilution" blurb="Mass to weigh for a solution, and C1V1 = C2V2 with any unknown."
      inputs={<>
        <div class="flex gap-2">{tabBtn('mass', 'Mass for a solution')}{tabBtn('dilution', 'Dilution (C1V1 = C2V2)')}</div>
        {s.tab === 'mass' ? <>
          <Quantity id="mol-conc" label="Target concentration" value={s.conc} units={CONC} onChange={v => set({ conc: v })} />
          <Quantity id="mol-vol" label="Final volume" value={s.vol} units={VOL} onChange={v => set({ vol: v })} />
          <label for="mol-mw" class="block"><span class="mb-1 block text-sm font-medium">Molecular weight (g/mol)</span>
            <input id="mol-mw" type="number" step="any" value={s.mw} onInput={e => set({ mw: Number((e.target as HTMLInputElement).value) })} class="mono w-full rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900" /></label>
        </> : <>
          {dil('c1', 'Stock concentration (C1)', CONC)}
          {dil('v1', 'Stock volume (V1)', VOL)}
          {dil('c2', 'Final concentration (C2)', CONC)}
          {dil('v2', 'Final volume (V2)', VOL)}
        </>}
      </>}
      results={err ? <p role="alert" class="text-red-600">{err}</p> : <p class="text-lg" data-testid="result">{result}</p>}
      actions={<ActionBar onCopy={() => `${result}\n\n${scienceText(SCIENCE)}`} shareUrl={shareUrl} />}
      science={<SciencePanel science={SCIENCE} />}
    />
  );
}
```

Note: calling `setErr` during render is a smell; restructure so the try/catch runs in a `useMemo` that returns `{ result, error }` and render from that. Do that in the implementation (the test below only checks behaviour).

- [ ] **Step 5: Component test**

```tsx
// tests/app/molarity.test.tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/preact';
import { describe, it, expect } from 'vitest';
import View from '@/tools/molarity/View';
import { route } from '@/app/router';

describe('Molarity tool', () => {
  it('computes mass with defaults and updates on input', async () => {
    route.value = { name: 'tool', toolId: 'molarity' };
    render(<View />);
    expect((await screen.findByTestId('result')).textContent).toMatch(/292\.2 mg/);
    fireEvent.input(screen.getByLabelText('Target concentration'), { target: { value: '1 M' } });
    await waitFor(() => expect(screen.getByTestId('result').textContent).toMatch(/29\.22 g/));
  });
  it('solves a dilution and reports impossible ones', async () => {
    route.value = { name: 'tool', toolId: 'molarity' };
    render(<View />);
    fireEvent.click(screen.getByRole('button', { name: /Dilution/ }));
    await waitFor(() => expect(screen.getByTestId('result').textContent).toMatch(/Take 1 mL of 1 M stock and add 9 mL/));
    fireEvent.input(screen.getByLabelText('Final concentration (C2)'), { target: { value: '2 M' } });
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/cannot concentrate/));
  });
});
```

- [ ] **Step 6: Run and commit**

Run: `npm run typecheck && npm run lint && npm test`
```bash
git add -A && git commit -m "feat(tools): Molarity & Dilution on the new shell with units, science panel and share links"
```

---

### Task 9: PWA install, update toast, icons

**Files:**
- Create: `public/favicon.svg`, `public/icons/icon.svg`, `public/icons/icon-192.png`, `public/icons/icon-512.png`, `src/app/components/UpdateToast.tsx`, `scripts/make-icons.mjs`
- Modify: `src/app/App.tsx` (mount `<UpdateToast />`), `src/vite-env.d.ts`

- [ ] **Step 1: Icon source and PNG generation**

`public/icons/icon.svg` (also copied to `public/favicon.svg`):
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#4f46e5"/><path d="M24 12h16v6h-3v10l11 20a4 4 0 0 1-3.5 6h-25A4 4 0 0 1 16 48l11-20V18h-3z" fill="#fff"/><circle cx="28" cy="42" r="3" fill="#4f46e5"/><circle cx="36" cy="46" r="2" fill="#4f46e5"/></svg>
```

`scripts/make-icons.mjs` rasterises the SVG with the cached Playwright Chromium (dev-only, PNGs are committed):
```js
import { chromium } from '/home/dzyla/.npm/_npx/9833c18b2d85bc59/node_modules/playwright/index.mjs';
import { readFileSync, writeFileSync } from 'node:fs';
const svg = readFileSync('public/icons/icon.svg', 'utf8');
const browser = await chromium.launch({ executablePath: process.env.CHROME ?? '/home/dzyla/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome' });
for (const size of [192, 512]) {
  const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
  await page.setContent(`<body style="margin:0;background:transparent">${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body>`);
  writeFileSync(`public/icons/icon-${size}.png`, await page.screenshot({ omitBackground: true, type: 'png' }));
}
await browser.close();
```
Run: `node scripts/make-icons.mjs` and check both PNGs exist and are non-empty.

- [ ] **Step 2: UpdateToast**

```tsx
// src/app/components/UpdateToast.tsx
import { useRegisterSW } from 'virtual:pwa-register/preact';
export function UpdateToast() {
  const { needRefresh: [needRefresh], offlineReady: [offlineReady, setOfflineReady], updateServiceWorker } = useRegisterSW();
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
```
Mount it in `App.tsx` after `<Footer />`. Because `virtual:pwa-register/preact` is unavailable under Vitest, load it lazily: in `App.tsx`, `const UpdateToast = lazy(() => import('./components/UpdateToast').then(m => ({ default: m.UpdateToast })))` wrapped in `<Suspense fallback={null}>` and only when `import.meta.env.PROD`.

- [ ] **Step 3: Build check and commit**

Run: `npm run build` → `dist/sw.js` and `dist/manifest.webmanifest` exist. `npm run preview` and open `http://localhost:4173/` in the cached Chromium via the smoke script pattern from Phase 0: confirm no console errors and that `navigator.serviceWorker.controller` becomes non-null after reload.
```bash
git add -A && git commit -m "feat(app): installable PWA with offline cache and update toast"
```

---

### Task 10: CI, deploy with legacy, Playwright smoke

**Files:**
- Create: `.github/workflows/deploy.yml`, `playwright.config.ts`, `tests/e2e/smoke.spec.ts`
- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1: ci.yml**

```yaml
name: CI
on:
  pull_request:
  push:
    branches: [main]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm }
      - run: npm ci
      - run: npm run typecheck
      - run: npm run lint
      - run: npm test
      - run: npm run build
      - run: npx playwright install --with-deps chromium
      - run: npm run e2e
```

- [ ] **Step 2: deploy.yml**

```yaml
name: Deploy to GitHub Pages
on:
  push:
    branches: [main]
  workflow_dispatch:
permissions: { contents: read, pages: write, id-token: write }
concurrency: { group: pages, cancel-in-progress: false }
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm }
      - run: npm ci
      - run: npm test
      - run: BASE_PATH="/${{ github.event.repository.name }}/" npm run build
      - run: cp -r legacy dist/legacy
      - uses: actions/configure-pages@v5
      - uses: actions/upload-pages-artifact@v3
        with: { path: dist }
  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment: { name: github-pages, url: "${{ steps.deployment.outputs.page_url }}" }
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

- [ ] **Step 3: Playwright smoke**

`playwright.config.ts`:
```ts
import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: 'tests/e2e',
  use: { baseURL: 'http://localhost:4173', ...(process.env.CHROME ? { launchOptions: { executablePath: process.env.CHROME } } : {}) },
  webServer: { command: 'npm run preview -- --port 4173', port: 4173, reuseExistingServer: true },
});
```

`tests/e2e/smoke.spec.ts`:
```ts
import { test, expect } from '@playwright/test';

test('home lists tools and opens molarity with a shareable state', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('/');
  await expect(page.getByRole('searchbox')).toBeVisible();
  await page.getByRole('button', { name: /Molarity & Dilution/ }).click();
  await expect(page).toHaveURL(/#\/t\/molarity/);
  await expect(page.getByTestId('result')).toContainText('292.2 mg');
  await page.getByLabel('Target concentration').fill('1 M');
  await expect(page.getByTestId('result')).toContainText('29.22 g');
  await expect(page).toHaveURL(/\?s=/);
  const url = page.url();
  await page.goto('/');
  await page.goto(url);
  await expect(page.getByTestId('result')).toContainText('29.22 g');
  expect(errors).toEqual([]);
});

test('legacy tool card links to the legacy page', async ({ page }) => {
  await page.goto('/#/t/protein');
  await expect(page.getByRole('link', { name: /Open Protein Workbench/ })).toHaveAttribute('href', /legacy\/protein_params\.html$/);
});
```

Locally run with the cached browser: `CHROME=/home/dzyla/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome npm run e2e` after `npm run build`. Note `preview` serves `dist/`; copy `legacy/` into `dist/legacy` before running so the legacy link resolves (`cp -r legacy dist/legacy`).

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "ci: typecheck, lint, unit, legacy and e2e tests; Pages deploy with legacy tools"
```

---

### Task 11: Repository documents

**Files:**
- Create: `LICENSE` (AGPL-3.0 full text from https://www.gnu.org/licenses/agpl-3.0.txt), `LICENSE-DATA` (CC-BY-4.0 short notice pointing to https://creativecommons.org/licenses/by/4.0/legalcode), `CITATION.cff`, `CONTRIBUTING.md`, `.github/ISSUE_TEMPLATE/wrong-value.yml`, `.github/ISSUE_TEMPLATE/tool-request.yml`, `.github/ISSUE_TEMPLATE/data-addition.yml`, `.github/PULL_REQUEST_TEMPLATE.md`
- Modify: `README.md` (rewrite)

- [ ] **Step 1: CITATION.cff**

```yaml
cff-version: 1.2.0
message: "If Bio-Bench helped your work, please cite it."
title: "Bio-Bench: free, offline lab calculators, sequence tools and gel analysis"
type: software
authors:
  - family-names: Zyla
    given-names: Dawid
    orcid: "https://orcid.org/0000-0000-0000-0000"
repository-code: "https://github.com/dzyla/toolbox"
license: AGPL-3.0-only
version: 0.1.0
date-released: 2026-09-02
```
(Replace the ORCID placeholder with the real one or delete the line before release.)

- [ ] **Step 2: Issue templates**

`.github/ISSUE_TEMPLATE/wrong-value.yml`:
```yaml
name: Wrong value
description: A calculation gives a result you believe is incorrect
title: "[wrong value] <tool>: <short description>"
labels: [science, bug]
body:
  - type: input
    id: tool
    attributes: { label: Tool, placeholder: "e.g. Protein Workbench" }
    validations: { required: true }
  - type: textarea
    id: inputs
    attributes: { label: Inputs, description: "Paste the share link if the tool has one, otherwise every input value." }
    validations: { required: true }
  - type: input
    id: got
    attributes: { label: Result shown by Bio-Bench }
    validations: { required: true }
  - type: input
    id: expected
    attributes: { label: Expected result }
    validations: { required: true }
  - type: textarea
    id: reference
    attributes: { label: Reference, description: "Where the expected value comes from: paper, textbook, another tool (name and version), hand calculation." }
    validations: { required: true }
```

`.github/ISSUE_TEMPLATE/tool-request.yml`:
```yaml
name: Tool request
description: Suggest a new tool or feature
title: "[tool] <name>"
labels: [enhancement]
body:
  - type: textarea
    id: what
    attributes: { label: What should it do?, description: "Inputs, outputs, and the formula or method if you know it." }
    validations: { required: true }
  - type: textarea
    id: why
    attributes: { label: How often would you use it, and what do you use today? }
```

`.github/ISSUE_TEMPLATE/data-addition.yml`:
```yaml
name: Add data (ladder, chemical, protocol)
description: Contribute a ladder, chemical, buffer preset or protocol
title: "[data] <what>"
labels: [data]
body:
  - type: dropdown
    id: kind
    attributes: { label: Kind, options: [Ladder, Chemical, Buffer or media preset, Protocol, Other] }
    validations: { required: true }
  - type: textarea
    id: data
    attributes: { label: Data, description: "Values with units, and the supplier document or publication they come from." }
    validations: { required: true }
```

`.github/PULL_REQUEST_TEMPLATE.md`:
```markdown
## What

## Science checklist (for changes under src/core or src/data)
- [ ] Every new constant has a source comment (name, year, URL/DOI)
- [ ] A test pins the result to a published reference value
- [ ] The tool's Science panel text is updated
```

- [ ] **Step 3: CONTRIBUTING.md**

```markdown
# Contributing to Bio-Bench

Thanks for helping make lab science free and correct.

## Ground rules
- Science first. A change to `src/core` or `src/data` needs a reference and a test that pins a published value. CI blocks merges that break a reference test.
- No servers, no accounts, no tracking. Everything runs in the browser.
- Keep `src/core` free of DOM and framework code; ESLint enforces this.

## Development
```bash
npm install
npm run dev        # http://localhost:5173
npm test           # unit + legacy science tests
npm run e2e        # browser smoke tests (needs Playwright's Chromium)
```

## Adding a tool
1. Add the science to `src/core/<area>/` with tests in `tests/core/`.
2. Create `src/tools/<id>/View.tsx` and `science.ts`.
3. Register it in `src/tools/registry.ts`. Home, search and navigation pick it up.

## Adding data
Ladders, chemicals, presets and protocols are JSON or Markdown files under `src/data/`. Include the source in the file. Data files are CC-BY-4.0.

## Reporting a wrong value
Use the "Wrong value" issue template and include the reference you compared against.
```

- [ ] **Step 4: README rewrite**

```markdown
# Bio-Bench

Free, open-source lab tools that show their work. Calculators, protein and DNA tools,
binding and alignment, and gel analysis. Runs entirely in your browser, installs as an
app on phones and laptops, works offline, stores your projects on your device.

**Live:** https://dzyla.github.io/toolbox/ · **Legacy tools:** https://dzyla.github.io/toolbox/legacy/

## Why
Every result carries its formula, assumptions and references, and every calculation is
tested against published reference values on every change. No accounts, no tokens, no
tracking. AGPL-3.0: anyone can use, host and improve it; hosted forks must stay open.

## Status
Rebuild in progress. See `docs/superpowers/specs/2026-09-02-bio-bench-rebuild-design.md`
for the design and `docs/science-audit-2026-09-02.md` for the audit that started it.

## Develop
See `CONTRIBUTING.md`.

## Citing
See `CITATION.cff` (GitHub shows a "Cite this repository" button).

## License
Code: AGPL-3.0-only (`LICENSE`). Data files under `src/data/`: CC-BY-4.0 (`LICENSE-DATA`).
```

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "docs: license, citation, contributing guide, issue templates, README"
```
