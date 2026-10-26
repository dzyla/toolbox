import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const DIST = join(__dirname, '..', '..', 'dist');
const built = existsSync(join(DIST, 'index.html'));

// Only meaningful after `npm run build`; skipped when dist/ is absent.
describe.skipIf(!built)('Mol* chunk isolation (needs a built dist/)', () => {
  const assets = built ? readdirSync(join(DIST, 'assets')) : [];
  const js = assets.filter((f) => f.endsWith('.js'));

  it('the app shell does not reference the Mol* chunk or css', () => {
    expect(readFileSync(join(DIST, 'index.html'), 'utf8')).not.toMatch(/molstar/);
    const entry = js.filter((f) => /^index-/.test(f));
    for (const f of [...entry, ...js.filter((f) => /^(ToolLayout|vendor-ui)-/.test(f))]) {
      expect(readFileSync(join(DIST, 'assets', f), 'utf8'), f).not.toMatch(/molstar-/);
    }
  });

  it('only one lazy tool chunk imports Mol*, and the service worker does not precache it', () => {
    const importers = js.filter((f) => !f.startsWith('molstar-') && /molstar-/.test(readFileSync(join(DIST, 'assets', f), 'utf8')));
    expect(importers.length).toBeLessThanOrEqual(1);
    const sw = readFileSync(join(DIST, 'sw.js'), 'utf8');
    expect(sw).not.toMatch(/assets\/molstar-[\w-]+\.(js|css)["']/);
  });
});
