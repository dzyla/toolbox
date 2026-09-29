/* Export tables for the gel tool (pure). Empty cell = unknown; never a placeholder number. */
import type { Calibration, MassCalibration } from '@/core/gel/calibration';
import type { GroupSummary } from '@/core/gel/groups';
import type { SourceInfo } from '@/lib/image';
import { isSaturated } from '@/core/gel/quant';
import type { LaneAnalysisItem } from './analysis';

type Cell = string | number;
const num = (v: number | null | undefined, d = 4): Cell => (v === null || v === undefined || !Number.isFinite(v) ? '' : Number(v.toPrecision(d)));

export function tidyRows(i: { analysis: LaneAnalysisItem[]; labels: Record<string, string>; roles: Record<string, string>;
  meta: Record<string, { condition: string; replicate: number | null }>; valueByLane: Record<string, { value: number | null; reason: string | null }>; sizeUnit: string; massUnit: string }): Cell[][] {
  const head = ['Lane', 'Lane_Label', 'Role', 'Condition', 'Replicate', 'Band', 'Peak_Y_px', `Size_${i.sizeUnit}`, `Ladder_Assigned_${i.sizeUnit}`, 'Size_Residual_Pct',
    'Raw', 'Background', 'Net', 'Percent_Of_Lane', 'Ratio_To_Reference', `Mass_${i.massUnit}`, 'Mass_Extrapolated', 'Mass_Below_LOQ',
    'Saturation_Fraction', 'Saturated', 'Baseline_Warning', 'Lane_Normalized_Value', 'Lane_Value_Note', 'Total_Lane_Signal', 'Loading_Ratio_vs_Reference', 'TPN_Factor'];
  const rows: Cell[][] = [head];
  for (const a of i.analysis) {
    const id = a.lane.id, meta = i.meta[id], lv = i.valueByLane[id];
    for (const m of a.metrics) rows.push([
      a.laneIdx + 1, i.labels[id] || `Lane ${a.laneIdx + 1}`, i.roles[id] ?? 'sample', meta?.condition ?? '', meta?.replicate ?? '', m.number, num(m.peakY, 5),
      num(m.sizeEst), num(m.ladderAssigned), num(m.sizeResidualPct, 3), num(m.raw, 6), num(m.background, 6), num(m.net, 6), num(m.share, 4), num(m.ratio),
      m.massEst !== null && m.massEst > 0 ? num(m.massEst) : '', m.massFlags ? (m.massFlags.extrapolated ? 'YES' : 'NO') : '', m.massFlags ? (m.massFlags.belowLoq ? 'YES' : 'NO') : '',
      num(m.saturation, 3), m.saturation === null ? '' : isSaturated(m.saturation) ? 'YES' : 'NO', m.baselineWarning ? 'YES' : 'NO',
      num(lv?.value ?? null, 6), lv?.reason ?? '', num(a.totalLaneSignal, 6), num(a.loadingRatio, 4), num(a.normFactor, 4),
    ]);
  }
  return rows;
}

export function groupSummaryRows(s: GroupSummary[], control: string): Cell[][] {
  const head = ['Condition', 'Is_Control', 'n', 'n_Excluded', 'Mean', 'SD', 'SEM', 'CI95_Low', 'CI95_High', 'CV_Pct', 'Fold_Change_vs_Control', 'Welch_t', 'Welch_df', 'p', 'p_Holm', 'Flags'];
  return [head, ...s.map(g => [g.condition, g.condition === control ? 'YES' : 'NO', g.n, g.nExcluded, num(g.mean, 6), num(g.sd, 6), num(g.sem, 6),
    num(g.ci95?.[0] ?? null, 6), num(g.ci95?.[1] ?? null, 6), num(g.cvPct, 4), num(g.foldChange, 6),
    num(g.test?.t ?? null, 6), num(g.test?.df ?? null, 5), num(g.test?.p ?? null, 4), num(g.test?.pAdj ?? null, 4), g.flags.join('; ')])];
}

