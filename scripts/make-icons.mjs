// Rasterise public/icons/icon.svg to the PNG sizes the PWA manifest needs.
// Dev-only; the PNGs are committed. Usage: CHROME=/path/to/chrome node scripts/make-icons.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(process.env.PLAYWRIGHT_DIR ? `${process.env.PLAYWRIGHT_DIR}/` : import.meta.url);
const { chromium } = require('playwright');
const svg = readFileSync('public/icons/icon.svg', 'utf8');
const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
for (const size of [192, 512]) {
  const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
  await page.setContent(`<body style="margin:0;background:transparent">${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body>`);
  writeFileSync(`public/icons/icon-${size}.png`, await page.screenshot({ omitBackground: true, type: 'png' }));
}
await browser.close();
