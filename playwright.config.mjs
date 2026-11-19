import { defineConfig, devices } from '@playwright/test'

const port = process.env.DAYLINE_TEST_PORT ?? '46173'
const baseURL = 'http://127.0.0.1:' + port + '/fitness-tracker/'
export default defineConfig({
  testDir: './tests', testMatch: '**/*.spec.mjs', workers: 1, timeout: 45000,
  use: { baseURL, trace: 'retain-on-failure' },
  projects: [
    { name: 'desktop-chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'iphone-webkit', use: { ...devices['iPhone 13'], browserName: 'webkit', timezoneId: 'Asia/Kuala_Lumpur' } },
  ],
  webServer: {
    command: 'node tests/serve-production.mjs', url: baseURL, reuseExistingServer: false,
  }
})
