import { fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { describe, expect, it } from 'vitest';
import MethodComparison from '@/tools/method-comparison/View';
import { findTool, searchTools } from '@/tools/registry';
import { assuranceFor } from '@/tools/assurance';

const paste = (value: string) => fireEvent.input(screen.getByLabelText(/Paired measurements \(two columns/), { target: { value } });

describe('method comparison tool', () => {
  it('is registered, searchable, and has an assurance record', async () => {
    const tool = findTool('method-comparison');
    expect(tool).toMatchObject({ status: 'ready', category: 'calculators', name: 'Method Comparison (Bland–Altman)' });
    expect((await tool!.load!()).default).toBe(MethodComparison);
    for (const query of ['bland altman', 'agreement', 'method comparison']) {
      expect(searchTools(query).map(entry => entry.id)).toContain('method-comparison');
    }
    expect(assuranceFor('method-comparison').status).toBe('method-documented');
  });

  it('starts empty with disabled exports, then shows headline numbers and a plot for the example', () => {
    render(<MethodComparison />);
    expect(screen.getByText(/Paste two columns/)).toBeTruthy();
    expect((screen.getByText('Export CSV') as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByText('Load example'));
    expect(screen.getByText('Bias (mean difference)')).toBeTruthy();
    expect(screen.getByText('Lower limit of agreement')).toBeTruthy();
    expect(screen.getByText('Upper limit of agreement')).toBeTruthy();
    expect(screen.getByRole('img', { name: /Bland–Altman plot of 24 pairs/ })).toBeTruthy();
    expect(screen.getByRole('note').textContent).toMatch(/proportional bias|difference changes/i);
    expect((screen.getByText('Export CSV') as HTMLButtonElement).disabled).toBe(false);
  });

  it('shows hand-computed values for pasted data and keeps options collapsed but named', () => {
    render(<MethodComparison />);
    paste('A,B\n11,10\n13,11\n15,12\n17,13\n19,14');
    expect(screen.getByText('3')).toBeTruthy(); // bias for differences 1..5 is 3
    expect(screen.getByText(/95% CI 1\.04 to 4\.96/)).toBeTruthy(); // 3 +/- 1.9632
    expect(screen.getByLabelText('Difference type')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Difference type'), { target: { value: 'log' } });
    expect(screen.getAllByText(/×/).length).toBe(3);
  });

  it('explains data problems instead of failing silently', async () => {
    render(<MethodComparison />);
    paste('1,2\n3,4');
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/three pairs/));
  });
});
