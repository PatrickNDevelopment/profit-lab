import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('./');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

test('workspace JSON load asks before replacing, cancel keeps data, confirm replaces', async ({
  page,
}) => {
  await page.getByRole('button', { name: 'Load sample data' }).click();
  await page.getByRole('button', { name: 'Import / Export' }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download workspace (JSON)' }).click();
  const json = await (await download).createReadStream();
  const chunks: Buffer[] = [];
  for await (const c of json) chunks.push(c as Buffer);
  const buffer = Buffer.concat(chunks);

  // remove sample rows so the workspace differs from the file
  await page.getByRole('button', { name: 'Products', exact: true }).click();
  await page.getByRole('button', { name: 'Remove sample rows' }).click();
  await page.getByRole('button', { name: 'Import / Export' }).click();

  const input = page.locator('input[type=file][accept*=json]');
  await input.setInputFiles({ name: 'ws.json', mimeType: 'application/json', buffer });
  await expect(page.getByTestId('ws-confirm')).toContainText('8 products');
  await page.getByRole('button', { name: 'Cancel' }).click();
  await page.getByRole('button', { name: 'Products', exact: true }).click();
  await expect(page.getByText('No products yet.')).toBeVisible();

  await page.getByRole('button', { name: 'Import / Export' }).click();
  await input.setInputFiles({ name: 'ws.json', mimeType: 'application/json', buffer });
  await page.getByRole('button', { name: 'Replace my workspace' }).click();
  await page.getByRole('button', { name: 'Products', exact: true }).click();
  await expect(page.locator('tbody tr')).toHaveCount(8);

  // a structurally invalid file changes nothing
  await page.getByRole('button', { name: 'Import / Export' }).click();
  await input.setInputFiles({
    name: 'bad.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{"schemaVersion":1}'),
  });
  await expect(page.getByText('not a valid ProfitLab workspace export')).toBeVisible();
});

test('a change made in another tab is flagged instead of silently overwritten', async ({
  page,
  context,
}) => {
  const other = await context.newPage();
  await other.goto('./');
  await other.getByRole('button', { name: 'Load sample data' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'another tab' })).toBeVisible();
});

test('a failing localStorage write shows a visible save-failed banner', async ({ page }) => {
  await page.evaluate(() => {
    const orig = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k: string, v: string) {
      if (k === 'profitlab.state') throw new DOMException('full', 'QuotaExceededError');
      return orig.call(this, k, v);
    };
  });
  await page.getByRole('button', { name: 'Add product' }).click();
  await expect(page.getByText('Could not save to browser storage')).toBeVisible();
});

test('scenario name can be cleared while typing and never saves an empty name', async ({
  page,
}) => {
  await page.getByRole('button', { name: 'Scenarios' }).click();
  const name = page.getByLabel(/^Scenario name/).first();
  await name.fill('');
  await expect(name).toHaveValue('');
  await name.fill('Holiday');
  await expect(page.getByLabel('Scenario name Holiday')).toHaveValue('Holiday');
  await page.getByLabel('Scenario name Holiday').fill('');
  await page.getByLabel('Scenario name Holiday').blur();
  await expect(page.getByLabel('Scenario name Holiday')).toHaveValue('Holiday');
});
