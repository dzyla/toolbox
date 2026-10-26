import { runParseJob, type ParseJob } from './job-compute';

self.onmessage = (ev: MessageEvent<ParseJob>) => {
  try {
    self.postMessage({ ok: true, result: runParseJob(ev.data) });
  } catch (e) {
    self.postMessage({ ok: false, error: e instanceof Error ? e.message : String(e) });
  }
};
