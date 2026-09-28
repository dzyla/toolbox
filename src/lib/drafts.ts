/* Browser-local drafts of imported tool data (raw instrument text), so a reload or an
   accidental navigation does not lose an import. Stored in IndexedDB on this device only;
   never placed in share links. */
import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import { useCallback, useEffect, useRef, useState } from 'preact/hooks';

interface Schema extends DBSchema {
  drafts: { key: string; value: { key: string; value: string; savedAt: number } };
}

/** Larger imports are kept for the session only; IndexedDB quota varies by browser. */
export const MAX_DRAFT_CHARS = 20 * 1024 * 1024;
const SAVE_DELAY_MS = 400;

let dbp: Promise<IDBPDatabase<Schema>> | undefined;
function db() {
  dbp ??= openDB<Schema>('biobench-drafts', 1, {
    upgrade(d) { d.createObjectStore('drafts', { keyPath: 'key' }); },
  });
  return dbp;
}

export async function loadDraft(key: string): Promise<string | undefined> {
  try { return (await (await db()).get('drafts', key))?.value; } catch { return undefined; }
}
export async function saveDraft(key: string, value: string): Promise<void> {
  if (value.length > MAX_DRAFT_CHARS) return deleteDraft(key);
  try { await (await db()).put('drafts', { key, value, savedAt: Date.now() }); } catch { /* storage unavailable: keep working in memory */ }
}
/** Remove every draft (tests; a future "clear local data" action). */
export async function clearDrafts(): Promise<void> {
  try { await (await db()).clear('drafts'); } catch { /* ignore */ }
}
export async function deleteDraft(key: string): Promise<void> {
  try { await (await db()).delete('drafts', key); } catch { /* ignore */ }
}

/**
 * Text state that survives reloads on this device. Starts from `initial`, then replaces it with
 * the saved draft (calling `onRestore`) unless the user has already edited the value.
 * Pass `{ restore: false }` when the initial value must win (e.g. data handed over by another tool).
 * `setValue(v, { persist: false })` sets a value without keeping it as a draft (e.g. a bundled
 * example) and discards any saved draft.
 */
export function useDraftText(
  key: string,
  initial: () => string,
  onRestore?: (value: string) => void,
  options: { restore?: boolean } = {},
): [string, (value: string, options?: { persist?: boolean }) => void] {
  const [value, setState] = useState(initial);
  const touched = useRef(options.restore === false);
  const pending = useRef<{ value: string; persist: boolean } | null>(null);
  const restoreRef = useRef(onRestore);
  restoreRef.current = onRestore;

  useEffect(() => {
    let alive = true;
    void loadDraft(key).then(saved => {
      if (!alive || touched.current || saved === undefined) return;
      setState(saved);
      restoreRef.current?.(saved);
    });
    return () => { alive = false; };
  }, [key]);

  useEffect(() => {
    const next = pending.current;
    if (!next) return;
    if (!next.persist) { pending.current = null; void deleteDraft(key); return; }
    const t = setTimeout(() => { pending.current = null; void saveDraft(key, next.value); }, SAVE_DELAY_MS);
    return () => clearTimeout(t);
  }, [key, value]);

  const setValue = useCallback((next: string, options?: { persist?: boolean }) => {
    touched.current = true;
    pending.current = { value: next, persist: options?.persist ?? true };
    setState(next);
    // A value identical to the current one does not re-run the effect; handle it here.
    if (!(options?.persist ?? true)) void deleteDraft(key);
  }, [key]);

  return [value, setValue];
}
