import { expect, test } from '@playwright/test';

test('structure page renders the 3D viewer locally without contacting molstar.org', async ({ page }) => {
  const external: string[] = [];
  page.on('request', r => {
    if (/molstar\.org/.test(r.url())) external.push(r.url());
  });
  await page.goto('/#/t/structure');
  const canvas = page.locator('[aria-label*="3D Backbone Canvas"] canvas').first();
  await expect(canvas).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('iframe')).toHaveCount(0);
  expect(external).toEqual([]);
});
