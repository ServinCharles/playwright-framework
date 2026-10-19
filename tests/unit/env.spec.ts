import { test, expect } from '@playwright/test';
import { isLocalUrl } from '../../utils/env';

test.describe('isLocalUrl', () => {
  test('treats localhost addresses as local @smoke', () => {
    expect(isLocalUrl('http://localhost:3100')).toBe(true);
    expect(isLocalUrl('http://127.0.0.1:3100')).toBe(true);
    expect(isLocalUrl('http://[::1]:3100')).toBe(true);
  });

  test('treats other hosts and bad input as not local', () => {
    expect(isLocalUrl('https://chat.example.com')).toBe(false);
    expect(isLocalUrl('not a url')).toBe(false);
  });
});
