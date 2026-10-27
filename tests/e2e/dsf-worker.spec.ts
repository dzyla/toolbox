import { expect, test } from '@playwright/test';

for (const preset of [/Lysozyme \+ NAG/i, /mAb Fab Screening/i, /Prometheus 24-Capillary/i]) {
  test(`DSF worker analysis succeeds on demo data ${preset}`, async ({ page }) => {
    const workers: string[] = [];
    page.on('worker', w => workers.push(w.url()));
    await page.goto('/#/t/dsf');
    await page.getByRole('button', { name: preset }).click();
    await expect(page.getByText(/Analysing melt curves/i)).toHaveCount(0, { timeout: 20_000 });
    await expect(page.getByText(/Analysis error/i)).toHaveCount(0);
    await expect(page.getByText(/could not be cloned/i)).toHaveCount(0);
    expect(workers.some(u => /dsf\.worker/.test(u))).toBe(true);
  });
}
