import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { READY_TOOLS } from './tools';

// WCAG 2.x A/AA checks (labels, names, contrast, nesting) on every page, in both themes.
// One test per page and theme so pages run in parallel and a slow page cannot exhaust a shared timeout.
const PAGES = ['/', '/#/assurance', ...READY_TOOLS.map(id => `/#/t/${id}`)];

for (const theme of ['light', 'dark'] as const) {
  for (const path of PAGES) {
    test(`${path} passes axe WCAG A/AA checks in ${theme} mode`, async ({ page }) => {
      await page.addInitScript(t => localStorage.setItem('bb.theme', t), theme);
      await page.goto(path);
      await page.locator('h1').first().waitFor();
      // Colour transitions (Tailwind `transition`) would otherwise be measured mid-animation after the theme applies.
      await page.addStyleTag({ content: '*, *::before, *::after { transition: none !important; animation: none !important; }' });
      const failures: string[] = [];
      // The structure page embeds the live molstar.org viewer. Its content is third-party and changes without
      // notice (a survey iframe and an unlabeled logo link have appeared and disappeared), so it is not audited here;
      // our own iframe element must still carry a title. Read the attributes in one snapshot: a locator would wait
      // (until the test timeout) if the third-party frame re-renders or detaches between listing and reading.
      const titles = await page.$$eval('iframe[src*="molstar.org"]', els => els.map(e => e.getAttribute('title')));
      if (titles.some(t => !t)) failures.push(`${path} embedded viewer iframe has no title`);
      const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).exclude('iframe[src*="molstar.org"]').analyze();
      for (const v of violations) {
        for (const node of v.nodes) failures.push(`${path} ${v.id}: ${node.html.slice(0, 160)}`);
      }
      expect(failures, failures.join('\n')).toEqual([]);
    });
  }
}

// The cloning hub's construct views (source strip and legend, primer maps, numbered protein and alignment, edit preview)
// only render once a design exists, so the page-level checks above never see them.
const GFP = 'ATGGTGAGCAAGGGCGAGGAGCTGTTCACCGGGGTGGTGCCCATCCTGGTCGAGCTGGACGGCGACGTAAACGGCCACAAGTTCAGCGTGTCCGGCGAGGGCGAGGGCGATGCCACCTACGGCAAGCTGACCCTGAAGTTCATCTGCACCACCGGCAAGCTGCCCGTGCCCTGGCCCACCCTCGTGACCACCCTGACCTACGGCGTGCAGTGCTTCAGCCGCTACCCCGACCACATGAAGCAGCACGACTTCTTCAAGTCCGCCATGCCCGAAGGCTACGTCCAG';

for (const theme of ['light', 'dark'] as const) {
  test(`cloning construct views pass axe WCAG A/AA checks in ${theme} mode`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.addInitScript(t => localStorage.setItem('bb.theme', t), theme);
    const failures: string[] = [];
    const check = async (where: string) => {
      const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
      for (const v of violations) for (const node of v.nodes) failures.push(`${theme} ${where} ${v.id}: ${node.html.slice(0, 160)}`);
    };
    const start = async () => {
      await page.goto('about:blank');
      await page.goto('/#/t/cloning');
      await page.getByRole('heading', { name: /Cloning hub/ }).waitFor();
      await page.addStyleTag({ content: '*, *::before, *::after { transition: none !important; animation: none !important; }' });
    };

    await start();
    await page.getByLabel(/Preset vector/).selectOption('puc19');
    await page.getByLabel(/Paste FASTA/).fill(`>GFP\n${GFP}`);
    await page.getByRole('button', { name: 'Add pasted sequence' }).click();
    await page.getByLabel('How pUC19 is made', { exact: true }).selectOption('pcr');
    await page.getByLabel('Where to open pUC19', { exact: true }).selectOption('caret');
    await page.getByLabel('Placement for pUC19 to GFP', { exact: true }).selectOption('custom');
    await page.getByRole('button', { name: 'Half and half' }).first().click();
    await page.getByRole('list', { name: 'Sources in the construct' }).waitFor();
    await check('nebuilder placed vector with custom split');

    await page.getByRole('button', { name: 'In-Fusion' }).click();
    await page.getByLabel('Linearize the vector by', { exact: true }).selectOption('pcr-caret');
    await page.getByLabel('Insert before base', { exact: true }).waitFor();
    await check('in-fusion inverse PCR');

    await start();
    await page.getByLabel(/Paste FASTA/).fill(`>GFP\n${GFP}`);
    await page.getByRole('button', { name: 'Add pasted sequence' }).click();
    await page.getByRole('button', { name: 'Amino-acid change' }).click();
    await page.getByLabel('Mutations', { exact: true }).fill('Y67F');
    await page.getByRole('group', { name: /Y67F: wild type vs mutant/ }).waitFor();
    await check('amino-acid change');

    await page.getByRole('button', { name: 'Insert, replace or delete bases' }).click();
    await page.locator('label').filter({ hasText: /^Change/ }).locator('select').selectOption('delete');
    await page.getByLabel('From base', { exact: true }).fill('100');
    await page.getByLabel('To base', { exact: true }).fill('111');
    await page.getByRole('region', { name: /Edit preview: del100-111/ }).waitFor();
    await check('sequence deletion');
    await page.locator('label').filter({ hasText: /^Change/ }).locator('select').selectOption('insert');
    await page.getByLabel('Insert after base', { exact: true }).fill('200');
    await page.getByLabel('New bases', { exact: true }).fill('GGATCC');
    await page.getByRole('region', { name: /Edit preview: ins200/ }).waitFor();
    await check('sequence insertion');

    expect(failures, failures.join('\n')).toEqual([]);
  });
}
