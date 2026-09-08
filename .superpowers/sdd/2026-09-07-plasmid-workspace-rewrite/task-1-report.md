# Task 1 report: plasmid workspace state

## RED

Command:

```text
npm run test:unit -- tests/core/plasmid-workspace.test.ts
```

Result: expected failure before implementation. Vitest could not resolve `@/tools/plasmid/workspace` because the workspace modules did not exist; the suite reported `0 test` and one failed suite.

## GREEN

Focused command:

```text
npm run test:unit -- tests/core/plasmid-workspace.test.ts
```

Result: `1` test file passed, `6` tests passed.

Additional verification:

```text
npm run typecheck                 # passed
npm run lint -- --quiet           # passed
git diff --check                  # passed
npm run test:unit                 # 97 files passed, 697 tests passed
```

## Files changed

- `src/tools/plasmid/selection.ts`: defines local selection sources and zero-based half-open selection coordinates; clamps endpoints to the document length, orders linear selections, and preserves circular origin crossings; provides `selectRange` and `clearSelection`.
- `src/tools/plasmid/workspace.ts`: defines immutable `WorkspaceState` and document-only history with initial state, edit, undo, redo, and selection helper exports. History is capped at 50 past documents and document edits clear the redo stack.
- `tests/core/plasmid-workspace.test.ts`: covers ephemeral selection, selection persistence through undo/redo, local clearing, linear endpoint normalization, and circular origin-spanning selection.

## Self-review

- Plasmid document identity and history are untouched by selection changes.
- Selection state has no URL-state or persistence dependency.
- Document coordinates remain zero-based and half-open at this boundary.
- Circular `start > end` selections remain valid; linear backwards drags are normalized into ascending intervals.
- Undo and redo preserve the current local selection and use immutable state updates.
- The API re-exports selection types/helpers from `workspace.ts` while retaining the dedicated `selection.ts` module for component-level imports.

## Concerns

No blocking concerns. Retained selections are now normalized against every destination document; a selection clipped to zero length is cleared.

## Review follow-up: destination-document selection normalization

### RED

Added tests before changing production code for `applyDocumentEdit`, `undoWorkspace`, and `redoWorkspace` across a shorter document and circular-to-linear topology changes, plus a fully clipped range. The focused run failed as expected:

```text
npm run test:unit -- tests/core/plasmid-workspace.test.ts
4 failed, 6 passed (10 tests)

Failures showed retained selections still had { start: 18, end: 3 } instead of
the normalized linear { start: 3, end: 6 }, and a fully clipped range remained
instead of becoming undefined.
```

### GREEN

Implemented `selectionForDocument` in `src/tools/plasmid/workspace.ts`. Each document transition now normalizes the retained selection against its destination document, reorders origin-spanning coordinates when entering a linear document, and clears zero-length results.

Focused verification:

```text
npm run test:unit -- tests/core/plasmid-workspace.test.ts
1 test file passed, 10 tests passed
```

Broader verification after the follow-up:

```text
npm run typecheck                 # passed
npm run lint -- --quiet           # passed
git diff --check                  # passed
npm run test:unit                 # 97 files passed, 701 tests passed
```

Files changed in this follow-up:

- `src/tools/plasmid/workspace.ts`: normalize or clear retained selections on apply, undo, and redo destination transitions.
- `tests/core/plasmid-workspace.test.ts`: add four regression tests for shorter-document and topology transitions, including full-range clipping.
