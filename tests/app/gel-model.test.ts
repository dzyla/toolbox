import { describe, it, expect } from 'vitest';
import { migrateState, DEFAULTS } from '@/tools/gel/workspace-model';
describe('gel state migration', () => {
  it("maps the old 'spline' model to 'monotone'", () => {
    expect(migrateState({ ...DEFAULTS, calibMethod: 'spline' as never }).calibMethod).toBe('monotone');
    expect(migrateState(DEFAULTS)).toBe(DEFAULTS);
  });
  it('validates group settings from hand-edited links', () => {
    const m = (o: Record<string, unknown>) => migrateState({ ...DEFAULTS, ...o } as never);
    expect(m({ groupTarget: 'x' }).groupTarget).toBeNull();
    expect(m({ groupControl: { size: 'a', rf: 0.3 } }).groupControl).toBeNull();
    expect(m({ groupTarget: { size: null, rf: 0.4 } }).groupTarget).toEqual({ size: null, rf: 0.4 });
    expect(m({ groupNorm: 'bogus' }).groupNorm).toBe('none');
    expect(m({ groupMarginPct: 0 }).groupMarginPct).toBe(10);
    expect(m({ groupMarginPct: 250 }).groupMarginPct).toBe(10);
    expect(m({ groupMarginPct: 25 }).groupMarginPct).toBe(25);
  });
});
