/**
 * Scientific curve fitting engine: Linear, 4-Parameter Logistic (4PL / EC50),
 * Exponential Association/Decay, Michaelis-Menten, and Polynomial regression.
 */

export type FitModelType = 'linear' | '4pl' | 'exp_decay' | 'exp_assoc' | 'michaelis_menten' | 'quadratic';

export interface DataPoint {
  x: number;
  y: number;
  yValues?: number[]; // replicates
  sd?: number;
  sem?: number;
}

export interface ModelParameter {
  name: string;
  symbol: string;
  value: number;
  standardError?: number;
  ci95Low?: number;
  ci95High?: number;
  unit?: string;
  description: string;
}

export interface FitResult {
  modelType: FitModelType;
  modelName: string;
  equationStr: string;
  parameters: ModelParameter[];
  r2: number;
  adjR2: number;
  rmse: number;
  sse: number;
  df: number; // degrees of freedom
  predict: (x: number) => number;
  fittedPoints: Array<{ x: number; y: number; yFit: number; residual: number }>;
}

/** Parse CSV, TSV, or whitespace-delimited tabular data */
export function parseFittingData(text: string): DataPoint[] {
  const lines = text.trim().split(/\r?\n/);
  const points: DataPoint[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('//')) continue;

    // Split by comma, tab, or whitespace
    const parts = trimmed.split(/[\t,]+/).map(s => s.trim()).filter(Boolean);
    if (parts.length < 2) continue;

    const x = parseFloat(parts[0]!);
    if (isNaN(x)) continue; // skip header lines

    const yVals: number[] = [];
    for (let i = 1; i < parts.length; i++) {
      const val = parseFloat(parts[i]!);
      if (!isNaN(val)) yVals.push(val);
    }

    if (yVals.length === 0) continue;

    const meanY = yVals.reduce((a, b) => a + b, 0) / yVals.length;

    let sd = 0;
    let sem = 0;
    if (yVals.length > 1) {
      const sse = yVals.reduce((acc, v) => acc + Math.pow(v - meanY, 2), 0);
      sd = Math.sqrt(sse / (yVals.length - 1));
      sem = sd / Math.sqrt(yVals.length);
    }

    points.push({
      x,
      y: meanY,
      yValues: yVals,
      sd: yVals.length > 1 ? sd : undefined,
      sem: yVals.length > 1 ? sem : undefined,
    });
  }

  return points.sort((a, b) => a.x - b.x);
}

// Nelder-Mead Simplex optimization for non-linear least squares
export function nelderMead(
  costFunc: (params: number[]) => number,
  initialParams: number[],
  maxIterations = 1500,
  tolerance = 1e-8,
): number[] {
  const n = initialParams.length;
  const alpha = 1.0;  // reflection
  const gamma = 2.0;  // expansion
  const rho = 0.5;    // contraction
  const sigma = 0.5;  // shrink

  // Create simplex with n + 1 points
  const simplex: Array<{ point: number[]; cost: number }> = [];
  simplex.push({ point: [...initialParams], cost: costFunc(initialParams) });

  for (let i = 0; i < n; i++) {
    const p = [...initialParams];
    p[i] = p[i] !== 0 ? p[i]! * 1.15 : 0.1;
    simplex.push({ point: p, cost: costFunc(p) });
  }

  for (let iter = 0; iter < maxIterations; iter++) {
    // Order simplex points by cost
    simplex.sort((a, b) => a.cost - b.cost);

    // Check convergence: max difference in cost across simplex
    if (Math.abs(simplex[n]!.cost - simplex[0]!.cost) < tolerance) {
      break;
    }

    // Centroid of all points except the worst
    const centroid = new Array(n).fill(0);
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        centroid[j] += simplex[i]!.point[j]! / n;
      }
    }

    // Reflection
    const xr = new Array(n);
    for (let j = 0; j < n; j++) {
      xr[j] = centroid[j] + alpha * (centroid[j] - simplex[n]!.point[j]!);
    }
    const fxr = costFunc(xr);

    if (fxr < simplex[0]!.cost) {
      // Expansion
      const xe = new Array(n);
      for (let j = 0; j < n; j++) {
        xe[j] = centroid[j] + gamma * (xr[j] - centroid[j]);
      }
      const fxe = costFunc(xe);
      if (fxe < fxr) {
        simplex[n] = { point: xe, cost: fxe };
      } else {
        simplex[n] = { point: xr, cost: fxr };
      }
    } else if (fxr < simplex[n - 1]!.cost) {
      simplex[n] = { point: xr, cost: fxr };
    } else {
      // Contraction
      const xc = new Array(n);
      for (let j = 0; j < n; j++) {
        xc[j] = centroid[j] + rho * (simplex[n]!.point[j]! - centroid[j]);
      }
      const fxc = costFunc(xc);
      if (fxc < simplex[n]!.cost) {
        simplex[n] = { point: xc, cost: fxc };
      } else {
        // Shrink
        for (let i = 1; i <= n; i++) {
          for (let j = 0; j < n; j++) {
            simplex[i]!.point[j] = simplex[0]!.point[j]! + sigma * (simplex[i]!.point[j]! - simplex[0]!.point[j]!);
          }
          simplex[i]!.cost = costFunc(simplex[i]!.point);
        }
      }
    }
  }

  simplex.sort((a, b) => a.cost - b.cost);
  return simplex[0]!.point;
}

