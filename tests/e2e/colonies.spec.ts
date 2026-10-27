import { chromium, expect, test } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import jpeg from 'jpeg-js';

// A real plate photo (about 300 white colonies on clear agar, marker writing, uneven light), downscaled.
const PHOTO = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', 'colonies', 'white-on-clear-1200.jpg');
const plateCanvas = 'canvas[aria-label*="counted colonies"]';

/** The photo as a two-frame Y4M (I420) video, for Chromium's fake camera. */
function photoAsY4m(path: string): void {
  const img = jpeg.decode(readFileSync(PHOTO), { useTArray: true });
  const w = img.width - (img.width % 2), h = img.height - (img.height % 2);
  const y = Buffer.alloc(w * h), u = Buffer.alloc((w / 2) * (h / 2)), v = Buffer.alloc((w / 2) * (h / 2));
  const px = (x: number, yy: number) => (yy * img.width + x) * 4;
  for (let yy = 0; yy < h; yy++) for (let x = 0; x < w; x++) {
    const i = px(x, yy), r = img.data[i]!, g = img.data[i + 1]!, b = img.data[i + 2]!;
    y[yy * w + x] = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
    if (yy % 2 === 0 && x % 2 === 0) {
      const k = (yy / 2) * (w / 2) + x / 2;
      u[k] = Math.round(128 - 0.168736 * r - 0.331264 * g + 0.5 * b);
      v[k] = Math.round(128 + 0.5 * r - 0.418688 * g - 0.081312 * b);
    }
  }
  const frame = Buffer.concat([Buffer.from('FRAME\n'), y, u, v]);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, Buffer.concat([Buffer.from(`YUV4MPEG2 W${w} H${h} F15:1 Ip A1:1 C420jpeg\n`), frame, frame]));
}

test('an uploaded plate photo keeps its aspect ratio and is counted', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('/#/t/colonies');
  await page.locator('input[type=file]:not([capture])').setInputFiles(PHOTO);
  const canvas = page.locator(plateCanvas);
  await expect(canvas).toHaveAttribute('width', '1200', { timeout: 15_000 });
  await expect(canvas).toHaveAttribute('height', '900');
  await expect.poll(async () => Number(await page.getByTestId('colony-count').innerText()), { timeout: 15_000 }).toBeGreaterThan(280);
  expect(Number(await page.getByTestId('colony-count').innerText())).toBeLessThan(350);
  const box = (await canvas.boundingBox())!;
  expect(box.width / box.height).toBeCloseTo(4 / 3, 2);
  expect(errors).toEqual([]);
});

test('the live camera counts the plate and Capture hands the frame to the counter', async ({}, testInfo) => {
  test.setTimeout(90_000);
  const video = testInfo.outputPath('plate.y4m');
  photoAsY4m(video);
  const browser = await chromium.launch({
    ...(process.env.CHROME ? { executablePath: process.env.CHROME } : {}),
    args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-video-capture=${video}`],
  });
  try {
    const context = await browser.newContext({ baseURL: testInfo.project.use.baseURL, permissions: ['camera'] });
    const page = await context.newPage();
    await page.goto('/#/t/colonies');
    await page.getByRole('button', { name: /Live camera/ }).click();
    const live = page.getByRole('region', { name: 'Live camera' });
    const status = live.getByRole('status');
    await expect(status).toHaveText(/\d+ colonies/, { timeout: 30_000 });
    expect(Number((await status.innerText()).match(/\d+/)![0])).toBeGreaterThan(200);
    await live.getByRole('button', { name: 'Capture and count' }).click();
    await expect(live).toHaveCount(0);
    await expect.poll(async () => Number(await page.getByTestId('colony-count').innerText()), { timeout: 15_000 }).toBeGreaterThan(250);
  } finally {
    await browser.close();
  }
});
