/**
 * Scientific curve fitting engine: Linear, Linear through origin, 4PL, 5PL,
 * Michaelis-Menten, Two-Site Binding, Exponential Growth/Decay, and Gaussian regression.
 * Includes analytical & numerical Jacobian covariance matrix estimation for
 * parameter standard errors and predicted fitted value standard errors (SE(Fit)).
 */

export type FitModelType =
  | 'linear'
  | 'linear_origin'
  | '4pl'
  | '5pl'
  | 'michaelis_menten'
  | 'two_site_binding'
  | 'exp_decay'
  | 'exp_growth'
  | 'gaussian';

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

export interface FittedPoint {
  x: number;
  y: number;
  yFit: number;
  seFit?: number;
  residual: number;
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
  fittedPoints: FittedPoint[];
}

/** Parse CSV, TSV, or whitespace-delimited tabular data */
export function parseFittingData(text: string): DataPoint[] {
  const lines = text.trim().split(/\r?\n/);
  const points: DataPoint[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('//')) continue;

    const parts = trimmed.split(/[\t,]+/).map(s => s.trim()).filter(Boolean);
    if (parts.length < 2) continue;

    const x = parseFloat(parts[0]!);
    if (isNaN(x)) continue;

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
  maxIterations = 1800,
  tolerance = 1e-8,
): number[] {
  const n = initialParams.length;
  const alpha = 1.0;
  const gamma = 2.0;
  const rho = 0.5;
  const sigma = 0.5;

  const simplex: Array<{ p: number[]; cost: number }> = [];
  simplex.push({ p: [...initialParams], cost: costFunc(initialParams) });

  for (let i = 0; i < n; i++) {
    const point = [...initialParams];
    const step = Math.abs(point[i]!) > 1e-4 ? point[i]! * 0.15 : 0.1;
    point[i]! += step;
    simplex.push({ p: point, cost: costFunc(point) });
  }

  for (let iter = 0; iter < maxIterations; iter++) {
    simplex.sort((a, b) => a.cost - b.cost);

    const best = simplex[0]!;
    const worst = simplex[n]!;
    const secondWorst = simplex[n - 1]!;

    if (Math.abs(worst.cost - best.cost) < tolerance) {
      break;
    }

    const centroid = new Array<number>(n).fill(0);
    for (let i = 0; i < n; i++) {
      const pi = simplex[i]!.p;
      for (let j = 0; j < n; j++) {
        centroid[j] = (centroid[j] ?? 0) + pi[j]!;
      }
    }
    for (let j = 0; j < n; j++) {
      centroid[j] = (centroid[j] ?? 0) / n;
    }

    const reflected: number[] = [];
    for (let j = 0; j < n; j++) {
      reflected.push(centroid[j]! + alpha * (centroid[j]! - worst.p[j]!));
    }
    const rCost = costFunc(reflected);

    if (rCost < secondWorst.cost && rCost >= best.cost) {
      simplex[n] = { p: reflected, cost: rCost };
      continue;
    }

    if (rCost < best.cost) {
      const expanded: number[] = [];
      for (let j = 0; j < n; j++) {
        expanded.push(centroid[j]! + gamma * (reflected[j]! - centroid[j]!));
      }
      const eCost = costFunc(expanded);
      if (eCost < rCost) {
        simplex[n] = { p: expanded, cost: eCost };
      } else {
        simplex[n] = { p: reflected, cost: rCost };
      }
      continue;
    }

    const contracted: number[] = [];
    for (let j = 0; j < n; j++) {
      contracted.push(centroid[j]! + rho * (worst.p[j]! - centroid[j]!));
    }
    const cCost = costFunc(contracted);

    if (cCost < worst.cost) {
      simplex[n] = { p: contracted, cost: cCost };
      continue;
    }

    for (let i = 1; i <= n; i++) {
      for (let j = 0; j < n; j++) {
        simplex[i]!.p[j] = best.p[j]! + sigma * (simplex[i]!.p[j]! - best.p[j]!);
      }
      simplex[i]!.cost = costFunc(simplex[i]!.p);
    }
  }

  simplex.sort((a, b) => a.cost - b.cost);
  return simplex[0]!.p;
}

