import { fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { describe, expect, it } from 'vitest';
import { route } from '@/app/router';
import { encodeState } from '@/lib/url-state';
import TagsView from '@/tools/tags/View';

describe('Tag Library & Protease Cleavage Simulator UI (tools/tags/View)', () => {
  it('renders the cleavage simulator with default His6-TEV-GFP construct', async () => {
    route.value = { name: 'tool', toolId: 'tags' };
    render(<TagsView />);

    // Title and layout
    expect(screen.getByRole('heading', { level: 1, name: /Tag Library & Protease Cleavage Simulator/i })).toBeTruthy();

    // Key metrics tiles
    expect(screen.getByText('Intact Fusion')).toBeTruthy();
    expect(screen.getByText('Pure Target Protein')).toBeTruthy();
    expect(screen.getByText('Cut Affinity Tag')).toBeTruthy();

    // Virtual SDS-PAGE lanes
    expect(screen.getByText(/Virtual SDS-PAGE Lane Mobility Preview/)).toBeTruthy();
    expect(screen.getByText('Ladder')).toBeTruthy();
    expect(screen.getAllByText('Intact').length).toBeGreaterThan(0);
    expect(screen.getByText('Cleaved')).toBeTruthy();
    expect(screen.getByText('Flow-Thru')).toBeTruthy();
    expect(screen.getByText('Resin Bound')).toBeTruthy();

    // Sequence junction marker
    expect(screen.getByText(/Sequence Map & Cleavage Junction Marker/)).toBeTruthy();
    expect(screen.getAllByText(/✂/).length).toBeGreaterThan(0);

    // Subtractive depletion card
    expect(screen.getByText(/Subtractive Affinity Chromatography Depletion/)).toBeTruthy();
    expect(screen.getByText('BOUND TO RESIN (Depleted)')).toBeTruthy();
    expect(screen.getByText('FLOW-THROUGH (Purified Target)')).toBeTruthy();

    // Fragment table
    expect(screen.getByText(/Fragment Physicochemical Properties/)).toBeTruthy();

    // Science panel
    expect(screen.getByText(/Science: Tag Library & Protease Cleavage Simulator/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Copy result' })).toBeTruthy();
  });

  it('switches between presets and updates cleavage simulation', async () => {
    route.value = { name: 'tool', toolId: 'tags' };
    render(<TagsView />);

    // Click on SUMO-Ulp1 preset
    const sumoPresetBtn = screen.getByRole('button', { name: /His6–SUMO–GFP/i });
    fireEvent.click(sumoPresetBtn);

    await waitFor(() => {
      // SUMO leaves authentic native N-terminus (zero scar)
      expect(screen.getAllByText(/Scar: None/i).length).toBeGreaterThan(0);
    });
  });

  it('navigates to Construct Builder and Tag Library tabs', async () => {
    route.value = { name: 'tool', toolId: 'tags' };
    render(<TagsView />);

    // Navigate to Construct Builder
    fireEvent.click(screen.getByRole('button', { name: /Construct Builder/i }));
    expect(screen.getByText(/Assemble Fusion Construct/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /Assemble & Load into Simulator/i })).toBeTruthy();

    // Navigate to Tag Library
    fireEvent.click(screen.getByRole('button', { name: /Tag & Protease Library/i }));
    expect(screen.getByText(/6xHis Tag \(Hexahistidine\)/i)).toBeTruthy();
    expect(screen.getByText(/Glutathione S-Transferase/i)).toBeTruthy();
    expect(screen.getByText(/Maltose-Binding Protein/i)).toBeTruthy();
  });

  it('configures SUMO for scarless N-terminal Ulp1 cleavage in the builder', async () => {
    route.value = { name: 'tool', toolId: 'tags' };
    render(<TagsView />);

    fireEvent.click(screen.getByRole('button', { name: /Construct Builder/i }));
    const [tagSelect, proteaseSelect, orientationSelect] = screen.getAllByRole('combobox') as HTMLSelectElement[];
    const linkerInput = screen.getByRole('textbox', { name: /Linker Sequence/i }) as HTMLInputElement;

    fireEvent.change(tagSelect!, { target: { value: 'sumo' } });

    expect(proteaseSelect!.value).toBe('ulp1');
    expect(orientationSelect!.value).toBe('N-term');
    expect(linkerInput.value).toBe('');
    expect([...proteaseSelect!.options].map(option => option.value)).toEqual(['ulp1']);
    expect(orientationSelect!.querySelector('option[value="C-term"]')).toHaveProperty('disabled', true);
    expect(linkerInput.disabled).toBe(true);
  });

  it('normalizes incompatible SUMO options from an existing shared builder link', () => {
    route.value = {
      name: 'tool',
      toolId: 'tags',
      state: encodeState({
        tab: 'builder',
        builderTag: 'sumo',
        builderProtease: 'tev',
        builderOrientation: 'C-term',
        builderLinker: 'SSG',
      }),
    };
    render(<TagsView />);

    expect((screen.getByRole('combobox', { name: /Protease Cleavage Site/i }) as HTMLSelectElement).value).toBe('ulp1');
    expect((screen.getByRole('combobox', { name: /Tag Orientation/i }) as HTMLSelectElement).value).toBe('N-term');
    expect((screen.getByRole('textbox', { name: /Linker Sequence/i }) as HTMLInputElement).value).toBe('');
  });

  it('toggles virtual gel theme between dark Coomassie and classic blue', async () => {
    route.value = { name: 'tool', toolId: 'tags' };
    render(<TagsView />);

    const classicBtn = screen.getByRole('button', { name: 'Classic Blue' });
    fireEvent.click(classicBtn);

    const darkBtn = screen.getByRole('button', { name: 'Coomassie Dark' });
    fireEvent.click(darkBtn);
  });
});
