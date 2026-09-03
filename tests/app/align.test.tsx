import { render, screen, fireEvent, waitFor } from '@testing-library/preact';
import { describe, it, expect } from 'vitest';
import View from '@/tools/align/View';
import { route } from '@/app/router';

describe('Alignment tool', () => {
  it('aligns the default sequences and re-aligns typed sequences', async () => {
    route.value = { name: 'tool', toolId: 'align' };
    render(<View />);
    const out = await screen.findByTestId('alignment');
    expect(out.textContent).toMatch(/MSTKYNPTQ/);
    expect(screen.getByText('Identity')).toBeTruthy();
    fireEvent.input(screen.getByLabelText(/Sequence 1/), { target: { value: 'ACGTACGTAC' } });
    fireEvent.input(screen.getByLabelText(/Sequence 2/), { target: { value: 'ACGTTTACGTAC' } });
    await waitFor(() => {
      const t = screen.getByTestId('alignment').textContent ?? '';
      expect(t).toMatch(/ACG--TACGTAC|ACGT--ACGTAC|ACGTACGTAC/);
      expect(t).toMatch(/ACGTTTACGTAC/);
    });
    expect(screen.getByText(/Gap open penalty/)).toBeTruthy();
    expect(screen.getByRole('option', { name: /EDNAFULL/ })).toBeTruthy();
  });
  it('reports invalid letters inline instead of a blank result', async () => {
    route.value = { name: 'tool', toolId: 'align' };
    render(<View />);
    fireEvent.input(screen.getByLabelText(/Sequence 1/), { target: { value: 'ACGT' } });
    fireEvent.input(screen.getByLabelText(/Sequence 2/), { target: { value: 'ACGTACGTACGJ' } });
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/not IUPAC nucleotides: sequence 2: J/));
  });
});
