import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 45_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: 'http://127.0.0.1:1420',
    viewport: { width: 720, height: 860 },
    reducedMotion: 'reduce',
    launchOptions: process.env.PLAYWRIGHT_BROWSER_PATH
      ? { executablePath: process.env.PLAYWRIGHT_BROWSER_PATH }
      : {},
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://127.0.0.1:1420',
    reuseExistingServer: !process.env.CI,
  },
});
