import { fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import StudyDesign from '@/tools/study-design/View';
import { findTool, searchTools } from '@/tools/registry';
import { assuranceFor } from '@/tools/assurance';

function input(label: string | RegExp, value: string) {
  fireEvent.input(screen.getByLabelText(label), { target: { value } });
}
function select(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}
function advanced() {
  fireEvent.click(screen.getByText('Advanced design settings'));
}

afterEach(() => vi.restoreAllMocks());

describe('study design planner', () => {
  it('shows the default independent-group recommendation with planning status and sources', () => {
    render(<StudyDesign />);
    expect(screen.getByText('64 analysable samples per group')).toBeTruthy();
    expect(screen.getByText('Planning estimate')).toBeTruthy();
    expect(screen.getByText(/does not validate the assay or statistical analysis plan/)).toBeTruthy();
    fireEvent.click(screen.getByText(/Science:/));
    for (const name of [/Cohen/, /R.*power.t.test/, /G\*Power/]) {
      expect(screen.getByRole('link', { name })).toBeTruthy();
    }
  });

  it('derives effect from difference and SD and accepts direct Cohen’s d', () => {
    render(<StudyDesign />);
    input('Anticipated difference', '2');
    input('Common standard deviation', '4');
    expect(screen.getByText('64 analysable samples per group')).toBeTruthy();
    select('Effect size input', 'standardized');
    input("Cohen's d", '0.8');
    expect(screen.getByText('26 analysable samples per group')).toBeTruthy();
  });

  it.each([
    ['Anticipated difference', '', /Anticipated difference/],
    ['Anticipated difference', '0', /Anticipated difference/],
    ['Common standard deviation', '0', /Common standard deviation/],
    ['Alpha', '1', /Alpha/],
    ['Target power', '0.01', /Target power/],
    ['Allocation ratio (group 2 / group 1)', '0', /Allocation ratio/],
    ['Dropout (%)', '100', /Dropout/],
    ['Alpha', 'abc', /Alpha/],
  ])('blocks stale results and exports for invalid %s = %s', (label, value, message) => {
    render(<StudyDesign />);
    advanced();
    input(label, value);
    expect(screen.getByRole('alert').textContent).toMatch(message);
    expect(screen.getByLabelText(label).getAttribute('aria-invalid')).toBe('true');
    expect(screen.queryByText('64 analysable samples per group')).toBeNull();
    expect((screen.getByRole('button', { name: 'Copy design summary' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Export design summary' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('recomputes one-sided power, unequal allocation, and dropout enrollment', () => {
    render(<StudyDesign />);
    advanced();
    select('Sidedness', 'one-sided');
    expect(screen.getByText('51 analysable samples per group')).toBeTruthy();
    expect(screen.getByText(/prespecify the direction/i)).toBeTruthy();
    select('Sidedness', 'two-sided');
    input('Dropout (%)', '20');
    expect(screen.getByText('64 analysable samples per group')).toBeTruthy();
    expect(screen.getByText('Enroll 80 in group 1 and 80 in group 2')).toBeTruthy();
    input('Allocation ratio (group 2 / group 1)', '2');
    expect(screen.getByText('48 analysable samples in group 1; 96 in group 2')).toBeTruthy();
    expect(screen.getByText('Enroll 60 in group 1 and 120 in group 2')).toBeTruthy();
  });

  it('solves planned power and minimum detectable effect for labelled analysable group sizes', () => {
    render(<StudyDesign />);
    select('Objective', 'power');
    expect(screen.getByText('80.15% achieved power')).toBeTruthy();
    input('Analysable samples in group 1', '63');
    input('Analysable samples in group 2', '63');
    expect(screen.getByText('79.52% achieved power')).toBeTruthy();
    input('Analysable samples in group 1', '2.5');
    expect(screen.getByRole('alert').textContent).toMatch(/group 1.*integer/i);
    input('Analysable samples in group 1', '64');
    input('Analysable samples in group 2', '64');
    select('Objective', 'effect');
    expect(screen.getByText("Minimum detectable Cohen's d: 0.4991")).toBeTruthy();
    expect(screen.queryByLabelText('Anticipated difference')).toBeNull();
  });

  it('copies and downloads settings, results, version, methods, sources, and warnings', async () => {
    const copy = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();
    const blobUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:study-design');
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    render(<StudyDesign />);
    input('Anticipated difference', '2');
    input('Common standard deviation', '4');
    advanced();
    input('Dropout (%)', '20');
    fireEvent.click(screen.getByRole('button', { name: 'Copy design summary' }));
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('Design summary copied'));
    const summary = copy.mock.calls[0]![0];
    for (const expected of ['Two independent groups', 'Planning estimate', 'Anticipated difference: 2',
      'Common standard deviation: 4', "Cohen's d: 0.5", 'Alpha: 0.05', 'Target power: 0.8',
      'Sidedness: two-sided', 'Allocation ratio (group 2 / group 1): 1', 'Dropout (%): 20',
      'Enroll 80 in group 1 and 80 in group 2', 'Method:', 'noncentral t', 'Assumptions:',
      'Cohen', 'power.t.test', 'G*Power', 'does not validate', 'Planner version:']) {
      expect(summary).toContain(expected);
    }
    fireEvent.click(screen.getByRole('button', { name: 'Export design summary' }));
    const blob = blobUrl.mock.calls[0]![0] as Blob;
    expect(await blob.text()).toBe(summary);
  });

  it('reports clipboard failure without claiming a copy succeeded', async () => {
    vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(new Error('Permission denied'));
    render(<StudyDesign />);
    fireEvent.click(screen.getByRole('button', { name: 'Copy design summary' }));
    await waitFor(() => expect(screen.getByRole('status').textContent).toMatch(/Copy failed/));
  });

  it('registers a ready searchable planner with its reference-test assurance', async () => {
    const tool = findTool('study-design');
    expect(tool).toMatchObject({ status: 'ready', category: 'calculators' });
    expect((await tool!.load!()).default).toBe(StudyDesign);
    for (const query of ['power', 'sample size', 'cohen', 'study design']) {
      expect(searchTools(query).map(entry => entry.id)).toContain('study-design');
    }
    expect(assuranceFor('study-design').status).toBe('reference-tested');
  });
});
