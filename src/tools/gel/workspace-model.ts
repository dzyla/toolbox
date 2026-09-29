import { type StandardLadder } from './ladder-library';
import { type MassCalibrationModel, type CalibrationModel } from '@/core/gel/calibration';
import { type Polarity } from '@/core/gel/types';
import type { NormMode } from '@/core/gel/groups';
import laddersData from '@/data/ladders.json';




export const LADDERS = laddersData.ladders as unknown as StandardLadder[];

/** A band picked by its size (kDa, or null when uncalibrated) and relative position. */
export interface BandRef { size: number | null; rf: number }

export interface State {
  polarity: Polarity;
  brightness: number;
  contrast: number;
  minClip: number;
  maxClip: number;
  gamma: number;
  invertDisplay: boolean;
  bgMethod: 'shared' | 'rolling' | 'valley' | 'none';
  rollingRadius: number;
  prominence: number;
  ladderLaneId: string;
  ladderId: string;
  calibMethod: CalibrationModel;
  massLaneId: string;
  massCalibMethod: MassCalibrationModel;
  massPresetId: string;
  calibSubTab: 'mw' | 'mass';
  showMassLabels: boolean;
  refBandId: string;
  loadingRefLaneId: string;
  viewTab: 'gel' | 'calib' | 'quant';
  groupNorm: NormMode;
  groupTarget: BandRef | null;
  groupControl: BandRef | null;
  groupControlCondition: string;
  groupMarginPct: number;
  groupWelch: boolean;
  quantSubView: 'bands' | 'loading' | 'groups';
  tableMode: 'all' | 'selected';
}

export const DEFAULTS: State = {
  polarity: 'dark',
  brightness: 1,
  contrast: 1,
  minClip: 0,
  maxClip: 1,
  gamma: 1,
  invertDisplay: false,
  // Default to per-lane rolling-ball baseline: it adapts to each lane's local background, so dense
  // bands are corrected per-lane (a single shared baseline subtracts the same background from every
  // lane — including the reference — which under-corrects dense samples).
  bgMethod: 'rolling',
  rollingRadius: 40,
  prominence: 0.05,
  ladderLaneId: '',
  // Valid built-in ladder id (was 'broad-protein', which does not exist in ladders.json — the preset
  // dropdown rendered blank and activeLadder silently fell back to LADDERS[0]).
  ladderId: 'biorad-precision-plus',
  calibMethod: 'piecewise',
  massLaneId: '',
  massCalibMethod: 'linear',
  massPresetId: 'two-fold-dilution',
  calibSubTab: 'mw',
  showMassLabels: false,
  refBandId: '',
  loadingRefLaneId: '',
  viewTab: 'gel',
  groupNorm: 'none',
  groupTarget: null,
  groupControl: null,
  groupControlCondition: '',
  groupMarginPct: 10,
  groupWelch: false,
  quantSubView: 'bands',
  tableMode: 'all',
};
/** Upgrade settings from old links and projects: the former natural 'spline' model is now the monotone cubic. */
export function migrateState(v: State): State {
  return (v.calibMethod as string) === 'spline' ? { ...v, calibMethod: 'monotone' } : v;
}
