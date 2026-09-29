import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFileSync } from 'node:fs';

const fixture = JSON.parse(readFileSync('tests/fixtures/vendor/basechanger/tail-designs.json', 'utf8')) as { plasmid: { sequence: string } };

const GFP = 'ATGGTGAGCAAGGGCGAGGAGCTGTTCACCGGGGTGGTGCCCATCCTGGTCGAGCTGGACGGCGACGTAAACGGCCACAAGTTCAGCGTGTCCGGCGAGGGCGAGGGCGATGCCACCTACGGCAAGCTGACCCTGAAGTTCATCTGCACCACCGGCAAGCTGCCCGTGCCCTGGCCCACCCTCGTGACCACCCTGACCTACGGCGTGCAGTGCTTCAGCCGCTACCCCGACCACATGAAGCAGCACGACTTCTTCAAGTCCGCCATGCCCGAAGGCTACGTCCAG';

async function open(page: Page) {
  // A same-hash navigation does not reload the app, so start from a blank page to drop earlier sequences.
  await page.goto('about:blank');
  await page.goto('/#/t/cloning');
  await page.getByRole('heading', { name: /Cloning hub/ }).waitFor();
  await page.addStyleTag({ content: '*, *::before, *::after { transition: none !important; animation: none !important; }' });
}

async function addVectorAndInsert(page: Page) {
  await page.getByLabel(/Preset vector/).selectOption('puc19');
  await page.getByLabel(/Paste FASTA/).fill(`>GFP\n${GFP}`);
  await page.getByRole('button', { name: 'Add pasted sequence' }).click();
  await expect(page.getByLabel('Role of GFP')).toHaveValue('insert');
}

async function axe(page: Page, where: string) {
  const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  return violations.flatMap(violation => violation.nodes.map(node => `${where} ${violation.id}: ${node.html.slice(0, 160)}`));
}

test('a designed NEBuilder assembly downloads a real GenBank file', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await open(page);
  await addVectorAndInsert(page);
  await expect(page.getByRole('table', { name: 'NEBuilder primers' })).toContainText('GFP_fwd');
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Download GenBank' }).click(),
  ]);
  const text = readFileSync((await download.path())!, 'utf8');
  expect(text.startsWith('LOCUS')).toBe(true);
  expect(text).toContain('ORIGIN');
  expect(errors).toEqual([]);
});

test('each method renders results that pass axe WCAG A/AA in light and dark', async ({ page }) => {
  test.setTimeout(180_000);
  const failures: string[] = [];
  for (const theme of ['light', 'dark'] as const) {
    await page.addInitScript(t => localStorage.setItem('bb.theme', t), theme);
    await open(page);
    await addVectorAndInsert(page);
    failures.push(...await axe(page, `${theme} nebuilder`));
    await page.getByRole('button', { name: 'In-Fusion' }).click();
    await expect(page.getByRole('table', { name: 'In-Fusion primers' })).toBeVisible();
    failures.push(...await axe(page, `${theme} in-fusion`));
    await page.getByRole('button', { name: 'Golden Gate' }).click();
    await expect(page.getByText(/30 cycles/)).toBeVisible();
    failures.push(...await axe(page, `${theme} golden-gate`));
  }
  expect(failures, failures.join('\n')).toEqual([]);
});

test('ligation and amino-acid designs work end to end and pass axe', async ({ page }) => {
  test.setTimeout(180_000);
  await open(page);
  await page.getByLabel(/Preset vector/).selectOption('puc19');
  await page.getByLabel(/Paste FASTA/).fill(`>gene\nTTTTTTGAATTC${GFP}AAGCTTTTTTTT`);
  await page.getByRole('button', { name: 'Add pasted sequence' }).click();
  await page.getByRole('button', { name: 'Restriction + ligation' }).click();
  await expect(page.getByText(/Directional: only one orientation/)).toBeVisible();
  const failures = await axe(page, 'ligation');

  await open(page);
  await page.getByLabel(/Paste FASTA/).fill(`>vecGFP\n${fixture.plasmid.sequence}`);
  await page.getByRole('button', { name: 'Add pasted sequence' }).click();
  await page.getByRole('button', { name: 'Amino-acid change' }).click();
  await page.getByLabel(/Reading frame/).selectOption('-1');
  await page.getByLabel('Start codon position').fill('284');
  await page.getByLabel('Mutations', { exact: true }).fill('Y40F');
  const table = page.getByRole('table', { name: 'Primers for Y40F' });
  await expect(table).toContainText('Y40F_F');
  await expect(table).toContainText('GGCAAGCTGACCCTG');
  failures.push(...await axe(page, 'sdm'));
  expect(failures, failures.join('\n')).toEqual([]);
});

test('a saved cloning project reopens from Recent projects', async ({ page }) => {
  await open(page);
  await addVectorAndInsert(page);
  await page.getByRole('button', { name: 'In-Fusion' }).click();
  await page.getByRole('button', { name: 'Save project' }).click();
  await expect(page.getByText(/Saved/)).toBeVisible();
  await page.goto('/');
  await page.getByText(/Cloning: pUC19/).first().click();
  await expect(page.getByLabel('Role of GFP')).toHaveValue('insert');
  await expect(page.getByRole('button', { name: 'In-Fusion' })).toHaveAttribute('aria-pressed', 'true');
});
