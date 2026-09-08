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

No blocking concerns. If a later document edit shortens the sequence, the existing selection is intentionally preserved for undo/redo continuity; callers should normalize any selection they create against the active document.
