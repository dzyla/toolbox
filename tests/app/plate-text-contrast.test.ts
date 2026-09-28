import { describe, expect, it } from 'vitest';
import { getWellTextColor, readableTextOn } from '@/tools/plate/PlateChassis';
import { contrastRatio } from '@/core/colors/contrast';

describe('well label contrast', () => {
  it('uses white on dark viridis fills and dark ink on light ones', () => {
    expect(readableTextOn('#440154')).toBe('#ffffff');
    expect(readableTextOn('rgb(68, 1, 84)')).toBe('#ffffff');
    expect(readableTextOn('#fde725')).toBe('#000000');
    expect(readableTextOn('rgba(253, 231, 37, 0.8)')).toBe('#000000');
    expect(getWellTextColor('#440154')).toMatch(/text-white/);
  });

  it('meets WCAG AA text contrast (4.5:1) across the viridis range', () => {
    for (const fill of ['#440154', '#3b528b', '#21918c', '#5ec962', '#fde725']) {
      expect(contrastRatio(fill, readableTextOn(fill))).toBeGreaterThanOrEqual(4.5);
    }
  });
});
