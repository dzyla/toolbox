# Bio-Bench

Free, open-source lab tools that show their work: calculators, protein and DNA tools,
binding and alignment, and gel analysis. Runs entirely in your browser, installs as an
app on phones and laptops, works offline, and keeps your projects on your device.

**Live app:** https://dzyla.github.io/toolbox/

## Why
- Every result carries its formula, assumptions and references.
- Every calculation is tested against published reference values on every change.
- No accounts, no tokens, no tracking, no server.
- AGPL-3.0: anyone can use, host and improve it; hosted forks must stay open.

## Status
Rebuild in progress. The original tools were audited on 2026-09-02
(`docs/science-audit-2026-09-02.md`); every calculation is being ported into `src/core`
with tests pinned to published reference values. The design is in
`docs/superpowers/specs/2026-09-02-bio-bench-rebuild-design.md`. The frozen originals are
kept in `legacy/` for reference only and are not deployed.

## Develop
```bash
npm install
npm run dev
npm test
```
See `CONTRIBUTING.md` for the science rules and how to add a tool.

## Citing
See `CITATION.cff`; GitHub shows a "Cite this repository" button.

## License
Code: AGPL-3.0-only (`LICENSE`). Data files under `src/data/`: CC-BY-4.0 (`LICENSE-DATA`).
