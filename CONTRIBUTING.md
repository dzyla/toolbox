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
npm run build && npm run e2e   # browser smoke tests (Playwright Chromium)
```

## Adding a tool
1. Put the science in `src/core/<area>/` with tests in `tests/core/`.
2. Create `src/tools/<id>/View.tsx` and `science.ts` (formulas, assumptions, references, verification date).
3. Register it in `src/tools/registry.ts`. Home, search and navigation pick it up automatically.

## Adding data
Ladders, chemicals, presets and protocols are JSON or Markdown files under `src/data/`. Include the source in the file. Data files are CC-BY-4.0.

## Reporting a wrong value
Use the "Wrong value" issue template and include the reference you compared against.
