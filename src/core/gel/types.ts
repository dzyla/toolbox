/* Shared types for the gel core. All coordinates are pixels. */

/** A grayscale image plane, row-major, values 0..1 of the nominal range. */
export interface Plane { width: number; height: number; data: Float32Array }

/** 'dark': dark bands on a light background (Coomassie, silver, film). 'light': light bands on dark (EtBr, fluorescence, chemiluminescence camera). */
export type Polarity = 'dark' | 'light';

/** Affine map [a c e; b d f; 0 0 1]: x' = a·x + c·y + e, y' = b·x + d·y + f (same layout as the canvas/SVG matrix). */
export interface Affine { a: number; b: number; c: number; d: number; e: number; f: number }

/**
 * A lane in the working frame: the centre line runs from (x, y0) to (x + tilt, y1); the lane is `width` px wide.
 * Lanes are usually vertical (tilt 0); tilt lets a lane follow a smiling or skewed run.
 */
export interface Lane { id: string; x: number; y0: number; y1: number; width: number; tilt: number }

/** A band region inside a lane, as rows along the lane axis measured from the lane's y0. */
export interface Band { id: string; y0: number; y1: number; peakY?: number; manual?: boolean }

export class GelInputError extends Error {}
