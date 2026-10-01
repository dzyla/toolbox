import { render, screen, fireEvent, within } from '@testing-library/preact';
import { describe, it, expect } from 'vitest';
import CryoEmView from '@/tools/cryoem/View';
import { route } from '@/app/router';

function openFsc() {
  route.value = { name: 'tool', toolId: 'cryoem' };
  render(<CryoEmView />);
  fireEvent.click(screen.getByRole('button', { name: /FSC/ }));
}

describe('Cryo-EM FSC tab', () => {
  it('loads the labelled synthetic example and reports resolutions', async () => {
    openFsc();
    fireEvent.click(await screen.findByRole('button', { name: /Load example \(synthetic\)/ }));
    expect(await screen.findByText(/Synthetic example: curves generated/)).toBeTruthy();
    const table = screen.getByRole('table', { name: /FSC resolution at thresholds/ });
    const rows = within(table).getAllByRole('row');
    expect(rows.length).toBe(1 + 3);
    expect(within(rows[1]!).getAllByText(/3\.1\d Å/)[0]).toBeTruthy();
    expect(screen.getByRole('img', { name: /FSC curves versus spatial frequency/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Download table \(CSV\)/ })).toBeTruthy();
  });

  it('parses pasted CSV and shows a readable error for bad text', async () => {
    openFsc();
    const area = await screen.findByLabelText(/Paste FSC data/);
    fireEvent.input(area, { target: { value: 'hello world' } });
    expect((await screen.findByRole('alert')).textContent).toMatch(/No numeric data rows/);
    fireEvent.input(area, { target: { value: 'Resolution (1/A),FSC\n0,1\n0.1,0.9\n0.2,0.4\n0.3,0.05\n' } });
    const table = await screen.findByRole('table', { name: /FSC resolution at thresholds/ });
    expect(within(table).getByText(/^5\.\d\d Å/)).toBeTruthy();
  });

  it('warns at the Nyquist limit when a pixel size is entered', async () => {
    openFsc();
    fireEvent.input(await screen.findByLabelText(/Paste FSC data/), {
      target: { value: 'Resolution (1/A),FSC\n0,1\n0.25,0.9\n0.45,0.5\n0.49,0.05\n0.5,0.0\n' },
    });
    fireEvent.input(screen.getByLabelText(/Pixel size \(Å\/px\)/), { target: { value: '1' } });
    expect((await screen.findAllByText(/Warning: At\/near Nyquist/)).length).toBe(1);
  });
});
