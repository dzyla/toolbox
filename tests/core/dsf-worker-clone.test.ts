import { describe, expect, it } from 'vitest';
import { formatDsfToCsv, generateLysozymeDemoDataset, parseDsfCsv, predictBoltzmann } from '@/core/dsf';
import { runDsfJob, type DsfJob } from '@/tools/dsf/job';

describe('DSF worker messages are structured-cloneable', () => {
  const job: DsfJob = { parsed: parseDsfCsv(formatDsfToCsv(generateLysozymeDemoDataset())), options: {} };

  it('the job survives structuredClone', () => {
    expect(() => structuredClone(job)).not.toThrow();
  });

  it('the result survives structuredClone and keeps the Boltzmann fits usable', () => {
    const result = runDsfJob(job);
    const cloned = structuredClone(result);
    const fit = cloned.conditions.find(c => c.boltzmannFit)?.boltzmannFit;
    expect(fit).toBeTruthy();
    expect(predictBoltzmann(fit!, fit!.tm)).toBeCloseTo((fit!.fMin + fit!.fMax) / 2, 1);
  });
});
