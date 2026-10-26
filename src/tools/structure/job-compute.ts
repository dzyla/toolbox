/** Pure jobs run inside the structure workers (and synchronously where Workers are missing). */
import {
  computeInterfaces,
  computeMetrics,
  parseStructure,
  type InterfacePair,
  type StructureFormat,
  type StructureMetrics,
  type StructureModel
} from '@/core/structure';

export interface ParseJob {
  text: string;
  name: string;
}
export interface ParseResult {
  model: StructureModel;
  format: StructureFormat;
}
export const runParseJob = (job: ParseJob): ParseResult => {
  const model = parseStructure(job.text, job.name);
  return { model, format: model.format };
};

/**
 * What the parse worker runs: the request ID travels with the job and comes back with the outcome
 * (model or parse error), so the viewer can tell a superseded request's reply from the newest one.
 */
export interface TaggedParseJob extends ParseJob {
  requestId: number;
}
export type TaggedParseResult = { requestId: number } & (
  | { ok: true; model: StructureModel; format: StructureFormat }
  | { ok: false; error: string }
);
export const runTaggedParseJob = (job: TaggedParseJob): TaggedParseResult => {
  try {
    return { requestId: job.requestId, ok: true, ...runParseJob(job) };
  } catch (e) {
    return { requestId: job.requestId, ok: false, error: e instanceof Error ? e.message : String(e) };
  }
};

export interface InterfaceJob {
  model: StructureModel;
  modelIndex: number;
  cutoff: number;
}
export interface InterfaceResult {
  pairs: InterfacePair[];
  metrics: StructureMetrics;
}
export const runInterfaceJob = (job: InterfaceJob): InterfaceResult => ({
  pairs: computeInterfaces(job.model, job.modelIndex, job.cutoff),
  metrics: computeMetrics(job.model, job.modelIndex)
});
