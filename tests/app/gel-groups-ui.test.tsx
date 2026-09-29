import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/preact';
import GelView from '@/tools/gel/View';
import { GelGroupsView } from '@/tools/gel/GelGroupsView';
import type { GelWorkspace } from '@/tools/gel/workspace';

describe('Groups view', () => {
  it('shows lane metadata, summary and the data-quality panel', () => {
    render(<GelView />);
    fireEvent.click(screen.getByRole('button', { name: /Band Quantification & Amounts/i }));
    fireEvent.click(screen.getByRole('button', { name: /Conditions & Replicates/i }));
    expect(screen.getByRole('table', { name: /Lane conditions/i })).toBeTruthy();
    expect(screen.getByRole('table', { name: /Condition summary/i })).toBeTruthy();
    expect(screen.getByText(/n < 3/i)).toBeTruthy();
  });
});

describe('Groups view without bands', () => {
  it('offers no selectable target when no bands are detected', () => {
    const g = {
      s: { groupTarget: null, groupControl: null, groupNorm: 'none', groupWelch: false, groupControlCondition: '', groupMarginPct: 10 },
      set: () => {}, setLaneMeta: () => {}, lanes: [], laneMeta: {}, groupRows: [], groupSummaries: [], groupControlCondition: '', qualityIssues: [],
      targetClusters: [{ id: 'target-default', avgSize: 50, avgRf: 0.3, medianPeakY: 0, matchingLanesCount: 0, label: '~50 kDa (no bands detected)' }],
    } as unknown as GelWorkspace;
    render(<GelGroupsView g={g} />);
    const sel = screen.getByLabelText(/Target band/i) as HTMLSelectElement;
    expect(Array.from(sel.options).filter(o => o.value && !o.disabled)).toEqual([]);
    expect(screen.getByRole('option', { name: /No bands detected/i })).toBeTruthy();
  });
});
