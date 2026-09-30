import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/preact';
import { SourceStrip } from '@/tools/cloning/hub/SourceStrip';

afterEach(cleanup);

const segments = [
  { sourceIndex: 0, name: 'pUC19', start: 0, end: 600 },
  { sourceIndex: -1, name: 'spacer', start: 600, end: 606 },
  { sourceIndex: 1, name: 'GFP', start: 606, end: 1000 },
];
const marks = [{ label: 'Junction 1: pUC19 → GFP', start: 590, end: 620, kind: 'junction' as const, detail: '591 · 30-bp overlap' }];

describe('SourceStrip', () => {
  it('lists each source with number, name and range, and describes the strip to screen readers', () => {
    render(<SourceStrip length={1000} segments={segments} marks={marks} onSelect={() => {}} />);
    expect(screen.getByRole('img', { name: /pUC19.*GFP/ })).toBeTruthy();
    const legend = screen.getByRole('list', { name: 'Sources in the construct' });
    const items = within(legend).getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[0]!.textContent).toContain('1');
    expect(items[0]!.textContent).toContain('pUC19');
    expect(items[0]!.textContent).toContain('1–600');
    expect(items[1]!.textContent).toContain('GFP');
  });

  it('selects a source range from its legend button', () => {
    const onSelect = vi.fn();
    render(<SourceStrip length={1000} segments={segments} marks={marks} onSelect={onSelect} />);
    fireEvent.click(screen.getByRole('button', { name: /2 · GFP/ }));
    expect(onSelect).toHaveBeenCalledWith({ start: 606, end: 1000, source: 'analysis' });
  });

  it('marks the pressed source', () => {
    render(<SourceStrip length={1000} segments={segments} marks={marks} selection={{ start: 0, end: 600, source: 'analysis' }} onSelect={() => {}} />);
    expect(screen.getByRole('button', { name: /1 · pUC19/ }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: /2 · GFP/ }).getAttribute('aria-pressed')).toBe('false');
  });

  it('draws the spacer and each overlap as labelled shapes', () => {
    const { container } = render(<SourceStrip length={1000} segments={segments} marks={marks} onSelect={() => {}} />);
    expect(container.querySelector('[data-kind="spacer"]')).toBeTruthy();
    expect(container.querySelectorAll('[data-kind="overlap"]')).toHaveLength(1);
  });

  it('renders nothing for an empty product', () => {
    const { container } = render(<SourceStrip length={0} segments={[]} marks={[]} onSelect={() => {}} />);
    expect(container.textContent).toBe('');
  });
});
