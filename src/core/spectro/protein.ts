/* Protein spectrophotometry and standard-curve fitting.
   Beer–Lambert: A = εcl. Least-squares normal equations are solved locally. */

export interface StandardPoint { concentration: number; absorbance: number }
export type CurveModel = 'linear' | 'quadratic';
export interface CurveFit {
  model: CurveModel;
  /** [intercept, linear, quadratic] (quadratic term omitted for a linear fit). */
  coefficients: number[];
  r2: number;
  residuals: number[];
  predict: (concentration: number) => number;
  concentrationAt: (absorbance: number) => number;
}

/** Convert A280 to mol/L and g/L, including sample dilution. */
export function concentrationFromA280(absorbance: number, extinctionCoefficient: number, pathCm: number,
  dilution: number, molecularWeight: number): { molar: number; gPerL: number } {
  if (!(absorbance >= 0) || !Number.isFinite(absorbance)) throw new RangeError('Absorbance must be zero or greater.');
  if (!(extinctionCoefficient > 0) || !Number.isFinite(extinctionCoefficient)) throw new RangeError('Extinction coefficient must be greater than zero.');
  if (!(pathCm > 0) || !Number.isFinite(pathCm)) throw new RangeError('Path length must be greater than zero.');
  if (!(dilution > 0) || !Number.isFinite(dilution)) throw new RangeError('Dilution factor must be greater than zero.');
  if (!(molecularWeight > 0) || !Number.isFinite(molecularWeight)) throw new RangeError('Molecular weight must be greater than zero.');
  const molar = absorbance * dilution / (extinctionCoefficient * pathCm);
  return { molar, gPerL: molar * molecularWeight };
}

function solveLinearSystem(matrix: number[][], vector: number[]): number[] {
  const size = vector.length;
  const augmented = matrix.map((row, index) => [...row, vector[index]!]);
  for (let column = 0; column < size; column++) {
    let pivot = column;
    for (let row = column + 1; row < size; row++) if (Math.abs(augmented[row]![column]!) > Math.abs(augmented[pivot]![column]!)) pivot = row;
    [augmented[column], augmented[pivot]] = [augmented[pivot]!, augmented[column]!];
    const divisor = augmented[column]![column]!;
    if (Math.abs(divisor) < 1e-14) throw new RangeError('Standard concentrations do not define a unique fit.');
    for (let cursor = column; cursor <= size; cursor++) augmented[column]![cursor] = augmented[column]![cursor]! / divisor;
    for (let row = 0; row < size; row++) {
      if (row === column) continue;
      const factor = augmented[row]![column]!;
      for (let cursor = column; cursor <= size; cursor++) augmented[row]![cursor] = augmented[row]![cursor]! - factor * augmented[column]![cursor]!;
    }
  }
  return augmented.map(row => row[size]!);
}

/** Least-squares linear or quadratic calibration with inverse interpolation. */
export function standardCurve(points: StandardPoint[], model: CurveModel): CurveFit {
  const degree = model === 'quadratic' ? 2 : 1;
  if (points.length < degree + 1) throw new RangeError(`${model === 'quadratic' ? 'Quadratic' : 'Linear'} fitting needs at least ${degree + 1} standards.`);
  if (points.some(point => !Number.isFinite(point.concentration) || !Number.isFinite(point.absorbance))) throw new RangeError('All standard values must be finite.');
  const sums = Array.from({ length: degree * 2 + 1 }, (_, power) => points.reduce((total, point) => total + point.concentration ** power, 0));
  const matrix = Array.from({ length: degree + 1 }, (_, row) => Array.from({ length: degree + 1 }, (_, column) => sums[row + column]!));
  const vector = Array.from({ length: degree + 1 }, (_, power) => points.reduce((total, point) => total + point.absorbance * point.concentration ** power, 0));
  const coefficients = solveLinearSystem(matrix, vector);
  const predict = (concentration: number) => coefficients.reduce((total, coefficient, power) => total + coefficient * concentration ** power, 0);
  const residuals = points.map(point => point.absorbance - predict(point.concentration));
  const mean = points.reduce((total, point) => total + point.absorbance, 0) / points.length;
  const residualSum = residuals.reduce((total, residual) => total + residual ** 2, 0);
  const totalSum = points.reduce((total, point) => total + (point.absorbance - mean) ** 2, 0);
  const r2 = totalSum === 0 ? (residualSum < 1e-14 ? 1 : 0) : 1 - residualSum / totalSum;
  const min = Math.min(...points.map(point => point.concentration));
  const max = Math.max(...points.map(point => point.concentration));
  const concentrationAt = (absorbance: number): number => {
    if (!Number.isFinite(absorbance)) throw new RangeError('Unknown absorbance must be finite.');
    if (degree === 1) {
      if (Math.abs(coefficients[1]!) < 1e-14) throw new RangeError('A flat standard curve cannot be inverted.');
      return (absorbance - coefficients[0]!) / coefficients[1]!;
    }
    const [intercept, linear, quadratic] = coefficients as [number, number, number];
    if (Math.abs(quadratic) < 1e-14) {
      if (Math.abs(linear) < 1e-14) throw new RangeError('A flat standard curve cannot be inverted.');
      return (absorbance - intercept) / linear;
    }
    const discriminant = linear ** 2 - 4 * quadratic * (intercept - absorbance);
    if (discriminant < 0) throw new RangeError('Unknown absorbance is outside the fitted quadratic curve.');
    const roots = [(-linear + Math.sqrt(discriminant)) / (2 * quadratic), (-linear - Math.sqrt(discriminant)) / (2 * quadratic)];
    const inRange = roots.filter(root => root >= min - 1e-10 && root <= max + 1e-10);
    if (inRange.length === 1) return inRange[0]!;
    if (inRange.length > 1) return inRange.sort((a, b) => a - b)[0]!;
    return roots.sort((a, b) => Math.min(Math.abs(a - min), Math.abs(a - max)) - Math.min(Math.abs(b - min), Math.abs(b - max)))[0]!;
  };
  return { model, coefficients, r2, residuals, predict, concentrationAt };
}

/** Bradford default: ordinary least-squares linear standard curve. */
export function bradfordFit(points: StandardPoint[]): CurveFit {
  return standardCurve(points, 'linear');
}
