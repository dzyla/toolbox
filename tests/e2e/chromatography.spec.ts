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

  await expect(page.getByLabel('Chromatogram analysis plot')).toBeVisible();
  await page.getByRole('button', { name: 'Accept candidate 1' }).click();
  await expect(page.getByRole('heading', { name: /Accepted peak details/ })).toBeVisible();

  await page.goto('/#/t/protein-conc');
  await page.getByText('Import spectrum and adjust A280 for scattering').click();
  await expect(page.getByLabel('Spectrum CSV or TSV')).toBeVisible();
});

test('Chromatography: plots ÅKTA injection and fractions with editable multi-peak review', async ({ page }) => {
  await page.goto('/#/t/sec');
  await page.getByRole('button', { name: 'Run & fractions' }).click();
  await page.getByLabel('Chromatogram CSV or TSV').fill([
    'Chrom.1\t\tChrom.1\t\tChrom.1\t\tChrom.1\t',
    'Fraction\t\tInjection\t\tCond\t\tUV\t',
    'ml\tFraction\tml\tInjection\tml\tmS/cm\tml\tmAU',
    '3\t"A1"\t1\t\t1\t30\t1\t0',
    '4\t"A2"\t\t\t2\t31\t2\t4',
    '5\t"A3"\t\t\t3\t32\t3\t0',
    '6\t"A4"\t\t\t4\t33\t4\t5',
    '7\t"A5"\t\t\t5\t34\t5\t0',
  ].join('\n'));

  await expect(page.getByText('Injection at 0.00 mL (instrument volume 1.000 mL)')).toBeVisible();
  await page.getByRole('button', { name: 'A1', exact: true }).click();
  await page.getByRole('button', { name: 'Focus selected fractions' }).click();
  await page.getByLabel('Color for UV').fill('#dc2626');
  await page.getByRole('button', { name: 'Accept candidate 1' }).click();
  await page.getByRole('button', { name: 'Accept candidate 2' }).click();
  await expect(page.getByRole('heading', { name: /Accepted peak details/ })).toHaveCount(2);
  await page.getByLabel('Peak 1 start').fill('1.5');
  await expect(page.getByText(/Peak 1 candidate;.*AU·mL/)).toBeVisible();
});

test('Chromatography: keeps a dense run interactive without an unbounded fraction-control list', async ({ page }) => {
  await page.goto('/#/t/sec');
  await page.getByRole('button', { name: 'Run & fractions' }).click();
  const rows = Array.from({ length: 25_000 }, (_, index) =>
    `${index},${Math.round((Math.sin(index / 220) + 1) * 500)},F${index + 1}`);
  const source = [
    'volume,uv280,fraction',
    ...rows,
  ].join('\n');
  await page.getByLabel('Import chromatogram file').setInputFiles({
    name: 'dense-run.asc',
    mimeType: 'text/plain',
    buffer: Buffer.from(source),
  });

  await expect(page.getByTestId('plotly-chromatogram-ready')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByLabel('Chromatogram analysis plot')).toBeVisible();
  await expect(page.getByRole('button', { name: /Select fraction/i })).toHaveCount(12);
  await page.getByRole('checkbox', { name: 'Show fractions' }).uncheck();
  await page.getByRole('checkbox', { name: 'Show fractions' }).check();
  await page.getByRole('button', { name: 'Use visible range' }).click();
  await page.getByRole('button', { name: 'Accept manual peak bounds' }).click();
  await expect(page.getByRole('heading', { name: /Accepted peak details/ })).toHaveCount(1);
  await page.screenshot({ path: 'test-results/chromatography-dense-desktop.png', fullPage: true });
});