export function calibrationRows(i: { calibration: Calibration | null; ladderRows: { y: number; assigned: number; fitted: number; residualPct: number | null }[]; mass: MassCalibration | null; sizeUnit: string }): Cell[][] {
  const rows: Cell[][] = [];
  if (i.calibration) {
    rows.push(['Size calibration', `model=${i.calibration.model}`, `R2=${i.calibration.r2.toFixed(5)}`, i.calibration.slope !== undefined ? `slope=${i.calibration.slope}` : '', i.calibration.intercept !== undefined ? `intercept=${i.calibration.intercept}` : '']);
    rows.push(['Peak_Y_px', `Assigned_${i.sizeUnit}`, `Fitted_${i.sizeUnit}`, 'Residual_Pct']);
    for (const r of i.ladderRows) rows.push([num(r.y, 5), r.assigned, num(r.fitted), num(r.residualPct, 3)]);
    rows.push([]);
  }
  if (i.mass) {
    const u = i.mass.unit;
    rows.push(['Mass calibration', `model=${i.mass.model}`, `R2=${i.mass.r2.toFixed(5)}`, i.mass.formula, `LOD_${u}=${i.mass.lod ?? ''}`, `LOQ_${u}=${i.mass.loq ?? ''}`, `residualSD_${u}=${i.mass.residualSD ?? ''}`]);
    rows.push(['Net', `Known_${u}`, `Fitted_${u}`, 'Residual']);
    for (const r of i.mass.residuals) rows.push([num(r.netIntensity, 6), r.knownMass, num(r.fittedMass), num(r.residual)]);
  }
  return rows;
}

export function methodsText(i: { source: SourceInfo | null; transforms: string[]; deskewAngle: number; laneWidths: number[]; bgMethod: string; radius: number; prominence: number;
  calibModel: string; calibR2: number | null; calibrated: boolean; hasTarget: boolean; massModel: string | null; massR2: number | null; norm: string; welch: boolean; version: string }): string {
  const CAL: Record<string, string> = { linear: 'log-linear fit', piecewise: 'piecewise-linear interpolation', monotone: 'monotone cubic (Fritsch–Carlson) interpolation' };
  const MASS: Record<string, string> = { linear: 'linear', linear_zero: 'linear through the origin', quadratic: 'quadratic', power: 'power-law' };
  const src = i.source?.format === 'demo' ? 'the built-in synthetic demo gel' : i.source ? `${i.source.bitDepth}-bit ${i.source.format.toUpperCase()}${i.source.lossy ? ' (lossy compression)' : ''}${i.source.rescaled ? ' (float, min–max rescaled)' : ''}` : 'an image of unrecorded format';
  const geo = [...i.transforms, ...(Math.abs(i.deskewAngle) > 1e-6 ? [`deskew ${i.deskewAngle.toFixed(2)}° (bilinear)`] : [])];
  const widths = i.laneWidths.length ? `${Math.min(...i.laneWidths).toFixed(0)}–${Math.max(...i.laneWidths).toFixed(0)} px` : 'n/a';
  const bg = i.bgMethod === 'rolling' ? `a rolling-ball baseline (radius ${i.radius} px)` : i.bgMethod === 'shared' ? `a shared cross-lane baseline (radius ${i.radius} px)` : i.bgMethod === 'valley' ? 'a valley-to-valley baseline' : 'no baseline subtraction';
  const norm = i.norm === 'control-band' ? 'divided by the loading-control band in the same lane' : i.norm === 'total-lane' ? 'divided by the total lane signal (total-protein normalization)' : 'not normalized';
  return [
    `Band densitometry was performed in Bio-Bench v${i.version} on ${src}${geo.length ? `; geometric corrections: ${geo.join(', ')}` : ''}.`,
    `Lane profiles were the mean signal across each lane (width ${widths}); bands were detected at ≥ ${(i.prominence * 100).toFixed(0)} % relative prominence and integrated after ${bg}.`,
    i.source?.rescaled ? 'Saturation could not be assessed (floating-point image rescaled on import).' : `Bands with more than 1 % of pixels at the detector limits were flagged as saturated.`,
    i.calibrated ? `Apparent sizes were estimated from the ladder by ${CAL[i.calibModel] ?? i.calibModel} of log10(size) vs migration${i.calibR2 !== null ? ` (R² = ${i.calibR2.toFixed(3)})` : ''}.` : 'No molecular-weight calibration was applied.',
    i.massModel ? `Amounts were read from a ${MASS[i.massModel] ?? i.massModel} standard curve${i.massR2 !== null ? ` (R² = ${i.massR2.toFixed(3)})` : ''}; LOD and LOQ were 3.3σ and 10σ of the fit residuals (ICH Q2).` : '',
    !i.hasTarget ? '' : `Target signal was ${norm}. Conditions are summarized as mean ± SD with t-based 95 % confidence intervals${i.welch ? '; each condition was compared with the control by Welch\'s t-test with Holm adjustment' : ''}.`,
  ].filter(Boolean).join(' ');
}