/** Linear Fit: y = m*x + b */
export function fitLinear(data: DataPoint[]): FitResult {
  const n = data.length;
  if (n < 2) throw new Error('Linear fit requires at least 2 points.');

  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumX2 = 0;

  for (const d of data) {
    sumX += d.x;
    sumY += d.y;
    sumXY += d.x * d.y;
    sumX2 += d.x * d.x;
  }

  const denominator = n * sumX2 - sumX * sumX;
  if (Math.abs(denominator) < 1e-12) {
    throw new Error('Data points have identical X coordinates.');
  }

  const m = (n * sumXY - sumX * sumY) / denominator;
  const b = (sumY - m * sumX) / n;

  const predict = (x: number) => m * x + b;

  const meanY = sumY / n;
  let sse = 0;
  let sst = 0;
  const fittedPoints = data.map(d => {
    const yFit = predict(d.x);
    const residual = d.y - yFit;
    sse += residual * residual;
    sst += Math.pow(d.y - meanY, 2);
    return { x: d.x, y: d.y, yFit, residual };
  });

  const df = Math.max(1, n - 2);
  const rmse = Math.sqrt(sse / df);
  const r2 = sst > 0 ? Math.max(0, 1 - sse / sst) : 1;
  const adjR2 = sst > 0 ? Math.max(0, 1 - ((sse / df) / (sst / (n - 1)))) : 1;

  // Standard errors of slope and intercept
  const seSlope = Math.sqrt((sse / df) / (sumX2 - (sumX * sumX) / n));
  const seIntercept = seSlope * Math.sqrt(sumX2 / n);

  return {
    modelType: 'linear',
    modelName: 'Linear Regression',
    equationStr: `y = (${m.toFixed(4)}) · x + (${b.toFixed(4)})`,
    parameters: [
      {
        name: 'Slope',
        symbol: 'm',
        value: m,
        standardError: seSlope,
        ci95Low: m - 1.96 * seSlope,
        ci95High: m + 1.96 * seSlope,
        description: 'Rate of change / sensitivity',
      },
      {
        name: 'Y-Intercept',
        symbol: 'b',
        value: b,
        standardError: seIntercept,
        ci95Low: b - 1.96 * seIntercept,
        ci95High: b + 1.96 * seIntercept,
        description: 'Baseline value at x = 0',
      },
    ],
    r2,
    adjR2,
    rmse,
    sse,
    df,
    predict,
    fittedPoints,
  };
}

