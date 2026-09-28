import { type AssayQcMetrics, type GroupStats, type OutlierConfig, type SampleGroup, type WellValue } from './types';
import { calculateSignalToBackground, calculateSignalToNoise, calculateZPrime, coefficientOfVariation, detectOutliers, mad, mean, median, sampleSd, sem } from './stats';

/* ========================================================================= */
/* 4. Replicate Statistics & Quality Control                                  */
/* ========================================================================= */

/** Compute replicate statistics per group */
export function computeGroupStatistics(
  wells: Record<string, WellValue>,
  groups: SampleGroup[],
  options: Partial<OutlierConfig> = {},
): GroupStats[] {
  const method = options.method ?? 'grubbs';
  const alpha = options.alpha ?? 0.05;
  const sdCutoff = options.sdCutoff ?? 2.5;
  const cvThreshold = options.cvThreshold ?? 15;
  const autoExclude = options.autoExcludeOutliers ?? false;

  const groupMap = new Map<string, SampleGroup>();
  for (const g of groups) groupMap.set(g.id, g);

  const wellsByGroup: Record<string, WellValue[]> = {};
  for (const well of Object.values(wells)) {
    const gid = well.sampleGroupId || (well.sampleName ? well.sampleName : 'unassigned');
    if (!wellsByGroup[gid]) wellsByGroup[gid] = [];
    wellsByGroup[gid]!.push(well);
  }

  const results: GroupStats[] = [];

  for (const [gid, gWells] of Object.entries(wellsByGroup)) {
    const groupDef = groupMap.get(gid) ?? {
      id: gid,
      name: gWells[0]?.sampleName || gid,
      color: '#94a3b8',
      type: gWells[0]?.sampleType || 'sample',
    };

    const nTotal = gWells.length;
    const validWells = gWells.filter(w => w.raw !== null && !w.isExcluded);
    const nValid = validWells.length;
    const nExcluded = nTotal - nValid;

    const rawValues = validWells.map(w => w.raw!).filter(v => typeof v === 'number' && !isNaN(v));
    const normValues = validWells.map(w => w.normalized ?? w.raw!).filter(v => typeof v === 'number' && !isNaN(v));

    const rawM = mean(rawValues);
    const rawS = sampleSd(rawValues);
    const rawSe = sem(rawValues);
    const rawC = coefficientOfVariation(rawValues);

    let m = mean(normValues);
    let s = sampleSd(normValues);
    let se = sem(normValues);
    let c = coefficientOfVariation(normValues);
    let med = median(normValues);
    let mDev = mad(normValues);
    let minVal = normValues.length > 0 ? Math.min(...normValues) : 0;
    let maxVal = normValues.length > 0 ? Math.max(...normValues) : 0;

    const outlierWellIds: string[] = [];
    if (normValues.length >= 3 && method !== 'none') {
      const outlierRes = detectOutliers(normValues, { method, alpha, sdCutoff });
      for (const o of outlierRes.details) {
        const well = validWells[o.index];
        if (well) {
          outlierWellIds.push(well.id);
          well.isOutlier = true;
          well.outlierReason = o.reason;
        }
      }

      if (autoExclude && outlierWellIds.length > 0) {
        const filtered = validWells.filter(w => !outlierWellIds.includes(w.id));
        const filteredNorm = filtered.map(w => w.normalized ?? w.raw!).filter(v => typeof v === 'number' && !isNaN(v));
        if (filteredNorm.length >= 1) {
          m = mean(filteredNorm);
          s = sampleSd(filteredNorm);
          se = sem(filteredNorm);
          c = coefficientOfVariation(filteredNorm);
          med = median(filteredNorm);
          mDev = mad(filteredNorm);
          minVal = Math.min(...filteredNorm);
          maxVal = Math.max(...filteredNorm);
        }
      }
    }

    const highCv = c > cvThreshold && nValid >= 2;
    const lowN = nValid < 2 && groupDef.type !== 'blank';
    const hasOutliers = outlierWellIds.length > 0;
    const messages: string[] = [];

    if (highCv) messages.push(`%CV (${c.toFixed(1)}%) exceeds QC threshold (${cvThreshold}%)`);
    if (lowN) messages.push(`Low replicate count (N = ${nValid})`);
    if (hasOutliers) messages.push(`${outlierWellIds.length} outlier(s) detected: ${outlierWellIds.join(', ')}`);

    let status: 'pass' | 'warning' | 'fail' = 'pass';
    if (lowN || (highCv && hasOutliers)) {
      status = 'fail';
    } else if (highCv || hasOutliers) {
      status = 'warning';
    }

    results.push({
      groupId: gid,
      groupName: groupDef.name,
      sampleType: groupDef.type,
      concentration: groupDef.concentration ?? gWells[0]?.concentration,
      concentrationUnit: groupDef.concentrationUnit ?? gWells[0]?.concentrationUnit,
      dilutionFactor: gWells[0]?.dilutionFactor,
      color: groupDef.color,
      nTotal,
      nValid,
      nExcluded,
      rawValues,
      normalizedValues: normValues,
      rawMean: rawM,
      rawSd: rawS,
      rawSem: rawSe,
      rawCv: rawC,
      mean: m,
      sd: s,
      sem: se,
      cv: c,
      median: med,
      mad: mDev,
      min: minVal,
      max: maxVal,
      outlierWellIds,
      qcFlags: {
        highCv,
        lowN,
        hasOutliers,
        status,
        messages,
      },
    });
  }

  return results;
}

/** Compute overall Assay Screening QC Metrics (Z'-factor, S/B, S/N) */
export function computeAssayQc(groups: GroupStats[]): AssayQcMetrics {
  const posGroup = groups.find(g => g.sampleType === 'pos-ctrl');
  const negGroup = groups.find(g => g.sampleType === 'neg-ctrl');
  const blankGroup = groups.find(g => g.sampleType === 'blank');

  let zPrime: number | null = null;
  let zInterp: 'excellent' | 'marginal' | 'unacceptable' | null = null;
  let sn: number | null = null;
  let sb: number | null = null;
  let dynamicRange: number | null = null;

  if (posGroup && negGroup && posGroup.nValid >= 2 && negGroup.nValid >= 2) {
    const zCalc = calculateZPrime(posGroup.normalizedValues, negGroup.normalizedValues);
    zPrime = zCalc.zPrime;
    zInterp = zCalc.interpretation;
    dynamicRange = zCalc.dynamicRange;
    sn = calculateSignalToNoise(posGroup.normalizedValues, negGroup.normalizedValues);
    sb = calculateSignalToBackground(posGroup.normalizedValues, negGroup.normalizedValues);
  }

  const validSampleGroups = groups.filter(g => g.nValid >= 2 && g.sampleType !== 'blank');
  const plateMeanCv = validSampleGroups.length > 0
    ? mean(validSampleGroups.map(g => g.cv))
    : null;

  const totalWells = groups.reduce((acc, g) => acc + g.nTotal, 0);
  const validWells = groups.reduce((acc, g) => acc + g.nValid, 0);
  const outlierCount = groups.reduce((acc, g) => acc + g.outlierWellIds.length, 0);

  return {
    zPrime,
    zFactorInterpretation: zInterp,
    signalToNoise: sn,
    signalToBackground: sb,
    dynamicRange,
    posMean: posGroup?.mean ?? null,
    negMean: negGroup?.mean ?? null,
    blankMean: blankGroup?.mean ?? null,
    plateMeanCv,
    totalWells,
    validWells,
    outlierCount,
  };
}
