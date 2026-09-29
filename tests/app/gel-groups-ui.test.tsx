import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/preact';
import GelView from '@/tools/gel/View';

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
