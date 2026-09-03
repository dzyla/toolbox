import { describe, it, expect } from 'vitest';
import { decodeTiff, isTiff, rgbaToPlane, ImageDecodeError } from '@/lib/image';

/** Minimal uncompressed TIFF writer (single strip) for tests: either byte order, 8/16-bit, 1 or 3 samples. */
function makeTiff(opts: { width: number; height: number; bps: 8 | 16; samples: 1 | 3; littleEndian: boolean; pixels: number[]; photometric?: number }): ArrayBuffer {
  const { width, height, bps, samples, littleEndian: le, pixels } = opts;
  const bytesPerSample = bps / 8;
  const stripBytes = width * height * samples * bytesPerSample;
  const entries: [number, number, number, number[]][] = [
    [256, 3, 1, [width]], [257, 3, 1, [height]], [258, 3, samples, Array(samples).fill(bps)], [259, 3, 1, [1]],
    [262, 3, 1, [opts.photometric ?? (samples === 3 ? 2 : 1)]], [273, 4, 1, [0]], [277, 3, 1, [samples]], [278, 3, 1, [height]], [279, 4, 1, [stripBytes]],
  ];
  const ifdOffset = 8;
  const ifdSize = 2 + entries.length * 12 + 4;
  let extraOffset = ifdOffset + ifdSize;
  const extras: { offset: number; type: number; values: number[] }[] = [];
  for (const e of entries) { if (e[2] > 2 && e[1] === 3) { extras.push({ offset: extraOffset, type: 3, values: e[3] }); extraOffset += e[2] * 2; } }
  const stripOffset = extraOffset;
  const total = stripOffset + stripBytes;
  const buf = new ArrayBuffer(total);
  const dv = new DataView(buf);
  dv.setUint8(0, le ? 0x49 : 0x4d); dv.setUint8(1, le ? 0x49 : 0x4d); dv.setUint16(2, 42, le); dv.setUint32(4, ifdOffset, le);
  dv.setUint16(ifdOffset, entries.length, le);
  let p = ifdOffset + 2, ex = 0;
  for (const [tag, type, count, values] of entries) {
    dv.setUint16(p, tag, le); dv.setUint16(p + 2, type, le); dv.setUint32(p + 4, count, le);
    if (tag === 273) dv.setUint32(p + 8, stripOffset, le);
    else if (count > 2 && type === 3) { dv.setUint32(p + 8, extras[ex]!.offset, le); ex++; }
    else if (type === 3) dv.setUint16(p + 8, values[0]!, le);
    else dv.setUint32(p + 8, values[0]!, le);
    p += 12;
  }
  dv.setUint32(p, 0, le);
  for (const e of extras) e.values.forEach((v, i) => dv.setUint16(e.offset + i * 2, v, le));
  pixels.forEach((v, i) => { if (bps === 8) dv.setUint8(stripOffset + i, v); else dv.setUint16(stripOffset + i * 2, v, le); });
  return buf;
}

describe('image decoding', () => {
  it('detects TIFF magic', () => {
    expect(isTiff(new Uint8Array([0x49, 0x49, 0x2a, 0, 8, 0, 0, 0]))).toBe(true);
    expect(isTiff(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0]))).toBe(false);
  });
  it('decodes 8-bit grayscale TIFF to 0..1', () => {
    const img = decodeTiff(makeTiff({ width: 3, height: 2, bps: 8, samples: 1, littleEndian: true, pixels: [0, 128, 255, 51, 102, 153] }));
    expect(img.width).toBe(3); expect(img.height).toBe(2); expect(img.bitDepth).toBe(8);
    expect(Array.from(img.data).map(v => Math.round(v * 255))).toEqual([0, 128, 255, 51, 102, 153]);
    expect(img.rgba).toBeUndefined();
  });
  it('decodes 16-bit grayscale TIFF in both byte orders', () => {
    for (const le of [true, false]) {
      const img = decodeTiff(makeTiff({ width: 2, height: 2, bps: 16, samples: 1, littleEndian: le, pixels: [0, 65535, 4095, 32768] }));
      expect(img.bitDepth).toBe(16);
      expect(Array.from(img.data).map(v => Math.round(v * 65535))).toEqual([0, 65535, 4095, 32768]);
    }
  });
  it('decodes RGB TIFF to luminance and keeps the colour source', () => {
    const img = decodeTiff(makeTiff({ width: 1, height: 1, bps: 8, samples: 3, littleEndian: true, pixels: [255, 0, 0] }));
    expect(img.data[0]).toBeCloseTo(0.299, 3);
    expect(img.rgba && Array.from(img.rgba)).toEqual([255, 0, 0, 255]);
  });
  it('honours WhiteIsZero', () => {
    const img = decodeTiff(makeTiff({ width: 1, height: 1, bps: 8, samples: 1, littleEndian: true, pixels: [0], photometric: 0 }));
    expect(img.data[0]).toBe(1);
  });
  it('throws a typed error on junk', () => {
    expect(() => decodeTiff(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]).buffer)).toThrow(ImageDecodeError);
  });
  it('rgbaToPlane uses Rec. 601 weights', () => {
    const p = rgbaToPlane(new Uint8ClampedArray([255, 255, 255, 255, 0, 255, 0, 255]), 2, 1);
    expect(p[0]).toBeCloseTo(1, 5); expect(p[1]).toBeCloseTo(0.587, 3);
  });
});
