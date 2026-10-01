import { expect, test } from '@playwright/test';

test('cryo-EM templates are generated in a worker pool', async ({ page }) => {
  const workers: string[] = [];
  page.on('worker', w => workers.push(w.url()));
  await page.goto('/#/t/cryoem');
  await page.getByRole('button', { name: /2D Classes & 3D Volume/i }).click();
  await page.getByRole('button', { name: /Demo 3D Volume/i }).click();
  await page.getByRole('button', { name: /Template series/i }).click();
  await page.getByLabel('Angular spacing').fill('45');
  await page.getByRole('button', { name: /Generate templates/i }).click();
  await expect(page.getByText(/\d+ projections/)).toBeVisible({ timeout: 30_000 });
  expect(workers.some(u => /template\.worker/.test(u))).toBe(true);
});

test('DSF analysis runs in a worker and renders results', async ({ page }) => {
  const workers: string[] = [];
  page.on('worker', w => workers.push(w.url()));
  await page.goto('/#/t/dsf');
  await expect(page.getByText(/Analysing melt curves/i)).toHaveCount(0, { timeout: 20_000 });
  await expect.poll(() => workers.some(u => /dsf\.worker/.test(u)), { timeout: 20_000 }).toBe(true);
});
