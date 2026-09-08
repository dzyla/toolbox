/** Sequence-informed ion-exchange starting points and a transparent gradient timeline. */

export type IonExchangeMode = 'cation-exchange' | 'anion-exchange';
export type MethodFinding = {
  severity: 'info' | 'review-required';
  message: string;
};

export interface IonExchangeAdvice {
  status: 'suggested' | 'review-required';
  mode?: IonExchangeMode;
  proteinPi: number;
  targetPh: number;
  /** Absolute difference between protein pI and target pH. */
  piDistance: number;
  /** Starting buffer descriptions intended for user editing before use. */
  bufferA: { name: string; description: string };
  bufferB: { name: string; description: string };
  findings: MethodFinding[];
}

export interface GradientInput {
  columnVolumeMl: number;
  flowMlPerMin: number;
  startPercentB: number;
  endPercentB: number;
  gradientCv: number;
  startHoldCv?: number;
  endHoldCv?: number;
}

export interface GradientPoint {
  phase: 'start' | 'start-hold-end' | 'gradient-end' | 'end-hold-end';
  columnVolumes: number;
  volumeMl: number;
  timeMin: number;
  percentB: number;
}

export interface GradientSimulation {
  points: GradientPoint[];
  atGradientEnd: GradientPoint;
  totalColumnVolumes: number;
  totalVolumeMl: number;
  totalTimeMin: number;
}

const buffers = (mode?: IonExchangeMode) => {
  const exchange = mode === 'cation-exchange' ? 'cation-exchange' : mode === 'anion-exchange' ? 'anion-exchange' : 'ion-exchange';
  return {
    bufferA: { name: 'Buffer A', description: `Editable low-salt ${exchange} starting buffer.` },
    bufferB: { name: 'Buffer B', description: `Editable higher-salt ${exchange} elution buffer.` },
  };
};

function finite(value: number, name: string): void {
  if (!Number.isFinite(value)) throw new RangeError(`${name} must be finite.`);
}

/**
 * Suggest ion-exchange polarity only when target pH is at least one unit from pI.
 * This is a charge-sign heuristic, not a prediction of capacity, conductivity, or yield.
 */
export function suggestIonExchange(input: { proteinPi: number; targetPh: number }): IonExchangeAdvice {
  finite(input.proteinPi, 'Protein pI');
  finite(input.targetPh, 'Target pH');
  const piDistance = Math.abs(input.proteinPi - input.targetPh);
  const mode = piDistance >= 1
    ? input.targetPh < input.proteinPi ? 'cation-exchange' : 'anion-exchange'
    : undefined;
  const status = mode ? 'suggested' : 'review-required';
  const findings: MethodFinding[] = mode
    ? [{ severity: 'info', message: `Target pH is ${piDistance.toFixed(2)} pH units ${input.targetPh < input.proteinPi ? 'below' : 'above'} pI; ${mode} is a charge-sign starting point.` }]
    : [{ severity: 'review-required', message: `Target pH is only ${piDistance.toFixed(2)} pH units from pI; review conditions rather than selecting ion exchange from pI alone.` }];
  return { status, mode, proteinPi: input.proteinPi, targetPh: input.targetPh, piDistance, ...buffers(mode), findings };
}

function validateGradient(input: GradientInput): Required<GradientInput> {
  const startHoldCv = input.startHoldCv ?? 0;
  const endHoldCv = input.endHoldCv ?? 0;
  finite(input.columnVolumeMl, 'Column volume');
  finite(input.flowMlPerMin, 'Flow');
  finite(input.startPercentB, 'Start %B');
  finite(input.endPercentB, 'End %B');
  finite(input.gradientCv, 'Gradient CV');
  finite(startHoldCv, 'Start hold CV');
  finite(endHoldCv, 'End hold CV');
  if (input.columnVolumeMl <= 0) throw new RangeError('Column volume must be greater than zero.');
  if (input.flowMlPerMin <= 0) throw new RangeError('Flow must be greater than zero.');
  if (input.gradientCv <= 0) throw new RangeError('Gradient CV must be greater than zero.');
  if (startHoldCv < 0 || endHoldCv < 0) throw new RangeError('Hold CV must be zero or greater.');
  if (input.startPercentB < 0 || input.startPercentB > 100 || input.endPercentB < 0 || input.endPercentB > 100) throw new RangeError('%B must be between 0 and 100.');
  return { ...input, startHoldCv, endHoldCv };
}

/** Returns endpoints for the initial hold, linear gradient, and final hold in CV, volume, and time. */
export function simulateGradient(input: GradientInput): GradientSimulation {
  const settings = validateGradient(input);
  const point = (phase: GradientPoint['phase'], columnVolumes: number, percentB: number): GradientPoint => ({
    phase,
    columnVolumes,
    volumeMl: columnVolumes * settings.columnVolumeMl,
    timeMin: columnVolumes * settings.columnVolumeMl / settings.flowMlPerMin,
    percentB,
  });
  const start = point('start', 0, settings.startPercentB);
  const startHoldEnd = point('start-hold-end', settings.startHoldCv, settings.startPercentB);
  const atGradientEnd = point('gradient-end', settings.startHoldCv + settings.gradientCv, settings.endPercentB);
  const endHoldEnd = point('end-hold-end', atGradientEnd.columnVolumes + settings.endHoldCv, settings.endPercentB);
  return {
    points: [start, startHoldEnd, atGradientEnd, endHoldEnd],
    atGradientEnd,
    totalColumnVolumes: endHoldEnd.columnVolumes,
    totalVolumeMl: endHoldEnd.volumeMl,
    totalTimeMin: endHoldEnd.timeMin,
  };
}
