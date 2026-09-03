import { signal, effect, type Signal } from '@preact/signals';
import { useMemo, useEffect } from 'preact/hooks';
import LZString from 'lz-string';
import { route, replaceState, toHash } from '@/app/router';

export function encodeState(obj: unknown): string {
  return LZString.compressToEncodedURIComponent(JSON.stringify(obj));
}

export function decodeState<T>(s: string | undefined, fallback: T): T {
  if (!s) return fallback;
  try {
    const json = LZString.decompressFromEncodedURIComponent(s);
    if (!json) return fallback;
    const v = JSON.parse(json);
    return (v && typeof v === 'object') ? { ...fallback, ...v } : fallback;
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
