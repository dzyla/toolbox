/* Plate-reader data model: wells, groups, parsed plates, normalization and QC types. */
export type PlateFormat = 96 | 384;

export type SampleType = 'sample' | 'standard' | 'pos-ctrl' | 'neg-ctrl' | 'blank' | 'empty' | 'unassigned';

export interface WellValue {
  id: string; // e.g. 'A1', 'H12', 'P24'
  row: string; // e.g. 'A'
  col: number; // e.g. 1
  raw: number | null;
  normalized: number | null;
  sampleGroupId?: string;
  sampleName?: string;
  sampleType: SampleType;
  concentration?: number;
  concentrationUnit?: string;
  dilutionFactor?: number;
  calculatedConcentration?: number | null;
  finalConcentration?: number | null;
  isOutlier?: boolean;
  outlierReason?: string;
  isExcluded?: boolean;
  statusNote?: string;
}

export interface SampleGroup {
  id: string;
  name: string;
  color: string;
  type: SampleType;
  concentration?: number;
  concentrationUnit?: string;
  unit?: string;
}

export interface ParsedPlate {
  format: PlateFormat;
  wells: Record<string, WellValue>;
  rows: string[];
  cols: number[];
  metadata: Record<string, string>;
  detectedFormat: 'matrix' | 'list';
  vendorHint: 'tecan' | 'bmg' | 'biotek' | 'moldev' | 'generic';
  delimiter: string;
  rawText: string;
}

export type NormalizationMode =
  | 'raw'
  | 'blank-subtracted'
  | 'percent-control'
  | 'percent-inhibition'
  | 'fold-change';

export interface NormalizationConfig {
  mode: NormalizationMode;
  blankGroupId?: string;
  posControlGroupId?: string;
  negControlGroupId?: string;
  customBlankValue?: number;
  customControlValue?: number;
  customMinValue?: number;
  customMaxValue?: number;
  blankMethod?: 'global' | 'row' | 'col' | 'column' | 'wells' | 'custom' | 'none';
  minMethod?: 'neg-ctrl' | 'blank' | 'lowest' | 'wells' | 'custom';
  maxMethod?: 'pos-ctrl' | 'highest' | 'wells' | 'custom';
  blankWellIds?: string[];
  minWellIds?: string[];
  maxWellIds?: string[];
  excludedWellIds?: string[];
}

export interface AnnotationToken {
  id?: string;
  label?: string;
  sampleName?: string;
  sampleGroupId?: string;
  sampleType?: SampleType;
  role?: SampleType;
  concentration?: number;
  concentrationUnit?: string;
  unit?: string;
  dilutionFactor?: number;
  customName?: string;
}

export interface ParsedLayoutAnnotation {
  id: string; // e.g. 'A1'
  label: string;
  sampleName: string;
  sampleGroupId: string;
  sampleType: SampleType;
  concentration?: number;
  concentrationUnit?: string;
  dilutionFactor?: number;
}

export type OutlierMethod = 'grubbs' | 'sd-cutoff' | 'both' | 'none';

export interface OutlierConfig {
  method: OutlierMethod;
  alpha?: number; // default 0.05
  sdCutoff?: number; // default 2.5
  cvThreshold?: number; // default 15 (%)
  autoExcludeOutliers?: boolean;
}

export interface GroupStats {
  groupId: string;
  groupName: string;
  sampleType: SampleType;
  concentration?: number;
  concentrationUnit?: string;
  dilutionFactor?: number;
  color: string;
  nTotal: number;
  nValid: number;
  nExcluded: number;
  rawValues: number[];
  normalizedValues: number[];
  rawMean: number;
  rawSd: number;
  rawSem: number;
  rawCv: number;
  mean: number;
  sd: number;
  sem: number;
  cv: number; // %CV = 100 * sd / mean
  median: number;
  mad: number; // Median Absolute Deviation
  min: number;
  max: number;
  outlierWellIds: string[];
  calculatedConc?: number | null;
  qcFlags: {
    highCv: boolean;
    lowN: boolean;
    hasOutliers: boolean;
    status: 'pass' | 'warning' | 'fail';
    messages: string[];
  };
}

export interface AssayQcMetrics {
  zPrime: number | null;
  zFactorInterpretation: 'excellent' | 'marginal' | 'unacceptable' | null;
  signalToNoise: number | null;
  signalToBackground: number | null;
  dynamicRange: number | null;
  posMean: number | null;
  negMean: number | null;
  blankMean: number | null;
  plateMeanCv: number | null;
  totalWells: number;
  validWells: number;
  outlierCount: number;
}

export const ROW_LABELS_96 = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'] as const;
export const ROW_LABELS_384 = [
  'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H',
  'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P',
] as const;

export const DEFAULT_GROUPS: SampleGroup[] = [
  { id: 'blank', name: 'Blank / Buffer', color: '#94a3b8', type: 'blank' },
  { id: 'neg-ctrl', name: 'Negative Control (Vehicle)', color: '#64748b', type: 'neg-ctrl' },
  { id: 'pos-ctrl', name: 'Positive Control (Max)', color: '#10b981', type: 'pos-ctrl' },
  { id: 'sample-1', name: 'Sample 1', color: '#3b82f6', type: 'sample' },
  { id: 'sample-2', name: 'Sample 2', color: '#8b5cf6', type: 'sample' },
  { id: 'sample-3', name: 'Sample 3', color: '#ec4899', type: 'sample' },
  { id: 'sample-4', name: 'Sample 4', color: '#f59e0b', type: 'sample' },
  { id: 'sample-5', name: 'Sample 5', color: '#06b6d4', type: 'sample' },
];
