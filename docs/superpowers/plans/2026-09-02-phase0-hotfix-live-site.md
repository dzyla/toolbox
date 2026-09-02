# Phase 0 — Hotfix the live site Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every number the currently deployed tools produce correct, with node tests that will later move into `core/`, without restructuring the legacy files.

**Architecture:** Legacy tools stay as standalone HTML plus three browser-global JS files (`definitions.js`, `labConstants.js`, `bio_align_engine.js`). Pure science functions that must be tested are moved into those JS files (or a new `binding_engine.js`) and loaded by the HTML with `<script src>`. Tests run in node by evaluating the browser scripts inside a `vm` context with a stub `window`.

**Tech Stack:** Node 22 built-in `node:test` and `node:assert` (no npm dependencies), `vm` module.

**Spec:** `docs/superpowers/specs/2026-09-02-bio-bench-rebuild-design.md` (section 11, phase 0) and `docs/science-audit-2026-09-02.md` (section 1, all 15 items).

## Global Constraints

- No npm dependencies in Phase 0; tests run with `node --test tests/legacy/`.
- Do not change tool layout or styling; only numbers, labels and the minimum code around them.
- Every constant changed gets a source comment (name, year, URL or DOI).
- Commit after every task with a message starting `fix(legacy):` or `test(legacy):`.
- The deploy workflow copies `*.html` and `*.js` from the repo root, so new JS files must live at the root.

---

### Task 1: Node test harness for browser-global scripts

**Files:**
- Create: `package.json`
- Create: `tests/legacy/load.js`
- Test: `tests/legacy/harness.test.js`

**Interfaces:**
- Produces: `loadBrowserScript(relPath: string, win?: object): object` — evaluates a browser script whose side effect is `window.X = ...` and returns the `window` object.

- [ ] **Step 1: Write the failing test**

```js
// tests/legacy/harness.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadBrowserScript } from './load.js';

test('harness loads definitions.js and exposes PROTEIN_DEFS and PROTEIN_UTILS', () => {
  const win = loadBrowserScript('definitions.js');
  assert.ok(win.PROTEIN_DEFS.AA.mw.A > 71 && win.PROTEIN_DEFS.AA.mw.A < 72);
  assert.equal(typeof win.PROTEIN_UTILS.countAA, 'function');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/legacy/`
Expected: FAIL, cannot find module `./load.js`

- [ ] **Step 3: Write package.json and the loader**

```json
{
  "name": "bio-bench-legacy-tests",
  "private": true,
  "type": "module",
  "scripts": { "test": "node --test tests/legacy/" }
}
```

```js
// tests/legacy/load.js
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Evaluate a browser-global script (window.X = ...) and return the window object. */
export function loadBrowserScript(relPath, win = {}) {
  const src = readFileSync(join(ROOT, relPath), 'utf8');
  win.window = win;
  win.console = console;
  win.Math = Math;
  vm.runInNewContext(src, win, { filename: relPath });
  return win;
}
```

Note: `definitions.js` assigns `window.PROTEIN_DEFS` and `window.PROTEIN_UTILS`; confirm the names with `grep -n "^window\." definitions.js` and adjust the test if they differ.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/legacy/`
Expected: PASS (1 test)

- [ ] **Step 5: Commit**

```bash
git add package.json tests/legacy/load.js tests/legacy/harness.test.js
git commit -m "test(legacy): node harness for browser-global science scripts"
```

---

### Task 2: Centrifuge RCF constant (10× error)

**Files:**
- Modify: `bio_bench.html:1940` and `:1949` (constant), `:563` (label)
- Modify: `labConstants.js:311`
- Test: `tests/legacy/centrifuge.test.js`

**Interfaces:**
- Produces: `window.LAB_CONSTANTS.constants.rcf_per_mm_rpm2 = 1.118e-6` and keeps `g_force_const` for cm.

- [ ] **Step 1: Write the failing test**

```js
// tests/legacy/centrifuge.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadBrowserScript } from './load.js';
import { readFileSync } from 'node:fs';

test('labConstants exposes RCF constants for cm and mm', () => {
  const { LAB_CONSTANTS } = loadBrowserScript('labConstants.js');
  assert.equal(LAB_CONSTANTS.constants.g_force_const, 1.118e-5);      // r in cm
  assert.equal(LAB_CONSTANTS.constants.rcf_per_mm_rpm2, 1.118e-6);   // r in mm
  // 100 mm, 10 000 rpm -> 11 180 g
  assert.equal(Math.round(1.118e-6 * 100 * 1e4 * 1e4), 11180);
});

