import { parseFcs, type FcsData } from '@/core/flow';

export interface FlowJob {
  bytes: ArrayBuffer;
  compensate: boolean;
}

export const runFlowJob = (job: FlowJob): FcsData => parseFcs(job.bytes, { compensate: job.compensate });
export const makeFlowWorker = () => new Worker(new URL('./flow.worker.ts', import.meta.url), { type: 'module' });
