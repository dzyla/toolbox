import { render, screen, fireEvent } from '@testing-library/preact';
import { describe, it, expect } from 'vitest';
import CryoEmView from '@/tools/cryoem/View';
import { route } from '@/app/router';

describe('Cryo-EM / NS MRC Viewer UI', () => {
  it('navigates to 2D Classes & 3D Volume tab with example 2D classes and without ribosome text', async () => {
    route.value = { name: 'tool', toolId: 'cryoem' };
    render(<CryoEmView />);

    const classesTabBtn = screen.getByRole('button', { name: /2D Classes & 3D Volume/i });
    fireEvent.click(classesTabBtn);

    expect(await screen.findByTestId('cryo-classes-result')).toBeTruthy();

    // Verify Demo 2D button does NOT say Ribosome
    const demoBtn = screen.getByRole('button', { name: /Demo 2D Classes/i });
    expect(demoBtn).toBeTruthy();
    expect(demoBtn.textContent).not.toMatch(/ribosome/i);
    expect(demoBtn.textContent).toMatch(/Example 2D/i);

    // Verify negative stain vs cryo-em sidebar guidance
    expect(screen.getByText(/Negative Stain vs\. Cryo-EM/i)).toBeTruthy();
  });

  it('supports publication export settings with column selection and numbering checkbox', async () => {
    route.value = { name: 'tool', toolId: 'cryoem' };
    render(<CryoEmView />);

    fireEvent.click(screen.getByRole('button', { name: /2D Classes & 3D Volume/i }));
    expect(await screen.findByTestId('cryo-classes-result')).toBeTruthy();

    // Open export options drawer
    const exportOptionsBtn = screen.getByRole('button', { name: /Export Options/i });
    fireEvent.click(exportOptionsBtn);

    // Verify numbering toggle exists
    const numberCheck = screen.getByLabelText(/Add class numbers/i) as HTMLInputElement;
    expect(numberCheck).toBeTruthy();
    expect(numberCheck.checked).toBe(true);
    fireEvent.click(numberCheck);
    expect(numberCheck.checked).toBe(false);

    // Verify output columns selector exists
    const colSelect = screen.getByRole('combobox', { name: /Output columns/i }) as HTMLSelectElement;
    expect(colSelect).toBeTruthy();
    fireEvent.change(colSelect, { target: { value: '3' } });
    expect(colSelect.value).toBe('3');

    // Verify on-screen card numbering toggle
    const onScreenNumToggle = screen.getByLabelText(/Show # on cards/i) as HTMLInputElement;
    expect(onScreenNumToggle).toBeTruthy();
    expect(onScreenNumToggle.checked).toBe(true);
    fireEvent.click(onScreenNumToggle);
    expect(onScreenNumToggle.checked).toBe(false);
  });

  it('supports 3D Maximum Intensity Projection (MIP) mode', async () => {
    route.value = { name: 'tool', toolId: 'cryoem' };
    render(<CryoEmView />);

    fireEvent.click(screen.getByRole('button', { name: /2D Classes & 3D Volume/i }));
    expect(await screen.findByTestId('cryo-classes-result')).toBeTruthy();

    // Load 3D volume
    fireEvent.click(screen.getByRole('button', { name: /Demo 3D Volume/i }));

    // Switch to MIP mode
    const mipBtn = screen.getByRole('button', { name: /3D Maximum Projection/i });
    fireEvent.click(mipBtn);

    expect(await screen.findByText(/3D Maximum Intensity Projection \(MIP\)/i)).toBeTruthy();
    expect(screen.getByText(/XY Plane \(Axial\)/i)).toBeTruthy();
    expect(screen.getByText(/XZ Plane \(Coronal\)/i)).toBeTruthy();
    expect(screen.getByText(/YZ Plane \(Sagittal\)/i)).toBeTruthy();

    // Switch plane to XY (Axial)
    const xyPlaneBtn = screen.getByRole('button', { name: 'XY (Axial)' });
    fireEvent.click(xyPlaneBtn);
    expect(screen.getByText(/Maximum Intensity Projection: XY Plane/i)).toBeTruthy();

    // Switch to Sub-volume Slab Range
    const slabRadio = screen.getByLabelText(/Sub-volume Slab Range/i);
    fireEvent.click(slabRadio);
    expect(screen.getByText(/Slab Start Slice/i)).toBeTruthy();
    expect(screen.getByText(/Slab End Slice/i)).toBeTruthy();

    // Export MIP button is present
    expect(screen.getByRole('button', { name: /Export Maximum Projection/i })).toBeTruthy();
  });

  it('supports contrast presets including Negative Stain (NS) inversion', async () => {
    route.value = { name: 'tool', toolId: 'cryoem' };
    render(<CryoEmView />);

    fireEvent.click(screen.getByRole('button', { name: /2D Classes & 3D Volume/i }));
    expect(await screen.findByTestId('cryo-classes-result')).toBeTruthy();

    const invertCheck = screen.getByLabelText(/Invert Contrast/i) as HTMLInputElement;
    expect(invertCheck.checked).toBe(false);

    // Apply NS preset
    const nsPresetBtn = screen.getByRole('button', { name: /NS \(Invert\)/i });
    fireEvent.click(nsPresetBtn);
    expect(invertCheck.checked).toBe(true);

    // Apply Cryo-EM preset
    const cryoPresetBtn = screen.getByRole('button', { name: /Cryo-EM/i });
    fireEvent.click(cryoPresetBtn);
    expect(invertCheck.checked).toBe(false);
  });

  it('displays research preview notices advising researcher evaluation', async () => {
    route.value = { name: 'tool', toolId: 'cryoem' };
    render(<CryoEmView />);

    fireEvent.click(screen.getByRole('button', { name: /2D Classes & 3D Volume/i }));
    expect(await screen.findByTestId('cryo-classes-result')).toBeTruthy();

    // Verify Research Preview badges and text
    const previewBadges = screen.getAllByText(/Research Preview/i);
    expect(previewBadges.length).toBeGreaterThanOrEqual(1);

    // Verify warning that outputs should be evaluated by a researcher before actual work
    const evaluationNotices = screen.getAllByText(/evaluated by a researcher before/i);
    expect(evaluationNotices.length).toBeGreaterThanOrEqual(1);
  });
});
