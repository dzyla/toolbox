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
npm test           # unit tests (core science, components)
npm run build && npm run e2e   # browser smoke tests + axe WCAG A/AA checks, light and dark (Playwright Chromium)
```

## Accessibility
`tests/e2e/a11y.spec.ts` runs axe on every page in both themes and fails on any WCAG A/AA violation.
Give every form control an accessible name (a wrapping `<label>`, `id`/`htmlFor`, or `aria-label`), keep muted
text at `text-slate-500` or darker on white and pair light-only colours with a `dark:` variant.

## Adding a tool
1. Put the science in `src/core/<area>/` with tests in `tests/core/`. Shared statistics (t-distribution, log Gamma) live in `src/core/stats`.
2. Create `src/tools/<id>/View.tsx` and `science.ts` (formulas, assumptions, references, verification date).
3. Register it in `src/tools/registry.ts`. Home, search and navigation pick it up automatically.
4. Read uploads with `src/lib/file-import.ts` (size limits and readable errors, shown with `ImportAlert`), write
   downloads with `src/lib/export.ts` (`toCsv` quotes fields), and keep imported raw data across reloads with
   `useDraftText` from `src/lib/drafts.ts`. Tool modules must not import `preact/compat`; use `lazyView` for code-splitting.
5. To let users save work, use `useToolProject` (`src/lib/use-tool-project.ts`) with a schema-versioned, validated
   `project.ts` next to the view (see `src/tools/gel/project.ts`), pass `onSaveProject` to `ActionBar`, and set
   `hasProjects: true` in the registry. User-made presets go through `src/lib/local-library.ts`.

## Cloning hub
The cloning designers follow published vendor rules and are checked against stored reference outputs. Read `docs/cloning-hub.md` before changing them: it lists what is verified, the known differences, and how to add a reference case.

## Adding data
Ladders, chemicals, presets and protocols are JSON or Markdown files under `src/data/`. Include the source in the file. Data files are CC-BY-4.0.

## Reporting a wrong value
Use the "Wrong value" issue template and include the reference you compared against.
