import { type GroupStats, type WellValue } from './types';
import { coefficientOfVariation, mean, sampleSd } from './stats';

/* ========================================================================= */
/* Standard Curve & Dose-Response Analytical Engines                         */
/* ========================================================================= */

export interface StandardCurvePoint {
  concentration: number;
  rawValues: number[];
  normValues: number[];
  meanSignal: number;
  sdSignal: number;
  cvSignal: number;
}

export interface QuantifiedSample {
  groupId: string;
  sampleName: string;
  wellIds: string[];
  n: number;
  meanSignal: number;
  sdSignal: number;
  cvSignal: number;
  dilutionFactor: number;
  calculatedConc: number | null;
  finalConc: number | null;
  concSd: number | null;
  concCv: number | null;
  unit: string;
  inRange: boolean;
  status: 'in-range' | 'below-lloq' | 'above-uloq' | 'unquantified';
}

export interface StandardCurveResult {
  hasStandards: boolean;
  points: StandardCurvePoint[];
  fitType: 'linear' | 'log-log';
  slope: number;
  intercept: number;
  rSquared: number;
  equation: string;
  minStdConc: number;
  maxStdConc: number;
  unit: string;
  quantifiedSamples: QuantifiedSample[];
}

/** Compute standard curve regression and quantify unknown sample concentrations */
export function computeStandardCurveQuantification(
  wells: Record<string, WellValue>,
  groups: GroupStats[],
  options: {
    useNormalized?: boolean;
    fitType?: 'linear' | 'log-log';
  } = {},
): StandardCurveResult {
  const useNorm = options.useNormalized ?? false;
  const fitType = options.fitType ?? 'linear';

  const stdWells = Object.values(wells).filter(w =>
    w.sampleType === 'standard' &&
    w.concentration !== undefined &&
    !isNaN(w.concentration) &&
    !w.isExcluded &&
    w.raw !== null
  );

  if (stdWells.length === 0) {
    return {
      hasStandards: false,
      points: [],
      fitType: 'linear',
      slope: 0,
      intercept: 0,
      rSquared: 0,
      equation: 'No standard calibrators defined',
      minStdConc: 0,
      maxStdConc: 0,
      unit: '',
      quantifiedSamples: [],
    };
  }

  const byConc = new Map<number, { raw: number[]; norm: number[]; unit: string }>();
  for (const w of stdWells) {
    const c = w.concentration!;
    if (!byConc.has(c)) {
      byConc.set(c, { raw: [], norm: [], unit: w.concentrationUnit || 'pg/mL' });
    }
    const entry = byConc.get(c)!;
    entry.raw.push(w.raw!);
    entry.norm.push(w.normalized ?? w.raw!);
  }

  const sortedConcs = Array.from(byConc.keys()).sort((a, b) => a - b);
  const points: StandardCurvePoint[] = [];

  for (const c of sortedConcs) {
    const entry = byConc.get(c)!;
    const vals = useNorm ? entry.norm : entry.raw;
    const m = mean(vals);
    const s = sampleSd(vals);
    const cv = coefficientOfVariation(vals);
    points.push({
      concentration: c,
      rawValues: entry.raw,
      normValues: entry.norm,
      meanSignal: m,
      sdSignal: s,
      cvSignal: cv,
    });
  }

  const unit = stdWells[0]?.concentrationUnit || 'pg/mL';

  if (points.length < 2) {
    return {
      hasStandards: true,
      points,
      fitType: 'linear',
      slope: 0,
      intercept: 0,
      rSquared: 0,
      equation: 'Need at least 2 distinct standard concentrations for curve fitting',
      minStdConc: points[0]?.concentration ?? 0,
      maxStdConc: points[0]?.concentration ?? 0,
      unit,
      quantifiedSamples: [],
    };
  }

  const xVals = points.map(p => p.concentration);
  const yVals = points.map(p => p.meanSignal);

  let m = 0;
  let b = 0;
  let r2 = 0;
  let eq = '';

  if (fitType === 'log-log' && xVals.every(x => x > 0) && yVals.every(y => y > 0)) {
    const lnX = xVals.map(x => Math.log(x));
    const lnY = yVals.map(y => Math.log(y));
    const xMean = mean(lnX);
    const yMean = mean(lnY);

    let num = 0;
    let den = 0;
    for (let i = 0; i < lnX.length; i++) {
      num += (lnX[i]! - xMean) * (lnY[i]! - yMean);
      den += Math.pow(lnX[i]! - xMean, 2);
    }
    m = den > 1e-12 ? num / den : 0;
    b = yMean - m * xMean;

    let sse = 0;
    let sst = 0;
    for (let i = 0; i < lnX.length; i++) {
      const pred = m * lnX[i]! + b;
      sse += Math.pow(lnY[i]! - pred, 2);
      sst += Math.pow(lnY[i]! - yMean, 2);
    }
    r2 = sst > 1e-12 ? Math.max(0, 1 - sse / sst) : 1;
    eq = `ln(Signal) = ${m.toFixed(4)} × ln(Conc) + ${b.toFixed(4)}`;
  } else {
    const xMean = mean(xVals);
    const yMean = mean(yVals);

    let num = 0;
    let den = 0;
    for (let i = 0; i < xVals.length; i++) {
      num += (xVals[i]! - xMean) * (yVals[i]! - yMean);
      den += Math.pow(xVals[i]! - xMean, 2);
    }
    m = den > 1e-12 ? num / den : 0;
    b = yMean - m * xMean;

    let sse = 0;
    let sst = 0;
    for (let i = 0; i < xVals.length; i++) {
      const pred = m * xVals[i]! + b;
      sse += Math.pow(yVals[i]! - pred, 2);
      sst += Math.pow(yVals[i]! - yMean, 2);
    }
    r2 = sst > 1e-12 ? Math.max(0, 1 - sse / sst) : 1;
    const sign = b >= 0 ? '+' : '-';
    eq = `Signal = ${m.toFixed(4)} × Conc ${sign} ${Math.abs(b).toFixed(4)}`;
  }

  const minStdConc = Math.min(...xVals);
  const maxStdConc = Math.max(...xVals);

  const unknownGroups = groups.filter(g => g.sampleType === 'sample');
  const quantifiedSamples: QuantifiedSample[] = [];

  for (const g of unknownGroups) {
    const gWells = Object.values(wells).filter(w =>
      (w.sampleGroupId === g.groupId || w.sampleName === g.groupName) &&
      !w.isExcluded &&
      w.raw !== null
    );

    if (gWells.length === 0) continue;

    const dilFactor = gWells[0]?.dilutionFactor ?? 1;
    const wellSignals = gWells.map(w => useNorm ? (w.normalized ?? w.raw!) : w.raw!);
    const meanSig = mean(wellSignals);
    const sdSig = sampleSd(wellSignals);
    const cvSig = coefficientOfVariation(wellSignals);

    const calculatedConcs: number[] = [];
    for (const sig of wellSignals) {
      let calcC: number | null = null;
      if (fitType === 'log-log') {
        if (sig > 0 && Math.abs(m) > 1e-12) {
          const lnC = (Math.log(sig) - b) / m;
          calcC = Math.exp(lnC);
        }
      } else {
        if (Math.abs(m) > 1e-12) {
          calcC = (sig - b) / m;
        }
      }
      if (calcC !== null) {
        calculatedConcs.push(calcC);
      }
    }

    let calcMean: number | null = null;
    let finalMean: number | null = null;
    let concSd: number | null = null;
    let concCv: number | null = null;
    let status: QuantifiedSample['status'] = 'unquantified';
    let inRange = false;

    if (calculatedConcs.length > 0) {
      calcMean = mean(calculatedConcs);
      finalMean = calcMean * dilFactor;
      concSd = sampleSd(calculatedConcs) * dilFactor;
      concCv = coefficientOfVariation(calculatedConcs);

      if (calcMean < minStdConc) {
        status = 'below-lloq';
      } else if (calcMean > maxStdConc) {
        status = 'above-uloq';
      } else {
        status = 'in-range';
        inRange = true;
      }
    }

    quantifiedSamples.push({
      groupId: g.groupId,
      sampleName: g.groupName,
      wellIds: gWells.map(w => w.id),
      n: gWells.length,
      meanSignal: meanSig,
      sdSignal: sdSig,
      cvSignal: cvSig,
      dilutionFactor: dilFactor,
      calculatedConc: calcMean,
      finalConc: finalMean,
      concSd,
      concCv,
      unit,
      inRange,
      status,
    });
  }

  return {
    hasStandards: true,
    points,
    fitType,
    slope: m,
    intercept: b,
    rSquared: r2,
    equation: eq,
    minStdConc,
    maxStdConc,
    unit,
    quantifiedSamples,
  };
}