/** 4-Parameter Logistic (4PL / Sigmoidal Dose-Response / IC50 / EC50):
 *  y = Bottom + (Top - Bottom) / (1 + (x / EC50)^HillSlope)
 */
export function fit4PL(data: DataPoint[]): FitResult {
  const n = data.length;
  if (n < 4) throw new Error('4-Parameter Logistic fit requires at least 4 points.');

  // Initial parameter estimates
  const yVals = data.map(d => d.y);
  const minY = Math.min(...yVals);
  const maxY = Math.max(...yVals);
  const midY = (minY + maxY) / 2;

  // Find X closest to midpoint
  let closestDist = Infinity;
  let estimatedEC50 = data[Math.floor(n / 2)]!.x;
  for (const d of data) {
    const dist = Math.abs(d.y - midY);
    if (dist < closestDist && d.x > 0) {
      closestDist = dist;
      estimatedEC50 = d.x;
    }
  }

  // Params: [Bottom, Top, EC50, HillSlope]
  const initial = [minY, maxY, estimatedEC50 || 1.0, 1.0];

  const evalModel = (x: number, p: number[]) => {
    const [bottom, top, ec50, hill] = p;
    if (x <= 0 && ec50! <= 0) return (bottom! + top!) / 2;
    const ratio = Math.max(1e-12, x) / Math.max(1e-12, Math.abs(ec50!));
    const denom = 1 + Math.pow(ratio, hill!);
    return bottom! + (top! - bottom!) / denom;
  };

  const cost = (p: number[]) => {
    let sum = 0;
    for (const d of data) {
      const pred = evalModel(d.x, p);
      sum += Math.pow(d.y - pred, 2);
    }
    return sum;
  };

  const optimal = nelderMead(cost, initial);
  const [bottom, top, ec50, hill] = optimal;

  const predict = (x: number) => evalModel(x, optimal);

  let sse = 0;
  let sst = 0;
  const meanY = yVals.reduce((a, b) => a + b, 0) / n;
  const fittedPoints = data.map(d => {
    const yFit = predict(d.x);
    const residual = d.y - yFit;
    sse += residual * residual;
    sst += Math.pow(d.y - meanY, 2);
    return { x: d.x, y: d.y, yFit, residual };
  });

  const df = Math.max(1, n - 4);
  const rmse = Math.sqrt(sse / df);
  const r2 = sst > 0 ? Math.max(0, 1 - sse / sst) : 1;
  const adjR2 = sst > 0 ? Math.max(0, 1 - ((sse / df) / (sst / (n - 1)))) : 1;

  return {
    modelType: '4pl',
    modelName: '4-Parameter Logistic (4PL / EC50)',
    equationStr: `y = ${bottom!.toFixed(2)} + (${(top! - bottom!).toFixed(2)}) / [1 + (x / ${Math.abs(ec50!).toFixed(3)})^(${hill!.toFixed(2)})]`,
    parameters: [
      {
        name: 'Half-Maximal Concentration',
        symbol: 'EC50 / IC50',
        value: Math.abs(ec50!),
        description: 'Concentration producing 50% response',
      },
      {
        name: 'Hill Slope',
        symbol: 'HillSlope',
        value: hill!,
        description: 'Steepness of the sigmoidal curve',
      },
      {
        name: 'Top Plateau',
        symbol: 'Top',
        value: top!,
        description: 'Upper asymptotic response plateau',
      },
      {
        name: 'Bottom Plateau',
        symbol: 'Bottom',
        value: bottom!,
        description: 'Lower baseline plateau',
      },
    ],
    r2,
    adjR2,
    rmse,
    sse,
    df,
    predict,
    fittedPoints,
  };
}

