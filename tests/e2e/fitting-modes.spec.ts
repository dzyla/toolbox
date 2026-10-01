import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// Each analysis mode opens with a synthetic example whose true values are stated in the data header.
const MODES = [
  { name: /Enzyme inhibition/, expect: /Competitive/, key: /Ki/ },
  { name: /^ITC$/, expect: /KD/, key: /c-value/ },
  { name: /SPR \/ BLI kinetics/, expect: /KD/, key: /koff/ },
];

for (const theme of ['light', 'dark'] as const) {
  for (const mode of MODES) {
    test(`fitting: ${mode.name} mode fits its example and passes axe (${theme})`, async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', e => errors.push(e.message));
      await page.addInitScript(t => localStorage.setItem('bb.theme', t), theme);
      await page.goto('/#/t/fitting');
      await page.getByRole('button', { name: mode.name }).click();
      await expect(page.getByText(mode.expect).locator('visible=true').first()).toBeVisible({ timeout: 20_000 });
      await expect(page.getByText(mode.key).locator('visible=true').first()).toBeVisible();
      await page.addStyleTag({ content: '*, *::before, *::after { transition: none !important; animation: none !important; }' });
      const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
      expect(violations.map(v => `${v.id}: ${v.nodes[0]?.html.slice(0, 140)}`)).toEqual([]);
      expect(errors).toEqual([]);
    });
  }
}

test('fitting: SPR example recovers the stated KD of 5 nM and ITC the stated 1 µM', async ({ page }) => {
  await page.goto('/#/t/fitting');
  await page.getByRole('button', { name: /SPR \/ BLI kinetics/ }).click();
  const kd = page.locator('div:visible', { hasText: /^KD/ }).filter({ hasText: /nM/ }).last();
  await expect(kd).toContainText(/KD\s*(4\.[5-9]\d*|5(\.[0-4]\d*)?)\s*nM/, { timeout: 20_000 });
  await page.getByRole('button', { name: /^ITC$/ }).click();
  await expect(page.locator('div:visible', { hasText: /^KD/ }).filter({ hasText: /µM/ }).last()).toContainText(/KD\s*(0\.9\d*|1(\.[0-1]\d*)?)\s*µM/, { timeout: 20_000 });
});

test('culture hands a growth series to the curve fit with the Gompertz model selected', async ({ page }) => {
  await page.goto('/#/t/fitting');
  await page.evaluate(() => {
    const rows = Array.from({ length: 12 }, (_, i) => `${i * 2}\t${Math.round(1e4 * Math.exp(0.05 * Math.max(0, i * 2 - 6)) )}`).join('\n');
    sessionStorage.setItem('biobench_fitting_input', `# time\tcells\n${rows}`);
    sessionStorage.setItem('biobench_fitting_model', 'gompertz_growth');
  });
  await page.reload();
  await expect(page.getByLabel('Regression Model')).toHaveValue('gompertz_growth');
});
