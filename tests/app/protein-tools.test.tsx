import { fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { describe, expect, it } from 'vitest';
import { route } from '@/app/router';
import ProteinView from '@/tools/protein/View';
import ProteinConcentrationView from '@/tools/protein-conc/View';

describe('protein tools', () => {
  it('renders a method-bearing multi-entry protein analysis', async () => {
    route.value = { name: 'tool', toolId: 'protein' };
    render(<ProteinView />);
    expect(await screen.findByText('Example protein')).toBeTruthy();
    expect(screen.getByText(/Average molecular weight/)).toBeTruthy();
    expect(screen.getAllByText(/Kyte-Doolittle hydropathy/).length).toBeGreaterThan(0);
    expect(screen.getByText(/Science: Protein parameters/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Copy result' })).toBeTruthy();

    fireEvent.input(screen.getByLabelText('Protein sequence or FASTA'), {
      target: { value: '>one\nAAHHHHHHGG\n>two\nGAGAGA' },
    });
    await waitFor(() => expect(screen.getByText('one')).toBeTruthy());
    expect(screen.getByText('two')).toBeTruthy();
    expect(screen.getAllByText(/His-Tag \(6x\)/).length).toBeGreaterThan(0);
  });

  it('shows A280 concentration with sequence-derived values and validates path length', async () => {
    route.value = { name: 'tool', toolId: 'protein-conc' };
    render(<ProteinConcentrationView />);
    expect(screen.getByTestId('a280-result').textContent).toMatch(/1\.00 g\/L/);
    fireEvent.input(screen.getByLabelText('Path length'), { target: { value: '0' } });
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/path length/i));
  });

  it('fits a pasted standard curve and interpolates an unknown', async () => {
    route.value = { name: 'tool', toolId: 'protein-conc' };
    render(<ProteinConcentrationView />);
    fireEvent.click(screen.getByRole('button', { name: 'Standard curve' }));
    fireEvent.input(screen.getByLabelText(/^Standards/), { target: { value: '0,0.1\n1,2.1\n2,4.1' } });
    fireEvent.input(screen.getByLabelText('Unknown absorbance values'), { target: { value: '3.1' } });
    await waitFor(() => expect(screen.getByTestId('curve-result').textContent).toMatch(/1\.500/));
    expect(screen.getByTestId('curve-result').textContent).toMatch(/R² 1\.0000/);
  });
});
