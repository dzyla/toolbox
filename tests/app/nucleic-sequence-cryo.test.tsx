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

  it('accepts float values for dose, time, and pixel size', async () => {
    route.value = { name: 'tool', toolId: 'cryoem' };
    render(<CryoEmView />);
    fireEvent.click(screen.getByRole('button', { name: 'Dose Calculator' }));

    const pixelInput = screen.getByLabelText(/Pixel Size/);
    fireEvent.input(pixelInput, { target: { value: '0.832' } });

    const timeInput = screen.getByLabelText(/Total Exposure/);
    fireEvent.input(timeInput, { target: { value: '2.5' } });

    const doseInput = screen.getByLabelText(/Target Desired Dose/);
    fireEvent.input(doseInput, { target: { value: '42.5' } });

    expect(screen.getByText(/Total Dose/)).toBeTruthy();
  });

  it('allows keystroke entry of float exposure 2.3 s without resetting decimal point', async () => {
    route.value = { name: 'tool', toolId: 'cryoem' };
    render(<CryoEmView />);
    fireEvent.click(screen.getByRole('button', { name: 'Dose Calculator' }));

    const timeInput = screen.getByLabelText(/Total Exposure/) as HTMLInputElement;

    // Simulate typing "2", then "2.", then "2.3"
    fireEvent.input(timeInput, { target: { value: '2' } });
    expect(timeInput.value).toBe('2');

    fireEvent.input(timeInput, { target: { value: '2.' } });
    expect(timeInput.value).toBe('2.');

    fireEvent.input(timeInput, { target: { value: '2.3' } });
    expect(timeInput.value).toBe('2.3');

    // 15 * 2.3 / (0.83^2) ≈ 50.1 e⁻/Å²
    expect(screen.getByText('50.1')).toBeTruthy();
  });

  it('renders CTF tab, Thon rings, and diffraction artifact selection', async () => {
    route.value = { name: 'tool', toolId: 'cryoem' };
    render(<CryoEmView />);

    fireEvent.click(screen.getByRole('button', { name: /CTF & Thon Rings/ }));
    expect(await screen.findByTestId('cryo-ctf-result')).toBeTruthy();
    expect(screen.getAllByText(/First CTF Zero/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/Simulated 2D Power Spectrum/)).toBeTruthy();

    const artifactSelect = screen.getByLabelText(/Diffraction Artifact/) as HTMLSelectElement;
    expect(artifactSelect).toBeTruthy();
    fireEvent.change(artifactSelect, { target: { value: 'ice' } });
    expect((await screen.findAllByText(/Crystalline Ice Rings/)).length).toBeGreaterThanOrEqual(1);
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
