import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/preact';
import CloningHubView from '@/tools/cloning/View';

const downloadText = vi.fn();
vi.mock('@/lib/export', async importOriginal => ({ ...(await importOriginal<typeof import('@/lib/export')>()), downloadText: (...args: unknown[]) => downloadText(...args) }));

const GFP = 'ATGGTGAGCAAGGGCGAGGAGCTGTTCACCGGGGTGGTGCCCATCCTGGTCGAGCTGGACGGCGACGTAAACGGCCACAAGTTCAGCGTGTCCGGCGAGGGCGAGGGCGATGCCACCTACGGCAAGCTGACCCTGAAGTTCATCTGCACCACCGGCAAGCTGCCCGTGCCCTGGCCCACCCTCGTGACCACCCTGACCTACGGCGTGCAGTGCTTCAGCCGCTACCCCGACCACATGAAGCAGCACGACTTCTTCAAGTCCGCCATGCCCGAAGGCTACGTCCAG';

const preview = () => screen.getByRole('region', { name: /^Product preview: / });
const sourceFeatures = () => within(preview()).queryAllByRole('button', { name: /^\d · (pUC19|GFP), / });

describe('colour by source', () => {
  beforeEach(() => {
    downloadText.mockReset();
    location.hash = '#/t/cloning';
    render(<CloningHubView />);
    fireEvent.change(screen.getByLabelText(/Preset vector/), { target: { value: 'puc19' } });
    fireEvent.input(screen.getByLabelText(/Paste FASTA/), { target: { value: `>GFP\n${GFP}` } });
    fireEvent.click(screen.getByRole('button', { name: 'Add pasted sequence' }));
  });
  afterEach(() => { cleanup(); location.hash = ''; });

  it('adds the numbered source regions to the map when on, and removes them when off', () => {
    const toggle = within(preview()).getByRole('checkbox', { name: 'Colour the map and sequence by source' }) as HTMLInputElement;
    expect(toggle.checked).toBe(true);
    expect(sourceFeatures().length).toBeGreaterThanOrEqual(2);
    fireEvent.click(toggle);
    expect(toggle.checked).toBe(false);
    expect(sourceFeatures()).toHaveLength(0);
    fireEvent.click(toggle);
    expect(sourceFeatures().length).toBeGreaterThanOrEqual(2);
  });

  it('never writes the source annotations into the GenBank or FASTA export', () => {
    const exported = (label: string) => { fireEvent.click(within(preview()).getByRole('button', { name: label })); return downloadText.mock.calls.at(-1)![0] as string; };
    for (const on of [true, false]) {
      const toggle = within(preview()).getByRole('checkbox', { name: 'Colour the map and sequence by source' }) as HTMLInputElement;
      if (toggle.checked !== on) fireEvent.click(toggle);
      const genbank = exported('Download GenBank');
      const fasta = exported('Download FASTA');
      expect(genbank).toMatch(/^LOCUS/);
      expect(genbank).not.toMatch(/Source \d: /);
      expect(genbank).not.toMatch(/1 · pUC19|2 · GFP/);
      expect(genbank).not.toContain('#0072B2');
      expect(fasta).toMatch(/^>/);
      expect(fasta).not.toMatch(/Source \d|· /);
    }
  });
});
