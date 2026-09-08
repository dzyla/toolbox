# Cryo-EM Projection Studio Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add rotating density-map projections and evenly sampled cryo-EM template projection series to the MRC viewer.

**Architecture:** Add deterministic, browser-safe volume projection utilities to `src/core/cryoem/mrc.ts`. The existing `MrcViewer` consumes these functions in new Project map and Template series modes, while current orthoslice/MIP tools move beneath an Inspect map task. Canvas rendering remains shared through `renderSliceToCanvas`.

**Tech Stack:** TypeScript, Preact, Vitest, Tailwind CSS, Canvas 2D.

**Spec:** `docs/superpowers/specs/2026-09-08-cryoem-projection-studio-design.md`

## Global Constraints

- Add no runtime dependencies.
- Preserve current MRC viewer modes and exports.
- Standard projection is a density sum, not a MIP.
- Template orientations are near-even equal-area directions over the unit sphere.
- Limit template generation to 256 projections.

---

### Task 1: Volume-projection core

**Files:**

- Modify: `src/core/cryoem/mrc.ts`
- Modify: `tests/core/cryoem.test.ts`

**Interfaces:**

- Produces: `projectVolume(data, angles): ProjectionImage`
- Produces: `sampleProjectionOrientations(spacingDeg): ProjectionOrientation[]`
- `ProjectionImage` contains `width`, `height`, and a `Float32Array` density sum.

- [x] **Step 1: Write failing tests**

```ts
expect(projectVolume(volume, { x: 0, y: 0, z: 0 }).data).toEqual(new Float32Array([3, 3, 3, 3]));
expect(projectVolume(asymmetricVolume, { x: 0, y: 90, z: 0 }).data).not.toEqual(unrotated.data);
expect(sampleProjectionOrientations(30)).toHaveLength(46);
```

- [x] **Step 2: Run the core test file and verify the new imports fail.**

Run: `npm run test:unit -- tests/core/cryoem.test.ts`

- [x] **Step 3: Implement the minimum projection utilities.**

Add inverse Euler rotation, trilinear sampling that returns zero beyond the volume boundary, Z-axis density summation, a clamped spacing-to-count conversion, and Fibonacci-sphere orientation generation.

- [x] **Step 4: Run the core test file and verify it passes.**

Run: `npm run test:unit -- tests/core/cryoem.test.ts`

### Task 2: Projection Studio UI

**Files:**

- Modify: `src/tools/cryoem/MrcViewer.tsx`
- Modify: `tests/app/cryo-mrc-viewer.test.tsx`

**Interfaces:**

- Consumes: `projectVolume`, `sampleProjectionOrientations`, and `renderSliceToCanvas`.
- Produces: single projection canvas and a generated template gallery for a loaded 3D volume.

- [x] **Step 1: Write failing UI tests.**

```tsx
fireEvent.click(screen.getByRole('button', { name: /Demo 3D Volume/i }));
fireEvent.click(screen.getByRole('button', { name: /Project map/i }));
expect(screen.getByText(/Density projection/i)).toBeTruthy();
fireEvent.click(screen.getByRole('button', { name: /Template series/i }));
expect(screen.getByLabelText(/Angular spacing/i)).toBeTruthy();
```

- [x] **Step 2: Run the UI test file and verify the new controls are missing.**

Run: `npm run test:unit -- tests/app/cryo-mrc-viewer.test.tsx`

- [x] **Step 3: Implement the focused controls and canvases.**

Add the task switcher, compact angle inputs plus view presets, a Project map button and canvas, a template spacing input with count summary and Generate button, a responsive gallery, and lightweight selected-template state. Retain the old gallery, orthoslice, and MIP UI under their appropriate tasks.

- [x] **Step 4: Run the UI test file and verify it passes.**

Run: `npm run test:unit -- tests/app/cryo-mrc-viewer.test.tsx`

### Task 3: Integration verification

**Files:**

- Modify: `tests/app/cryo-mrc-viewer.test.tsx`

- [x] **Step 1: Add a regression test that switches between Project map, Template series, and Inspect map after loading the demo volume.**
- [x] **Step 2: Run the focused core and UI tests.**

Run: `npm run test:unit -- tests/core/cryoem.test.ts tests/app/cryo-mrc-viewer.test.tsx`

- [x] **Step 3: Run type checking, linting, and the full unit suite.**

Run: `npm run typecheck && npm run lint && npm run test:unit`
