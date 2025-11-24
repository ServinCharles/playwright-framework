// utils/bs-caps.ts
export const getBrowserStackCaps = (browserName: string, deviceName?: string) => {
  // Encode credentials
  const user = process.env.BROWSERSTACK_USERNAME;
  const key = process.env.BROWSERSTACK_ACCESS_KEY;
  
  const caps = {
    'browser': browserName,
    'browser_version': 'latest',
    'os': 'osx', // or windows
    'os_version': 'catalina',
    'name': 'Playwright Test',
    'build': 'jenkins-build-' + (process.env.BUILD_NUMBER || 'local'),
    'browserstack.username': user,
    'browserstack.accessKey': key,
    ...(deviceName && { 'device': deviceName, 'realMobile': 'true' }) // Mobile specific
  };

  return `wss://cdp.browserstack.com/playwright?caps=${encodeURIComponent(JSON.stringify(caps))}`;
};