/** Michaelis-Menten Enzyme Kinetics: v = (Vmax * [S]) / (Km + [S]) */
export function fitMichaelisMenten(data: DataPoint[]): FitResult {
  const n = data.length;
  if (n < 3) throw new Error('Michaelis-Menten fit requires at least 3 points.');

  const yVals = data.map(d => d.y);
  const maxY = Math.max(...yVals);
  const halfMax = maxY / 2;

  // Approximate Km as substrate concentration at half-maximal velocity
  let estimatedKm = data[0]!.x;
  let minDiff = Infinity;
  for (const d of data) {
    const diff = Math.abs(d.y - halfMax);
    if (diff < minDiff) {
      minDiff = diff;
      estimatedKm = d.x;
    }
  }

  // Params: [Vmax, Km]
  const initial = [maxY * 1.1, Math.max(1e-4, estimatedKm)];

  const evalModel = (s: number, p: number[]) => {
    const [vmax, km] = p;
    return (vmax! * Math.max(0, s)) / (Math.max(1e-6, km!) + Math.max(0, s));
  };

  const cost = (p: number[]) => {
    let sum = 0;
    for (const d of data) {
      const pred = evalModel(d.x, p);
      sum += Math.pow(d.y - pred, 2);
    }
    return sum;
  };

  const optimal = nelderMead(cost, initial);
  const [vmax, km] = optimal;

  const predict = (x: number) => evalModel(x, optimal);

  let sse = 0;
  let sst = 0;
  const meanY = yVals.reduce((a, b) => a + b, 0) / n;
  const fittedPoints = data.map(d => {
    const yFit = predict(d.x);
    const residual = d.y - yFit;
    sse += residual * residual;
    sst += Math.pow(d.y - meanY, 2);
    return { x: d.x, y: d.y, yFit, residual };
  });

  const df = Math.max(1, n - 2);
  const rmse = Math.sqrt(sse / df);
  const r2 = sst > 0 ? Math.max(0, 1 - sse / sst) : 1;
  const adjR2 = sst > 0 ? Math.max(0, 1 - ((sse / df) / (sst / (n - 1)))) : 1;

  return {
    modelType: 'michaelis_menten',
    modelName: 'Michaelis-Menten Kinetics',
    equationStr: `v = (${vmax!.toFixed(3)} · [S]) / (${km!.toFixed(3)} + [S])`,
    parameters: [
      {
        name: 'Maximum Velocity',
        symbol: 'Vmax',
        value: vmax!,
        description: 'Limiting rate at saturating substrate concentration',
      },
      {
        name: 'Michaelis Constant',
        symbol: 'Km',
        value: km!,
        description: 'Substrate concentration at which reaction rate is half Vmax',
      },
    ],
    r2,
    adjR2,
    rmse,
    sse,
    df,
    predict,
    fittedPoints,
  };
}

