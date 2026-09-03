export class SerialDilutionError extends Error {}
export interface SerialDilutionInput { startConc: number; factor: number; steps: number; wellVolume: number }
export interface SerialDilutionRow {
  well: number; concentration: number;
  /** Volume transferred onward and the diluent placed in each receiving well. */
  transfer: number; diluent: number;
  /** Explicit per-well aliases used by the UI; well 1 starts with no diluent. */
  transferVolume: number; diluentVolume: number; preparationVolume: number;
}

const positive = (value: number, label: string) => {
  if (!Number.isFinite(value) || value <= 0) throw new SerialDilutionError(`${label} must be a positive number`);
};

/** Plan an equal-final-volume serial dilution. Concentration and volume units pass through unchanged. */
export function plan(input: SerialDilutionInput): SerialDilutionRow[] {
  positive(input.startConc, 'Starting concentration'); positive(input.wellVolume, 'Well volume');
  if (!Number.isFinite(input.factor) || input.factor <= 1) throw new SerialDilutionError('Dilution factor must be greater than one');
  if (!Number.isInteger(input.steps) || input.steps < 1) throw new SerialDilutionError('Number of steps must be a positive integer');
  const transferVolume = input.wellVolume / (input.factor - 1);
  const preparationVolume = input.wellVolume + transferVolume;
  return Array.from({ length: input.steps }, (_, index) => ({
    well: index + 1,
    concentration: input.startConc / input.factor ** index,
    transfer: transferVolume,
    diluent: input.wellVolume,
    transferVolume,
    diluentVolume: index === 0 ? 0 : input.wellVolume,
    preparationVolume,
  }));
}
