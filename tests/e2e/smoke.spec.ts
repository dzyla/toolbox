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

test('plasmid workspace navigation keeps the sequence viewport stable while selecting a base', async ({ page }) => {
  await page.goto('/#/t/plasmid');
  await expect(page.getByRole('heading', { name: /Plasmid Viewer & Map/ })).toBeVisible();
  await expect(page.getByTestId('plasmid-orf-summary')).toHaveText('7 ORFs · 50.7% GC');

  await page.getByRole('tab', { name: 'Sequence', exact: true }).click();
  const viewport = page.getByTestId('plasmid-sequence-viewport');
  await expect(viewport).toBeVisible();
  await viewport.evaluate(element => { element.scrollTop = 160; });
  await expect.poll(() => viewport.evaluate(element => element.scrollTop)).toBe(160);

  const base = page.getByRole('button', { name: 'Base 1', exact: true });
  await base.dispatchEvent('click');
  await expect(base).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByText('1–1 bp · forward', { exact: true })).toBeVisible();
  await expect.poll(() => viewport.evaluate(element => element.scrollTop)).toBe(160);
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
    'sec', 'diafiltration', 'dsf', 'detergent', 'unit-converter',
    'cryoem', 'fitting', 'protein', 'structure', 'protein-conc', 'nucleic', 'sequence', 'plasmid',
    'cloning', 'rare-codons', 'align', 'seq-matrix', 'binding', 'primers', 'tags', 'gel', 'measure', 'colonies', 'hemocytometer',
    'tally', 'plate', 'culture', 'timers', 'protocols', 'colors',
    'plate-reader',
  ];
  for (const id of readyTools) {
    const errors: string[] = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(`/#/t/${id}`);
    await expect(page.locator('h1')).toBeVisible();
    expect(errors, `Tool ${id} produced page errors`).toEqual([]);
  }
});
