import { expect, test } from '@playwright/test';
import { READY_TOOLS } from './tools';

// A phone-sized, touch-enabled viewport: PWA use on phones is a stated goal.
const WIDTH = 390;
test.use({ viewport: { width: WIDTH, height: 844 }, hasTouch: true });

/**
 * The app clips horizontal overflow on html/body, so document.scrollWidth cannot reveal content that is
 * cut off. Instead list visible elements that extend past the viewport and are not inside their own
 * horizontally scrollable container, which is where a phone user would lose content.
 */
async function escapingElements(page: import('@playwright/test').Page): Promise<string[]> {
  return page.evaluate(vw => {
    const out: string[] = [];
    const clips = (el: Element) => /(auto|scroll)/.test(getComputedStyle(el).overflowX);
    for (const el of Array.from(document.body.querySelectorAll('*'))) {
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden' || cs.position === 'fixed') continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0 || r.right <= vw + 1) continue;
      if (el.closest('.sr-only, [aria-hidden="true"], svg')) continue;
      let clipped = false;
      for (let p: Element | null = el.parentElement; p && p !== document.body && p !== document.documentElement; p = p.parentElement) {
        if (clips(p)) { clipped = true; break; }
      }
      if (!clipped) out.push(`${el.tagName.toLowerCase()}${el.className && typeof el.className === 'string' ? '.' + el.className.split(/\s+/).slice(0, 3).join('.') : ''} right=${Math.round(r.right)}`);
    }
    return out.slice(0, 5);
  }, WIDTH);
}

test('home page fits a phone screen', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('searchbox')).toBeVisible();
  expect(await escapingElements(page)).toEqual([]);
});

// The buffer row only appears after switching a component to "Buffer", so the tool sweep never sees it.
test('a buffer row shows its pKa source without escaping a phone screen', async ({ page }) => {
  await page.goto('/#/t/buffers');
  await page.getByRole('button', { name: 'Buffer', exact: true }).click();
  await expect(page.getByText(/pKa source/)).toBeVisible();
  await expect(page.getByTestId('ph-check')).toBeVisible();
  expect(await escapingElements(page)).toEqual([]);
});

for (const id of READY_TOOLS) {
  test(`${id} opens on a phone without errors or horizontal page scroll`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(`/#/t/${id}`);
    await page.locator('h1').first().waitFor();
    // Let lazy chunks and first renders settle.
    await page.waitForLoadState('networkidle');
    expect(await escapingElements(page), `${id}: content extends past the ${WIDTH}px viewport`).toEqual([]);
    expect(errors).toEqual([]);
  });
}
