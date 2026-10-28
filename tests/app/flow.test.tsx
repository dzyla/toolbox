import { render, screen, fireEvent, waitFor, within } from '@testing-library/preact';
import { beforeEach, describe, it, expect, vi } from 'vitest';
import FlowView from '@/tools/flow/View';
import { buildFcs } from '../core/fcs-builder';

const downloadText = vi.fn();
vi.mock('@/lib/export', async importOriginal => ({ ...(await importOriginal<typeof import('@/lib/export')>()), downloadText: (...args: unknown[]) => downloadText(...args) }));

const fcsFile = (name: string, params: string[], events: number[][]) =>
  new File([buildFcs({ datatype: 'F', params: params.map(n => ({ name: n })), events }) as BlobPart], name);
// The same three parameters in different column orders; FSC-A values 10..80.
const fileA = () => fcsFile('a.fcs', ['FSC-A', 'SSC-A', 'FL1-A'], [[10, 1, 5], [20, 2, 6], [30, 3, 7], [40, 4, 8]]);
const fileB = () => fcsFile('b.fcs', ['FL1-A', 'FSC-A', 'SSC-A'], [[5, 50, 5], [6, 60, 6], [7, 70, 7], [8, 80, 8]]);
const plot = () => screen.getAllByRole('img').find(el => el.tagName === 'CANVAS')!;
const perSample = () => screen.getByRole('table', { name: /in each sample/ });
const statsRow = (name: string | RegExp) => Array.from(screen.getByRole('table', { name: /for each population/ }).querySelector('tbody')!.querySelectorAll('tr'))
  .find(tr => (typeof name === 'string' ? tr.querySelector('th')!.textContent === name : name.test(tr.querySelector('th')!.textContent!)));

beforeEach(() => downloadText.mockReset());

