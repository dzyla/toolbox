import { describe, expect, it } from 'vitest';
import { LEGACY_NAVIGATION, RUNTIME_CACHING } from '../../vite.config';

describe('service worker navigation fallback', () => {
  it('lets legacy pages through at the site root and under the GitHub Pages base path', () => {
    expect(LEGACY_NAVIGATION.test('/legacy/bio_bench.html')).toBe(true);
    expect(LEGACY_NAVIGATION.test('/toolbox/legacy/bio_bench.html')).toBe(true);
    expect(LEGACY_NAVIGATION.test('/toolbox/')).toBe(false);
    expect(LEGACY_NAVIGATION.test('/toolbox/index.html')).toBe(false);
  });
});

describe('runtime caches', () => {
  it('RCSB structure files expire after 30 days as well as by entry count', () => {
    const rcsb = RUNTIME_CACHING.find(c => c.options?.cacheName === 'rcsb-structures');
    expect(rcsb?.options?.expiration).toEqual({ maxEntries: 30, maxAgeSeconds: 30 * 24 * 3600 });
  });
});
