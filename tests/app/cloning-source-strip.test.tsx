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

  it('gives each strip its own hatch pattern, and every reference points at it', () => {
    const { container, rerender } = render(<div><SourceStrip length={1000} segments={segments} marks={marks} onSelect={() => {}} /><SourceStrip length={1000} segments={segments} marks={marks} onSelect={() => {}} /></div>);
    const patterns = [...container.querySelectorAll('pattern')].map(node => node.id);
    expect(patterns).toHaveLength(2);
    expect(new Set(patterns).size).toBe(2);
    expect(patterns).not.toContain('overlap-hatch');
    const refs = [...container.querySelectorAll('[fill^="url(#"]')].map(node => /url\(#(.+)\)/.exec(node.getAttribute('fill')!)![1]);
    expect(refs).toHaveLength(4);
    expect(new Set(refs)).toEqual(new Set(patterns));
    rerender(<div><SourceStrip length={1000} segments={segments} marks={marks} onSelect={() => {}} /><SourceStrip length={1000} segments={segments} marks={marks} onSelect={() => {}} /></div>);
    expect([...container.querySelectorAll('pattern')].map(node => node.id)).toEqual(patterns);
  });
});
