import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/preact';
import CloningHubView from '@/tools/cloning/View';
import { randomDna } from '../core/helpers';
import { reverseComplement } from '@/core/nucleic/sequence';

afterEach(cleanup);

function setup(sequence = randomDna(600, 7)) {
  location.hash = '#/t/cloning';
  render(<CloningHubView />);
  fireEvent.input(screen.getByLabelText(/Paste FASTA/), { target: { value: `>plas\n${sequence}` } });
  fireEvent.click(screen.getByRole('button', { name: 'Add pasted sequence' }));
  fireEvent.click(screen.getByRole('button', { name: 'Amino-acid change' }));
  fireEvent.click(screen.getByRole('button', { name: 'Insert, replace or delete bases' }));
}

describe('sequence edits: before/after and graphic', () => {
  it('shows the deleted bases struck out and the plasmid graphic', () => {
    setup();
    fireEvent.change(screen.getByLabelText('Change', { exact: true }), { target: { value: 'delete' } });
    fireEvent.input(screen.getByLabelText('From base'), { target: { value: '100' } });
    fireEvent.input(screen.getByLabelText('To base'), { target: { value: '111' } });
    const view = screen.getByRole('region', { name: /Edit preview: del100-111/ });
    expect(within(view).getByText(/Before/)).toBeTruthy();
    expect(within(view).getByText(/After/)).toBeTruthy();
    expect(view.querySelector('del')!.textContent).toHaveLength(12);
    expect(within(view).getByRole('group', { name: /Edit site and primers/ })).toBeTruthy();
    expect(view.textContent).toContain('12 bases removed');
  });

  it('shows inserted bases highlighted', () => {
    setup();
    fireEvent.change(screen.getByLabelText('Change', { exact: true }), { target: { value: 'insert' } });
    fireEvent.input(screen.getByLabelText('Insert after base'), { target: { value: '200' } });
    fireEvent.input(screen.getByLabelText('New bases'), { target: { value: 'GGATCC' } });
    const view = screen.getByRole('region', { name: /Edit preview: ins200/ });
    expect(view.querySelector('ins')!.textContent).toBe('GGATCC');
    expect(view.textContent).toContain('6 bases added');
    expect(view.textContent).toContain('Insert after base 200');
  });

  it('shows both for a replacement', () => {
    setup();
    fireEvent.change(screen.getByLabelText('Change', { exact: true }), { target: { value: 'replace' } });
    fireEvent.input(screen.getByLabelText('From base'), { target: { value: '50' } });
    fireEvent.input(screen.getByLabelText('To base'), { target: { value: '55' } });
    fireEvent.input(screen.getByLabelText('New bases'), { target: { value: 'TTTT' } });
    const view = screen.getByRole('region', { name: /Edit preview: sub50-55/ });
    expect(view.querySelector('del')!.textContent).toHaveLength(6);
    expect(view.querySelector('ins')!.textContent).toBe('TTTT');
    expect(view.textContent).toContain('6 bases removed');
    expect(view.textContent).toContain('4 bases added');
  });

  it('uses the original plasmid when the selected ORF is on the bottom strand', () => {
    const filler = randomDna(300, 11);
    const original = reverseComplement(filler.slice(0, 150) + 'ATG' + 'GCT'.repeat(100) + 'TAA' + filler.slice(150));
    setup(original);
    fireEvent.change(screen.getByLabelText('Change', { exact: true }), { target: { value: 'delete' } });
    fireEvent.input(screen.getByLabelText('From base'), { target: { value: '50' } });
    fireEvent.input(screen.getByLabelText('To base'), { target: { value: '61' } });
    const view = screen.getByRole('region', { name: /Edit preview: del50-61/ });
    const expected = original.slice(49, 61);
    expect(expected).not.toBe(reverseComplement(expected));
    expect(view.querySelector('del')!.textContent).toBe(expected);
  });
});
