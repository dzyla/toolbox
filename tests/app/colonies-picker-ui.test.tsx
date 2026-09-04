import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/preact';
import ColoniesView from '@/tools/colonies/View';
import { route } from '@/app/router';

describe('ColoniesView UI & Colony Picker', () => {
  it('renders colony counter with SI metrics and preset dish buttons', () => {
    route.value = { name: 'tool', toolId: 'colonies' };
    render(<ColoniesView />);

    expect(screen.getByText(/Automated Colony Counter/)).toBeTruthy();
    expect(screen.getByTestId('colony-count')).toBeTruthy();
    expect(screen.getByTestId('colony-density')).toBeTruthy();
    expect(screen.getByTestId('colony-diameter')).toBeTruthy();
    expect(screen.getByTestId('cfu-ml')).toBeTruthy();

    // Verify SI calibration card is rendered
    expect(screen.getByText(/Petri Dish & SI Calibration/)).toBeTruthy();
    expect(screen.getByRole('button', { name: /90 mm/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /100 mm/i })).toBeTruthy();

    // Verify interaction mode buttons are present
    expect(screen.getByRole('button', { name: /Pick \/ Inspect/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Add Pin/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Remove Pin/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Load Bundled Example Plate/i })).toBeTruthy();
  });

  it('switches petri dish diameter preset and updates plating density', () => {
    route.value = { name: 'tool', toolId: 'colonies' };
    render(<ColoniesView />);

    const btn150 = screen.getByRole('button', { name: /150 mm/i });
    fireEvent.click(btn150);

    // 150 mm dish has area ~176.7 cm²
    expect(screen.getByText(/176.7 cm²/)).toBeTruthy();
  });

  it('allows switching interaction modes between pick, add, and remove', () => {
    route.value = { name: 'tool', toolId: 'colonies' };
    render(<ColoniesView />);

    const addBtn = screen.getByRole('button', { name: /Add Pin/i });
    fireEvent.click(addBtn);
    expect(screen.getByText(/Click anywhere on the plate to add a manual pin/i)).toBeTruthy();

    const removeBtn = screen.getByRole('button', { name: /Remove Pin/i });
    fireEvent.click(removeBtn);
    expect(screen.getByText(/Click any colony to remove it from the plate/i)).toBeTruthy();

    const pickBtn = screen.getByRole('button', { name: /Pick \/ Inspect/i });
    fireEvent.click(pickBtn);
    expect(screen.getByText(/Click any colony on the plate to pick\/inspect physical dimensions/i)).toBeTruthy();
  });
});
