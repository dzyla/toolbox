import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { buildFcs } from '../core/fcs-builder';

// The page-level axe sweep sees the empty tool; check the loaded multi-sample views too.
for (const theme of ['light', 'dark'] as const) {
  test(`flow multi-sample views pass axe WCAG A/AA checks in ${theme} mode`, async ({ page }) => {
    await page.addInitScript(t => localStorage.setItem('bb.theme', t), theme);
    await page.goto('/#/t/flow');
    await page.getByRole('button', { name: /Load example/ }).click();
    await page.getByRole('button', { name: /Add split gate on FSC-A/ }).click();
    await page.getByRole('button', { name: 'Per sample' }).click();
    await page.addStyleTag({ content: '*, *::before, *::after { transition: none !important; animation: none !important; }' });
    const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    const failures = violations.flatMap(v => v.nodes.map(n => `${v.id}: ${n.html.slice(0, 160)}`));
    expect(failures, failures.join('\n')).toEqual([]);
  });
}

test('flow: example overlay, per-sample view, a split gate drawn on the plot, and the per-sample chart', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('/#/t/flow');
  await page.getByRole('button', { name: /Load example/ }).click();
  const plot = page.locator('canvas[role="img"]').first();
  await expect(plot).toHaveAttribute('aria-label', /all 4 samples pooled/);
  await page.getByRole('button', { name: 'Dots' }).click();
  await expect(plot).toHaveAttribute('aria-label', /overlay of 4 samples/);
  await page.getByRole('button', { name: '2-D density' }).click();

  await page.getByRole('button', { name: 'Per sample' }).click();
  await expect(page.getByRole('img', { name: /sample .*, all events\.$/ })).toHaveCount(4);

  await page.getByRole('button', { name: 'Single sample' }).click();
  await expect(plot).toHaveAttribute('aria-label', /sample Unstained/);
  await page.getByRole('button', { name: 'Next sample' }).click();
  await page.getByRole('button', { name: 'Next sample' }).click();
  await expect(plot).toHaveAttribute('aria-label', /sample Stim 6 h/);

  // CD4 histogram (FL2-A, arcsinh) on the overlay, split by clicking the plot.
  await page.getByRole('button', { name: 'All samples' }).click();
  await page.getByLabel('X parameter').selectOption('FL2-A');
  await page.getByRole('button', { name: 'Histogram' }).click();
  await page.getByRole('group', { name: 'Drawing tool' }).getByRole('button', { name: 'Split' }).click();
  const box = (await plot.boundingBox())!;
  await page.mouse.click(box.x + box.width * 0.62, box.y + box.height * 0.5);
  await expect(page.getByRole('rowheader', { name: 'CD4+', exact: true })).toHaveCount(1);
  await expect(plot).toHaveAttribute('aria-label', /Gates: CD4−; CD4\+/);

  // Drag the line: both halves move together (the threshold field follows).
  const threshold = page.getByLabel('Threshold');
  const before = Number(await threshold.inputValue());
  await page.mouse.move(box.x + box.width * 0.62, box.y + box.height * 0.5);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5, { steps: 5 });
  await page.mouse.up();
  await expect.poll(async () => Number(await threshold.inputValue())).toBeLessThan(before);

  await page.getByLabel('Population compared').selectOption({ label: 'CD4+' });
  const chart = page.getByRole('img', { name: /^Bar chart of % of parent for CD4\+, per sample: Unstained/ });
  await expect(chart).toBeVisible();
  await expect(chart.locator('rect')).toHaveCount(4);
  await page.getByRole('button', { name: 'Events', exact: true }).click();
  await expect(page.getByRole('img', { name: /^Bar chart of Events for CD4\+/ })).toBeVisible();
  expect(errors).toEqual([]);
});

test('flow: several files parse in workers and share one gate tree', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  const a = buildFcs({ datatype: 'F', params: [{ name: 'FSC-A' }, { name: 'SSC-A' }], events: [[10, 1], [20, 2], [30, 3], [40, 4]] });
  const b = buildFcs({ datatype: 'F', params: [{ name: 'SSC-A' }, { name: 'FSC-A' }], events: [[5, 50], [6, 60]] });
  await page.goto('/#/t/flow');
  await page.getByLabel('Choose FCS files').setInputFiles([
    { name: 'a.fcs', mimeType: 'application/octet-stream', buffer: Buffer.from(a) },
    { name: 'b.fcs', mimeType: 'application/octet-stream', buffer: Buffer.from(b) },
  ]);
  await expect(page.getByRole('list', { name: 'Samples' }).getByRole('listitem')).toHaveCount(2);
  await page.getByRole('button', { name: 'Add split gate on FSC-A' }).click();
  await page.getByLabel('Threshold').fill('25');
  await page.getByLabel('Threshold').blur();
  const table = page.getByRole('table', { name: /in each sample/ });
  await expect(table.getByRole('row')).toHaveCount(3);
  await expect(table.getByRole('row').nth(1)).toContainText('a.fcs2');
  await expect(table.getByRole('row').nth(2)).toContainText('b.fcs0');
  expect(errors).toEqual([]);
});
