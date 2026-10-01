import { fireEvent, render, screen } from '@testing-library/preact';
import { describe, expect, it } from 'vitest';
import StudyDesign from '@/tools/study-design/View';

const input = (label: string | RegExp, value: string) => fireEvent.input(screen.getByLabelText(label), { target: { value } });
const select = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

describe('study design: paired and ANOVA designs', () => {
  it('offers a named Design selector and keeps two groups as the default', () => {
    render(<StudyDesign />);
    expect((screen.getByLabelText('Design') as HTMLSelectElement).value).toBe('two-group');
    expect(screen.getByText('64 analysable samples per group')).toBeTruthy();
  });

  it('plans a paired design: 34 pairs for d_z = 0.5, with dropout enrollment', () => {
    render(<StudyDesign />);
    select('Design', 'paired');
    expect(screen.queryByLabelText('Analysable samples in group 2')).toBeNull();
    expect(screen.getByText('34 analysable pairs')).toBeTruthy();
    select('Effect size input', 'standardized');
    input("Cohen's d_z", '0.5');
    fireEvent.click(screen.getByText('Advanced design settings'));
    input('Dropout (%)', '10');
    expect(screen.getByText('Enroll 38 pairs')).toBeTruthy();
  });

  it('computes paired power and minimum detectable effect', () => {
    render(<StudyDesign />);
    select('Design', 'paired');
    select('Objective', 'power');
    input('Analysable pairs', '34');
    expect(screen.getByText('80.78% achieved power')).toBeTruthy();
    select('Objective', 'effect');
    expect(screen.getByText(/Minimum detectable Cohen's d_z: 0\.4\d+/)).toBeTruthy();
  });

  it('plans a one-way ANOVA from Cohen f and from group means', () => {
    render(<StudyDesign />);
    select('Design', 'anova');
    expect(screen.getByText('45 analysable samples per group (180 in total)')).toBeTruthy();
    input('Number of groups', '3');
    expect(screen.getByText('53 analysable samples per group (159 in total)')).toBeTruthy();
    select('Effect size input', 'raw');
    input(/Anticipated group means/, '0, 0, 0, 1');
    input('Common standard deviation within groups', '1');
    // f = sqrt(0.1875) = 0.433 for means 0,0,0,1 (four groups): result changes and the group field is derived.
    expect(screen.queryByLabelText('Number of groups')).toBeNull();
    expect(screen.getByText(/analysable samples per group \(\d+ in total\)/)).toBeTruthy();
  });

  it('blocks invalid ANOVA input with named fields and swaps science per design', () => {
    render(<StudyDesign />);
    select('Design', 'anova');
    input("Cohen's f", '0');
    expect(screen.getByRole('alert').textContent).toMatch(/Cohen's f must be greater than zero/);
    fireEvent.click(screen.getByText(/Science:/));
    expect(screen.getByText(/Balanced one-way ANOVA/)).toBeTruthy();
    select('Design', 'two-group');
    expect(screen.getByText('64 analysable samples per group')).toBeTruthy();
  });
});