/** Invert a square matrix using Gauss-Jordan with diagonal ridge regularization */
function invertMatrix(matrix: number[][]): number[][] {
  const n = matrix.length;
  // Clone and add tiny ridge lambda for stability
  const A: number[][] = matrix.map((row, i) => {
    const r = [...row];
    r[i]! += 1e-9;
    return r;
  });

  const I: number[][] = Array.from({ length: n }, (_, i) => {
    const row = new Array<number>(n).fill(0);
    row[i] = 1;
    return row;
  });

  for (let i = 0; i < n; i++) {
    let maxRow = i;
    for (let k = i + 1; k < n; k++) {
      if (Math.abs(A[k]![i]!) > Math.abs(A[maxRow]![i]!)) {
        maxRow = k;
      }
    }

    const tempA = A[i]!; A[i] = A[maxRow]!; A[maxRow] = tempA;
    const tempI = I[i]!; I[i] = I[maxRow]!; I[maxRow] = tempI;

    const pivot = A[i]![i]!;
    if (Math.abs(pivot) < 1e-12) continue;

    const rowA = A[i]!;
    const rowI = I[i]!;
    for (let j = 0; j < n; j++) {
      rowA[j] = (rowA[j] ?? 0) / pivot;
      rowI[j] = (rowI[j] ?? 0) / pivot;
    }

    for (let k = 0; k < n; k++) {
      if (k === i) continue;
      const factor = A[k]![i]!;
      const rowAk = A[k]!;
      const rowIk = I[k]!;
      for (let j = 0; j < n; j++) {
        rowAk[j] = (rowAk[j] ?? 0) - factor * (rowA[j] ?? 0);
        rowIk[j] = (rowIk[j] ?? 0) - factor * (rowI[j] ?? 0);
      }
    }
  }

  return I;
}

/**
 * Numerically estimate parameter covariance matrix and standard errors
 * for parameters and fitted values via Jacobian propagation:
 * Cov = (s^2) * (J^T * J)^(-1)
 * SE(p_j) = sqrt(Cov_jj)
 * SE(yFit_i) = sqrt(j_i^T * Cov * j_i)
 */
export function estimateCovarianceAndSE(
  evalFunc: (x: number, p: number[]) => number,
  params: number[],
  data: DataPoint[],
  sse: number,
  df: number,
): {
  paramSE: number[];
  fittedSE: number[];
} {
  const k = params.length;
  const n = data.length;
  const s2 = sse / Math.max(1, df);

  // Compute Jacobian matrix (n x k)
  const J: number[][] = [];
  for (let i = 0; i < n; i++) {
    const x = data[i]!.x;
    const row: number[] = [];
    for (let j = 0; j < k; j++) {
      const step = Math.max(1e-5 * Math.abs(params[j]!), 1e-6);
      const pUp = [...params]; pUp[j]! += step;
      const pDown = [...params]; pDown[j]! -= step;
      const deriv = (evalFunc(x, pUp) - evalFunc(x, pDown)) / (2 * step);
      row.push(isNaN(deriv) ? 0 : deriv);
    }
    J.push(row);
  }

  // J^T * J (k x k)
  const JtJ: number[][] = Array.from({ length: k }, () => new Array<number>(k).fill(0));
  for (let r = 0; r < k; r++) {
    for (let c = 0; c < k; c++) {
      let sum = 0;
      for (let i = 0; i < n; i++) {
        sum += J[i]![r]! * J[i]![c]!;
      }
      JtJ[r]![c] = sum;
    }
  }

  const cov = invertMatrix(JtJ);
  for (let r = 0; r < k; r++) {
    for (let c = 0; c < k; c++) {
      cov[r]![c] = (cov[r]![c] || 0) * s2;
    }
  }

  // Parameter standard errors
  const paramSE: number[] = [];
  for (let j = 0; j < k; j++) {
    const diag = cov[j]![j]!;
    paramSE.push(diag > 0 && !isNaN(diag) ? Math.sqrt(diag) : 0);
  }

  // Fitted values standard errors: SE(y_hat_i) = sqrt(j_i^T * Cov * j_i)
  const fittedSE: number[] = [];
  for (let i = 0; i < n; i++) {
    const jVec = J[i]!;
    let varFit = 0;
    for (let r = 0; r < k; r++) {
      for (let c = 0; c < k; c++) {
        varFit += jVec[r]! * cov[r]![c]! * jVec[c]!;
      }
    }
    fittedSE.push(varFit > 0 && !isNaN(varFit) ? Math.sqrt(varFit) : Math.sqrt(s2));
  }

  return { paramSE, fittedSE };
}

// -------------------------------------------------------------
// Model Implementations
// -------------------------------------------------------------

