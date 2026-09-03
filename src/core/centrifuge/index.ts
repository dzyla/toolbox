export class CentrifugeError extends Error {}
const positive = (value: number, label: string) => {
  if (!Number.isFinite(value) || value <= 0) throw new CentrifugeError(`${label} must be a positive number`);
};

/** Relative centrifugal force for RPM and rotor radius in millimetres. */
export function rcf(speed_rpm: number, radius_mm: number): number {
  positive(speed_rpm, 'RPM'); positive(radius_mm, 'Radius');
  return 1.118e-6 * radius_mm * speed_rpm ** 2;
}

/** RPM required for a relative centrifugal force and radius in millimetres. */
export function rpm(force_rcf: number, radius_mm: number): number {
  positive(force_rcf, 'RCF'); positive(radius_mm, 'Radius');
  return Math.sqrt(force_rcf / (1.118e-6 * radius_mm));
}

/** Beckman Coulter rotor k-factor equation; both radii may use the same length unit. */
export function kFactor(speed_rpm: number, rmax_mm: number, rmin_mm: number): number {
  positive(speed_rpm, 'RPM'); positive(rmax_mm, 'Maximum radius'); positive(rmin_mm, 'Minimum radius');
  if (rmax_mm <= rmin_mm) throw new CentrifugeError('Maximum radius must be greater than minimum radius');
  return 2.53e11 * Math.log(rmax_mm / rmin_mm) / speed_rpm ** 2;
}

/** Estimated pelleting time in hours for a particle sedimentation coefficient in Svedbergs. */
export function runTime(k: number, s_svedberg: number): number {
  positive(k, 'k-factor'); positive(s_svedberg, 'Sedimentation coefficient');
  return k / s_svedberg;
}
