import { expect, test, type Page } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';

// Regression tests for "Mol* does not load when a new structure is loaded": one long-lived Mol*
// plugin, structures swapped in through a queued load. Assertions read the viewer host's
// data-loaded-label (label read back from the Mol* state tree) and data-load-count, not pixels.

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', 'structure');

/** RCSB entry text from tests/fixtures/structure (`<ID>.cif`, or `<ID>.cif.gz` gunzipped). */
function fixtureCif(id: string): string | null {
  const plain = join(FIXTURES, `${id}.cif`);
  if (existsSync(plain)) return readFileSync(plain, 'utf8');
  const gz = join(FIXTURES, `${id}.cif.gz`);
  if (existsSync(gz)) return gunzipSync(readFileSync(gz)).toString('utf8');
  return null;
}

/** Serve RCSB downloads from fixtures; anything else is a 404. Never reaches the network. */
async function routeRcsb(page: Page) {
  await page.route('https://files.rcsb.org/download/**', async route => {
    const m = /\/download\/([^/?#]+)\.cif(?:[?#].*)?$/i.exec(route.request().url());
    const text = m ? fixtureCif(m[1]!.toUpperCase()) : null;
    if (text === null) return route.fulfill({ status: 404, body: 'not a fixture' });
    return route.fulfill({ status: 200, contentType: 'chemical/x-mmcif', body: text });
  });
}

const host = (page: Page) => page.locator('[data-loaded-label]').first();

async function expectLoaded(page: Page, label: string) {
  await expect(page.locator(`[data-loaded-label="${label}"]`)).toHaveCount(1, { timeout: 30_000 });
}

test.beforeEach(async ({ page }) => {
  await routeRcsb(page);
});

// enabled in Task 7: needs the "PDB ID" input fetching <ID>.cif and the bundled 1UBQ demo.
test.fixme('loads three structures in a row and Mol* shows each', async ({ page }) => {
  await page.goto('/#/t/structure');
  await expectLoaded(page, '1UBQ');

  const idBox = page.getByLabel('PDB ID', { exact: true });
  await idBox.fill('4HHB');
  await idBox.press('Enter');
  await expectLoaded(page, '4HHB');

  await page.locator('input[type=file]').first().setInputFiles(join(FIXTURES, '3KZ5.cif'));
  await expectLoaded(page, '3KZ5');
  await expect(host(page).locator('canvas').first()).toBeVisible();
});

// enabled in Task 7: needs presets fetching <ID>.cif and the [data-testid="structure-header"] card.
test.fixme('rapid preset clicks end on the last one', async ({ page }) => {
  await page.goto('/#/t/structure');
  await expectLoaded(page, '1UBQ');

  // Fire all three without waiting for any load to finish.
  await page.getByRole('button', { name: /4HHB/ }).click();
  await page.getByRole('button', { name: /1CRN/ }).click();
  await page.getByRole('button', { name: /1AKI/ }).click();

  await expectLoaded(page, '1AKI');
  await expect(page.getByTestId('structure-header')).toContainText('1AKI');
  // Nothing finishing late may replace the last one.
  await page.waitForTimeout(1500);
  await expect(host(page)).toHaveAttribute('data-loaded-label', '1AKI');
});

test('toggling Mol* panels and canvas size does not reload the structure', async ({ page }) => {
  await page.goto('/#/t/structure');
  const viewer = host(page);
  await expect(viewer).toHaveAttribute('data-load-count', '1', { timeout: 30_000 });
  const label = await viewer.getAttribute('data-loaded-label');
  expect(label).toBeTruthy();
  const canvas = viewer.locator('canvas').first();
  await expect(canvas).toBeVisible();
  const before = (await canvas.boundingBox())!.height;

  const panels = page.getByRole('button', { name: /Mol\* panels/i });
  await panels.click();
  await expect(viewer.locator('.msp-layout-left')).toBeVisible();
  await panels.click();
  const size = page.getByRole('button', { name: /Large canvas/i });
  await size.click();
  await expect.poll(async () => (await canvas.boundingBox())!.height, { timeout: 5_000 }).toBeGreaterThan(before);
  await size.click();

  await page.waitForTimeout(1000);
  await expect(viewer).toHaveAttribute('data-load-count', '1');
  await expect(viewer).toHaveAttribute('data-loaded-label', label!);
  await expect(viewer.locator('canvas')).toHaveCount(1);
});