/** 1. Standard Linear Regression: y = m * x + b */
export function fitLinear(data: DataPoint[]): FitResult {
  const n = data.length;
  if (n < 2) throw new Error('Linear regression requires at least 2 points.');

  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
  for (const d of data) {
    sumX += d.x;
    sumY += d.y;
    sumXY += d.x * d.y;
    sumX2 += d.x * d.x;
  }

  const denom = n * sumX2 - sumX * sumX;
  if (Math.abs(denom) < 1e-12) throw new Error('All X values are identical; cannot fit a line.');

  const m = (n * sumXY - sumX * sumY) / denom;
  const b = (sumY - m * sumX) / n;
  const predict = (x: number) => m * x + b;

  const meanY = sumY / n;
  let sse = 0, sst = 0;
  for (const d of data) {
    const yFit = predict(d.x);
    sse += Math.pow(d.y - yFit, 2);
    sst += Math.pow(d.y - meanY, 2);
  }

  const df = Math.max(1, n - 2);
  const rmse = Math.sqrt(sse / df);
  const r2 = sst > 0 ? Math.max(0, 1 - sse / sst) : 1;
  const adjR2 = sst > 0 ? Math.max(0, 1 - ((sse / df) / (sst / (n - 1)))) : 1;

  const seSlope = Math.sqrt((sse / df) / (sumX2 - (sumX * sumX) / n));
  const seIntercept = seSlope * Math.sqrt(sumX2 / n);

  const fittedPoints: FittedPoint[] = data.map(d => {
    const yFit = predict(d.x);
    const residual = d.y - yFit;
    const seFit = Math.sqrt((sse / df) * (1 / n + Math.pow(d.x - sumX / n, 2) / (sumX2 - (sumX * sumX) / n)));
    return { x: d.x, y: d.y, yFit, seFit, residual };
  });

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

/** 2. Linear Through Origin: y = m * x (Beer-Lambert, zero-intercept) */
export function fitLinearOrigin(data: DataPoint[]): FitResult {
  const n = data.length;
  if (n < 2) throw new Error('Fit requires at least 2 points.');

  let sumXY = 0, sumX2 = 0, sumY = 0;
  for (const d of data) {
    sumXY += d.x * d.y;
    sumX2 += d.x * d.x;
    sumY += d.y;
  }

  if (sumX2 === 0) throw new Error('Cannot fit line with zero X variance.');
  const m = sumXY / sumX2;
  const predict = (x: number) => m * x;

  const meanY = sumY / n;
  let sse = 0, sst = 0;
  for (const d of data) {
    const yFit = predict(d.x);
    sse += Math.pow(d.y - yFit, 2);
    sst += Math.pow(d.y - meanY, 2);
  }

  const df = Math.max(1, n - 1);
  const rmse = Math.sqrt(sse / df);
  const r2 = sst > 0 ? Math.max(0, 1 - sse / sst) : 1;
  const seSlope = Math.sqrt((sse / df) / sumX2);

  const fittedPoints: FittedPoint[] = data.map(d => {
    const yFit = predict(d.x);
    const residual = d.y - yFit;
    const seFit = Math.abs(d.x) * seSlope;
    return { x: d.x, y: d.y, yFit, seFit, residual };
  });

  return {
    modelType: 'linear_origin',
    modelName: 'Linear Through Origin (y = m·x)',
    equationStr: `y = (${m.toFixed(4)}) · x`,
    parameters: [
      {
        name: 'Slope',
        symbol: 'm',
        value: m,
        standardError: seSlope,
        ci95Low: m - 1.96 * seSlope,
        ci95High: m + 1.96 * seSlope,
        description: 'Slope forced through (0, 0)',
      },
    ],
    r2,
    adjR2: r2,
    rmse,
    sse,
    df,
    predict,
    fittedPoints,
  };
}

/** 3. 4-Parameter Logistic (4PL / EC50 / IC50) */
export function fit4PL(data: DataPoint[]): FitResult {
  const n = data.length;
  if (n < 5) throw new Error('4PL sigmoidal fit requires at least 5 points.');

  const yVals = data.map(d => d.y);
  const minY = Math.min(...yVals);
  const maxY = Math.max(...yVals);
  const medianX = data[Math.floor(n / 2)]!.x;

  const evalModel = (x: number, p: number[]) => {
    const [bottom, top, ec50, hill] = p;
    if (x <= 0) return hill! > 0 ? bottom! : top!;
    const ratio = Math.pow(x / Math.max(1e-9, Math.abs(ec50!)), hill!);
    return bottom! + (top! - bottom!) / (1 + ratio);
  };

  const initial = [minY, maxY, medianX > 0 ? medianX : 1.0, 1.0];
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

  let sse = 0, sst = 0;
  const meanY = yVals.reduce((a, b) => a + b, 0) / n;
  for (const d of data) {
    const yFit = predict(d.x);
    sse += Math.pow(d.y - yFit, 2);
    sst += Math.pow(d.y - meanY, 2);
  }

  const df = Math.max(1, n - 4);
  const rmse = Math.sqrt(sse / df);
  const r2 = sst > 0 ? Math.max(0, 1 - sse / sst) : 1;
  const adjR2 = sst > 0 ? Math.max(0, 1 - ((sse / df) / (sst / (n - 1)))) : 1;

  const { paramSE, fittedSE } = estimateCovarianceAndSE(evalModel, optimal, data, sse, df);

  const fittedPoints: FittedPoint[] = data.map((d, i) => {
    const yFit = predict(d.x);
    return { x: d.x, y: d.y, yFit, seFit: fittedSE[i], residual: d.y - yFit };
  });

  return {
    modelType: '4pl',
    modelName: '4-Parameter Logistic (4PL / EC50)',
    equationStr: `y = ${bottom!.toFixed(2)} + (${(top! - bottom!).toFixed(2)}) / [1 + (x / ${Math.abs(ec50!).toFixed(3)})^(${hill!.toFixed(2)})]`,
    parameters: [
      {
        name: 'Half-Maximal Concentration',
        symbol: 'EC50 / IC50',
        value: Math.abs(ec50!),
        standardError: paramSE[2],
        ci95Low: Math.abs(ec50!) - 1.96 * (paramSE[2] || 0),
        ci95High: Math.abs(ec50!) + 1.96 * (paramSE[2] || 0),
        description: 'Concentration producing 50% response',
      },
      {
        name: 'Hill Slope',
        symbol: 'HillSlope',
        value: hill!,
        standardError: paramSE[3],
        ci95Low: hill! - 1.96 * (paramSE[3] || 0),
        ci95High: hill! + 1.96 * (paramSE[3] || 0),
        description: 'Steepness of the sigmoidal curve',
      },
      {
        name: 'Top Plateau',
        symbol: 'Top',
        value: top!,
        standardError: paramSE[1],
        ci95Low: top! - 1.96 * (paramSE[1] || 0),
        ci95High: top! + 1.96 * (paramSE[1] || 0),
        description: 'Upper asymptotic response plateau',
      },
      {
        name: 'Bottom Plateau',
        symbol: 'Bottom',
        value: bottom!,
        standardError: paramSE[0],
        ci95Low: bottom! - 1.96 * (paramSE[0] || 0),
        ci95High: bottom! + 1.96 * (paramSE[0] || 0),
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

/** 4. 5-Parameter Logistic (5PL / Asymmetric Sigmoid) */
export function fit5PL(data: DataPoint[]): FitResult {
  const n = data.length;
  if (n < 6) throw new Error('5PL asymmetric fit requires at least 6 points.');

  const yVals = data.map(d => d.y);
  const minY = Math.min(...yVals);
  const maxY = Math.max(...yVals);
  const medianX = data[Math.floor(n / 2)]!.x;

  const evalModel = (x: number, p: number[]) => {
    const [bottom, top, ec50, hill, asymmetry] = p;
    if (x <= 0) return bottom!;
    const ratio = Math.pow(x / Math.max(1e-9, Math.abs(ec50!)), hill!);
    return bottom! + (top! - bottom!) / Math.pow(1 + ratio, Math.max(0.1, asymmetry!));
  };

  const initial = [minY, maxY, medianX > 0 ? medianX : 1.0, 1.0, 1.0];
  const cost = (p: number[]) => {
    let sum = 0;
    for (const d of data) {
      sum += Math.pow(d.y - evalModel(d.x, p), 2);
    }
    return sum;
  };

  const optimal = nelderMead(cost, initial);
  const [bottom, top, ec50, hill, asymmetry] = optimal;
  const predict = (x: number) => evalModel(x, optimal);

  let sse = 0, sst = 0;
  const meanY = yVals.reduce((a, b) => a + b, 0) / n;
  for (const d of data) {
    const yFit = predict(d.x);
    sse += Math.pow(d.y - yFit, 2);
    sst += Math.pow(d.y - meanY, 2);
  }

  const df = Math.max(1, n - 5);
  const rmse = Math.sqrt(sse / df);
  const r2 = sst > 0 ? Math.max(0, 1 - sse / sst) : 1;
  const adjR2 = sst > 0 ? Math.max(0, 1 - ((sse / df) / (sst / (n - 1)))) : 1;

  const { paramSE, fittedSE } = estimateCovarianceAndSE(evalModel, optimal, data, sse, df);

  const fittedPoints: FittedPoint[] = data.map((d, i) => {
    const yFit = predict(d.x);
    return { x: d.x, y: d.y, yFit, seFit: fittedSE[i], residual: d.y - yFit };
  });

  return {
    modelType: '5pl',
    modelName: '5-Parameter Logistic (5PL / Asymmetric)',
    equationStr: `y = ${bottom!.toFixed(2)} + (${(top! - bottom!).toFixed(2)}) / [1 + (x / ${Math.abs(ec50!).toFixed(3)})^(${hill!.toFixed(2)})]^(${asymmetry!.toFixed(2)})`,
    parameters: [
      { name: 'EC50 / Inflection', symbol: 'C', value: Math.abs(ec50!), standardError: paramSE[2], description: 'Transition midpoint parameter' },
      { name: 'Hill Slope', symbol: 'B', value: hill!, standardError: paramSE[3], description: 'Slope factor' },
      { name: 'Top Plateau', symbol: 'A', value: top!, standardError: paramSE[1], description: 'Upper asymptote' },
      { name: 'Bottom Plateau', symbol: 'D', value: bottom!, standardError: paramSE[0], description: 'Lower asymptote' },
      { name: 'Asymmetry Factor', symbol: 'S', value: asymmetry!, standardError: paramSE[4], description: 'Curvature asymmetry exponent' },
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

/** 5. Michaelis-Menten Enzyme Kinetics: v = (Vmax * [S]) / (Km + [S]) */
export function fitMichaelisMenten(data: DataPoint[]): FitResult {
  const n = data.length;
  if (n < 3) throw new Error('Michaelis-Menten fit requires at least 3 points.');

  const yVals = data.map(d => d.y);
  const maxY = Math.max(...yVals);

  let estimatedKm = data[0]!.x;
  let minDiff = Infinity;
  for (const d of data) {
    const diff = Math.abs(d.y - maxY / 2);
    if (diff < minDiff) {
      minDiff = diff;
      estimatedKm = d.x;
    }
  }

  const evalModel = (x: number, p: number[]) => {
    const [vmax, km] = p;
    return (vmax! * x) / (Math.max(1e-6, km!) + x);
  };

  const initial = [maxY * 1.15, Math.max(0.1, estimatedKm)];
  const cost = (p: number[]) => {
    let sum = 0;
    for (const d of data) {
      sum += Math.pow(d.y - evalModel(d.x, p), 2);
    }
    return sum;
  };

  const optimal = nelderMead(cost, initial);
  const [vmax, km] = optimal;
  const predict = (x: number) => evalModel(x, optimal);

  let sse = 0, sst = 0;
  const meanY = yVals.reduce((a, b) => a + b, 0) / n;
  for (const d of data) {
    const yFit = predict(d.x);
    sse += Math.pow(d.y - yFit, 2);
    sst += Math.pow(d.y - meanY, 2);
  }

  const df = Math.max(1, n - 2);
  const rmse = Math.sqrt(sse / df);
  const r2 = sst > 0 ? Math.max(0, 1 - sse / sst) : 1;
  const adjR2 = sst > 0 ? Math.max(0, 1 - ((sse / df) / (sst / (n - 1)))) : 1;

  const { paramSE, fittedSE } = estimateCovarianceAndSE(evalModel, optimal, data, sse, df);

  const fittedPoints: FittedPoint[] = data.map((d, i) => {
    const yFit = predict(d.x);
    return { x: d.x, y: d.y, yFit, seFit: fittedSE[i], residual: d.y - yFit };
  });

  return {
    modelType: 'michaelis_menten',
    modelName: 'Michaelis-Menten Kinetics',
    equationStr: `v = (${vmax!.toFixed(3)} · [S]) / (${km!.toFixed(3)} + [S])`,
    parameters: [
      {
        name: 'Maximal Velocity',
        symbol: 'Vmax',
        value: vmax!,
        standardError: paramSE[0],
        ci95Low: vmax! - 1.96 * (paramSE[0] || 0),
        ci95High: vmax! + 1.96 * (paramSE[0] || 0),
        description: 'Maximum velocity at saturating substrate',
      },
      {
        name: 'Michaelis Constant',
        symbol: 'Km',
        value: km!,
        standardError: paramSE[1],
        ci95Low: km! - 1.96 * (paramSE[1] || 0),
        ci95High: km! + 1.96 * (paramSE[1] || 0),
        description: 'Substrate concentration at half-maximal velocity',
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

/** 6. Two-Site Specific Binding: y = (Bmax1 * x)/(Kd1 + x) + (Bmax2 * x)/(Kd2 + x) */
export function fitTwoSiteBinding(data: DataPoint[]): FitResult {
  const n = data.length;
  if (n < 6) throw new Error('Two-site binding fit requires at least 6 points.');

  const yVals = data.map(d => d.y);
  const maxY = Math.max(...yVals);
  const xVals = data.map(d => d.x);
  const minX = Math.min(...xVals.filter(x => x > 0));
  const maxX = Math.max(...xVals);

  const evalModel = (x: number, p: number[]) => {
    const [bmax1, kd1, bmax2, kd2] = p;
    return (bmax1! * x) / (Math.max(1e-6, kd1!) + x) + (bmax2! * x) / (Math.max(1e-6, kd2!) + x);
  };

  const initial = [maxY * 0.5, minX * 5, maxY * 0.5, maxX * 0.3];
  const cost = (p: number[]) => {
    let sum = 0;
    for (const d of data) {
      sum += Math.pow(d.y - evalModel(d.x, p), 2);
    }
    return sum;
  };

  const optimal = nelderMead(cost, initial);
  const [bmax1, kd1, bmax2, kd2] = optimal;
  const predict = (x: number) => evalModel(x, optimal);

  let sse = 0, sst = 0;
  const meanY = yVals.reduce((a, b) => a + b, 0) / n;
  for (const d of data) {
    const yFit = predict(d.x);
    sse += Math.pow(d.y - yFit, 2);
    sst += Math.pow(d.y - meanY, 2);
  }

  const df = Math.max(1, n - 4);
  const rmse = Math.sqrt(sse / df);
  const r2 = sst > 0 ? Math.max(0, 1 - sse / sst) : 1;
  const adjR2 = sst > 0 ? Math.max(0, 1 - ((sse / df) / (sst / (n - 1)))) : 1;

  const { paramSE, fittedSE } = estimateCovarianceAndSE(evalModel, optimal, data, sse, df);

  const fittedPoints: FittedPoint[] = data.map((d, i) => {
    const yFit = predict(d.x);
    return { x: d.x, y: d.y, yFit, seFit: fittedSE[i], residual: d.y - yFit };
  });

  return {
    modelType: 'two_site_binding',
    modelName: 'Two-Site Specific Binding',
    equationStr: `y = (${bmax1!.toFixed(2)}·x)/(${kd1!.toFixed(2)}+x) + (${bmax2!.toFixed(2)}·x)/(${kd2!.toFixed(2)}+x)`,
    parameters: [
      { name: 'Bmax (High Affinity)', symbol: 'Bmax1', value: bmax1!, standardError: paramSE[0], description: 'Capacity of site 1' },
      { name: 'Kd (High Affinity)', symbol: 'Kd1', value: kd1!, standardError: paramSE[1], description: 'Dissociation constant site 1' },
      { name: 'Bmax (Low Affinity)', symbol: 'Bmax2', value: bmax2!, standardError: paramSE[2], description: 'Capacity of site 2' },
      { name: 'Kd (Low Affinity)', symbol: 'Kd2', value: kd2!, standardError: paramSE[3], description: 'Dissociation constant site 2' },
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

/** 7. Exponential Decay: y = (y0 - Plateau) * exp(-k * x) + Plateau */
export function fitExpDecay(data: DataPoint[]): FitResult {
  const n = data.length;
  if (n < 4) throw new Error('Exponential decay fit requires at least 4 points.');

  const yVals = data.map(d => d.y);
  const initialY = yVals[0]!;
  const plateau = yVals[n - 1]!;
  const estK = 0.1;

  const evalModel = (x: number, p: number[]) => {
    const [y0, plat, k] = p;
    return (y0! - plat!) * Math.exp(-Math.abs(k!) * x) + plat!;
  };

  const initial = [initialY, plateau, estK];
  const cost = (p: number[]) => {
    let sum = 0;
    for (const d of data) {
      sum += Math.pow(d.y - evalModel(d.x, p), 2);
    }
    return sum;
  };

  const optimal = nelderMead(cost, initial);
  const [optY0, optPlateau, optK] = optimal;
  const rateK = Math.abs(optK!);
  const halfLife = Math.LN2 / Math.max(1e-9, rateK);
  const predict = (x: number) => evalModel(x, [optY0!, optPlateau!, rateK]);

  let sse = 0, sst = 0;
  const meanY = yVals.reduce((a, b) => a + b, 0) / n;
  for (const d of data) {
    const yFit = predict(d.x);
    sse += Math.pow(d.y - yFit, 2);
    sst += Math.pow(d.y - meanY, 2);
  }

  const df = Math.max(1, n - 3);
  const rmse = Math.sqrt(sse / df);
  const r2 = sst > 0 ? Math.max(0, 1 - sse / sst) : 1;
  const adjR2 = sst > 0 ? Math.max(0, 1 - ((sse / df) / (sst / (n - 1)))) : 1;

  const { paramSE, fittedSE } = estimateCovarianceAndSE(evalModel, [optY0!, optPlateau!, rateK], data, sse, df);

  const fittedPoints: FittedPoint[] = data.map((d, i) => {
    const yFit = predict(d.x);
    return { x: d.x, y: d.y, yFit, seFit: fittedSE[i], residual: d.y - yFit };
  });

  return {
    modelType: 'exp_decay',
    modelName: 'One-Phase Exponential Decay',
    equationStr: `y = (${(optY0! - optPlateau!).toFixed(2)}) · exp(-${rateK.toFixed(4)} · x) + ${optPlateau!.toFixed(2)}`,
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
        standardError: paramSE[2],
        ci95Low: rateK - 1.96 * (paramSE[2] || 0),
        ci95High: rateK + 1.96 * (paramSE[2] || 0),
        description: 'First-order decay rate constant (time⁻¹)',
      },
      {
        name: 'Initial Value',
        symbol: 'y0',
        value: optY0!,
        standardError: paramSE[0],
        description: 'Value at time x = 0',
      },
      {
        name: 'Plateau',
        symbol: 'Plateau',
        value: optPlateau!,
        standardError: paramSE[1],
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

/** 8. Exponential Growth: y = y0 * exp(k * x) */
export function fitExpGrowth(data: DataPoint[]): FitResult {
  const n = data.length;
  if (n < 3) throw new Error('Exponential growth fit requires at least 3 points.');

  const yVals = data.map(d => d.y);
  const initialY = yVals[0]!;

  const evalModel = (x: number, p: number[]) => {
    const [y0, k] = p;
    return y0! * Math.exp(k! * x);
  };

  const initial = [initialY > 0 ? initialY : 1.0, 0.1];
  const cost = (p: number[]) => {
    let sum = 0;
    for (const d of data) {
      sum += Math.pow(d.y - evalModel(d.x, p), 2);
    }
    return sum;
  };

  const optimal = nelderMead(cost, initial);
  const [y0, k] = optimal;
  const doublingTime = Math.LN2 / Math.max(1e-9, k!);
  const predict = (x: number) => evalModel(x, optimal);

  let sse = 0, sst = 0;
  const meanY = yVals.reduce((a, b) => a + b, 0) / n;
  for (const d of data) {
    const yFit = predict(d.x);
    sse += Math.pow(d.y - yFit, 2);
    sst += Math.pow(d.y - meanY, 2);
  }

  const df = Math.max(1, n - 2);
  const rmse = Math.sqrt(sse / df);
  const r2 = sst > 0 ? Math.max(0, 1 - sse / sst) : 1;
  const adjR2 = sst > 0 ? Math.max(0, 1 - ((sse / df) / (sst / (n - 1)))) : 1;

  const { paramSE, fittedSE } = estimateCovarianceAndSE(evalModel, optimal, data, sse, df);

  const fittedPoints: FittedPoint[] = data.map((d, i) => {
    const yFit = predict(d.x);
    return { x: d.x, y: d.y, yFit, seFit: fittedSE[i], residual: d.y - yFit };
  });

  return {
    modelType: 'exp_growth',
    modelName: 'Exponential Growth (Cell Doubling)',
    equationStr: `y = (${y0!.toFixed(3)}) · exp(${k!.toFixed(4)} · x)`,
    parameters: [
      { name: 'Doubling Time', symbol: 'Td', value: doublingTime, description: 'Time required to double population (ln(2) / k)' },
      { name: 'Growth Rate', symbol: 'k (µ)', value: k!, standardError: paramSE[1], description: 'Specific growth rate' },
      { name: 'Initial Size', symbol: 'y0', value: y0!, standardError: paramSE[0], description: 'Population / signal at x = 0' },
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

/** 9. Gaussian Peak / Bell-Shaped Curve: y = Base + Amp * exp(-0.5 * ((x - Center)/Width)^2) */
export function fitGaussian(data: DataPoint[]): FitResult {
  const n = data.length;
  if (n < 4) throw new Error('Gaussian fit requires at least 4 points.');

  const yVals = data.map(d => d.y);
  const maxY = Math.max(...yVals);
  const minY = Math.min(...yVals);
  const maxIdx = yVals.indexOf(maxY);
  const centerX = data[maxIdx]!.x;

  const evalModel = (x: number, p: number[]) => {
    const [base, amp, center, width] = p;
    const z = (x - center!) / Math.max(1e-6, Math.abs(width!));
    return base! + amp! * Math.exp(-0.5 * z * z);
  };

  const initial = [minY, maxY - minY, centerX, 1.0];
  const cost = (p: number[]) => {
    let sum = 0;
    for (const d of data) {
      sum += Math.pow(d.y - evalModel(d.x, p), 2);
    }
    return sum;
  };

  const optimal = nelderMead(cost, initial);
  const [base, amp, center, width] = optimal;
  const fwhm = 2.35482 * Math.abs(width!);
  const predict = (x: number) => evalModel(x, optimal);

  let sse = 0, sst = 0;
  const meanY = yVals.reduce((a, b) => a + b, 0) / n;
  for (const d of data) {
    const yFit = predict(d.x);
    sse += Math.pow(d.y - yFit, 2);
    sst += Math.pow(d.y - meanY, 2);
  }

  const df = Math.max(1, n - 4);
  const rmse = Math.sqrt(sse / df);
  const r2 = sst > 0 ? Math.max(0, 1 - sse / sst) : 1;
  const adjR2 = sst > 0 ? Math.max(0, 1 - ((sse / df) / (sst / (n - 1)))) : 1;

  const { paramSE, fittedSE } = estimateCovarianceAndSE(evalModel, optimal, data, sse, df);

  const fittedPoints: FittedPoint[] = data.map((d, i) => {
    const yFit = predict(d.x);
    return { x: d.x, y: d.y, yFit, seFit: fittedSE[i], residual: d.y - yFit };
  });

  return {
    modelType: 'gaussian',
    modelName: 'Gaussian Peak (Chromatography / TSA)',
    equationStr: `y = ${base!.toFixed(2)} + ${amp!.toFixed(2)} · exp[-0.5 · ((x - ${center!.toFixed(3)}) / ${Math.abs(width!).toFixed(3)})²]`,
    parameters: [
      { name: 'Peak Center (Mean)', symbol: 'µ / Tm', value: center!, standardError: paramSE[2], description: 'Retention time / melting temp (center)' },
      { name: 'Peak Amplitude', symbol: 'Amp', value: amp!, standardError: paramSE[1], description: 'Height above baseline' },
      { name: 'Full Width at Half Max', symbol: 'FWHM', value: fwhm, description: 'Peak resolution / width parameter' },
      { name: 'Baseline Offset', symbol: 'Base', value: base!, standardError: paramSE[0], description: 'Baseline signal' },
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

/** Dispatcher to fit any supported laboratory model */
export function fitModel(modelType: FitModelType, data: DataPoint[]): FitResult {
  switch (modelType) {
    case 'linear':
      return fitLinear(data);
    case 'linear_origin':
      return fitLinearOrigin(data);
    case '4pl':
      return fit4PL(data);
    case '5pl':
      return fit5PL(data);
    case 'michaelis_menten':
      return fitMichaelisMenten(data);
    case 'two_site_binding':
      return fitTwoSiteBinding(data);
    case 'exp_decay':
      return fitExpDecay(data);
    case 'exp_growth':
      return fitExpGrowth(data);
    case 'gaussian':
      return fitGaussian(data);
    default:
      return fitLinear(data);
  }
}

// Built-in verified sample datasets for instant loading
export const SAMPLE_DATASETS: Record<string, { name: string; model: FitModelType; text: string }> = {
  dose_response: {
    name: 'ELISA / Inhibitor Dose-Response (4PL / IC50)',
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
  cell_growth: {
    name: 'Bacterial Cell Growth (Doubling Time)',
    model: 'exp_growth',
    text: `# Time (hours)\tCell Density (OD600)
0.0\t0.050
0.5\t0.074
1.0\t0.110
1.5\t0.162
2.0\t0.240
2.5\t0.355
3.0\t0.525
3.5\t0.780`,
  },
  two_site: {
    name: 'Two-Site Radioligand Binding',
    model: 'two_site_binding',
    text: `# Radioligand (nM)\tBound (cpm)
0.1\t245
0.3\t620
1.0\t1450
3.0\t2680
10.0\t4210
30.0\t5890
100.0\t7950
300.0\t9240
1000.0\t9850`,
  },
  chromatography: {
    name: 'Protein SEC Elution Peak (Gaussian / TSA)',
    model: 'gaussian',
    text: `# Elution Volume (mL)\tUV Absorbance (mAU)
10.0\t12.4
11.0\t15.8
12.0\t35.2
12.5\t84.1
13.0\t198.5
13.5\t310.2
14.0\t215.4
14.5\t92.3
15.0\t38.1
16.0\t16.5`,
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
    name: 'BSA Standard Curve (Linear Origin)',
    model: 'linear_origin',
    text: `# BSA Conc (mg/mL)\tAbsorbance (A562)
0.0\t0.000
0.125\t0.135
0.25\t0.268
0.5\t0.534
0.75\t0.795
1.0\t1.065
1.5\t1.590
2.0\t2.120`,
  },
};