test('bio_bench uses the mm constant with the mm label', () => {
  const html = readFileSync('bio_bench.html', 'utf8');
  assert.match(html, /Rotor Radius \(mm\)/);
  assert.equal((html.match(/1\.118e-5/g) || []).length, 0, 'cm constant must not appear');
  assert.ok((html.match(/1\.118e-6/g) || []).length >= 2, 'mm constant used in both directions');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/legacy/centrifuge.test.js`
Expected: FAIL on `rcf_per_mm_rpm2` undefined and on the `1.118e-5` count.

- [ ] **Step 3: Apply the fixes**

In `bio_bench.html` replace both occurrences:

```js
// line ~1940
const g = 1.118e-6 * r * rpm * rpm; // r in mm (1.118e-5 is for cm)
// line ~1949
const rpm = Math.sqrt( g / (1.118e-6 * r) ); // r in mm
```

In `labConstants.js` replace the `g_force_const` line with:

```js
      'g_force_const': 1.118e-5,      // RCF = c * r * rpm^2 with r in cm
      'rcf_per_mm_rpm2': 1.118e-6     // same with r in mm
```

- [ ] **Step 4: Run tests**

Run: `node --test tests/legacy/`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add bio_bench.html labConstants.js tests/legacy/centrifuge.test.js
git commit -m "fix(legacy): RCF constant used cm formula with mm input (10x error)"
```

---

### Task 3: Instability index DIWV table

**Files:**
- Modify: `definitions.js:21-48` (replace the whole `DIWV` block and its comment)
- Test: `tests/legacy/protein.test.js`

**Interfaces:**
- Consumes: `PROTEIN_DEFS.DIWV[a][b]`, used by `protein_params.html:553`.
- Produces: same shape, values from Guruprasad, Reddy & Pandit 1990 (Protein Eng. 4:155), as in Biopython `Bio.SeqUtils.ProtParamData.DIWV`.

- [ ] **Step 1: Write the failing test**

```js
// tests/legacy/protein.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadBrowserScript } from './load.js';

export const LYSOZYME = 'KVFGRCELAAAMKRHGLDNYRGYSLGNWVCAAKFESNFNTQATNRNTDGSTDYGILQINSRWWCNDGRTPGSRNLCNIPCSALLSSDITASVNCAKKIVSDGNGMNAWVAWRNRCKGTDVQAWIRGCRL';
export const INSULIN_B = 'FVNQHLCGSHLVEALYLVCGERGFFYTPKT';

function instability(seq, DIWV) {
  let s = 0;
  for (let i = 0; i < seq.length - 1; i++) s += DIWV[seq[i]][seq[i + 1]];
  return (10 / seq.length) * s;
}

test('DIWV matches Guruprasad 1990 spot values and reproduces ProtParam II', () => {
  const { PROTEIN_DEFS } = loadBrowserScript('definitions.js');
  const D = PROTEIN_DEFS.DIWV;
  assert.equal(D.A.C, 44.94);
  assert.equal(D.R.R, 58.28);
  assert.equal(D.M.H, 58.28);
  assert.equal(D.A.P, 20.26);
  assert.equal(D.G.A, -7.49);
  assert.equal(D.Y.R, -15.91);
  // 400 entries present
  let n = 0; for (const a in D) for (const b in D[a]) n++;
  assert.equal(n, 400);
  assert.ok(Math.abs(instability(LYSOZYME, D) - 16.09) < 0.05, 'lysozyme II (ProtParam 16.09)');
  assert.ok(Math.abs(instability(INSULIN_B, D) - 9.85) < 0.05, 'insulin B II');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/legacy/protein.test.js`
Expected: FAIL, `D.A.C` is -0.7

- [ ] **Step 3: Replace the DIWV block in definitions.js**

Replace the comment and object at `definitions.js:23-48` with:

```js
  /* DIWV — Dipeptide Instability Weight Values.
     Guruprasad K, Reddy BVB, Pandit MW (1990) Protein Eng. 4:155-161.
     Values identical to Biopython Bio.SeqUtils.ProtParamData.DIWV (used by ExPASy ProtParam).
     Indexed as DIWV[first_residue][second_residue]. II = (10/L) * Σ DIWV[i][i+1]. */
  DIWV: {
    A:{A:1.0,C:44.94,E:1.0,D:-7.49,G:1.0,F:1.0,I:1.0,H:-7.49,K:1.0,M:1.0,L:1.0,N:1.0,Q:1.0,P:20.26,S:1.0,R:1.0,T:1.0,W:1.0,V:1.0,Y:1.0},
    C:{A:1.0,C:1.0,E:1.0,D:20.26,G:1.0,F:1.0,I:1.0,H:33.60,K:1.0,M:33.60,L:20.26,N:1.0,Q:-6.54,P:20.26,S:1.0,R:1.0,T:33.60,W:24.68,V:-6.54,Y:1.0},
    E:{A:1.0,C:44.94,E:33.60,D:20.26,G:1.0,F:1.0,I:20.26,H:-6.54,K:1.0,M:1.0,L:1.0,N:1.0,Q:20.26,P:20.26,S:20.26,R:1.0,T:1.0,W:-14.03,V:1.0,Y:1.0},
    D:{A:1.0,C:1.0,E:1.0,D:1.0,G:1.0,F:-6.54,I:1.0,H:1.0,K:-7.49,M:1.0,L:1.0,N:1.0,Q:1.0,P:1.0,S:20.26,R:-6.54,T:-14.03,W:1.0,V:1.0,Y:1.0},
    G:{A:-7.49,C:1.0,E:-6.54,D:1.0,G:13.34,F:1.0,I:-7.49,H:1.0,K:-7.49,M:1.0,L:1.0,N:-7.49,Q:1.0,P:1.0,S:1.0,R:1.0,T:-7.49,W:13.34,V:1.0,Y:-7.49},
    F:{A:1.0,C:1.0,E:1.0,D:13.34,G:1.0,F:1.0,I:1.0,H:1.0,K:-14.03,M:1.0,L:1.0,N:1.0,Q:1.0,P:20.26,S:1.0,R:1.0,T:1.0,W:1.0,V:1.0,Y:33.601},
    I:{A:1.0,C:1.0,E:44.94,D:1.0,G:1.0,F:1.0,I:1.0,H:13.34,K:-7.49,M:1.0,L:20.26,N:1.0,Q:1.0,P:-1.88,S:1.0,R:1.0,T:1.0,W:1.0,V:-7.49,Y:1.0},
    H:{A:1.0,C:1.0,E:1.0,D:1.0,G:-9.37,F:-9.37,I:44.94,H:1.0,K:24.68,M:1.0,L:1.0,N:24.68,Q:1.0,P:-1.88,S:1.0,R:1.0,T:-6.54,W:-1.88,V:1.0,Y:44.94},
    K:{A:1.0,C:1.0,E:1.0,D:1.0,G:-7.49,F:1.0,I:-7.49,H:1.0,K:1.0,M:33.60,L:-7.49,N:1.0,Q:24.64,P:-6.54,S:1.0,R:33.60,T:1.0,W:1.0,V:-7.49,Y:1.0},
    M:{A:13.34,C:1.0,E:1.0,D:1.0,G:1.0,F:1.0,I:1.0,H:58.28,K:1.0,M:-1.88,L:1.0,N:1.0,Q:-6.54,P:44.94,S:44.94,R:-6.54,T:-1.88,W:1.0,V:1.0,Y:24.68},
    L:{A:1.0,C:1.0,E:1.0,D:1.0,G:1.0,F:1.0,I:1.0,H:1.0,K:-7.49,M:1.0,L:1.0,N:1.0,Q:33.60,P:20.26,S:1.0,R:20.26,T:1.0,W:24.68,V:1.0,Y:1.0},
    N:{A:1.0,C:-1.88,E:1.0,D:1.0,G:-14.03,F:-14.03,I:44.94,H:1.0,K:24.68,M:1.0,L:1.0,N:1.0,Q:-6.54,P:-1.88,S:1.0,R:1.0,T:-7.49,W:-9.37,V:1.0,Y:1.0},
    Q:{A:1.0,C:-6.54,E:20.26,D:20.26,G:1.0,F:-6.54,I:1.0,H:1.0,K:1.0,M:1.0,L:1.0,N:1.0,Q:20.26,P:20.26,S:44.94,R:1.0,T:1.0,W:1.0,V:-6.54,Y:-6.54},
    P:{A:20.26,C:-6.54,E:18.38,D:-6.54,G:1.0,F:20.26,I:1.0,H:1.0,K:1.0,M:-6.54,L:1.0,N:1.0,Q:20.26,P:20.26,S:20.26,R:-6.54,T:1.0,W:-1.88,V:20.26,Y:1.0},
    S:{A:1.0,C:33.60,E:20.26,D:1.0,G:1.0,F:1.0,I:1.0,H:1.0,K:1.0,M:1.0,L:1.0,N:1.0,Q:20.26,P:44.94,S:20.26,R:20.26,T:1.0,W:1.0,V:1.0,Y:1.0},
    R:{A:1.0,C:1.0,E:1.0,D:1.0,G:-7.49,F:1.0,I:1.0,H:20.26,K:1.0,M:1.0,L:1.0,N:13.34,Q:20.26,P:20.26,S:44.94,R:58.28,T:1.0,W:58.28,V:1.0,Y:-6.54},
    T:{A:1.0,C:1.0,E:20.26,D:1.0,G:-7.49,F:13.34,I:1.0,H:1.0,K:1.0,M:1.0,L:1.0,N:-14.03,Q:-6.54,P:1.0,S:1.0,R:1.0,T:1.0,W:-14.03,V:1.0,Y:1.0},
    W:{A:-14.03,C:1.0,E:1.0,D:1.0,G:-9.37,F:1.0,I:1.0,H:24.68,K:1.0,M:24.68,L:13.34,N:13.34,Q:1.0,P:1.0,S:1.0,R:1.0,T:-14.03,W:1.0,V:-7.49,Y:1.0},
    V:{A:1.0,C:1.0,E:1.0,D:-14.03,G:-7.49,F:1.0,I:1.0,H:1.0,K:-1.88,M:1.0,L:1.0,N:1.0,Q:1.0,P:20.26,S:1.0,R:1.0,T:-7.49,W:1.0,V:1.0,Y:-6.54},
    Y:{A:24.68,C:1.0,E:-6.54,D:24.68,G:-7.49,F:1.0,I:1.0,H:13.34,K:1.0,M:44.94,L:1.0,N:1.0,Q:1.0,P:13.34,S:1.0,R:-15.91,T:-7.49,W:-9.37,V:1.0,Y:13.34}
  },
```

- [ ] **Step 4: Run tests**

Run: `node --test tests/legacy/`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add definitions.js tests/legacy/protein.test.js
git commit -m "fix(legacy): replace instability-index DIWV table with Guruprasad 1990 values"
```

---

### Task 4: True Bjellqvist pKa set, consistent pI/charge, native/denatured ε

**Files:**
- Modify: `definitions.js:7-8` (pKa), `:248-268` (netCharge/isoelectricPoint in PROTEIN_UTILS), `:5` (ext), `:271-289` (extinctionCoefficients)
- Modify: `protein_params.html:312-322` (delete local `pKaSets`), `:532-549` (delegate to PROTEIN_UTILS), `:812-813`, `:946`, `:995`, `:1147`, `:1200` (pass `seq`), `:867-868` (labels), `:882-883` and `:951-957` (ε state)
- Test: `tests/legacy/protein.test.js` (extend)

**Interfaces:**
- Produces in `window.PROTEIN_UTILS`:
  - `pKaSets: { bjellqvist: {...}, emboss: {...} }`
  - `netCharge(counts, pH, scheme = 'bjellqvist', seq = '')` — Bjellqvist uses `seq[0]` and `seq[seq.length-1]` for residue-specific terminal pKa.
  - `isoelectricPoint(counts, scheme = 'bjellqvist', seq = '')`
  - `extinctionCoefficients(counts, mw, state = 'native')` → `{ reduced, cystines, absRed, absCys }`; `state` is `'native'` (Pace 1995: W 5500, Y 1490, cystine 125) or `'denatured'` (6 M GdnHCl, Pace 1995 / Edelhoch: W 5685, Y 1285, cystine 125).

- [ ] **Step 1: Write the failing tests** (append to `tests/legacy/protein.test.js`)

```js
test('true Bjellqvist pI reproduces ExPASy; EMBOSS set still available', () => {
  const { PROTEIN_UTILS: U } = loadBrowserScript('definitions.js');
  const lys = U.countAA(LYSOZYME), ins = U.countAA(INSULIN_B);
  assert.ok(Math.abs(U.isoelectricPoint(lys, 'bjellqvist', LYSOZYME) - 9.32) < 0.02);
  assert.ok(Math.abs(U.isoelectricPoint(ins, 'bjellqvist', INSULIN_B) - 6.90) < 0.02);
  assert.ok(Math.abs(U.isoelectricPoint(lys, 'emboss', LYSOZYME) - 9.15) < 0.05);
  assert.deepEqual(U.pKaSets.bjellqvist.side, { K: 10.0, R: 12.0, H: 5.98, D: 4.05, E: 4.45, C: 9.0, Y: 10.0 });
  assert.equal(U.pKaSets.bjellqvist.nTerm.default, 7.5);
  assert.equal(U.pKaSets.bjellqvist.nTerm.P, 8.36);
  assert.equal(U.pKaSets.bjellqvist.cTerm.E, 4.75);
});

test('extinction coefficients: native (Pace) and denatured (6 M GdnHCl)', () => {
  const { PROTEIN_UTILS: U } = loadBrowserScript('definitions.js');
  const c = U.countAA(LYSOZYME);
  const mw = U.molecularWeight(c);
  const nat = U.extinctionCoefficients(c, mw, 'native');
  assert.equal(nat.reduced, 37470);
  assert.equal(nat.cystines, 37970);
  const den = U.extinctionCoefficients(c, mw, 'denatured');
  // 6 W * 5685 + 3 Y * 1285 = 34110 + 3855 = 37965 ; + 4 cystines * 125 = 38465
  assert.equal(den.reduced, 37965);
  assert.equal(den.cystines, 38465);
  assert.ok(Math.abs(nat.absCys - 2.653) < 0.002, 'Abs 0.1% with cystines');
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test tests/legacy/protein.test.js`
Expected: FAIL (`isoelectricPoint` ignores the scheme name / `pKaSets` undefined)

- [ ] **Step 3: Implement in definitions.js**

Replace `definitions.js:7-8` (`pKa_side`, `pKa_term`) with:

```js
    // Extinction coefficients at 280 nm, M^-1 cm^-1. Pace CN et al. (1995) Protein Sci 4:2411.
    ext: { Y:1490, W:5500, CYS_DISULFIDE_PAIR:125 },                 // native, folded protein in water
    ext_denatured: { Y:1285, W:5685, CYS_DISULFIDE_PAIR:125 },       // 6 M guanidine HCl (Pace 1995; Edelhoch 1967)
```

(keep the existing `ext:` line only once — replace it with the two lines above) and, in place of `pKa_side`/`pKa_term`, add nothing; the sets now live in `PROTEIN_UTILS.pKaSets`.

In `PROTEIN_UTILS` (around `definitions.js:248-268`) replace the `netCharge`/`isoelectricPoint` pair with:

```js
  /* pKa sets.
     bjellqvist: Bjellqvist B et al. (1993) Electrophoresis 14:1023; as implemented by ExPASy Compute pI/MW
                 (values tabulated in Kozlowski LP (2016) Biol Direct 11:55, Table 1).
                 N-terminal pKa depends on the first residue; C-terminal D/E have their own pKa.
     emboss:     EMBOSS Epk.dat (Rice P et al. 2000). */
  pKaSets: {
    bjellqvist: {
      nTerm: { default: 7.5, A: 7.59, M: 7.0, S: 6.93, P: 8.36, T: 6.82, V: 7.44, E: 7.7 },
      cTerm: { default: 3.55, D: 4.55, E: 4.75 },
      side:  { K: 10.0, R: 12.0, H: 5.98, D: 4.05, E: 4.45, C: 9.0, Y: 10.0 }
    },
    emboss: {
      nTerm: { default: 8.6 },
      cTerm: { default: 3.6 },
      side:  { K: 10.8, R: 12.5, H: 6.5, D: 3.9, E: 4.1, C: 8.5, Y: 10.1 }
    }
  },

  netCharge(counts, pH, scheme = 'bjellqvist', seq = '') {
    const pK = this.pKaSets[scheme] || this.pKaSets.bjellqvist;
    const first = seq ? seq[0] : '';
    const last  = seq ? seq[seq.length - 1] : '';
    const pKn = pK.nTerm[first] ?? pK.nTerm.default;
    const pKc = pK.cTerm[last]  ?? pK.cTerm.default;
    const pos = (n, pKa) => n / (1 + 10 ** (pH - pKa));
    const neg = (n, pKa) => n / (1 + 10 ** (pKa - pH));
    let nD = counts.D || 0, nE = counts.E || 0;
    let q = pos(1, pKn) - neg(1, pKc);
    // A C-terminal D/E is counted once, with the C-terminal-specific side-chain pKa.
    if (last === 'D' && pK.cTerm.D !== undefined) { nD -= 1; q -= neg(1, pK.cTerm.D); }
    if (last === 'E' && pK.cTerm.E !== undefined) { nE -= 1; q -= neg(1, pK.cTerm.E); }
    q += pos(counts.K || 0, pK.side.K) + pos(counts.R || 0, pK.side.R) + pos(counts.H || 0, pK.side.H);
    q -= neg(nD, pK.side.D) + neg(nE, pK.side.E) + neg(counts.C || 0, pK.side.C) + neg(counts.Y || 0, pK.side.Y);
    return q;
  },

  isoelectricPoint(counts, scheme = 'bjellqvist', seq = '') {
    let lo = 0, hi = 14;
    for (let i = 0; i < 60; i++) {
      const mid = (lo + hi) / 2;
      if (this.netCharge(counts, mid, scheme, seq) > 0) lo = mid; else hi = mid;
    }
    return (lo + hi) / 2;
  },
```

Note on the C-terminal D/E rule: ExPASy applies the C-terminal side-chain pKa (4.55/4.75) to a terminal D/E in place of the ordinary side-chain value; the test values 9.32 and 6.90 are reproduced by this implementation (verified 2026-09-02 in `scratchpad/audit.js`).

Replace `extinctionCoefficients` (`definitions.js:271-289`) with:

```js
  extinctionCoefficients(counts, mw, state = 'native') {
    const E = state === 'denatured' ? window.PROTEIN_DEFS.AA.ext_denatured : window.PROTEIN_DEFS.AA.ext;
    const nY = counts.Y || 0, nW = counts.W || 0, nC = counts.C || 0;
    const reduced  = nY * E.Y + nW * E.W;
    const cystines = reduced + Math.floor(nC / 2) * E.CYS_DISULFIDE_PAIR;
    return { reduced, cystines, absRed: mw ? reduced / mw : 0, absCys: mw ? cystines / mw : 0 };
  },
```

Check that any other field the old function returned (grep the old body) is preserved; keep extra fields if `protein_params.html` reads them.

- [ ] **Step 4: Wire protein_params.html to the shared functions**

1. Delete the local `pKaSets` object (`:312-322`).
2. Replace local `netCharge` and `isoelectricPoint` (`:532-549`) with:

```js
  const netCharge = (counts, pH, scheme = 'bjellqvist', seq = '') => UTILS.netCharge(counts, pH, scheme, seq);
  const isoelectricPoint = (counts, scheme = 'bjellqvist', seq = '') => UTILS.isoelectricPoint(counts, scheme, seq);
```

3. Pass the sequence at every call site: `:812` → `isoelectricPoint(c, 'bjellqvist', s)`, `:813` → `netCharge(c, Number(els.pH.value), 'bjellqvist', s)`, `:946` → `isoelectricPoint(obj.counts, piSel.value, obj.seq)`, `:995` → `isoelectricPoint(counts, 'bjellqvist', pep)` where `pep` is the peptide string in scope there (check the variable name at `:990-995`), `:1147` and `:1200` → add `, 'bjellqvist', o.seq`.
4. Selector labels (`:867-868`):

```html
<option value="bjellqvist">Bjellqvist (ExPASy)</option>
<option value="emboss">EMBOSS</option>
```

5. ε state selector (`:882-883`):

```html
<option value="native">Native (Pace 1995)</option>
<option value="denatured">Denatured, 6 M GdnHCl</option>
```

6. ε change handler (`:951-957`):

```js
      extSel.addEventListener('change', () => {
          const e = UTILS.extinctionCoefficients(obj.counts, obj.molecularWeight, extSel.value);
          document.getElementById(`ext-red-${obj.id}`).textContent = e.reduced;
          document.getElementById(`ext-cys-${obj.id}`).textContent = e.cystines;
      });
```

7. Add the unit to the two ε labels (`:885-886`): `ε<sub>280</sub> (Tyr/Trp), M⁻¹cm⁻¹`.

- [ ] **Step 5: Run tests and a browser smoke check**

Run: `node --test tests/legacy/`
Expected: PASS

Run: `python3 -m http.server 8123 >/dev/null 2>&1 &` then open `http://localhost:8123/protein_params.html`, paste the lysozyme sequence, confirm pI 9.32, ε 37470/37970, instability 16.09, and that switching the state selector changes ε to 37965/38465. Stop the server afterwards.

- [ ] **Step 6: Commit**

```bash
git add definitions.js protein_params.html tests/legacy/protein.test.js
git commit -m "fix(legacy): true Bjellqvist pKa set, consistent pI/charge, native vs denatured extinction"
```

---

### Task 5: Alignment engine — matrix typos, traceback, BLOSUM80 option

**Files:**
- Modify: `bio_align_engine.js:35`, `:89`, `:253-281`
- Modify: `bio_bench.html:794` (remove BLOSUM80 option)
- Test: `tests/legacy/align.test.js`

**Interfaces:**
- Consumes: `window.BioCompute.align(s1, s2, matrixName, gapOpen, gapExt, algo)` — confirm the exact parameter order from the JSDoc at `bio_align_engine.js:125-134` and adjust the test call accordingly.
- Produces: same API; traceback always returns aligned strings whose affine re-score equals `score`.

- [ ] **Step 1: Write the failing tests**

```js
// tests/legacy/align.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadBrowserScript } from './load.js';

const win = loadBrowserScript('bio_align_engine.js');
const BC = win.BioCompute;
const MATS = win.BioCompute.MATRICES || null;

// Affine re-scoring of an alignment (Gotoh convention: first gap column costs gapOpen, following ones gapExt)
function rescore(a1, a2, matrix, gapOpen, gapExt) {
  let s = 0, inX = false, inY = false;
  for (let k = 0; k < a1.length; k++) {
    const x = a1[k], y = a2[k];
    if (y === '-') { s += inX ? gapExt : gapOpen; inX = true; inY = false; }
    else if (x === '-') { s += inY ? gapExt : gapOpen; inY = true; inX = false; }
    else { s += BC.getScore(x, y, matrix); inX = inY = false; }
  }
  return s;
}

function rand(n, alphabet, rng) { let s = ''; for (let i = 0; i < n; i++) s += alphabet[Math.floor(rng() * alphabet.length)]; return s; }
function mulberry(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

test('substitution matrices are symmetric', () => {
  for (const name of ['BLOSUM62', 'BLOSUM45', 'PAM250']) {
    const order = 'ARNDCQEGHILKMFPSTWYVBZX*';
    for (let i = 0; i < 24; i++) for (let j = 0; j < 24; j++)
      assert.equal(BC.getScore(order[i], order[j], name), BC.getScore(order[j], order[i], name), `${name} ${order[i]}${order[j]}`);
  }
  assert.equal(BC.getScore('Y', 'Z', 'BLOSUM62'), -2);
  assert.equal(BC.getScore('Z', 'P', 'PAM250'), 0);
});

test('global traceback never emits undefined and re-scores to the reported score', () => {
  const r = BC.align('ACGT', 'GGACGT', 'EDNAFULL', -10, -1, 'global');
  assert.ok(!r.seq1Aligned.includes('undefined') && !r.seq2Aligned.includes('undefined'));
  assert.equal(r.seq1Aligned.length, r.seq2Aligned.length);
  const rng = mulberry(42);
  for (let t = 0; t < 150; t++) {
    const s1 = rand(5 + Math.floor(rng() * 40), 'ACDEFGHIKLMNPQRSTVWY', rng);
    const s2 = rand(5 + Math.floor(rng() * 40), 'ACDEFGHIKLMNPQRSTVWY', rng);
    const g = BC.align(s1, s2, 'BLOSUM62', -11, -1, 'global');
    assert.equal(g.seq1Aligned.replace(/-/g, ''), s1);
    assert.equal(g.seq2Aligned.replace(/-/g, ''), s2);
    assert.equal(rescore(g.seq1Aligned, g.seq2Aligned, 'BLOSUM62', -11, -1), g.score, `global ${s1} ${s2}`);
  }
});

test('local traceback keeps gaps and re-scores to the reported score', () => {
  const r = BC.align('CTAAAATGGCAGCACGCCATAC', 'GTAGATGGCACGCCCTA', 'EDNAFULL', -10, -1, 'local');
  assert.equal(rescore(r.seq1Aligned, r.seq2Aligned, 'EDNAFULL', -10, -1), r.score);
  const rng = mulberry(7);
  for (let t = 0; t < 300; t++) {
    const s1 = rand(10 + Math.floor(rng() * 40), 'ACDEFGHIKLMNPQRSTVWY', rng);
    const s2 = rand(10 + Math.floor(rng() * 40), 'ACDEFGHIKLMNPQRSTVWY', rng);
    const l = BC.align(s1, s2, 'BLOSUM62', -10, -1, 'local');
    assert.equal(rescore(l.seq1Aligned, l.seq2Aligned, 'BLOSUM62', -10, -1), l.score, `local ${s1} ${s2}`);
    assert.ok(s1.includes(l.seq1Aligned.replace(/-/g, '')));
  }
});
```

If `BC.align`'s parameter order differs, fix the test calls, not the engine.

- [ ] **Step 2: Run to verify failure**

Run: `node --test tests/legacy/align.test.js`
Expected: FAIL (symmetry Y/Z, and TypeError or "undefined" in traceback)

- [ ] **Step 3: Fix the matrices**

`bio_align_engine.js:35` (BLOSUM62 row Y): change the 22nd value (column Z) from `-3` to `-2`.
`bio_align_engine.js:89` (PAM250 row Z): change the 15th value (column P) from `-1` to `0`.
Add a comment above `MATRICES`: `// Verified symmetric against NCBI matrices 2026-09-02 (tests/legacy/align.test.js).`

- [ ] **Step 4: Fix the traceback**

Replace the `while (...) { ... }` block at `bio_align_engine.js:253-281` with:

```js
            // Traceback invariant (tested): re-scoring the aligned strings with the same
            // affine gap scheme reproduces `maxScore` exactly.
            while (true) {
                if (!isLocal) {
                    if (i === 0 && j === 0) break;
                    if (i === 0) state = 2;          // only a gap in s1 (consume s2) can remain
                    else if (j === 0) state = 1;     // only a gap in s2 (consume s1) can remain
                } else {
                    if (state === 0 && M[i][j] <= 0) break;   // local alignment starts here
                    if (state === 1 && i === 0) break;        // never valid; defensive
                    if (state === 2 && j === 0) break;
                }
                if (state === 0) {
                    align1 = s1[i-1] + align1;
                    align2 = s2[j-1] + align2;
                    const src = BtM[i][j];
                    i--; j--;
                    state = src < 0 ? 0 : src;
                } else if (state === 1) {
                    align1 = s1[i-1] + align1;
                    align2 = '-' + align2;
                    const src = BtX[i][j];
                    i--;
                    state = src;                      // 0 = came from M, 1 = extended X
                } else {
                    align1 = '-' + align1;
                    align2 = s2[j-1] + align2;
                    const src = BtY[i][j];
                    j--;
                    state = src;                      // 0 = came from M, 2 = extended Y
                }
            }
```

Border cells: in global mode `BtX[i][0]` and `BtY[0][j]` are 0 (uninitialised), which would send the state to M; the top-of-loop border check overrides that before any character is read. In local mode `M[i][j] <= 0` is only tested in state 0, so a gap whose underlying M cell happens to be 0 is no longer cut off.

- [ ] **Step 5: Remove the dangling BLOSUM80 option**

`bio_bench.html:794`: delete the line `<option value="BLOSUM80">BLOSUM80 (Closely related)</option>`. (A verified BLOSUM80 is added in Phase 2 with a checksum test.)

- [ ] **Step 6: Run tests**

Run: `node --test tests/legacy/`
Expected: PASS. If a random pair fails the re-score check, print `s1`, `s2`, the aligned strings and the two scores, and fix the traceback until all 450 pairs pass; do not loosen the assertion.

- [ ] **Step 7: Commit**

```bash
git add bio_align_engine.js bio_bench.html tests/legacy/align.test.js
git commit -m "fix(legacy): alignment traceback at borders and in local mode; matrix typos; drop unimplemented BLOSUM80"
```

---

### Task 6: Bio-Bench presets, ammonium sulfate, chemical table

**Files:**
- Modify: `bio_bench.html:1534` (TAE), `:651-652` (AS labels), `:2042-2048` (AS constants and guard)
- Modify: `labConstants.js:24`, `:26`, `:144`, `:178`, `:207`, `:253`, `:254`, `:259`
- Test: `tests/legacy/constants.test.js`

- [ ] **Step 1: Write the failing test**

```js
// tests/legacy/constants.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadBrowserScript } from './load.js';

const { LAB_CONSTANTS } = loadBrowserScript('labConstants.js');
const byName = Object.fromEntries(LAB_CONSTANTS.chemicals.map(c => [c.name, c]));

test('chemical MW corrections', () => {
  assert.equal(byName['E-64'].mw, 357.41);
  assert.equal(byName['dTTP (Disodium)'].mw, 526.13);
  assert.equal(byName['ADA'].mw, 190.16);
  assert.equal(byName['Cholamine chloride hydrochloride'].mw, 175.10);
  assert.equal(byName['L-Glutamic acid'].mw, 147.13);
  for (const gone of ['Agarose', 'Glycogen', 'EDTA (0.5M soln, pH 8.0 approx)', 'L-Glutamate', 'Cholamine chloride'])
    assert.equal(byName[gone], undefined, `${gone} should be removed`);
});

test('TAE preset uses 17.4 M glacial acetic acid stock', () => {
  const html = readFileSync('bio_bench.html', 'utf8');
  assert.match(html, /name: "Acetic Acid \(glacial, 17\.4 M\)", mw: 17\.4, isLiquid: true, conc: 20, unit: "mM", stockUnit: "M"/);
});

test('ammonium sulfate uses 533/0.30 at 25 °C and 515/0.27 at 0 °C', () => {
  const html = readFileSync('bio_bench.html', 'utf8');
  assert.match(html, /temp === "25" \? 533 : 515/);
  assert.match(html, /temp === "25" \? 0\.3 : 0\.27/);
  assert.match(html, /<option value="25">25 °C \(room temperature\)<\/option>/);
  assert.match(html, /<option value="0">0–4 °C \(cold room\)<\/option>/);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test tests/legacy/constants.test.js`
Expected: FAIL on E-64

- [ ] **Step 3: Edit labConstants.js**

```js
    { name: "ADA", mw: 190.16, type: "buffer" },                       // C6H10N2O5, Sigma A9883
    { name: "Cholamine chloride hydrochloride", mw: 175.10, type: "buffer" }, // C5H15ClN2·HCl, Sigma C6660
```
Delete the line `{ name: "EDTA (0.5M soln, pH 8.0 approx)", ... }`.
```js
    { name: "dTTP (Disodium)", mw: 526.13, type: "nucleotide", synonyms: ["dTTP"] }, // C10H14N2Na2O14P3, Thermo R0171
    { name: "L-Glutamic acid", mw: 147.13, type: "additive" },
    { name: "E-64", mw: 357.41, type: "inhibitor" },                    // C15H27N5O5, Sigma E3132
```
Delete the `Agarose` and `Glycogen` lines (polymers have no molar mass; % w/v is the right unit and needs no MW).

- [ ] **Step 4: Edit bio_bench.html**

TAE preset line:
```js
                 { name: "Acetic Acid (glacial, 17.4 M)", mw: 17.4, isLiquid: true, conc: 20, unit: "mM", stockUnit: "M" },
```
AS select options:
```html
                                <option value="25">25 °C (room temperature)</option>
                                <option value="0">0–4 °C (cold room)</option>
```
AS calculation (replace the `factor`/`expansion` lines and add the guard):
```js
                // Grams of solid (NH4)2SO4 to add per litre. EMBL / Green & Hughes 1955:
                // 25 °C: 533 (S2-S1) / (100 - 0.30 S2); 0 °C: 515 (S2-S1) / (100 - 0.27 S2)
                const factor = temp === "25" ? 533 : 515;
                const expansion = temp === "25" ? 0.3 : 0.27;
                if(s2 >= 100 || s2 <= s1) { document.getElementById('as-result').textContent = s2 <= s1 ? "Target must exceed current saturation" : "ERR"; return; }
```

- [ ] **Step 5: Run tests**

Run: `node --test tests/legacy/`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add bio_bench.html labConstants.js tests/legacy/constants.test.js
git commit -m "fix(legacy): TAE acetic acid stock, ammonium sulfate constants, chemical MW corrections"
```

---

### Task 7: Binding calculator — exact cooperative species in tiles and target solver

**Files:**
- Create: `binding_engine.js` (root, browser global `window.BindingEngine`)
- Modify: `binding_calculator.html` (add `<script src="binding_engine.js"></script>` after the Chart.js script at `:24`; delete `f_single_step`, `solve_single_step`, `solve_stepwise_general` at `:552-613` and replace with destructuring; fix tiles `:918-923`; fix target solver `:1010-1021`)
- Test: `tests/legacy/binding.test.js`

**Interfaces:**
- Produces `window.BindingEngine`:
  - `solveSingleStep(P1_tot, P2_tot, Kd_int, n): number` (complex conc, nM)
  - `solveStepwise(P_tot, L_tot, Kd_site, n, alpha): { L, theta, probs: number[], concs: number[] }`
  - `targetStepwise(P_tot, Kd_site, n, alpha, mode: 'any_bound'|'fully_bound', targetFrac): number` — required total ligand (nM) such that `1 - probs[0]` (any_bound) or `probs[n]` (fully_bound) equals `targetFrac`; returns `NaN` if unreachable.

- [ ] **Step 1: Write the failing test**

```js
// tests/legacy/binding.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadBrowserScript } from './load.js';
const { BindingEngine: BE } = loadBrowserScript('binding_engine.js');

const near = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(b));

test('1:1 matches Morrison closed form', () => {
  const P = 10, L = 50, Kd = 100;
  const x = ((P + L + Kd) - Math.sqrt((P + L + Kd) ** 2 - 4 * P * L)) / 2;
  assert.ok(near(BE.solveSingleStep(P, L, Kd, 1), x, 1e-6));
});

test('stepwise with alpha=1 is binomial; alpha=0.1 is not', () => {
  const r1 = BE.solveStepwise(10, 50, 100, 2, 1);
  assert.ok(near(r1.probs[0], (1 - r1.theta) ** 2, 1e-6));
  const r = BE.solveStepwise(10, 50, 100, 2, 0.1);
  assert.ok(near(r.probs[0], 0.307, 2e-3));
  assert.ok(near(r.probs[2], 0.456, 2e-3));
  assert.ok(!near(r.probs[0], (1 - r.theta) ** 2, 1e-2), 'binomial must not be used when alpha != 1');
});

test('target solver hits the requested fraction through the exact model', () => {
  for (const mode of ['any_bound', 'fully_bound']) {
    const Lreq = BE.targetStepwise(10, 100, 2, 0.1, mode, 0.5);
    const r = BE.solveStepwise(10, Lreq, 100, 2, 0.1);
    const got = mode === 'any_bound' ? 1 - r.probs[0] : r.probs[2];
    assert.ok(near(got, 0.5, 1e-4), `${mode}: got ${got}`);
  }
  assert.ok(Number.isNaN(BE.targetStepwise(10, 100, 2, 1, 'any_bound', 1.0)));
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test tests/legacy/binding.test.js`
Expected: FAIL, cannot load `binding_engine.js`

- [ ] **Step 3: Create binding_engine.js**

Move the three functions verbatim from `binding_calculator.html:552-613` into the file below (rename as shown) and add the target solver:

```js
/* Bio-Bench binding engine — pure equilibrium math, no DOM. Concentrations in nM.
   1:1 and n-mer single-step: bisection on mass balance (equivalent to Morrison 1969 for n=1).
   Stepwise: n identical sites with cooperativity factor alpha (Adair binding polynomial). */
(function (global) {
  'use strict';

  function fSingleStep(x, P1_tot, P2_tot, Kd_int, n) { /* body of f_single_step */ }
  function solveSingleStep(P1_tot, P2_tot, Kd_int, n) { /* body of solve_single_step, calling fSingleStep */ }
  function solveStepwise(P_tot, L_tot, Kd_intrinsic, n, alpha) { /* body of solve_stepwise_general */ }

  function targetStepwise(P_tot, Kd_site, n, alpha, mode, targetFrac) {
    if (!(targetFrac > 0 && targetFrac < 1)) return NaN;
    const frac = (Ltot) => {
      const r = solveStepwise(P_tot, Ltot, Kd_site, n, alpha);
      return mode === 'fully_bound' ? r.probs[n] : 1 - r.probs[0];
    };
    let lo = 0, hi = Math.max(Kd_site, 1) * 10;
    let guard = 0;
    while (frac(hi) < targetFrac) { hi *= 4; if (++guard > 60) return NaN; }
    for (let i = 0; i < 100; i++) {
      const mid = 0.5 * (lo + hi);
      if (frac(mid) < targetFrac) lo = mid; else hi = mid;
    }
    return 0.5 * (lo + hi);
  }

  global.BindingEngine = { solveSingleStep, solveStepwise, targetStepwise };
})(window);
```

Copy the function bodies exactly; do not retype numbers.

- [ ] **Step 4: Wire the HTML**

After the Chart.js `<script>` at `:24` add `<script src="binding_engine.js"></script>`.
Replace `:552-613` with:

```js
  const solve_single_step = window.BindingEngine.solveSingleStep;
  const solve_stepwise_general = window.BindingEngine.solveStepwise;
```
(keep `species_stepwise` at `:615-618` unchanged).

Tiles (`:918-923`): replace
```js
      const prob0 = Math.pow(1 - theta, n);
      const probN = Math.pow(theta, n);
```
with
```js
      const prob0 = probs[0];      // exact, includes cooperativity
      const probN = probs[n];
```

Target solver (`:1010-1021`): replace the whole `else if (model === 'stepwise_identical') { ... }` body with

```js
    } else if (model === 'stepwise_identical') {
      const Kd_site = to_nM(kd_val, kd_unit);
      const alpha = parseFloat(els.coop.value) || 1.0;
      const mode = els.targetMode.value;
      if (mode !== 'any_bound' && mode !== 'fully_bound') {
        els.targetOut.textContent = 'Switch to single-step target for that mode.';
        return;
      }
      required_P2_tot_nM = window.BindingEngine.targetStepwise(P1_tot, Kd_site, n, alpha, mode, target_pct);
      if (Number.isNaN(required_P2_tot_nM)) { els.targetOut.textContent = 'Target not reachable.'; return; }
    }
```

- [ ] **Step 5: Run tests and browser check**

Run: `node --test tests/legacy/`
Expected: PASS. Open `binding_calculator.html` via the local server, set stepwise model, n=2, α=0.1, P1=10 nM, P2=50 nM, Kd=100 nM, and confirm the "[P1 with n P2]" tile equals the species-table row for k=2.

- [ ] **Step 6: Commit**

```bash
git add binding_engine.js binding_calculator.html tests/legacy/binding.test.js
git commit -m "fix(legacy): binding tiles and target solver use the exact cooperative model"
```

---

### Task 8: Gel densitometry crop offset

**Files:**
- Modify: `gel_annotator.html:783-784`
- Test: manual (the function reads a canvas; no node test in Phase 0. A synthetic-gel test comes with the Phase 4 rewrite.)

- [ ] **Step 1: Apply the fix**

```js
      const sx = gel.crop.x + (x - gr.x) / scale;
      const sy = gel.crop.y + (y - gr.y) / scale;
```

and round the region passed to `getImageData`:

```js
          const data = gel.rotCtx.getImageData(Math.round(sx), Math.round(sy), Math.max(1, Math.round(sw)), Math.max(1, Math.round(sh))).data;
```

- [ ] **Step 2: Browser check**

Load a gel image, draw a densitometry box over a band, note the value; crop the gel from the top by ~100 px; re-measure the same band. Before the fix the value changes to a different region's signal; after the fix it stays within a few percent.

- [ ] **Step 3: Commit**

```bash
git add gel_annotator.html
git commit -m "fix(legacy): densitometry sampled the wrong region after cropping"
```

---

### Task 9: CI runs the legacy tests; deploy ships the new JS file

**Files:**
- Create: `.github/workflows/ci.yml`
- Modify: `.github/workflows/static.yml` (no change needed: it already copies `*.js`; verify)
- Modify: `README.md` (add a "Science status" note pointing to `docs/science-audit-2026-09-02.md` and how to run tests)

- [ ] **Step 1: Create the CI workflow**

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
        with: { node-version: 22 }
      - run: node --test tests/legacy/
```

- [ ] **Step 2: README addition**

Append:

```markdown
## Science status

A full audit of every calculation (2026-09-02) is in `docs/science-audit-2026-09-02.md`.
All confirmed errors are fixed and guarded by `node --test tests/legacy/`.
The suite is being rebuilt as Bio-Bench; see `docs/superpowers/specs/2026-09-02-bio-bench-rebuild-design.md`.
```

- [ ] **Step 3: Run the full suite one last time**

Run: `node --test tests/legacy/`
Expected: all PASS.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/ci.yml README.md docs/
git commit -m "ci: run legacy science tests; document audit and rebuild plan"
```
