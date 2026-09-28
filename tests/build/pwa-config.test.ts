import { describe, expect, it } from 'vitest';
import { LEGACY_NAVIGATION } from '../../vite.config';

describe('service worker navigation fallback', () => {
  it('lets legacy pages through at the site root and under the GitHub Pages base path', () => {
    expect(LEGACY_NAVIGATION.test('/legacy/bio_bench.html')).toBe(true);
    expect(LEGACY_NAVIGATION.test('/toolbox/legacy/bio_bench.html')).toBe(true);
    expect(LEGACY_NAVIGATION.test('/toolbox/')).toBe(false);
    expect(LEGACY_NAVIGATION.test('/toolbox/index.html')).toBe(false);
  });
});
