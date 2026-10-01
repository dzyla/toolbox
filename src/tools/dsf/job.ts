import { analyzeDsfDataset, type AnalyzeDsfOptions, type ParsedDsfData } from '@/core/dsf';

export interface DsfJob {
  parsed: ParsedDsfData;
  options: AnalyzeDsfOptions;
}

export const runDsfJob = (job: DsfJob) => analyzeDsfDataset(job.parsed, job.options);
export const makeDsfWorker = () => new Worker(new URL('./dsf.worker.ts', import.meta.url), { type: 'module' });
