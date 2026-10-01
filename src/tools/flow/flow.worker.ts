import { runFlowJob, type FlowJob } from './job';

self.onmessage = (ev: MessageEvent<FlowJob>) => {
  try {
    const result = runFlowJob(ev.data);
    // Hand the event columns back without copying them.
    const buffers = Array.from(new Set(result.columns.map(c => c.buffer as ArrayBuffer)));
    (self as unknown as Worker).postMessage({ ok: true, result }, buffers);
  } catch (e) {
    self.postMessage({ ok: false, error: e instanceof Error ? e.message : String(e) });
  }
};
