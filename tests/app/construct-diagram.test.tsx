import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/preact';
import { ConstructDiagram, spansOf } from '@/tools/cloning/hub/ConstructDiagram';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('spansOf', () => {
  it('returns one span inside the sequence and two when it wraps', () => {
    expect(spansOf(10, 20, 100)).toEqual([[10, 30]]);
    expect(spansOf(90, 20, 100)).toEqual([[90, 100], [0, 10]]);
    expect(spansOf(0, 100, 100)).toEqual([[0, 100]]);
    expect(spansOf(0, 0, 100)).toEqual([]);
  });
});

const primers = [
  { id: 'a', label: 'vec_fwd', strand: 'fwd' as const, start: 100, length: 25, tailLength: 20, tailColor: '#E69F00' },
  { id: 'b', label: 'vec_rev', strand: 'rev' as const, start: 75, length: 25, tailLength: 0, tailColor: '#E69F00' },
];

function stubWidth(width = 1000) {
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width, height: 120, right: width, bottom: 120, x: 0, y: 0, toJSON: () => ({}) });
}

describe('ConstructDiagram', () => {
  it('has an accessible summary and a labelled button per primer', () => {
    render(<ConstructDiagram title="vec: amplified region and primers" length={1000} color="#0072B2" region={{ start: 100, length: 900 }} primers={primers} />);
    expect(screen.getByRole('group', { name: /vec: amplified region and primers/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /vec_fwd, forward, 101–125, 20 nt tail/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /vec_rev, reverse, 76–100, no tail/ })).toBeTruthy();
  });

  it('reports the active primer on click and on Enter', () => {
    const onActive = vi.fn();
    render(<ConstructDiagram title="t" length={1000} color="#0072B2" primers={primers} onActive={onActive} />);
    const first = screen.getByRole('button', { name: /vec_fwd/ });
    fireEvent.click(first);
    expect(onActive).toHaveBeenLastCalledWith('a');
    fireEvent.keyDown(screen.getByRole('button', { name: /vec_rev/ }), { key: 'Enter' });
    expect(onActive).toHaveBeenLastCalledWith('b');
  });

  it('shows a focus ring on the focused primer and removes it on blur', () => {
    const { container } = render(<ConstructDiagram title="t" length={1000} color="#0072B2" primers={primers} />);
    const first = screen.getByRole('button', { name: /vec_fwd/ });
    expect(container.querySelector('[data-part="focus"]')).toBeNull();
    fireEvent.focus(first);
    expect(container.querySelectorAll('[data-part="focus"]')).toHaveLength(1);
    fireEvent.blur(first);
    expect(container.querySelector('[data-part="focus"]')).toBeNull();
  });

  it('picks a position (0-based) from a click on the axis', () => {
    stubWidth();
    const onPick = vi.fn();
    render(<ConstructDiagram title="t" length={1000} color="#0072B2" onPick={onPick} />);
    const surface = screen.getByTestId('diagram-surface');
    fireEvent.pointerDown(surface, { clientX: 500, pointerId: 1 });
    fireEvent.pointerUp(surface, { clientX: 500, pointerId: 1 });
    expect(onPick).toHaveBeenCalledTimes(1);
    const position = onPick.mock.calls[0]![0] as number;
    expect(position).toBeGreaterThan(480);
    expect(position).toBeLessThan(520);
  });

  it('picks a region from a drag, in increasing order', () => {
    stubWidth();
    const onRegion = vi.fn();
    render(<ConstructDiagram title="t" length={1000} color="#0072B2" onRegion={onRegion} />);
    const surface = screen.getByTestId('diagram-surface');
    fireEvent.pointerDown(surface, { clientX: 800, pointerId: 1 });
    fireEvent.pointerUp(surface, { clientX: 200, pointerId: 1 });
    const [start, end] = onRegion.mock.calls[0]! as [number, number];
    expect(start).toBeLessThan(end);
    expect(start).toBeGreaterThan(150);
    expect(end).toBeLessThan(850);
  });

  it('treats a small finger-sized movement as a pick and a long one as a region, measured in screen pixels', () => {
    stubWidth(1000);
    const onPick = vi.fn();
    const onRegion = vi.fn();
    render(<ConstructDiagram title="t" length={100000} color="#0072B2" onPick={onPick} onRegion={onRegion} />);
    const surface = screen.getByTestId('diagram-surface');
    fireEvent.pointerDown(surface, { clientX: 500, pointerId: 1 });
    fireEvent.pointerUp(surface, { clientX: 503, pointerId: 1 });
    expect(onPick).toHaveBeenCalledTimes(1);
    expect(onRegion).not.toHaveBeenCalled();
    fireEvent.pointerDown(surface, { clientX: 500, pointerId: 1 });
    fireEvent.pointerUp(surface, { clientX: 530, pointerId: 1 });
    expect(onRegion).toHaveBeenCalledTimes(1);
  });

  it('does not start a drag from a touch, but a touch tap still picks', () => {
    stubWidth(1000);
    const onPick = vi.fn();
    const onRegion = vi.fn();
    render(<ConstructDiagram title="t" length={1000} color="#0072B2" onPick={onPick} onRegion={onRegion} />);
    const surface = screen.getByTestId('diagram-surface');
    fireEvent.pointerDown(surface, { clientX: 500, pointerId: 1, pointerType: 'touch' });
    fireEvent.pointerUp(surface, { clientX: 700, pointerId: 1, pointerType: 'touch' });
    expect(onRegion).not.toHaveBeenCalled();
    fireEvent.pointerDown(surface, { clientX: 500, pointerId: 2, pointerType: 'touch' });
    fireEvent.pointerUp(surface, { clientX: 502, pointerId: 2, pointerType: 'touch' });
    expect(onPick).toHaveBeenCalledTimes(1);
  });

  it('leaves touch scrolling alone on a map that cannot be picked', () => {
    const { container } = render(<ConstructDiagram title="t" length={1000} color="#0072B2" />);
    expect(container.querySelector('svg')!.getAttribute('class')).not.toContain('touch-none');
  });

  it('draws a wrapped region as two bands and shows the removed stretch', () => {
    const { container } = render(<ConstructDiagram title="t" length={1000} color="#0072B2" region={{ start: 900, length: 300 }} removed={{ start: 200, length: 700 }} />);
    expect(container.querySelectorAll('[data-part="region"]')).toHaveLength(2);
    expect(container.querySelectorAll('[data-part="removed"]')).toHaveLength(1);
  });

  it('marks a position', () => {
    render(<ConstructDiagram title="t" length={1000} color="#0072B2" marker={{ position: 250, label: 'Insert here (251)' }} />);
    expect(screen.getByText('Insert here (251)')).toBeTruthy();
  });
});
