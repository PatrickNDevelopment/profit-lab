import { test } from '@playwright/test';

// Documentation screenshots come from Chromium only (Firefox and WebKit render fonts differently).
test.skip(
  ({ browserName }) => browserName !== 'chromium',
  'documentation screenshots come from Chromium',
);

test('capture desktop and mobile screenshots', async ({ page }) => {
  await page.goto('./');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole('button', { name: 'Load sample data' }).click();
  await page.getByRole('button', { name: /^Explain Sample 3/ }).click();

  await page.evaluate(() => {
    document.querySelectorAll('.table-wrap').forEach((el) => (el.scrollLeft = 0));
  });
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.screenshot({ path: 'docs/screenshots/desktop-products.png', fullPage: true });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'docs/screenshots/mobile-products.png', fullPage: true });

  await page.setViewportSize({ width: 1366, height: 900 });
  await page.getByRole('button', { name: 'Scenarios' }).click();
  await page.getByRole('button', { name: 'Duplicate' }).first().click();
  await page.screenshot({ path: 'docs/screenshots/desktop-scenarios.png', fullPage: true });
});
