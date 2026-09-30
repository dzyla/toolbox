import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/preact';
import CloningHubView from '@/tools/cloning/View';
import { randomDna } from '../core/helpers';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const paste = (text: string) => {
  fireEvent.input(screen.getByLabelText(/Paste FASTA/), { target: { value: text } });
  fireEvent.click(screen.getByRole('button', { name: 'Add pasted sequence' }));
};
const setup = () => {
  location.hash = '#/t/cloning';
  render(<CloningHubView />);
  fireEvent.change(screen.getByLabelText(/Preset vector/), { target: { value: 'puc19' } });
  paste(`>gene\n${randomDna(600, 5)}`);
};

describe('NEBuilder: open the vector where you want', () => {
  it('offers whole circle / position / region for a PCR-made circular source and redraws the map', () => {
    setup();
    fireEvent.change(screen.getByLabelText('How pUC19 is made'), { target: { value: 'pcr' } });
    const choice = screen.getByLabelText('Where to open pUC19') as HTMLSelectElement;
    expect([...choice.options].map(o => o.value)).toEqual(['whole', 'caret', 'region']);
    fireEvent.change(choice, { target: { value: 'caret' } });
    fireEvent.input(screen.getByLabelText('Open pUC19 before base'), { target: { value: '1000' } });
    const map = screen.getByRole('group', { name: /pUC19: amplified region and primers/ });
    expect(map.getAttribute('aria-label')).toContain('region 1,000–999');
    expect(screen.getByRole('button', { name: /pUC19_fwd, forward, 1,000–/ })).toBeTruthy();
  });

  it('shows a message, not a crash, for an impossible region', () => {
    setup();
    fireEvent.change(screen.getByLabelText('How pUC19 is made'), { target: { value: 'pcr' } });
    fireEvent.change(screen.getByLabelText('Where to open pUC19'), { target: { value: 'region' } });
    fireEvent.input(screen.getByLabelText('Replace pUC19 from base'), { target: { value: '5' } });
    fireEvent.input(screen.getByLabelText('Replace pUC19 to base'), { target: { value: '2680' } });
    expect(screen.getAllByText(/pUC19.*(too short|leaves too little|primers)/i).length).toBeGreaterThan(0);
  });
});

describe('NEBuilder: share the overlap between the primer pairs', () => {
  it('has a slider per junction with presets, and the tails follow it', () => {
    setup();
    fireEvent.change(screen.getByLabelText('How pUC19 is made'), { target: { value: 'pcr' } });
    fireEvent.change(screen.getByLabelText('Where to open pUC19'), { target: { value: 'caret' } });
    fireEvent.input(screen.getByLabelText('Open pUC19 before base'), { target: { value: '400' } });
    fireEvent.change(screen.getByLabelText('Placement for pUC19 to gene'), { target: { value: 'custom' } });
    fireEvent.click(screen.getByRole('button', { name: 'All on the left primer' }));
    expect(screen.getAllByTestId('share-summary')[0]!.textContent).toContain('· 0 nt on gene_fwd');
    fireEvent.click(screen.getAllByRole('button', { name: 'All on the right primer' })[0]!);
    expect(screen.getAllByTestId('share-summary')[0]!.textContent).toMatch(/^0 nt on pUC19_rev/);
  });
});

describe('In-Fusion: click-to-place and shared homology', () => {
  it('draws the vector primers for an inverse-PCR position and lets you share the homology', () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: 'In-Fusion' }));
    fireEvent.change(screen.getByLabelText('Linearize the vector by'), { target: { value: 'pcr-caret' } });
    fireEvent.input(screen.getByLabelText('Insert before base'), { target: { value: '500' } });
    expect(screen.getByRole('button', { name: /vector_fwd, forward, 500–/ })).toBeTruthy();
    fireEvent.input(screen.getByLabelText('Share of the vector homology carried by the vector primers'), { target: { value: '50' } });
    expect(screen.getByTestId('share-summary').textContent).toMatch(/8 nt on vector_rev/);
  });
});

describe('In-Fusion: carets stay inside the vector', () => {
  const inFusionSetup = () => { setup(); fireEvent.click(screen.getByRole('button', { name: 'In-Fusion' })); };

  it('never says "before 0" for the default caret', () => {
    inFusionSetup();
    fireEvent.change(screen.getByLabelText('Linearize the vector by'), { target: { value: 'pcr-caret' } });
    expect(screen.getByText('Insert before 1')).toBeTruthy();
    expect(screen.queryByText(/before 0/)).toBeNull();
    expect((screen.getByLabelText('Insert before base') as HTMLInputElement).value).toBe('1');
  });

  it('turns a pick at the far end into the last base, not one past it', () => {
    inFusionSetup();
    const surface = screen.getAllByTestId('diagram-surface')[0]!;
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 1000, height: 120, right: 1000, bottom: 120, x: 0, y: 0, toJSON: () => ({}) });
    fireEvent.pointerDown(surface, { clientX: 1000, pointerId: 1 });
    fireEvent.pointerUp(surface, { clientX: 1000, pointerId: 1 });
    expect((screen.getByLabelText('Insert before base') as HTMLInputElement).value).toBe('2686');
  });

  it('draws a linear vector without a clickable map', () => {
    inFusionSetup();
    expect(screen.getAllByTestId('diagram-surface').length).toBeGreaterThan(0);
    fireEvent.change(screen.getAllByLabelText(/Topology of/)[0]!, { target: { value: 'linear' } });
    expect(screen.queryAllByTestId('diagram-surface')).toHaveLength(0);
    expect(screen.queryByText(/circular, shown unrolled/)).toBeNull();
  });
});
