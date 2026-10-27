import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { FcsData } from '@/core/flow';
import { makeFlowWorker, runFlowJob } from './job';

export interface FileSource { id: string; bytes: ArrayBuffer }
export interface ParsedFile { data: FcsData | null; error: string; busy: boolean }

interface Done { compensate: boolean; data: FcsData | null; error: string }

/**
 * Parses many FCS files, one worker job per file, and re-parses every file when `compensate` changes.
 * While a file is re-parsed its previous result stays available (busy is true). Without Worker support
 * (unit tests) files are parsed synchronously with the same function.
 */
export function useParsedFiles(files: FileSource[], compensate: boolean): Record<string, ParsedFile> {
  const [done, setDone] = useState<Record<string, Done>>({});
  const running = useRef(new Map<string, { worker: Worker | null; compensate: boolean }>());

  useEffect(() => {
    const ids = new Set(files.map(f => f.id));
    for (const [id, r] of running.current) {
      if (!ids.has(id) || r.compensate !== compensate) { r.worker?.terminate(); running.current.delete(id); }
    }
    for (const f of files) {
      const have = done[f.id];
      if ((have && have.compensate === compensate) || running.current.has(f.id)) continue;
      const finish = (result: Done) => setDone(prev => ({ ...prev, [f.id]: result }));
      if (typeof Worker === 'undefined') {
        running.current.set(f.id, { worker: null, compensate });
        try { finish({ compensate, data: runFlowJob({ bytes: f.bytes, compensate }), error: '' }); }
        catch (e) { finish({ compensate, data: null, error: e instanceof Error ? e.message : String(e) }); }
        running.current.delete(f.id);
        continue;
      }
      let worker: Worker;
      try { worker = makeFlowWorker(); }
      catch (e) { finish({ compensate, data: null, error: e instanceof Error ? e.message : String(e) }); continue; }
      running.current.set(f.id, { worker, compensate });
      const end = () => { worker.terminate(); running.current.delete(f.id); };
      worker.onmessage = (ev: MessageEvent<{ ok: true; result: FcsData } | { ok: false; error: string }>) => {
        end();
        const d = ev.data;
        finish(d.ok ? { compensate, data: d.result, error: '' } : { compensate, data: null, error: d.error });
      };
      worker.onerror = ev => { end(); finish({ compensate, data: null, error: ev.message || 'Worker failed' }); };
      // The bytes are copied, not transferred, so the file can be parsed again with other options.
      worker.postMessage({ bytes: f.bytes, compensate });
    }
  }, [files, compensate, done]);

  useEffect(() => () => { for (const r of running.current.values()) r.worker?.terminate(); running.current.clear(); }, []);

  // Stable between renders so callers can memoise on it.
  return useMemo(() => {
    const out: Record<string, ParsedFile> = {};
    for (const f of files) {
      const d = done[f.id];
      out[f.id] = d && d.compensate === compensate
        ? { data: d.data, error: d.error, busy: false }
        : { data: d?.data ?? null, error: '', busy: true };
    }
    return out;
  }, [files, compensate, done]);
}
