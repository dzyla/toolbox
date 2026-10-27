import { test, expect } from '@playwright/test';

// 1x1 PNG
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

test('measure: moving the pointer over an image never re-decodes it or leaves a blank frame', async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as Record<string, unknown>;
    w.__imgs = 0;
    w.__blank = 0;
    const NativeImage = window.Image;
    window.Image = function (this: unknown, ...a: ConstructorParameters<typeof Image>) {
      w.__imgs = (w.__imgs as number) + 1;
      return new NativeImage(...a);
    } as unknown as typeof Image;
    // a canvas resize clears it; it must be repainted before the next frame
    let pending = false;
    const desc = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, 'width')!;
    Object.defineProperty(HTMLCanvasElement.prototype, 'width', {
      get: desc.get,
      set(v: number) {
        desc.set!.call(this, v);
        if (!pending) {
          pending = true;
          requestAnimationFrame(() => {
            if (pending) w.__blank = (w.__blank as number) + 1;
            pending = false;
          });
        }
      },
    });
    const draw = CanvasRenderingContext2D.prototype.drawImage;
    CanvasRenderingContext2D.prototype.drawImage = function (this: CanvasRenderingContext2D, ...a: unknown[]) {
      pending = false;
      return (draw as (...x: unknown[]) => void).apply(this, a);
    } as typeof draw;
  });
  await page.goto('/#/t/measure');
  const canvas = page.locator('canvas');
  await canvas.waitFor({ timeout: 10000 });
  await page.locator('input[type=file]').setInputFiles({ name: 'a.png', mimeType: 'image/png', buffer: PNG });
  await page.waitForFunction(() => (window as unknown as { __imgs: number }).__imgs > 0);
  await page.waitForTimeout(500);
  const imgsAfterLoad = await page.evaluate(() => (window as unknown as { __imgs: number }).__imgs);
  await page.evaluate(() => {
    (window as unknown as { __blank: number }).__blank = 0;
  });

  const box = (await canvas.boundingBox())!;
  for (let i = 0; i < 40; i++) {
    await page.mouse.move(box.x + 5 + i * 2, box.y + 5 + i);
    await page.waitForTimeout(25);
  }
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => (window as unknown as { __imgs: number }).__imgs)).toBe(imgsAfterLoad);
  expect(await page.evaluate(() => (window as unknown as { __blank: number }).__blank)).toBe(0);
});
