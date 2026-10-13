import { defineConfig } from '@playwright/test';

// Tests run against the PRODUCTION build served under the real Pages prefix (/profit-lab/).
// Locally we reuse the installed Microsoft Edge (no browser download); CI installs Chromium.
export default defineConfig({
  testDir: 'e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4173/profit-lab/',
    channel: process.env['CI'] ? undefined : 'msedge',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run build && npm run preview',
    url: 'http://localhost:4173/profit-lab/',
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
