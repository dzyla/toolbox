import { render, screen, fireEvent, waitFor } from '@testing-library/preact';
import { describe, it, expect } from 'vitest';
import FlowView from '@/tools/flow/View';
import { buildFcs } from '../core/fcs-builder';

describe('Flow cytometry tool', () => {
  it('loads the synthetic example, adds a gate, edits its bounds and shows statistics', async () => {
    render(<FlowView />);
    fireEvent.click(screen.getByRole('button', { name: /Load example/ }));
    expect(await screen.findByText('All events', { selector: 'th' })).toBeTruthy();
    expect(screen.getByText('20,000', { selector: 'td' })).toBeTruthy();
    expect(screen.getByLabelText('X parameter')).toBeTruthy();
    expect(screen.getByRole('img', { name: /plot of SSC-A against FSC-A/ })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /Add rectangle gate/ }));
    expect(await screen.findByText('Gate 1', { selector: 'th' })).toBeTruthy();
    const xmin = screen.getByLabelText('X minimum') as HTMLInputElement;
    fireEvent.change(xmin, { target: { value: '0' } });
    expect(screen.getByRole('img', { name: /Gates: Gate 1/ })).toBeTruthy();
    expect(screen.getByLabelText('Apply compensation')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Histogram' }));
    expect(screen.getByRole('img', { name: /Histogram of FSC-A/ })).toBeTruthy();
  });

  it('reads an uploaded FCS file and reports a readable error for a bad one', async () => {
    render(<FlowView />);
    const input = screen.getByLabelText('Choose an FCS file') as HTMLInputElement;
    const good = buildFcs({ datatype: 'F', params: [{ name: 'FSC-A' }, { name: 'SSC-A' }], events: [[1, 2], [3, 4], [5, 6]] });
    fireEvent.change(input, { target: { files: [new File([good as BlobPart], 'ok.fcs')] } });
    expect(await screen.findByText('All events', { selector: 'th' })).toBeTruthy();
    expect(screen.getByText('ok.fcs')).toBeTruthy();

    const bad = good.slice(0, good.length - 4);
    fireEvent.change(input, { target: { files: [new File([bad as BlobPart], 'bad.fcs')] } });
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/truncated/));
  });
});
