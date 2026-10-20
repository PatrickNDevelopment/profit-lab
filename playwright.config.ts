import { defineConfig } from '@playwright/test';

// Tests run against the PRODUCTION build served under the real Pages prefix (/profit-lab/).
// Locally we reuse the installed Microsoft Edge (no browser download); CI installs Chromium, Firefox and WebKit.
const EXTRA_BROWSERS = (process.env['PW_EXTRA_BROWSERS'] ?? '')
  .split(',')
  .map((b) => b.trim())
  .filter((b): b is 'firefox' | 'webkit' => b === 'firefox' || b === 'webkit');

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4173/profit-lab/',
    trace: 'retain-on-failure',
  },
  projects: [
    // Chromium is the gate everywhere (installed Edge locally, Chromium in CI). Firefox and WebKit run
    // when PW_EXTRA_BROWSERS lists them, as the CI workflow does.
    {
      name: 'chromium',
      use: { browserName: 'chromium', channel: process.env['CI'] ? undefined : 'msedge' },
    },
    ...EXTRA_BROWSERS.map((name) => ({ name, use: { browserName: name } })),
  ],
  webServer: {
    command: 'npm run build && npm run preview',
    url: 'http://localhost:4173/profit-lab/',
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
