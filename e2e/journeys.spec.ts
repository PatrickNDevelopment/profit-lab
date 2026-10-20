import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

const gateOf = (page: Page, prefix: string) =>
  page.locator(`tr[data-name^="${prefix}"] [data-testid="gate"]`);
const count = async (page: Page, id: string) => Number(await page.getByTestId(id).innerText());

test.beforeEach(async ({ page }) => {
  await page.goto('./');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

test('journey 1: sample data, change fee tier and allocation, rows update deterministically', async ({
  page,
}) => {
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/Products/);
  await expect(page.getByText('No products yet.')).toBeVisible();

  await page.getByRole('button', { name: 'Load sample data' }).click();
  await expect(page.getByText('Synthetic sample data.')).toBeVisible();
  await expect(page.locator('tbody tr')).toHaveCount(8);

  // Default scenario facts (designed boundary rows)
  await expect(gateOf(page, 'Sample 1')).toHaveText('Qualifies');
  await expect(page.locator('tr[data-name^="Sample 1"] [data-testid="net"]')).toHaveText('$5.00');
  await expect(page.locator('tr[data-name^="Sample 2"] [data-testid="net"]')).toHaveText('$4.99');
  await expect(gateOf(page, 'Sample 2')).toHaveText('Fails profit gate');
  await expect(gateOf(page, 'Sample 6')).toHaveText('Incomplete');
  await expect(gateOf(page, 'Sample 8')).toHaveText('Qualifies');
  const before = await count(page, 'count-qualifying');
  expect(before).toBe(5);

  // Fee tier change flips the fee-sensitive row
  await page.getByLabel('Marketplace fee tier').selectOption('high');
  await expect(gateOf(page, 'Sample 8')).toHaveText('Fails profit gate');
  // Hand-checked: at 15.00% + $0.40 row 1 nets $4.38 (profit gate), row 3 falls to 13% margin,
  // row 5 has its own fee override, row 7 stays healthy -> only samples 5 and 7 qualify.
  await expect(gateOf(page, 'Sample 1')).toHaveText('Fails both gates'); // 4.38 / 30 = 14.6%
  await expect(gateOf(page, 'Sample 3')).toHaveText('Fails margin gate');
  await expect(gateOf(page, 'Sample 5')).toHaveText('Qualifies');
  await expect(gateOf(page, 'Sample 7')).toHaveText('Qualifies');
  expect(await count(page, 'count-qualifying')).toBe(2);

  // Back to standard: exactly restored
  await page.getByLabel('Marketplace fee tier').selectOption('standard');
  await expect(gateOf(page, 'Sample 8')).toHaveText('Qualifies');
  expect(await count(page, 'count-qualifying')).toBe(before);

  // Allocation "none" must warn, never silently use zero
  await page.getByLabel('Overhead allocation method').selectOption('none');
  await expect(page.getByText('not allocated', { exact: false }).first()).toBeVisible();
  await expect(page.locator('tr[data-name^="Sample 1"] [data-testid="net"]')).toHaveText('$5.50');

  // Explain panel shows a real breakdown
  await page.getByRole('button', { name: /^Explain Sample 1/ }).click();
  await expect(page.getByTestId('explain')).toContainText('Projected net profit per unit');
});

test('journey 2: CSV with an invalid row -> row error -> correct -> compare scenarios -> export', async ({
  page,
}) => {
  await page.getByRole('button', { name: 'Import / Export' }).click();
  const bad = [
    'name,source_cost,source_shipping,sale_price,competitor_price,monthly_units',
    'Desk lamp,18.00,4.00,49.99,55.00,10',
    'Phone stand,abc,1.00,19.99,22.00,10',
    'Cable kit,5.00,1.50,14.99,16.00,20',
  ].join('\n');
  await page.getByTestId('csv-text').fill(bad);
  await expect(page.getByTestId('valid-count')).toHaveText('2');
  await expect(page.getByTestId('invalid-count')).toHaveText('1');
  const errRow = page.getByTestId('import-report').getByRole('row', { name: /3\s+Error/ });
  await expect(errRow).toContainText('source_cost must be');
  // the label counts every data row, including the one with an error (audit P3-3)
  await expect(page.getByRole('button', { name: 'Import all 3 rows' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Import only the 2 valid rows' })).toBeEnabled();

  // correct the CSV text in place
  await page.getByTestId('csv-text').fill(bad.replace('abc', '4.00'));
  await expect(page.getByTestId('invalid-count')).toHaveText('0');
  await page.getByRole('button', { name: 'Import all 3 rows' }).click();

  await page.getByRole('button', { name: 'Products', exact: true }).click();
  await expect(page.locator('tbody tr')).toHaveCount(3);
  await expect(page.locator('tr[data-name="Desk lamp"] [data-testid="gate"]')).toHaveText(
    'Qualifies',
  );

  // duplicate scenario, switch the copy to the markup-retention rule
  await page.getByRole('button', { name: 'Scenarios' }).click();
  await page.getByRole('button', { name: 'Duplicate' }).first().click();
  await page.getByRole('button', { name: 'Products', exact: true }).click();
  await page.getByLabel('Markup-retention rule (optional)').check();
  await page.getByRole('button', { name: /^Explain Desk lamp/ }).click();
  await expect(page.getByTestId('equation')).toContainText('55.00');
  await expect(page.getByTestId('equation')).toContainText('undercut');

  // compare Baseline (A) with copy (B)
  await page.getByRole('button', { name: 'Scenarios' }).click();
  const cmp = page.getByTestId('compare');
  await expect(cmp).toBeVisible();
  await page.getByLabel('Scenario A').selectOption({ label: 'Baseline' });
  await page.getByLabel('Scenario B').selectOption({ label: 'Baseline (copy)' });
  await expect(cmp.getByRole('row', { name: /Desk lamp/ })).toBeVisible();
  await expect(cmp).toContainText('Qualifying rows');

  // export results from the active (copy) scenario
  await page.getByRole('button', { name: 'Import / Export' }).click();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: /Download results/ }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^profitlab-results-.*\.csv$/);
  const csv = readFileSync((await download.path())!, 'utf8');
  expect(csv).toContain('projected_net_profit_per_unit');
  expect(csv).toContain('Desk lamp');
  expect(csv).toContain('markup_rule');
});

test('state persists across reload and corrupt storage is recovered', async ({ page }) => {
  await page.getByRole('button', { name: 'Add product' }).click();
  await page.getByLabel(/^Source cost for New product/).fill('12.50');
  await page.reload();
  await expect(page.getByLabel(/^Source cost for New product/)).toHaveValue('12.50');

  await page.evaluate(() => localStorage.setItem('profitlab.state', '{broken'));
  await page.reload();
  await expect(page.getByRole('alert').first()).toContainText('unreadable');
  await expect(page.getByText('No products yet.')).toBeVisible();
});

test('invalid numeric input is flagged, never treated as zero', async ({ page }) => {
  await page.getByRole('button', { name: 'Add product' }).click();
  const cost = page.getByLabel(/^Source cost for New product/);
  await cost.fill('12.345');
  await expect(cost).toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator('tr[data-name="New product"] [data-testid="gate"]')).toHaveText(
    'Incomplete',
  );
});

test('every form control has an accessible name and mobile layout does not overflow', async ({
  page,
}) => {
  await page.getByRole('button', { name: 'Load sample data' }).click();
  const unnamed = await page.evaluate(() => {
    const bad: string[] = [];
    document.querySelectorAll('input, select, textarea, button').forEach((el) => {
      const e = el as HTMLElement;
      const labelled =
        e.getAttribute('aria-label') ||
        e.getAttribute('aria-labelledby') ||
        (e as HTMLInputElement).labels?.length ||
        (e.textContent ?? '').trim();
      if (!labelled) bad.push(e.outerHTML.slice(0, 80));
    });
    return bad;
  });
  expect(unnamed).toEqual([]);

  await page.setViewportSize({ width: 375, height: 800 });
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});
// end
