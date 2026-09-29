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
