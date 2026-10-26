import { runInterfaceJob, type InterfaceJob } from './job-compute';

self.onmessage = (ev: MessageEvent<InterfaceJob>) => {
  try {
    self.postMessage({ ok: true, result: runInterfaceJob(ev.data) });
  } catch (e) {
    self.postMessage({ ok: false, error: e instanceof Error ? e.message : String(e) });
  }
};
