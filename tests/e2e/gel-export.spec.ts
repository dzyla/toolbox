import { test, expect } from '@playwright/test';

test('gel SVG export downloads a vector file with embedded image and annotations', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('/#/t/gel');
  await page.getByRole('button', { name: /Export Annotated Gel/ }).waitFor({ timeout: 10000 });

  // SVG export
  const [svgDl] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: /Export SVG/ }).click(),
  ]);
  expect(svgDl.suggestedFilename()).toMatch(/_annotated\.svg$/);
  const path = await svgDl.path();
  const fs = await import('node:fs');
  const svg = fs.readFileSync(path!, 'utf8');
  fs.writeFileSync('/tmp/gel-export-sample.svg', svg);
  expect(svg).toContain('<svg xmlns="http://www.w3.org/2000/svg"');
  expect(svg).toContain('<image');
  expect(svg).toContain('href="data:image/png;base64,');
  // annotations as vector text: lane headers + demo gel size labels
  expect(svg).toContain('L1 (Ladder)');
  expect(svg).toContain('>L2<');
  expect(svg).toContain('250 kDa');
  expect(svg).toContain('10.0 kDa');
  expect(svg).toContain('Bio-Bench');
  expect(errors).toEqual([]);
});
