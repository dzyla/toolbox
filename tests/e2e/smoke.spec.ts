import { test, expect } from '@playwright/test';

test('home lists tools and opens molarity with a shareable state', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('/');
  await expect(page.getByRole('searchbox')).toBeVisible();
  await page.getByRole('button', { name: /Molarity & Dilution/ }).click();
  await expect(page).toHaveURL(/#\/t\/molarity/);
  await expect(page.getByTestId('result')).toContainText('292.2 mg');
  await page.getByLabel('Target concentration', { exact: true }).fill('1 M');
  await expect(page.getByTestId('result')).toContainText('29.22 g');
  await expect(page).toHaveURL(/\?s=/);
  const url = page.url();
  await page.goto('/');
  await page.goto(url);
  await expect(page.getByTestId('result')).toContainText('29.22 g');
  expect(errors).toEqual([]);
});

test('dark mode toggle persists', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Toggle dark mode' }).click();
  const dark = await page.evaluate(() => document.documentElement.classList.contains('dark'));
  await page.reload();
  expect(await page.evaluate(() => document.documentElement.classList.contains('dark'))).toBe(dark);
});

test('service worker registers for offline use', async ({ page }) => {
  await page.goto('/');
  const ok = await page.evaluate(() => Promise.race([
    navigator.serviceWorker.ready.then(() => true),
    new Promise<boolean>(r => setTimeout(() => r(false), 8000)),
  ]));
  expect(ok).toBe(true);
});

test('all ready tools open without page errors', async ({ page }) => {
  const readyTools = [
    'molarity', 'buffers', 'centrifuge', 'master-mix', 'ammonium-sulfate',
    'cryoem', 'fitting', 'protein', 'protein-conc', 'nucleic', 'sequence', 'plasmid',
    'align', 'binding', 'gel', 'measure', 'colonies', 'hemocytometer',
    'tally', 'plate', 'culture', 'timers', 'protocols', 'colors',
  ];
  for (const id of readyTools) {
    const errors: string[] = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(`/#/t/${id}`);
    await expect(page.locator('h1')).toBeVisible();
    expect(errors, `Tool ${id} produced page errors`).toEqual([]);
  }
});
