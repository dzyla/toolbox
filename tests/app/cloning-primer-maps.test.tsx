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

const stubBox = () => vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 1000, height: 120, right: 1000, bottom: 120, x: 0, y: 0, toJSON: () => ({}) });

describe('NEBuilder: picking on the map', () => {
  it('clamps a pick at the far end to the last base and draws the opening marker', () => {
    setup();
    fireEvent.change(screen.getByLabelText('How pUC19 is made'), { target: { value: 'pcr' } });
    stubBox();
    const surface = screen.getAllByTestId('diagram-surface')[0]!;
    fireEvent.pointerDown(surface, { clientX: 1000, pointerId: 1 });
    fireEvent.pointerUp(surface, { clientX: 1000, pointerId: 1 });
    expect(screen.getByLabelText('Where to open pUC19')).toHaveProperty('value', 'caret');
    expect((screen.getByLabelText('Open pUC19 before base') as HTMLInputElement).value).toBe('2686');
    expect(screen.getByText('Open before 2686')).toBeTruthy();
  });
});

describe('NEBuilder: a region that wraps the whole circle', () => {
  it('says the region covers the whole sequence rather than that it is empty', () => {
    setup();
    fireEvent.change(screen.getByLabelText('How pUC19 is made'), { target: { value: 'pcr' } });
    fireEvent.change(screen.getByLabelText('Where to open pUC19'), { target: { value: 'region' } });
    fireEvent.input(screen.getByLabelText('Replace pUC19 from base'), { target: { value: '5' } });
    fireEvent.input(screen.getByLabelText('Replace pUC19 to base'), { target: { value: '4' } });
    expect(screen.getAllByText(/covers the whole sequence/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/replaced region is empty/)).toBeNull();
  });
});

