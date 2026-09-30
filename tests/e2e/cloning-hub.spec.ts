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

/** Deterministic pseudo-random DNA so an insert has no repeats that would confuse primer design. */
function dna(length: number, seed: number) {
  let state = seed;
  let out = '';
  for (let i = 0; i < length; i++) {
    state = (state * 1103515245 + 12345) % 2147483648;
    out += 'ACGT'[(state >> 16) & 3];
  }
  return out;
}

test('a placed PCR vector with a custom split shows the sources and keeps them out of the GenBank file', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await open(page);
  await page.getByLabel(/Preset vector/).selectOption('puc19');
  await page.getByLabel(/Paste FASTA/).fill(`>gene\n${dna(600, 11)}`);
  await page.getByRole('button', { name: 'Add pasted sequence' }).click();
  await page.getByLabel('How pUC19 is made', { exact: true }).selectOption('pcr');
  await page.getByLabel('Where to open pUC19', { exact: true }).selectOption('caret');
  await page.getByLabel('Open pUC19 before base', { exact: true }).fill('800');
  await page.getByLabel('Placement for pUC19 to gene', { exact: true }).selectOption('custom');
  await page.getByRole('button', { name: 'Half and half' }).first().click();

  await expect(page.getByTestId('share-summary').first()).toContainText('nt on');
  const legend = page.getByRole('list', { name: 'Sources in the construct' });
  await expect(legend.getByRole('listitem')).toHaveCount(2);
  await expect(page.getByRole('group', { name: /pUC19/ }).first()).toBeVisible();

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Download GenBank' }).click(),
  ]);
  const text = readFileSync((await download.path())!, 'utf8');
  expect(text.startsWith('LOCUS')).toBe(true);
  expect(text).not.toContain('1 · pUC19');
  expect(text).not.toContain('2 · gene');
  expect(errors).toEqual([]);
});

test('clicking the In-Fusion vector primer map moves the insertion point', async ({ page }) => {
  await open(page);
  await addVectorAndInsert(page);
  await page.getByRole('button', { name: 'In-Fusion' }).click();
  await page.getByLabel('Linearize the vector by', { exact: true }).selectOption('pcr-caret');
  const input = page.getByLabel('Insert before base', { exact: true });
  const before = await input.inputValue();
  const surface = page.getByTestId('diagram-surface').first();
  await surface.scrollIntoViewIfNeeded();
  const box = (await surface.boundingBox())!;
  // A click places the opening at one base; a drag would select a region (and switch to "Replace a region").
  await page.mouse.click(box.x + box.width * 0.7, box.y + box.height / 2);
  await expect(input).not.toHaveValue(before);
  // Dragging selects a region to replace instead.
  const again = (await surface.boundingBox())!;
  await page.mouse.move(again.x + again.width * 0.3, again.y + again.height / 2);
  await page.mouse.down();
  await page.mouse.move(again.x + again.width * 0.4, again.y + again.height / 2, { steps: 5 });
  await page.mouse.up();
  await expect(page.getByLabel('Replace from base', { exact: true })).toBeVisible();
});

test('an amino-acid change shows the numbered protein and a wild type vs mutant alignment', async ({ page }) => {
  await open(page);
  await page.getByLabel(/Paste FASTA/).fill(`>GFP\n${GFP}`);
  await page.getByRole('button', { name: 'Add pasted sequence' }).click();
  await page.getByRole('button', { name: 'Amino-acid change' }).click();
  await page.getByLabel('Mutations', { exact: true }).fill('Y67F');
  const protein = page.getByRole('region', { name: 'Protein sequence with residue numbers' });
  await expect(protein).toContainText('MVSKGEELFT');
  await expect(protein.locator('mark')).toHaveCount(1);
  const card = page.getByRole('group', { name: /Y67F: wild type vs mutant/ });
  await expect(card).toBeVisible();
  await expect(card).toContainText('Residue 67');
  await expect(card.getByLabel('Protein alignment')).toBeVisible();
});

test('deleting bases shows the removed range struck out before and after', async ({ page }) => {
  await open(page);
  await page.getByLabel(/Paste FASTA/).fill(`>plas\n${dna(600, 7)}`);
  await page.getByRole('button', { name: 'Add pasted sequence' }).click();
  await page.getByRole('button', { name: 'Amino-acid change' }).click();
  await page.getByRole('button', { name: 'Insert, replace or delete bases' }).click();
  // The label wraps the select and its options, so the exact accessible name is not just "Change".
  await page.locator('label').filter({ hasText: /^Change/ }).locator('select').selectOption('delete');
  await page.getByLabel('From base', { exact: true }).fill('100');
  await page.getByLabel('To base', { exact: true }).fill('111');
  const view = page.getByRole('region', { name: /Edit preview: del100-111/ });
  await expect(view.locator('del')).toHaveText(/^[ACGT]{12}$/);
  await expect(view).toContainText('12 bases removed');
});
