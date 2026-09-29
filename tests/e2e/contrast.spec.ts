import { expect, test, type Page } from '@playwright/test';

const GFP = 'ATGGTGAGCAAGGGCGAGGAGCTGTTCACCGGGGTGGTGCCCATCCTGGTCGAGCTGGACGGCGACGTAAACGGCCACAAGTTCAGCGTGTCCGGCGAGGGCGAGGGCGATGCCACCTACGGCAAGCTGACCCTGAAGTTCATCTGCACCACCGGCAAGCTGCCCGTGCCCTGGCCCACCCTCGTGACCACCCTGACCTACGGCGTGCAGTGCTTCAGCCGCTACCCCGACCACATGAAGCAGCACGACTTCTTCAAGTCCGCCATGCCCGAAGGCTACGTCCAG';

// Buttons that turn white/invisible on hover, and native controls that follow the OS instead of the app theme.

async function open(page: Page) {
  await page.goto('about:blank');
  await page.goto('/#/t/cloning');
  await page.getByRole('heading', { name: /Cloning hub/ }).waitFor();
  await page.addStyleTag({ content: '*, *::before, *::after { transition: none !important; animation: none !important; }' });
}

/** Text/background contrast of an element as rendered right now (colours converted through a canvas: computed values are lab()/oklab()). */
function measure(element: Element): { ratio: number; text: string } {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 1;
  const context = canvas.getContext('2d', { willReadFrequently: true })!;
  const rgba = (colour: string): [number, number, number, number] => {
    context.clearRect(0, 0, 1, 1);
    context.fillStyle = '#000';
    context.fillStyle = colour;
    context.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = context.getImageData(0, 0, 1, 1).data;
    return [r!, g!, b!, a! / 255];
  };
  const layers: [number, number, number, number][] = [];
  for (let node: Element | null = element; node; node = node.parentElement) {
    const layer = rgba(getComputedStyle(node).backgroundColor);
    layers.push(layer);
    if (layer[3] >= 1) break;
  }
  let background: [number, number, number] = [255, 255, 255];
  for (const [r, g, b, a] of layers.reverse()) background = [r * a + background[0] * (1 - a), g * a + background[1] * (1 - a), b * a + background[2] * (1 - a)];
  const [tr, tg, tb, ta] = rgba(getComputedStyle(element).color);
  const text = [tr * ta + background[0] * (1 - ta), tg * ta + background[1] * (1 - ta), tb * ta + background[2] * (1 - ta)];
  const luminance = (rgb: number[]) => {
    const [r, g, b] = rgb.map(value => { const c = value / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
    return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
  };
  const [hi, lo] = [luminance(text), luminance(background)].sort((a, b) => b - a);
  return { ratio: (hi! + 0.05) / (lo! + 0.05), text: getComputedStyle(element).color };
}

for (const theme of ['light', 'dark'] as const) {
  test(`hovered cloning buttons keep readable text in ${theme} mode`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.addInitScript(t => localStorage.setItem('bb.theme', t), theme);
    await open(page);
    await page.getByLabel(/Preset vector/).selectOption('puc19');
    await page.getByLabel(/Paste FASTA/).fill(`>GFP\n${GFP}`);
    await page.getByRole('button', { name: 'Add pasted sequence' }).click();
    const offenders: string[] = [];
    const methods = ['NEBuilder', 'In-Fusion', 'Restriction + ligation', 'Amino-acid change', 'Golden Gate'];
    for (const method of methods) {
      await page.getByRole('navigation', { name: 'Cloning method' }).getByRole('button', { name: new RegExp(method.replace('+', '\\+')) }).click();
      const buttons = page.locator('main button');
      const count = await buttons.count();
      for (let index = 0; index < count; index++) {
        const button = buttons.nth(index);
        if (!(await button.isVisible()) || !(await button.isEnabled())) continue;
        await button.scrollIntoViewIfNeeded();
        await button.hover();
        const { ratio, text } = await button.evaluate(measure);
        if (ratio < 3) offenders.push(`${theme} ${method} "${(await button.innerText()).trim() || await button.getAttribute('aria-label')}" contrast ${ratio.toFixed(2)} (text ${text})`);
      }
    }
    expect(offenders, offenders.join('\n')).toEqual([]);
  });
}

for (const [os, app] of [['light', 'dark'], ['dark', 'light']] as const) {
  test(`native controls follow the ${app} app theme, not the ${os} OS`, async ({ browser }) => {
    const context = await browser.newContext({ colorScheme: os });
    const page = await context.newPage();
    await page.addInitScript(t => localStorage.setItem('bb.theme', t), app);
    await page.goto('/#/t/cloning');
    await page.getByRole('heading', { name: /Cloning hub/ }).waitFor();
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme)).toBe(app);
    await context.close();
  });
}
