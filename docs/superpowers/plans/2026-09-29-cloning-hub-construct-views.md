# Cloning Hub Construct Views Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let cloning-hub users see which source each stretch of the construct came from, open a circular vector or insert by PCR at a place they choose with the primers drawn on it, share the homology overhang between the two primer pairs, and see numbered proteins, per-mutation alignments and before/after views for sequence edits.

**Architecture:** New pure functions in `src/core/cloning/` (segments, geometry, mutation view, edit view, plus additive options on `designNebuilder` and `designInfusion`) feed two shared SVG components (`SourceStrip`, `ConstructDiagram`) used by the NEBuilder, In-Fusion and amino-acid panels. Every new option is optional and unset means today's exact output, so the vendor fixtures stay green.

**Tech Stack:** TypeScript, Preact, Tailwind v4, Vitest + @testing-library/preact, Playwright (e2e).

**Spec:** `docs/superpowers/specs/2026-09-29-cloning-hub-construct-views-design.md`

## Global Constraints

- Vendor fixtures (`tests/core/nebuilder-vendor.test.ts`, `infusion-vendor.test.ts`, `basechanger-vendor.test.ts`, `nebuilder-benchmark.test.ts`) must pass **unchanged** after every task. Never edit files under `tests/fixtures/vendor/`.
- New options are optional; unset/`undefined` must give byte-identical designs to today.
- No vendor source code or vendor data tables in the repo (memory rule). Only our own algorithms.
- Positions are 0-based, half-open inside `src/core`; the UI converts to/from 1-based.
- Do not use `preact/compat` in tool modules (it breaks `fireEvent.change` on `<select>` in tests). Use `preact/hooks` only.
- Only use Tailwind colour shades that exist in `src/styles/app.css` `@theme`; check before using a new shade.
- Colour is never the only cue: every coloured mark also has a number or a text label.
- `role="alert"`/`role="status"` never goes on a `<ul>`; wrap it in a `<div>`.
- Commit messages end with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Test commands: `npx vitest run <file>`; before finishing a task also `npm run typecheck` and `npm run lint`.
- Do not touch the untracked `bioalign.html`.

## Review Focus

Failure modes the spec implies but a straight reading of the tasks would not test; each has a test in the owning task.

1. **Opening across the origin** — a replace region with start > end (wraps), a caret at 0 or at the sequence length, and a region that leaves too little sequence for two primers must give the correct template or a blocker message, never a crash or empty template. (Task 3)
2. **Split next to an end that cannot carry a tail** — a share requested next to a restriction-digested fragment, a share of exactly 0 or 1, and a share combined with a spacer must clamp or block with a message, never produce a primer with a tail on a fragment that has no primer. (Task 4)
3. **In-Fusion share when the vector is not opened by PCR** — the digest/linear vector has no primers, so the share must be ignored with a note, and the marks must still line up. (Task 5)
4. **Two sources with the same name** — colours, segments and primer geometry are keyed by source index, never by name. (Tasks 1, 6)
5. **Mutation at the first or last residue, or to a stop** — the alignment window is truncated at the protein ends, and a `*` mutant protein is shorter than the wild type. (Task 8)

## File Structure

| File | Responsibility |
|---|---|
| `src/core/cloning/source-colors.ts` (new) | Colour palette and readable text colour per source index |
| `src/core/cloning/segments.ts` (new) | `SourceSegment[]` for NEBuilder/In-Fusion products; annotations for the maps |
| `src/core/cloning/geometry.ts` (new) | `PieceGeometry` (region + primer positions) per fragment for the primer maps |
| `src/core/cloning/mutation-view.ts` (new) | Numbered protein lines, per-mutation alignment |
| `src/core/cloning/edit-view.ts` (new) | Before/after view and primer geometry for a sequence edit |
| `src/core/cloning/methods/nebuilder.ts` | + `open` on fragments, + `fwdTailShare` on junctions |
| `src/core/cloning/methods/infusion.ts` | + `vectorShare` setting |
| `src/core/cloning/products.ts` | `infusionMarks` handles a shared arm |
| `src/tools/cloning/hub/SourceStrip.tsx` (new) | Colour strip + legend for the product |
| `src/tools/cloning/hub/ConstructDiagram.tsx` (new) | SVG line diagram: region, primers, tails, marker, click/drag |
| `src/tools/cloning/hub/PrimerMap.tsx` (new) | Adapts `PieceGeometry` to `ConstructDiagram`, links to the primer table |
| `src/tools/cloning/hub/ProteinView.tsx` (new) | Numbered protein and mutation cards with alignment |
| `src/tools/cloning/hub/EditView.tsx` (new) | Before/after sequence and plasmid strip for replace/delete/insert |
| `src/tools/cloning/hub/ProductPreview.tsx` | Legend, strip and source annotations |
| `src/tools/cloning/hub/NebuilderPanel.tsx`, `InfusionPanel.tsx`, `BaseChangerPanel.tsx`, `state.ts` | Wire it all in |
| `docs/cloning-hub.md`, the design spec | Document the new options |

---

### Task 1: Source segments and colours (core)

**Files:**
- Create: `src/core/cloning/source-colors.ts`
- Create: `src/core/cloning/segments.ts`
- Create: `tests/core/helpers.ts` (shared deterministic DNA generator; every later core test imports it)
- Test: `tests/core/cloning-segments.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // source-colors.ts
  export const SOURCE_COLORS: readonly string[];            // 8 colour-blind-safe hex colours
  export const NO_SOURCE_COLOR: string;                      // '#9ca3af'
  export function sourceColor(index: number): string;       // index < 0 -> NO_SOURCE_COLOR
  export function readableOn(hex: string): '#111827' | '#ffffff';
  // segments.ts
  export interface SourceSegment { sourceIndex: number; name: string; start: number; end: number }
  export function nebuilderSegments(design: NebuilderDesign): SourceSegment[];
  export function infusionSegments(design: InfusionDesign, vector: { sourceIndex: number; name: string }, inserts: Array<{ sourceIndex: number; name: string; length: number }>): SourceSegment[];
  export function segmentAnnotations(segments: SourceSegment[]): Annotation[];
  ```
  `sourceIndex` −1 means bases that belong to no source (spacer, added restriction-site bases).

- [ ] **Step 1: Write the failing test** — `tests/core/cloning-segments.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { designNebuilder, NEBUILDER_DEFAULTS, type NebuilderFragment } from '@/core/cloning/methods/nebuilder';
import { designInfusion } from '@/core/cloning/methods/infusion';
import { infusionSegments, nebuilderSegments, segmentAnnotations } from '@/core/cloning/segments';
import { readableOn, sourceColor, SOURCE_COLORS } from '@/core/cloning/source-colors';
import { randomDna } from './helpers';

const pcr = (name: string, seed: number, length = 300, topology: 'linear' | 'circular' = 'linear'): NebuilderFragment =>
  ({ name, sequence: randomDna(length, seed), topology, kind: 'pcr' });

describe('source colours', () => {
  it('cycles a fixed palette and greys out "no source"', () => {
    expect(sourceColor(0)).toBe(SOURCE_COLORS[0]);
    expect(sourceColor(SOURCE_COLORS.length)).toBe(SOURCE_COLORS[0]);
    expect(sourceColor(-1)).toBe('#9ca3af');
    expect(new Set(SOURCE_COLORS).size).toBe(SOURCE_COLORS.length);
  });
  it('picks dark text on light colours and white on dark ones', () => {
    expect(readableOn('#F0E442')).toBe('#111827');
    expect(readableOn('#0072B2')).toBe('#ffffff');
  });
});

describe('nebuilderSegments', () => {
  const settings = { ...NEBUILDER_DEFAULTS, circularize: false };

  it('partitions a linear assembly by source, in product coordinates', () => {
    const design = designNebuilder([pcr('A', 1), pcr('B', 2), pcr('C', 3)], settings);
    const segments = nebuilderSegments(design);
    expect(segments.map(s => s.sourceIndex)).toEqual([0, 1, 2]);
    expect(segments[0]).toMatchObject({ start: 0, end: 300 });
    expect(segments[1]!.start).toBe(300);
    expect(segments[2]!.end).toBe(design.product.length);
  });

  it('gives a spacer its own no-source segment', () => {
    const design = designNebuilder([pcr('A', 1), pcr('B', 2)], { ...settings, junctions: [{ spacer: 'GGATCC', mode: 'downstream' }] });
    const segments = nebuilderSegments(design);
    expect(segments.map(s => s.sourceIndex)).toEqual([0, -1, 1]);
    expect(segments[1]).toMatchObject({ start: 300, end: 306 });
    expect(segments[2]!.start).toBe(306);
  });

  it('keys by source index, so duplicate names stay distinct', () => {
    const design = designNebuilder([pcr('same', 1), pcr('same', 2)], settings);
    expect(nebuilderSegments(design).map(s => s.sourceIndex)).toEqual([0, 1]);
  });

  it('never runs past the product when the closing junction already overlaps', () => {
    const a = randomDna(300, 5);
    const b = randomDna(300, 6);
    const tailOfB = b.slice(-30);
    const design = designNebuilder([
      { name: 'A', sequence: tailOfB + a, topology: 'linear', kind: 'pcr' },
      { name: 'B', sequence: b, topology: 'linear', kind: 'pcr' },
    ], { ...NEBUILDER_DEFAULTS, circularize: true });
    const segments = nebuilderSegments(design);
    expect(Math.max(...segments.map(s => s.end))).toBeLessThanOrEqual(design.product.length);
  });

  it('returns nothing for a failed design', () => {
    expect(nebuilderSegments(designNebuilder([], NEBUILDER_DEFAULTS))).toEqual([]);
  });
});

describe('infusionSegments', () => {
  it('lays out vector then inserts, by hub source index', () => {
    const vector = randomDna(2000, 9);
    const inserts = [{ name: 'X', sequence: randomDna(300, 10) }, { name: 'Y', sequence: randomDna(200, 11) }];
    const design = designInfusion(vector, 'circular', { method: 'linear' }, inserts);
    const segments = infusionSegments(design, { sourceIndex: 2, name: 'vec' }, [
      { sourceIndex: 0, name: 'X', length: 300 }, { sourceIndex: 1, name: 'Y', length: 200 },
    ]);
    expect(segments.map(s => s.sourceIndex)).toEqual([2, 0, 1]);
    expect(segments[0]).toMatchObject({ start: 0, end: 2000 });
    expect(segments[1]).toMatchObject({ start: 2000, end: 2300 });
    expect(segments[2]!.end).toBe(design.product.length);
  });
});

describe('segmentAnnotations', () => {
  it('makes one coloured, numbered annotation per source segment and skips no-source bases', () => {
    const annotations = segmentAnnotations([
      { sourceIndex: 0, name: 'A', start: 0, end: 10 },
      { sourceIndex: -1, name: 'spacer', start: 10, end: 16 },
      { sourceIndex: 1, name: 'B', start: 16, end: 30 },
    ]);
    expect(annotations.map(a => a.name)).toEqual(['1 · A', '2 · B']);
    expect(annotations[0]!.color).toBe(sourceColor(0));
    expect(annotations[1]!.location.segments).toEqual([{ start: 16, end: 30 }]);
    expect(annotations.every(a => a.location.strand === 0)).toBe(true);
  });
});
```

Also create `tests/core/helpers.ts` (not a test file, so vitest does not run it):

```ts
/** Deterministic pseudo-random DNA (LCG), so tests never depend on Math.random. */
export function randomDna(length: number, seed: number): string {
  let state = seed >>> 0;
  let out = '';
  for (let i = 0; i < length; i++) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    out += 'ACGT'[state >>> 30];
  }
  return out;
}
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/core/cloning-segments.test.ts`
Expected: FAIL, "Failed to resolve import '@/core/cloning/segments'".

- [ ] **Step 3: Implement** — `src/core/cloning/source-colors.ts`

```ts
/* One colour per hub source, the same everywhere in the hub. Okabe–Ito palette (colour-blind safe). */

export const SOURCE_COLORS: readonly string[] = ['#0072B2', '#E69F00', '#009E73', '#CC79A7', '#56B4E9', '#D55E00', '#F0E442', '#7A7A7A'];
export const NO_SOURCE_COLOR = '#9ca3af';

export function sourceColor(index: number): string {
  return index < 0 ? NO_SOURCE_COLOR : SOURCE_COLORS[index % SOURCE_COLORS.length]!;
}

/** Dark or white text, whichever contrasts better with the background (WCAG relative luminance). */
export function readableOn(hex: string): '#111827' | '#ffffff' {
  const channel = (offset: number) => {
    const value = parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  const luminance = 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
  return luminance > 0.35 ? '#111827' : '#ffffff';
}
```

`src/core/cloning/segments.ts`:

```ts
/* Which source every stretch of a product came from (product coordinates, 0-based, half-open). */

import type { Annotation } from '@/core/plasmid/model';
import { nextAnnotationId } from './molecule';
import { sourceColor } from './source-colors';
import type { InfusionDesign } from './methods/infusion';
import type { NebuilderDesign } from './methods/nebuilder';

export interface SourceSegment {
  /** Index of the source in the hub's source list; -1 for bases that belong to no source (spacers, added restriction-site bases). */
  sourceIndex: number;
  name: string;
  start: number;
  end: number;
}

/** Same start arithmetic as `nebuilderProduct`; a homology that already overlaps makes neighbouring segments overlap. */
export function nebuilderSegments(design: NebuilderDesign): SourceSegment[] {
  const length = design.product.length;
  if (!length || !design.templates.length) return [];
  const segments: SourceSegment[] = [];
  let end = 0;
  design.templates.forEach((template, index) => {
    const junction = index === 0 ? undefined : design.junctions[index - 1]!;
    const spacer = junction?.spacer.length ?? 0;
    if (spacer) segments.push({ sourceIndex: -1, name: 'spacer', start: end, end: end + spacer });
    const start = index === 0 ? 0 : end + spacer - junction!.intrinsicOverlap;
    end = start + template.sequence.length;
    segments.push({ sourceIndex: index, name: template.name, start, end: Math.min(end, length) });
  });
  const closing = design.junctions.length === design.templates.length ? design.junctions[design.junctions.length - 1] : undefined;
  if (closing?.spacer.length) {
    const last = segments[segments.length - 1]!;
    segments.push({ sourceIndex: -1, name: 'spacer', start: last.end, end: Math.min(length, last.end + closing.spacer.length) });
  }
  return segments;
}

/** Vector, added left site, inserts in order, added right site — the layout `infusionProduct` builds. */
export function infusionSegments(
  design: InfusionDesign,
  vector: { sourceIndex: number; name: string },
  inserts: Array<{ sourceIndex: number; name: string; length: number }>,
): SourceSegment[] {
  if (!design.product) return [];
  const segments: SourceSegment[] = [{ sourceIndex: vector.sourceIndex, name: vector.name, start: 0, end: design.vector.length }];
  let cursor = design.vector.length;
  if (design.leftSite.length) {
    segments.push({ sourceIndex: -1, name: 'restriction site', start: cursor, end: cursor + design.leftSite.length });
    cursor += design.leftSite.length;
  }
  for (const insert of inserts) {
    segments.push({ sourceIndex: insert.sourceIndex, name: insert.name, start: cursor, end: cursor + insert.length });
    cursor += insert.length;
  }
  if (design.rightSite.length) segments.push({ sourceIndex: -1, name: 'restriction site', start: cursor, end: cursor + design.rightSite.length });
  return segments;
}

/** Coloured, numbered regions for the maps and the sequence view; bases with no source get none. */
export function segmentAnnotations(segments: SourceSegment[]): Annotation[] {
  return segments.filter(segment => segment.sourceIndex >= 0 && segment.end > segment.start).map(segment => ({
    id: nextAnnotationId('source'),
    name: `${segment.sourceIndex + 1} · ${segment.name}`,
    type: 'misc_feature',
    location: { segments: [{ start: segment.start, end: segment.end }], strand: 0 },
    qualifiers: { note: [`Source ${segment.sourceIndex + 1}: ${segment.name}`] },
    color: sourceColor(segment.sourceIndex),
    source: 'manual',
  }));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/core/cloning-segments.test.ts`
Expected: PASS (all). If `location.strand: 0` fails typecheck, check `Location` in `src/core/plasmid/model.ts` and use its unstranded value.

- [ ] **Step 5: Typecheck and commit**

```bash
npm run typecheck
git add src/core/cloning/source-colors.ts src/core/cloning/segments.ts tests/core/cloning-segments.test.ts
git commit -m "feat(cloning): source segments and colours for the product

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Source strip, legend and coloured maps in the product preview

**Files:**
- Create: `src/tools/cloning/hub/SourceStrip.tsx`
- Modify: `src/tools/cloning/hub/ProductPreview.tsx`
- Modify: `src/tools/cloning/hub/NebuilderPanel.tsx` (pass `segments`)
- Modify: `src/tools/cloning/hub/InfusionPanel.tsx` (pass `segments`)
- Test: `tests/app/cloning-source-strip.test.tsx`

**Interfaces:**
- Consumes: `SourceSegment`, `segmentAnnotations`, `sourceColor`, `readableOn` (Task 1); `ProductMark`, `Selection` (`@/tools/plasmid/selection`, shape `{ start, end, source: 'analysis', annotationId? }`).
- Produces:
  ```tsx
  export function SourceStrip(props: {
    length: number; segments: SourceSegment[]; marks: ProductMark[];
    selection?: Selection; onSelect: (selection: Selection) => void;
  }): JSX.Element;
  ```
  and `ProductPreview` gains an optional `segments?: SourceSegment[]` prop.

- [ ] **Step 1: Write the failing test** — `tests/app/cloning-source-strip.test.tsx`

```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/preact';
import { SourceStrip } from '@/tools/cloning/hub/SourceStrip';

afterEach(cleanup);

const segments = [
  { sourceIndex: 0, name: 'pUC19', start: 0, end: 600 },
  { sourceIndex: -1, name: 'spacer', start: 600, end: 606 },
  { sourceIndex: 1, name: 'GFP', start: 606, end: 1000 },
];
const marks = [{ label: 'Junction 1: pUC19 → GFP', start: 590, end: 620, kind: 'junction' as const, detail: '591 · 30-bp overlap' }];

