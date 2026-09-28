import type { ToolProps } from '@/tools/registry';
import { useGelCore, type GelCore } from './workspace/core';
import { useGelLadders, type GelLadders } from './workspace/ladders';
import { useGelAnalysis, type GelAnalysis } from './workspace/analysis';
import { useGelProject, type GelProject } from './workspace/project';
import { useGelImage, type GelImage } from './workspace/image';
import { useGelLanes, type GelLanes } from './workspace/lanes';
import { useGelBands, type GelBands } from './workspace/bands';
import { useGelCanvas, type GelCanvas } from './workspace/canvas';
import { useGelExports, type GelExports } from './workspace/exports';

export { LADDERS, DEFAULTS, type State } from './workspace-model';
export type { GelCore, GelLadders, GelAnalysis, GelProject, GelImage, GelLanes, GelBands, GelCanvas, GelExports };

/**
 * All gel-tool state, derived analysis and handlers, composed from focused hooks in ./workspace/.
 * Hooks run in dependency order; each receives the earlier results it reads.
 */
export function useGelWorkspace({ projectId }: ToolProps) {
  const core = useGelCore();
  const ladders = useGelLadders(core);
  const analysis = useGelAnalysis(core, ladders);
  const project = useGelProject(projectId, core);
  const image = useGelImage(core, analysis, project);
  const lanes = useGelLanes(core, analysis);
  const bands = useGelBands(core, analysis);
  const canvas = useGelCanvas(core, ladders, analysis, bands);
  const exports = useGelExports(core, ladders, analysis);
  return { ...core, ...ladders, ...analysis, ...project, ...image, ...lanes, ...bands, ...canvas, ...exports };
}

export type GelWorkspace = ReturnType<typeof useGelWorkspace>;
