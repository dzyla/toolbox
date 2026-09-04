import { render, screen, fireEvent } from '@testing-library/preact';
import { describe, it, expect } from 'vitest';
import GelView from '@/tools/gel/View';
import { route } from '@/app/router';

describe('Gel and Blot analysis tool view', () => {
  it('renders gel tool with default demo gel and quantification table', async () => {
    route.value = { name: 'tool', toolId: 'gel' };
    render(<GelView />);

    expect(await screen.findByText(/Gel & Blot Analysis/)).toBeTruthy();
    expect(screen.getByText(/Image Source/)).toBeTruthy();
    expect(screen.getByText(/Molecular Weight Calibration/)).toBeTruthy();
    expect(screen.getByText(/Densitometry Profile/)).toBeTruthy();
    expect(screen.getByText(/Band Quantification/)).toBeTruthy();
  });

  it('allows clicking Auto-Find Lanes and Reload Demo Gel', async () => {
    route.value = { name: 'tool', toolId: 'gel' };
    render(<GelView />);

    const autoFindBtn = screen.getByRole('button', { name: 'Auto-Find Lanes' });
    fireEvent.click(autoFindBtn);

    const demoBtn = screen.getByRole('button', { name: 'Load Demo Gel' });
    fireEvent.click(demoBtn);

    expect(screen.getByText(/demo_gel\.png/)).toBeTruthy();
  });

  it('switches views to MW calibration curve and all-lanes quantification table', async () => {
    route.value = { name: 'tool', toolId: 'gel' };
    render(<GelView />);

    // Switch to MW Calibration Curve
    const calTab = screen.getByRole('button', { name: /MW Calibration Curve/ });
    fireEvent.click(calTab);
    expect(screen.getByText(/Molecular Weight Calibration Curve/)).toBeTruthy();
    expect(screen.getByText(/Migration Distance Y along Lane/)).toBeTruthy();

    // Switch to All-Lanes Band Quantification
    const quantTab = screen.getByRole('button', { name: /Band Quantification & Amounts/ });
    fireEvent.click(quantTab);
    expect(screen.getByText(/Net Intensity \(Amount\)/)).toBeTruthy();
    expect(screen.getAllByRole('button', { name: /Export All Lanes CSV/ }).length).toBeGreaterThan(0);
  });

  it('selects lane and adds/removes bands when canvas is clicked', async () => {
    route.value = { name: 'tool', toolId: 'gel' };
    render(<GelView />);

    const canvas = screen.getByTitle(/Click or drag lanes/);
    expect(canvas).toBeTruthy();

    // Mock getBoundingClientRect
    canvas.getBoundingClientRect = () => ({
      left: 0,
      top: 0,
      right: 400,
      bottom: 500,
      width: 400,
      height: 500,
      x: 0,
      y: 0,
      toJSON: () => {},
    });

    // Click to select lane or add band
    fireEvent.mouseDown(canvas, { clientX: 200, clientY: 250 });
    fireEvent.mouseUp(canvas, { clientX: 200, clientY: 250 });
    expect(await screen.findByText(/Densitometry Profile/)).toBeTruthy();

    // Ctrl+click to test remove band
    fireEvent.mouseDown(canvas, { clientX: 200, clientY: 250, ctrlKey: true });
    fireEvent.mouseUp(canvas, { clientX: 200, clientY: 250, ctrlKey: true });
    expect(screen.getByText(/Densitometry Profile/)).toBeTruthy();
  });

  it('supports rotating, flipping, and exporting annotated gel', async () => {
    route.value = { name: 'tool', toolId: 'gel' };
    render(<GelView />);

    // Rotate 90
    const rotBtn = screen.getByTitle('Rotate 90° Clockwise');
    fireEvent.click(rotBtn);
    expect(screen.getByText(/demo_gel\.png/)).toBeTruthy();

    // Flip H
    const flipBtn = screen.getByTitle('Flip Horizontally (Mirror)');
    fireEvent.click(flipBtn);
    expect(screen.getByText(/demo_gel\.png/)).toBeTruthy();

    // Export annotated gel
    const exportBtn = screen.getByRole('button', { name: /Export Annotated Gel/ });
    expect(exportBtn).toBeTruthy();
    fireEvent.click(exportBtn);
  });

  it('supports WB quantification mode and omitting lane prefix on CSV export', async () => {
    route.value = { name: 'tool', toolId: 'gel' };
    render(<GelView />);

    // Switch to All-Lanes Band Quantification
    const quantTab = screen.getByRole('button', { name: /Band Quantification & Amounts/ });
    fireEvent.click(quantTab);

    // Switch to Target Mass WB Mode
    const wbModeBtn = screen.getByRole('button', { name: /Per Target Mass \(WB Mode\)/ });
    fireEvent.click(wbModeBtn);
    expect(wbModeBtn.classList.contains('bg-accent-600')).toBe(true);

    // Check omit prefix checkbox
    const omitCheckbox = screen.getAllByLabelText(/Omit L1\/L2 prefix/)[0] as HTMLInputElement;
    expect(omitCheckbox.checked).toBe(false);
    fireEvent.click(omitCheckbox);
    expect(omitCheckbox.checked).toBe(true);
  });

  it('supports clearing all lanes and re-detecting them', async () => {
    route.value = { name: 'tool', toolId: 'gel' };
    render(<GelView />);

    const clearBtn = screen.getByRole('button', { name: /Clear All Lanes/ });
    expect(clearBtn).toBeTruthy();
    fireEvent.click(clearBtn);

    // After clearing, 0 lanes
    expect(screen.queryByText(/Active: L1/)).toBeNull();

    // Auto-Find Lanes restores lanes
    const autoFindBtn = screen.getByRole('button', { name: 'Auto-Find Lanes' });
    fireEvent.click(autoFindBtn);
    expect(await screen.findByText(/Active: L1/)).toBeTruthy();
  });

  it('renders lane strip, detected peaks table, and supports removing peak row', async () => {
    route.value = { name: 'tool', toolId: 'gel' };
    render(<GelView />);

    // Physical lane strip text should be present in the SVG
    expect(screen.getByText(/PHYSICAL LANE STRIP/)).toBeTruthy();

    // Peak table with remove button
    const removeButtons = screen.getAllByRole('button', { name: /Remove/ });
    expect(removeButtons.length).toBeGreaterThan(0);

    const initialRemoveCount = removeButtons.length;
    fireEvent.click(removeButtons[0]!);

    // Should remove one peak row
    const afterRemoveButtons = screen.queryAllByRole('button', { name: /Remove/ });
    expect(afterRemoveButtons.length).toBe(initialRemoveCount - 1);
  });

  it('supports Bio-Rad ladders and creating custom user ladders', async () => {
    route.value = { name: 'tool', toolId: 'gel' };
    render(<GelView />);

    // Check Bio-Rad ladder exists in options
    expect(screen.getByText(/Precision Plus Protein Kaleidoscope/)).toBeTruthy();
    expect(screen.getByText(/1 kb Plus DNA Ladder \(EZ Load\)/)).toBeTruthy();

    // Open custom ladder modal
    const openCustomBtn = screen.getByText(/Upload \/ Custom Ladder/);
    fireEvent.click(openCustomBtn);

    expect(screen.getByText(/Create \/ Upload Custom Ladder/)).toBeTruthy();
    const nameInput = screen.getByPlaceholderText(/Lab Custom Protein Standard/);
    fireEvent.input(nameInput, { target: { value: 'My Test Ladder' } });

    const sizesInput = screen.getByPlaceholderText(/250, 150, 100/);
    fireEvent.input(sizesInput, { target: { value: '200, 100, 50, 25' } });

    const saveBtn = screen.getByRole('button', { name: /Save & Use Ladder/ });
    fireEvent.click(saveBtn);

    // Custom ladder is now available and selected
    expect(screen.getByText(/My Test Ladder/)).toBeTruthy();
  });

  it('allows toggling between Side-by-Side and Large Image Stacked layout', async () => {
    route.value = { name: 'tool', toolId: 'gel' };
    render(<GelView />);

    const stackedBtn = screen.getByRole('button', { name: /Large Image \(Stacked\)/ });
    fireEvent.click(stackedBtn);
    expect(stackedBtn.classList.contains('bg-accent-600')).toBe(true);

    const splitBtn = screen.getByRole('button', { name: /Side-by-Side/ });
    fireEvent.click(splitBtn);
    expect(splitBtn.classList.contains('bg-accent-600')).toBe(true);
  });
});
