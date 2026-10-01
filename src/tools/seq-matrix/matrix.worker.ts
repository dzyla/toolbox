import { computeSequenceMatrices } from '@/core/msa';
import type { MatrixJob } from './job';

self.onmessage = (ev: MessageEvent<MatrixJob>) => {
  try {
    const { sequences, options } = ev.data;
    self.postMessage({ ok: true, result: computeSequenceMatrices(sequences, options) });
  } catch (e) {
    self.postMessage({ ok: false, error: e instanceof Error ? e.message : String(e) });
  }
};
