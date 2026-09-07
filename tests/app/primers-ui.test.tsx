import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/preact';
import PrimersView from '@/tools/primers/View';
import { route } from '@/app/router';

describe('Primer QC & PCR Suite View UI Tests', () => {
  it('renders Primers tool with default GFP cloning pair and PCR annealing temperature', () => {
    route.value = { name: 'tool', toolId: 'primers' };
    render(<PrimersView />);

    // Header & Tool Title
    expect(screen.getAllByText(/Primer QC & PCR Suite/).length).toBeGreaterThan(0);

    // Polymerase selection
    expect(screen.getAllByText(/Phusion® \/ Q5®/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Taq \/ Standard/).length).toBeGreaterThan(0);

    // Annealing temperature display
    expect(screen.getByText(/Recommended PCR Annealing Temperature/)).toBeTruthy();

    // Summary table
    expect(screen.getByText(/Primer Specification & Secondary Structure Summary/)).toBeTruthy();
    expect(screen.getAllByText(/GFP_Fwd/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/GFP_Rev/).length).toBeGreaterThan(0);

    // Ordering sheet section
    expect(screen.getByText(/Oligonucleotide Order Sheet/)).toBeTruthy();
  });

  it('switches between Primer Pair and Single Primer QC mode', () => {
    route.value = { name: 'tool', toolId: 'primers' };
    render(<PrimersView />);

    const singleBtn = screen.getByRole('button', { name: /Single Primer QC/ });
    fireEvent.click(singleBtn);

    expect(screen.getByText(/Single Primer QC/)).toBeTruthy();
    expect(screen.queryByText(/Reverse Primer \(5′ ➔ 3′\)/)).toBeNull();
  });

  it('loads preset and updates primer analysis', () => {
    route.value = { name: 'tool', toolId: 'primers' };
    render(<PrimersView />);

    const presetBtn = screen.getByRole('button', { name: /3′ Self-Dimer Warning/ });
    fireEvent.click(presetBtn);

    expect(screen.getAllByText(/Dimer_Fwd/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/EXTENSION RISK/).length).toBeGreaterThan(0);
  });

  it('toggles collapsible reaction conditions and adjusts inputs', () => {
    route.value = { name: 'tool', toolId: 'primers' };
    render(<PrimersView />);

    const adjustBtn = screen.getByRole('button', { name: /Reaction & Buffer Conditions/ });
    fireEvent.click(adjustBtn);

    expect(screen.getByText(/Primer Conc \[nM\]/)).toBeTruthy();
    expect(screen.getByText(/Mg²⁺ Conc \[mM\]/)).toBeTruthy();
    expect(screen.getByText(/Total dNTPs \[mM\]/)).toBeTruthy();
  });
});
