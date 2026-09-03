/**
 * Image calibration, distance, angle, and area calculations.
 */

export interface Point {
  x: number;
  y: number;
}

export interface CalibrationScale {
  pixels: number;
  realLength: number;
  unit: 'nm' | 'µm' | 'mm' | 'cm' | 'in';
}

export type MeasurementType = 'line' | 'angle' | 'rect' | 'circle' | 'polygon';

export interface MeasurementItem {
  id: string;
  type: MeasurementType;
  label: string;
  points: Point[];
  color: string;
  // Computed values
  pixelValue: number; // length in px or area in px^2
  calibratedValue: number; // length or area in real units
  unit: string;
  angleDeg?: number;
}

/** Calculate euclidean distance between two points */
export function distanceBetween(p1: Point, p2: Point): number {
  return Math.hypot(p2.x - p1.x, p2.y - p1.y);
}

/** Calculate angle in degrees between three points (p1-vertex-p2) */
export function angleBetweenPoints(p1: Point, vertex: Point, p2: Point): number {
  const v1 = { x: p1.x - vertex.x, y: p1.y - vertex.y };
  const v2 = { x: p2.x - vertex.x, y: p2.y - vertex.y };
  const dot = v1.x * v2.x + v1.y * v2.y;
  const mag1 = Math.hypot(v1.x, v1.y);
  const mag2 = Math.hypot(v2.x, v2.y);
  if (mag1 === 0 || mag2 === 0) return 0;
  const cosTheta = Math.max(-1, Math.min(1, dot / (mag1 * mag2)));
  return (Math.acos(cosTheta) * 180) / Math.PI;
}

/** Calculate polygon area in px^2 using the Shoelace formula */
export function polygonArea(points: Point[]): number {
  const n = points.length;
  if (n < 3) return 0;
  let area = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += points[i]!.x * points[j]!.y;
    area -= points[j]!.x * points[i]!.y;
  }
  return Math.abs(area) / 2;
}

/** Calibrate a measurement given pixel value and scale */
export function applyCalibration(
  pixelValue: number,
  type: MeasurementType,
  scale?: CalibrationScale,
): { value: number; unit: string } {
  if (!scale || scale.pixels <= 0 || scale.realLength <= 0) {
    return {
      value: pixelValue,
      unit: type === 'rect' || type === 'circle' || type === 'polygon' ? 'px²' : 'px',
    };
  }

  const ratio = scale.realLength / scale.pixels;
  if (type === 'rect' || type === 'circle' || type === 'polygon') {
    return {
      value: pixelValue * ratio * ratio,
      unit: `${scale.unit}²`,
    };
  } else {
    return {
      value: pixelValue * ratio,
      unit: scale.unit,
    };
  }
}
