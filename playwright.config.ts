import { defineConfig, devices } from '@playwright/test';

const PORT = 4174;
const BASE = '/telugu-test/';

export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: `http://localhost:${PORT}${BASE}`,
    ...devices['Pixel 7'],
    locale: 'te-IN',
  },
  projects: [{ name: 'android-chrome-emulated', use: { ...devices['Pixel 7'] } }],
  webServer: {
    command: `npm run build && npm run preview -- --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}${BASE}`,
    env: { BASE_PATH: BASE },
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
