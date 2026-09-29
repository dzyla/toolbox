import { describe, it, expect } from 'vitest';
import { migrateState, DEFAULTS } from '@/tools/gel/workspace-model';
describe('gel state migration', () => {
  it("maps the old 'spline' model to 'monotone'", () => {
    expect(migrateState({ ...DEFAULTS, calibMethod: 'spline' as never }).calibMethod).toBe('monotone');
    expect(migrateState(DEFAULTS)).toBe(DEFAULTS);
  });
});
