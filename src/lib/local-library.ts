/* User-made preset libraries (custom buffers, ladders) kept in localStorage on this device.
   Stored as a versioned envelope { version, items }; items are validated on read so a stale or
   hand-edited entry is dropped instead of breaking the tool. Older unversioned keys are migrated. */

export interface LibrarySpec<T> {
  key: string;
  version: number;
  /** Earlier keys that held a bare JSON array of items; read once, then removed. */
  legacyKeys?: string[];
  validate: (item: unknown) => item is T;
}

interface Envelope { version: number; items: unknown[] }

function readRaw(key: string): unknown {
  try {
    const text = localStorage.getItem(key);
    return text === null ? undefined : JSON.parse(text);
  } catch {
    return undefined;
  }
}

export function loadLibrary<T>(spec: LibrarySpec<T>): T[] {
  const stored = readRaw(spec.key) as Envelope | unknown[] | undefined;
  let items: unknown[] = [];
  let migrated = false;
  if (stored && !Array.isArray(stored) && typeof stored === 'object' && Array.isArray((stored as Envelope).items)) {
    items = (stored as Envelope).items;
  } else if (Array.isArray(stored)) {
    items = stored; migrated = true;
  }
  for (const legacy of spec.legacyKeys ?? []) {
    const old = readRaw(legacy);
    if (Array.isArray(old)) { items = [...items, ...old]; migrated = true; }
  }
  const seen = new Set<string>();
  const valid = items.filter(spec.validate).filter(item => {
    const id = (item as { id?: unknown }).id;
    if (typeof id !== 'string') return true;
    if (seen.has(id)) return false;
    seen.add(id); return true;
  });
  if (migrated || valid.length !== items.length) {
    if (saveLibrary(spec, valid)) {
      for (const legacy of spec.legacyKeys ?? []) { try { localStorage.removeItem(legacy); } catch { /* ignore */ } }
    }
  }
  return valid;
}

/** Returns false when storage is unavailable or full (private mode, quota). */
export function saveLibrary<T>(spec: LibrarySpec<T>, items: T[]): boolean {
  try {
    localStorage.setItem(spec.key, JSON.stringify({ version: spec.version, items } satisfies Envelope));
    return true;
  } catch {
    return false;
  }
}

export const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
export const isPositiveNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0;
