import { expect, test } from '@playwright/test';

test('sequence matrix computes in a worker and renders the result', async ({ page }) => {
  const workers: string[] = [];
  page.on('worker', w => workers.push(w.url()));
  await page.goto('/#/t/seq-matrix');
  await expect(page.getByText(/Mean Pairwise Identity/i).first()).toBeVisible({ timeout: 20_000 });
  expect(workers.some(u => /matrix\.worker/.test(u))).toBe(true);
});
