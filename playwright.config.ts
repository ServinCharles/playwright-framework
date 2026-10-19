import { defineConfig, devices } from '@playwright/test';
import { env, isLocalUrl } from './utils/env';
import { getBrowserStackCaps } from './utils/bs-caps';

const AUTH_FILE = '.auth/standard.json';
const chatUrl = new URL(env.chatApiUrl);
const useLocalChatApi = isLocalUrl(env.chatApiUrl);
const allBrowsers = process.env.ALL_BROWSERS === '1';

export default defineConfig({
  testDir: './tests',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: true,
  forbidOnly: env.isCI,
  retries: env.isCI ? 2 : 0,
  workers: env.isCI ? 2 : undefined,
  reporter: [
    ['list'],
    ['html', { open: 'never' }],
    ['junit', { outputFile: 'reports/junit/results.xml' }],
  ],
  use: {
    baseURL: env.baseUrl,
    // SauceDemo marks elements with data-test, so getByTestId works out of the box
    testIdAttribute: 'data-test',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  // The local mock chat API is started automatically unless CHAT_API_URL points to another machine
  webServer: useLocalChatApi
    ? {
        command: 'npx tsx mock-chat-api/server.ts',
        url: `${chatUrl.origin}/health`,
        env: { PORT: chatUrl.port || '3100' },
        reuseExistingServer: !env.isCI,
        timeout: 30_000,
      }
    : undefined,

  projects: [
    // Logs in once and stores the session so UI tests do not repeat the login
    { name: 'setup', testMatch: /auth\.setup\.ts/ },

    {
      name: 'ui-chromium',
      testMatch: /tests\/ui\/.*\.spec\.ts/,
      dependencies: ['setup'],
      use: { ...devices['Desktop Chrome'], storageState: AUTH_FILE },
    },

    { name: 'api', testMatch: /tests\/api\/.*\.spec\.ts/ },
    { name: 'ai-eval', testMatch: /tests\/ai-eval\/.*\.spec\.ts/ },
    { name: 'unit', testMatch: /tests\/unit\/.*\.spec\.ts/ },

    // Extra local browsers: ALL_BROWSERS=1 npx playwright test --project=ui-firefox
    ...(allBrowsers
      ? [
          {
            name: 'ui-firefox',
            testMatch: /tests\/ui\/.*\.spec\.ts/,
            dependencies: ['setup'],
            use: { ...devices['Desktop Firefox'], storageState: AUTH_FILE },
          },
          {
            name: 'ui-mobile-safari',
            testMatch: /tests\/ui\/.*\.spec\.ts/,
            dependencies: ['setup'],
            use: { ...devices['iPhone 13'], storageState: AUTH_FILE },
          },
        ]
      : []),

    // BrowserStack projects exist only when execution=cloud
    ...(env.isCloud
      ? [
          {
            name: 'bs-chrome',
            testMatch: /tests\/ui\/.*\.spec\.ts/,
            dependencies: ['setup'],
            use: {
              storageState: AUTH_FILE,
              connectOptions: { wsEndpoint: getBrowserStackCaps('chrome') },
            },
          },
          {
            name: 'bs-iphone',
            testMatch: /tests\/ui\/.*\.spec\.ts/,
            dependencies: ['setup'],
            use: {
              storageState: AUTH_FILE,
              connectOptions: { wsEndpoint: getBrowserStackCaps('safari', 'iPhone 13') },
            },
          },
        ]
      : []),
  ],
});
