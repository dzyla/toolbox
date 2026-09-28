import { signal, effect, type Signal } from '@preact/signals';
import { useMemo, useEffect } from 'preact/hooks';
import LZString from 'lz-string';
import { route, replaceState, toHash } from '@/app/router';

export function encodeState(obj: unknown): string {
  return LZString.compressToEncodedURIComponent(JSON.stringify(obj));
}

type Kind = 'null' | 'array' | 'object' | 'string' | 'number' | 'boolean' | 'other';
function kindOf(v: unknown): Kind {
  if (v === null || v === undefined) return 'null';
  if (Array.isArray(v)) return 'array';
  const t = typeof v;
  return t === 'object' || t === 'string' || t === 'number' || t === 'boolean' ? t : 'other';
}

/**
 * Merge decoded link state onto the tool's defaults, keeping only values whose shape matches the
 * default for that key, so a stale or hand-edited link cannot put a string where a tool expects a
 * number (or an object where it expects an array). Keys whose default is null/undefined accept any
 * value; keys the defaults do not mention are kept. Arrays must match the kind of the default's
 * first element when the default has one. Nested plain objects are checked recursively.
 */
export function mergeLinkState<T>(defaults: T, value: unknown): T {
  const dk = kindOf(defaults);
  if (dk === 'null') return value as T;
  if (kindOf(value) !== dk) return defaults;
  if (dk === 'array') {
    const sample = (defaults as unknown[])[0];
    if (sample === undefined) return value as T;
    const want = kindOf(sample);
    return (value as unknown[]).every(item => kindOf(item) === want) ? value as T : defaults;
  }
  if (dk !== 'object') return value as T;
  const out: Record<string, unknown> = { ...(defaults as Record<string, unknown>) };
  for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
    out[key] = key in out ? mergeLinkState(out[key], v) : v;
  }
  return out as T;
}

export function decodeState<T>(s: string | undefined, fallback: T): T {
  if (!s) return fallback;
  try {
    const json = LZString.decompressFromEncodedURIComponent(s);
    if (!json) return fallback;
    const v = JSON.parse(json);
    return (v && typeof v === 'object' && !Array.isArray(v)) ? mergeLinkState(fallback, v) : fallback;
  } catch { return fallback; }
}

/**
 * Tool state that lives in the URL hash (`?s=`), so any screen is a shareable link.
 * Reads once on mount; writes debounced with history.replaceState (no navigation).
 */
export function useUrlState<T extends object>(toolId: string, defaults: T): [Signal<T>, () => string] {
  const initial = useMemo(() => {
    const r = route.peek();
    const st = decodeState(r.name === 'tool' && r.toolId === toolId ? r.state : undefined, defaults);
    return { state: signal<T>(st), written: encodeState(st) };
  }, [toolId]);
  const { state } = initial;
  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | undefined;
    // Compare against the last written encoding rather than skipping the first run:
    // effects run after paint, so an edit made before this effect exists must still be written.
    const stop = effect(() => {
      const enc = encodeState(state.value);
      if (enc === initial.written) return;
      if (t) clearTimeout(t);
      t = setTimeout(() => {
        const r = route.peek();
        if (r.name === 'tool' && r.toolId === toolId && !r.projectId) { replaceState({ ...r, state: enc }); initial.written = enc; }
      }, 250);
    });
    return () => { stop(); if (t) clearTimeout(t); };
  }, [initial, toolId]);
  const shareUrl = () => `${location.origin}${location.pathname}${toHash({ name: 'tool', toolId, state: encodeState(state.value) })}`;
  return [state, shareUrl];
}
