// Worker factories live apart from the jobs: each worker imports only job-compute.ts, so no worker
// module graph reaches the other worker's `new URL(...)` (Vite rejects circular worker imports).
export * from './job-compute';
export const makeParseWorker = () => new Worker(new URL('./parse.worker.ts', import.meta.url), { type: 'module' });
export const makeInterfaceWorker = () => new Worker(new URL('./interface.worker.ts', import.meta.url), { type: 'module' });
