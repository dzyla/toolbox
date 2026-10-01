import { useEffect, useMemo, useState } from 'preact/hooks';

export interface WorkerCompute<O> {
  result: O | null;
  /** True while a worker is computing (never true in the synchronous fallback). */
  busy: boolean;
  error: string;
}

/**
 * Runs a pure computation off the main thread. `input` of null means "nothing to compute".
 * Each new input terminates the previous worker, so stale work is cancelled rather than queued.
 * Where Workers are unavailable (unit tests, very old browsers) it computes synchronously with
 * `compute`, so results are identical either way. The worker must be a module that answers
 * `postMessage(input)` with `{ ok: true, result }` or `{ ok: false, error }`.
 */
export function useWorkerCompute<I, O>(
  makeWorker: () => Worker,
  compute: (input: I) => O,
  input: I | null,
): WorkerCompute<O> {
  const hasWorker = typeof Worker !== 'undefined';
  const syncState = useMemo<WorkerCompute<O>>(() => {
    if (hasWorker || input === null) return { result: null, busy: false, error: '' };
    try {
      return { result: compute(input), busy: false, error: '' };
    } catch (e) {
      return { result: null, busy: false, error: e instanceof Error ? e.message : String(e) };
    }
  }, [hasWorker, input]);

  const [async, setAsync] = useState<WorkerCompute<O>>({ result: null, busy: false, error: '' });

  useEffect(() => {
    if (!hasWorker) return;
    if (input === null) {
      setAsync({ result: null, busy: false, error: '' });
      return;
    }
    let worker: Worker;
    try {
      worker = makeWorker();
    } catch (e) {
      setAsync({ result: null, busy: false, error: e instanceof Error ? e.message : String(e) });
      return;
    }
    setAsync(prev => ({ ...prev, busy: true, error: '' }));
    worker.onmessage = (ev: MessageEvent<{ ok: true; result: O } | { ok: false; error: string }>) => {
      const d = ev.data;
      setAsync(d.ok ? { result: d.result, busy: false, error: '' } : { result: null, busy: false, error: d.error });
    };
    worker.onerror = ev => setAsync({ result: null, busy: false, error: ev.message || 'Worker failed' });
    worker.postMessage(input);
    return () => worker.terminate();
  }, [hasWorker, input]);

  return hasWorker ? async : syncState;
}
