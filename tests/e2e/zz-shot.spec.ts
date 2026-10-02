import { expect, test } from '@playwright/test';
const DIR = '/tmp/claude-1000/-home-dzyla-toolbox/74eff4d1-efbb-4923-a0bb-bec79769feea/scratchpad/shots';
test.describe.configure({ mode: 'serial' });
for (const theme of ['light', 'dark'] as const) {
  for (const [name, w, h] of [['phone', 390, 844], ['desktop', 1440, 900]] as const) {
    test(`buffer row ${theme} ${name}`, async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', e => errors.push(e.message));
      await page.setViewportSize({ width: w, height: h });
      await page.addInitScript(t => localStorage.setItem('bb.theme', t), theme);
      await page.goto('/#/t/buffers');
      await page.getByRole('button', { name: 'Buffer', exact: true }).click();
      await page.getByLabel('Working temperature (°C)').fill('4');
      await page.getByLabel('pH measured at (°C)').fill('25');
      await expect(page.getByTestId('ph-check').first()).toContainText(/→/);
      await page.screenshot({ path: `${DIR}/${theme}-${name}.png`, fullPage: true });
      const overflow = await page.evaluate(() => {
        const bad: string[] = [];
        document.querySelectorAll('*').forEach(el => {
          const r = el.getBoundingClientRect();
          if (r.width > 0 && r.right > window.innerWidth + 1) bad.push(`${el.tagName}.${String((el as HTMLElement).className).slice(0, 60)}`);
        });
        return bad.slice(0, 5);
      });
      console.log(`RESULT ${theme} ${name} overflow=${JSON.stringify(overflow)} errors=${JSON.stringify(errors)}`);
      expect(errors).toEqual([]);
      expect(overflow).toEqual([]);
    });
  }
}
