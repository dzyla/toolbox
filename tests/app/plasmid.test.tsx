import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/preact';
import PlasmidView from '@/tools/plasmid/View';
import { route } from '@/app/router';

describe('Plasmid Viewer tool view', () => {
  it('renders plasmid viewer with default pUC19 plasmid', async () => {
    route.value = { name: 'tool', toolId: 'plasmid' };
    render(<PlasmidView />);

    expect(screen.getAllByText(/pUC19/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/2,686 bp/).length).toBeGreaterThan(0);
    expect(screen.getByRole('img', { name: /Circular map of pUC19/ })).toBeTruthy();
  });

  it('switches between circular, linear, sequence, and table view modes', async () => {
    route.value = { name: 'tool', toolId: 'plasmid' };
    render(<PlasmidView />);

    // Linear Map
    const linearBtn = screen.getByRole('button', { name: /Linear Map/ });
    fireEvent.click(linearBtn);
    expect(screen.getByText(/Linear Plasmid Track/)).toBeTruthy();

    // Sequence & ORFs
    const seqBtn = screen.getByRole('button', { name: /Sequence & ORFs/ });
    fireEvent.click(seqBtn);
    expect(screen.getByText(/Detected Open Reading Frames/)).toBeTruthy();
    expect(screen.getByText(/Nucleotide Sequence/)).toBeTruthy();

    // Features Table
    const tableBtn = screen.getByRole('button', { name: /Features Table/ });
    fireEvent.click(tableBtn);
    expect(screen.getByText(/Feature Annotations/)).toBeTruthy();
    expect(screen.getByText(/AmpR \(bla\)/)).toBeTruthy();
  });

  it('switches preset vectors to pET-28a(+)', async () => {
    route.value = { name: 'tool', toolId: 'plasmid' };
    render(<PlasmidView />);

    const select = screen.getByRole('combobox');
    fireEvent.change(select, { target: { value: 'pet-28a' } });

    expect(screen.getAllByText(/pET-28a\(\+\)/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/5,369 bp/).length).toBeGreaterThan(0);
  });
});
