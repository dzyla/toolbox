/* Gel projects: the working image (after crop/rotation) as a binary Float32 asset plus lanes,
   bands, labels and analysis settings. Schema-versioned and validated on restore. */
import type { Band, Lane, Plane } from '@/core/gel/types';
import type { Project } from '@/lib/projects';
import type { SourceInfo } from '@/lib/image';
import type { LaneMeta } from './lane-meta';

export const GEL_PROJECT_VERSION = 2;
const PLANE_ASSET = 'plane.f32';
/** Keep saved images within a size IndexedDB handles comfortably on phones (~64 MB of Float32). */
export const MAX_SAVED_PIXELS = 16_000_000;

export interface GelProjectData {
  imageName: string;
  gelTitle: string;
  lanes: Lane[];
  selectedLaneId: string;
  bandMap: Record<string, Band[]>;
  laneLabels: Record<string, string>;
  customMassMap: Record<string, number>;
  display: { showMwLabels: boolean; showLaneHeaders: boolean; stripLanePrefix: boolean; gelLayout: 'split' | 'stacked' };
  laneMeta: Record<string, LaneMeta>;
  ladderSizeMap: Record<string, number | null>;
  sourceInfo: SourceInfo | null;
  appliedTransforms: string[];
  /** The tool's link/analysis settings (validated against its defaults by the caller). */
  settings: Record<string, unknown>;
}

interface StoredState extends GelProjectData {
  schemaVersion: number;
  plane: { width: number; height: number };
}

export function gelProjectSnapshot(plane: Plane, data: GelProjectData, thumbnail?: Blob) {
  if (plane.width * plane.height > MAX_SAVED_PIXELS) {
    throw new Error(`This image is ${plane.width} × ${plane.height} px; projects can store images up to ${MAX_SAVED_PIXELS.toLocaleString()} px. Crop it first.`);
  }
  const state: StoredState = { schemaVersion: GEL_PROJECT_VERSION, plane: { width: plane.width, height: plane.height }, ...data };
  const bytes = new Float32Array(plane.data);
  return {
    name: data.gelTitle.trim() || data.imageName || 'Gel analysis',
    version: GEL_PROJECT_VERSION,
    state,
    assets: { [PLANE_ASSET]: new Blob([bytes.buffer], { type: 'application/octet-stream' }) },
    thumbnail,
  };
}

const isFiniteNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

function validLane(l: unknown): l is Lane {
  return isRecord(l) && typeof l.id === 'string' && ['x', 'y0', 'y1', 'width', 'tilt'].every(k => isFiniteNumber(l[k]));
}
function validBand(b: unknown): b is Band {
  return isRecord(b) && typeof b.id === 'string' && isFiniteNumber(b.y0) && isFiniteNumber(b.y1);
}

/** Validate a stored gel project and decode its image. Throws a user-facing error when it is unusable. */
export async function restoreGelProject(project: Project): Promise<{ plane: Plane; data: GelProjectData }> {
  const fail = (why: string) => new Error(`This gel project cannot be opened: ${why}.`);
  const s = project.state as Partial<StoredState> | undefined;
  if (!isRecord(s) || s.schemaVersion !== 1 && s.schemaVersion !== 2) throw fail('it was saved in an unsupported format');
  const size = s.plane;
  if (!isRecord(size) || !Number.isInteger(size.width) || !Number.isInteger(size.height) || (size.width as number) < 1 || (size.height as number) < 1) throw fail('the image size is missing');
  const width = size.width as number, height = size.height as number;
  const blob = project.assets?.[PLANE_ASSET];
  if (!blob) throw fail('the image is missing');
  const buffer = await blob.arrayBuffer();
  if (buffer.byteLength !== width * height * 4) throw fail('the stored image is incomplete');
  if (!Array.isArray(s.lanes) || !s.lanes.every(validLane)) throw fail('the lane layout is damaged');
  if (!isRecord(s.bandMap) || !Object.values(s.bandMap).every(list => Array.isArray(list) && list.every(validBand))) throw fail('the band annotations are damaged');
  const strings = (r: unknown) => isRecord(r) && Object.values(r).every(v => typeof v === 'string');
  const numbers = (r: unknown) => isRecord(r) && Object.values(r).every(isFiniteNumber);
  const display: Record<string, unknown> = isRecord(s.display) ? s.display : {};
  return {
    plane: { width, height, data: new Float32Array(buffer) },
    data: {
      imageName: typeof s.imageName === 'string' ? s.imageName : 'gel',
      gelTitle: typeof s.gelTitle === 'string' ? s.gelTitle : project.name,
      lanes: s.lanes,
      selectedLaneId: typeof s.selectedLaneId === 'string' ? s.selectedLaneId : (s.lanes[0]?.id ?? ''),
      bandMap: s.bandMap as Record<string, Band[]>,
      laneLabels: strings(s.laneLabels) ? s.laneLabels as Record<string, string> : {},
      customMassMap: numbers(s.customMassMap) ? s.customMassMap as Record<string, number> : {},
      display: {
        showMwLabels: display.showMwLabels !== false,
        showLaneHeaders: display.showLaneHeaders !== false,
        stripLanePrefix: display.stripLanePrefix === true,
        gelLayout: display.gelLayout === 'stacked' ? 'stacked' : 'split',
      },
      laneMeta: isRecord(s.laneMeta) && Object.values(s.laneMeta).every(m => isRecord(m) && typeof m.condition === 'string' && typeof m.excluded === 'boolean' && (m.replicate === null || isFiniteNumber(m.replicate)))
        ? s.laneMeta as Record<string, LaneMeta> : {},
      ladderSizeMap: isRecord(s.ladderSizeMap) && Object.values(s.ladderSizeMap).every(v => v === null || isFiniteNumber(v))
        ? s.ladderSizeMap as Record<string, number | null> : {},
      sourceInfo: isRecord(s.sourceInfo) && typeof s.sourceInfo.format === 'string' && [8, 16, 32].includes(s.sourceInfo.bitDepth as number) && typeof s.sourceInfo.lossy === 'boolean' && typeof s.sourceInfo.rescaled === 'boolean' ? s.sourceInfo as unknown as SourceInfo : null,
      appliedTransforms: Array.isArray(s.appliedTransforms) && s.appliedTransforms.every(t => typeof t === 'string') ? s.appliedTransforms : [],
      settings: isRecord(s.settings) ? s.settings : {},
    },
  };
}
