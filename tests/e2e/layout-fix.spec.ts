import { test, expect } from '@playwright/test';

test('print root is hidden on screen; single visible gel canvas', async ({ page }) => {
  await page.goto('/#/t/gel');
  await page.getByRole('button', { name: /Export SVG/ }).waitFor({ timeout: 10000 });
  const printDisplay = await page.$eval('.print-only', el => getComputedStyle(el).display);
  expect(printDisplay).toBe('none');
  const visibleCanvases = await page.$$eval('canvas', els =>
    els.filter(c => {
      const cs = getComputedStyle(c);
      const r = c.getBoundingClientRect();
      return cs.display !== 'none' && r.width > 0 && r.height > 0;
    }).length);
  expect(visibleCanvases).toBe(1);
});

test('gel: changing a MW-calibration setting does not move the canvas', async ({ page }) => {
  await page.goto('/#/t/gel');
  await page.getByRole('button', { name: /Export SVG/ }).waitFor({ timeout: 10000 });
  const yOf = () => page.$eval('canvas', c => c.getBoundingClientRect().y);
  // change the Fitting Model in the MW Calibration card (the only select with a "piecewise" option)
  const model = page.locator('select:has(option[value="piecewise"])');
  await model.selectOption({ value: 'spline' });
  await page.waitForTimeout(300);
  const y1 = await yOf();
  await model.selectOption({ value: 'linear' });
  await page.waitForTimeout(300);
  const y2 = await yOf();
  await model.selectOption({ value: 'piecewise' });
  await page.waitForTimeout(300);
  const y3 = await yOf();
  // canvas must not jump when the calibration settings change
  expect(y1).toBe(y2);
  expect(y1).toBe(y3);
});

test('workbench input panel sticks while results scroll (protein workbench)', async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 800 });
  await page.goto('/#/t/protein');
  await page.waitForTimeout(800);
  const probe = async () => {
    const r = await page.evaluate(() => {
      const sticky = document.querySelector('div.lg\\:sticky');
      if (!sticky) return null;
      const cs = getComputedStyle(sticky);
      const b = sticky.getBoundingClientRect();
      return { position: cs.position, top: b.top, scrollY: window.scrollY };
    });
    if (!r) throw new Error('sticky inputs panel not found');
    return r;
  };
  const before = await probe();
  expect(before.position).toBe('sticky');
  await page.mouse.wheel(0, 1200);
  await page.waitForTimeout(500);
  const after = await probe();
  // after scrolling, the panel must have stayed in the viewport (top near the nav, not scrolled off)
  expect(after.scrollY).toBeGreaterThan(400);
  expect(after.top).toBeGreaterThanOrEqual(0);
  expect(after.top).toBeLessThan(200);
});
