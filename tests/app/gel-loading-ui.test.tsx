import { render, screen, fireEvent } from '@testing-library/preact';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import GelView from '@/tools/gel/View';
import { route } from '@/app/router';

describe('Gel Analysis Advanced Features & Loading Comparison', () => {
  beforeEach(() => {
    window.alert = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('supports Whole-Lane Loading Comparison (Ponceau S mode) and TPN factors', async () => {
    route.value = { name: 'tool', toolId: 'gel' };
    render(<GelView />);

    // Switch to Tab 3 (Band Quantification)
    const quantTab = screen.getByRole('button', { name: /Band Quantification & Amounts/i });
    fireEvent.click(quantTab);

    // Switch to Line Loading (Ponceau S) subview
    const loadingSubTab = screen.getByRole('button', { name: /Line Loading \(Ponceau S\)/i });
    fireEvent.click(loadingSubTab);

    // Check loading dashboard elements
    expect(screen.getByText(/Mean Whole-Lane Signal/i)).toBeTruthy();
    expect(screen.getByText(/Loading Variation \(CV%\)/i)).toBeTruthy();
    expect(screen.getAllByText(/Total Protein Normalization/i).length).toBeGreaterThan(0);

    // Verify TPN factor column is rendered
    expect(screen.getAllByText(/TPN Factor/i).length).toBeGreaterThan(0);

    // Export Loading CSV button exists
    const exportLoadingBtn = screen.getByRole('button', { name: /Export Loading CSV/i });
    expect(exportLoadingBtn).toBeTruthy();
    fireEvent.click(exportLoadingBtn);
  });

  it('supports toggling between Unified Table and Strips & Tables cards view', async () => {
    route.value = { name: 'tool', toolId: 'gel' };
    render(<GelView />);

    // Switch to Tab 3
    const quantTab = screen.getByRole('button', { name: /Band Quantification & Amounts/i });
    fireEvent.click(quantTab);

    // Toggle to Strips & Tables cards view
    const cardsBtn = screen.getByRole('button', { name: /Strips & Tables/i });
    fireEvent.click(cardsBtn);

    // Check that extracted strip titles appear
    expect(screen.getAllByText(/Extracted Physical Lane Strip & Band Position:/i).length).toBeGreaterThan(0);

    // Toggle back to Unified Table
    const tableBtn = screen.getByRole('button', { name: /Unified Table/i });
    fireEvent.click(tableBtn);
    expect(screen.getByText(/Net Intensity \(Amount\)/i)).toBeTruthy();
  });

  it('supports Shift+Click to quickly add a new line/lane on the gel canvas', async () => {
    route.value = { name: 'tool', toolId: 'gel' };
    render(<GelView />);

    const canvas = screen.getByTitle(/Click or drag lanes/i);
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

    const initialLanesCount = screen.getAllByRole('button', { name: /^L\d+/i }).length;

    // Shift+Click on canvas
    fireEvent.mouseDown(canvas, { clientX: 250, clientY: 200, shiftKey: true });

    // Lane count should have increased
    const afterLanesCount = screen.getAllByRole('button', { name: /^L\d+/i }).length;
    expect(afterLanesCount).toBe(initialLanesCount + 1);
  });

  it('supports Grid from Placed lanes button', async () => {
    route.value = { name: 'tool', toolId: 'gel' };
    render(<GelView />);

    const gridBtn = screen.getByRole('button', { name: /Grid from Placed/i });
    expect(gridBtn).toBeTruthy();
    expect((gridBtn as HTMLButtonElement).disabled).toBe(false);

    fireEvent.click(gridBtn);
    expect(screen.getByText(/demo_gel\.png/i)).toBeTruthy();
  });

  it('allows clicking Profile SVG to add a band and removing via badge beneath image', async () => {
    route.value = { name: 'tool', toolId: 'gel' };
    render(<GelView />);

    // Check profile SVG
    const profileSvg = document.querySelector('svg.cursor-crosshair');
    expect(profileSvg).toBeTruthy();

    if (profileSvg) {
      profileSvg.getBoundingClientRect = () => ({
        left: 0,
        top: 0,
        right: 500,
        bottom: 320,
        width: 500,
        height: 320,
        x: 0,
        y: 0,
        toJSON: () => {},
      });

      // Click on SVG to add band at x=250, y=100
      fireEvent.click(profileSvg, { clientX: 250, clientY: 100 });
    }

    // Check that explicit remove buttons exist beneath gel image or in SVG
    const gelRemoveButtons = screen.getAllByTitle(/Remove Band #/i);
    expect(gelRemoveButtons.length).toBeGreaterThan(0);

    const initialBtnCount = gelRemoveButtons.length;
    fireEvent.click(gelRemoveButtons[0]!);

    const afterBtnCount = screen.getAllByTitle(/Remove Band #/i).length;
    expect(afterBtnCount).toBeLessThan(initialBtnCount);
  });

  it('supports adjusting Display clipping (min/max clip) and gamma sliders', async () => {
    route.value = { name: 'tool', toolId: 'gel' };
    render(<GelView />);

    // Open Display Adjustments details
    const displaySummary = screen.getByText(/Display Adjustments/i);
    fireEvent.click(displaySummary);

    // Verify sliders exist
    expect(screen.getByText(/Min Contrast Clip \(Black Level\)/i)).toBeTruthy();
    expect(screen.getByText(/Max Contrast Clip \(White Level\)/i)).toBeTruthy();
    expect(screen.getByText(/Gamma Curve/i)).toBeTruthy();

    // Click Reset Display button
    const resetDisplayBtn = screen.getByRole('button', { name: /Reset Display/i });
    expect(resetDisplayBtn).toBeTruthy();
    fireEvent.click(resetDisplayBtn);
  });
});
