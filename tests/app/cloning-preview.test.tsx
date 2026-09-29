import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/preact';
import CloningHubView from '@/tools/cloning/View';
import { restoreDocument } from '@/tools/plasmid/restore';

const saveProject = vi.fn();
vi.mock('@/lib/projects', async importOriginal => ({ ...(await importOriginal<typeof import('@/lib/projects')>()), saveProject: (...args: unknown[]) => saveProject(...args) }));

const GFP = 'ATGGTGAGCAAGGGCGAGGAGCTGTTCACCGGGGTGGTGCCCATCCTGGTCGAGCTGGACGGCGACGTAAACGGCCACAAGTTCAGCGTGTCCGGCGAGGGCGAGGGCGATGCCACCTACGGCAAGCTGACCCTGAAGTTCATCTGCACCACCGGCAAGCTGCCCGTGCCCTGGCCCACCCTCGTGACCACCCTGACCTACGGCGTGCAGTGCTTCAGCCGCTACCCCGACCACATGAAGCAGCACGACTTCTTCAAGTCCGCCATGCCCGAAGGCTACGTCCAG';

function setup() {
  render(<CloningHubView />);
  fireEvent.change(screen.getByLabelText(/Preset vector/), { target: { value: 'puc19' } });
  fireEvent.input(screen.getByLabelText(/Paste FASTA/), { target: { value: `>GFP\n${GFP}` } });
  fireEvent.click(screen.getByRole('button', { name: 'Add pasted sequence' }));
}

const preview = () => screen.getByRole('region', { name: 'Product preview' });
const selection = () => within(preview()).getByTestId('plasmid-selection');

describe('interactive product preview', () => {
  beforeEach(() => { saveProject.mockReset(); saveProject.mockResolvedValue({}); location.hash = '#/t/cloning'; });
  afterEach(() => { cleanup(); location.hash = ''; });

  it('shows a clicked feature in the selection details', () => {
    setup();
    expect(selection().textContent).toContain('No selection');
    fireEvent.click(within(preview()).getAllByRole('button', { name: /, [\d,]+–[\d,]+ bp, (forward|reverse|unstranded) strand$/ })[0]!);
    expect(selection().textContent).not.toMatch(/No selection|Map selection/);
    expect(selection().textContent).toMatch(/\d–\d[\d,]* bp/);
  });

  it('selects a junction range from a mark button', () => {
    setup();
    const mark = within(preview()).getByRole('button', { name: /Junction 1: pUC19 → GFP/ });
    const start = /· ([\d,]+) ·/.exec(mark.textContent!)![1]!;
    fireEvent.click(mark);
    expect(selection().textContent).toContain('Map selection');
    expect(selection().textContent).toContain(`${start}–`);
  });

  it('keeps the sequence collapsed until asked, without a mark forcing it open', () => {
    setup();
    expect(within(preview()).queryByLabelText('Nucleotide sequence')).toBeNull();
    fireEvent.click(within(preview()).getByRole('button', { name: /Junction 1: pUC19 → GFP/ }));
    expect(within(preview()).queryByLabelText('Nucleotide sequence')).toBeNull();
    const toggle = within(preview()).getByRole('button', { name: /Show sequence \([\d,]+ bp\)/ });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(toggle);
    expect(within(preview()).getByLabelText('Nucleotide sequence')).toBeTruthy();
    expect(within(preview()).getByRole('button', { name: /Hide sequence/ }).getAttribute('aria-expanded')).toBe('true');
    expect(within(preview()).getByLabelText('Base 1')).toBeTruthy();
  });

  it('selecting in the open sequence updates the map selection', () => {
    setup();
    fireEvent.click(within(preview()).getByRole('button', { name: /Show sequence/ }));
    fireEvent.click(within(preview()).getByLabelText('Base 10'));
    expect(selection().textContent).not.toContain('No selection');
  });

  it('draws restriction sites and ORFs only when enabled', () => {
    setup();
    const sites = () => within(preview()).queryAllByRole('button', { name: /, cut at [\d,]+ bp/ });
    const orfs = () => within(preview()).queryAllByRole('button', { name: /^Predicted ORF/ });
    expect(sites()).toHaveLength(0);
    expect(orfs()).toHaveLength(0);
    fireEvent.click(within(preview()).getByRole('checkbox', { name: /Show restriction sites/ }));
    expect(sites().length).toBeGreaterThan(0);
    fireEvent.click(within(preview()).getByRole('checkbox', { name: /Show ORFs/ }));
    expect(orfs().length).toBeGreaterThan(0);
  });

  it('lists marks for In-Fusion and ligation products too', () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: 'In-Fusion' }));
    expect(within(preview()).getByRole('button', { name: /Junction 1: vector → GFP/ })).toBeTruthy();
  });

  it('lists ligation junctions when the ends can ligate', () => {
    render(<CloningHubView />);
    fireEvent.change(screen.getByLabelText(/Preset vector/), { target: { value: 'puc19' } });
    fireEvent.input(screen.getByLabelText(/Paste FASTA/), { target: { value: `>gene\nTTTTTTGAATTC${GFP}AAGCTTTTTTTT` } });
    fireEvent.click(screen.getByRole('button', { name: 'Add pasted sequence' }));
    fireEvent.click(screen.getByRole('button', { name: 'Restriction + ligation' }));
    expect(within(preview()).queryAllByRole('button', { name: /^Junction \d+:/ }).length).toBeGreaterThan(0);
  });

  it('saves the product as a plasmid project the plasmid tool can reopen, then opens it', async () => {
    setup();
    fireEvent.click(within(preview()).getByRole('button', { name: 'Open in plasmid workspace' }));
    await waitFor(() => expect(saveProject).toHaveBeenCalledTimes(1));
    const saved = saveProject.mock.calls[0]![0] as { id: string; toolId: string; version: number; name: string; state: { schemaVersion: number; document: unknown } };
    expect(saved).toMatchObject({ toolId: 'plasmid', version: 2, name: 'NEBuilder assembly', state: { schemaVersion: 2 } });
    expect(() => restoreDocument(saved.state)).not.toThrow();
    await waitFor(() => expect(location.hash).toBe(`#/t/plasmid/p/${saved.id}`));
  });

  it('reports a failed save and stays on the hub', async () => {
    saveProject.mockRejectedValue(new Error('quota exceeded'));
    setup();
    fireEvent.click(within(preview()).getByRole('button', { name: 'Open in plasmid workspace' }));
    await waitFor(() => expect(within(preview()).getByRole('alert').textContent).toMatch(/quota exceeded/));
    expect(location.hash).toBe('#/t/cloning');
  });

  it('keeps the GenBank and FASTA downloads', () => {
    setup();
    expect(within(preview()).getByRole('button', { name: 'Download GenBank' })).toBeTruthy();
    expect(within(preview()).getByRole('button', { name: 'Download FASTA' })).toBeTruthy();
  });
});
