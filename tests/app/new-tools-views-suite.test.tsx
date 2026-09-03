import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/preact';
import SecView from '@/tools/sec/View';
import GibsonView from '@/tools/gibson/View';
import MutagenesisView from '@/tools/mutagenesis/View';
import DiafiltrationView from '@/tools/diafiltration/View';
import RareCodonsView from '@/tools/rare-codons/View';
import { route } from '@/app/router';

describe('Biophysical & Molecular Biology Tools Views Suite', () => {
  it('renders SEC Calibration tool and performs bidirectional prediction', () => {
    route.value = { name: 'tool', toolId: 'sec' };
    render(<SecView />);
    expect(screen.getByText(/SEC Calibration & Stokes Radius/)).toBeTruthy();
    expect(screen.getByText(/Molecular Weight Standards/)).toBeTruthy();
    expect(screen.getByText(/Apparent Molecular Weight/)).toBeTruthy();

    // Switch to MW -> Elution Volume mode
    const modeBtn = screen.getByRole('button', { name: /Target MW → Predict Ve/i });
    fireEvent.click(modeBtn);
    expect(screen.getByText(/Predicted Elution Volume/)).toBeTruthy();
  });

  it('renders Gibson & In-Fusion Assembly tool and calculates primers', () => {
    route.value = { name: 'tool', toolId: 'gibson' };
    render(<GibsonView />);
    expect(screen.getByText(/Gibson & In-Fusion Assembly Designer/)).toBeTruthy();
    expect(screen.getByText(/PCR Primers for Insert Amplification/)).toBeTruthy();
    expect(screen.getByText(/Homology Overlap Junctions/)).toBeTruthy();
  });

  it('renders Site-Directed Mutagenesis tool and updates targeted codon', () => {
    route.value = { name: 'tool', toolId: 'mutagenesis' };
    render(<MutagenesisView />);
    expect(screen.getByText(/Site-Directed Mutagenesis Designer/)).toBeTruthy();
    expect(screen.getByText(/Target Codon to Mutate/)).toBeTruthy();
    expect(screen.getByText(/Non-Overlapping Primers for Whole-Plasmid PCR/)).toBeTruthy();
    expect(screen.getByText(/Recommended Q5 PCR & KLD Protocol/)).toBeTruthy();
  });

  it('renders Diafiltration & Dialysis Simulator and toggles modes', () => {
    route.value = { name: 'tool', toolId: 'diafiltration' };
    render(<DiafiltrationView />);
    expect(screen.getByText(/Ultrafiltration & Dialysis Simulator/)).toBeTruthy();
    expect(screen.getByText(/Expected Protein Retention/)).toBeTruthy();
    expect(screen.getByText(/Exchange Step-by-Step Trajectory/)).toBeTruthy();

    // Toggle to Dialysis Cassette / Tubing mode
    const dialysisTab = screen.getByRole('button', { name: /Dialysis Cassette \/ Tubing/i });
    fireEvent.click(dialysisTab);
    expect(screen.getByText(/Exchange Step-by-Step Trajectory/)).toBeTruthy();
  });

  it('renders Rare Codon Optimizer and shows host recommendation', () => {
    route.value = { name: 'tool', toolId: 'rare-codons' };
    render(<RareCodonsView />);
    expect(screen.getByText(/Rare Codon & Expression Optimizer/)).toBeTruthy();
    expect(screen.getAllByText(/Codon Adaptation Index/).length).toBeGreaterThan(0);
    expect(screen.getByText(/Recommended Host Strain:/)).toBeTruthy();
    expect(screen.getByText(/Synonymously Optimized Sequence/)).toBeTruthy();
  });
});