export interface DoseResponsePoint {
  concentration: number;
  logConc: number;
  mean: number;
  sd: number;
  sem: number;
  cv: number;
  n: number;
  rawMean: number;
  rawSd: number;
}

export interface DoseResponseSeries {
  seriesName: string;
  points: DoseResponsePoint[];
  unit: string;
  minConc: number;
  maxConc: number;
  /** Aggregation is not a nonlinear fit. Use the fitting workflow for model parameters. */
  fitStatus: 'not-fit';
  estimatedEc50: number | null;
  hillSlope: number | null;
  bottom: number | null;
  top: number | null;
  rSquared: number | null;
}

/** Group dose-response points for a later, explicit nonlinear fit. */
export function computeDoseResponseSeries(
  groups: GroupStats[],
  options: { useNormalized?: boolean } = {},
): DoseResponseSeries[] {
  const useNorm = options.useNormalized ?? true;
  const seriesMap = new Map<string, GroupStats[]>();

  for (const g of groups) {
    if (g.sampleType !== 'sample' && g.sampleType !== 'standard') continue;
    let conc = g.concentration;
    if (conc === undefined) {
      const m = g.groupName.match(/([0-9]+(?:\.[0-9]+)?)/);
      if (m && m[1]) conc = parseFloat(m[1]);
    }
    if (conc === undefined || isNaN(conc)) continue;

    const baseName = g.groupName.replace(/[\s_-]*[0-9]+(?:\.[0-9]+)?\s*(?:µM|uM|nM|pM|mM|M|mg\/ml|µg\/ml|ug\/ml|ng\/ml|pg\/ml|%)?/i, '').trim() || 'Sample Series';

    if (!seriesMap.has(baseName)) {
      seriesMap.set(baseName, []);
    }
    seriesMap.get(baseName)!.push({
      ...g,
      concentration: conc,
    });
  }

  const seriesList: DoseResponseSeries[] = [];

  for (const [baseName, gList] of seriesMap.entries()) {
    if (gList.length < 2) continue;

    const sorted = [...gList].sort((a, b) => (a.concentration ?? 0) - (b.concentration ?? 0));
    const points: DoseResponsePoint[] = sorted.map(g => {
      const c = g.concentration ?? 1;
      const mVal = useNorm ? g.mean : g.rawMean;
      const sVal = useNorm ? g.sd : g.rawSd;
      const semVal = useNorm ? g.sem : g.rawSem;
      return {
        concentration: c,
        logConc: c > 0 ? Math.log10(c) : 0,
        mean: mVal,
        sd: sVal,
        sem: semVal,
        cv: g.cv,
        n: g.nValid,
        rawMean: g.rawMean,
        rawSd: g.rawSd,
      };
    });

    const concs = points.map(p => p.concentration);
    const minConc = Math.min(...concs);
    const maxConc = Math.max(...concs);
    const unit = sorted[0]?.concentrationUnit || 'µM';

    seriesList.push({
      seriesName: baseName,
      points,
      unit,
      minConc,
      maxConc,
      fitStatus: 'not-fit',
      estimatedEc50: null,
      hillSlope: null,
      bottom: null,
      top: null,
      rSquared: null,
    });
  }

  return seriesList;
}

