import { runDsfJob, type DsfJob } from './job';

self.onmessage = (ev: MessageEvent<DsfJob>) => {
  try {
    self.postMessage({ ok: true, result: runDsfJob(ev.data) });
  } catch (e) {
    self.postMessage({ ok: false, error: e instanceof Error ? e.message : String(e) });
  }
};
