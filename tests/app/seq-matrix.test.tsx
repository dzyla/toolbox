import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/preact';
import SeqMatrixView from '@/tools/seq-matrix/View';
import { route } from '@/app/router';

describe('Sequence Identity Matrix & MSA View', () => {
  it('renders default preset and displays summary stats and heatmap matrix', () => {
    route.value = { name: 'tool', toolId: 'seq-matrix' };
    render(<SeqMatrixView />);

    expect(screen.getByRole('heading', { name: /Sequence Identity Matrix & MSA/ })).toBeTruthy();
    expect(screen.getAllByText(/Percent Identity Matrix/).length).toBeGreaterThan(0);
    expect(screen.getByText(/Mean Pairwise Identity/)).toBeTruthy();
    expect(screen.getByText(/Closest Homology Pair/)).toBeTruthy();
    expect(screen.getByText(/Most Divergent Pair/)).toBeTruthy();

    // Verify sequences from default preset (GFP family)
    expect(screen.getAllByText(/EGFP/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/mCherry/).length).toBeGreaterThan(0);
  });

  it('allows switching metric between Identity, Similarity, Distance, and Score', () => {
    route.value = { name: 'tool', toolId: 'seq-matrix' };
    render(<SeqMatrixView />);

    // Toggle % Similarity
    const simBtn = screen.getByRole('button', { name: /% Similarity/i });
    fireEvent.click(simBtn);
    expect(screen.getAllByText(/Sequence Similarity Matrix/).length).toBeGreaterThan(0);

    // Toggle Distance
    const distBtn = screen.getByRole('button', { name: /Distance \(1 - Id\)/i });
    fireEvent.click(distBtn);
    expect(screen.getAllByText(/Pairwise Distance Matrix/).length).toBeGreaterThan(0);

    // Toggle Score
    const scoreBtn = screen.getByRole('button', { name: /Alignment Score/i });
    fireEvent.click(scoreBtn);
    expect(screen.getAllByText(/Pairwise Alignment Score Matrix/).length).toBeGreaterThan(0);
  });

  it('switches views to Multiple Alignment (MSA) and Distance Hierarchy', () => {
    route.value = { name: 'tool', toolId: 'seq-matrix' };
    render(<SeqMatrixView />);

    // Switch to MSA view
    const msaTab = screen.getByRole('button', { name: /Multiple Alignment/i });
    fireEvent.click(msaTab);
    expect(screen.getAllByText(/Progressive Multiple Sequence Alignment/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Conservation/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Clustal Symbols/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Consensus/).length).toBeGreaterThan(0);

    // Switch to Distance Hierarchy view
    const treeTab = screen.getByRole('button', { name: /Distance Hierarchy/i });
    fireEvent.click(treeTab);
    expect(screen.getAllByText(/Pairwise Distance Hierarchy/).length).toBeGreaterThan(0);
  });

  it('handles loading other presets', () => {
    route.value = { name: 'tool', toolId: 'seq-matrix' };
    render(<SeqMatrixView />);

    const select = screen.getByTestId('preset-select');
    fireEvent.change(select, { target: { value: 'globins' } });

    expect(screen.getAllByText(/Human_Hb_Alpha/).length).toBeGreaterThan(0);
  });
});
