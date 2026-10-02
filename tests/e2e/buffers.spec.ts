import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

for (const theme of ['light', 'dark'] as const) {
  test(`buffers: designing a Tris buffer shows the pH check and passes axe (${theme})`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.addInitScript(t => localStorage.setItem('bb.theme', t), theme);
    await page.goto('/#/t/buffers');
    await page.getByRole('button', { name: 'Buffer', exact: true }).click();
    await page.getByLabel('Working temperature (°C)').fill('4');
    await page.getByLabel('pH measured at (°C)').fill('25');
    await expect(page.getByTestId('ph-check')).toContainText(/pH 8 at 25 °C → pH 8\.5\d at 4 °C/);
    await expect(page.getByTestId('buffer-results')).toContainText(/HCl 1 M/);
    await page.addStyleTag({ content: '*, *::before, *::after { transition: none !important; animation: none !important; }' });
    const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    expect(violations.map(v => `${v.id}: ${v.nodes[0]?.html.slice(0, 140)}`)).toEqual([]);
    expect(errors).toEqual([]);
  });
}

test('buffers: a premade HEPES stock is a plain dilution', async ({ page }) => {
  await page.goto('/#/t/buffers');
  await page.getByRole('button', { name: 'Buffer', exact: true }).click();
  await page.getByLabel('Buffer system').selectOption('hepes');
  await page.getByRole('button', { name: 'Premade stock' }).click();
  await expect(page.getByTestId('buffer-results')).toContainText(/HEPES \(1 M, pH 7\.5\)/);
  await expect(page.getByTestId('buffer-results')).not.toContainText(/NaOH|HCl/);
});
