import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';
import { getBrowserStackCaps } from './utils/bs-caps';

dotenv.config();

// Check if running on BrowserStack
const isCloud = process.env.execution === 'cloud';

export default defineConfig({
  testDir: './tests',
  timeout: 30 * 1000,
  expect: { timeout: 5000 },
  fullyParallel: true,
  reporter: [['html'], ['junit', { outputFile: 'results.xml' }]],
  use: {
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [
    // --- Local Execution / Default ---
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
        name: 'mobile-safari',
        use: { ...devices['iPhone 13'] }, // Local Emulation
    },

    // --- BrowserStack Execution (Only runs if execution=cloud) ---
    ...(isCloud ? [
      {
        name: 'bs-chrome',
        use: {
          connectOptions: { wsEndpoint: getBrowserStackCaps('chrome') },
        },
      },
      {
        name: 'bs-iphone',
        use: {
          connectOptions: { wsEndpoint: getBrowserStackCaps('safari', 'iPhone 13') },
        },
      },
    ] : []),
  ],
});