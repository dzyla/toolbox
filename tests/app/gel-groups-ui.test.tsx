import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/preact';
import GelView from '@/tools/gel/View';
import { GelGroupsView } from '@/tools/gel/GelGroupsView';
import { summarizeGroups } from '@/core/gel/groups';
import type { GelWorkspace } from '@/tools/gel/workspace';

describe('Groups view', () => {
  it('shows lane metadata, summary and the data-quality panel', () => {
    render(<GelView />);
    fireEvent.click(screen.getByRole('button', { name: /📊 Quantification/ }));
    fireEvent.click(screen.getByRole('button', { name: /📊 Conditions/ }));
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

describe('Groups dot plot axis', () => {
  const g = {
    s: { groupTarget: null, groupControl: null, groupNorm: 'control-band', groupWelch: false, groupControlCondition: '', groupMarginPct: 10 },
    set: () => {}, setLaneMeta: () => {}, lanes: [], laneMeta: {}, groupRows: [], groupControlCondition: '', qualityIssues: [], targetClusters: [],
    groupSummaries: summarizeGroups([...[1, 1.2, 0.8].map((value, i) => ({ laneId: `c${i}`, condition: 'ctrl', replicate: i + 1, value, flags: [] })), ...[2, 2.4, 2.2].map((value, i) => ({ laneId: `d${i}`, condition: 'drug', replicate: i + 1, value, flags: [] }))], 'ctrl'),
  } as unknown as GelWorkspace;
  it('draws a labelled y-axis with tick labels and gridlines', () => {
    render(<GelGroupsView g={g} />);
    const svg = screen.getByRole('img', { name: /per condition/i });
    const labels = Array.from(svg.querySelectorAll('text.y-tick')).map(t => t.textContent);
    expect(labels.length).toBeGreaterThanOrEqual(4);
    expect(labels).toContain('0.00');
    expect(svg.querySelectorAll('line.y-grid').length).toBe(labels.length);
    expect(svg.textContent).toMatch(/Normalized value/);
  });
});
