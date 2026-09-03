import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/preact';
import HemocytometerView from '@/tools/hemocytometer/View';
import CultureView from '@/tools/culture/View';
import TallyView from '@/tools/tally/View';
import ColoniesView from '@/tools/colonies/View';
import PlateView from '@/tools/plate/View';
import MeasureView from '@/tools/measure/View';
import TimersView from '@/tools/timers/View';
import ProtocolsView from '@/tools/protocols/View';
import { route } from '@/app/router';

describe('Newly Introduced Laboratory Tools Views', () => {
  it('renders Hemocytometer tool and updates counts', () => {
    route.value = { name: 'tool', toolId: 'hemocytometer' };
    render(<HemocytometerView />);
    expect(screen.getByText(/Hemocytometer & Cell Viability/)).toBeTruthy();
    expect(screen.getByTestId('live-density')).toBeTruthy();
    expect(screen.getByTestId('viability')).toBeTruthy();
  });

  it('renders Cell Culture passaging and doubling time modes', () => {
    route.value = { name: 'tool', toolId: 'culture' };
    render(<CultureView />);
    expect(screen.getByText(/Cell Culture & Passaging/)).toBeTruthy();
    expect(screen.getByTestId('suspension-vol')).toBeTruthy();

    const doublingBtn = screen.getByRole('button', { name: /Doubling Time & Growth/ });
    fireEvent.click(doublingBtn);
    expect(screen.getByTestId('doubling-time')).toBeTruthy();
  });

  it('renders Tally Counter and increments counts', () => {
    route.value = { name: 'tool', toolId: 'tally' };
    render(<TallyView />);
    expect(screen.getByText(/Tally Counter/)).toBeTruthy();
    expect(screen.getByTestId('total-count')).toBeTruthy();
    expect(screen.getByTestId('count-0')).toBeTruthy();
  });

  it('renders Colony Counter and displays CFU estimate', () => {
    route.value = { name: 'tool', toolId: 'colonies' };
    render(<ColoniesView />);
    expect(screen.getByText(/Colony & Object Counter/)).toBeTruthy();
    expect(screen.getByTestId('colony-count')).toBeTruthy();
    expect(screen.getByTestId('cfu-ml')).toBeTruthy();
  });

  it('renders Plate Layout designer in 96-well and 384-well formats', () => {
    route.value = { name: 'tool', toolId: 'plate' };
    render(<PlateView />);
    expect(screen.getByText(/Plate Layout Designer/)).toBeTruthy();
    expect(screen.getByText(/96-Well Plate Grid/)).toBeTruthy();

    const btn384 = screen.getByRole('button', { name: /384 Wells/ });
    fireEvent.click(btn384);
    expect(screen.getByText(/384-Well Plate Grid/)).toBeTruthy();
  });

  it('renders Image Measurer tool', () => {
    route.value = { name: 'tool', toolId: 'measure' };
    render(<MeasureView />);
    expect(screen.getByText(/Image Measurer & Scale Calibration/)).toBeTruthy();
  });

  it('renders Lab Timers and Stopwatch', () => {
    route.value = { name: 'tool', toolId: 'timers' };
    render(<TimersView />);
    expect(screen.getByText(/Lab Timers & Stopwatch/)).toBeTruthy();

    const swBtn = screen.getByRole('button', { name: /Stopwatch/ });
    fireEvent.click(swBtn);
    expect(screen.getByRole('button', { name: /Start/ })).toBeTruthy();
  });

  it('renders Protocols SOP checklist with bundled protocols', () => {
    route.value = { name: 'tool', toolId: 'protocols' };
    render(<ProtocolsView />);
    expect(screen.getByText(/Lab Protocols & SOPs/)).toBeTruthy();
    expect(screen.getByTestId('progress-text')).toBeTruthy();
    expect(screen.getAllByText(/Plasmid DNA Miniprep/).length).toBeGreaterThan(0);
  });
});
