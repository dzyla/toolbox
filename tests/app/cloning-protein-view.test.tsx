import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/preact';
import CloningHubView from '@/tools/cloning/View';

afterEach(cleanup);

const GFP = 'ATGGTGAGCAAGGGCGAGGAGCTGTTCACCGGGGTGGTGCCCATCCTGGTCGAGCTGGACGGCGACGTAAACGGCCACAAGTTCAGCGTGTCCGGCGAGGGCGAGGGCGATGCCACCTACGGCAAGCTGACCCTGAAGTTCATCTGCACCACCGGCAAGCTGCCCGTGCCCTGGCCCACCCTCGTGACCACCCTGACCTACGGCGTGCAGTGCTTCAGCCGCTACCCCGACCACATGAAGCAGCACGACTTCTTCAAGTCCGCCATGCCCGAAGGCTACGTCCAGGAGCGCACCATCTTCTTCAAGGACGACGGCAACTACAAGACCCGCGCCGAGGTGAAGTTCGAGGGCGACACCCTGGTGAACCGCATCGAGCTGAAGGGCATCGACTTCAAGGAGGACGGCAACATCCTGGGGCACAAGCTGGAGTACAACTACAACAGCCACAACGTCTATATCATGGCCGACAAGCAGAAGAACGGCATCAAGGTGAACTTCAAGATCCGCCACAACATCGAGGACGGCAGCGTGCAGCTCGCCGACCACTACCAGCAGAACACCCCCATCGGCGACGGCCCCGTGCTGCTGCCCGACAACCACTACCTGAGCACCCAGTCCGCCCTGAGCAAAGACCCCAACGAGAAGCGCGATCACATGGTCCTGCTGGAGTTCGTGACCGCCGCCGGGATCACTCTCGGCATGGACGAGCTGTACAAGTAA';

function setup() {
  location.hash = '#/t/cloning';
  render(<CloningHubView />);
  fireEvent.input(screen.getByLabelText(/Paste FASTA/), { target: { value: `>GFP\n${GFP}` } });
  fireEvent.click(screen.getByRole('button', { name: 'Add pasted sequence' }));
  fireEvent.click(screen.getByRole('button', { name: 'Amino-acid change' }));
}

describe('amino-acid change: numbering and alignment', () => {
  it('numbers the translated reading frame in blocks of ten', () => {
    setup();
    const view = screen.getByRole('region', { name: 'Protein sequence with residue numbers' });
    expect(within(view).getByText('1')).toBeTruthy();
    expect(view.textContent).toContain('MVSKGEELFT');
    expect(view.textContent).toContain('51');
  });

  it('shows a pairwise alignment card for each mutation', () => {
    setup();
    fireEvent.input(screen.getByLabelText('Mutations', { exact: true }), { target: { value: 'Y67F' } });
    const card = screen.getByRole('group', { name: /Y67F: wild type vs mutant/ });
    expect(card.textContent).toContain('Residue 67');
    expect(card.textContent).toMatch(/TAC|TAT/);
    expect(within(card).getByLabelText('Protein alignment').textContent).toContain('F');
    expect(within(card).getByLabelText('Protein alignment').textContent).toMatch(/\./);
  });

  it('highlights the mutated residue in the numbered protein', () => {
    setup();
    fireEvent.input(screen.getByLabelText('Mutations', { exact: true }), { target: { value: 'Y67F' } });
    const view = screen.getByRole('region', { name: 'Protein sequence with residue numbers' });
    expect(view.querySelectorAll('mark')).toHaveLength(1);
    expect(view.querySelector('mark')!.getAttribute('title')).toContain('67');
  });

  it('gives one card per mutation of a multi-mutant', () => {
    setup();
    fireEvent.input(screen.getByLabelText('Mutations', { exact: true }), { target: { value: 'T66A+Y67F' } });
    expect(screen.getAllByRole('group', { name: /wild type vs mutant/ })).toHaveLength(2);
  });
});

describe('amino-acid change: long reading frames', () => {
  it('says when only the first 1,200 residues are shown and marks nothing beyond them', () => {
    location.hash = '#/t/cloning';
    render(<CloningHubView />);
    const codons = Array.from({ length: 1300 }, (_, i) => ['GCT', 'GAA', 'AAA', 'CTG'][i % 4]).join('');
    fireEvent.input(screen.getByLabelText(/Paste FASTA/), { target: { value: `>long\nATG${codons}TAA` } });
    fireEvent.click(screen.getByRole('button', { name: 'Add pasted sequence' }));
    fireEvent.click(screen.getByRole('button', { name: 'Amino-acid change' }));
    fireEvent.input(screen.getByLabelText('Mutations', { exact: true }), { target: { value: 'K1252A' } });
    const view = screen.getByRole('region', { name: 'Protein sequence with residue numbers' });
    expect(view.textContent).toMatch(/Showing the first 1,200 of 1,301 residues/);
    expect(view.querySelectorAll('mark')).toHaveLength(0);
  });

  it('shows no such note for a short protein', () => {
    setup();
    expect(screen.getByRole('region', { name: 'Protein sequence with residue numbers' }).textContent).not.toMatch(/Showing the first/);
  });
});
