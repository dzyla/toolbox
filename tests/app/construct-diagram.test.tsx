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

  it('rings the whole primer and its tail, forward tail on the left', () => {
    const { container } = render(<ConstructDiagram title="t" length={1000} color="#0072B2" primers={primers} activeId="a" />);
    const rings = container.querySelectorAll('[data-part="active"]');
    expect(rings).toHaveLength(1);
    const tail = container.querySelector('[data-part="tail"]')!;
    const ring = rings[0]!;
    expect(Number(ring.getAttribute('x'))).toBeLessThan(Number(tail.getAttribute('x')));
    expect(Number(ring.getAttribute('x')) + Number(ring.getAttribute('width'))).toBeGreaterThan(Number(tail.getAttribute('x')) + Number(tail.getAttribute('width')));
  });

  it('rings every stretch of a primer that wraps the origin, with the forward tail on the first stretch', () => {
    const wrapped = [{ id: 'w', label: 'wrap_fwd', strand: 'fwd' as const, start: 980, length: 40, tailLength: 30, tailColor: '#E69F00' }];
    const { container } = render(<ConstructDiagram title="t" length={1000} color="#0072B2" primers={wrapped} activeId="w" />);
    fireEvent.focus(screen.getByRole('button', { name: /wrap_fwd/ }));
    for (const part of ['active', 'focus']) {
      const rings = [...container.querySelectorAll(`[data-part="${part}"]`)];
      expect(rings, part).toHaveLength(2);
      const box = (node: Element) => ({ left: Number(node.getAttribute('x')), right: Number(node.getAttribute('x')) + Number(node.getAttribute('width')) });
      const tail = container.querySelector('[data-part="tail"]')!;
      const tailLeft = Number(tail.getAttribute('x'));
      // The first stretch (980–1000, at the right edge) carries the tail on its left; the second (0–20) starts at the left edge.
      expect(box(rings[0]!).left).toBeLessThan(tailLeft);
      expect(box(rings[0]!).right).toBeGreaterThan(24 + 0.98 * 952 + 15);
      expect(box(rings[1]!).left).toBeLessThan(24);
      expect(box(rings[1]!).right).toBeGreaterThan(24 + 0.02 * 952);
      expect(box(rings[1]!).right).toBeLessThan(24 + 0.02 * 952 + 12);
    }
  });

  it('puts a reverse tail on the right of the last stretch of a wrapped primer', () => {
    const wrapped = [{ id: 'r', label: 'wrap_rev', strand: 'rev' as const, start: 980, length: 40, tailLength: 30, tailColor: '#E69F00' }];
    const { container } = render(<ConstructDiagram title="t" length={1000} color="#0072B2" primers={wrapped} activeId="r" />);
    const rings = [...container.querySelectorAll('[data-part="active"]')];
    expect(rings).toHaveLength(2);
    const tail = container.querySelector('[data-part="tail"]')!;
    const tailRight = Number(tail.getAttribute('x')) + Number(tail.getAttribute('width'));
    const last = rings[1]!;
    expect(Number(last.getAttribute('x')) + Number(last.getAttribute('width'))).toBeGreaterThan(tailRight);
    const first = rings[0]!;
    expect(Number(first.getAttribute('x')) + Number(first.getAttribute('width'))).toBeLessThan(1000);
  });

  it('draws arrows in the theme text colour with a contrasting outline', () => {
    const { container } = render(<ConstructDiagram title="t" length={1000} color="#0072B2" primers={primers} />);
    const arrow = container.querySelector('polygon')!;
    expect(arrow.getAttribute('fill')).toBe('currentColor');
    expect(arrow.getAttribute('class')).toContain('stroke-white');
    expect(arrow.getAttribute('class')).toContain('dark:stroke-slate-900');
    expect(container.querySelector('svg')!.getAttribute('class')).toMatch(/text-slate-900 dark:text-slate-100/);
  });

  it('keeps pattern ids unique per diagram and stable across renders', () => {
    const ids = () => [...document.querySelectorAll('pattern')].map(node => node.id);
    const { rerender } = render(<div><ConstructDiagram title="a" length={1000} color="#0072B2" primers={primers} /><ConstructDiagram title="b" length={1000} color="#0072B2" primers={primers} /></div>);
    const first = ids();
    expect(first).toHaveLength(4);
    expect(new Set(first).size).toBe(4);
    rerender(<div><ConstructDiagram title="a2" length={1000} color="#0072B2" primers={primers} /><ConstructDiagram title="b2" length={1000} color="#0072B2" primers={primers} /></div>);
    expect(ids()).toEqual(first);
  });

  it('advances the instance counter once per diagram, not once per render', () => {
    const number = () => Number(/^d(\d+)-/.exec(document.querySelector('pattern')!.id)![1]);
    const one = render(<ConstructDiagram title="a" length={1000} color="#0072B2" />);
    const before = number();
    for (let i = 0; i < 5; i++) one.rerender(<ConstructDiagram title={`a${i}`} length={1000} color="#0072B2" />);
    cleanup();
    render(<ConstructDiagram title="b" length={1000} color="#0072B2" />);
    expect(number()).toBe(before + 1);
  });

  it('falls back to the bounding box when the screen matrix cannot be inverted', () => {
    stubWidth();
    const proto = SVGSVGElement.prototype as unknown as Record<string, unknown>;
    const saved = { ctm: proto.getScreenCTM, point: proto.createSVGPoint };
    proto.getScreenCTM = () => ({ inverse: () => { throw new Error('singular'); } });
    proto.createSVGPoint = () => ({ x: 0, y: 0, matrixTransform: () => ({ x: 0 }) });
    try {
      const onPick = vi.fn();
      render(<ConstructDiagram title="t" length={1000} color="#0072B2" onPick={onPick} />);
      const surface = screen.getByTestId('diagram-surface');
      fireEvent.pointerDown(surface, { clientX: 500, pointerId: 1 });
      expect(() => fireEvent.pointerUp(surface, { clientX: 500, pointerId: 1 })).not.toThrow();
      const position = onPick.mock.calls[0]![0] as number;
      expect(position).toBeGreaterThan(480);
      expect(position).toBeLessThan(520);
    } finally {
      proto.getScreenCTM = saved.ctm;
      proto.createSVGPoint = saved.point;
    }
  });
});
