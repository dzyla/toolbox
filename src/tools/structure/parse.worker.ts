import { runTaggedParseJob, type TaggedParseJob } from './job-compute';

self.onmessage = (ev: MessageEvent<TaggedParseJob>) => {
  try {
    self.postMessage({ ok: true, result: runTaggedParseJob(ev.data) });
  } catch (e) {
    self.postMessage({ ok: false, error: e instanceof Error ? e.message : String(e) });
  }
};
