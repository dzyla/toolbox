import { render, screen, fireEvent } from '@testing-library/preact';
import { describe, it, expect } from 'vitest';
import CryoEmView from '@/tools/cryoem/View';
import NucleicView from '@/tools/nucleic/View';
import SequenceView from '@/tools/sequence/View';
import { route } from '@/app/router';

describe('Cryo-EM tool', () => {
  it('renders box sizing and sampling calculations', async () => {
    route.value = { name: 'tool', toolId: 'cryoem' };
    render(<CryoEmView />);
    expect(await screen.findByText(/Cryo-EM Geometry & Dose/)).toBeTruthy();
    expect(screen.getByTestId('cryo-box-result')).toBeTruthy();
    expect(screen.getByText(/Raw Nyquist/)).toBeTruthy();
    expect(screen.getByText(/Binned Nyquist/)).toBeTruthy();
  });

  it('switches to dose and magnification tabs', async () => {
    route.value = { name: 'tool', toolId: 'cryoem' };
    render(<CryoEmView />);
    fireEvent.click(screen.getByRole('button', { name: 'Dose Calculator' }));
    expect(await screen.findByTestId('cryo-dose-result')).toBeTruthy();
    expect(screen.getByText(/Total Dose/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Magnification' }));
    expect(await screen.findByTestId('cryo-mag-result')).toBeTruthy();
    expect(screen.getByText(/Calibrated Pixel Size/)).toBeTruthy();
  });
});

describe('Nucleic Acids tool', () => {
  it('renders conversions, a260, copy number and tm', async () => {
    route.value = { name: 'tool', toolId: 'nucleic' };
    render(<NucleicView />);
    expect(await screen.findByText(/Nucleic Acids Calculator/)).toBeTruthy();
    expect(screen.getByTestId('nucleic-convert-result')).toBeTruthy();
    expect(screen.getByText(/Molar Concentration/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'A260 Quantification' }));
    expect(await screen.findByTestId('nucleic-a260-result')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Melting Temp (Tm)' }));
    expect(await screen.findByTestId('nucleic-tm-result')).toBeTruthy();
    expect(screen.getByText(/Nearest-Neighbour Tm/)).toBeTruthy();
  });
});

describe('Sequence Viewer & Analysis tool', () => {
  it('renders sequence analysis and translation', async () => {
    route.value = { name: 'tool', toolId: 'sequence' };
    render(<SequenceView />);
    expect(await screen.findByText(/Sequence Viewer & Analysis/)).toBeTruthy();
    expect(screen.getByTestId('sequence-overview-result')).toBeTruthy();
    expect(screen.getByText(/Detected Type/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '6-Frame Translation' }));
    expect(await screen.findByTestId('sequence-translation-result')).toBeTruthy();
    expect(screen.getByText(/Frame \+1/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'ORFs' }));
    expect(await screen.findByTestId('sequence-orfs-result')).toBeTruthy();
  });
});
