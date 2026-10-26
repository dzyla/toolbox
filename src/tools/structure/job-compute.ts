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
