# Gel Analyzer Research-Grade Quantification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the gel analyzer's numbers defensible (Part A) and add condition/replicate quantification with statistics and reproducible exports (Part B).

**Architecture:**
- Algorithms stay pure and DOM-free in `src/core/gel/`, each with known-answer vitest tests.
- UI-level pure helpers (data-quality issues, lane-metadata patterns, export tables) go in `src/tools/gel/*.ts` with their own tests.
- Preact hooks in `src/tools/gel/workspace/` wire them together, composed by `useGelWorkspace`.
- The persisted project schema goes to version 2 and still reads version 1.

**Tech Stack:** TypeScript, Preact (+ `@preact/signals` via `useUrlState`), Tailwind, Vitest + @testing-library/preact, Playwright e2e.

**Spec:** `docs/superpowers/specs/2026-09-28-gel-research-analysis-design.md`

## Global Constraints

- Saturation: one threshold, `SATURATION_WARN = 0.01` in `src/core/gel/quant.ts`. A band is saturated when **more than** 1 % of its pixels are clipped (`> SATURATION_WARN`).
- No silently fabricated or defaulted value may reach the table, charts or CSV. Unknown values are `null`, shown as "–", and exported as an empty cell.
- LOD = 3.3·σ and LOQ = 10·σ, with σ the residual SD of the mass fit in mass units (n − p degrees of freedom), following ICH Q2. For a linear model this equals 3.3·σ_net/slope as written in the spec. Both are `null` when fewer than 3 points or n − p < 1.
- Welch t-test p-values are two-sided and Holm-adjusted. They are only reported when both groups have n ≥ 2.
- Sample SD uses n − 1. With n < 2 the SD is `null`.
- A 90° rotation or a flip must be an exact index remap.
- Old saved projects (schema 1) and old share links (`calibMethod: 'spline'`) must still open.
- Run commands with `npx vitest run <path>`. The full gate is `npm run typecheck && npm run lint && npm test`.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Ladder lane with more detected peaks than ladder sizes (smears, dye front).** Expect the most prominent peaks to be kept and a sensible match. Pinned by the "noise peaks beyond m + 2" test in Task 5.
2. **Uncalibrated gel (no ladder, fewer than 2 ladder bands) in the Groups view.** Target and control must be selectable by Rf and the stats must still compute. Pinned in Task 13 (`resolveLaneValues` with `sizeEst: null`).
3. **Every lane of a condition excluded, or all values null.** The summary must show n = 0 with "–" and never produce NaN. Pinned in Task 11.
4. **Control condition missing, or its mean is 0.** Fold change and tests must be `null`, not Infinity. Pinned in Task 11.
5. **An old project (schema 1) holding `calibMethod: 'spline'`.** It must open with the monotone spline and empty lane metadata. Pinned in Task 12.

---

## File map

| File | Change |
|---|---|
| `src/core/gel/transform.ts` | exact fast path for multiples of 90° and for flips |
| `src/lib/image.ts` | `rescaled` flag, `SourceInfo`, `sourceInfoOf` |
| `src/core/gel/quant.ts` | `isSaturated` helper |
| `src/core/gel/calibration.ts` | monotone spline (`'monotone'`); mass `range`, `residualSD`, `lod`, `loq`, `massFlags`; `assignLadder` removed |
| `src/core/gel/ladder-match.ts` (new) | `matchLadder` |
| `src/core/gel/background.ts` | true rolling ball, shared baseline for unequal lanes, ROI removed |
| `src/core/gel/groups.ts` (new) | `normalizeLaneValue`, `welchTTest`, `holmAdjust`, `summarizeGroups` |
| `src/tools/gel/lane-meta.ts` (new) | `LaneMeta`, `defaultLaneMeta`, `assignByPattern`, `laneRole` |
| `src/tools/gel/quality.ts` (new) | `dataQualityIssues` |
| `src/tools/gel/export-tables.ts` (new) | `tidyRows`, `groupSummaryRows`, `calibrationRows`, `methodsText` |
| `src/tools/gel/analysis.ts` | metric type (nullable `ratio`/`saturation`, ladder fields, mass flags, baseline warning); local `SATURATION_WARN` removed |
| `src/tools/gel/workspace-model.ts` | `calibMethod` `'monotone'`, `migrateState`, group settings, `quantSubView: 'groups'` |
| `src/tools/gel/workspace/core.ts` | `sourceInfo`, `appliedTransforms`, `ladderSizeMap`, `laneMeta` state |
| `src/tools/gel/workspace/image.ts` | records `SourceInfo` and the transforms |
| `src/tools/gel/workspace/analysis.ts` | matcher, overrides, mass flags, nullable ratio, baseline warnings, sample SD |
| `src/tools/gel/workspace/groups.ts` (new) | `useGelGroups` |
| `src/tools/gel/workspace/exports.ts` | new CSVs and methods text; old CSVs removed |
| `src/tools/gel/project.ts`, `workspace/project.ts` | schema 2 |
| `src/tools/gel/GelGroupsView.tsx` (new), `DataQualityPanel.tsx` (new) | UI |
| `GelQuantTab.tsx`, `GelImageTab.tsx`, `GelControls.tsx`, `GelCalibrationTab.tsx`, `science.ts`, `workspace.ts` | wiring and labels |

---

### Task 1: Exact 90° rotation and flip

The bug, measured on a 5×3 plane:
- `transformPlane(p, {rotation: 90})` returns a **4×5** plane with interpolated values (8.5, 9.5…) and padding (1.0).
- `flipH` shifts by one column and pads one column with 1.0.

Crop is already exact.

**Files:**
- Modify: `src/core/gel/transform.ts` (`transformPlane`, near line 92)
- Test: `tests/core/gel-transform.test.ts` (append)

**Interfaces:**
- Produces: `transformPlane(raw, g)` returns exact remaps when `g.rotation` is a multiple of 90 (±360 wrapped) and `g.crop` is absent or integer-aligned. Signature unchanged.

- [ ] **Step 1: Write the failing test.** Append to `tests/core/gel-transform.test.ts`:

```ts
import { transformPlane } from '@/core/gel/transform';

describe('exact right-angle transforms', () => {
  const w = 5, h = 3;
  const p = { width: w, height: h, data: Float32Array.from({ length: w * h }, (_, i) => i) };
  const at = (q: { width: number; data: Float32Array }, x: number, y: number) => q.data[y * q.width + x];

  it('rotates 90° CCW (as seen on screen) exactly', () => {
    const o = transformPlane(p, { rotation: 90, flipH: false, flipV: false });
    expect([o.width, o.height]).toEqual([3, 5]);
    // every output value is an original value (no interpolation, no padding)
    expect(new Set(o.data)).toEqual(new Set(p.data));
  });
  it('rotates 180° exactly', () => {
    const o = transformPlane(p, { rotation: 180, flipH: false, flipV: false });
    expect([o.width, o.height]).toEqual([5, 3]);
    expect(at(o, 0, 0)).toBe(at(p, 4, 2));
    expect(at(o, 4, 2)).toBe(at(p, 0, 0));
  });
  it('rotation by 90 then 270 is the identity', () => {
    const a = transformPlane(p, { rotation: 90, flipH: false, flipV: false });
    const b = transformPlane(a, { rotation: 270, flipH: false, flipV: false });
    expect(Array.from(b.data)).toEqual(Array.from(p.data));
  });
  it('flips horizontally and vertically exactly', () => {
    const fh = transformPlane(p, { rotation: 0, flipH: true, flipV: false });
    expect(Array.from(fh.data.slice(0, 5))).toEqual([4, 3, 2, 1, 0]);
    const fv = transformPlane(p, { rotation: 0, flipH: false, flipV: true });
    expect(Array.from(fv.data.slice(0, 5))).toEqual([10, 11, 12, 13, 14]);
  });
  it('the direction of 90° matches the general path', () => {
    // A tiny non-right angle uses the bilinear path; 90° must turn the same way as 89.9°.
    const big = { width: 41, height: 21, data: Float32Array.from({ length: 41 * 21 }, (_, i) => (i % 41) / 40) };
    const exact = transformPlane(big, { rotation: 90, flipH: false, flipV: false });
    const approx = transformPlane(big, { rotation: 89.9, flipH: false, flipV: false });
    const cx = Math.floor(exact.width / 2), cy = 2;
    const ax = Math.floor(approx.width / 2), ay = 2 + Math.round((approx.height - exact.height) / 2);
    expect(Math.abs(exact.data[cy * exact.width + cx]! - approx.data[ay * approx.width + ax]!)).toBeLessThan(0.1);
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails.** Run `npx vitest run tests/core/gel-transform.test.ts`. Expected: FAIL (4×5 size, padding values).

- [ ] **Step 3: Implement the fast path.** In `transformPlane`, before the general loop:

```ts
/** Exact index remap for rotations by multiples of 90° and flips (no interpolation). Null when not applicable. */
function rightAngleRemap(raw: Plane, g: Geometry): Plane | null {
  const q = ((Math.round(g.rotation / 90) % 4) + 4) % 4;
  if (Math.abs(g.rotation - Math.round(g.rotation / 90) * 90) > 1e-9) return null;
  const W = raw.width, H = raw.height;
  const w = q % 2 ? H : W, h = q % 2 ? W : H;
  let out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      // Source pixel for output (x, y). Counter-clockwise on screen with y down, matching rotate(deg).
      let sx: number, sy: number;
      if (q === 0) { sx = x; sy = y; }
      else if (q === 1) { sx = W - 1 - y; sy = x; }
      else if (q === 2) { sx = W - 1 - x; sy = H - 1 - y; }
      else { sx = y; sy = H - 1 - x; }
      out[y * w + x] = raw.data[sy * W + sx]!;
    }
  }
  if (g.flipH) { const f = new Float32Array(w * h); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) f[y * w + x] = out[y * w + (w - 1 - x)]!; out = f; }
  if (g.flipV) { const f = new Float32Array(w * h); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) f[y * w + x] = out[(h - 1 - y) * w + x]!; out = f; }
  let plane: Plane = { width: w, height: h, data: out };
  if (g.crop) {
    const c = g.crop;
    if (![c.x, c.y, c.w, c.h].every(Number.isInteger)) return null;
    const cw = c.w, ch = c.h, cropped = new Float32Array(cw * ch);
    for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
      const sx = c.x + x, sy = c.y + y;
      cropped[y * cw + x] = sx >= 0 && sy >= 0 && sx < w && sy < h ? out[sy * w + sx]! : 1;
    }
    plane = { width: cw, height: ch, data: cropped };
  }
  return plane;
}
```

  Then, as the first line of `transformPlane`: `const exact = rightAngleRemap(raw, g); if (exact) return exact;`

  If the direction test fails, swap the `q === 1` and `q === 3` branches. The test pins the direction to match the existing `rotate(deg)` convention used by deskew.

- [ ] **Step 4: Run the transform tests and the whole gel suite.** Run `npx vitest run tests/core/gel-transform.test.ts tests/core/gel-autocrop.test.ts tests/app/gel.test.tsx`. Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add src/core/gel/transform.ts tests/core/gel-transform.test.ts
git commit -m "fix(gel): exact index remap for 90° rotations and flips

Right-angle rotation returned a wrong-sized, interpolated, padded plane and
flips lost a column; quantification now sees the original pixels.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Source info from the decoder

**Files:**
- Modify: `src/lib/image.ts`
- Test: `tests/lib/image-source-info.test.ts` (create)

**Interfaces:**
- Produces:

```ts
export interface SourceInfo { format: DecodedImage['format'] | 'demo'; bitDepth: 8 | 16 | 32; lossy: boolean; rescaled: boolean }
export function sourceInfoOf(d: Pick<DecodedImage, 'format' | 'bitDepth' | 'rescaled'>): SourceInfo
// DecodedImage gains: rescaled: boolean
```

- [ ] **Step 1: Write the failing test.** Create `tests/lib/image-source-info.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { sourceInfoOf } from '@/lib/image';