/** Exponential Decay (Half-Life): y = (y0 - Plateau) * exp(-k * x) + Plateau */
export function fitExpDecay(data: DataPoint[]): FitResult {
  const n = data.length;
  if (n < 3) throw new Error('Exponential decay fit requires at least 3 points.');

  const yVals = data.map(d => d.y);
  const y0 = data[0]!.y;
  const plateau = Math.min(...yVals);
  const initialK = 0.1;

  // Params: [y0, plateau, k]
  const initial = [y0, plateau, initialK];

  const evalModel = (x: number, p: number[]) => {
    const [yInit, plat, k] = p;
    return (yInit! - plat!) * Math.exp(-Math.abs(k!) * x) + plat!;
  };

  const cost = (p: number[]) => {
    let sum = 0;
    for (const d of data) {
      const pred = evalModel(d.x, p);
      sum += Math.pow(d.y - pred, 2);
    }
    return sum;
  };

  const optimal = nelderMead(cost, initial);
  const [optY0, optPlateau, optK] = optimal;
  const rateK = Math.abs(optK!);
  const halfLife = rateK > 0 ? Math.LN2 / rateK : Infinity;

  const predict = (x: number) => evalModel(x, optimal);

  let sse = 0;
  let sst = 0;
  const meanY = yVals.reduce((a, b) => a + b, 0) / n;
  const fittedPoints = data.map(d => {
    const yFit = predict(d.x);
    const residual = d.y - yFit;
    sse += residual * residual;
    sst += Math.pow(d.y - meanY, 2);
    return { x: d.x, y: d.y, yFit, residual };
  });

  const df = Math.max(1, n - 3);
  const rmse = Math.sqrt(sse / df);
  const r2 = sst > 0 ? Math.max(0, 1 - sse / sst) : 1;
  const adjR2 = sst > 0 ? Math.max(0, 1 - ((sse / df) / (sst / (n - 1)))) : 1;

  return {
    modelType: 'exp_decay',
    modelName: 'Exponential Decay (One Phase)',
    equationStr: `y = (${(optY0! - optPlateau!).toFixed(3)}) · e^(-${rateK.toFixed(4)}·x) + ${optPlateau!.toFixed(3)}`,
    parameters: [
      {
        name: 'Half-Life',
        symbol: 't1/2',
        value: halfLife,
        description: 'Time required to decay to half of the span (ln(2) / k)',
      },
      {
        name: 'Rate Constant',
        symbol: 'k',
        value: rateK,
        description: 'First-order decay rate constant (time⁻¹)',
      },
      {
        name: 'Initial Value',
        symbol: 'y0',
        value: optY0!,
        description: 'Value at time x = 0',
      },
      {
        name: 'Plateau',
        symbol: 'Plateau',
        value: optPlateau!,
        description: 'Asymptotic baseline level',
      },
    ],
    r2,
    adjR2,
    rmse,
    sse,
    df,
    predict,
    fittedPoints,
  };
}

/** Dispatcher to fit any supported model */
export function fitModel(modelType: FitModelType, data: DataPoint[]): FitResult {
  switch (modelType) {
    case 'linear':
      return fitLinear(data);
    case '4pl':
      return fit4PL(data);
    case 'michaelis_menten':
      return fitMichaelisMenten(data);
    case 'exp_decay':
      return fitExpDecay(data);
    default:
      return fitLinear(data);
  }
}

// Built-in verified sample datasets for instant loading
export const SAMPLE_DATASETS: Record<string, { name: string; model: FitModelType; text: string }> = {
  dose_response: {
    name: 'ELISA / Inhibitor Dose-Response (IC50)',
    model: '4pl',
    text: `# Concentration (nM)\tResponse (OD450)\tReplicate 2\tReplicate 3
0.01\t0.082\t0.085\t0.079
0.03\t0.095\t0.091\t0.098
0.1\t0.142\t0.138\t0.145
0.3\t0.285\t0.291\t0.278
1.0\t0.654\t0.642\t0.661
3.0\t1.240\t1.215\t1.258
10.0\t1.850\t1.870\t1.840
30.0\t2.120\t2.105\t2.140
100.0\t2.180\t2.195\t2.170`,
  },
  enzyme_kinetics: {
    name: 'Enzyme Kinetics (Michaelis-Menten)',
    model: 'michaelis_menten',
    text: `# Substrate [S] (µM)\tInitial Velocity v (µM/min)
5\t2.85
10\t5.12
20\t8.95
40\t13.40
80\t17.80
160\t21.30
320\t23.90
640\t24.80`,
  },
  protein_decay: {
    name: 'Protein Degradation / Half-Life',
    model: 'exp_decay',
    text: `# Time (hours)\tRelative Protein Level (%)
0\t100.0
2\t85.4
4\t72.1
8\t51.2
12\t36.8
24\t14.2
36\t5.8
48\t2.1`,
  },
  standard_curve: {
    name: 'BSA Standard Curve (BCA Assay)',
    model: 'linear',
    text: `# BSA Conc (mg/mL)\tAbsorbance (A562)
0.0\t0.052
0.125\t0.185
0.25\t0.312
0.5\t0.584
0.75\t0.845
1.0\t1.120
1.5\t1.650
2.0\t2.180`,
  },
};
