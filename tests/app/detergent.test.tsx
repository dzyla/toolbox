import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/preact';
import DetergentView from '@/tools/detergent/View';
import { route } from '@/app/router';

describe('DetergentView UI', () => {
  it('renders Detergent & Membrane Protein Calculator with defaults', () => {
    route.value = { name: 'tool', toolId: 'detergent' };
    render(<DetergentView />);

    expect(screen.getByText(/Detergent & Membrane Protein Calculator/)).toBeTruthy();
    expect(screen.getByText(/CMC Phase Partition/)).toBeTruthy();
    expect(screen.getByText(/Micelle Particle Count/)).toBeTruthy();
    expect(screen.getByText(/Complex MW \(PDC\)/)).toBeTruthy();
    expect(screen.getByText(/Dialyzability/)).toBeTruthy();
  });

  it('updates calculations when changing detergent from DDM to OG', () => {
    route.value = { name: 'tool', toolId: 'detergent' };
    render(<DetergentView />);

    // Select OG
    const select = screen.getByLabelText(/Select Detergent/i);
    fireEvent.change(select, { target: { value: 'og' } });

    // OG has CMC 18 mM, micelle 25 kDa, Easily Dialyzable
    expect(screen.getAllByText(/Easily Dialyzable/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/292.4/i).length).toBeGreaterThan(0);
  });

  it('renders custom detergent fields when Custom Detergent is selected', () => {
    route.value = { name: 'tool', toolId: 'detergent' };
    render(<DetergentView />);

    const select = screen.getByLabelText(/Select Detergent/i);
    fireEvent.change(select, { target: { value: 'custom' } });

    expect(screen.getByText(/Custom Detergent Parameters/)).toBeTruthy();
    expect(screen.getByText(/Monomer MW \(g\/mol\)/)).toBeTruthy();
  });

  it('displays SEC column selection recommendations', () => {
    route.value = { name: 'tool', toolId: 'detergent' };
    render(<DetergentView />);

    expect(screen.getByText(/Superdex 200 Increase 10\/300 GL/)).toBeTruthy();
    expect(screen.getByText(/Superdex 75 Increase 10\/300 GL/)).toBeTruthy();
    expect(screen.getByText(/Superose 6 Increase 10\/300 GL/)).toBeTruthy();
  });

  it('displays working buffer preparation recipe', () => {
    route.value = { name: 'tool', toolId: 'detergent' };
    render(<DetergentView />);

    expect(screen.getByText(/Buffer Preparation & Pipetting Protocol/)).toBeTruthy();
    expect(screen.getByText(/Step 1: Measure Stock Detergent/)).toBeTruthy();
    expect(screen.getByText(/Step 2: Add Buffer \/ Milli-Q Water/)).toBeTruthy();
  });
});
