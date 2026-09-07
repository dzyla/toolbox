import { describe, expect, it } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/preact';
import BuffersView from '@/tools/buffers/View';

describe('Buffers & Media Recipes View', () => {
  it('opens and closes the contribute modal without crashing or occlusion', () => {
    render(<BuffersView />);

    // Click Contribute button
    const contributeBtn = screen.getByRole('button', { name: /Contribute/i });
    fireEvent.click(contributeBtn);

    // Modal title should be visible
    expect(screen.getByText(/Contribute Buffer Recipe/i)).toBeTruthy();
    expect(screen.getByRole('link', { name: /Submit via GitHub Issue/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Copy JSON/i })).toBeTruthy();

    // Close modal
    const closeBtn = screen.getByTitle('Close modal');
    fireEvent.click(closeBtn);
    expect(screen.queryByText(/Contribute Buffer Recipe/i)).toBeNull();
  });

  it('allows toggling between solid and stock forms using compact pills', () => {
    render(<BuffersView />);

    const stockBtn = screen.getByRole('button', { name: 'Stock' });
    fireEvent.click(stockBtn);

    expect(screen.getByText('Stock Conc')).toBeTruthy();
    expect(screen.getByText('Stock Unit')).toBeTruthy();

    const solidBtn = screen.getByRole('button', { name: 'Solid' });
    fireEvent.click(solidBtn);

    expect(screen.getByText('MW (g/mol)')).toBeTruthy();
    expect(screen.getByText('Hydrate Waters (·nH₂O)')).toBeTruthy();
  });
});
