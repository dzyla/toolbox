import { buildMrcData, projectVolume, type MrcData, type ProjectionImage, type ProjectionOrientation } from '@/core/cryoem';

export interface TemplateProjection { orientation: ProjectionOrientation; image: ProjectionImage }

export interface TemplateJob {
  header: MrcData['header'];
  slices: Float32Array[];
  /** Orientations for this worker with their index in the full series. */
  items: Array<{ index: number; orientation: ProjectionOrientation }>;
}

export type TemplateReply = { ok: true; index: number; image: ProjectionImage } | { ok: false; error: string };

export const projectTemplateItem = (mrc: MrcData, orientation: ProjectionOrientation) => projectVolume(mrc, orientation);
export { buildMrcData };

/**
 * Projects every orientation, spread across a small pool of workers so the page stays responsive and
 * the views are computed in parallel. Falls back to a synchronous loop where Workers are unavailable.
 * Returns a cancel function; a cancelled run never calls `onDone`.
 */
export function generateTemplateSeries(
  mrc: MrcData,
  orientations: ProjectionOrientation[],
  onProgress: (done: number) => void,
  onDone: (result: TemplateProjection[]) => void,
  onError: (message: string) => void,
): () => void {
  const results: TemplateProjection[] = new Array(orientations.length);
  let done = 0;
  let cancelled = false;

  if (typeof Worker === 'undefined') {
    try {
      orientations.forEach((orientation, i) => { results[i] = { orientation, image: projectVolume(mrc, orientation) }; });
      onDone(results);
    } catch (e) { onError(e instanceof Error ? e.message : String(e)); }
    return () => { cancelled = true; };
  }

  const cores = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency || 2 : 2;
  const poolSize = Math.max(1, Math.min(4, cores - 1, orientations.length));
  const workers: Worker[] = [];
  const stop = () => { cancelled = true; workers.forEach(w => w.terminate()); };
  const fail = (message: string) => { if (!cancelled) { stop(); onError(message); } };

  for (let w = 0; w < poolSize; w++) {
    // Interleave so every worker gets a similar mix of orientations.
    const items = orientations.flatMap((orientation, index) => (index % poolSize === w ? [{ index, orientation }] : []));
    let worker: Worker;
    try {
      worker = new Worker(new URL('./template.worker.ts', import.meta.url), { type: 'module' });
    } catch (e) { fail(e instanceof Error ? e.message : String(e)); return stop; }
    workers.push(worker);
    worker.onmessage = (ev: MessageEvent<TemplateReply>) => {
      if (cancelled) return;
      const d = ev.data;
      if (!d.ok) { fail(d.error); return; }
      results[d.index] = { orientation: orientations[d.index]!, image: d.image };
      done++;
      onProgress(done);
      if (done === orientations.length) { workers.forEach(w => w.terminate()); onDone(results); }
    };
    worker.onerror = ev => fail(ev.message || 'Worker failed');
    const job: TemplateJob = { header: mrc.header, slices: mrc.slices, items };
    worker.postMessage(job);
  }
  return stop;
}
