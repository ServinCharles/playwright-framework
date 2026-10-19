/**
 * Builds the BrowserStack Playwright endpoint.
 * NOTE: BrowserStack changes supported OS/browser values over time. Check their current
 * Playwright docs before relying on this, and keep credentials in env vars only.
 */
export const getBrowserStackCaps = (browserName: string, deviceName?: string): string => {
  const user = process.env.BROWSERSTACK_USERNAME;
  const key = process.env.BROWSERSTACK_ACCESS_KEY;

  if (!user || !key) {
    throw new Error(
      'BROWSERSTACK_USERNAME and BROWSERSTACK_ACCESS_KEY must be set when execution=cloud',
    );
  }

  const caps = {
    browser: browserName,
    browser_version: 'latest',
    os: 'Windows',
    os_version: '11',
    name: 'Playwright Test',
    build: `jenkins-build-${process.env.BUILD_NUMBER ?? 'local'}`,
    'browserstack.username': user,
    'browserstack.accessKey': key,
    ...(deviceName && { device: deviceName, realMobile: 'true' }),
  };

  return `wss://cdp.browserstack.com/playwright?caps=${encodeURIComponent(JSON.stringify(caps))}`;
};
