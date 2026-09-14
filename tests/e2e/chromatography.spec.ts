import { expect, test } from '@playwright/test';

test('Chromatography: maps a generic UV trace, accepts a peak, and keeps spectrum work in protein concentration', async ({ page }) => {
  // The smoke suite intentionally registers the PWA worker. Remove its old
  // precache before asserting against a newly built lazy-loaded tool chunk.
  await page.goto('/');
  await page.evaluate(async () => {
    await Promise.all((await navigator.serviceWorker.getRegistrations()).map(registration => registration.unregister()));
    await Promise.all((await caches.keys()).map(key => caches.delete(key)));
  });
  await page.goto('/#/t/sec');

  await page.getByRole('button', { name: 'Run & fractions' }).click();
  await page.getByLabel('Chromatogram CSV or TSV').fill([
    'Position,Reading',
    '0,0',
    '1,100',
    '2,1000',
    '3,100',
    '4,0',
  ].join('\n'));
  await page.getByLabel('Volume column').selectOption({ label: '0: Position' });
  await page.getByLabel('UV 280 column').selectOption({ label: '1: Reading' });

  await expect(page.getByLabel('Chromatogram raw and derived overlays')).toBeVisible();
  await page.getByRole('button', { name: 'Accept candidate 1' }).click();
  await expect(page.getByRole('heading', { name: 'Accepted peak details' })).toBeVisible();

  await page.goto('/#/t/protein-conc');
  await page.getByText('Import spectrum and adjust A280 for scattering').click();
  await expect(page.getByLabel('Spectrum CSV or TSV')).toBeVisible();
});
