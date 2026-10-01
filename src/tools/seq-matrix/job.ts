import { computeSequenceMatrices, type SequenceItem } from '@/core/msa';

export interface MatrixJob {
  sequences: SequenceItem[];
  options: Parameters<typeof computeSequenceMatrices>[1];
}

export const runMatrixJob = (job: MatrixJob) => computeSequenceMatrices(job.sequences, job.options);
export const makeMatrixWorker = () => new Worker(new URL('./matrix.worker.ts', import.meta.url), { type: 'module' });
