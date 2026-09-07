import { describe, it, expect } from 'vitest';
import {
  applyDisplayTransform,
  buildGelSvg,
  estimateTextWidth,
  DEFAULT_DISPLAY,
  type BandAnnotation,
  type GelSvgInput,
} from '@/core/gel/svg-export';
import type { Lane } from '@/core/gel/types';

function plane(width: number, height: number, fill: number): Float32Array {
  return new Float32Array(width * height).fill(fill);
}

describe('applyDisplayTransform (matches the on-screen pipeline order)', () => {
  it('identity for the default display', () => {
    const p = plane(2, 2, 0.42);
    for (const v of applyDisplayTransform(p, DEFAULT_DISPLAY)) expect(v).toBeCloseTo(0.42, 5);
  });

  it('clips contrast range and applies gamma before contrast and brightness', () => {
    // value 0.5 in clip [0.25, 1.0] -> (0.5-0.25)/0.75 = 1/3
    const p = plane(1, 1, 0.5);
    const out = applyDisplayTransform(p, { brightness: 1, contrast: 2, minClip: 0.25, maxClip: 1, gamma: 1, invert: false });
    // (1/3 - 0.5) * 2 + 0.5 = 1/6
    expect(out[0]).toBeCloseTo(1 / 6, 5);
  });

  it('inverts last', () => {
    const p = plane(1, 1, 0.2);
    const out = applyDisplayTransform(p, { ...DEFAULT_DISPLAY, invert: true });
    expect(out[0]).toBeCloseTo(0.8, 5);
  });

  it('clamps output to 0..1', () => {
    const p = plane(1, 1, 0.9);
    const out = applyDisplayTransform(p, { ...DEFAULT_DISPLAY, brightness: 2 });
    expect(out[0]).toBe(1);
  });

  it('never mutates the input plane', () => {
    const p = plane(1, 1, 0.3);
    applyDisplayTransform(p, { ...DEFAULT_DISPLAY, invert: true });
    expect(p[0]).toBeCloseTo(0.3, 5);
  });
});

describe('estimateTextWidth', () => {
  it('scales with length and font size', () => {
    expect(estimateTextWidth('abc', 10)).toBe(18);
    expect(estimateTextWidth('abcd', 10)).toBe(estimateTextWidth('abc', 10) + 6);
  });
});

describe('buildGelSvg', () => {
  const lanes: Lane[] = [
    { id: 'a', x: 40, y0: 0, y1: 100, width: 20, tilt: 0 },
    { id: 'b', x: 100, y0: 0, y1: 100, width: 20, tilt: 0 },
  ];
  const bands: BandAnnotation[] = [
    { laneId: 'b', y: 30, sizeText: '55 kDa', massText: '120 ng' },
    { laneId: 'b', y: 70, sizeText: '25 kDa' },
  ];

  function base(over: Partial<GelSvgInput> = {}): GelSvgInput {
    return {
      width: 120,
      height: 100,
      imageDataUrl: 'data:image/png;base64,AAAA',
      display: DEFAULT_DISPLAY,
      lanes,
      bands,
      ...over,
    };
  }

  it('emits a standalone svg with embedded image href', () => {
    const svg = buildGelSvg(base());
    expect(svg).toContain('<svg xmlns="http://www.w3.org/2000/svg"');
    expect(svg).toContain('href="data:image/png;base64,AAAA"');
    expect(svg.trim().endsWith('</svg>')).toBe(true);
  });

  it('draws one lane rect per lane and headers when enabled', () => {
    const svg = buildGelSvg(base());
    const laneRects = (svg.match(/<rect[^>]*stroke="#(?:2563eb|d97706|64748b)"/g) || []).length;
    expect(laneRects).toBe(2);
    expect(svg).toContain('L1');
    expect(svg).toContain('L2');
  });

  it('omits headers when showHeaders is false', () => {
    const svg = buildGelSvg(base({ showHeaders: false }));
    expect(svg).not.toContain('>L1<');
  });

  it('marks the ladder lane in amber and the selected lane in blue', () => {
    const svg = buildGelSvg(base({ ladderLaneId: 'a', selectedLaneId: 'b' }));
    expect(svg).toContain('stroke="#d97706"');
    expect(svg).toContain('stroke="#2563eb"');
  });

  it('draws band lines, size labels on the right, mass labels on the left', () => {
    const svg = buildGelSvg(base({ showMassLabels: true }));
    expect(svg).toContain('55 kDa');
    expect(svg).toContain('120 ng');
    // band at y=30 -> line at imgY+30 (imgY = HEADER_H = 64)
    expect(svg).toContain('y1="94"');
  });

  it('omits size labels when showMwLabels is false', () => {
    const svg = buildGelSvg(base({ showMwLabels: false }));
    expect(svg).not.toContain('55 kDa');
  });

  it('skips bands whose lane no longer exists', () => {
    const svg = buildGelSvg(base({ lanes: [lanes[0]!] }));
    expect(svg).not.toContain('55 kDa');
  });

  it('escapes XML in the title and footnote', () => {
    const svg = buildGelSvg(base({ title: 'A < B & C', footnote: 'method = "x"' }));
    expect(svg).toContain('A &lt; B &amp; C');
    expect(svg).toContain('method = &quot;x&quot;');
  });

  it('adds a footnote strip when provided', () => {
    const withFoot = buildGelSvg(base({ footnote: 'Bio-Bench' }));
    const without = buildGelSvg(base());
    expect(withFoot).toContain('Bio-Bench');
    // height grows by the footnote strip
    const h = (s: string) => Number(/height="(\d+)" viewBox/.exec(s)![1]);
    expect(h(withFoot)).toBe(h(without) + 30);
  });
});
