import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/preact';
import CurveFittingView from '@/tools/fitting/View';
import { route } from '@/app/router';

describe('Curve Fitting Tool View', () => {
  it('renders Curve Fitting with default 4PL dose-response fit', () => {
    route.value = { name: 'tool', toolId: 'fitting' };
    render(<CurveFittingView />);
    expect(screen.getByText(/Curve Fitting & Regression/)).toBeTruthy();
    expect(screen.getByTestId('r2-stat')).toBeTruthy();
    expect(screen.getByTestId('param-EC50 / IC50')).toBeTruthy();
  });

  it('switches between models and updates parameters', () => {
    route.value = { name: 'tool', toolId: 'fitting' };
    render(<CurveFittingView />);

    // Click BSA Standard Curve example
    const bsaPreset = screen.getByText(/BSA Standard Curve/);
    fireEvent.click(bsaPreset);

    // Switch model to linear
    const select = screen.getByLabelText(/Regression Model/);
    fireEvent.change(select, { target: { value: 'linear' } });

    expect(screen.getByTestId('param-m')).toBeTruthy();
    expect(screen.getByTestId('param-b')).toBeTruthy();
  });

  it('handles multi-replicate data with error bars', () => {
    route.value = { name: 'tool', toolId: 'fitting' };
    render(<CurveFittingView />);

    const textarea = screen.getByLabelText(/Tabular Data/);
    fireEvent.input(textarea, {
      target: {
        value: `
          1\t10\t12\t11
          2\t20\t22\t21
          3\t30\t31\t29
          4\t40\t42\t39
        `,
      },
    });

    const select = screen.getByLabelText(/Regression Model/);
    fireEvent.change(select, { target: { value: 'linear' } });

    expect(screen.getByTestId('r2-stat')).toBeTruthy();
  });
});