describe('SourceStrip', () => {
  it('lists each source with number, name and range, and describes the strip to screen readers', () => {
    render(<SourceStrip length={1000} segments={segments} marks={marks} onSelect={() => {}} />);
    expect(screen.getByRole('img', { name: /pUC19.*GFP/ })).toBeTruthy();
    const legend = screen.getByRole('list', { name: 'Sources in the construct' });
    const items = within(legend).getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[0]!.textContent).toContain('1');
    expect(items[0]!.textContent).toContain('pUC19');
    expect(items[0]!.textContent).toContain('1–600');
    expect(items[1]!.textContent).toContain('GFP');
  });

  it('selects a source range from its legend button', () => {
    const onSelect = vi.fn();
    render(<SourceStrip length={1000} segments={segments} marks={marks} onSelect={onSelect} />);
    fireEvent.click(screen.getByRole('button', { name: /2 · GFP/ }));
    expect(onSelect).toHaveBeenCalledWith({ start: 606, end: 1000, source: 'analysis' });
  });

  it('marks the pressed source', () => {
    render(<SourceStrip length={1000} segments={segments} marks={marks} selection={{ start: 0, end: 600, source: 'analysis' }} onSelect={() => {}} />);
    expect(screen.getByRole('button', { name: /1 · pUC19/ }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: /2 · GFP/ }).getAttribute('aria-pressed')).toBe('false');
  });

  it('draws the spacer and each overlap as labelled shapes', () => {
    const { container } = render(<SourceStrip length={1000} segments={segments} marks={marks} onSelect={() => {}} />);
    expect(container.querySelector('[data-kind="spacer"]')).toBeTruthy();
    expect(container.querySelectorAll('[data-kind="overlap"]')).toHaveLength(1);
  });

  it('renders nothing for an empty product', () => {
    const { container } = render(<SourceStrip length={0} segments={[]} marks={[]} onSelect={() => {}} />);
    expect(container.textContent).toBe('');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/app/cloning-source-strip.test.tsx`
Expected: FAIL, cannot resolve `SourceStrip`.

- [ ] **Step 3: Implement** — `src/tools/cloning/hub/SourceStrip.tsx`

```tsx
import type { ProductMark } from '@/core/cloning/products';
import type { SourceSegment } from '@/core/cloning/segments';
import { readableOn, sourceColor } from '@/core/cloning/source-colors';
import type { Selection } from '@/tools/plasmid/selection';

const WIDTH = 1000;
const HEIGHT = 40;

interface Props {
  length: number;
  segments: SourceSegment[];
  marks: ProductMark[];
  selection?: Selection;
  onSelect: (selection: Selection) => void;
}

const range = (segment: { start: number; end: number }) => `${(segment.start + 1).toLocaleString()}–${segment.end.toLocaleString()}`;

/** A proportional bar of the product, one coloured block per source, with a numbered legend underneath. */
export function SourceStrip({ length, segments, marks, selection, onSelect }: Props) {
  if (!length || !segments.length) return null;
  const x = (position: number) => (position / length) * WIDTH;
  const sources = segments.filter(segment => segment.sourceIndex >= 0);
  const summary = `Where the ${length.toLocaleString()} bp construct comes from: ${segments.map(segment => `${segment.sourceIndex >= 0 ? `${segment.sourceIndex + 1} · ` : ''}${segment.name} ${range(segment)}`).join('; ')}`;
  const pressed = (segment: SourceSegment) => selection?.start === segment.start && selection?.end === segment.end && !selection.annotationId;
  return <div class="space-y-2">
    <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label={summary} class="h-10 w-full">
      <defs>
        <pattern id="overlap-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="6" height="6" fill="#ffffff" fill-opacity="0.35" />
          <line x1="0" y1="0" x2="0" y2="6" stroke="#111827" stroke-width="2" />
        </pattern>
      </defs>
      {segments.map(segment => {
        const color = sourceColor(segment.sourceIndex);
        const width = x(segment.end) - x(segment.start);
        return <g key={`${segment.sourceIndex}-${segment.start}`} data-kind={segment.sourceIndex >= 0 ? 'source' : 'spacer'}>
          <rect x={x(segment.start)} y={4} width={Math.max(width, 1)} height={32} fill={color} stroke="#111827" stroke-opacity="0.4" />
          {segment.sourceIndex >= 0 && width > 34 && <text x={x(segment.start) + width / 2} y={24} text-anchor="middle" font-size="14" font-weight="600" fill={readableOn(color)}>{segment.sourceIndex + 1}</text>}
        </g>;
      })}
      {marks.filter(mark => mark.kind === 'junction').map(mark => <rect key={`${mark.label}-${mark.start}`} data-kind="overlap" x={x(mark.start)} y={2} width={Math.max(x(mark.end) - x(mark.start), 2)} height={36} fill="url(#overlap-hatch)" stroke="#111827" stroke-width="1.5"><title>{`${mark.label} · ${mark.detail}`}</title></rect>)}
    </svg>
    <ul aria-label="Sources in the construct" class="flex flex-wrap gap-2">
      {sources.map(segment => {
        const color = sourceColor(segment.sourceIndex);
        return <li key={`${segment.sourceIndex}-${segment.start}`}>
          <button type="button" aria-pressed={pressed(segment)} onClick={() => onSelect({ start: segment.start, end: segment.end, source: 'analysis' })}
            class={`flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs font-medium hover:bg-slate-50 dark:hover:bg-slate-800 ${pressed(segment) ? 'border-accent-600 ring-1 ring-accent-600 dark:border-accent-400 dark:ring-accent-400' : 'border-slate-300 dark:border-slate-600'}`}>
            <span aria-hidden="true" class="inline-flex h-5 w-5 items-center justify-center rounded text-[11px] font-bold" style={{ background: color, color: readableOn(color) }}>{segment.sourceIndex + 1}</span>
            <span>{segment.sourceIndex + 1} · {segment.name}</span>
            <span class="font-normal text-slate-600 dark:text-slate-400">{range(segment)} · {(segment.end - segment.start).toLocaleString()} bp</span>
          </button>
        </li>;
      })}
    </ul>
    <p class="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400"><svg aria-hidden="true" width="16" height="12"><rect width="16" height="12" fill="url(#overlap-hatch)" stroke="#111827" /></svg> shared homology at a junction</p>
  </div>;
}
```


- [ ] **Step 4: Wire `ProductPreview`**

In `src/tools/cloning/hub/ProductPreview.tsx`:

1. Imports: `import { segmentAnnotations, type SourceSegment } from '@/core/cloning/segments';` and `import { SourceStrip } from './SourceStrip';`.
2. Signature: `export function ProductPreview({ product, fileName, marks, segments }: { product: Molecule; fileName: string; marks: ProductMark[]; segments?: SourceSegment[] })`.
3. Keep `document` (clean, used for downloads and "Open in plasmid workspace") and add a view document with the source regions:

```tsx
const [showSources, setShowSources] = useState(true);
const viewDocument = useMemo(
  () => segments && segments.length && showSources ? { ...document, annotations: [...document.annotations, ...segmentAnnotations(segments)] } : document,
  [document, segments, showSources],
);
```
4. Pass `document: viewDocument` in `mapProps` and to `<SequenceView document={viewDocument} …/>` (downloads and `openInWorkspace` keep using `document`).
5. Directly under the summary `<p>`, before the map:

```tsx
{segments && segments.length > 0 && <div class="space-y-1">
  <SourceStrip length={length} segments={segments} marks={marks} selection={selection} onSelect={setSelection} />
  <label class="flex items-center gap-2 text-xs"><input type="checkbox" checked={showSources} onChange={event => setShowSources(event.currentTarget.checked)} /> Colour the map and sequence by source</label>
</div>}
```
6. Change the text "N features carried from the inputs" to keep counting only `product.annotations.length` (unchanged).

- [ ] **Step 5: Pass segments from the panels**

`NebuilderPanel.tsx`: import `nebuilderSegments` and add
`const segments = useMemo(() => design ? nebuilderSegments(design) : [], [design]);`
then `<ProductPreview product={product} fileName="nebuilder-assembly" marks={marks} segments={segments} />`.
The design's `templates` are in `sources` order, so `sourceIndex` already equals the hub source index.

`InfusionPanel.tsx`: import `infusionSegments` and add
```tsx
const segments = useMemo(() => {
  if (!design || !vectorSource) return [];
  const hubIndex = (id: string) => sources.findIndex(source => source.id === id);
  return infusionSegments(design, { sourceIndex: hubIndex(vectorSource.id), name: vectorSource.document.name },
    insertSources.map((source, index) => ({ sourceIndex: hubIndex(source.id), name: source.document.name, length: inserts[index]!.sequence.length })));
}, [design, vectorSource, insertSources, inserts, sources]);
```
and pass `segments={segments}`.

- [ ] **Step 6: Run the tests, fix existing ones only where source annotations changed a count or order**

Run: `npx vitest run tests/app/cloning-source-strip.test.tsx tests/app/cloning-preview.test.tsx tests/app/cloning-hub.test.tsx`
Expected: new tests PASS. If an existing test counted feature buttons, adjust it to ignore the source annotations (they are named `N · name`); do not weaken any other assertion. Then `npm run typecheck && npm run lint`.

- [ ] **Step 7: Commit**

```bash
git add src/tools/cloning/hub tests/app
git commit -m "feat(cloning): colour the product by source with a numbered strip and legend

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Open a circular PCR source at a chosen place (NEBuilder core)

**Files:**
- Modify: `src/core/cloning/methods/nebuilder.ts` (`NebuilderFragment`, `fragmentTemplate`)
- Test: `tests/core/nebuilder-open.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type OpenSite = { caret: number } | { start: number; end: number };
  // NebuilderFragment.open?: OpenSite
  ```
  `caret`: the circle is opened before base `caret` (0-based; 0 and the sequence length are the same place). `{start, end}`: bases `[start, end)` are removed (`start > end` wraps across the origin; `start === end` is invalid). Applies only when `kind === 'pcr'` and `topology === 'circular'`; otherwise ignored.
  `fragmentTemplate` returns `start` = source index of the template's first base.

- [ ] **Step 1: Write the failing test** — `tests/core/nebuilder-open.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { designNebuilder, fragmentTemplate, NEBUILDER_DEFAULTS, type NebuilderFragment } from '@/core/cloning/methods/nebuilder';
import { randomDna } from './helpers';

const circle = (open?: NebuilderFragment['open'], sequence = 'AAAACCCCGG'): NebuilderFragment =>
  ({ name: 'v', sequence, topology: 'circular', kind: 'pcr', open });

describe('fragmentTemplate with an opening', () => {
  it('leaves an unopened circle exactly as before', () => {
    expect(fragmentTemplate(circle())).toEqual({ sequence: 'AAAACCCCGG', start: 0, findings: [] });
  });

  it('starts a caret-opened circle at the caret', () => {
    expect(fragmentTemplate(circle({ caret: 4 }))).toEqual({ sequence: 'CCCCGGAAAA', start: 4, findings: [] });
  });

  it('treats caret 0 and caret = length as the same place', () => {
    expect(fragmentTemplate(circle({ caret: 0 })).sequence).toBe('AAAACCCCGG');
    expect(fragmentTemplate(circle({ caret: 10 }))).toEqual({ sequence: 'AAAACCCCGG', start: 0, findings: [] });
  });

  it('drops a replaced region and starts after it', () => {
    expect(fragmentTemplate(circle({ start: 2, end: 6 }))).toEqual({ sequence: 'CCGGAA', start: 6, findings: [] });
  });

  it('handles a replaced region that crosses the origin', () => {
    expect(fragmentTemplate(circle({ start: 8, end: 2 }))).toEqual({ sequence: 'AACCCC', start: 2, findings: [] });
  });

  it('accepts a region that ends at the sequence length', () => {
    expect(fragmentTemplate(circle({ start: 6, end: 10 }))).toEqual({ sequence: 'AAAACC', start: 0, findings: [] });
  });

  it.each([
    ['caret past the end', { caret: 11 }],
    ['negative caret', { caret: -1 }],
    ['fractional caret', { caret: 2.5 }],
    ['empty region', { start: 3, end: 3 }],
    ['region start past the end', { start: 10, end: 2 }],
    ['region end past the end', { start: 2, end: 11 }],
  ])('blocks %s with a message', (_label, open) => {
    const result = fragmentTemplate(circle(open));
    expect(result.sequence).toBe('');
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]).toMatchObject({ code: 'INVALID_OPEN_SITE', severity: 'blocker' });
    expect(result.findings[0]!.message).toContain('v');
  });

  it('ignores an opening on a linear or digested fragment', () => {
    expect(fragmentTemplate({ ...circle({ caret: 4 }), topology: 'linear' }).sequence).toBe('AAAACCCCGG');
  });
});

describe('designNebuilder with an opened vector', () => {
  const vector = randomDna(3000, 21);
  const insert = randomDna(400, 22);
  const fragments = (open: NebuilderFragment['open']): NebuilderFragment[] => [
    { name: 'vec', sequence: vector, topology: 'circular', kind: 'pcr', isVectorBackbone: true, open },
    { name: 'gene', sequence: insert, topology: 'linear', kind: 'pcr' },
  ];

  it('amplifies the vector from the opening and puts the insert there', () => {
    const design = designNebuilder(fragments({ caret: 1000 }), NEBUILDER_DEFAULTS);
    expect(design.findings.filter(f => f.severity === 'blocker')).toEqual([]);
    const rotated = vector.slice(1000) + vector.slice(0, 1000);
    expect(design.templates[0]).toMatchObject({ sequence: rotated, start: 1000 });
    expect(design.product.startsWith(rotated)).toBe(true);
    expect(design.product.slice(rotated.length, rotated.length + insert.length)).toBe(insert);
    const forward = design.primers.find(p => p.name === 'vec_fwd')!;
    expect(rotated.startsWith(forward.anneal)).toBe(true);
  });

  it('replaces a region: the product no longer contains the removed bases', () => {
    const design = designNebuilder(fragments({ start: 1000, end: 1200 }), NEBUILDER_DEFAULTS);
    expect(design.findings.filter(f => f.severity === 'blocker')).toEqual([]);
    expect(design.templates[0]!.sequence).toHaveLength(2800);
    expect(design.product).toHaveLength(2800 + 400);
    expect(design.product.includes(vector.slice(1000, 1200))).toBe(false);
  });

  it('gives a blocker, not a crash, when the region leaves too little to prime', () => {
    const design = designNebuilder(fragments({ start: 10, end: 2990 }), NEBUILDER_DEFAULTS);
    expect(design.primers).toEqual([]);
    expect(design.findings.some(f => f.severity === 'blocker' && f.code === 'PRIMER_DESIGN_FAILED')).toBe(true);
  });

  it('is identical with no opening and with open: undefined', () => {
    expect(designNebuilder(fragments(undefined), NEBUILDER_DEFAULTS)).toEqual(designNebuilder(fragments(undefined).map(f => ({ ...f, open: undefined })), NEBUILDER_DEFAULTS));
  });
});
```


- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/core/nebuilder-open.test.ts`
Expected: FAIL (`open` is not a known property / unopened tests pass, opened ones fail).

- [ ] **Step 3: Implement** — in `src/core/cloning/methods/nebuilder.ts`

Add above `NebuilderFragment`:

```ts
/** Where a circular PCR source is opened: before a base (`caret`, 0-based) or by removing bases [start, end) (start > end wraps the origin). */
export type OpenSite = { caret: number } | { start: number; end: number };
```

Add to `NebuilderFragment`:

```ts
  /** Only for a circular `pcr` source: where to open the circle. Unset amplifies the circle as given. */
  open?: OpenSite;
```

Change the first line of the `pcr` branch in `fragmentTemplate` and add the helper:

```ts
  if (fragment.kind === 'pcr') {
    if (!fragment.open || fragment.topology !== 'circular') return { sequence, start: 0, findings: [] };
    return openedTemplate(fragment, sequence, fragment.open);
  }
```

```ts
function openedTemplate(fragment: NebuilderFragment, sequence: string, open: OpenSite): { sequence: string; start: number; findings: Finding[] } {
  const n = sequence.length;
  const invalid = (message: string) => ({
    sequence: '', start: 0,
    findings: [{ code: 'INVALID_OPEN_SITE', severity: 'blocker' as const, message: `${fragment.name}: ${message}`, fragmentId: fragment.name }],
  });
  if ('caret' in open) {
    if (!Number.isInteger(open.caret) || open.caret < 0 || open.caret > n) return invalid(`choose an opening position from 0 to ${n}.`);
    const start = open.caret % n;
    return { sequence: sequence.slice(start) + sequence.slice(0, start), start, findings: [] };
  }
  const { start, end } = open;
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || start >= n || end < 0 || end > n) {
    return invalid(`the replaced region must lie within the ${n} bp sequence.`);
  }
  const first = end % n;
  const removed = (((first - start) % n) + n) % n;
  if (removed === 0) return invalid('the replaced region is empty; open at a position instead.');
  return { sequence: (sequence.slice(first) + sequence.slice(0, first)).slice(0, n - removed), start: first, findings: [] };
}
```

- [ ] **Step 4: Run tests, then the vendor fixtures**

Run: `npx vitest run tests/core/nebuilder-open.test.ts tests/core/cloning-segments.test.ts tests/core/nebuilder-vendor.test.ts tests/core/nebuilder-benchmark.test.ts`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/cloning/methods/nebuilder.ts tests/core
git commit -m "feat(cloning): open a circular NEBuilder PCR source at a position or by replacing a region

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Free split of the overlap between the two primer pairs (NEBuilder core)

**Files:**
- Modify: `src/core/cloning/methods/nebuilder.ts` (`JunctionOptions`, `buildOverlap`, `designNebuilder`)
- Test: `tests/core/nebuilder-split.test.ts`

**Interfaces:**
- Produces: `JunctionOptions.fwdTailShare?: number` — fraction (0–1) of the overlap carried as the tail of the **downstream** fragment's forward primer; the rest is carried as the tail of the **upstream** fragment's reverse primer. When set, `mode` is ignored. 0 = all on the upstream reverse primer, 1 = all on the downstream forward primer. Clamped with an `info` finding `SHARE_ADJUSTED` when a side has no primer. Unset keeps NEBuilder's own rule.
- Consumes: `wallaceTm`, `MIN_OVERLAP_WALLACE_TM` (already in the file).

- [ ] **Step 1: Write the failing test** — `tests/core/nebuilder-split.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { PRESET_PLASMIDS } from '@/core/plasmid';
import { designNebuilder, NEBUILDER_DEFAULTS, type NebuilderFragment } from '@/core/cloning/methods/nebuilder';
import { wallaceTm } from '@/core/cloning/neb-tm';
import { reverseComplement } from '@/core/nucleic/sequence';
import { randomDna } from './helpers';

const A: NebuilderFragment = { name: 'A', sequence: randomDna(300, 31), topology: 'linear', kind: 'pcr' };
const B: NebuilderFragment = { name: 'B', sequence: randomDna(300, 32), topology: 'linear', kind: 'pcr' };
const linear = { ...NEBUILDER_DEFAULTS, circularize: false };

describe('fwdTailShare', () => {
  it.each([0, 0.25, 0.5, 0.75, 1])('share %s puts that fraction on the downstream forward primer', share => {
    const design = designNebuilder([A, B], { ...linear, junctions: [{ fwdTailShare: share }] });
    expect(design.findings.filter(f => f.severity === 'blocker')).toEqual([]);
    const junction = design.junctions[0]!;
    const onForward = junction.upstreamTail.length;
    const onReverse = junction.downstreamTail.length;
    expect(onForward + onReverse).toBe(junction.overlapLength);
    expect(onForward).toBe(Math.min(junction.overlapLength, Math.round(junction.overlapLength * share)));
    const overlap = A.sequence.slice(A.sequence.length - onForward) + B.sequence.slice(0, onReverse);
    expect(wallaceTm(overlap)).toBeGreaterThanOrEqual(48);
    expect(design.primers.find(p => p.name === 'B_fwd')!.overlap).toBe(junction.upstreamTail);
    expect(design.primers.find(p => p.name === 'A_rev')!.overlap).toBe(junction.downstreamTail);
    expect(junction.downstreamTail).toBe(reverseComplement(B.sequence.slice(0, onReverse)));
    // After PCR the two products share the overlap.
    const productA = A.sequence + B.sequence.slice(0, onReverse);
    const productB = A.sequence.slice(A.sequence.length - onForward) + B.sequence;
    expect(productA.endsWith(overlap)).toBe(true);
    expect(productB.startsWith(overlap)).toBe(true);
  });

  it('share 0 matches the existing all-downstream placement', () => {
    const shared = designNebuilder([A, B], { ...linear, junctions: [{ fwdTailShare: 0 }] });
    const forced = designNebuilder([A, B], { ...linear, junctions: [{ mode: 'downstream' }] });
    expect(shared.primers).toEqual(forced.primers);
  });

  it('share 1 matches the existing all-upstream placement', () => {
    const shared = designNebuilder([A, B], { ...linear, junctions: [{ fwdTailShare: 1 }] });
    const forced = designNebuilder([A, B], { ...linear, junctions: [{ mode: 'upstream' }] });
    expect(shared.primers).toEqual(forced.primers);
  });

  it('leaves designs without a share exactly as before', () => {
    expect(designNebuilder([A, B], { ...linear, junctions: [{}] })).toEqual(designNebuilder([A, B], linear));
    expect(designNebuilder([A, B], { ...linear, junctions: [{ fwdTailShare: undefined }] })).toEqual(designNebuilder([A, B], linear));
  });

  it('moves the whole overlap to the PCR side when the neighbour is a restriction digest', () => {
    const puc19 = PRESET_PLASMIDS.find(plasmid => plasmid.id === 'puc19')!.seq;
    const backbone: NebuilderFragment = { name: 'bb', sequence: puc19, topology: 'circular', kind: 'digest', leftEnzyme: 'HindIII', rightEnzyme: 'EcoRI', isVectorBackbone: true };
    const design = designNebuilder([backbone, A], { ...NEBUILDER_DEFAULTS, junctions: [{ fwdTailShare: 0.5 }, undefined] });
    expect(design.findings.some(f => f.code === 'SHARE_ADJUSTED' && f.severity === 'info')).toBe(true);
    const junction = design.junctions[0]!;
    expect(junction.downstreamTail).toBe('');
    expect(junction.upstreamTail.length).toBeGreaterThanOrEqual(20);
  });

  it('blocks a spacer with a genuine split but allows one at share 0', () => {
    const blocked = designNebuilder([A, B], { ...linear, junctions: [{ fwdTailShare: 0.5, spacer: 'GGATCC' }] });
    expect(blocked.findings.some(f => f.code === 'SPACER_NEEDS_PLACEMENT')).toBe(true);
    const allowed = designNebuilder([A, B], { ...linear, junctions: [{ fwdTailShare: 0, spacer: 'GGATCC' }] });
    expect(allowed.findings.filter(f => f.severity === 'blocker')).toEqual([]);
    expect(allowed.junctions[0]!.spacer).toBe('GGATCC');
  });

  it('warns about primers longer than 60 nt only when a share was chosen', () => {
    const long = designNebuilder([A, B], { ...linear, minOverlap: 75, junctions: [{ fwdTailShare: 1 }] });
    expect(long.findings.some(f => f.code === 'LONG_PRIMER' && f.severity === 'warning')).toBe(true);
    const plain = designNebuilder([A, B], { ...linear, minOverlap: 75 });
    expect(plain.findings.some(f => f.code === 'LONG_PRIMER')).toBe(false);
  });

  it('clamps a share outside 0–1', () => {
    const over = designNebuilder([A, B], { ...linear, junctions: [{ fwdTailShare: 7 }] });
    const one = designNebuilder([A, B], { ...linear, junctions: [{ fwdTailShare: 1 }] });
    expect(over.primers).toEqual(one.primers);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/core/nebuilder-split.test.ts`
Expected: FAIL (`fwdTailShare` unknown; share tests fail on equality).

- [ ] **Step 3: Implement** — in `nebuilder.ts`

`JunctionOptions`: add

```ts
  /**
   * Fraction (0–1) of the overlap carried as the tail of the downstream fragment's forward primer; the rest is
   * carried on the upstream fragment's reverse primer. Overrides `mode`. Unset follows NEBuilder's own placement.
   */
  fwdTailShare?: number;
```

Add before `buildOverlap`:

```ts
/** Overlap with an explicit split: `share` of its bases come from the upstream sequence (forward-primer tail), the rest from the downstream sequence. */
function sharedOverlap(upstream: string, downstream: string, minLength: number, share: number, intrinsic: number): { upstreamTail: string; downstreamPart: string; intrinsic: number } {
  const at = (total: number) => {
    const fromUpstream = Math.min(Math.round(total * share), upstream.length);
    const fromDownstream = Math.min(total - fromUpstream, downstream.length);
    return { tail: fromUpstream ? upstream.slice(upstream.length - fromUpstream) : '', part: downstream.slice(0, fromDownstream) };
  };
  let chosen = at(minLength);
  for (let total = minLength; total <= minLength + MAX_OVERLAP_SEARCH; total++) {
    chosen = at(total);
    if (wallaceTm(chosen.tail + chosen.part) >= MIN_OVERLAP_WALLACE_TM) break;
  }
  return { upstreamTail: chosen.tail, downstreamPart: chosen.part, intrinsic };
}
```

Change the `buildOverlap` signature to add `share?: number` as a last parameter, and insert directly after the `if (mode === 'none') …` line:

```ts
  if (mode === 'split' && share !== undefined) return sharedOverlap(upstream, downstream, minLength, share, intrinsic);
```

In `designNebuilder`, replace `const mode = options?.mode ?? defaultMode(up, down);` with:

```ts
    let mode = options?.mode ?? defaultMode(up, down);
    let share: number | undefined;
    if (options?.fwdTailShare !== undefined && Number.isFinite(options.fwdTailShare)) {
      let wanted = Math.min(1, Math.max(0, options.fwdTailShare));
      const forwardCarrier = down.kind === 'pcr'; // the downstream forward primer holds the upstream tail
      const reverseCarrier = up.kind === 'pcr';   // the upstream reverse primer holds the downstream part
      const adjusted = !forwardCarrier && wanted > 0 ? 0 : !reverseCarrier && wanted < 1 ? 1 : wanted;
      if (adjusted !== wanted) {
        wanted = adjusted;
        findings.push({ code: 'SHARE_ADJUSTED', severity: 'info', message: `Junction ${up.name} → ${down.name}: ${forwardCarrier || reverseCarrier ? 'one side is a restriction-digested fragment and cannot carry a tail, so the whole overlap goes on the PCR side' : 'neither side can carry a tail'}.`, junctionIndex: index });
      }
      mode = !forwardCarrier && !reverseCarrier ? 'none' : wanted === 0 ? 'downstream' : wanted === 1 ? 'upstream' : 'split';
      share = mode === 'split' ? wanted : undefined;
    }
```

Pass it: `buildOverlap(templates[index]!, templates[next]!, mode, settings.minOverlap, spacer.length > 0, share)`.

After the `primers` are built (just before "// Product:"), add:

```ts
  if (settings.junctions?.some(options => options?.fwdTailShare !== undefined)) {
    for (const item of primers) {
      const length = item.overlap.length + item.spacer.length + item.anneal.length;
      if (length > 60) findings.push({ code: 'LONG_PRIMER', severity: 'warning', message: `${item.name} is ${length} nt long; primers over 60 nt are costly and error-prone. Move part of the overlap to the neighbouring primer.` });
    }
  }
```

Update the file's header comment: append `- An explicit junction share (fwdTailShare) splits the overlap between the two primers by fraction instead of NEBuilder's GC-biased half; it is a Bio-Bench extension and is not part of the reference tests.`

- [ ] **Step 4: Run tests and vendor fixtures**

Run: `npx vitest run tests/core/nebuilder-split.test.ts tests/core/nebuilder-open.test.ts tests/core/nebuilder-vendor.test.ts tests/core/nebuilder-benchmark.test.ts tests/core/cloning-marks.test.ts tests/core/cloning-products.test.ts`
Expected: all PASS. If the spacer test in step 1 fails because the spacer-with-`upstream` path requires `down.kind === 'pcr'`, that is correct behavior; only `A`/`B` PCR fragments are used there.

- [ ] **Step 5: Commit**

```bash
git add src/core/cloning/methods/nebuilder.ts tests/core/nebuilder-split.test.ts
git commit -m "feat(cloning): split a NEBuilder overlap by fraction between the two primer pairs

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Share the In-Fusion vector homology with the vector primers (core)

**Files:**
- Modify: `src/core/cloning/methods/infusion.ts` (`InfusionSettings`, `designInfusion`)
- Modify: `src/core/cloning/products.ts` (`infusionMarks`)
- Test: `tests/core/infusion-split.test.ts`

**Interfaces:**
- Produces: `InfusionSettings.vectorShare?: number` — fraction (0–1) of the vector-junction homology carried on the vector's inverse-PCR primers (as 5′ tails copied from the insert ends). 0 (default) = Takara's rule, all on the insert primers. Only applies when the vector is opened by PCR; otherwise ignored with an `info` finding `SHARE_IGNORED`.
- `infusionMarks` marks the whole shared homology, split in two across the origin when needed.

- [ ] **Step 1: Write the failing test** — `tests/core/infusion-split.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { designInfusion } from '@/core/cloning/methods/infusion';
import { infusionMarks } from '@/core/cloning/products';
import { reverseComplement } from '@/core/nucleic/sequence';
import { randomDna } from './helpers';

const vector = randomDna(2000, 41);
const insert = randomDna(300, 42);
const inserts = [{ name: 'gene', sequence: insert }];
const inverse = { method: 'pcr' as const, caret: 500 };

describe('vectorShare', () => {
  it('is identical to today at 0 and when unset', () => {
    const base = designInfusion(vector, 'circular', inverse, inserts);
    expect(designInfusion(vector, 'circular', inverse, inserts, { vectorShare: 0 })).toEqual(base);
    expect(designInfusion(vector, 'circular', inverse, inserts, { vectorShare: undefined })).toEqual(base);
  });

  it('carries part of the left homology on the vector reverse primer', () => {
    const design = designInfusion(vector, 'circular', inverse, inserts, { vectorShare: 0.5 });
    expect(design.findings.filter(f => f.severity === 'blocker')).toEqual([]);
    const b = 8; // Math.round(15 * 0.5)
    const a = 15 - b;
    const insertForward = design.primers.find(p => p.name === 'gene_fwd')!;
    const vectorReverse = design.primers.find(p => p.name === 'vector_rev')!;
    expect(insertForward.extension).toBe(design.vector.slice(-a));
    expect(vectorReverse.extension).toBe(reverseComplement(insert.slice(0, b)));
    const overlap = design.vector.slice(-a) + insert.slice(0, b);
    expect((design.vector + insert.slice(0, b)).endsWith(overlap)).toBe(true);
    expect((design.vector.slice(-a) + insert).startsWith(overlap)).toBe(true);
    expect(overlap).toHaveLength(15);
  });

  it('carries the matching part of the right homology on the vector forward primer', () => {
    const design = designInfusion(vector, 'circular', inverse, inserts, { vectorShare: 0.5 });
    const insertReverse = design.primers.find(p => p.name === 'gene_rev')!;
    const vectorForward = design.primers.find(p => p.name === 'vector_fwd')!;
    expect(vectorForward.extension).toBe(insert.slice(-8));
    expect(insertReverse.extension).toBe(reverseComplement(design.vector.slice(0, 7)));
  });

  it('does not change the product', () => {
    const base = designInfusion(vector, 'circular', inverse, inserts);
    expect(designInfusion(vector, 'circular', inverse, inserts, { vectorShare: 1 }).product).toBe(base.product);
  });

  it('put all 15 bases on the vector primers at share 1', () => {
    const design = designInfusion(vector, 'circular', inverse, inserts, { vectorShare: 1 });
    expect(design.primers.find(p => p.name === 'gene_fwd')!.extension).toBe('');
    expect(design.primers.find(p => p.name === 'vector_rev')!.extension).toHaveLength(15);
  });

  it('uses the multi-insert length (20) as the total', () => {
    const two = [...inserts, { name: 'tag', sequence: randomDna(200, 43) }];
    const design = designInfusion(vector, 'circular', inverse, two, { vectorShare: 0.5 });
    expect(design.primers.find(p => p.name === 'gene_fwd')!.extension).toHaveLength(10);
    expect(design.primers.find(p => p.name === 'vector_rev')!.extension).toHaveLength(10);
    // The insert–insert junction is untouched.
    expect(design.primers.find(p => p.name === 'tag_fwd')!.extension).toBe(insert.slice(-10));
  });

  it('is ignored, with a note, when the vector is cut or already linear', () => {
    const base = designInfusion(vector, 'circular', { method: 'linear' }, inserts);
    const shared = designInfusion(vector, 'circular', { method: 'linear' }, inserts, { vectorShare: 0.5 });
    expect(shared.primers).toEqual(base.primers);
    expect(shared.findings.some(f => f.code === 'SHARE_IGNORED' && f.severity === 'info')).toBe(true);
  });

  it('clamps a share outside 0–1', () => {
    expect(designInfusion(vector, 'circular', inverse, inserts, { vectorShare: 5 }).primers)
      .toEqual(designInfusion(vector, 'circular', inverse, inserts, { vectorShare: 1 }).primers);
    expect(designInfusion(vector, 'circular', inverse, inserts, { vectorShare: -2 }).primers)
      .toEqual(designInfusion(vector, 'circular', inverse, inserts).primers);
  });
});

describe('infusionMarks with a shared homology', () => {
  const insertMolecules = [{ name: 'gene', sequence: insert, topology: 'linear' as const, annotations: [] }];

  it('marks the whole 15 bp at the left junction and both halves at the right one', () => {
    const design = designInfusion(vector, 'circular', inverse, inserts, { vectorShare: 0.5 });
    const marks = infusionMarks(design, insertMolecules);
    const left = marks.find(m => m.label.startsWith('Junction 1'))!;
    expect(left.end - left.start).toBe(15);
    expect(left.start).toBe(design.vector.length - 7);
    const right = marks.filter(m => m.label.startsWith('Junction 2'));
    expect(right).toHaveLength(2);
    expect(right.reduce((sum, m) => sum + m.end - m.start, 0)).toBe(15);
    for (const mark of right) {
      expect(mark.start).toBeGreaterThanOrEqual(0);
      expect(mark.end).toBeLessThanOrEqual(design.product.length);
    }
  });

  it('keeps the single mark when nothing is shared', () => {
    const design = designInfusion(vector, 'circular', inverse, inserts);
    const marks = infusionMarks(design, insertMolecules);
    expect(marks.filter(m => m.label.startsWith('Junction 2'))).toHaveLength(1);
    expect(marks.find(m => m.label.startsWith('Junction 2'))).toMatchObject({ start: 0, end: 15 });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/core/infusion-split.test.ts`
Expected: FAIL (`vectorShare` unknown).

- [ ] **Step 3: Implement** — in `infusion.ts`

Add to `InfusionSettings`:

```ts
  /** Fraction (0–1) of the vector-junction homology carried on the vector's inverse-PCR primers instead of the insert primers. 0 = Takara's rule. */
  vectorShare?: number;
```

In `designInfusion`, after `const insertOverlap = 10;` and the `VECTOR_TOO_SHORT` check, replace the arm computation and the primer loop as follows.

Replace
```ts
  const leftArm = opened.vector.slice(-vectorOverlap);
  const rightArm = opened.vector.slice(0, vectorOverlap);
```
with
```ts
  const byPcr = 'method' in linearization && linearization.method === 'pcr';
  const requested = Math.min(1, Math.max(0, Number.isFinite(settings.vectorShare) ? settings.vectorShare ?? 0 : 0));
  if (requested > 0 && !byPcr) findings.push({ code: 'SHARE_IGNORED', severity: 'info', message: 'Sharing the homology needs a vector opened by inverse PCR; with a cut or linear vector the insert primers carry all of it (Takara’s rule).' });
  // b bases of the insert ends ride on the vector primers; the other a bases of the vector ends ride on the insert primers.
  const onVector = byPcr ? Math.round(vectorOverlap * requested) : 0;
  const onInsert = vectorOverlap - onVector;
  const leftArm = onInsert ? opened.vector.slice(-onInsert) : '';
  const rightArm = onInsert ? opened.vector.slice(0, onInsert) : '';
```
(`reverseComplement('')` is `''`; confirm in step 4.)

In the vector-primer block replace the two `primer(...)` calls:

```ts
    const firstInsert = cleaned[0]!.sequence;
    const lastInsert = cleaned[cleaned.length - 1]!.sequence;
    primers.push(primer('vector_fwd', 'vector', 'forward', onVector ? lastInsert.slice(-onVector) : '', '', specific.forward, 'vector'));
    primers.push(primer('vector_rev', 'vector', 'reverse', onVector ? reverseComplement(firstInsert.slice(0, onVector)) : '', '', specific.reverse, 'vector'));
```

Also replace `if ('method' in linearization && linearization.method === 'pcr') {` with `if (byPcr) {`. Update the header comment line "Inverse-PCR vectors are amplified with plain primers; all homology is on the inserts." to end with "…unless `vectorShare` moves part of it onto the vector primers (a Bio-Bench extension)."

- [ ] **Step 4: Update `infusionMarks`** — in `products.ts` replace the two homology calls for the vector junctions:

```ts
  const P = design.product.length;
  const sharedLeft = design.primers.find(primer => primer.role === 'vector' && primer.direction === 'reverse')?.extension.length ?? 0;
  const sharedRight = design.primers.find(primer => primer.role === 'vector' && primer.direction === 'forward')?.extension.length ?? 0;
  ...
  if (vectorArm || sharedLeft) homology(`Junction 1: vector → ${inserts[0]!.name}`, design.vector.length - vectorArm, design.vector.length + sharedLeft);
  ...
  const rightArm = ...(unchanged);
  const lastName = inserts[inserts.length - 1]!.name;
  const label = `Junction ${inserts.length + 1}: ${lastName} → vector`;
  const parts = [{ start: P - sharedRight, end: P }, { start: 0, end: rightArm }].filter(part => part.end > part.start);
  parts.forEach((part, index) => homology(parts.length > 1 ? `${label} (part ${index + 1} of 2, across the origin)` : label, part.start, part.end));
```
Remove the old `if (rightArm) homology(...)` line. When `sharedRight` is 0, `parts` is only `[0, rightArm)`, identical to before (label without the suffix). Order of the two parts: the one before the origin first, matching `nebuilderMarks`.

- [ ] **Step 5: Run tests and vendor fixtures**

Run: `npx vitest run tests/core/infusion-split.test.ts tests/core/infusion-vendor.test.ts tests/core/cloning-marks.test.ts tests/core/cloning-products.test.ts`
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add src/core/cloning tests/core/infusion-split.test.ts
git commit -m "feat(cloning): optionally share In-Fusion vector homology with the vector primers

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Primer geometry (core) and the construct diagram (UI)

**Files:**
- Create: `src/core/cloning/geometry.ts`
- Create: `src/tools/cloning/hub/ConstructDiagram.tsx`
- Create: `src/tools/cloning/hub/PrimerMap.tsx`
- Test: `tests/core/cloning-geometry.test.ts`, `tests/app/construct-diagram.test.tsx`

**Interfaces:**
- Produces (`geometry.ts`):
  ```ts
  export interface PrimerSpan { name: string; strand: 'fwd' | 'rev'; start: number; length: number; tailLength: number; tailNeighborIndex?: number }
  export interface PieceGeometry {
    sourceIndex: number; name: string; length: number; topology: 'linear' | 'circular';
    kind: 'pcr' | 'digest';
    region: { start: number; length: number };        // amplified/cut-out part; wraps when start + length > length
    removed?: { start: number; length: number };      // bases skipped inside a circular source
    primers: PrimerSpan[];
  }
  export function nebuilderGeometry(design: NebuilderDesign, fragments: NebuilderFragment[]): PieceGeometry[];
  export function infusionGeometry(design: InfusionDesign, vector: { sourceIndex: number; name: string; length: number }, inserts: Array<{ sourceIndex: number; name: string; length: number }>): PieceGeometry[];
  ```
  Positions are 0-based on the source's top strand. A reverse primer's `start`/`length` describe the top-strand stretch it binds.
- Produces (`ConstructDiagram.tsx`):
  ```tsx
  export interface DiagramPrimer { id: string; label: string; strand: 'fwd' | 'rev'; start: number; length: number; tailLength: number; tailColor: string }
  export interface DiagramProps {
    title: string; length: number; circular?: boolean; color: string;
    region?: { start: number; length: number }; removed?: { start: number; length: number };
    primers?: DiagramPrimer[]; marker?: { position: number; label: string };
    activeId?: string; onActive?: (id: string | undefined) => void;
    onPick?: (position: number) => void; onRegion?: (start: number, end: number) => void;
  }
  export function ConstructDiagram(props: DiagramProps): JSX.Element;
  export function spansOf(start: number, length: number, total: number): Array<[number, number]>; // splits a wrapping stretch
  ```
- Produces (`PrimerMap.tsx`): `PrimerMap({ piece, colorOf, activeId, onActive, onPick, onRegion, marker })`.

- [ ] **Step 1: Write the failing geometry test** — `tests/core/cloning-geometry.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { PRESET_PLASMIDS } from '@/core/plasmid';
import { designInfusion } from '@/core/cloning/methods/infusion';
import { designNebuilder, NEBUILDER_DEFAULTS, type NebuilderFragment } from '@/core/cloning/methods/nebuilder';
import { infusionGeometry, nebuilderGeometry } from '@/core/cloning/geometry';
import { randomDna } from './helpers';

const vector = randomDna(3000, 51);
const insert = randomDna(400, 52);
const fragments = (open?: NebuilderFragment['open']): NebuilderFragment[] => [
  { name: 'vec', sequence: vector, topology: 'circular', kind: 'pcr', isVectorBackbone: true, open },
  { name: 'gene', sequence: insert, topology: 'linear', kind: 'pcr' },
];

describe('nebuilderGeometry', () => {
  it('draws the opened vector from the caret, primers at the ends of the region', () => {
    const list = fragments({ caret: 1000 });
    const pieces = nebuilderGeometry(designNebuilder(list, NEBUILDER_DEFAULTS), list);
    const vec = pieces[0]!;
    expect(vec).toMatchObject({ sourceIndex: 0, name: 'vec', length: 3000, kind: 'pcr', region: { start: 1000, length: 3000 } });
    const fwd = vec.primers.find(p => p.strand === 'fwd')!;
    const rev = vec.primers.find(p => p.strand === 'rev')!;
    expect(fwd.start).toBe(1000);
    expect((rev.start + rev.length) % 3000).toBe(1000);
    expect(vec.removed).toBeUndefined();
  });

  it('reports the removed part of a replaced region and the tail neighbours', () => {
    const list = fragments({ start: 1000, end: 1200 });
    const pieces = nebuilderGeometry(designNebuilder(list, NEBUILDER_DEFAULTS), list);
    const vec = pieces[0]!;
    expect(vec.region).toEqual({ start: 1200, length: 2800 });
    expect(vec.removed).toEqual({ start: 1000, length: 200 });
    const gene = pieces[1]!;
    const geneFwd = gene.primers.find(p => p.strand === 'fwd')!;
    const geneRev = gene.primers.find(p => p.strand === 'rev')!;
    expect(geneFwd.tailLength).toBeGreaterThan(0);
    expect(geneFwd.tailNeighborIndex).toBe(0);
    expect(geneRev.tailNeighborIndex).toBe(0);
  });

  it('tags tails with the right neighbour in a three-fragment circle', () => {
    const list: NebuilderFragment[] = ['a', 'b', 'c'].map((name, i) => ({ name, sequence: randomDna(300, 60 + i), topology: 'linear', kind: 'pcr' }));
    const pieces = nebuilderGeometry(designNebuilder(list, NEBUILDER_DEFAULTS), list);
    expect(pieces[0]!.primers.find(p => p.strand === 'fwd')!.tailNeighborIndex).toBe(2);
    expect(pieces[0]!.primers.find(p => p.strand === 'rev')!.tailNeighborIndex).toBe(1);
    expect(pieces[2]!.primers.find(p => p.strand === 'rev')!.tailNeighborIndex).toBe(0);
  });

  it('keeps duplicate names apart and has no primers on a digested piece', () => {
    const dup: NebuilderFragment[] = [
      { name: 'same', sequence: randomDna(300, 71), topology: 'linear', kind: 'pcr' },
      { name: 'same', sequence: randomDna(300, 72), topology: 'linear', kind: 'pcr' },
    ];
    const pieces = nebuilderGeometry(designNebuilder(dup, NEBUILDER_DEFAULTS), dup);
    expect(pieces.map(p => p.sourceIndex)).toEqual([0, 1]);
    expect(pieces.every(p => p.primers.length === 2)).toBe(true);
  });

  it('returns nothing when the design failed', () => {
    expect(nebuilderGeometry(designNebuilder([], NEBUILDER_DEFAULTS), [])).toEqual([]);
  });
});

describe('infusionGeometry', () => {
  it('places the inverse-PCR vector primers at the ends of the opened vector', () => {
    const design = designInfusion(vector, 'circular', { method: 'pcr', caret: 500 }, [{ name: 'gene', sequence: insert }], { vectorShare: 0.5 });
    const pieces = infusionGeometry(design, { sourceIndex: 0, name: 'vec', length: 3000 }, [{ sourceIndex: 1, name: 'gene', length: 400 }]);
    const vec = pieces[0]!;
    expect(vec.region).toEqual({ start: 500, length: 3000 });
    expect(vec.primers.find(p => p.strand === 'fwd')!.start).toBe(500);
    expect(vec.primers.find(p => p.strand === 'rev')!.tailNeighborIndex).toBe(1);
    const gene = pieces[1]!;
    expect(gene.primers.find(p => p.strand === 'fwd')!.tailLength).toBeGreaterThan(0);
    expect(gene.primers.find(p => p.strand === 'fwd')!.tailNeighborIndex).toBe(0);
  });

  it('shows a cut vector as a band with the removed stretch and no primers', () => {
    const puc19 = PRESET_PLASMIDS.find(plasmid => plasmid.id === 'puc19')!.seq;
    const design = designInfusion(puc19, 'circular', { method: 'digest', enzymes: ['HindIII', 'EcoRI'] }, [{ name: 'gene', sequence: insert }]);
    expect(design.findings.filter(f => f.severity === 'blocker')).toEqual([]);
    const pieces = infusionGeometry(design, { sourceIndex: 0, name: 'pUC19', length: puc19.length }, [{ sourceIndex: 1, name: 'gene', length: 400 }]);
    expect(pieces[0]!.kind).toBe('digest');
    expect(pieces[0]!.primers).toEqual([]);
    expect(pieces[0]!.removed).toBeDefined();
    expect(pieces[0]!.removed!.length).toBe(puc19.length - design.vector.length);
  });
});
```


- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/core/cloning-geometry.test.ts`
Expected: FAIL (module missing).

- [ ] **Step 3: Implement** — `src/core/cloning/geometry.ts`

```ts
/* Where the amplified pieces and their primers sit on their sources, for the primer maps.
   Positions are 0-based on the source's top strand; a stretch may wrap the origin of a circular source. */

import type { InfusionDesign } from './methods/infusion';
import type { NebuilderDesign, NebuilderFragment } from './methods/nebuilder';

export interface PrimerSpan {
  name: string;
  strand: 'fwd' | 'rev';
  /** The stretch of the source this primer's annealing part binds (top-strand coordinates). */
  start: number;
  length: number;
  /** 5′ tail: homology, spacer or site bases that do not bind the source. */
  tailLength: number;
  /** Hub source index of the fragment the tail overlaps. */
  tailNeighborIndex?: number;
}

export interface PieceGeometry {
  sourceIndex: number;
  name: string;
  length: number;
  topology: 'linear' | 'circular';
  kind: 'pcr' | 'digest';
  region: { start: number; length: number };
  removed?: { start: number; length: number };
  primers: PrimerSpan[];
}

const mod = (a: number, n: number) => ((a % n) + n) % n;

export function nebuilderGeometry(design: NebuilderDesign, fragments: NebuilderFragment[]): PieceGeometry[] {
  if (!design.templates.length || design.templates.length !== fragments.length) return [];
  const circle = design.junctions.length === fragments.length;
  // Primers were pushed in fragment order, a forward/reverse pair for every PCR fragment.
  let cursor = 0;
  return fragments.map((fragment, index) => {
    const template = design.templates[index]!;
    const n = fragment.sequence.length;
    const region = { start: template.start, length: template.sequence.length };
    const piece: PieceGeometry = { sourceIndex: index, name: fragment.name, length: n, topology: fragment.topology, kind: fragment.kind, region, primers: [] };
    if (fragment.topology === 'circular' && region.length < n) piece.removed = { start: mod(region.start + region.length, n), length: n - region.length };
    if (fragment.kind !== 'pcr') return piece;
    const fwd = design.primers[cursor++];
    const rev = design.primers[cursor++];
    if (!fwd || !rev) return piece;
    const before = index === 0 ? (circle ? fragments.length - 1 : undefined) : index - 1;
    const after = index === fragments.length - 1 ? (circle ? 0 : undefined) : index + 1;
    const tail = (primer: typeof fwd) => primer.overlap.length + primer.spacer.length;
    piece.primers = [
      { name: fwd.name, strand: 'fwd', start: region.start, length: fwd.anneal.length, tailLength: tail(fwd), tailNeighborIndex: tail(fwd) ? before : undefined },
      { name: rev.name, strand: 'rev', start: mod(region.start + region.length - rev.anneal.length, n), length: rev.anneal.length, tailLength: tail(rev), tailNeighborIndex: tail(rev) ? after : undefined },
    ];
    return piece;
  });
}

export function infusionGeometry(
  design: InfusionDesign,
  vector: { sourceIndex: number; name: string; length: number },
  inserts: Array<{ sourceIndex: number; name: string; length: number }>,
): PieceGeometry[] {
  if (!design.product) return [];
  const n = vector.length;
  const tail = (primer: { extension: string; site: string }) => primer.extension.length + primer.site.length;
  const vectorPrimers = design.primers.filter(primer => primer.role === 'vector');
  const vectorPiece: PieceGeometry = {
    sourceIndex: vector.sourceIndex, name: vector.name, length: n, topology: 'circular', kind: vectorPrimers.length ? 'pcr' : 'digest',
    region: { start: design.vectorStart, length: design.vector.length }, primers: [],
  };
  if (design.vector.length < n) vectorPiece.removed = { start: mod(design.vectorStart + design.vector.length, n), length: n - design.vector.length };
  const first = inserts[0];
  const last = inserts[inserts.length - 1];
  vectorPrimers.forEach(primer => {
    const forward = primer.direction === 'forward';
    vectorPiece.primers.push({
      name: primer.name, strand: forward ? 'fwd' : 'rev',
      start: forward ? design.vectorStart : mod(design.vectorStart + design.vector.length - primer.anneal.length, n), length: primer.anneal.length,
      tailLength: tail(primer), tailNeighborIndex: tail(primer) ? (forward ? last?.sourceIndex : first?.sourceIndex) : undefined,
    });
  });
  const insertPrimers = design.primers.filter(primer => primer.role === 'insert');
  const pieces = inserts.map((insert, index): PieceGeometry => {
    const fwd = insertPrimers[index * 2];
    const rev = insertPrimers[index * 2 + 1];
    const piece: PieceGeometry = { sourceIndex: insert.sourceIndex, name: insert.name, length: insert.length, topology: 'linear', kind: 'pcr', region: { start: 0, length: insert.length }, primers: [] };
    if (fwd) piece.primers.push({ name: fwd.name, strand: 'fwd', start: 0, length: fwd.anneal.length, tailLength: tail(fwd), tailNeighborIndex: index === 0 ? vector.sourceIndex : inserts[index - 1]!.sourceIndex });
    if (rev) piece.primers.push({ name: rev.name, strand: 'rev', start: insert.length - rev.anneal.length, length: rev.anneal.length, tailLength: tail(rev), tailNeighborIndex: index === inserts.length - 1 ? vector.sourceIndex : inserts[index + 1]!.sourceIndex });
    return piece;
  });
  return [vectorPiece, ...pieces];
}
```

- [ ] **Step 4: Run geometry tests**

Run: `npx vitest run tests/core/cloning-geometry.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing diagram test** — `tests/app/construct-diagram.test.tsx`

```tsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/preact';
import { ConstructDiagram, spansOf } from '@/tools/cloning/hub/ConstructDiagram';

afterEach(cleanup);

describe('spansOf', () => {
  it('returns one span inside the sequence and two when it wraps', () => {
    expect(spansOf(10, 20, 100)).toEqual([[10, 30]]);
    expect(spansOf(90, 20, 100)).toEqual([[90, 100], [0, 10]]);
    expect(spansOf(0, 100, 100)).toEqual([[0, 100]]);
    expect(spansOf(0, 0, 100)).toEqual([]);
  });
});

const primers = [
  { id: 'a', label: 'vec_fwd', strand: 'fwd' as const, start: 100, length: 25, tailLength: 20, tailColor: '#E69F00' },
  { id: 'b', label: 'vec_rev', strand: 'rev' as const, start: 75, length: 25, tailLength: 0, tailColor: '#E69F00' },
];

function stubWidth(width = 1000) {
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width, height: 120, right: width, bottom: 120, x: 0, y: 0, toJSON: () => ({}) });
}

describe('ConstructDiagram', () => {
  it('has an accessible summary and a labelled button per primer', () => {
    render(<ConstructDiagram title="vec: amplified region and primers" length={1000} color="#0072B2" region={{ start: 100, length: 900 }} primers={primers} />);
    expect(screen.getByRole('img', { name: /vec: amplified region and primers/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /vec_fwd, forward, 101–125, 20 nt tail/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /vec_rev, reverse, 76–100, no tail/ })).toBeTruthy();
  });

  it('reports the active primer on click and on Enter', () => {
    const onActive = vi.fn();
    render(<ConstructDiagram title="t" length={1000} color="#0072B2" primers={primers} onActive={onActive} />);
    const first = screen.getByRole('button', { name: /vec_fwd/ });
    fireEvent.click(first);
    expect(onActive).toHaveBeenLastCalledWith('a');
    fireEvent.keyDown(screen.getByRole('button', { name: /vec_rev/ }), { key: 'Enter' });
    expect(onActive).toHaveBeenLastCalledWith('b');
  });

  it('picks a position (0-based) from a click on the axis', () => {
    stubWidth();
    const onPick = vi.fn();
    render(<ConstructDiagram title="t" length={1000} color="#0072B2" onPick={onPick} />);
    const surface = screen.getByTestId('diagram-surface');
    fireEvent.pointerDown(surface, { clientX: 500, pointerId: 1 });
    fireEvent.pointerUp(surface, { clientX: 500, pointerId: 1 });
    expect(onPick).toHaveBeenCalledTimes(1);
    const position = onPick.mock.calls[0]![0] as number;
    expect(position).toBeGreaterThan(480);
    expect(position).toBeLessThan(520);
  });

  it('picks a region from a drag, in increasing order', () => {
    stubWidth();
    const onRegion = vi.fn();
    render(<ConstructDiagram title="t" length={1000} color="#0072B2" onRegion={onRegion} />);
    const surface = screen.getByTestId('diagram-surface');
    fireEvent.pointerDown(surface, { clientX: 800, pointerId: 1 });
    fireEvent.pointerUp(surface, { clientX: 200, pointerId: 1 });
    const [start, end] = onRegion.mock.calls[0]! as [number, number];
    expect(start).toBeLessThan(end);
    expect(start).toBeGreaterThan(150);
    expect(end).toBeLessThan(850);
  });

  it('draws a wrapped region as two bands and shows the removed stretch', () => {
    const { container } = render(<ConstructDiagram title="t" length={1000} color="#0072B2" region={{ start: 900, length: 300 }} removed={{ start: 200, length: 700 }} />);
    expect(container.querySelectorAll('[data-part="region"]')).toHaveLength(2);
    expect(container.querySelectorAll('[data-part="removed"]')).toHaveLength(1);
  });

  it('marks a position', () => {
    render(<ConstructDiagram title="t" length={1000} color="#0072B2" marker={{ position: 250, label: 'Insert here (251)' }} />);
    expect(screen.getByText('Insert here (251)')).toBeTruthy();
  });
});
```

- [ ] **Step 6: Run to verify it fails**

Run: `npx vitest run tests/app/construct-diagram.test.tsx`
Expected: FAIL, module missing.

- [ ] **Step 7: Implement** — `src/tools/cloning/hub/ConstructDiagram.tsx`

```tsx
import { useRef, useState } from 'preact/hooks';

export interface DiagramPrimer { id: string; label: string; strand: 'fwd' | 'rev'; start: number; length: number; tailLength: number; tailColor: string }

export interface DiagramProps {
  title: string;
  length: number;
  /** A circular source is drawn unrolled, with its origin marked at both ends. */
  circular?: boolean;
  /** Colour of the source this line belongs to. */
  color: string;
  region?: { start: number; length: number };
  removed?: { start: number; length: number };
  primers?: DiagramPrimer[];
  marker?: { position: number; label: string };
  activeId?: string;
  onActive?: (id: string | undefined) => void;
  /** Click on the line: a 0-based position. */
  onPick?: (position: number) => void;
  /** Drag on the line: a 0-based half-open range. */
  onRegion?: (start: number, end: number) => void;
}

const WIDTH = 1000;
const LEFT = 24;
const RIGHT = WIDTH - 24;
const AXIS = 70;
const HEIGHT = 130;

/** Splits a stretch that may wrap the origin into one or two [start, end) spans. */
export function spansOf(start: number, length: number, total: number): Array<[number, number]> {
  if (length <= 0 || total <= 0) return [];
  if (length >= total) return [[0, total]];
  const from = ((start % total) + total) % total;
  return from + length <= total ? [[from, from + length]] : [[from, total], [0, from + length - total]];
}

const fmt = (n: number) => n.toLocaleString('en-US');

export function ConstructDiagram({ title, length, circular, color, region, removed, primers = [], marker, activeId, onActive, onPick, onRegion }: DiagramProps) {
  const surface = useRef<SVGRectElement>(null);
  const [drag, setDrag] = useState<{ from: number; to: number } | null>(null);
  const x = (position: number) => LEFT + (position / length) * (RIGHT - LEFT);
  const interactive = !!(onPick || onRegion);

  const positionAt = (clientX: number): number => {
    const box = (surface.current?.ownerSVGElement ?? surface.current)?.getBoundingClientRect();
    if (!box || !box.width) return 0;
    const unit = ((clientX - box.left) / box.width) * WIDTH;
    return Math.max(0, Math.min(length, Math.round(((unit - LEFT) / (RIGHT - LEFT)) * length)));
  };

  const summary = [
    title,
    `${fmt(length)} bp${circular ? ', circular, shown unrolled' : ''}`,
    region ? `region ${fmt(region.start + 1)}–${fmt(((region.start + region.length - 1) % length) + 1)}` : '',
    ...primers.map(primer => `${primer.label} ${primer.strand === 'fwd' ? 'forward' : 'reverse'} ${fmt(primer.start + 1)}–${fmt(primer.start + primer.length)}`),
  ].filter(Boolean).join('; ');

  const arrow = (primer: DiagramPrimer, from: number, to: number, head: boolean) => {
    const forward = primer.strand === 'fwd';
    const y = forward ? AXIS - 30 : AXIS + 14;
    const a = x(from);
    const b = Math.max(x(to), a + 3);
    const tip = Math.min(9, (b - a) / 2);
    const points = forward
      ? `${a},${y} ${b - (head ? tip : 0)},${y} ${b},${y + 8} ${b - (head ? tip : 0)},${y + 16} ${a},${y + 16}`
      : `${b},${y} ${a + (head ? tip : 0)},${y} ${a},${y + 8} ${a + (head ? tip : 0)},${y + 16} ${b},${y + 16}`;
    return <polygon points={points} fill="#111827" stroke="#ffffff" stroke-width="1" />;
  };

  return <div class="w-full">
    <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label={summary} class="h-auto w-full touch-none select-none" style={{ maxHeight: '11rem' }}>
      <defs>
        <pattern id="removed-hatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="8" height="8" fill="#fee2e2" />
          <line x1="0" y1="0" x2="0" y2="8" stroke="#b91c1c" stroke-width="2" />
        </pattern>
        <pattern id="tail-hatch" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="5" stroke="#111827" stroke-width="2" />
        </pattern>
      </defs>
      <rect x={LEFT} y={AXIS - 4} width={RIGHT - LEFT} height="8" rx="2" fill="#d1d5db" />
      {removed && spansOf(removed.start, removed.length, length).map(([a, b]) => <rect key={`r${a}`} data-part="removed" x={x(a)} y={AXIS - 8} width={Math.max(x(b) - x(a), 2)} height="16" fill="url(#removed-hatch)" stroke="#b91c1c" />)}
      {region && spansOf(region.start, region.length, length).map(([a, b]) => <rect key={`g${a}`} data-part="region" x={x(a)} y={AXIS - 7} width={Math.max(x(b) - x(a), 2)} height="14" rx="2" fill={color} stroke="#111827" stroke-opacity="0.5" />)}
      {primers.map(primer => {
        const spans = spansOf(primer.start, primer.length, length);
        const forward = primer.strand === 'fwd';
        const active = activeId === primer.id;
        const first = spans[0];
        const tailWidth = Math.max(primer.tailLength ? 8 : 0, Math.min(90, (primer.tailLength / length) * (RIGHT - LEFT)));
        const y = forward ? AXIS - 30 : AXIS + 14;
        const description = `${primer.label}, ${forward ? 'forward' : 'reverse'}, ${fmt(primer.start + 1)}–${fmt(primer.start + primer.length)}, ${primer.tailLength ? `${primer.tailLength} nt tail` : 'no tail'}`;
        return <g key={primer.id} role="button" tabIndex={0} aria-pressed={active} aria-label={description} class="cursor-pointer focus:outline-none" style={{ outline: 'none' }}
          onClick={() => onActive?.(active ? undefined : primer.id)}
          onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onActive?.(active ? undefined : primer.id); } }}>
          {active && first && <rect x={x(first[0]) - 4} y={y - 4} width={Math.max(x(first[1]) - x(first[0]), 3) + 8 + (forward ? 0 : tailWidth)} height="24" rx="4" fill="none" stroke="#2563eb" stroke-width="2.5" />}
          {spans.map(([a, b], i) => <g key={a}>{arrow(primer, a, b, forward ? i === spans.length - 1 : i === 0)}</g>)}
          {primer.tailLength > 0 && first && (forward
            ? <rect data-part="tail" x={x(first[0]) - tailWidth} y={y} width={tailWidth} height="16" fill={primer.tailColor} stroke="#111827" />
            : <rect data-part="tail" x={x(spans[spans.length - 1]![1])} y={y} width={tailWidth} height="16" fill={primer.tailColor} stroke="#111827" />)}
          {primer.tailLength > 0 && first && <rect x={forward ? x(first[0]) - tailWidth : x(spans[spans.length - 1]![1])} y={y} width={tailWidth} height="16" fill="url(#tail-hatch)" fill-opacity="0.35" />}
          {first && <text x={x(first[0])} y={forward ? y - 4 : y + 30} font-size="13" font-weight="600" fill="currentColor">{primer.label}</text>}
        </g>;
      })}
      {marker && <g>
        <line x1={x(marker.position)} x2={x(marker.position)} y1={AXIS - 46} y2={AXIS + 30} stroke="#dc2626" stroke-width="2.5" stroke-dasharray="5 3" />
        <text x={Math.min(x(marker.position) + 6, RIGHT - 160)} y={AXIS + 46} font-size="13" font-weight="600" fill="#b91c1c">{marker.label}</text>
      </g>}
      {drag && <rect x={x(Math.min(drag.from, drag.to))} y={AXIS - 40} width={Math.abs(x(drag.to) - x(drag.from))} height="80" fill="#2563eb" fill-opacity="0.15" stroke="#2563eb" />}
      <text x={LEFT} y={AXIS + 62} font-size="12" fill="currentColor">1</text>
      <text x={RIGHT} y={AXIS + 62} font-size="12" text-anchor="end" fill="currentColor">{fmt(length)}{circular ? ' (origin)' : ''}</text>
      {interactive && <rect ref={surface} data-testid="diagram-surface" x={LEFT} y={AXIS - 12} width={RIGHT - LEFT} height="24" fill="transparent" class="cursor-crosshair"
        onPointerDown={event => { (event.currentTarget as Element).setPointerCapture?.(event.pointerId); const at = positionAt(event.clientX); setDrag({ from: at, to: at }); }}
        onPointerMove={event => setDrag(current => current ? { ...current, to: positionAt(event.clientX) } : current)}
        onPointerUp={event => {
          const end = positionAt(event.clientX);
          const from = drag?.from ?? end;
          setDrag(null);
          if (Math.abs(end - from) * ((RIGHT - LEFT) / length) < 4) onPick?.(end);
          else onRegion?.(Math.min(from, end), Math.max(from, end));
        }}
        onPointerCancel={() => setDrag(null)} />}
    </svg>
    {interactive && <p class="text-xs text-slate-600 dark:text-slate-400">{onRegion ? 'Click the line to choose a position, or drag to choose a region. ' : 'Click the line to choose a position. '}You can also type the numbers.</p>}
  </div>;
}
```

Because `surface` is only rendered when interactive, `positionAt` measures `ownerSVGElement`; in jsdom the stub on `Element.prototype.getBoundingClientRect` covers both.

- [ ] **Step 8: Implement** — `src/tools/cloning/hub/PrimerMap.tsx`

```tsx
import type { PieceGeometry } from '@/core/cloning/geometry';
import { sourceColor } from '@/core/cloning/source-colors';
import { ConstructDiagram } from './ConstructDiagram';

interface Props {
  piece: PieceGeometry;
  activeId?: string;
  onActive?: (id: string | undefined) => void;
  onPick?: (position: number) => void;
  onRegion?: (start: number, end: number) => void;
  marker?: { position: number; label: string };
}

/** Ids tie a drawn primer to its row in the primer table (`primer-<name>`). */
export const primerRowId = (name: string) => `primer-${name}`;

export function PrimerMap({ piece, activeId, onActive, onPick, onRegion, marker }: Props) {
  const what = piece.kind === 'pcr' ? 'amplified region and primers' : 'piece cut out by digestion';
  return <div class="space-y-1">
    <h3 class="text-xs font-semibold">{piece.sourceIndex + 1} · {piece.name}: {what}</h3>
    <ConstructDiagram
      title={`${piece.name}: ${what}`}
      length={piece.length}
      circular={piece.topology === 'circular'}
      color={sourceColor(piece.sourceIndex)}
      region={piece.region}
      removed={piece.removed}
      primers={piece.primers.map(primer => ({
        id: primer.name, label: primer.name, strand: primer.strand, start: primer.start, length: primer.length,
        tailLength: primer.tailLength, tailColor: sourceColor(primer.tailNeighborIndex ?? -1),
      }))}
      marker={marker}
      activeId={activeId}
      onActive={onActive}
      onPick={onPick}
      onRegion={onRegion}
    />
  </div>;
}
```

- [ ] **Step 9: Run tests, typecheck, lint**

Run: `npx vitest run tests/app/construct-diagram.test.tsx tests/core/cloning-geometry.test.ts && npm run typecheck && npm run lint`
Expected: PASS. (`aria-pressed` on `role="button"` inside SVG is valid; if lint objects to `tabIndex` casing use `tabindex`, matching how other Preact SVG in this repo does it.)

- [ ] **Step 10: Commit**

```bash
git add src/core/cloning/geometry.ts src/tools/cloning/hub/ConstructDiagram.tsx src/tools/cloning/hub/PrimerMap.tsx tests
git commit -m "feat(cloning): primer geometry and a construct diagram with primers, tails and click-to-place

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 7: NEBuilder and In-Fusion panels — open where you want, see primers, split the overhang

**Files:**
- Modify: `src/tools/cloning/hub/state.ts`
- Modify: `src/tools/cloning/hub/NebuilderPanel.tsx`
- Modify: `src/tools/cloning/hub/InfusionPanel.tsx`
- Modify: `src/tools/cloning/hub/results.tsx` (give primer rows an id and highlight)
- Test: `tests/app/cloning-primer-maps.test.tsx`, extend nothing else

**Interfaces:**
- Consumes: `nebuilderGeometry`, `infusionGeometry`, `PrimerMap`, `primerRowId`, `OpenSite`, `fwdTailShare`, `vectorShare` (Tasks 3–6).
- Produces (state):
  ```ts
  // FragmentOption gains (UI values are 1-based):
  open?: { mode: 'whole' | 'caret' | 'region'; caret: number; start: number; end: number };
  // NebuilderSettings.junctions[i] gains:
  //   mode: 'default' | 'upstream' | 'downstream' | 'split' | 'custom';  share?: number   (fraction on the downstream forward primer)
  // InfusionSettings gains:  vectorShare: number   (DEFAULT_STATE: 0)
  ```
  `PrimerTable` in `results.tsx` gets optional props `activeName?: string` and `onActiveName?: (name: string | undefined) => void`; each row gets `id={primerRowId(name)}` and is highlighted / click-selectable.

Read `results.tsx` `PrimerTable` (lines ~40–90) and `SourcesPanel.tsx` before editing so the new props match how rows are rendered.

- [ ] **Step 1: Write the failing panel tests** — `tests/app/cloning-primer-maps.test.tsx`

```tsx
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/preact';
import CloningHubView from '@/tools/cloning/View';
import { randomDna } from '../core/helpers';

afterEach(cleanup);

const paste = (text: string) => {
  fireEvent.input(screen.getByLabelText(/Paste FASTA/), { target: { value: text } });
  fireEvent.click(screen.getByRole('button', { name: 'Add pasted sequence' }));
};
const setup = () => {
  location.hash = '#/t/cloning';
  render(<CloningHubView />);
  fireEvent.change(screen.getByLabelText(/Preset vector/), { target: { value: 'puc19' } });
  paste(`>gene\n${randomDna(600, 5)}`);
};

describe('NEBuilder: open the vector where you want', () => {
  it('offers whole circle / position / region for a PCR-made circular source and redraws the map', () => {
    setup();
    fireEvent.change(screen.getByLabelText('How pUC19 is made'), { target: { value: 'pcr' } });
    const choice = screen.getByLabelText('Where to open pUC19') as HTMLSelectElement;
    expect([...choice.options].map(o => o.value)).toEqual(['whole', 'caret', 'region']);
    fireEvent.change(choice, { target: { value: 'caret' } });
    fireEvent.input(screen.getByLabelText('Open pUC19 before base'), { target: { value: '1000' } });
    const map = screen.getByRole('img', { name: /pUC19: amplified region and primers/ });
    expect(map.getAttribute('aria-label')).toContain('region 1,000–999');
    expect(screen.getByRole('button', { name: /pUC19_fwd, forward, 1,000–/ })).toBeTruthy();
  });

  it('shows a message, not a crash, for an impossible region', () => {
    setup();
    fireEvent.change(screen.getByLabelText('How pUC19 is made'), { target: { value: 'pcr' } });
    fireEvent.change(screen.getByLabelText('Where to open pUC19'), { target: { value: 'region' } });
    fireEvent.input(screen.getByLabelText('Replace pUC19 from base'), { target: { value: '5' } });
    fireEvent.input(screen.getByLabelText('Replace pUC19 to base'), { target: { value: '2680' } });
    expect(screen.getAllByText(/pUC19.*(too short|leaves too little|primers)/i).length).toBeGreaterThan(0);
  });
});

describe('NEBuilder: share the overlap between the primer pairs', () => {
  it('has a slider per junction with presets, and the tails follow it', () => {
    setup();
    fireEvent.change(screen.getByLabelText('How pUC19 is made'), { target: { value: 'pcr' } });
    fireEvent.change(screen.getByLabelText('Where to open pUC19'), { target: { value: 'caret' } });
    fireEvent.input(screen.getByLabelText('Open pUC19 before base'), { target: { value: '400' } });
    fireEvent.change(screen.getByLabelText('Placement for pUC19 to gene'), { target: { value: 'custom' } });
    fireEvent.click(screen.getByRole('button', { name: 'All on the left primer' }));
    expect(screen.getAllByTestId('share-summary')[0]!.textContent).toContain('· 0 nt on gene_fwd');
    fireEvent.click(screen.getAllByRole('button', { name: 'All on the right primer' })[0]!);
    expect(screen.getAllByTestId('share-summary')[0]!.textContent).toMatch(/^0 nt on pUC19_rev/);
  });
});

describe('In-Fusion: click-to-place and shared homology', () => {
  it('draws the vector primers for an inverse-PCR position and lets you share the homology', () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: 'In-Fusion' }));
    fireEvent.change(screen.getByLabelText('Linearize the vector by'), { target: { value: 'pcr-caret' } });
    fireEvent.input(screen.getByLabelText('Insert before base'), { target: { value: '500' } });
    expect(screen.getByRole('button', { name: /vector_fwd, forward, 500–/ })).toBeTruthy();
    fireEvent.input(screen.getByLabelText('Share of the vector homology carried by the vector primers'), { target: { value: '50' } });
    expect(screen.getByTestId('share-summary').textContent).toMatch(/8 nt on vector_rev/);
  });
});
```

(The panel step below gives the `Linearize the vector by` select an explicit `aria-label`, so the test can find it.)

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/app/cloning-primer-maps.test.tsx`
Expected: FAIL (controls do not exist).

- [ ] **Step 3: Extend `state.ts`**

```ts
export interface FragmentOption {
  kind: 'pcr' | 'digest';
  enzymeA: string;
  enzymeB: string;
  /** Where a circular PCR source is opened (1-based in the UI). */
  open?: { mode: 'whole' | 'caret' | 'region'; caret: number; start: number; end: number };
}
```
In `NebuilderSettings.junctions` change the value type to `{ spacer: string; mode: 'default' | 'upstream' | 'downstream' | 'split' | 'custom'; share?: number }`.
In `InfusionSettings` add `vectorShare: number;` and in `DEFAULT_STATE.infusion` add `vectorShare: 0`.

- [ ] **Step 4: NEBuilder panel**

In `NebuilderPanel.tsx`:

(a) Build the `open` for each fragment. Add a helper above the component:

```ts
function toOpenSite(chosen: FragmentOption, length: number): OpenSite | undefined {
  const open = chosen.open;
  if (!open || open.mode === 'whole') return undefined;
  if (open.mode === 'caret') return { caret: Math.round(open.caret) - 1 };
  return { start: Math.round(open.start) - 1, end: Math.round(open.end) % length === 0 && Math.round(open.end) === length ? length : Math.round(open.end) };
}
```
Reasoning: UI region is 1-based inclusive `start..end`; core `[start0, end0)` half-open is `start-1 .. end`. So `{ start: start - 1, end }`, and `end` may equal `length` (allowed by the core). Simplify to:
`return { start: Math.round(open.start) - 1, end: Math.round(open.end) };`
(Use this simple form; the ternary above is not needed.) A caret UI value of 1 means "before base 1" = core caret 0.

Add `open: digest ? undefined : toOpenSite(chosen, molecule.sequence.length)` to the fragment object built in the `fragments` map (only meaningful for circular PCR; the core ignores it otherwise).

(b) Junction options: extend the mapping:
```ts
    const entry = settings.junctions[String(index)];
    if (!entry || (!entry.spacer && entry.mode === 'default')) return undefined;
    if (entry.mode === 'custom') return { spacer: entry.spacer, fwdTailShare: (entry.share ?? 50) / 100 };
    return { spacer: entry.spacer, mode: entry.mode === 'default' ? undefined : (entry.mode as OverlapMode) };
```
(`share` is stored as a percentage 0–100 in state for the slider; default 50.)

(c) Geometry: `const pieces = useMemo(() => design ? nebuilderGeometry(design, fragments) : [], [design, JSON.stringify(fragments.map(f => ({ ...f, sequence: f.sequence.length })))])` — add `activeName` state (`useState<string | undefined>()`) shared by maps and the primer table.

(d) "How each fragment is made" rows: for a circular source with `chosen.kind === 'pcr'`, replace the text "a circular sequence is amplified whole" with:

```tsx
<select aria-label={`Where to open ${source.document.name}`} class="rounded border border-slate-300 bg-transparent px-2 py-1 dark:border-slate-600" value={chosen.open?.mode ?? 'whole'}
  onChange={event => setOption(source, { open: { ...(chosen.open ?? { caret: 1, start: 1, end: 2 }), mode: event.currentTarget.value as 'whole' | 'caret' | 'region' } })}>
  <option value="whole">Amplify the whole circle</option>
  <option value="caret">Open at a position (insert goes there)</option>
  <option value="region">Replace a region</option>
</select>
{chosen.open?.mode === 'caret' && <DecimalInput aria-label={`Open ${source.document.name} before base`} class={`${FIELD} w-28`} value={chosen.open.caret} min={1} max={molecule.sequence.length} step={1}
  onChange={value => setOption(source, { open: { ...chosen.open!, caret: Math.min(molecule.sequence.length, Math.max(1, Math.round(value))) } })} />}
{chosen.open?.mode === 'region' && <>
  <DecimalInput aria-label={`Replace ${source.document.name} from base`} class={`${FIELD} w-24`} value={chosen.open.start} min={1} max={molecule.sequence.length} step={1} onChange={value => setOption(source, { open: { ...chosen.open!, start: Math.min(molecule.sequence.length, Math.max(1, Math.round(value))) } })} />
  <DecimalInput aria-label={`Replace ${source.document.name} to base`} class={`${FIELD} w-24`} value={chosen.open.end} min={1} max={molecule.sequence.length} step={1} onChange={value => setOption(source, { open: { ...chosen.open!, end: Math.min(molecule.sequence.length, Math.max(1, Math.round(value))) } })} />
</>}
```
`DecimalInput` renders an `<input>` and calls `onChange` with a number; the tests fire `input` events, so verify in `src/app/components/DecimalInput.tsx` that it commits on `input`, not only `blur`; if it commits on blur only, have the tests `fireEvent.blur` after `input` (adjust the test, not the component).

(e) Primer maps: render, inside the new "Primer maps" section placed between "How each fragment is made" and the "Primers" table, one `PrimerMap` per `pieces[i]` with `kind === 'pcr'`; for a circular PCR piece pass `onPick={position => setOption(source, { open: { ...(chosen.open ?? defaults), mode: 'caret', caret: position + 1 } })}` and `onRegion={(start, end) => setOption(source, { open: { ...(chosen.open ?? defaults), mode: 'region', start: start + 1, end } })}` and a `marker` when `mode === 'caret'` (`{ position: caret - 1, label: \`Open before ${caret}\` }`). Pass `activeId={activeName}` `onActive={setActiveName}`. Digest pieces render with `kind: 'digest'` and no primers, so the map shows the cut-out band.

(f) Primer table: `<PrimerTable … activeName={activeName} onActiveName={setActiveName} />`.

(g) Junction table "Placement" select gains `<option value="custom">Custom split…</option>`; when `entry.mode === 'custom'` add a row cell under Placement:

```tsx
<div class="mt-1 space-y-1">
  <div class="flex flex-wrap gap-1">
    {([['All on the left primer', 0], ['Half and half', 50], ['All on the right primer', 100]] as const).map(([label, value]) =>
      <button key={label} type="button" class={BUTTON} onClick={() => patch({ share: value })}>{label}</button>)}
  </div>
  <input type="range" min={0} max={100} step={1} value={entry.share ?? 50} aria-label={`Share of the overlap on the right primer for ${junction.upstream} to ${junction.downstream}`} onInput={event => patch({ share: Number(event.currentTarget.value) })} />
  <p data-testid="share-summary" class="text-xs">{junction.downstreamTail.length} nt on {junction.upstream}_rev · {junction.upstreamTail.length} nt on {junction.downstream}_fwd</p>
</div>
```
The summary prints `{downstreamTail.length} nt on {up}_rev · {upstreamTail.length} nt on {down}_fwd`. "All on the left primer" gives `20 nt on pUC19_rev · 0 nt on gene_fwd`; "All on the right primer" gives `0 nt on pUC19_rev · 20 nt on gene_fwd`, which is what the test asserts.

Add one line of help text above the table: "Drag the slider to decide how much of each overlap sits on the left (upstream) or right (downstream) primer. Half and half is NEB's usual choice."

(h) The junction `patch` type: `entry` now includes `share?: number`.

- [ ] **Step 5: In-Fusion panel**

`InfusionPanel.tsx`:
- Compute `settings.vectorShare` into the design call: `designInfusion(..., { vectorShare: linearization.method === 'pcr' ? settings.vectorShare / 100 : 0 })` and add it to the memo dependencies. (State stores a percentage 0–100 like the NEBuilder slider; `DEFAULT_STATE.infusion.vectorShare` stays 0.)
- `const pieces = useMemo(() => design && vectorSource ? infusionGeometry(design, { sourceIndex: sources.indexOf(vectorSource), name: vectorSource.document.name, length: vector!.sequence.length }, insertSources.map((source, i) => ({ sourceIndex: sources.indexOf(source), name: source.document.name, length: inserts[i]!.sequence.length }))) : [], [...])`.
- Add `activeName` state; render a "Primer maps" section (before Primers) with a `PrimerMap` per piece. The vector piece gets `onPick` (sets `linearize: 'pcr-caret'`, `caret: position + 1`) and `onRegion` (sets `linearize: 'pcr-region'`, `regionStart: start + 1`, `regionEnd: end`), and a `marker` when caret mode.
- Under the "Open the vector" settings, when `settings.linearize` is `pcr-caret` or `pcr-region`, add:

```tsx
<Labeled label="Share of the vector homology carried by the vector primers" hint="0% = Takara's rule: all on the insert primers. Higher values put part of the overlap on the vector primers (a Bio-Bench option, not in the Takara tool).">
  <input type="range" min={0} max={100} step={1} value={settings.vectorShare} aria-label="Share of the vector homology carried by the vector primers" onInput={event => onSettings({ vectorShare: Number(event.currentTarget.value) })} />
</Labeled>
<p data-testid="share-summary" class="text-xs">{vectorRevTail} nt on vector_rev · {insertFwdTail} nt on {insertSources[0].document.name}_fwd</p>
```
where `vectorRevTail = design?.primers.find(p => p.name === 'vector_rev')?.extension.length ?? 0` and `insertFwdTail = design?.primers.find(p => p.role === 'insert' && p.direction === 'forward')?.extension.length ?? 0`. (Test expects `8 nt on vector_rev`: 50% of 15 rounds to 8.)
- Give the `Linearize the vector by` `<select>` `aria-label="Linearize the vector by"`.
- `PrimerTable … activeName={activeName} onActiveName={setActiveName}` and PrimerMap `activeId={activeName}` `onActive={setActiveName}`.
- Update the Primers `aside` copy: "Extensions match Takara exactly at 0% sharing; the gene-specific part may differ by a base or two".

- [ ] **Step 6: `results.tsx`**

Read `PrimerTable`. Add the optional props `activeName` and `onActiveName`; give each `<tr>` `id={primerRowId(primer.name)}`, `aria-selected`-free styling: `class={activeName === primer.name ? 'bg-accent-50 …' : ''}` — **check `accent-50` is defined in `src/styles/app.css` `@theme`** (memory: only some shades exist); use an existing shade or `bg-slate-100 dark:bg-slate-800`. Clicking a row calls `onActiveName(primer.name === activeName ? undefined : primer.name)`. Import `primerRowId` from `./PrimerMap`.

- [ ] **Step 7: Run tests**

Run: `npx vitest run tests/app/cloning-primer-maps.test.tsx tests/app/cloning-hub.test.tsx tests/app/cloning-preview.test.tsx && npm run typecheck && npm run lint`
Expected: PASS. Fix the test wording noted above if the first run shows the substring problem.

- [ ] **Step 8: Commit**

```bash
git add src/tools/cloning/hub tests/app
git commit -m "feat(cloning): choose where a PCR opens, see the primers, and split the overhang in NEBuilder and In-Fusion

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Numbered protein and per-mutation alignments (core + UI)

**Files:**
- Create: `src/core/cloning/mutation-view.ts`
- Create: `src/tools/cloning/hub/ProteinView.tsx`
- Modify: `src/tools/cloning/hub/BaseChangerPanel.tsx`
- Test: `tests/core/cloning-mutation-view.test.ts`, `tests/app/cloning-protein-view.test.tsx`

**Interfaces:**
- Consumes: `align`, `getMatrix` (`@/core/align`), `translateCodon` (`basechanger.ts`), `AminoAcidResult`, `ParsedMutation` (`{ raw, from, position, to, codon? }` — read `ParsedMutation` in `basechanger.ts` lines ~138–146 first and use its real field names).
- Produces:
  ```ts
  export interface ProteinLine { start: number; end: number; blocks: string[] }   // 1-based residue numbers, blocks of 10
  export function proteinLines(protein: string, perLine?: number): ProteinLine[];  // perLine default 50
  export function translateFrom(sequence: string, start: number, maxResidues?: number): string;   // stops after '*', includes it
  export interface MutationAlignment {
    position: number; from: string; to: string;
    windowStart: number;                 // 1-based residue number of the first residue shown
    wild: string; mutant: string;        // gapped, same length
    midline: string; matchCount: number; mismatchCount: number; gapCount: number;
    wildCodon: string; mutantCodon: string;
    dna: { wild: string; mutant: string; midline: string; changed: number[] };  // the codon ±FLANK bases
  }
  export function mutationAlignment(wildProtein: string, mutantProtein: string, position: number, flank?: number, dna?: { wild: string; mutant: string; codonAt: number }): MutationAlignment;
  ```
  `mutationAlignment` takes protein strings numbered from residue 1 and a 1-based `position`; `flank` defaults to 10. `dna` is two equal-length DNA windows around the codon (the caller slices them) and `codonAt` is the index in them where the codon starts; `wildCodon`/`mutantCodon` are read from there.

- [ ] **Step 1: Write the failing core test** — `tests/core/cloning-mutation-view.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { mutationAlignment, proteinLines, translateFrom } from '@/core/cloning/mutation-view';

const WILD = 'MKTAYIAKQRQISFVKSHFSRQLEERLGLIEVQAPILSRVGDGTQDNLSGAEKAVQVKVKALPDAQFEVV';

describe('proteinLines', () => {
  it('numbers lines by their first and last residue and groups residues in tens', () => {
    const lines = proteinLines(WILD, 50);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatchObject({ start: 1, end: 50 });
    expect(lines[0]!.blocks).toHaveLength(5);
    expect(lines[0]!.blocks[0]).toBe('MKTAYIAKQR');
    expect(lines[1]).toMatchObject({ start: 51, end: WILD.length });
    expect(lines[1]!.blocks.join('')).toBe(WILD.slice(50));
  });
  it('is empty for an empty protein and never splits a block at the end', () => {
    expect(proteinLines('')).toEqual([]);
    expect(proteinLines('MKT', 50)[0]!.blocks).toEqual(['MKT']);
  });
});

describe('translateFrom', () => {
  it('translates from an offset and stops after the first stop codon', () => {
    expect(translateFrom('CCATGAAATAGGGG', 2)).toBe('MK*');
  });
  it('stops at the end of the sequence and honours the residue cap', () => {
    expect(translateFrom('ATGAAAGG', 0)).toBe('MK');
    expect(translateFrom('ATGAAAAAAAAA', 0, 2)).toBe('MK');
  });
});

describe('mutationAlignment', () => {
  const mutate = (protein: string, position: number, to: string) => protein.slice(0, position - 1) + to + protein.slice(position);

  it('aligns a substitution and counts one mismatch', () => {
    const mutant = mutate(WILD, 30, 'W');
    const view = mutationAlignment(WILD, mutant, 30, 10);
    expect(view).toMatchObject({ position: 30, from: WILD[29], to: 'W', windowStart: 20, mismatchCount: 1, gapCount: 0 });
    expect(view.wild).toHaveLength(21);
    expect(view.mutant).toHaveLength(21);
    expect(view.midline).toHaveLength(21);
    expect(view.matchCount).toBe(20);
    expect(view.wild[10]).toBe(WILD[29]);
    expect(view.mutant[10]).toBe('W');
  });

  it('truncates the window at the start of the protein', () => {
    const view = mutationAlignment(WILD, mutate(WILD, 1, 'L'), 1, 10);
    expect(view.windowStart).toBe(1);
    expect(view.wild).toHaveLength(11);
    expect(view.mismatchCount).toBe(1);
  });

  it('truncates the window at the end of the protein', () => {
    const last = WILD.length;
    const view = mutationAlignment(WILD, mutate(WILD, last, 'A'), last, 10);
    expect(view.windowStart).toBe(last - 10);
    expect(view.wild).toHaveLength(11);
    expect(view.wild.endsWith(WILD[last - 1]!)).toBe(true);
  });

  it('handles a single-residue protein', () => {
    const view = mutationAlignment('M', 'L', 1, 10);
    expect(view.wild).toBe('M');
    expect(view.mutant).toBe('L');
    expect(view.mismatchCount).toBe(1);
  });

  it('shows a mutation to stop as a shorter mutant with gaps and no crash', () => {
    const mutant = WILD.slice(0, 29) + '*';
    const view = mutationAlignment(WILD, mutant, 30, 10);
    expect(view.to).toBe('*');
    expect(view.wild.replace(/-/g, '')).toBe(WILD.slice(19, 40));
    expect(view.mutant.replace(/-/g, '')).toBe(WILD.slice(19, 29) + '*');
    expect(view.gapCount).toBeGreaterThan(0);
  });

  it('reads the codon change from the DNA windows and marks the changed bases', () => {
    const wildDna = 'GCTTATGTT'; // 3 bases of context, the codon, 3 bases of context
    const mutDna = 'GCTTTTGTT';
    const view = mutationAlignment(WILD, mutate(WILD, 30, 'F'), 30, 10, { wild: wildDna, mutant: mutDna, codonAt: 3 });
    expect(view.wildCodon).toBe('TAT');
    expect(view.mutantCodon).toBe('TTT');
    expect(view.dna.changed).toEqual([4]);
    expect(view.dna.midline).toBe('||||.||||');
  });

  it('reads the codon at index 0 when there is no left context (start of the plasmid)', () => {
    const view = mutationAlignment('MKT', 'MLT', 2, 10, { wild: 'AAAGGG', mutant: 'AAATTT', codonAt: 0 });
    expect(view.wildCodon).toBe('AAA');
    expect(view.mutantCodon).toBe('AAA');
    expect(view.dna.changed).toEqual([3, 4, 5]);
  });
});
```

Adjust the stop-codon assertion for clarity when implementing: the second `expect` on `view.mutant` should be `expect(view.mutant.replace(/-/g, '')).toBe(WILD.slice(19, 29) + '*')`. Fix the test text now (remove the ternary).

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/core/cloning-mutation-view.test.ts`
Expected: FAIL, module missing.

- [ ] **Step 3: Implement** — `src/core/cloning/mutation-view.ts`

```ts
/* Numbered protein and per-mutation alignments for the amino-acid designer. */

import { align, getMatrix } from '@/core/align';
import { translateCodon } from './methods/basechanger';

export interface ProteinLine { start: number; end: number; blocks: string[] }

/** Residues in blocks of ten, `perLine` per line; `start`/`end` are 1-based residue numbers. */
export function proteinLines(protein: string, perLine = 50): ProteinLine[] {
  const lines: ProteinLine[] = [];
  for (let start = 0; start < protein.length; start += perLine) {
    const chunk = protein.slice(start, start + perLine);
    const blocks: string[] = [];
    for (let i = 0; i < chunk.length; i += 10) blocks.push(chunk.slice(i, i + 10));
    lines.push({ start: start + 1, end: start + chunk.length, blocks });
  }
  return lines;
}

/** Translate from `start` (0-based) in frame, keeping the stop as `*`. */
export function translateFrom(sequence: string, start: number, maxResidues = Infinity): string {
  let protein = '';
  for (let i = start; i + 3 <= sequence.length && protein.length < maxResidues; i += 3) {
    const residue = translateCodon(sequence.slice(i, i + 3));
    protein += residue;
    if (residue === '*') break;
  }
  return protein;
}

export interface MutationAlignment {
  position: number;
  from: string;
  to: string;
  /** 1-based residue number of the first residue in the window. */
  windowStart: number;
  wild: string;
  mutant: string;
  midline: string;
  matchCount: number;
  mismatchCount: number;
  gapCount: number;
  wildCodon: string;
  mutantCodon: string;
  dna: { wild: string; mutant: string; midline: string; changed: number[] };
}

const BLOSUM = getMatrix('BLOSUM62');

/**
 * Pairwise alignment of the wild-type and mutant protein around `position` (1-based), `flank` residues each side.
 * Windows are cut from the same residue numbers of both proteins; a stop in the mutant shortens its window and
 * shows as gaps. `dna` holds two equal-length DNA windows around the codon; `codonAt` is the index where the codon starts.
 */
export function mutationAlignment(wildProtein: string, mutantProtein: string, position: number, flank = 10, dna?: { wild: string; mutant: string; codonAt: number }): MutationAlignment {
  const first = Math.max(1, position - flank);
  const last = Math.min(wildProtein.length, position + flank);
  const wildWindow = wildProtein.slice(first - 1, last);
  const mutantWindow = mutantProtein.slice(first - 1, last);
  let wild = wildWindow;
  let mutant = mutantWindow;
  let midline = '';
  if (wildWindow && mutantWindow) {
    const result = align(wildWindow, mutantWindow, { mode: 'global', matrix: BLOSUM, gapOpen: 10, gapExtend: 1 });
    wild = result.aligned1;
    mutant = result.aligned2;
  } else {
    wild = wildWindow;
    mutant = mutantWindow.padEnd(wildWindow.length, '-');
  }
  let matchCount = 0, mismatchCount = 0, gapCount = 0;
  for (let i = 0; i < wild.length; i++) {
    if (wild[i] === '-' || mutant[i] === '-') { gapCount += 1; midline += ' '; }
    else if (wild[i] === mutant[i]) { matchCount += 1; midline += '|'; }
    else { mismatchCount += 1; midline += '.'; }
  }
  const windows = dna ?? { wild: '', mutant: '', codonAt: 0 };
  const offset = windows.codonAt;
  const dnaMid: string[] = [];
  const changed: number[] = [];
  for (let i = 0; i < windows.wild.length; i++) {
    const same = windows.wild[i] === windows.mutant[i];
    dnaMid.push(same ? '|' : '.');
    if (!same) changed.push(i);
  }
  return {
    position,
    from: wildProtein[position - 1] ?? '',
    to: mutantProtein[position - 1] ?? '*',
    windowStart: first,
    wild, mutant, midline, matchCount, mismatchCount, gapCount,
    wildCodon: windows.wild.slice(offset, offset + 3),
    mutantCodon: windows.mutant.slice(offset, offset + 3),
    dna: { wild: windows.wild, mutant: windows.mutant, midline: dnaMid.join(''), changed },
  };
}
```

Check the tests against this implementation: `to` for the stop test is `mutantProtein[29]` = `*` ✓. In the "last residue" test, `first = last − 10`, window length 11 ✓. In the "start" test window is residues 1..11 → length 11 ✓. The DNA windows in the test are 21 long → codon offset `(21−3)/2 = 9`, but the test's changed base is at index 7 and expects `wildCodon` `TAT`. **Make the test's DNA windows consistent**: use 3-base flank each side: `wildDna = 'GCT' + 'TAT' + 'GTT'` (9 long), `mutDna = 'GCT' + 'TTT' + 'GTT'`, so the codon starts at `(9−3)/2 = 3`, `changed` is `[4]`, `dna.midline[4]` is `'.'`, and `dna.midline.filter(c => c === '|')` has length 8. Update those constants and expectations in the test file now before running.

- [ ] **Step 4: Run core tests**

Run: `npx vitest run tests/core/cloning-mutation-view.test.ts`
Expected: PASS. If the stop-codon case fails because `align` returns the leading gap differently, keep the assertions about gap-stripped strings (they are alignment-independent) and `gapCount > 0`.

- [ ] **Step 5: Write the failing UI test** — `tests/app/cloning-protein-view.test.tsx`

```tsx
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/preact';
import CloningHubView from '@/tools/cloning/View';

afterEach(cleanup);

const GFP = 'ATGGTGAGCAAGGGCGAGGAGCTGTTCACCGGGGTGGTGCCCATCCTGGTCGAGCTGGACGGCGACGTAAACGGCCACAAGTTCAGCGTGTCCGGCGAGGGCGAGGGCGATGCCACCTACGGCAAGCTGACCCTGAAGTTCATCTGCACCACCGGCAAGCTGCCCGTGCCCTGGCCCACCCTCGTGACCACCCTGACCTACGGCGTGCAGTGCTTCAGCCGCTACCCCGACCACATGAAGCAGCACGACTTCTTCAAGTCCGCCATGCCCGAAGGCTACGTCCAGGAGCGCACCATCTTCTTCAAGGACGACGGCAACTACAAGACCCGCGCCGAGGTGAAGTTCGAGGGCGACACCCTGGTGAACCGCATCGAGCTGAAGGGCATCGACTTCAAGGAGGACGGCAACATCCTGGGGCACAAGCTGGAGTACAACTACAACAGCCACAACGTCTATATCATGGCCGACAAGCAGAAGAACGGCATCAAGGTGAACTTCAAGATCCGCCACAACATCGAGGACGGCAGCGTGCAGCTCGCCGACCACTACCAGCAGAACACCCCCATCGGCGACGGCCCCGTGCTGCTGCCCGACAACCACTACCTGAGCACCCAGTCCGCCCTGAGCAAAGACCCCAACGAGAAGCGCGATCACATGGTCCTGCTGGAGTTCGTGACCGCCGCCGGGATCACTCTCGGCATGGACGAGCTGTACAAGTAA';

function setup() {
  location.hash = '#/t/cloning';
  render(<CloningHubView />);
  fireEvent.input(screen.getByLabelText(/Paste FASTA/), { target: { value: `>GFP\n${GFP}` } });
  fireEvent.click(screen.getByRole('button', { name: 'Add pasted sequence' }));
  fireEvent.click(screen.getByRole('button', { name: 'Amino-acid change' }));
}

describe('amino-acid change: numbering and alignment', () => {
  it('numbers the translated reading frame in blocks of ten', () => {
    setup();
    const view = screen.getByRole('region', { name: 'Protein sequence with residue numbers' });
    expect(within(view).getByText('1')).toBeTruthy();
    expect(view.textContent).toContain('MVSKGEELFT');
    expect(view.textContent).toContain('51');
  });

  it('shows a pairwise alignment card for each mutation', () => {
    setup();
    fireEvent.input(screen.getByLabelText('Mutations', { exact: true }), { target: { value: 'Y67F' } });
    const card = screen.getByRole('group', { name: /Y67F: wild type vs mutant/ });
    expect(card.textContent).toContain('Residue 66');
    expect(card.textContent).toMatch(/TAC|TAT/);
    expect(within(card).getByLabelText('Protein alignment').textContent).toContain('F');
    expect(within(card).getByLabelText('Protein alignment').textContent).toMatch(/\./);
  });

  it('highlights the mutated residue in the numbered protein', () => {
    setup();
    fireEvent.input(screen.getByLabelText('Mutations', { exact: true }), { target: { value: 'Y67F' } });
    const view = screen.getByRole('region', { name: 'Protein sequence with residue numbers' });
    expect(view.querySelectorAll('mark')).toHaveLength(1);
    expect(view.querySelector('mark')!.getAttribute('title')).toContain('66');
  });

  it('gives one card per mutation of a multi-mutant', () => {
    setup();
    fireEvent.input(screen.getByLabelText('Mutations', { exact: true }), { target: { value: 'T66A+Y67F' } });
    expect(screen.getAllByRole('group', { name: /wild type vs mutant/ })).toHaveLength(2);
  });
});
```

(In this GFP the translation starts `MVSKGEELFT…`, residue 66 is T and residue 67 is the chromophore Y, encoded `TAC`; the numbering was checked by translating the constant.)

- [ ] **Step 6: Run to verify it fails**

Run: `npx vitest run tests/app/cloning-protein-view.test.tsx`
Expected: FAIL (no protein view).

- [ ] **Step 7: Implement** — `src/tools/cloning/hub/ProteinView.tsx`

```tsx
import type { AminoAcidResult } from '@/core/cloning/methods/basechanger';
import { mutationAlignment, proteinLines, translateFrom } from '@/core/cloning/mutation-view';

const MONO = 'font-mono text-xs leading-6';

/** The translated reading frame, ten residues to a block, numbered at both ends of every line, mutated residues marked. */
export function NumberedProtein({ protein, marks }: { protein: string; marks: Map<number, string> }) {
  return <section aria-label="Protein sequence with residue numbers" class="space-y-1 overflow-x-auto rounded-xl border border-slate-200 p-3 dark:border-slate-700">
    {proteinLines(protein).map(line => <div key={line.start} class={`${MONO} flex items-baseline gap-3 whitespace-nowrap`}>
      <span class="w-10 shrink-0 text-right text-slate-600 dark:text-slate-400">{line.start}</span>
      <span class="flex gap-2">{line.blocks.map((block, blockIndex) => <span key={blockIndex}>{[...block].map((residue, i) => {
        const number = line.start + blockIndex * 10 + i;
        const change = marks.get(number);
        return change
          ? <mark key={i} title={`${change} (residue ${number})`} class="rounded-sm bg-amber-200 px-px font-bold text-amber-950 dark:bg-amber-700 dark:text-amber-50">{residue}</mark>
          : <span key={i}>{residue}</span>;
      })}</span>)}</span>
      <span class="w-10 shrink-0 text-slate-600 dark:text-slate-400">{line.end}</span>
    </div>)}
  </section>;
}

/** One card per mutation: the codon change and the pairwise alignment of the wild-type and mutant protein. */
export function MutationCards({ result, wildDna, orfStart }: { result: AminoAcidResult; wildDna: string; orfStart: number }) {
  const design = result.design;
  if (!design) return null;
  const mutantDna = design.product;
  const wildProtein = translateFrom(wildDna, orfStart);
  const mutantProtein = translateFrom(mutantDna, orfStart);
  return <div class="space-y-3">
    {result.mutations.map(mutation => {
      const codonStart = orfStart + (mutation.position - 1) * 3;
      const before = Math.min(3, codonStart); // bases of context to the left (fewer near the plasmid start)
      const stop = codonStart + 3 + 3;
      const view = mutationAlignment(wildProtein, mutantProtein, mutation.position, 10, {
        wild: wildDna.slice(codonStart - before, stop),
        mutant: mutantDna.slice(codonStart - before, stop),
        codonAt: before,
      });
      const ruler = (value: string) => value.split('').map(c => c === ' ' ? ' ' : c).join('');
      return <div key={mutation.raw} role="group" aria-label={`${mutation.raw}: wild type vs mutant`} class="space-y-2 rounded-xl border border-slate-200 p-3 dark:border-slate-700">
        <p class="text-xs"><strong>{mutation.raw}</strong> · Residue {view.position}: {view.from} → {view.to} · codon <span class="font-mono">{view.wildCodon}</span> → <span class="font-mono font-bold">{view.mutantCodon}</span></p>
        <div aria-label="Protein alignment" role="img" class={`${MONO} whitespace-pre overflow-x-auto`}>
          <div><span class="inline-block w-16 text-slate-600 dark:text-slate-400">Wild type</span>{ruler(view.wild)}</div>
          <div><span class="inline-block w-16" />{ruler(view.midline)}</div>
          <div><span class="inline-block w-16 text-slate-600 dark:text-slate-400">Mutant</span>{ruler(view.mutant)}</div>
          <div class="text-slate-600 dark:text-slate-400"><span class="inline-block w-16" />residues {view.windowStart}–{view.windowStart + view.wild.replace(/-/g, '').length - 1} · {view.matchCount} identical, {view.mismatchCount} changed{view.gapCount ? `, ${view.gapCount} gap` : ''}</div>
        </div>
        <div aria-label="DNA alignment" role="img" class={`${MONO} whitespace-pre overflow-x-auto`}>
          <div><span class="inline-block w-16 text-slate-600 dark:text-slate-400">DNA wild</span>{view.dna.wild}</div>
          <div><span class="inline-block w-16" />{view.dna.midline}</div>
          <div><span class="inline-block w-16 text-slate-600 dark:text-slate-400">DNA new</span>{view.dna.mutant}</div>
        </div>
        <p class="text-xs text-slate-600 dark:text-slate-400">| identical · . changed · gap for a missing residue (for example after a new stop).</p>
      </div>;
    })}
  </div>;
}
```


In `BaseChangerPanel.tsx`:
- Imports `NumberedProtein`, `MutationCards` from `./ProteinView` and `translateFrom` from `@/core/cloning/mutation-view`.
- Replace the existing `preview` memo and the `<p … aria-label="Translated reading frame">` line with `const protein = useMemo(() => translateFrom(working, start0, 1200), [working, start0]);` and, inside the `aa` settings block, `{protein && <NumberedProtein protein={protein} marks={marks} />}` where `marks` is a `Map<number, string>` built from `result?.results.flatMap(item => item.mutations.map(m => [m.position, m.raw]))`. Keep the "Translated reading frame" text only as the region's accessible name (already provided).
- In each result `Section`, before the rounds, add `<MutationCards result={item} wildDna={working} orfStart={start0} />`.

Note: for consecutive rounds `item.design` is the last round whose `product` contains every earlier change (each round is designed on the previous product), so `mutantDna` covers all mutations; for a merged multi-mutation `design.product` likewise.

- [ ] **Step 8: Run tests**

Run: `npx vitest run tests/core/cloning-mutation-view.test.ts tests/app/cloning-protein-view.test.tsx tests/app/cloning-hub.test.tsx tests/core/basechanger-vendor.test.ts && npm run typecheck && npm run lint`
Expected: PASS. Existing hub tests that looked for the old one-line "Translated reading frame" `<p>` need updating to the new region name.

- [ ] **Step 9: Commit**

```bash
git add src/core/cloning/mutation-view.ts src/tools/cloning/hub tests
git commit -m "feat(cloning): numbered protein and a pairwise alignment for every designed mutation

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Before/after and graphic view for replace, delete and insert

**Files:**
- Create: `src/core/cloning/edit-view.ts`
- Create: `src/tools/cloning/hub/EditView.tsx`
- Modify: `src/tools/cloning/hub/BaseChangerPanel.tsx`
- Test: `tests/core/cloning-edit-view.test.ts`, `tests/app/cloning-edit-view.test.tsx`

**Interfaces:**
- Consumes: `SdmDesign` (`design.edit: { start, end, replacement, label }`, `design.forward`, `design.reverse`, `design.product`), `ConstructDiagram`.
- Produces:
  ```ts
  export interface EditView {
    kind: 'insert' | 'replace' | 'delete';
    /** 1-based number of the first base of each window. */
    beforeStart: number; afterStart: number;
    before: { left: string; removed: string; right: string };
    after: { left: string; added: string; right: string };
    removedCount: number; addedCount: number; delta: number;
    primers: Array<{ name: string; strand: 'fwd' | 'rev'; start: number; length: number; tailLength: number }>;   // original-plasmid coordinates
  }
  export function sdmEditView(plasmid: string, design: SdmDesign, context?: number): EditView;
  ```
  `context` defaults to 30. Primer positions: forward anneals at `[edit.end, edit.end + anneal.length)`, reverse at `[edit.start − anneal.length, edit.start)` (mod plasmid length).

- [ ] **Step 1: Write the failing test** — `tests/core/cloning-edit-view.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { designSdm, isSdmDesign, type SdmDesign } from '@/core/cloning/methods/basechanger';
import { sdmEditView } from '@/core/cloning/edit-view';
import { randomDna } from './helpers';

const plasmid = randomDna(3000, 81);
const design = (start: number, end: number, replacement: string): SdmDesign => {
  const result = designSdm(plasmid, { start, end, replacement, label: 'x' });
  if (!isSdmDesign(result)) throw new Error(result.findings[0]!.message);
  return result;
};

describe('sdmEditView', () => {
  it('shows a replacement: removed bases before, added bases after, same context', () => {
    const view = sdmEditView(plasmid, design(1000, 1006, 'GGATCC'));
    expect(view.kind).toBe('replace');
    expect(view.before.removed).toBe(plasmid.slice(1000, 1006));
    expect(view.after.added).toBe('GGATCC');
    expect(view.before.left).toBe(plasmid.slice(970, 1000));
    expect(view.after.left).toBe(view.before.left);
    expect(view.after.right).toBe(view.before.right);
    expect(view.beforeStart).toBe(971);
    expect(view.afterStart).toBe(971);
    expect(view.delta).toBe(0);
  });

  it('shows a deletion with nothing added', () => {
    const view = sdmEditView(plasmid, design(500, 512, ''));
    expect(view).toMatchObject({ kind: 'delete', removedCount: 12, addedCount: 0, delta: -12 });
    expect(view.after.added).toBe('');
    expect(view.before.removed).toBe(plasmid.slice(500, 512));
  });

  it('shows an insertion with nothing removed', () => {
    const view = sdmEditView(plasmid, design(700, 700, 'ATGCATGC'));
    expect(view).toMatchObject({ kind: 'insert', removedCount: 0, addedCount: 8, delta: 8 });
    expect(view.before.removed).toBe('');
  });

  it('places the primers on either side of the edit in original coordinates', () => {
    const d = design(1000, 1006, 'GGATCC');
    const view = sdmEditView(plasmid, d);
    const fwd = view.primers.find(p => p.strand === 'fwd')!;
    const rev = view.primers.find(p => p.strand === 'rev')!;
    expect(fwd.start).toBe(1006);
    expect(fwd.length).toBe(d.forward.anneal.length);
    expect(rev.start + rev.length).toBe(1000);
    expect(fwd.tailLength).toBe(d.forward.tail.length);
  });

  it('wraps the context at the plasmid ends', () => {
    const view = sdmEditView(plasmid, design(5, 8, 'TTT'), 30);
    expect(view.beforeStart).toBe(1);
    expect(view.before.left).toBe(plasmid.slice(0, 5));
    const tail = sdmEditView(plasmid, design(2990, 2995, ''), 30);
    expect(tail.before.right).toBe(plasmid.slice(2995));
  });

  it('wraps the reverse primer position across the origin', () => {
    const view = sdmEditView(plasmid, design(3, 6, 'AAA'));
    const rev = view.primers.find(p => p.strand === 'rev')!;
    expect((rev.start + rev.length) % 3000).toBe(3);
    expect(rev.start).toBeGreaterThan(2900);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/core/cloning-edit-view.test.ts`
Expected: FAIL, module missing.

- [ ] **Step 3: Implement** — `src/core/cloning/edit-view.ts`

```ts
/* Before/after view of a sequence edit (insert, replace, delete) and where its primers sit. */

import type { SdmDesign } from './methods/basechanger';

export interface EditView {
  kind: 'insert' | 'replace' | 'delete';
  beforeStart: number;
  afterStart: number;
  before: { left: string; removed: string; right: string };
  after: { left: string; added: string; right: string };
  removedCount: number;
  addedCount: number;
  delta: number;
  primers: Array<{ name: string; strand: 'fwd' | 'rev'; start: number; length: number; tailLength: number }>;
}

const mod = (a: number, n: number) => ((a % n) + n) % n;

export function sdmEditView(plasmid: string, design: SdmDesign, context = 30): EditView {
  const sequence = plasmid.replace(/\s/g, '').toUpperCase();
  const n = sequence.length;
  const { start, end, replacement } = design.edit;
  const from = Math.max(0, start - context);
  const to = Math.min(n, end + context);
  const removedCount = end - start;
  const addedCount = replacement.length;
  const left = sequence.slice(from, start);
  const right = sequence.slice(end, to);
  return {
    kind: removedCount === 0 ? 'insert' : addedCount === 0 ? 'delete' : 'replace',
    beforeStart: from + 1,
    afterStart: from + 1,
    before: { left, removed: sequence.slice(start, end), right },
    after: { left, added: replacement, right },
    removedCount, addedCount, delta: addedCount - removedCount,
    primers: [
      { name: design.forward.name, strand: 'fwd', start: mod(end, n), length: design.forward.anneal.length, tailLength: design.forward.tail.length },
      { name: design.reverse.name, strand: 'rev', start: mod(start - design.reverse.anneal.length, n), length: design.reverse.anneal.length, tailLength: design.reverse.tail.length },
    ],
  };
}
```

- [ ] **Step 4: Run core tests**

Run: `npx vitest run tests/core/cloning-edit-view.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing UI test** — `tests/app/cloning-edit-view.test.tsx`

```tsx
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/preact';
import CloningHubView from '@/tools/cloning/View';
import { randomDna } from '../core/helpers';

afterEach(cleanup);

function setup() {
  location.hash = '#/t/cloning';
  render(<CloningHubView />);
  fireEvent.input(screen.getByLabelText(/Paste FASTA/), { target: { value: `>plas\n${randomDna(600, 7)}` } });
  fireEvent.click(screen.getByRole('button', { name: 'Add pasted sequence' }));
  fireEvent.click(screen.getByRole('button', { name: 'Amino-acid change' }));
  fireEvent.click(screen.getByRole('button', { name: 'Insert, replace or delete bases' }));
}

describe('sequence edits: before/after and graphic', () => {
  it('shows the deleted bases struck out and the plasmid graphic', () => {
    setup();
    fireEvent.change(screen.getByLabelText('Change'), { target: { value: 'delete' } });
    fireEvent.input(screen.getByLabelText('From base'), { target: { value: '100' } });
    fireEvent.input(screen.getByLabelText('To base'), { target: { value: '111' } });
    const view = screen.getByRole('region', { name: /Edit preview: del100-111/ });
    expect(within(view).getByText(/Before/)).toBeTruthy();
    expect(within(view).getByText(/After/)).toBeTruthy();
    expect(view.querySelector('del')!.textContent).toHaveLength(12);
    expect(within(view).getByRole('img', { name: /Edit site and primers/ })).toBeTruthy();
    expect(view.textContent).toContain('12 bases removed');
  });

  it('shows inserted bases highlighted', () => {
    setup();
    fireEvent.change(screen.getByLabelText('Change'), { target: { value: 'insert' } });
    fireEvent.input(screen.getByLabelText('Insert after base'), { target: { value: '200' } });
    fireEvent.input(screen.getByLabelText('New bases'), { target: { value: 'GGATCC' } });
    const view = screen.getByRole('region', { name: /Edit preview: ins200/ });
    expect(view.querySelector('ins')!.textContent).toBe('GGATCC');
    expect(view.textContent).toContain('6 bases added');
  });

  it('shows both for a replacement', () => {
    setup();
    fireEvent.change(screen.getByLabelText('Change'), { target: { value: 'replace' } });
    fireEvent.input(screen.getByLabelText('From base'), { target: { value: '50' } });
    fireEvent.input(screen.getByLabelText('To base'), { target: { value: '55' } });
    fireEvent.input(screen.getByLabelText('New bases'), { target: { value: 'TTTT' } });
    const view = screen.getByRole('region', { name: /Edit preview: sub50-55/ });
    expect(view.querySelector('del')!.textContent).toHaveLength(6);
    expect(view.querySelector('ins')!.textContent).toBe('TTTT');
    expect(view.textContent).toContain('6 bases removed');
    expect(view.textContent).toContain('4 bases added');
  });
});
```

If `getByLabelText('Change')` is ambiguous with other labels, use `{ exact: true }` (memory note on `getByLabel` substring matching).

- [ ] **Step 6: Run to verify it fails**

Run: `npx vitest run tests/app/cloning-edit-view.test.tsx`
Expected: FAIL.

- [ ] **Step 7: Implement** — `src/tools/cloning/hub/EditView.tsx`

```tsx
import { useMemo } from 'preact/hooks';
import type { SdmDesign } from '@/core/cloning/methods/basechanger';
import { sdmEditView } from '@/core/cloning/edit-view';
import { ConstructDiagram } from './ConstructDiagram';

const MONO = 'font-mono text-xs leading-6 whitespace-pre-wrap break-all';
const plural = (n: number) => `${n.toLocaleString()} base${n === 1 ? '' : 's'}`;

/** The plasmid around an edit before and after it, and a line graphic with the edit site and both primers. */
export function EditView({ plasmid, design, plasmidName }: { plasmid: string; design: SdmDesign; plasmidName: string }) {
  const view = useMemo(() => sdmEditView(plasmid, design), [plasmid, design]);
  const summary = [view.removedCount ? `${plural(view.removedCount)} removed` : '', view.addedCount ? `${plural(view.addedCount)} added` : ''].filter(Boolean).join(', ');
  return <section aria-label={`Edit preview: ${design.label}`} class="space-y-3 rounded-xl border border-slate-200 p-3 dark:border-slate-700">
    <p class="text-xs"><strong>{summary}</strong> · plasmid {view.delta === 0 ? 'keeps its length' : `${view.delta > 0 ? 'grows' : 'shrinks'} by ${plural(Math.abs(view.delta))}`} ({plasmid.length.toLocaleString()} → {(plasmid.length + view.delta).toLocaleString()} bp)</p>
    <ConstructDiagram
      title={`Edit site and primers on ${plasmidName}`}
      length={plasmid.length}
      circular
      color="#0072B2"
      removed={view.removedCount ? { start: design.edit.start, length: view.removedCount } : undefined}
      primers={view.primers.map(primer => ({ id: primer.name, label: primer.name, strand: primer.strand, start: primer.start, length: primer.length, tailLength: primer.tailLength, tailColor: '#E69F00' }))}
      marker={{ position: design.edit.start, label: `${view.kind === 'insert' ? 'Insert after' : view.kind === 'delete' ? 'Delete from' : 'Replace from'} base ${view.kind === 'insert' ? design.edit.start : design.edit.start + 1}` }}
    />
    <div class="space-y-1">
      <div><span class="mr-2 inline-block w-14 text-xs font-semibold">Before</span><span class={MONO}>{view.before.left}{view.before.removed && <del class="rounded-sm bg-rose-100 px-px text-rose-900 decoration-2 dark:bg-rose-950 dark:text-rose-100">{view.before.removed}</del>}{view.before.right}</span></div>
      <div><span class="mr-2 inline-block w-14 text-xs font-semibold">After</span><span class={MONO}>{view.after.left}{view.after.added && <ins class="rounded-sm bg-emerald-100 px-px font-bold text-emerald-900 underline dark:bg-emerald-950 dark:text-emerald-100">{view.after.added}</ins>}{view.after.right}</span></div>
      <p class="text-xs text-slate-600 dark:text-slate-400">Showing bases {view.beforeStart.toLocaleString()}–{(view.beforeStart + view.before.left.length + view.before.removed.length + view.before.right.length - 1).toLocaleString()} of the original. Struck-out red bases are removed; underlined green bases are new.</p>
    </div>
  </section>;
}
```

Wire into `BaseChangerPanel.tsx`: in the `sdm-general` Section (when `generalDesign`), before the primer table add `<EditView plasmid={workingMolecule.sequence} design={generalDesign} plasmidName={source.document.name} />`. Also add it for each amino-acid-change round beneath the `MutationCards`? No — amino-acid changes already get the alignments; skip it there.

`source` may be undefined in the JSX branch: the section renders only inside `generalDesign && workingMolecule`, and `source` is defined whenever `molecule` is; use `source!.document.name` or pass `molecule!.name`.

- [ ] **Step 8: Run tests**

Run: `npx vitest run tests/core/cloning-edit-view.test.ts tests/app/cloning-edit-view.test.tsx tests/app/cloning-hub.test.tsx tests/core/basechanger-vendor.test.ts && npm run typecheck && npm run lint`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/core/cloning/edit-view.ts src/tools/cloning/hub tests
git commit -m "feat(cloning): before/after sequence and edit graphic for insert, replace and delete

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 10: End-to-end check, accessibility, docs and full verification

**Files:**
- Modify: `tests/e2e/cloning-hub.spec.ts`
- Modify: `docs/cloning-hub.md`
- Modify: `docs/superpowers/specs/2026-09-29-cloning-hub-construct-views-design.md` (record the two deviations)
- Possibly modify: `tests/e2e/a11y.spec.ts` (only if cloning is not already covered)

- [ ] **Step 1: Read the existing e2e** — `tests/e2e/cloning-hub.spec.ts` and `tests/e2e/a11y.spec.ts`. Follow their helpers for adding a preset vector and a pasted insert.

- [ ] **Step 2: Add e2e scenarios** to `cloning-hub.spec.ts`:
  1. NEBuilder: add pUC19 + a pasted 600 bp insert, set pUC19 to "PCR product" → "Open at a position" → base 800, choose the junction placement "Custom split…" → click "Half and half"; assert the product preview shows the source legend (`getByRole('list', { name: 'Sources in the construct' })` with two items), the primer map `img` for pUC19, and `share-summary` text; download GenBank (`page.waitForEvent('download')`) and assert the file does not contain a feature named `1 · pUC19` (source regions are view-only).
  2. In-Fusion: choose "Inverse PCR: insert at a position", drag on the vector primer map (`page.mouse` on `data-testid="diagram-surface"` bounding box) and assert the "Insert before base" input changed from its previous value.
  3. Amino-acid change: add a pasted GFP ORF (reuse the constant from the hub tests), enter `Y67F`, assert the numbered protein region and the alignment card are visible.
  4. Sequence edit: delete a range and assert `<del>` text length.

- [ ] **Step 3: Accessibility** — confirm `tests/e2e/a11y.spec.ts` visits the cloning tool in light and dark. If it does not, add cloning-hub states (NEBuilder with a design, amino-acid change with a mutation) to it following the existing per-page × per-theme pattern. Run axe; fix any contrast failures on the new hatch/labels, and check that any new Tailwind shade used (`amber-*`, `rose-*`, `emerald-*`, `accent-*`) is defined in `src/styles/app.css` `@theme`.

- [ ] **Step 4: Visual check** — start the dev server (use the `run` skill), open `#/t/cloning`, and take screenshots with the Playwright MCP tools in light and dark, at desktop and 390 px width: NEBuilder with a placed PCR vector and custom split, the product strip and legend, In-Fusion click-to-place, a Y-to-F mutation card, and a deletion. Confirm nothing overflows horizontally, the labels are readable, and the hatch patterns are distinguishable without colour. Fix layout issues found (do not skip this step).

- [ ] **Step 5: Docs** — update `docs/cloning-hub.md`:
  - a "What you see" section: source legend/strip and coloured map/sequence, primer maps, click-to-place;
  - "Options beyond the vendor tools": NEBuilder `open` (position/replace) for PCR sources, NEBuilder custom split (fraction, not GC-biased), In-Fusion vector-primer sharing; state that these are additions, are off by default, and are not covered by vendor fixtures (covered by unit tests instead);
  - the numbered protein/alignment and edit views.
  Update the design spec: (a) primer maps draw a circular source unrolled as a line (with the origin marked), not a ring; (b) the "pair Tm difference" warning was dropped because a tail does not change the annealing Tm, replaced by the long-primer (> 60 nt) warning.

- [ ] **Step 6: Full verification**

Run: `npm run typecheck && npm run lint && npx vitest run && npx playwright test tests/e2e/cloning-hub.spec.ts tests/e2e/a11y.spec.ts`
Expected: all green. Report the counts. If the whole e2e suite is slow, run only the cloning and a11y specs and say so.

- [ ] **Step 7: Commit**

```bash
git add tests docs
git commit -m "test(cloning): e2e and accessibility for construct views; document the new options

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

## Self-review (run against the spec)

**Spec coverage**
- §1 source coloring → Task 1 (segments, colours), Task 2 (strip, legend, coloured map and sequence, overlap hatch, click a source to select). Hover text "from <name>, bases a–b of the source": covered by the annotation `note` qualifier and the legend range; the sequence view already shows annotation names on hover (`title`). Not a per-base source-relative coordinate; accepted as a simplification and stated in Task 10 docs.
- §2 PCR at a chosen place → Task 3 (core `open`), Task 5 (In-Fusion already had it), Task 6 (geometry, diagram, click/drag), Task 7 (panels).
- §3 overhang split → Task 4 (NEBuilder), Task 5 (In-Fusion), Task 7 (sliders, presets, summary).
- §4 amino-acid numbering and alignment → Task 8.
- §5 replace/delete/insert → Task 9.
- Ease of use / accessibility / errors → Tasks 6–10 (labels, keyboard on primers, numeric inputs as the keyboard path for placement, blockers instead of throws).
- Testing section → per-task tests plus Task 10.

**Deviations from the spec (recorded in Task 10):** the diagram draws circular sources unrolled as a line; the pair-Tm-difference warning is replaced by a long-primer warning; hover shows the source name and range from the legend rather than source-relative bases.

**Placeholder scan:** the only deliberately deferred detail is the real Tyr position in the GFP constant (Task 8, step 5) and `DecimalInput` commit behaviour (Task 7, step 4d); both give an exact way to resolve them during the task.

**Type consistency:** `OpenSite`, `fwdTailShare` (NEBuilder, fraction 0–1 in core; percentage 0–100 in UI state), `vectorShare` (In-Fusion, fraction in core; percentage in UI state), `SourceSegment`, `PieceGeometry`/`PrimerSpan`, `DiagramPrimer`, `MutationAlignment` (`dna.codonAt` added in Task 8 step 7), `EditView` are defined once and used with the same names later.
