import { describe, it, expect } from 'vitest';
import { sourceInfoOf } from '@/lib/image';

describe('sourceInfoOf', () => {
  it('flags JPEG and WebP as lossy', () => {
    expect(sourceInfoOf({ format: 'jpeg', bitDepth: 8, rescaled: false }).lossy).toBe(true);
    expect(sourceInfoOf({ format: 'webp', bitDepth: 8, rescaled: false }).lossy).toBe(true);
    expect(sourceInfoOf({ format: 'png', bitDepth: 8, rescaled: false }).lossy).toBe(false);
  });
  it('passes the rescaled flag of float TIFF through', () => {
    expect(sourceInfoOf({ format: 'tiff', bitDepth: 32, rescaled: true })).toEqual({ format: 'tiff', bitDepth: 32, lossy: false, rescaled: true });
  });
});