describe('same-named sources', () => {
  const dup = () => {
    location.hash = '#/t/cloning';
    render(<CloningHubView />);
    paste(`>dup\n${randomDna(500, 11)}`);
    paste(`>dup\n${randomDna(500, 12)}`);
    screen.getAllByLabelText(/Topology of/).forEach(select => fireEvent.change(select, { target: { value: 'linear' } }));
  };
  const arrows = () => screen.getAllByRole('button', { name: /^dup_fwd, forward/ });
  const rows = () => document.querySelectorAll('tr[aria-current="true"]');

  it('highlights one arrow and one table row when an arrow is clicked', () => {
    dup();
    expect(arrows()).toHaveLength(2);
    fireEvent.click(arrows()[1]!);
    expect(arrows().map(arrow => arrow.getAttribute('aria-pressed'))).toEqual(['false', 'true']);
    expect(rows()).toHaveLength(1);
    const all = [...document.querySelectorAll('tbody tr')].filter(row => row.querySelector('th')?.textContent?.includes('dup_fwd'));
    expect(all).toHaveLength(2);
    expect(all[0]!.getAttribute('aria-current')).toBeNull();
    expect(all[1]!.getAttribute('aria-current')).toBe('true');
  });

  it('highlights one arrow when a table row is chosen, and keeps every DOM id unique', () => {
    dup();
    const buttons = screen.getAllByRole('button', { name: /^dup_fwd$/ });
    expect(buttons).toHaveLength(2);
    fireEvent.click(buttons[0]!);
    expect(arrows().map(arrow => arrow.getAttribute('aria-pressed'))).toEqual(['true', 'false']);
    expect(rows()).toHaveLength(1);
    const ids = [...document.querySelectorAll('[id]')].map(node => node.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

const pcrSetup = () => { setup(); fireEvent.change(screen.getByLabelText('How pUC19 is made'), { target: { value: 'pcr' } }); };

describe('primer table rows by keyboard', () => {
  it('has a real button in the name cell that toggles the row, its marker and aria-current', () => {
    pcrSetup();
    const button = screen.getByRole('button', { name: 'pUC19_fwd' });
    expect(button.tagName).toBe('BUTTON');
    expect(button.getAttribute('type')).toBe('button');
    expect(button.getAttribute('tabindex')).not.toBe('-1');
    expect(button.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(button); // Enter and Space on a button are delivered as this click
    const row = button.closest('tr')!;
    expect(row.getAttribute('aria-current')).toBe('true');
    expect(button.textContent).toBe('▸ pUC19_fwd');
    expect(button.getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: /^pUC19_fwd, forward/ }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(button);
    expect(row.getAttribute('aria-current')).toBeNull();
    expect(button.textContent).toBe('pUC19_fwd');
  });

  it('still toggles from a click anywhere on the row, once', () => {
    pcrSetup();
    const row = screen.getByRole('button', { name: 'pUC19_fwd' }).closest('tr')!;
    fireEvent.click(row.querySelector('td')!);
    expect(row.getAttribute('aria-current')).toBe('true');
    fireEvent.click(row.querySelector('td')!);
    expect(row.getAttribute('aria-current')).toBeNull();
  });
});

describe('overhang sliders speak their value', () => {
  it('NEBuilder: gives the percentage and both primer lengths', () => {
    setup();
    fireEvent.change(screen.getByLabelText('How pUC19 is made'), { target: { value: 'pcr' } });
    fireEvent.change(screen.getByLabelText('Where to open pUC19'), { target: { value: 'caret' } });
    fireEvent.input(screen.getByLabelText('Open pUC19 before base'), { target: { value: '400' } });
    fireEvent.change(screen.getByLabelText('Placement for pUC19 to gene'), { target: { value: 'custom' } });
    const slider = screen.getByLabelText('Share of the overlap on the right primer for pUC19 to gene');
    fireEvent.input(slider, { target: { value: '40' } });
    const text = (screen.getByLabelText('Share of the overlap on the right primer for pUC19 to gene')).getAttribute('aria-valuetext')!;
    const summary = screen.getAllByTestId('share-summary')[0]!.textContent!;
    const [rev, fwd] = [/(\d+) nt on pUC19_rev/.exec(summary)![1], /(\d+) nt on gene_fwd/.exec(summary)![1]];
    expect(text).toBe(`40% on the right primer — ${rev} nt on pUC19_rev, ${fwd} nt on gene_fwd`);
  });

  it('In-Fusion: gives the percentage and both extension lengths', () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: 'In-Fusion' }));
    fireEvent.change(screen.getByLabelText('Linearize the vector by'), { target: { value: 'pcr-caret' } });
    fireEvent.input(screen.getByLabelText('Insert before base'), { target: { value: '500' } });
    fireEvent.input(screen.getByLabelText('Share of the vector homology carried by the vector primers'), { target: { value: '50' } });
    expect(screen.getByLabelText('Share of the vector homology carried by the vector primers').getAttribute('aria-valuetext'))
      .toBe('50% on the vector primers — 8 nt on vector_rev, 7 nt on gene_fwd');
  });
});

describe('In-Fusion: a click on a digest-opened vector', () => {
  it('says it switched to inverse PCR, in a status region that is not a list', () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: 'In-Fusion' }));
    const note = () => screen.getByTestId('switched-note');
    expect(note().textContent).toBe('');
    expect(note().getAttribute('role')).toBe('status');
    expect(note().tagName).toBe('DIV');
    stubBox();
    const surface = screen.getAllByTestId('diagram-surface')[0]!;
    fireEvent.pointerDown(surface, { clientX: 500, pointerId: 1 });
    fireEvent.pointerUp(surface, { clientX: 500, pointerId: 1 });
    expect((screen.getByLabelText('Linearize the vector by') as HTMLSelectElement).value).toBe('pcr-caret');
    expect(note().textContent).toMatch(/^Switched to inverse PCR at base [\d,]+; change this under “Linearize the vector by”\.$/);
    fireEvent.change(screen.getByLabelText('Linearize the vector by'), { target: { value: 'digest' } });
    expect(note().textContent).toBe('');
  });

  it('does not announce anything when the vector was already opened by inverse PCR', () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: 'In-Fusion' }));
    fireEvent.change(screen.getByLabelText('Linearize the vector by'), { target: { value: 'pcr-caret' } });
    stubBox();
    const surface = screen.getAllByTestId('diagram-surface')[0]!;
    fireEvent.pointerDown(surface, { clientX: 300, pointerId: 1 });
    fireEvent.pointerUp(surface, { clientX: 300, pointerId: 1 });
    expect(screen.getByTestId('switched-note').textContent).toBe('');
  });
});