describe('Flow cytometry tool', () => {
  it('loads the four-sample example, overlays it, then steps through samples and edits a gate', async () => {
    render(<FlowView />);
    fireEvent.click(screen.getByRole('button', { name: /Load example/ }));
    expect(await screen.findByText('All events', { selector: 'th' })).toBeTruthy();
    const list = screen.getByRole('list', { name: 'Samples' });
    expect(within(list).getAllByRole('listitem').map(li => li.textContent)).toEqual([
      'Unstained20,000Remove', 'Stim 0 h20,000Remove', 'Stim 6 h20,000Remove', 'Stim 24 h20,000Remove',
    ]);
    // All samples: the 2-D density pools them into one heatmap; dots overlay them by colour.
    expect(plot().getAttribute('aria-label')).toMatch(/^Density plot of SSC-A against FSC-A, all 4 samples pooled \(Unstained, Stim 0 h, Stim 6 h, Stim 24 h\)/);
    expect(screen.getByRole('button', { name: 'All samples' }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Dots' }));
    expect(plot().getAttribute('aria-label')).toMatch(/Dot plot of SSC-A against FSC-A, overlay of 4 samples coloured by sample \(Unstained, Stim 0 h, Stim 6 h, Stim 24 h\)/);

    // Population statistics: all samples pooled by default, or one sample.
    expect(screen.getByText(/Population statistics · all 4 samples pooled/)).toBeTruthy();
    const allRow = () => screen.getByText('All events', { selector: 'th' }).closest('tr')!.textContent ?? '';
    expect(allRow()).toMatch(/80,000/);
    fireEvent.change(screen.getByLabelText('Statistics of'), { target: { value: 'x1' } });
    expect(screen.getByText(/Population statistics · Stim 0 h/)).toBeTruthy();
    expect(allRow()).toMatch(/20,000/);
    fireEvent.change(screen.getByLabelText('Statistics of'), { target: { value: '' } });
    expect(allRow()).toMatch(/80,000/);

    fireEvent.click(screen.getByRole('button', { name: 'Histogram' }));
    expect(plot().getAttribute('aria-label')).toMatch(/Histogram of FSC-A .* each normalised to its mode/);
    fireEvent.click(screen.getByRole('button', { name: '% of events' }));
    expect(plot().getAttribute('aria-label')).toMatch(/% of its events/);
    fireEvent.click(screen.getByRole('button', { name: '2-D density' }));

    // Per sample: one plot per sample, side by side.
    fireEvent.click(screen.getByRole('button', { name: 'Per sample' }));
    expect(screen.getAllByRole('img', { name: /Density plot of SSC-A against FSC-A, sample .*, all events\.$/ })).toHaveLength(4);

    // Single sample: one at a time.
    fireEvent.click(screen.getByRole('button', { name: 'Single sample' }));
    fireEvent.change(screen.getByLabelText('Sample shown'), { target: { value: 'x0' } });
    expect(plot().getAttribute('aria-label')).toMatch(/^Density plot of SSC-A against FSC-A, sample Unstained/);
    fireEvent.click(screen.getByRole('button', { name: 'Next sample' }));
    expect(plot().getAttribute('aria-label')).toMatch(/sample Stim 0 h/);
    expect((screen.getByLabelText('Sample shown') as HTMLSelectElement).value).toBe('x1');

    fireEvent.click(screen.getByRole('button', { name: /Add rectangle gate/ }));
    expect(await screen.findByText('Gate 1', { selector: 'th' })).toBeTruthy();
    const xmin = screen.getByLabelText('X minimum') as HTMLInputElement;
    fireEvent.change(xmin, { target: { value: '0' } });
    expect(plot().getAttribute('aria-label')).toMatch(/Gates: Gate 1 [\d,]+ events/);
    expect(screen.getByLabelText('Apply compensation')).toBeTruthy();

    // hiding a sample removes it from the per-sample table
    expect(within(perSample()).getAllByRole('row')).toHaveLength(5);
    fireEvent.click(screen.getByLabelText('Show Unstained'));
    expect(within(perSample()).getAllByRole('row')).toHaveLength(4);
  });

  it('loads several files at once, matches parameters by name, and reports a bad file', async () => {
    render(<FlowView />);
    const input = screen.getByLabelText('Choose FCS files') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [fileA(), fileB()] } });
    expect(await screen.findByText('All events', { selector: 'th' })).toBeTruthy();
    expect(screen.getByRole('list', { name: 'Samples' }).textContent).toMatch(/a\.fcs4Remove.*b\.fcs4Remove/);
    expect(plot().getAttribute('aria-label')).toMatch(/all 2 samples pooled \(a\.fcs, b\.fcs\)/);
    // X picker offers the common parameters in the first file's order
    expect(Array.from((screen.getByLabelText('X parameter') as HTMLSelectElement).options).map(o => o.value)).toEqual(['FSC-A', 'SSC-A', 'FL1-A']);

    fireEvent.click(screen.getByRole('button', { name: 'Single sample' }));
    expect(plot().getAttribute('aria-label')).toMatch(/sample a\.fcs/);
    fireEvent.click(screen.getByRole('button', { name: 'All samples' }));

    // add a third file later, without FL1-A
    fireEvent.change(input, { target: { files: [fcsFile('c.fcs', ['SSC-A', 'FSC-A'], [[1, 100]])] } });
    await waitFor(() => expect(screen.getByRole('list', { name: 'Samples' }).textContent).toMatch(/c\.fcs1Remove/));
    expect(Array.from((screen.getByLabelText('X parameter') as HTMLSelectElement).options).map(o => o.value)).toEqual(['FSC-A', 'SSC-A']);
    fireEvent.click(screen.getByRole('button', { name: 'Remove c.fcs' }));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Remove c.fcs' })).toBeNull());
    fireEvent.change(screen.getByLabelText('X parameter'), { target: { value: 'FL1-A' } });
    fireEvent.click(screen.getByLabelText('Show b.fcs'));
    expect(plot().getAttribute('aria-label')).toMatch(/Density plot of SSC-A against FL1-A, sample a\.fcs/);

    const good = buildFcs({ datatype: 'F', params: [{ name: 'FSC-A' }], events: [[1], [2]] });
    fireEvent.change(input, { target: { files: [new File([good.slice(0, good.length - 4) as BlobPart], 'bad.fcs')] } });
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/bad\.fcs: .*truncated/));
    expect(screen.queryByRole('button', { name: 'Remove bad.fcs' })).toBeNull();
  });

  it('creates a split gate from its controls, moves both halves together, and charts it per sample', async () => {
    render(<FlowView />);
    fireEvent.change(screen.getByLabelText('Choose FCS files'), { target: { files: [fileA(), fileB()] } });
    await screen.findByText('All events', { selector: 'th' });
    fireEvent.change(screen.getByLabelText('X scale'), { target: { value: 'linear' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add split gate on FSC-A' }));
    expect(await screen.findByText('FSC-A−', { selector: 'th' })).toBeTruthy();
    expect(screen.getByText('FSC-A+', { selector: 'th' })).toBeTruthy();
    expect(screen.getByText(/Split on FSC-A: FSC-A− holds events below the threshold/)).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Threshold'), { target: { value: '25' } });
    // pooled over both files: a gives 2 | 2, b gives 0 | 4
    expect(statsRow('FSC-A−')!.querySelectorAll('td')[0]!.textContent).toBe('2');
    expect(statsRow('FSC-A+')!.querySelectorAll('td')[0]!.textContent).toBe('6');
    // sample a alone: FSC-A 10,20 | 30,40 -> 2 and 2
    const statsOf = screen.getByLabelText('Statistics of') as HTMLSelectElement;
    fireEvent.change(statsOf, { target: { value: Array.from(statsOf.options).find(o => o.text === 'a.fcs')!.value } });
    expect(statsRow('FSC-A−')!.querySelectorAll('td')[0]!.textContent).toBe('2');
    expect(statsRow('FSC-A+')!.querySelectorAll('td')[0]!.textContent).toBe('2');
    // the per-sample breakdown follows the gate being edited (the left half)
    const rows = within(perSample()).getAllByRole('row').slice(1).map(r => Array.from(r.querySelectorAll('td')).map(td => td.textContent));
    expect(rows).toEqual([['2', '50.00', '50.00', '15'], ['0', '0.00', '0.00', '—']]);
    const chart = screen.getByRole('img', { name: /^Bar chart of % of parent for FSC-A−, per sample: a\.fcs 50\.00%; b\.fcs 0\.00%\.$/ });
    expect(chart.querySelectorAll('title')[0]!.textContent).toBe('a.fcs: 50.00% of parent, 50.00% of total, 2 events');

    fireEvent.change(screen.getByLabelText('Population compared'), { target: { value: 'g2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Events' }));
    expect(screen.getByRole('img', { name: /Bar chart of Events for FSC-A\+, per sample: a\.fcs 2; b\.fcs 4\./ })).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Per-sample statistic'), { target: { value: 'mean' } });
    expect(within(perSample()).getAllByRole('row')[2]!.textContent).toMatch(/b\.fcs4100\.00100\.0065/);

    fireEvent.click(screen.getByRole('button', { name: 'Export per-sample CSV' }));
    const [csv, name] = downloadText.mock.calls[0]!;
    expect(name).toBe('flow-per-sample.csv');
    expect(csv).toMatch(/Sample,Population,Parent,Events,% of parent,% of total,Mean FSC-A/);
    expect(csv).toMatch(/b\.fcs,FSC-A\+,All events,4,100,100,65/);

    fireEvent.change(screen.getByLabelText('Edit gate'), { target: { value: 'g2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Delete both halves and their children' }));
    await waitFor(() => expect(screen.queryByText('FSC-A−', { selector: 'th' })).toBeNull());
  });

  it('exports gates as JSON and re-applies them, with clear errors for a bad file', async () => {
    render(<FlowView />);
    fireEvent.change(screen.getByLabelText('Choose FCS files'), { target: { files: [fileA(), fileB()] } });
    await screen.findByText('All events', { selector: 'th' });
    fireEvent.click(screen.getByRole('button', { name: 'Add split gate on FSC-A' }));
    fireEvent.change(screen.getByLabelText('Threshold'), { target: { value: '35' } });
    fireEvent.click(screen.getByRole('button', { name: /Add rectangle gate/ }));
    await screen.findByText('Gate 3', { selector: 'th' });
    fireEvent.click(screen.getByRole('button', { name: 'Download gates (JSON)' }));
    const [json, name] = downloadText.mock.calls[0]!;
    expect(name).toBe('flow-gates.json');
    const doc = JSON.parse(json as string);
    expect(doc).toMatchObject({ format: 'bio-bench-flow-gates', version: 1 });
    expect(doc.gates.map((g: { type: string; name: string }) => `${g.type}:${g.name}`)).toEqual(['split:FSC-A−', 'split:FSC-A+', 'rect:Gate 3']);
    expect(doc.gates[0].threshold).toBeCloseTo(35, 6);

    // remove everything, then re-apply from the downloaded file
    fireEvent.change(screen.getByLabelText('Edit gate'), { target: { value: 'g1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Delete both halves and their children' }));
    await waitFor(() => expect(screen.queryByText('FSC-A+', { selector: 'th' })).toBeNull());
    const gateInput = screen.getByLabelText('Load gates from JSON');
    fireEvent.change(gateInput, { target: { files: [new File([json as string], 'flow-gates.json')] } });
    expect(await screen.findByText(/Loaded 3 gates from flow-gates\.json/)).toBeTruthy();
    expect(statsRow('FSC-A+')!.querySelectorAll('td')[0]!.textContent).toBe('5'); // pooled: a 40, b four events
    expect(statsRow('Gate 3')).toBeTruthy();

    fireEvent.change(gateInput, { target: { files: [new File(['{"format":"other"}'], 'x.json')] } });
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/x\.json: This is not a Bio-Bench gate file/));
    const partial = { ...doc, gates: [...doc.gates, { ...doc.gates[2], id: 'z', name: 'CD4 gate', xParam: 'FL2-A' }] };
    fireEvent.change(gateInput, { target: { files: [new File([JSON.stringify(partial)], 'p.json')] } });
    expect(await screen.findByText(/Skipped 1 gate on parameters that no loaded sample has: "CD4 gate" \(FL2-A\)/)).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