describe('sourceInfoOf', () => {
  it('flags JPEG and WebP as lossy', () => {
    expect(sourceInfoOf({ format: 'jpeg', bitDepth: 8, rescaled: false }).lossy).toBe(true);
    expect(sourceInfoOf({ format: 'webp', bitDepth: 8, rescaled: false }).lossy).toBe(true);
    expect(sourceInfoOf({ format: 'png', bitDepth: 8, rescaled: false }).lossy).toBe(false);
  });
  it('passes the rescaled flag of float TIFF through', () => {
    expect(sourceInfoOf({ format: 'tiff', bitDepth: 32, rescaled: true })).toEqual({ format: 'tiff', bitDepth: 32, lossy: false, rescaled: true });
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails.** Run `npx vitest run tests/lib/image-source-info.test.ts`. Expected: FAIL, "sourceInfoOf is not a function".

- [ ] **Step 3: Implement.** In `src/lib/image.ts`:
  - Add `rescaled: boolean` to `DecodedImage`, documented as "true when values were min–max normalized (32-bit float TIFF); saturation cannot be judged".
  - In `decodeTiff`, track `let rescaled = false;` and set `rescaled = true` in the float branch. Return `{ ..., rescaled }`.
  - In `decodeImageFile`'s browser path, return `rescaled: false`.
  - Add:

```ts
export interface SourceInfo { format: DecodedImage['format'] | 'demo'; bitDepth: 8 | 16 | 32; lossy: boolean; rescaled: boolean }
/** What the analysis needs to know about where the pixels came from (JPEG/WebP may be lossy; float TIFF is rescaled). */
export function sourceInfoOf(d: Pick<DecodedImage, 'format' | 'bitDepth' | 'rescaled'>): SourceInfo {
  return { format: d.format, bitDepth: d.bitDepth, lossy: d.format === 'jpeg' || d.format === 'webp', rescaled: d.rescaled };
}
```

- [ ] **Step 4: Run the test and the decoder suites.** Run `npx vitest run tests/lib`. Expected: PASS. Fix any other `DecodedImage` literal in tests that TypeScript flags (`npm run typecheck`).

- [ ] **Step 5: Commit.** Message: `feat(image): report source format, lossiness and float rescaling`, plus the trailer.

---

### Task 3: One saturation threshold, nullable when not assessable

**Files:**
- Modify: `src/core/gel/quant.ts`, `src/tools/gel/analysis.ts`, `src/tools/gel/GelQuantTab.tsx` (lines ~546 and ~636), `src/tools/gel/workspace/exports.ts` (line ~151), `src/tools/gel/workspace/core.ts`, `src/tools/gel/workspace/image.ts`, `src/tools/gel/workspace/analysis.ts`
- Test: `tests/core/gel-synthetic.test.ts` (append)

**Interfaces:**
- Produces:
  - `isSaturated(fraction: number | null): boolean` in `core/gel/quant.ts`, true iff `fraction !== null && fraction > SATURATION_WARN`.
  - `LaneAnalysisItem['metrics'][number].saturation: number | null`.
  - `GelCore.sourceInfo: SourceInfo | null`.
  - `GelCore.appliedTransforms: string[]` and `setAppliedTransforms`.

- [ ] **Step 1: Write the failing test.** Append to `tests/core/gel-synthetic.test.ts`:

```ts
import { isSaturated, SATURATION_WARN } from '@/core/gel/quant';
describe('saturation threshold', () => {
  it('is more than 1 % of pixels, and null means not assessable', () => {
    expect(SATURATION_WARN).toBe(0.01);
    expect(isSaturated(0.01)).toBe(false);
    expect(isSaturated(0.0101)).toBe(true);
    expect(isSaturated(null)).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails.** Run `npx vitest run tests/core/gel-synthetic.test.ts`. Expected: FAIL, "isSaturated is not a function".

- [ ] **Step 3: Implement.**
  1. In `core/gel/quant.ts`, below `SATURATION_WARN`:

     ```ts
     /** A band is saturated when more than SATURATION_WARN of its pixels are clipped; null (not assessable) is never saturated. */
     export const isSaturated = (fraction: number | null) => fraction !== null && fraction > SATURATION_WARN;
     ```

  2. In `tools/gel/analysis.ts`:
     - Delete `export const SATURATION_WARN = 0.05;`.
     - Change the metrics element type to `Omit<BandMetrics, 'saturation'> & { saturation: number | null; number: number; share: number; ratio: number; sizeEst: number | null; massEst: number | null }`. Task 9 changes `ratio`.

  3. In `workspace/core.ts`, add state:

     ```ts
     import type { SourceInfo } from '@/lib/image';
     // Where the pixels came from and what was done to them (data-quality panel, methods text).
     const [sourceInfo, setSourceInfo] = useState<SourceInfo | null>(null);
     const [appliedTransforms, setAppliedTransforms] = useState<string[]>([]);
     ```

     Return all four names.

  4. In `workspace/image.ts`:
     - **`handleFileUpload`:** after decoding, `setSourceInfo(sourceInfoOf(decoded)); setAppliedTransforms([]);`.
     - **`loadDemo`:** `setSourceInfo({ format: 'demo', bitDepth: 32, lossy: false, rescaled: false }); setAppliedTransforms([]);`.
     - **`applyRotation`:** append `setAppliedTransforms(t => [...t, \`rotate ${deltaDeg}° (exact)\`])`.
     - **`applyFlip`:** append ``setAppliedTransforms(t => [...t, `flip ${horizontal ? 'horizontal' : 'vertical'} (exact)`])``.
     - **`handleApplyCrop`:** append `'crop (exact)'`.
     - **`handleApplySuggestion`:** append ``auto crop + deskew ${angle.toFixed(2)}° (resampled)`` (use the rotation value the function applies).
     - **`handleResetAllTransforms`:** `setAppliedTransforms([])`.

  5. In `workspace/analysis.ts`, inside the enriched metrics map: `saturation: core.sourceInfo?.rescaled ? null : m.saturation`. Add `core.sourceInfo` to the memo deps.

  6. In `GelQuantTab.tsx`:
     - Replace the import `SATURATION_WARN` with `import { isSaturated } from '@/core/gel/quant';`.
     - Replace both `m.saturation >= SATURATION_WARN` with `isSaturated(m.saturation)`.

  7. In `workspace/exports.ts`, replace the Saturated cell with `m.saturation === null ? 'N/A' : isSaturated(m.saturation) ? 'YES' : 'NO'`. This file is rewritten in Task 14; this keeps it compiling now.

- [ ] **Step 4: Run the tests, typecheck and the gel suites.** Run `npx vitest run tests/core/gel-synthetic.test.ts tests/app/gel*.test.tsx && npm run typecheck`. Expected: PASS. If an app test asserted the 5 % behaviour, update it to 1 % and note that in the commit body.

- [ ] **Step 5: Commit.** Message: `fix(gel): one 1 % saturation threshold; not assessable for rescaled float images`, plus the trailer.

---

### Task 4: Monotone calibration spline

**Files:**
- Modify: `src/core/gel/calibration.ts`, `src/tools/gel/workspace-model.ts`, `src/tools/gel/workspace/core.ts`, `src/tools/gel/GelControls.tsx:418-423`, `src/tools/gel/GelCalibrationTab.tsx:134-139`, `tests/core/gel-calibration.test.ts:27-33`, `tests/app/gel-band-ladder.test.tsx:219-221`, `tests/e2e/layout-fix.spec.ts:23`
- Test: `tests/core/gel-calibration.test.ts`

**Interfaces:**
- Produces:
  - `CalibrationModel = 'linear' | 'piecewise' | 'monotone'`
  - `State.calibMethod: CalibrationModel`
  - `migrateState(v: State): State` in `workspace-model.ts`

- [ ] **Step 1: Write the failing test.** In `tests/core/gel-calibration.test.ts`, replace the "natural cubic spline" test with:

```ts
  it('interpolates with the monotone cubic model', () => {
    const cal = fitCalibration(points, 'monotone');
    for (const q of points) expect(cal.sizeAt(q.y)).toBeCloseTo(q.size, 6);
  });

  it('monotone cubic never overshoots between unevenly spaced bands', () => {
    // A natural spline overshoots here: a tight pair of bands next to a long gap.
    const pts = [{ y: 0, size: 100 }, { y: 10, size: 79.4 }, { y: 12, size: 15.8 }, { y: 100, size: 10 }];
    const cal = fitCalibration(pts, 'monotone');
    let prev = Infinity;
    for (let y = 0; y <= 100; y += 0.25) {
      const s = cal.sizeAt(y);
      expect(s).toBeLessThanOrEqual(prev + 1e-9);
      prev = s;
    }
    for (let i = 0; i < pts.length - 1; i++) {
      const mid = cal.sizeAt((pts[i]!.y + pts[i + 1]!.y) / 2);
      expect(mid).toBeLessThanOrEqual(pts[i]!.size);
      expect(mid).toBeGreaterThanOrEqual(pts[i + 1]!.size);
    }
    expect(cal.yAt(cal.sizeAt(50))).toBeCloseTo(50, 3);
  });
```

  Also append to the `workspace-model` tests. Create `tests/app/gel-model.test.ts` if no such file exists:

```ts
import { describe, it, expect } from 'vitest';
import { migrateState, DEFAULTS } from '@/tools/gel/workspace-model';
describe('gel state migration', () => {
  it("maps the old 'spline' model to 'monotone'", () => {
    expect(migrateState({ ...DEFAULTS, calibMethod: 'spline' as never }).calibMethod).toBe('monotone');
    expect(migrateState(DEFAULTS)).toBe(DEFAULTS);
  });
});
```

- [ ] **Step 2: Run the tests and confirm they fail.** Run `npx vitest run tests/core/gel-calibration.test.ts tests/app/gel-model.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement.** In `calibration.ts`:
  - Replace `naturalSpline` with the function below.
  - Change the type to `'linear' | 'piecewise' | 'monotone'`.
  - In `fitCalibration`: `const need = model === 'monotone' ? 3 : 2;` and `... : monotoneCubic(p)`.
  - Update the header comment to "monotone piecewise cubic Hermite (Fritsch & Carlson 1980, SIAM J Numer Anal 17:238)".

```ts
/** Monotone piecewise cubic Hermite interpolant (Fritsch–Carlson); linear extrapolation with the end slopes. */
function monotoneCubic(p: CalibrationPoint[]): (y: number) => number {
  const n = p.length;
  if (n < 3) return piecewise(p);
  const x = p.map(q => q.y), a = p.map(q => Math.log10(q.size));
  const h = Array.from({ length: n - 1 }, (_, i) => x[i + 1]! - x[i]!);
  const dlt = Array.from({ length: n - 1 }, (_, i) => (a[i + 1]! - a[i]!) / h[i]!);
  const m = new Array<number>(n);
  m[0] = dlt[0]!; m[n - 1] = dlt[n - 2]!;
  for (let i = 1; i < n - 1; i++) m[i] = dlt[i - 1]! * dlt[i]! <= 0 ? 0 : (dlt[i - 1]! + dlt[i]!) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (dlt[i] === 0) { m[i] = 0; m[i + 1] = 0; continue; }
    const al = m[i]! / dlt[i]!, be = m[i + 1]! / dlt[i]!;
    const s = al * al + be * be;
    if (s > 9) { const t = 3 / Math.sqrt(s); m[i] = t * al * dlt[i]!; m[i + 1] = t * be * dlt[i]!; }
  }
  return (y: number) => {
    if (y <= x[0]!) return a[0]! + m[0]! * (y - x[0]!);
    if (y >= x[n - 1]!) return a[n - 1]! + m[n - 1]! * (y - x[n - 1]!);
    let i = 0;
    while (i < n - 2 && y > x[i + 1]!) i++;
    const t = (y - x[i]!) / h[i]!, t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * a[i]! + (t3 - 2 * t2 + t) * h[i]! * m[i]! + (-2 * t3 + 3 * t2) * a[i + 1]! + (t3 - t2) * h[i]! * m[i + 1]!;
  };
}
```

  In `workspace-model.ts`:
  - Import `type CalibrationModel` and set `calibMethod: CalibrationModel;`.
  - Add:

```ts
/** Upgrade settings from old links and projects: the former natural 'spline' model is now the monotone cubic. */
export function migrateState(v: State): State {
  return (v.calibMethod as string) === 'spline' ? { ...v, calibMethod: 'monotone' } : v;
}
```

  In `workspace/core.ts`:
  - `const s = migrateState(stateSig.value);`
  - `const set = (patch: Partial<State>) => { stateSig.value = { ...migrateState(stateSig.value), ...patch }; };`

  UI option values:
  - `GelControls.tsx` and `GelCalibrationTab.tsx`: change `value="spline"` to `value="monotone"`, label "Monotone cubic spline", and the cast to `CalibrationModel`.
  - `tests/app/gel-band-ladder.test.tsx` lines 219–221 and `tests/e2e/layout-fix.spec.ts:23`: change `'spline'` to `'monotone'`.

- [ ] **Step 4: Run the tests and typecheck.** Run `npx vitest run tests/core/gel-calibration.test.ts tests/app/gel-model.test.ts tests/app/gel-band-ladder.test.tsx && npm run typecheck`. Expected: PASS.

- [ ] **Step 5: Commit.** Message: `fix(gel): real monotone cubic calibration (was a natural spline labelled monotone)`, plus the trailer.

---

### Task 5: Ladder matcher (core)

**Files:**
- Create: `src/core/gel/ladder-match.ts`
- Modify: `src/core/gel/calibration.ts` (delete `assignLadder`), `tests/core/gel-calibration.test.ts` (delete its `assignLadder` test and import)
- Test: `tests/core/gel-ladder-match.test.ts`

**Interfaces:**
- Produces:

```ts
export interface LadderPeak { y: number; prominence: number; id?: string }
export interface LadderPair { y: number; size: number; peakIndex: number; id?: string }
export interface LadderMatch { pairs: LadderPair[]; skippedPeaks: number[]; skippedSizes: number[]; residualSD: number }
export function matchLadder(peaks: LadderPeak[], sizes: number[]): LadderMatch | null
```

  `peakIndex` indexes the input `peaks` array. The function returns null when fewer than 3 pairs are possible.

- [ ] **Step 1: Write the failing test.** Create `tests/core/gel-ladder-match.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { matchLadder } from '@/core/gel/ladder-match';

// Bio-Rad Precision Plus sizes (kDa), unevenly spaced in log space.
const SIZES = [250, 150, 100, 75, 50, 37, 25, 20, 15, 10];
const yOf = (s: number) => 400 - 150 * Math.log10(s); // exact log-linear migration
const peaksFor = (sizes: number[]) => sizes.map(s => ({ y: yOf(s), prominence: 1 }));

describe('matchLadder', () => {
  it('pairs a complete ladder one-to-one', () => {
    const m = matchLadder(peaksFor(SIZES), SIZES)!;
    expect(m.pairs.map(p => p.size)).toEqual(SIZES);
    expect(m.residualSD).toBeLessThan(1e-9);
  });
  it('recovers when a middle band was not detected', () => {
    const detected = SIZES.filter(s => s !== 50);
    const m = matchLadder(peaksFor(detected), SIZES)!;
    expect(m.skippedSizes.map(i => SIZES[i])).toEqual([50]);
    for (const p of m.pairs) expect(yOf(p.size)).toBeCloseTo(p.y, 6);
  });
  it('skips a spurious extra peak', () => {
    const peaks = peaksFor(SIZES);
    peaks.splice(5, 0, { y: (yOf(50) + yOf(37)) / 2, prominence: 0.3 });
    const m = matchLadder(peaks, SIZES)!;
    expect(m.skippedPeaks).toEqual([5]);
    expect(m.pairs.map(p => p.size)).toEqual(SIZES);
  });
  it('keeps the most prominent peaks when there are many noise peaks', () => {
    const peaks = peaksFor(SIZES);
    for (let k = 0; k < 8; k++) peaks.push({ y: 20 + k * 45.3, prominence: 0.01 });
    peaks.sort((a, b) => a.y - b.y);
    const m = matchLadder(peaks, SIZES)!;
    expect(m.pairs.map(p => p.size)).toEqual(SIZES);
  });
  it('returns null with fewer than 3 possible pairs', () => {
    expect(matchLadder(peaksFor([250, 150]), SIZES)).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails.** Run `npx vitest run tests/core/gel-ladder-match.test.ts`. Expected: FAIL (module not found).

- [ ] **Step 3: Implement.** Create `src/core/gel/ladder-match.ts`:

```ts
/* Ladder band matching: pair detected ladder peaks (top → bottom) with ladder sizes (large → small) so that a missed
 * or an extra band does not shift every later assignment. Candidates are monotone alignments that skip a few peaks
 * and/or sizes; the winner has the smallest log-linear residual SD, with a small penalty per avoidable skip. */

export interface LadderPeak { y: number; prominence: number; id?: string }
export interface LadderPair { y: number; size: number; peakIndex: number; id?: string }
export interface LadderMatch { pairs: LadderPair[]; skippedPeaks: number[]; skippedSizes: number[]; residualSD: number }

/** Penalty in log10 units per skip beyond the unavoidable |peaks − sizes|. */
const SKIP_PENALTY = 0.01;
const MAX_EXTRA_SKIPS = 2;
const MAX_EVALUATIONS = 500_000;

function* combinations(n: number, k: number): Generator<number[]> {
  const idx = Array.from({ length: k }, (_, i) => i);
  if (k > n) return;
  while (true) {
    yield idx.slice();
    let i = k - 1;
    while (i >= 0 && idx[i] === n - k + i) i--;
    if (i < 0) return;
    idx[i]!++;
    for (let j = i + 1; j < k; j++) idx[j] = idx[j - 1]! + 1;
  }
}

function logLinearSD(ys: number[], logs: number[]): number {
  const n = ys.length;
  let sx = 0, sy = 0, sxx = 0, sxy = 0;
  for (let i = 0; i < n; i++) { sx += ys[i]!; sy += logs[i]!; sxx += ys[i]! ** 2; sxy += ys[i]! * logs[i]!; }
  const den = n * sxx - sx * sx;
  const slope = den === 0 ? 0 : (n * sxy - sx * sy) / den, icpt = (sy - slope * sx) / n;
  let ss = 0;
  for (let i = 0; i < n; i++) ss += (logs[i]! - icpt - slope * ys[i]!) ** 2;
  return n > 2 ? Math.sqrt(ss / (n - 2)) : 0;
}

export function matchLadder(peaks: LadderPeak[], sizes: number[]): LadderMatch | null {
  const order = sizes.map((s, i) => ({ s, i })).filter(q => q.s > 0).sort((a, b) => b.s - a.s);
  // Keep at most sizes + 2 peaks, the most prominent, then back in migration order.
  let cand = peaks.map((p, i) => ({ ...p, i }));
  if (cand.length > order.length + MAX_EXTRA_SKIPS) cand = [...cand].sort((a, b) => b.prominence - a.prominence).slice(0, order.length + MAX_EXTRA_SKIPS);
  cand.sort((a, b) => a.y - b.y);
  const n = cand.length, m = order.length, full = Math.min(n, m);
  const kMin = Math.max(3, full - MAX_EXTRA_SKIPS);
  if (full < 3) return null;
  let best: { score: number; pi: number[]; si: number[]; sd: number } | null = null;
  let evals = 0;
  for (let k = full; k >= kMin; k--) {
    for (const pi of combinations(n, k)) {
      const ys = pi.map(i => cand[i]!.y);
      for (const si of combinations(m, k)) {
        if (++evals > MAX_EVALUATIONS) break;
        const sd = logLinearSD(ys, si.map(i => Math.log10(order[i]!.s)));
        const score = sd + SKIP_PENALTY * ((n - k) + (m - k) - Math.abs(n - m));
        if (!best || score < best.score - 1e-12) best = { score, pi, si, sd };
      }
    }
  }
  if (!best) return null;
  const usedP = new Set(best.pi.map(i => cand[i]!.i)), usedS = new Set(best.si.map(i => order[i]!.i));
  return {
    pairs: best.pi.map((ci, j) => ({ y: cand[ci]!.y, size: order[best!.si[j]!]!.s, peakIndex: cand[ci]!.i, id: cand[ci]!.id })),
    skippedPeaks: peaks.map((_, i) => i).filter(i => !usedP.has(i)),
    skippedSizes: sizes.map((_, i) => i).filter(i => sizes[i]! > 0 && !usedS.has(i)),
    residualSD: best.sd,
  };
}
```

  `skippedSizes` indexes the input `sizes`. The test's `SIZES[i]` relies on that.

  Delete `assignLadder` from `calibration.ts` and remove its import and test block in `tests/core/gel-calibration.test.ts`. Keep `formatSize` assertions by moving them into their own `it`.

- [ ] **Step 4: Run the tests.** Run `npx vitest run tests/core/gel-ladder-match.test.ts tests/core/gel-calibration.test.ts`. Expected: PASS. Also run `grep -rn assignLadder src tests`. Expected: no hits.

- [ ] **Step 5: Commit.** Message: `feat(gel): ladder matcher that tolerates missed and extra bands`, plus the trailer.

---

### Task 6: Use the matcher and manual size overrides in the workspace

**Files:**
- Modify: `src/tools/gel/workspace/core.ts`, `src/tools/gel/workspace/analysis.ts:17-51,136-141`, `src/tools/gel/analysis.ts` (metric type), `src/tools/gel/GelImageTab.tsx:391-437`
- Test: `tests/app/gel-band-ladder.test.tsx` (append)

**Interfaces:**
- Consumes: `matchLadder` (Task 5).
- Produces:
  - `GelCore.ladderSizeMap: Record<string, number | null>` and `setLadderSizeMap`.
  - Metric fields `ladderAssigned: number | null`, `sizeResidualPct: number | null`. `sizeEst` is always the **fitted** size.
  - `GelAnalysis.ladderMatch: LadderMatch | null`.

- [ ] **Step 1: Write the failing app test.** Append to `tests/app/gel-band-ladder.test.tsx`, following that file's existing render/setup helpers:

```tsx
it('ladder lane shows the fitted size and residual, not a nominal size by index', async () => {
  render(<GelView />);
  // demo gel: lane 1 is the ladder lane and the Gel tab band table shows the selected (ladder) lane
  expect(screen.queryByText('Std Ladder')).toBeNull();
  expect(screen.getAllByText(/Assigned/i).length).toBeGreaterThan(0);
  expect(screen.getAllByText(/Δ\s*-?\d+(\.\d)?%/).length).toBeGreaterThan(0);
});
```

- [ ] **Step 2: Run the test and confirm it fails.** Run `npx vitest run tests/app/gel-band-ladder.test.tsx`. Expected: FAIL ("Std Ladder" still present).

- [ ] **Step 3: Implement.**

  1. In `core.ts`, add state:

     ```ts
     // Manual ladder overrides: a number pins that band's size, null excludes the band from calibration.
     const [ladderSizeMap, setLadderSizeMap] = useState<Record<string, number | null>>({});
     ```

     Return both names. In `image.ts` `handleFileUpload` and `loadDemo`, call `setLadderSizeMap({})`.

  2. In `workspace/analysis.ts`, replace the pairing block (lines 34–48) with:

     ```ts
     const sortedBands = [...bands].sort((a, b) => (a.peakY ?? 0) - (b.peakY ?? 0));
     const pinned: CalibrationPoint[] = [];
     const free: LadderPeak[] = [];
     for (const b of sortedBands) {
       const y = b.peakY ?? (b.y0 + b.y1) / 2;
       const o = ladderSizeMap[b.id];
       if (o === null) continue;              // excluded by the user
       if (typeof o === 'number') pinned.push({ y, size: o });
       else free.push({ y, prominence: 1, id: b.id });
     }
     const pinnedSizes = new Set(pinned.map(p => p.size));
     const match = matchLadder(free, activeLadder.sizes.filter(sz => !pinnedSizes.has(sz)));
     const pairs = [...pinned, ...(match?.pairs ?? []).map(p => ({ y: p.y, size: p.size }))];
     const assigned: Record<string, number> = {};
     for (const b of sortedBands) {
       const o = ladderSizeMap[b.id];
       if (typeof o === 'number') assigned[b.id] = o;
     }
     for (const p of match?.pairs ?? []) if (p.id) assigned[p.id] = p.size;
     if (pairs.length < 2) return null;
     return { fit: fitCalibration(pairs, s.calibMethod), assigned, match };
     ```

     Rename the memo to `ladderFit` and derive `const calibration = ladderFit?.fit ?? null;` and `const ladderMatch = ladderFit?.match ?? null;`. Add `ladderSizeMap` to deps. Use the prominence of detected peaks when bands come from `detectBands`, via `toBands`' order; for manual bands use 1. Keep `prominence: 1` as written. Prominence only matters when there are more than m + 2 peaks, which the matcher trims.

  3. In `allLanesAnalysis`:
     - Delete `nominalLadderSize` and `sortedLadderSizes`.
     - Set `const sizeEst = calibration ? calibration.sizeAt(effMigrationY) : null;`.
     - Add:

       ```ts
       const ladderAssigned = isLadderLane ? (ladderFit?.assigned[m.bandId] ?? null) : null;
       const sizeResidualPct = ladderAssigned !== null && sizeEst !== null ? (sizeEst / ladderAssigned - 1) * 100 : null;
       ```

     - Include both in the returned metric.
     - Add the two fields to the metric type in `tools/gel/analysis.ts`.

  4. In `GelImageTab.tsx`, replace the `nominalStdSize` logic (lines 392–437):
     - Remove `sortedLadderSizes`, `sortedLaneMetrics`, `ladderBandIdx` and `nominalStdSize`.
     - For the size cell, render:

       ```tsx
       {isLadderLane ? (
         <div class="flex items-center gap-1.5">
           <label class="sr-only" for={`ladder-size-${m.bandId}`}>Assigned ladder size</label>
           <select
             id={`ladder-size-${m.bandId}`}
             class="rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-[11px] px-1 py-0.5"
             value={ladderSizeMap[m.bandId] === null ? 'exclude' : String(m.ladderAssigned ?? '')}
             onChange={e => {
               const v = (e.target as HTMLSelectElement).value;
               setLadderSizeMap(prev => ({ ...prev, [m.bandId]: v === 'exclude' ? null : v === '' ? undefined as never : Number(v) }));
             }}
           >
             <option value="">Auto</option>
             {[...activeLadder.sizes].sort((a, b) => b - a).map(sz => <option value={String(sz)}>{formatSize(sz, activeLadder.kind)}</option>)}
             <option value="exclude">Exclude</option>
           </select>
           <span class="text-[10px] text-slate-500 dark:text-slate-400">Assigned</span>
           {m.sizeEst !== null && <span class="mono text-[11px]">fit {formatSize(m.sizeEst, activeLadder.kind)}</span>}
           {m.sizeResidualPct !== null && (
             <span class={`mono text-[10px] ${Math.abs(m.sizeResidualPct) > 5 ? 'text-amber-700 dark:text-amber-400' : 'text-slate-500 dark:text-slate-400'}`}>
               Δ {m.sizeResidualPct.toFixed(1)}%
             </span>
           )}
         </div>
       ) : m.sizeEst ? ( /* existing sized span */ ) : ( /* existing Uncalibrated span */ )}
       ```

     - Choosing "Auto" must delete the key rather than store `undefined`. Implement it as:

       ```ts
       setLadderSizeMap(prev => { const n = { ...prev }; if (v === '') delete n[m.bandId]; else n[m.bandId] = v === 'exclude' ? null : Number(v); return n; })
       ```

     - Destructure `ladderSizeMap` and `setLadderSizeMap` from `g`.
     - Use `effectiveLadderLaneId` instead of `s.ladderLaneId` for `isLadderLane`.

- [ ] **Step 4: Run the tests.** Run `npx vitest run tests/app/gel-band-ladder.test.tsx tests/app/gel.test.tsx tests/core/gel-calibration.test.ts && npm run typecheck`. Expected: PASS.

- [ ] **Step 5: Commit.** Message: `feat(gel): robust ladder assignment with manual overrides; ladder lane shows fitted size and residual`, plus the trailer.

---

### Task 7: Mass calibration range, LOD/LOQ and per-value flags (core)

**Files:**
- Modify: `src/core/gel/calibration.ts` (`MassCalibration`, `fitMassCalibration`)
- Test: `tests/core/gel-mass-calibration.test.ts` (append)

**Interfaces:**
- Produces:

```ts
// MassCalibration gains:
range: { minMass: number; maxMass: number; minNet: number; maxNet: number };
residualSD: number | null;   // mass units, df = n − parameters
lod: number | null;          // 3.3·residualSD
loq: number | null;          // 10·residualSD
export interface MassFlags { extrapolated: boolean; belowLoq: boolean }
export function massFlags(cal: MassCalibration, net: number, mass: number): MassFlags
```

- [ ] **Step 1: Write the failing test.** The reference values were computed with numpy (`polyfit(net, mass, 1)`):

```ts
import { fitMassCalibration, massFlags } from '@/core/gel/calibration';
describe('mass calibration limits', () => {
  const pts = [[102, 10], [198, 20], [402, 40], [798, 80]].map(([net, mass], i) => ({ bandId: `b${i}`, netIntensity: net!, knownMass: mass! }));
  it('reports residual SD, LOD and LOQ (ICH Q2) for a linear fit', () => {
    const cal = fitMassCalibration(pts, 'linear');
    expect(cal.residualSD!).toBeCloseTo(0.25109, 4);
    expect(cal.lod!).toBeCloseTo(0.82858, 4);
    expect(cal.loq!).toBeCloseTo(2.51085, 4);
    expect(cal.range).toEqual({ minMass: 10, maxMass: 80, minNet: 102, maxNet: 798 });
  });
  it('has no LOD/LOQ with fewer than 3 points', () => {
    const cal = fitMassCalibration(pts.slice(0, 2), 'linear');
    expect(cal.lod).toBeNull();
    expect(cal.loq).toBeNull();
  });
  it('flags extrapolation and values below LOQ', () => {
    const cal = fitMassCalibration(pts, 'linear');
    expect(massFlags(cal, 900, cal.massAt(900))).toEqual({ extrapolated: true, belowLoq: false });
    expect(massFlags(cal, 300, cal.massAt(300))).toEqual({ extrapolated: false, belowLoq: false });
    expect(massFlags(cal, 20, 1.9)).toEqual({ extrapolated: true, belowLoq: true });
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails.** Run `npx vitest run tests/core/gel-mass-calibration.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement.** In `fitMassCalibration`, after computing `residuals` and `r2`:

```ts
  const params = model === 'linear_zero' ? 1 : model === 'quadratic' ? 3 : 2;
  const dof = valid.length - params;
  const residualSD = valid.length >= 3 && dof >= 1 ? Math.sqrt(ssRes / dof) : null;
  const nets = valid.map(p => p.netIntensity), masses = valid.map(p => p.knownMass);
  const range = { minMass: Math.min(...masses), maxMass: Math.max(...masses), minNet: Math.min(...nets), maxNet: Math.max(...nets) };
  return { model, points: valid, unit, r2, formula, massAt, residuals, coefficients: coeffs,
    range, residualSD, lod: residualSD === null ? null : 3.3 * residualSD, loq: residualSD === null ? null : 10 * residualSD };
```

  Add the fields to the `MassCalibration` interface with doc comments. Say that σ is the residual SD of mass (ICH Q2(R1) §6.3, 7.3), equivalent to σ_net/slope for linear models. Then:

```ts
export interface MassFlags { extrapolated: boolean; belowLoq: boolean }
/** Validity flags for one quantified band: outside the standards' signal range, or below the limit of quantitation. */
export function massFlags(cal: MassCalibration, net: number, mass: number): MassFlags {
  return {
    extrapolated: net < cal.range.minNet || net > cal.range.maxNet,
    belowLoq: cal.loq !== null && mass < cal.loq,
  };
}
```

  The early `return fitMassCalibration(...)` fallbacks (quadratic becoming linear, power becoming linear_zero) already return the full object, so no change is needed there.

- [ ] **Step 4: Run the tests.** Run `npx vitest run tests/core/gel-mass-calibration.test.ts`. Expected: PASS.

- [ ] **Step 5: Commit.** Message: `feat(gel): mass standard range, LOD/LOQ and extrapolation flags`, plus the trailer.

---

### Task 8: No fabricated standard masses; mass flags in the analysis

**Files:**
- Modify: `src/tools/gel/workspace/analysis.ts:83-99,143`, `src/tools/gel/analysis.ts` (metric type), `src/tools/gel/GelCalibrationTab.tsx` (mass summary), `src/tools/gel/GelQuantTab.tsx` (mass cell)
- Test: `tests/app/gel-mass-ui.test.tsx` (append)

**Interfaces:**
- Consumes: `massFlags` and `MassCalibration.lod/loq/range` (Task 7).
- Produces:
  - Metric field `massFlags: MassFlags | null`.
  - `GelAnalysis.unassignedStandardBands: number`.

- [ ] **Step 1: Write the failing app test.** Append to `tests/app/gel-mass-ui.test.tsx`:

```tsx
it('shows LOD/LOQ and the standard range in the mass calibration summary', () => {
  render(<GelView />);
  fireEvent.click(screen.getByRole('button', { name: /MW Calibration /i }));
  fireEvent.click(screen.getByRole('button', { name: /Mass \/ Densitometry \(ng\)/i }));
  const selects = screen.getAllByRole('combobox') as HTMLSelectElement[];
  const laneSelect = selects.find(s => Array.from(s.options).some(o => o.value === 'l2'))!;
  fireEvent.change(laneSelect, { target: { value: 'l2' } });
  expect(screen.getByText(/LOQ/)).toBeTruthy();
  expect(screen.getByText(/Standard range/i)).toBeTruthy();
});
```

  If the demo's lane ids are not `l1`, `l2`, …, read the existing test's lane value and match it.

- [ ] **Step 2: Run the test and confirm it fails.** Run `npx vitest run tests/app/gel-mass-ui.test.tsx`. Expected: FAIL.

- [ ] **Step 3: Implement.**
  1. In `workspace/analysis.ts` `massCalibration`:
     - Replace `const known = customMassMap[m.bandId] ?? preset.masses[i] ?? Math.round(1000 / Math.pow(2, i));` with `const known = customMassMap[m.bandId] ?? preset.masses[i];` and `if (known === undefined) { unassigned++; continue; }`.
     - Declare `let unassigned = 0;` before the loop.
     - Return `{ cal: fitMassCalibration(...), unassigned }` from the memo (renamed `massFit`).
     - Derive `const massCalibration = massFit?.cal ?? null;` and `const unassignedStandardBands = massFit?.unassigned ?? 0;`.
  2. In the metrics map:

     ```ts
     const massEst = massCalibration && m.net > 0 ? massCalibration.massAt(m.net) : null;
     const flags = massCalibration && massEst !== null ? massFlags(massCalibration, m.net, massEst) : null;
     ```

     Include `massFlags: flags`. Return `unassignedStandardBands` from the hook.
  3. In `GelCalibrationTab.tsx`, inside the mass branch's summary (next to the R² at line ~73), add:

     ```tsx
     <span class="text-xs text-slate-600 dark:text-slate-400">
       Standard range {formatMass(massCalibration.range.minMass, massCalibration.unit)}–{formatMass(massCalibration.range.maxMass, massCalibration.unit)}
       {' · '}LOD {massCalibration.lod === null ? '–' : formatMass(massCalibration.lod, massCalibration.unit)}
       {' · '}LOQ {massCalibration.loq === null ? '– (needs ≥ 3 standards)' : formatMass(massCalibration.loq, massCalibration.unit)}
     </span>
     {unassignedStandardBands > 0 && (
       <span class="text-xs text-amber-700 dark:text-amber-400">{unassignedStandardBands} band(s) have no known mass and are excluded; enter masses in the table.</span>
     )}
     ```

  4. In `GelQuantTab.tsx`, wherever `formatMass(m.massEst, …)` is rendered, append:

     ```tsx
     {m.massFlags?.extrapolated && <span class="ml-1 text-[9px] font-bold uppercase text-amber-700 dark:text-amber-400" title="Outside the standard curve's signal range">extrap.</span>}
     {m.massFlags?.belowLoq && <span class="ml-1 text-[9px] font-bold uppercase text-rose-700 dark:text-rose-400" title="Below the limit of quantitation">&lt;LOQ</span>}
     ```

- [ ] **Step 4: Run the tests.** Run `npx vitest run tests/app/gel-mass-ui.test.tsx tests/app/gel*.test.tsx && npm run typecheck`. Expected: PASS.

- [ ] **Step 5: Commit.** Message: `fix(gel): no invented standard masses; flag extrapolated and sub-LOQ amounts`, plus the trailer.

---

### Task 9: Reference ratio is null without a chosen reference

**Files:**
- Modify: `src/tools/gel/workspace/analysis.ts:130-131,137`, `src/tools/gel/analysis.ts` (type `ratio: number | null`), `src/tools/gel/GelQuantTab.tsx:576,665`, `src/tools/gel/workspace/exports.ts:150`
- Test: `tests/app/gel-loading-ui.test.tsx` (append)

**Interfaces:**
- Produces: metric `ratio: number | null`, which is null when `s.refBandId` is not a band of that lane or its net is ≤ 0.

- [ ] **Step 1: Write the failing test.**

```tsx
it('shows no ratio until a reference band is chosen', () => {
  route.value = { name: 'tool', toolId: 'gel' };
  render(<GelView />);
  fireEvent.click(screen.getByRole('button', { name: /Band Quantification & Amounts/i }));
  expect(screen.getAllByText(/pick a reference band/i).length).toBeGreaterThan(0);
});
```

- [ ] **Step 2: Run the test and confirm it fails.** Run `npx vitest run tests/app/gel-loading-ui.test.tsx`. Expected: FAIL.

- [ ] **Step 3: Implement.**
  - In `workspace/analysis.ts`:

    ```ts
    const refBand = metrics.find(m => m.bandId === s.refBandId);
    const refNet = refBand && refBand.net > 0 ? refBand.net : null;
    // ...
    const ratio = refNet === null ? null : Math.max(0, m.net) / refNet;
    ```

  - In `GelQuantTab.tsx` at both ratio cells, render `{m.ratio === null ? '–' : m.ratio.toFixed(2)}`.
  - Above the band table, when `!allLanesAnalysis.some(a => a.metrics.some(m => m.bandId === s.refBandId))`, render `<p class="text-xs text-slate-500 dark:text-slate-400">Ratio column: pick a reference band (the "Set" button in the Gel tab band table).</p>`.
  - In `exports.ts`, the ratio cell becomes `m.ratio === null ? '' : Number(m.ratio.toFixed(2))`.

- [ ] **Step 4: Run the tests.** Run `npx vitest run tests/app/gel*.test.tsx && npm run typecheck`. Expected: PASS.

- [ ] **Step 5: Commit.** Message: `fix(gel): ratio column stays empty until a reference band is chosen`, plus the trailer.

---

### Task 10: Baselines (true rolling ball, unequal lanes, no ROI) and sample SD

**Files:**
- Modify: `src/core/gel/background.ts`, `src/tools/gel/workspace/analysis.ts` (baseline warnings, loadingStats), `src/tools/gel/analysis.ts` (metric `baselineWarning: boolean`), `src/tools/gel/GelQuantTab.tsx` (warning marker, CV when SD null)
- Test: `tests/core/gel-background.test.ts` (create)

**Interfaces:**
- Produces:
  - `rollingBaseline(profile, radius)` using a ball structuring element.
  - `sharedCrossLaneBaseline(profiles, radius)` returns a length of `max(profile lengths)`.
  - `baselineFor('shared', …)` returns an array of `profile.length`.
  - `BackgroundMethod = 'none' | 'rolling' | 'valley' | 'shared'`.
  - Metric `baselineWarning: boolean`.
  - `loadingStats.stdDev: number | null` and `cvPct: number | null`.

- [ ] **Step 1: Write the failing test.** Create `tests/core/gel-background.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { rollingBaseline, sharedCrossLaneBaseline, baselineFor } from '@/core/gel/background';

const N = 300;
const bg = (i: number) => 0.1 + 0.0005 * i;                       // sloping background
const band = (i: number, c: number, s: number, a: number) => a * Math.exp(-((i - c) ** 2) / (2 * s * s));

describe('rolling ball baseline', () => {
  it('follows a sloping background under a narrow band', () => {
    const prof = Float32Array.from({ length: N }, (_, i) => bg(i) + band(i, 150, 4, 0.5));
    const base = rollingBaseline(prof, 30);
    expect(Math.abs(base[150]! - bg(150))).toBeLessThan(0.02);
    for (let i = 0; i < N; i++) expect(base[i]!).toBeLessThanOrEqual(prof[i]! + 1e-6);
  });
  it('returns a constant profile unchanged', () => {
    const base = rollingBaseline(new Float32Array(100).fill(0.3), 20);
    for (const v of base) expect(v).toBeCloseTo(0.3, 6);
  });
});

describe('shared cross-lane baseline', () => {
  it('handles lanes of unequal length without NaN', () => {
    const a = Float32Array.from({ length: 200 }, (_, i) => bg(i));
    const b = Float32Array.from({ length: 150 }, (_, i) => bg(i));
    const shared = sharedCrossLaneBaseline([b, a], 20);
    expect(shared.length).toBe(200);
    for (const v of shared) expect(Number.isFinite(v)).toBe(true);
    expect(baselineFor('shared', b, { sharedBaseline: shared }).length).toBe(150);
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails.** Run `npx vitest run tests/core/gel-background.test.ts`. Expected: FAIL (`shared.length` is 150, and/or the rolling ball's absolute tolerance).

- [ ] **Step 3: Implement** in `background.ts`.
  - Remove `'roi'`, `constantBaseline`, the `roiSignal` option and the `mean` import.
  - Replace `rollingBaseline`:

```ts
/**
 * Rolling-ball baseline along a profile (Sternberg 1983): grey-scale opening with a ball-shaped structuring element of
 * radius r samples, whose height is the profile's intensity range (so the ball's curvature scales with the data, as in
 * ImageJ), then a light Gaussian (σ = r/10) and clamping to the profile. Bands wider than about r are partly absorbed —
 * the workspace warns about those.
 */
export function rollingBaseline(profile: ArrayLike<number>, radius: number): Float32Array {
  const x = Float32Array.from(profile, v => Number.isNaN(v) ? 0 : v);
  const n = x.length, r = Math.max(1, Math.round(radius));
  if (n === 0) return x;
  let lo = Infinity, hi = -Infinity;
  for (const v of x) { if (v < lo) lo = v; if (v > hi) hi = v; }
  const H = hi - lo;
  const ball = Float32Array.from({ length: 2 * r + 1 }, (_, j) => { const k = (j - r) / r; return H * (Math.sqrt(Math.max(0, 1 - k * k)) - 1); });
  const ero = new Float32Array(n), dil = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let m = Infinity;
    for (let j = -r; j <= r; j++) { const t = i + j; if (t < 0 || t >= n) continue; const v = x[t]! - ball[j + r]!; if (v < m) m = v; }
    ero[i] = m;
  }
  for (let i = 0; i < n; i++) {
    let m = -Infinity;
    for (let j = -r; j <= r; j++) { const t = i - j; if (t < 0 || t >= n) continue; const v = ero[t]! + ball[j + r]!; if (v > m) m = v; }
    dil[i] = m;
  }
  const smooth = gaussianSmooth(dil, r / 10);
  for (let i = 0; i < n; i++) smooth[i] = Math.min(smooth[i]!, x[i]!);
  return smooth;
}
```

  Import `gaussianSmooth` from `./filters`. Rewrite `sharedCrossLaneBaseline` so that `len = Math.max(...profiles.map(p => p.length))` and each row only reads lanes with `y < profiles[l].length`. In `baselineFor`:

  ```ts
  case 'shared': return opts.sharedBaseline ? opts.sharedBaseline.slice(0, profile.length) : rollingBaseline(profile, opts.radius ?? 50);
  ```

  If the "follows a sloping background" test misses the 0.02 tolerance, the ball height is too large for a narrow profile range. Change `H` to `Math.min(H, hi)`. Do not loosen the test.

  In `workspace/analysis.ts`:
  - In the metrics map: `baselineWarning: s.bgMethod === 'rolling' && ((m.y1 ?? 0) - (m.y0 ?? 0)) > s.rollingRadius`. Add the field to the metric type.
  - In `loadingStats`, use `(valid.length - 1)` as the divisor and return `stdDev: null, cvPct: null` when `valid.length < 2`.
  - In `GelQuantTab.tsx`, render `loadingStats.cvPct === null ? '–' : …` and guard the colour thresholds with `?? 0`.
  - In the band table, next to net, render `{m.baselineWarning && <span class="ml-1 text-[9px] text-amber-700 dark:text-amber-400" title="Band wider than the rolling-ball radius; increase the radius">⚠ radius</span>}`.
  - Remove any `'roi'` option in `GelControls.tsx` (run `grep -n roi src/tools/gel`).

- [ ] **Step 4: Run the tests.** Run `npx vitest run tests/core/gel-background.test.ts tests/core/gel-synthetic.test.ts tests/app/gel*.test.tsx && npm run typecheck`. Expected: PASS. The synthetic known-answer tests may shift slightly because the rolling baseline changed. If a tolerance fails, check whether the new value is closer to the synthetic ground truth before touching the test, and say so in the commit.

- [ ] **Step 5: Commit.** Message: `fix(gel): true rolling-ball baseline, shared baseline for unequal lanes, sample SD`, plus the trailer.

---

### Task 11: Group statistics core

**Files:**
- Create: `src/core/gel/groups.ts`
- Test: `tests/core/gel-groups.test.ts`

**Interfaces:**
- Consumes: `centralTCdf` and `tCritical95` from `@/core/stats`.
- Produces:

```ts
export type NormMode = 'none' | 'control-band' | 'total-lane';
export interface LaneValue { value: number | null; reason: string | null }
export function normalizeLaneValue(mode: NormMode, targetNet: number | null, controlNet: number | null, totalLane: number): LaneValue
export interface GroupInput { laneId: string; condition: string; replicate: number | null; value: number | null; flags: string[] }
export interface WelchResult { t: number; df: number; p: number }
export interface GroupSummary {
  condition: string; n: number; nExcluded: number; values: number[];
  mean: number | null; sd: number | null; sem: number | null; ci95: [number, number] | null; cvPct: number | null;
  foldChange: number | null; flags: string[]; test: (WelchResult & { pAdj: number }) | null;
}
export function welchTTest(a: number[], b: number[]): WelchResult | null
export function holmAdjust(p: number[]): number[]
export function summarizeGroups(rows: GroupInput[], controlCondition: string, opts?: { welch?: boolean }): GroupSummary[]
```

- [ ] **Step 1: Write the failing test.** The reference values come from scipy `ttest_ind(equal_var=False)` and `t.ppf`.

```ts
import { describe, it, expect } from 'vitest';
import { normalizeLaneValue, welchTTest, holmAdjust, summarizeGroups, type GroupInput } from '@/core/gel/groups';

const rows = (cond: string, vals: (number | null)[]): GroupInput[] =>
  vals.map((v, i) => ({ laneId: `${cond}${i}`, condition: cond, replicate: i + 1, value: v, flags: [] }));

describe('normalizeLaneValue', () => {
  it('divides by the control band or total lane and never invents values', () => {
    expect(normalizeLaneValue('none', 5, null, 0)).toEqual({ value: 5, reason: null });
    expect(normalizeLaneValue('control-band', 6, 3, 0)).toEqual({ value: 2, reason: null });
    expect(normalizeLaneValue('total-lane', 6, null, 12)).toEqual({ value: 0.5, reason: null });
    expect(normalizeLaneValue('none', null, null, 0).value).toBeNull();
    expect(normalizeLaneValue('control-band', 6, null, 0).reason).toMatch(/control/i);
    expect(normalizeLaneValue('control-band', 6, 0, 0).value).toBeNull();
    expect(normalizeLaneValue('total-lane', 6, null, 0).value).toBeNull();
  });
});

describe('welchTTest', () => {
  it('matches scipy for unequal variances and sizes', () => {
    const r = welchTTest([2.0, 2.4, 2.1, 2.6], [1.0, 1.2, 0.9])!;
    expect(r.t).toBeCloseTo(7.593743, 5);
    expect(r.df).toBeCloseTo(4.763780, 5);
    expect(r.p).toBeCloseTo(0.000777636, 6);
  });
  it('needs n ≥ 2 per group', () => {
    expect(welchTTest([1], [1, 2])).toBeNull();
  });
});

describe('holmAdjust', () => {
  it('step-down adjusts and keeps monotonicity', () => {
    const adj = holmAdjust([0.000777636, 0.467605]);
    expect(adj[0]).toBeCloseTo(0.001555272, 8);
    expect(adj[1]).toBeCloseTo(0.467605, 6);
    expect(holmAdjust([0.04, 0.01, 0.03])).toEqual([0.06, 0.03, 0.06]);
  });
});

describe('summarizeGroups', () => {
  const data = [...rows('ctrl', [1.0, 1.2, 0.9]), ...rows('drug', [2.0, 2.4, 2.1, 2.6]), ...rows('low', [1.1, 1.0, 1.3])];
  const out = summarizeGroups(data, 'ctrl', { welch: true });
  it('computes n, mean, SD, SEM and a t-based 95% CI', () => {
    const d = out.find(g => g.condition === 'drug')!;
    expect(d.n).toBe(4);
    expect(d.mean!).toBeCloseTo(2.275, 10);
    expect(d.sd!).toBeCloseTo(0.275378527, 8);
    expect(d.sem!).toBeCloseTo(0.137689264, 8);
    expect(d.ci95![1] - d.mean!).toBeCloseTo(3.182446305 * 0.137689264, 6);
    expect(d.foldChange!).toBeCloseTo(2.275 / (3.1 / 3), 8);
  });
  it('Holm-adjusts the comparisons against control', () => {
    expect(out.find(g => g.condition === 'drug')!.test!.pAdj).toBeCloseTo(0.001555272, 7);
    expect(out.find(g => g.condition === 'low')!.test!.p).toBeCloseTo(0.467605, 5);
    expect(out.find(g => g.condition === 'ctrl')!.test).toBeNull();
  });
  it('keeps first-appearance order and counts excluded values', () => {
    const g = summarizeGroups([...rows('a', [1, null, 3]), ...rows('b', [null])], 'a');
    expect(g.map(x => x.condition)).toEqual(['a', 'b']);
    expect(g[0]!.nExcluded).toBe(1);
    expect(g[1]).toMatchObject({ n: 0, mean: null, sd: null, ci95: null, foldChange: null });
  });
  it('gives no fold change when the control is missing or its mean is 0', () => {
    expect(summarizeGroups(rows('x', [1, 2]), 'nope')[0]!.foldChange).toBeNull();
    expect(summarizeGroups([...rows('c', [0, 0]), ...rows('x', [1, 2])], 'c')[1]!.foldChange).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails.** Run `npx vitest run tests/core/gel-groups.test.ts`. Expected: FAIL (module not found).

- [ ] **Step 3: Implement.** Create `src/core/gel/groups.ts`:

```ts
/* Condition / replicate statistics for normalized band values. Pure. Welch 1947, Biometrika 34:28 (unequal-variance
 * t-test); Holm 1979, Scand J Stat 6:65 (step-down multiple-comparison adjustment). */
import { centralTCdf, tCritical95 } from '@/core/stats';

export type NormMode = 'none' | 'control-band' | 'total-lane';
export interface LaneValue { value: number | null; reason: string | null }

export function normalizeLaneValue(mode: NormMode, targetNet: number | null, controlNet: number | null, totalLane: number): LaneValue {
  if (targetNet === null) return { value: null, reason: 'no target band in this lane' };
  if (mode === 'none') return { value: targetNet, reason: null };
  if (mode === 'control-band') {
    if (controlNet === null) return { value: null, reason: 'no control band in this lane' };
    if (controlNet <= 0) return { value: null, reason: 'control band signal ≤ 0' };
    return { value: targetNet / controlNet, reason: null };
  }
  if (!(totalLane > 0)) return { value: null, reason: 'total lane signal ≤ 0' };
  return { value: targetNet / totalLane, reason: null };
}

export interface GroupInput { laneId: string; condition: string; replicate: number | null; value: number | null; flags: string[] }
export interface WelchResult { t: number; df: number; p: number }
export interface GroupSummary {
  condition: string; n: number; nExcluded: number; values: number[];
  mean: number | null; sd: number | null; sem: number | null; ci95: [number, number] | null; cvPct: number | null;
  foldChange: number | null; flags: string[]; test: (WelchResult & { pAdj: number }) | null;
}

const meanOf = (v: number[]) => v.reduce((a, b) => a + b, 0) / v.length;
const varOf = (v: number[], m: number) => v.reduce((a, b) => a + (b - m) ** 2, 0) / (v.length - 1);

/** Two-sided Welch t-test of a vs b (a − b). Null when either group has n < 2 or both variances are 0. */
export function welchTTest(a: number[], b: number[]): WelchResult | null {
  if (a.length < 2 || b.length < 2) return null;
  const ma = meanOf(a), mb = meanOf(b);
  const va = varOf(a, ma) / a.length, vb = varOf(b, mb) / b.length;
  if (va + vb === 0) return null;
  const t = (ma - mb) / Math.sqrt(va + vb);
  const df = (va + vb) ** 2 / (va ** 2 / (a.length - 1) + vb ** 2 / (b.length - 1));
  const p = 2 * centralTCdf(-Math.abs(t), df);
  return { t, df, p };
}

/** Holm step-down adjusted p-values, in the input order. */
export function holmAdjust(p: number[]): number[] {
  const m = p.length, order = p.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v);
  const out = new Array<number>(m);
  let running = 0;
  order.forEach(({ v, i }, k) => { running = Math.max(running, Math.min(1, (m - k) * v)); out[i] = running; });
  return out;
}

export function summarizeGroups(rows: GroupInput[], controlCondition: string, opts: { welch?: boolean } = {}): GroupSummary[] {
  const conds: string[] = [];
  for (const r of rows) if (!conds.includes(r.condition)) conds.push(r.condition);
  const valuesOf = (c: string) => rows.filter(r => r.condition === c && r.value !== null && Number.isFinite(r.value)).map(r => r.value as number);
  const ctrl = valuesOf(controlCondition);
  const ctrlMean = ctrl.length ? meanOf(ctrl) : null;
  const base: GroupSummary[] = conds.map(c => {
    const inC = rows.filter(r => r.condition === c), vals = valuesOf(c), n = vals.length;
    const mean = n ? meanOf(vals) : null;
    const sd = n >= 2 ? Math.sqrt(varOf(vals, mean!)) : null;
    const sem = sd === null ? null : sd / Math.sqrt(n);
    const half = sem === null ? null : tCritical95(n - 1) * sem;
    return {
      condition: c, n, nExcluded: inC.length - n, values: vals, mean, sd, sem,
      ci95: half === null ? null : [mean! - half, mean! + half],
      cvPct: sd !== null && mean ? (sd / Math.abs(mean)) * 100 : null,
      foldChange: mean !== null && ctrlMean ? mean / ctrlMean : null,
      flags: [...new Set(inC.flatMap(r => r.flags))],
      test: null,
    };
  });
  if (opts.welch && ctrl.length >= 2) {
    const tested = base.filter(g => g.condition !== controlCondition).map(g => ({ g, r: welchTTest(g.values, ctrl) })).filter(x => x.r);
    const adj = holmAdjust(tested.map(x => x.r!.p));
    tested.forEach((x, k) => { x.g.test = { ...x.r!, pAdj: adj[k]! }; });
  }
  return base;
}
```

  If `holmAdjust([0.04, 0.01, 0.03])` yields floating-point noise (for example 0.06000000000000001), change that assertion to `toBeCloseTo` per element. Do not alter the maths.

- [ ] **Step 4: Run the tests.** Run `npx vitest run tests/core/gel-groups.test.ts`. Expected: PASS.

- [ ] **Step 5: Commit.** Message: `feat(gel): condition/replicate statistics with Welch t-test and Holm adjustment`, plus the trailer.

---

### Task 12: Lane metadata, group settings and project schema 2

**Files:**
- Create: `src/tools/gel/lane-meta.ts`
- Modify: `src/tools/gel/workspace-model.ts`, `src/tools/gel/workspace/core.ts`, `src/tools/gel/workspace/image.ts`, `src/tools/gel/project.ts`, `src/tools/gel/workspace/project.ts`
- Test: `tests/app/gel-lane-meta.test.ts` (create), `tests/app/gel-project.test.ts` (append if it exists; otherwise create)

**Interfaces:**
- Produces:

```ts
// lane-meta.ts
export interface LaneMeta { condition: string; replicate: number | null; excluded: boolean }
export type LaneRole = 'ladder' | 'standard' | 'sample' | 'excluded';
export function laneRole(laneId: string, meta: LaneMeta | undefined, ladderLaneId: string, massLaneId: string): LaneRole
export function effectiveMeta(laneId: string, meta: Record<string, LaneMeta>, label: string): LaneMeta   // condition defaults to label
export function assignByPattern(laneIds: string[], conditions: string[], replicates: number): Record<string, LaneMeta>
// workspace-model.ts State gains:
groupNorm: NormMode; groupTarget: BandRef | null; groupControl: BandRef | null;
groupControlCondition: string; groupMarginPct: number; groupWelch: boolean;
quantSubView: 'bands' | 'loading' | 'groups';
export interface BandRef { size: number | null; rf: number }
// core.ts: laneMeta / setLaneMeta
// project.ts: GEL_PROJECT_VERSION = 2; GelProjectData gains laneMeta, ladderSizeMap, sourceInfo, appliedTransforms
```

- [ ] **Step 1: Write the failing tests.** Create `tests/app/gel-lane-meta.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { assignByPattern, effectiveMeta, laneRole } from '@/tools/gel/lane-meta';

describe('lane metadata', () => {
  it('assigns conditions × replicates in lane order, leaving extra lanes untouched', () => {
    const m = assignByPattern(['a', 'b', 'c', 'd', 'e', 'f', 'g'], ['ctrl', 'drug'], 3);
    expect(m.a).toEqual({ condition: 'ctrl', replicate: 1, excluded: false });
    expect(m.c).toEqual({ condition: 'ctrl', replicate: 3, excluded: false });
    expect(m.d).toEqual({ condition: 'drug', replicate: 1, excluded: false });
    expect(m.g).toBeUndefined();
  });
  it('defaults the condition to the lane label', () => {
    expect(effectiveMeta('x', {}, 'WT')).toEqual({ condition: 'WT', replicate: null, excluded: false });
  });
  it('derives ladder and standard roles from the calibration lanes', () => {
    expect(laneRole('l1', undefined, 'l1', '')).toBe('ladder');
    expect(laneRole('l2', undefined, 'l1', 'l2')).toBe('standard');
    expect(laneRole('l3', { condition: 'a', replicate: 1, excluded: true }, 'l1', 'l2')).toBe('excluded');
    expect(laneRole('l4', undefined, 'l1', 'l2')).toBe('sample');
  });
});
```

  For the project, find the existing project test with `grep -rln restoreGelProject tests`. Append (or create `tests/app/gel-project.test.ts`):

```ts
import { describe, it, expect } from 'vitest';
import { gelProjectSnapshot, restoreGelProject } from '@/tools/gel/project';

const plane = { width: 2, height: 1, data: new Float32Array([0.1, 0.2]) };
const base = { imageName: 'g', gelTitle: 'G', lanes: [], selectedLaneId: '', bandMap: {}, laneLabels: {}, customMassMap: {},
  display: { showMwLabels: true, showLaneHeaders: true, stripLanePrefix: false, gelLayout: 'split' as const }, settings: {} };

describe('gel project schema 2', () => {
  it('round-trips lane metadata, ladder overrides and source info', async () => {
    const snap = gelProjectSnapshot(plane, { ...base, laneMeta: { l1: { condition: 'ctrl', replicate: 1, excluded: false } },
      ladderSizeMap: { b1: 250, b2: null }, sourceInfo: { format: 'tiff', bitDepth: 16, lossy: false, rescaled: false }, appliedTransforms: ['crop (exact)'] });
    const { data } = await restoreGelProject({ ...snap, id: 'p', toolId: 'gel', updatedAt: 0, createdAt: 0 } as never);
    expect(data.laneMeta.l1!.condition).toBe('ctrl');
    expect(data.ladderSizeMap).toEqual({ b1: 250, b2: null });
    expect(data.sourceInfo!.bitDepth).toBe(16);
    expect(data.appliedTransforms).toEqual(['crop (exact)']);
  });
  it('opens a schema 1 project with empty metadata', async () => {
    const snap = gelProjectSnapshot(plane, { ...base, laneMeta: {}, ladderSizeMap: {}, sourceInfo: null, appliedTransforms: [] });
    (snap.state as { schemaVersion: number }).schemaVersion = 1;
    for (const k of ['laneMeta', 'ladderSizeMap', 'sourceInfo', 'appliedTransforms']) delete (snap.state as Record<string, unknown>)[k];
    const { data } = await restoreGelProject({ ...snap, id: 'p', toolId: 'gel', updatedAt: 0, createdAt: 0 } as never);
    expect(data.laneMeta).toEqual({});
    expect(data.sourceInfo).toBeNull();
  });
});
```

  Adjust the `Project` literal fields to whatever `@/lib/projects`' `Project` type requires. `restoreGelProject` only reads `state`, `assets` and `name`.

- [ ] **Step 2: Run the tests and confirm they fail.** Run `npx vitest run tests/app/gel-lane-meta.test.ts tests/app/gel-project.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement.** Create `src/tools/gel/lane-meta.ts`:

```ts
/* Per-lane study metadata: which condition and replicate a lane is, and whether it is left out of statistics. */
export interface LaneMeta { condition: string; replicate: number | null; excluded: boolean }
export type LaneRole = 'ladder' | 'standard' | 'sample' | 'excluded';

export function laneRole(laneId: string, meta: LaneMeta | undefined, ladderLaneId: string, massLaneId: string): LaneRole {
  if (laneId === ladderLaneId) return 'ladder';
  if (laneId === massLaneId) return 'standard';
  return meta?.excluded ? 'excluded' : 'sample';
}

export function effectiveMeta(laneId: string, meta: Record<string, LaneMeta>, label: string): LaneMeta {
  const m = meta[laneId];
  return { condition: m?.condition.trim() || label, replicate: m?.replicate ?? null, excluded: m?.excluded ?? false };
}

/** Lanes in order get condition 1 × replicates, then condition 2 × replicates, … Extra lanes are not touched. */
export function assignByPattern(laneIds: string[], conditions: string[], replicates: number): Record<string, LaneMeta> {
  const out: Record<string, LaneMeta> = {};
  const r = Math.max(1, Math.floor(replicates));
  conditions.forEach((c, ci) => {
    for (let k = 0; k < r; k++) {
      const id = laneIds[ci * r + k];
      if (id) out[id] = { condition: c, replicate: k + 1, excluded: false };
    }
  });
  return out;
}
```

  In `workspace-model.ts`, add to `State` and `DEFAULTS`:
  - `groupNorm: 'none'`
  - `groupTarget: null`
  - `groupControl: null`
  - `groupControlCondition: ''`
  - `groupMarginPct: 10`
  - `groupWelch: false`

  Widen `quantSubView`, and export `BandRef`. Import `NormMode` from `@/core/gel/groups`.

  In `core.ts`, add `const [laneMeta, setLaneMeta] = useState<Record<string, LaneMeta>>({});` and return both names. In `image.ts`, call `setLaneMeta({})` in `handleFileUpload` and `loadDemo`. Lane ids are regenerated by rotate/flip, so there the metadata is lost like lanes are, and that is acceptable.

  In `project.ts`:
  - `GEL_PROJECT_VERSION = 2`.
  - Add `laneMeta: Record<string, LaneMeta>; ladderSizeMap: Record<string, number | null>; sourceInfo: SourceInfo | null; appliedTransforms: string[];` to `GelProjectData`.
  - In `restoreGelProject`, accept `s.schemaVersion === 1 || s.schemaVersion === 2` and add:

```ts
      laneMeta: isRecord(s.laneMeta) && Object.values(s.laneMeta).every(m => isRecord(m) && typeof m.condition === 'string' && typeof m.excluded === 'boolean' && (m.replicate === null || isFiniteNumber(m.replicate)))
        ? s.laneMeta as Record<string, LaneMeta> : {},
      ladderSizeMap: isRecord(s.ladderSizeMap) && Object.values(s.ladderSizeMap).every(v => v === null || isFiniteNumber(v))
        ? s.ladderSizeMap as Record<string, number | null> : {},
      sourceInfo: isRecord(s.sourceInfo) && typeof s.sourceInfo.format === 'string' ? s.sourceInfo as unknown as SourceInfo : null,
      appliedTransforms: Array.isArray(s.appliedTransforms) && s.appliedTransforms.every(t => typeof t === 'string') ? s.appliedTransforms : [],
```

  In `workspace/project.ts`:
  - On restore: `setLaneMeta(data.laneMeta); setLadderSizeMap(data.ladderSizeMap); setSourceInfo(data.sourceInfo); setAppliedTransforms(data.appliedTransforms);`.
  - On save, pass `laneMeta, ladderSizeMap, sourceInfo, appliedTransforms`.

- [ ] **Step 4: Run the tests.** Run `npx vitest run tests/app/gel-lane-meta.test.ts tests/app/gel-project.test.ts tests/app/gel*.test.tsx && npm run typecheck`. Expected: PASS.

- [ ] **Step 5: Commit.** Message: `feat(gel): lane condition/replicate metadata and project schema 2`, plus the trailer.

---

### Task 13: `useGelGroups`, data-quality panel and the Groups view

**Files:**
- Create: `src/tools/gel/quality.ts`, `src/tools/gel/workspace/groups.ts`, `src/tools/gel/DataQualityPanel.tsx`, `src/tools/gel/GelGroupsView.tsx`
- Modify: `src/tools/gel/workspace.ts`, `src/tools/gel/GelQuantTab.tsx` (sub-view toggle + render)
- Test: `tests/app/gel-quality.test.ts`, `tests/app/gel-groups-values.test.ts`, `tests/app/gel-groups-ui.test.tsx`

**Interfaces:**
- Consumes: `normalizeLaneValue`, `summarizeGroups` (Task 11); `effectiveMeta`, `laneRole` (Task 12); `findTargetBandInLane`, `computeTargetBandClusters` (`tools/gel/analysis.ts`); `isSaturated` (Task 3).
- Produces:

```ts
// quality.ts
export interface QualityIssue { level: 'warn' | 'info'; text: string }
export function dataQualityIssues(i: { sourceInfo: SourceInfo | null; appliedTransforms: string[]; deskewAngle: number; saturatedBands: number; baselineWarnings: number }): QualityIssue[]
// workspace/groups.ts
export interface LaneGroupRow { laneId: string; laneIdx: number; label: string; role: LaneRole; condition: string; replicate: number | null;
  targetNet: number | null; controlNet: number | null; value: number | null; reason: string | null; flags: string[] }
export function resolveLaneValues(analysis: LaneAnalysisItem[], opts: {...}): LaneGroupRow[]   // pure, exported for tests
export function useGelGroups(core: GelCore, ladders: GelLadders, analysis: GelAnalysis, deskewAngle: number): { targetClusters: TargetBandCluster[]; groupRows: LaneGroupRow[]; groupSummaries: GroupSummary[]; groupControlCondition: string; qualityIssues: QualityIssue[] }
```

- [ ] **Step 1: Write the failing tests.**

  `tests/app/gel-quality.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { dataQualityIssues } from '@/tools/gel/quality';
const base = { appliedTransforms: [], deskewAngle: 0, saturatedBands: 0, baselineWarnings: 0 };
describe('dataQualityIssues', () => {
  it('warns about lossy, 8-bit and rescaled sources', () => {
    const t = dataQualityIssues({ ...base, sourceInfo: { format: 'jpeg', bitDepth: 8, lossy: true, rescaled: false } }).map(i => i.text).join(' ');
    expect(t).toMatch(/compression/i);
    expect(t).toMatch(/8-bit/i);
    expect(dataQualityIssues({ ...base, sourceInfo: { format: 'tiff', bitDepth: 32, lossy: false, rescaled: true } }).map(i => i.text).join(' ')).toMatch(/not assessable/i);
  });
  it('reports unknown source, saturated bands and resampling', () => {
    const t = dataQualityIssues({ ...base, sourceInfo: null, saturatedBands: 2, deskewAngle: 1.5, appliedTransforms: ['crop (exact)'] }).map(i => i.text).join(' ');
    expect(t).toMatch(/source unknown/i);
    expect(t).toMatch(/2 saturated/i);
    expect(t).toMatch(/deskew 1\.50°/);
  });
  it('is empty for a clean 16-bit TIFF', () => {
    expect(dataQualityIssues({ ...base, sourceInfo: { format: 'tiff', bitDepth: 16, lossy: false, rescaled: false } })).toEqual([]);
  });
});
```

  `tests/app/gel-groups-values.test.ts`. Build `LaneAnalysisItem`s by hand:

```ts
import { describe, it, expect } from 'vitest';
import { resolveLaneValues } from '@/tools/gel/workspace/groups';
import type { LaneAnalysisItem } from '@/tools/gel/analysis';

const metric = (id: string, peakY: number, net: number, sizeEst: number | null, sat = 0) => ({
  bandId: id, raw: net, background: 0, net, area: 10, saturation: sat, peakY, y0: peakY - 3, y1: peakY + 3,
  number: 1, share: 0, ratio: null, sizeEst, massEst: null, massFlags: null, ladderAssigned: null, sizeResidualPct: null, baselineWarning: false,
});
const lane = (id: string, x: number, metrics: ReturnType<typeof metric>[], total = 100): LaneAnalysisItem => ({
  lane: { id, x, y0: 0, y1: 100, width: 10, tilt: 0 }, laneIdx: x, profile: new Float32Array(100), baseline: new Float32Array(100),
  netProfile: new Float32Array(100), metrics, totalNet: 0, totalBandsSignal: 0, totalLaneSignal: total, loadingRatio: 1, loadingDeviationPct: 0, normFactor: 1,
});

describe('resolveLaneValues', () => {
  const analysis = [
    lane('L', 0, []),                                              // ladder
    lane('a', 1, [metric('a1', 30, 20, 50), metric('a2', 60, 10, 42)]),
    lane('b', 2, [metric('b1', 31, 30, 49, 0.2), metric('b2', 61, 10, 42)]),
    lane('c', 3, [metric('c2', 60, 10, 42)]),                      // no target
  ];
  const opts = { ladderLaneId: 'L', massLaneId: '', laneMeta: {}, labels: { a: 'ctrl', b: 'drug', c: 'drug' },
    target: { size: 50, rf: 0.3 }, control: { size: 42, rf: 0.6 }, mode: 'control-band' as const, marginPct: 10 };
  const rows = resolveLaneValues(analysis, opts);
  it('skips ladder and standard lanes', () => expect(rows.map(r => r.laneId)).toEqual(['a', 'b', 'c']));
  it('normalizes the target by the control band', () => {
    expect(rows[0]!.value).toBeCloseTo(2);
    expect(rows[1]!.value).toBeCloseTo(3);
  });
  it('propagates saturation and gives a reason for missing targets', () => {
    expect(rows[1]!.flags).toContain('saturated');
    expect(rows[2]!.value).toBeNull();
    expect(rows[2]!.reason).toMatch(/target/);
  });
  it('matches by Rf on an uncalibrated gel', () => {
    const unc = analysis.map(a => ({ ...a, metrics: a.metrics.map(m => ({ ...m, sizeEst: null })) }));
    const r = resolveLaneValues(unc, { ...opts, target: { size: null, rf: 0.3 }, control: { size: null, rf: 0.6 } });
    expect(r[0]!.value).toBeCloseTo(2);
  });
});
```

  `tests/app/gel-groups-ui.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/preact';
import GelView from '@/tools/gel/View';

describe('Groups view', () => {
  it('shows lane metadata, summary and the data-quality panel', () => {
    render(<GelView />);
    fireEvent.click(screen.getByRole('button', { name: /Band Quantification & Amounts/i }));
    fireEvent.click(screen.getByRole('button', { name: /Conditions & Replicates/i }));
    expect(screen.getByRole('table', { name: /Lane conditions/i })).toBeTruthy();
    expect(screen.getByRole('table', { name: /Condition summary/i })).toBeTruthy();
    expect(screen.getByText(/n < 3/i)).toBeTruthy();
  });
});
```

  If the Quant tab button label differs, use the name the existing `gel-loading-ui` test uses.

- [ ] **Step 2: Run the tests and confirm they fail.** Run `npx vitest run tests/app/gel-quality.test.ts tests/app/gel-groups-values.test.ts tests/app/gel-groups-ui.test.tsx`. Expected: FAIL (modules not found).

- [ ] **Step 3: Implement `quality.ts`.**

```ts
/* Data-quality checks shown above the quantification: things that make densitometry numbers unreliable. */
import type { SourceInfo } from '@/lib/image';
export interface QualityIssue { level: 'warn' | 'info'; text: string }

export function dataQualityIssues(i: { sourceInfo: SourceInfo | null; appliedTransforms: string[]; deskewAngle: number; saturatedBands: number; baselineWarnings: number }): QualityIssue[] {
  const out: QualityIssue[] = [];
  const s = i.sourceInfo;
  if (!s) out.push({ level: 'info', text: 'Image source unknown (saved before source tracking); check it was an uncompressed imager export.' });
  else {
    if (s.lossy) out.push({ level: 'warn', text: `${s.format.toUpperCase()} input: compression distorts densitometry. Use the imager's raw TIFF.` });
    if (s.bitDepth === 8 && s.format !== 'demo') out.push({ level: 'warn', text: '8-bit image: limited dynamic range (256 levels); faint and strong bands cannot both be in range.' });
    if (s.rescaled) out.push({ level: 'warn', text: 'Float image rescaled to its min–max on import: saturation is not assessable.' });
  }
  if (i.saturatedBands > 0) out.push({ level: 'warn', text: `${i.saturatedBands} saturated band(s): signal is clipped, so their amounts are underestimated.` });
  if (i.baselineWarnings > 0) out.push({ level: 'warn', text: `${i.baselineWarnings} band(s) wider than the rolling-ball radius: increase the radius.` });
  if (Math.abs(i.deskewAngle) > 1e-6) out.push({ level: 'info', text: `deskew ${i.deskewAngle.toFixed(2)}° (resampled with bilinear interpolation)` });
  for (const t of i.appliedTransforms) out.push({ level: 'info', text: t });
  return out;
}
```

- [ ] **Step 4: Implement `workspace/groups.ts`.**

```ts
import { useMemo } from 'preact/hooks';
import { normalizeLaneValue, summarizeGroups, type GroupSummary, type NormMode } from '@/core/gel/groups';
import { isSaturated } from '@/core/gel/quant';
import { computeTargetBandClusters, findTargetBandInLane, type LaneAnalysisItem, type TargetBandCluster } from '../analysis';
import { effectiveMeta, laneRole, type LaneMeta, type LaneRole } from '../lane-meta';
import { dataQualityIssues, type QualityIssue } from '../quality';
import type { BandRef } from '../workspace-model';
import type { GelCore, GelAnalysis, GelLadders } from '../workspace';

export interface LaneGroupRow { laneId: string; laneIdx: number; label: string; role: LaneRole; condition: string; replicate: number | null;
  targetNet: number | null; controlNet: number | null; value: number | null; reason: string | null; flags: string[] }

export function resolveLaneValues(analysis: LaneAnalysisItem[], o: {
  ladderLaneId: string; massLaneId: string; laneMeta: Record<string, LaneMeta>; labels: Record<string, string>;
  target: BandRef | null; control: BandRef | null; mode: NormMode; marginPct: number;
}): LaneGroupRow[] {
  const rows: LaneGroupRow[] = [];
  for (const item of analysis) {
    const id = item.lane.id;
    const label = o.labels[id] || `Lane ${item.laneIdx + 1}`;
    const role = laneRole(id, o.laneMeta[id], o.ladderLaneId, o.massLaneId);
    if (role === 'ladder' || role === 'standard') continue;
    const meta = effectiveMeta(id, o.laneMeta, label);
    const t = o.target ? findTargetBandInLane(item, o.target.size, o.target.rf, o.marginPct) : null;
    const c = o.mode === 'control-band' && o.control ? findTargetBandInLane(item, o.control.size, o.control.rf, o.marginPct) : null;
    const flags: string[] = [];
    if ((t && isSaturated(t.saturation)) || (c && isSaturated(c.saturation))) flags.push('saturated');
    if (t?.baselineWarning || c?.baselineWarning) flags.push('baseline');
    if (t?.massFlags?.extrapolated) flags.push('extrapolated');
    if (t?.massFlags?.belowLoq) flags.push('below LOQ');
    const nv = o.target ? normalizeLaneValue(o.mode, t ? t.net : null, c ? c.net : null, item.totalLaneSignal) : { value: null, reason: 'no target selected' };
    rows.push({ laneId: id, laneIdx: item.laneIdx, label, role, condition: meta.condition, replicate: meta.replicate,
      targetNet: t?.net ?? null, controlNet: c?.net ?? null,
      value: role === 'excluded' ? null : nv.value, reason: role === 'excluded' ? 'excluded' : nv.reason, flags });
  }
  return rows;
}

export function useGelGroups(core: GelCore, ladders: GelLadders, analysis: GelAnalysis, deskewAngle: number) {
  const { s, laneMeta, laneLabels, sourceInfo, appliedTransforms } = core;
  const { allLanesAnalysis, effectiveLadderLaneId } = analysis;
  const targetClusters: TargetBandCluster[] = useMemo(
    () => computeTargetBandClusters(allLanesAnalysis, s.groupMarginPct, ladders.activeLadder.kind),
    [allLanesAnalysis, s.groupMarginPct, ladders.activeLadder.kind]);
  const groupRows = useMemo(() => resolveLaneValues(allLanesAnalysis, {
    ladderLaneId: effectiveLadderLaneId, massLaneId: s.massLaneId, laneMeta, labels: laneLabels,
    target: s.groupTarget, control: s.groupControl, mode: s.groupNorm, marginPct: s.groupMarginPct,
  }), [allLanesAnalysis, effectiveLadderLaneId, s.massLaneId, laneMeta, laneLabels, s.groupTarget, s.groupControl, s.groupNorm, s.groupMarginPct]);
  const controlCondition = s.groupControlCondition || groupRows[0]?.condition || '';
  const groupSummaries: GroupSummary[] = useMemo(
    () => summarizeGroups(groupRows.map(r => ({ laneId: r.laneId, condition: r.condition, replicate: r.replicate, value: r.value, flags: r.flags })), controlCondition, { welch: s.groupWelch }),
    [groupRows, controlCondition, s.groupWelch]);
  const qualityIssues: QualityIssue[] = useMemo(() => dataQualityIssues({
    sourceInfo, appliedTransforms, deskewAngle,
    saturatedBands: allLanesAnalysis.reduce((n, a) => n + a.metrics.filter(m => isSaturated(m.saturation)).length, 0),
    baselineWarnings: allLanesAnalysis.reduce((n, a) => n + a.metrics.filter(m => m.baselineWarning).length, 0),
  }), [sourceInfo, appliedTransforms, deskewAngle, allLanesAnalysis]);
  return { targetClusters, groupRows, groupSummaries, groupControlCondition: controlCondition, qualityIssues };
}
export type GelGroups = ReturnType<typeof useGelGroups>;
```

  The fallback control condition (the first condition) is displayed and editable in the UI. It is not silent, because the picker shows the chosen value.

  In `workspace.ts`: `const groups = useGelGroups(core, ladders, analysis, core.deskewAngle);`, spread `...groups` into the return, and export `GelGroups`.

- [ ] **Step 5: Implement `DataQualityPanel.tsx`.**

```tsx
import type { QualityIssue } from './quality';
/** Warnings that bear on whether the numbers below can be trusted. */
export function DataQualityPanel({ issues }: { issues: QualityIssue[] }) {
  if (issues.length === 0) return <p class="text-xs text-emerald-700 dark:text-emerald-400">Data quality: no issues detected.</p>;
  return (
    <section aria-label="Data quality" class="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs dark:border-amber-900 dark:bg-amber-950/40">
      <h4 class="mb-1 font-bold text-amber-900 dark:text-amber-200">Data quality</h4>
      <ul class="space-y-0.5">
        {issues.map(i => (
          <li class={i.level === 'warn' ? 'text-amber-900 dark:text-amber-200' : 'text-slate-600 dark:text-slate-400'}>
            {i.level === 'warn' ? '⚠ ' : '· '}{i.text}
          </li>
        ))}
      </ul>
    </section>
  );
}
```

- [ ] **Step 6: Implement `GelGroupsView.tsx`.** It has four sections: settings, the lane table, the summary table and the dot plot. Reuse the Tailwind classes seen in `GelQuantTab`.

```tsx
import { useState } from 'preact/hooks';
import { assignByPattern } from './lane-meta';
import { DataQualityPanel } from './DataQualityPanel';
import type { GelWorkspace } from './workspace';

const fmt = (v: number | null | undefined, d = 3) => (v === null || v === undefined || !Number.isFinite(v) ? '–' : v.toPrecision(d));
const fmtP = (p: number) => (p < 0.001 ? '<0.001' : p.toFixed(3));

export function GelGroupsView({ g }: { g: GelWorkspace }) {
  const { s, set, targetClusters, groupRows, groupSummaries, groupControlCondition, qualityIssues, laneMeta, setLaneMeta, lanes } = g;
  const [pattern, setPattern] = useState({ conditions: '', replicates: 3 });
  const conditions = groupSummaries.map(x => x.condition);
  const refOf = (id: string) => { const c = targetClusters.find(t => t.id === id); return c ? { size: c.avgSize, rf: c.avgRf } : null; };
  const idOf = (r: typeof s.groupTarget) => targetClusters.find(t => r && t.avgSize === r.size && Math.abs(t.avgRf - r.rf) < 1e-9)?.id ?? '';
  const editMeta = (laneId: string, patch: Partial<{ condition: string; replicate: number | null; excluded: boolean }>) =>
    setLaneMeta(prev => ({ ...prev, [laneId]: { condition: prev[laneId]?.condition ?? '', replicate: prev[laneId]?.replicate ?? null, excluded: prev[laneId]?.excluded ?? false, ...patch } }));
  const sampleLaneIds = lanes.map(l => l.id).filter(id => groupRows.some(r => r.laneId === id));
  const maxVal = Math.max(1e-12, ...groupSummaries.flatMap(x => x.values));

  return (
    <div class="space-y-4">
      <DataQualityPanel issues={qualityIssues} />

      <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 text-xs">
        <label class="space-y-1"><span class="font-semibold">Target band</span>
          <select class="w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1" value={idOf(s.groupTarget)}
            onChange={e => set({ groupTarget: refOf((e.target as HTMLSelectElement).value) })}>
            <option value="">Choose…</option>{targetClusters.map(c => <option value={c.id}>{c.label}</option>)}
          </select></label>
        <label class="space-y-1"><span class="font-semibold">Normalization</span>
          <select class="w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1" value={s.groupNorm}
            onChange={e => set({ groupNorm: (e.target as HTMLSelectElement).value as typeof s.groupNorm })}>
            <option value="none">None (target net)</option><option value="control-band">Loading-control band</option><option value="total-lane">Total lane protein</option>
          </select></label>
        {s.groupNorm === 'control-band' && (
          <label class="space-y-1"><span class="font-semibold">Loading-control band</span>
            <select class="w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1" value={idOf(s.groupControl)}
              onChange={e => set({ groupControl: refOf((e.target as HTMLSelectElement).value) })}>
              <option value="">Choose…</option>{targetClusters.map(c => <option value={c.id}>{c.label}</option>)}
            </select></label>
        )}
        <label class="space-y-1"><span class="font-semibold">Control condition</span>
          <select class="w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1" value={groupControlCondition}
            onChange={e => set({ groupControlCondition: (e.target as HTMLSelectElement).value })}>
            {conditions.map(c => <option value={c}>{c}</option>)}
          </select></label>
        <label class="flex items-center gap-2"><input type="checkbox" checked={s.groupWelch} onChange={e => set({ groupWelch: (e.target as HTMLInputElement).checked })} />
          Welch t-test vs control (Holm-adjusted)</label>
      </div>

      <details class="text-xs"><summary class="cursor-pointer font-semibold">Assign conditions by pattern</summary>
        <div class="mt-2 flex flex-wrap items-end gap-2">
          <label class="space-y-1"><span>Conditions, in lane order (comma-separated)</span>
            <input class="block rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1" value={pattern.conditions}
              onInput={e => setPattern(p => ({ ...p, conditions: (e.target as HTMLInputElement).value }))} placeholder="ctrl, drug A, drug B" /></label>
          <label class="space-y-1"><span>Replicates each</span>
            <input type="number" min={1} class="block w-20 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1" value={pattern.replicates}
              onInput={e => setPattern(p => ({ ...p, replicates: Number((e.target as HTMLInputElement).value) || 1 }))} /></label>
          <button type="button" class="rounded bg-accent-600 px-3 py-1.5 font-semibold text-white"
            onClick={() => setLaneMeta(prev => ({ ...prev, ...assignByPattern(sampleLaneIds, pattern.conditions.split(',').map(c => c.trim()).filter(Boolean), pattern.replicates) }))}>Apply</button>
        </div>
      </details>

      <div class="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
        <table aria-label="Lane conditions" class="w-full text-xs text-left">
          <thead class="bg-slate-50 dark:bg-slate-800/60 text-[10px] uppercase text-slate-500 dark:text-slate-400">
            <tr><th class="px-3 py-2">Lane</th><th class="px-3 py-2">Condition</th><th class="px-3 py-2">Replicate</th><th class="px-3 py-2">Include</th>
              <th class="px-3 py-2 text-right">Target net</th><th class="px-3 py-2 text-right">Control net</th><th class="px-3 py-2 text-right">Value</th><th class="px-3 py-2">Flags</th></tr>
          </thead>
          <tbody class="divide-y divide-slate-100 dark:divide-slate-800">
            {groupRows.map(r => (
              <tr key={r.laneId}>
                <td class="px-3 py-1.5 font-semibold">{r.label}</td>
                <td class="px-3 py-1.5"><input aria-label={`Condition for ${r.label}`} class="w-32 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-1.5 py-0.5"
                  value={laneMeta[r.laneId]?.condition ?? ''} placeholder={r.condition} onInput={e => editMeta(r.laneId, { condition: (e.target as HTMLInputElement).value })} /></td>
                <td class="px-3 py-1.5"><input aria-label={`Replicate for ${r.label}`} type="number" min={1} class="w-16 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-1.5 py-0.5"
                  value={r.replicate ?? ''} onInput={e => { const v = (e.target as HTMLInputElement).value; editMeta(r.laneId, { replicate: v === '' ? null : Number(v) }); }} /></td>
                <td class="px-3 py-1.5"><input aria-label={`Include ${r.label}`} type="checkbox" checked={r.role !== 'excluded'} onChange={e => editMeta(r.laneId, { excluded: !(e.target as HTMLInputElement).checked })} /></td>
                <td class="px-3 py-1.5 mono text-right">{fmt(r.targetNet, 4)}</td>
                <td class="px-3 py-1.5 mono text-right">{fmt(r.controlNet, 4)}</td>
                <td class="px-3 py-1.5 mono text-right" title={r.reason ?? undefined}>{r.value === null ? <span class="text-slate-500 dark:text-slate-400">– {r.reason}</span> : fmt(r.value, 4)}</td>
                <td class="px-3 py-1.5 text-amber-700 dark:text-amber-400">{r.flags.join(', ')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div class="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
        <table aria-label="Condition summary" class="w-full text-xs text-left">
          <thead class="bg-slate-50 dark:bg-slate-800/60 text-[10px] uppercase text-slate-500 dark:text-slate-400">
            <tr><th class="px-3 py-2">Condition</th><th class="px-3 py-2 text-right">n</th><th class="px-3 py-2 text-right">Mean</th><th class="px-3 py-2 text-right">SD</th>
              <th class="px-3 py-2 text-right">SEM</th><th class="px-3 py-2 text-right">95% CI</th><th class="px-3 py-2 text-right">CV%</th><th class="px-3 py-2 text-right">Fold vs {groupControlCondition || 'control'}</th>
              {s.groupWelch && <th class="px-3 py-2 text-right">p (Holm)</th>}<th class="px-3 py-2">Flags</th></tr>
          </thead>
          <tbody class="divide-y divide-slate-100 dark:divide-slate-800">
            {groupSummaries.map(x => (
              <tr key={x.condition}>
                <td class="px-3 py-1.5 font-semibold">{x.condition}{x.condition === groupControlCondition && <span class="ml-1 text-[9px] uppercase text-slate-500">control</span>}</td>
                <td class="px-3 py-1.5 mono text-right">{x.n}{x.nExcluded > 0 && <span class="text-slate-500"> (+{x.nExcluded} excl.)</span>}</td>
                <td class="px-3 py-1.5 mono text-right">{fmt(x.mean, 4)}</td><td class="px-3 py-1.5 mono text-right">{fmt(x.sd)}</td>
                <td class="px-3 py-1.5 mono text-right">{fmt(x.sem)}</td>
                <td class="px-3 py-1.5 mono text-right">{x.ci95 ? `${fmt(x.ci95[0])} – ${fmt(x.ci95[1])}` : '–'}</td>
                <td class="px-3 py-1.5 mono text-right">{x.cvPct === null ? '–' : x.cvPct.toFixed(1)}</td>
                <td class="px-3 py-1.5 mono text-right">{fmt(x.foldChange)}</td>
                {s.groupWelch && <td class="px-3 py-1.5 mono text-right">{x.test ? fmtP(x.test.pAdj) : '–'}</td>}
                <td class="px-3 py-1.5 text-amber-700 dark:text-amber-400">{x.flags.join(', ')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p class="text-[11px] text-slate-500 dark:text-slate-400">
        Replicates here are lanes on one blot. With n &lt; 3 per condition, SD, CI and p-values are not meaningful; treat independent biological
        replicates (separate blots) as the unit of inference.
      </p>

      <svg role="img" aria-label="Normalized value per condition, each replicate shown with mean ± SD" viewBox={`0 0 ${Math.max(200, 90 * groupSummaries.length)} 180`} class="w-full max-w-2xl">
        {groupSummaries.map((x, i) => {
          const cx = 45 + i * 90, y = (v: number) => 160 - (v / maxVal) * 140;
          return (
            <g key={x.condition}>
              {x.values.map((v, k) => <circle cx={cx - 12 + (k % 5) * 6} cy={y(v)} r={3} class="fill-accent-600" />)}
              {x.mean !== null && <line x1={cx - 18} x2={cx + 18} y1={y(x.mean)} y2={y(x.mean)} class="stroke-slate-900 dark:stroke-slate-100" stroke-width={2} />}
              {x.mean !== null && x.sd !== null && <line x1={cx} x2={cx} y1={y(x.mean - x.sd)} y2={y(x.mean + x.sd)} class="stroke-slate-900 dark:stroke-slate-100" />}
              <text x={cx} y={176} text-anchor="middle" class="fill-slate-600 dark:fill-slate-400 text-[10px]">{x.condition}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
```

  In `GelQuantTab.tsx`:
  - Add a third toggle button after the Loading button: `onClick={() => set({ quantSubView: 'groups' })}` with the label `📊 Conditions & Replicates`.
  - Guard the header titles for `'groups'` with the title "Conditions & Replicates" and the subtitle "Normalized target signal per lane, grouped by condition, with replicate statistics".
  - Render `{s.quantSubView === 'groups' && <GelGroupsView g={g} />}` before the existing `s.quantSubView === 'loading' ? … : …` block.
  - Make that block render only when `s.quantSubView !== 'groups'`.

- [ ] **Step 7: Run the tests.** Run `npx vitest run tests/app/gel-quality.test.ts tests/app/gel-groups-values.test.ts tests/app/gel-groups-ui.test.tsx tests/app/gel*.test.tsx && npm run typecheck && npm run lint`. Expected: PASS. Per the memory note on testing: in preact/compat, use `fireEvent.input` for `onInput` handlers. Avoid undefined Tailwind shades; `accent-600` exists.

- [ ] **Step 8: Commit.** Message: `feat(gel): conditions & replicates view with normalization, statistics and data-quality panel`, plus the trailer.

---

### Task 14: Tidy, group and calibration CSVs plus methods text

**Files:**
- Create: `src/tools/gel/export-tables.ts`
- Modify: `src/tools/gel/workspace/exports.ts`, `src/tools/gel/GelQuantTab.tsx` (export buttons), `src/tools/gel/View.tsx` (destructured names), `tests/e2e/gel-export.spec.ts`
- Test: `tests/app/gel-export-tables.test.ts`

**Interfaces:**
- Consumes: `LaneAnalysisItem`, `LaneGroupRow`, `GroupSummary`, `Calibration`, `MassCalibration`, `SourceInfo`, `LaneMeta`.
- Produces:

```ts
export function tidyRows(i: { analysis: LaneAnalysisItem[]; labels: Record<string, string>; roles: Record<string, string>; meta: Record<string, { condition: string; replicate: number | null }>; valueByLane: Record<string, { value: number | null; reason: string | null }>; sizeUnit: string; massUnit: string }): (string | number)[][]
export function groupSummaryRows(s: GroupSummary[], control: string): (string | number)[][]
export function calibrationRows(i: { calibration: Calibration | null; ladderRows: { y: number; assigned: number; fitted: number; residualPct: number }[]; mass: MassCalibration | null; sizeUnit: string }): (string | number)[][]
export function methodsText(i: { source: SourceInfo | null; transforms: string[]; deskewAngle: number; laneWidths: number[]; bgMethod: string; radius: number; prominence: number;
  calibModel: string; calibR2: number | null; massModel: string | null; massR2: number | null; norm: string; welch: boolean; version: string }): string
```

- [ ] **Step 1: Write the failing test.** Create `tests/app/gel-export-tables.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { groupSummaryRows, methodsText, calibrationRows } from '@/tools/gel/export-tables';
import { summarizeGroups } from '@/core/gel/groups';
import { fitCalibration } from '@/core/gel/calibration';

describe('export tables', () => {
  it('group summary has one header and one row per condition, with empty cells for nulls', () => {
    const s = summarizeGroups([{ laneId: 'a', condition: 'ctrl', replicate: 1, value: 1, flags: [] }], 'ctrl');
    const rows = groupSummaryRows(s, 'ctrl');
    expect(rows[0]).toContain('Mean');
    expect(rows).toHaveLength(2);
    expect(rows[1]![rows[0]!.indexOf('SD')]).toBe('');
  });
  it('calibration rows include fit parameters and ladder points', () => {
    const cal = fitCalibration([{ y: 10, size: 100 }, { y: 50, size: 50 }, { y: 90, size: 25 }], 'linear');
    const rows = calibrationRows({ calibration: cal, ladderRows: [{ y: 10, assigned: 100, fitted: 100, residualPct: 0 }], mass: null, sizeUnit: 'kDa' });
    expect(rows.flat().join(' ')).toMatch(/R2/);
    expect(rows.flat()).toContain(100);
  });
  it('methods text states every setting that affects the numbers', () => {
    const t = methodsText({ source: { format: 'tiff', bitDepth: 16, lossy: false, rescaled: false }, transforms: ['crop (exact)'], deskewAngle: 0,
      laneWidths: [20, 22], bgMethod: 'rolling', radius: 40, prominence: 0.05, calibModel: 'monotone', calibR2: 0.998, massModel: null, massR2: null,
      norm: 'control-band', welch: true, version: '0.1.0' });
    for (const k of ['16-bit TIFF', 'rolling', '40', 'monotone', '0.998', 'control', 'Welch', 'Holm', '0.1.0', 'crop']) expect(t).toContain(k);
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails.** Run `npx vitest run tests/app/gel-export-tables.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement `export-tables.ts`.**

```ts
/* Export tables for the gel tool (pure). Empty cell = unknown; never a placeholder number. */
import type { Calibration, MassCalibration } from '@/core/gel/calibration';
import type { GroupSummary } from '@/core/gel/groups';
import type { SourceInfo } from '@/lib/image';
import { isSaturated } from '@/core/gel/quant';
import type { LaneAnalysisItem } from './analysis';

type Cell = string | number;
const num = (v: number | null | undefined, d = 4): Cell => (v === null || v === undefined || !Number.isFinite(v) ? '' : Number(v.toPrecision(d)));

export function tidyRows(i: { analysis: LaneAnalysisItem[]; labels: Record<string, string>; roles: Record<string, string>;
  meta: Record<string, { condition: string; replicate: number | null }>; valueByLane: Record<string, { value: number | null; reason: string | null }>; sizeUnit: string; massUnit: string }): Cell[][] {
  const head = ['Lane', 'Lane_Label', 'Role', 'Condition', 'Replicate', 'Band', 'Peak_Y_px', `Size_${i.sizeUnit}`, `Ladder_Assigned_${i.sizeUnit}`, 'Size_Residual_Pct',
    'Raw', 'Background', 'Net', 'Percent_Of_Lane', 'Ratio_To_Reference', `Mass_${i.massUnit}`, 'Mass_Extrapolated', 'Mass_Below_LOQ',
    'Saturation_Fraction', 'Saturated', 'Baseline_Warning', 'Lane_Normalized_Value', 'Lane_Value_Note'];
  const rows: Cell[][] = [head];
  for (const a of i.analysis) {
    const id = a.lane.id, meta = i.meta[id], lv = i.valueByLane[id];
    for (const m of a.metrics) rows.push([
      a.laneIdx + 1, i.labels[id] || `Lane ${a.laneIdx + 1}`, i.roles[id] ?? 'sample', meta?.condition ?? '', meta?.replicate ?? '', m.number, num(m.peakY, 5),
      num(m.sizeEst), num(m.ladderAssigned), num(m.sizeResidualPct, 3), num(m.raw, 6), num(m.background, 6), num(m.net, 6), num(m.share, 4), num(m.ratio),
      num(m.massEst), m.massFlags ? (m.massFlags.extrapolated ? 'YES' : 'NO') : '', m.massFlags ? (m.massFlags.belowLoq ? 'YES' : 'NO') : '',
      num(m.saturation, 3), m.saturation === null ? 'N/A' : isSaturated(m.saturation) ? 'YES' : 'NO', m.baselineWarning ? 'YES' : 'NO',
      num(lv?.value ?? null, 6), lv?.reason ?? '',
    ]);
  }
  return rows;
}

export function groupSummaryRows(s: GroupSummary[], control: string): Cell[][] {
  const head = ['Condition', 'Is_Control', 'n', 'n_Excluded', 'Mean', 'SD', 'SEM', 'CI95_Low', 'CI95_High', 'CV_Pct', 'Fold_Change_vs_Control', 'Welch_t', 'Welch_df', 'p', 'p_Holm', 'Flags'];
  return [head, ...s.map(g => [g.condition, g.condition === control ? 'YES' : 'NO', g.n, g.nExcluded, num(g.mean, 6), num(g.sd, 6), num(g.sem, 6),
    num(g.ci95?.[0] ?? null, 6), num(g.ci95?.[1] ?? null, 6), num(g.cvPct, 4), num(g.foldChange, 6),
    num(g.test?.t ?? null, 6), num(g.test?.df ?? null, 5), num(g.test?.p ?? null, 4), num(g.test?.pAdj ?? null, 4), g.flags.join('; ')])];
}

export function calibrationRows(i: { calibration: Calibration | null; ladderRows: { y: number; assigned: number; fitted: number; residualPct: number }[]; mass: MassCalibration | null; sizeUnit: string }): Cell[][] {
  const rows: Cell[][] = [];
  if (i.calibration) {
    rows.push(['Size calibration', `model=${i.calibration.model}`, `R2=${i.calibration.r2.toFixed(5)}`, i.calibration.slope !== undefined ? `slope=${i.calibration.slope}` : '', i.calibration.intercept !== undefined ? `intercept=${i.calibration.intercept}` : '']);
    rows.push(['Peak_Y_px', `Assigned_${i.sizeUnit}`, `Fitted_${i.sizeUnit}`, 'Residual_Pct']);
    for (const r of i.ladderRows) rows.push([num(r.y, 5), r.assigned, num(r.fitted), num(r.residualPct, 3)]);
    rows.push([]);
  }
  if (i.mass) {
    const u = i.mass.unit;
    rows.push(['Mass calibration', `model=${i.mass.model}`, `R2=${i.mass.r2.toFixed(5)}`, i.mass.formula, `LOD_${u}=${i.mass.lod ?? ''}`, `LOQ_${u}=${i.mass.loq ?? ''}`, `residualSD_${u}=${i.mass.residualSD ?? ''}`]);
    rows.push(['Net', `Known_${u}`, `Fitted_${u}`, 'Residual']);
    for (const r of i.mass.residuals) rows.push([num(r.netIntensity, 6), r.knownMass, num(r.fittedMass), num(r.residual)]);
  }
  return rows;
}

export function methodsText(i: { source: SourceInfo | null; transforms: string[]; deskewAngle: number; laneWidths: number[]; bgMethod: string; radius: number; prominence: number;
  calibModel: string; calibR2: number | null; massModel: string | null; massR2: number | null; norm: string; welch: boolean; version: string }): string {
  const src = i.source ? `${i.source.bitDepth}-bit ${i.source.format.toUpperCase()}${i.source.lossy ? ' (lossy compression)' : ''}${i.source.rescaled ? ' (float, min–max rescaled)' : ''}` : 'an image of unrecorded format';
  const geo = [...i.transforms, ...(Math.abs(i.deskewAngle) > 1e-6 ? [`deskew ${i.deskewAngle.toFixed(2)}° (bilinear)`] : [])];
  const widths = i.laneWidths.length ? `${Math.min(...i.laneWidths).toFixed(0)}–${Math.max(...i.laneWidths).toFixed(0)} px` : 'n/a';
  const bg = i.bgMethod === 'rolling' ? `a rolling-ball baseline (radius ${i.radius} px)` : i.bgMethod === 'shared' ? `a shared cross-lane baseline (radius ${i.radius} px)` : i.bgMethod === 'valley' ? 'a valley-to-valley baseline' : 'no baseline subtraction';
  const norm = i.norm === 'control-band' ? 'divided by the loading-control band in the same lane' : i.norm === 'total-lane' ? 'divided by the total lane signal (total-protein normalization)' : 'not normalized';
  return [
    `Band densitometry was performed in Bio-Bench v${i.version} on ${src}${geo.length ? `; geometric corrections: ${geo.join(', ')}` : ''}.`,
    `Lane profiles were the mean signal across each lane (width ${widths}); bands were detected at ≥ ${(i.prominence * 100).toFixed(0)} % relative prominence and integrated after ${bg}.`,
    `Bands with more than 1 % of pixels at the detector limits were flagged as saturated.`,
    `Apparent sizes were interpolated from the ladder with a ${i.calibModel} fit of log10(size) vs migration${i.calibR2 !== null ? ` (R² = ${i.calibR2.toFixed(3)})` : ''}.`,
    i.massModel ? `Amounts were read from a ${i.massModel} standard curve${i.massR2 !== null ? ` (R² = ${i.massR2.toFixed(3)})` : ''}; LOD and LOQ were 3.3σ and 10σ of the fit residuals (ICH Q2).` : '',
    `Target signal was ${norm}. Conditions are summarized as mean ± SD with t-based 95 % confidence intervals${i.welch ? '; each condition was compared with the control by Welch\'s t-test with Holm adjustment' : ''}.`,
  ].filter(Boolean).join(' ');
}
```

  In `workspace/exports.ts`:
  - Delete `handleExportCsv` and `handleExportLoadingCsv`, and the `SATURATION_WARN` import.
  - Change the signature to `useGelExports(core, ladders, analysis, groups: GelGroups)`. In `workspace.ts`, reorder so `groups` is computed before `exports`.
  - Add:

```ts
  const base = () => imageName.replace(/\.[^/.]+$/, '') || 'gel';
  function handleExportTidyCsv() {
    const roles: Record<string, string> = {}, meta: Record<string, { condition: string; replicate: number | null }> = {}, valueByLane: Record<string, { value: number | null; reason: string | null }> = {};
    for (const l of lanes) roles[l.id] = laneRole(l.id, core.laneMeta[l.id], analysis.effectiveLadderLaneId, s.massLaneId);
    for (const r of groups.groupRows) { meta[r.laneId] = { condition: r.condition, replicate: r.replicate }; valueByLane[r.laneId] = { value: r.value, reason: r.reason }; }
    const rows = tidyRows({ analysis: allLanesAnalysis, labels: laneLabels, roles, meta, valueByLane, sizeUnit: activeLadder.kind === 'protein' ? 'kDa' : 'bp', massUnit: massCalibration?.unit ?? 'ng' });
    downloadText(toCsv(rows), `${base()}_bands_tidy.csv`, 'text/csv;charset=utf-8');
  }
  function handleExportGroupCsv() {
    downloadText(toCsv(groupSummaryRows(groups.groupSummaries, groups.groupControlCondition)), `${base()}_condition_summary.csv`, 'text/csv;charset=utf-8');
  }
  function handleExportCalibrationCsv() {
    const ladder = allLanesAnalysis.find(a => a.lane.id === analysis.effectiveLadderLaneId);
    const ladderRows = (ladder?.metrics ?? []).filter(m => m.ladderAssigned !== null && m.sizeEst !== null)
      .map(m => ({ y: m.peakY ?? 0, assigned: m.ladderAssigned!, fitted: m.sizeEst!, residualPct: m.sizeResidualPct ?? 0 }));
    downloadText(toCsv(calibrationRows({ calibration, ladderRows, mass: massCalibration, sizeUnit: activeLadder.kind === 'protein' ? 'kDa' : 'bp' })), `${base()}_calibration.csv`, 'text/csv;charset=utf-8');
  }
  function currentMethodsText() {
    return methodsText({ source: core.sourceInfo, transforms: core.appliedTransforms, deskewAngle: core.deskewAngle, laneWidths: lanes.map(l => l.width),
      bgMethod: s.bgMethod, radius: s.rollingRadius, prominence: s.prominence, calibModel: s.calibMethod, calibR2: calibration?.r2 ?? null,
      massModel: massCalibration?.model ?? null, massR2: massCalibration?.r2 ?? null, norm: s.groupNorm, welch: s.groupWelch, version: __APP_VERSION__ });
  }
  function handleExportMethods() { downloadText(currentMethodsText(), `${base()}_methods.txt`); }
  async function handleCopyMethods() { await navigator.clipboard?.writeText(currentMethodsText()); }
```

  - Return the new handlers.
  - Update the SVG footnote to `Quantification: raw-pixel densitometry with ${s.bgMethod} baseline; ${method} ladder calibration (${s.calibMethod}).`.

  In `GelQuantTab.tsx`:
  - Replace the two CSV buttons with four buttons: "Bands CSV (tidy)" → `handleExportTidyCsv`, "Condition summary CSV" → `handleExportGroupCsv`, "Calibration CSV" → `handleExportCalibrationCsv`, "Methods text" → `handleExportMethods`.
  - Add a "Copy methods" button → `handleCopyMethods`.

  In `View.tsx`, replace `handleExportCsv` in the destructure and in any action with `handleExportTidyCsv`.

  In `tests/e2e/gel-export.spec.ts`, replace the old CSV download assertions with downloads named `*_bands_tidy.csv` (header contains `Lane_Normalized_Value`) and `*_condition_summary.csv`. Run `grep -rn "handleExportCsv\|handleExportLoadingCsv\|all_lanes_quantification\|lane_loading_comparison" src tests` and update every hit.

- [ ] **Step 4: Run the tests.** Run `npx vitest run tests/app/gel-export-tables.test.ts tests/app/gel*.test.tsx && npm run typecheck && npm run lint`. Expected: PASS. Then run `npx playwright test tests/e2e/gel-export.spec.ts`. Expected: PASS.

- [ ] **Step 5: Commit.** Message: `feat(gel): tidy per-band, condition-summary and calibration CSVs with a generated methods paragraph`, plus the trailer.

---

### Task 15: Science panel and final verification

**Files:**
- Modify: `src/tools/gel/science.ts`
- Test: whole suite

- [ ] **Step 1: Update `science.ts`.** Replace or extend these paragraphs:
  - saturation (> 1 % of band pixels; not assessable for rescaled float images)
  - monotone cubic (Fritsch & Carlson 1980)
  - ladder matching (tolerates missed or extra bands; manual override)
  - rolling ball (ball structuring element; widen the radius for wide bands)
  - LOD/LOQ (ICH Q2(R1), 3.3σ/10σ)
  - replicate statistics (sample SD, t-based CI, Welch + Holm, n ≥ 3 guidance, lanes on one blot are technical replicates)

  Keep the file's existing structure and citation style.

- [ ] **Step 2: Run the full gate.** Run `npm run typecheck && npm run lint && npm test`. Expected: all PASS. Then run `npx playwright test tests/e2e/gel-export.spec.ts tests/e2e/layout-fix.spec.ts`. Expected: PASS.

- [ ] **Step 3: Check the app manually** with the `run` skill. Launch the app and open the gel tool with the demo gel. Check that:
  - the Quant tab shows the Conditions & Replicates view
  - applying the pattern "ctrl, drug" × 2 gives the summary table
  - the Welch toggle shows p-values
  - the data-quality panel appears
  - loading a JPEG shows the compression warning

  Take a screenshot of the Groups view.

- [ ] **Step 4: Commit.** Message: `docs(gel): science notes for saturation, sizing, baselines, LOD/LOQ and replicate statistics`, plus the trailer.