/** Export quantified samples table as CSV */
export function exportQuantifiedSamplesCsv(res: StandardCurveResult): string {
  const headers = [
    'Sample_Name',
    'Group_ID',
    'Replicate_Count',
    'Dilution_Factor',
    'Mean_Signal',
    'Signal_SD',
    'Signal_CV_Pct',
    'Calculated_Conc_Direct',
    'Final_Sample_Conc',
    'Conc_Unit',
    'Conc_SD',
    'Conc_CV_Pct',
    'Quant_Status',
  ];

  const lines = [
    `# Standard Curve Equation: ${res.equation}`,
    `# Goodness of Fit R^2: ${res.rSquared.toFixed(4)}`,
    headers.join(','),
  ];

  for (const s of res.quantifiedSamples) {
    lines.push([
      `"${s.sampleName.replace(/"/g, '""')}"`,
      s.groupId,
      s.n,
      s.dilutionFactor,
      s.meanSignal.toFixed(4),
      s.sdSignal.toFixed(4),
      s.cvSignal.toFixed(2),
      s.calculatedConc !== null ? s.calculatedConc.toFixed(4) : '',
      s.finalConc !== null ? s.finalConc.toFixed(4) : '',
      s.unit,
      s.concSd !== null ? s.concSd.toFixed(4) : '',
      s.concCv !== null ? s.concCv.toFixed(2) : '',
      s.status.toUpperCase(),
    ].join(','));
  }

  return lines.join('\n');
}
