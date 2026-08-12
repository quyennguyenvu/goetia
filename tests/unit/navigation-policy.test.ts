import { describe, expect, it } from 'vitest';
import { isNavigationAllowed } from '../../src/main/lib/navigation-policy';

describe('isNavigationAllowed', () => {
  it('allows the service host and known auth hosts', () => {
    expect(isNavigationAllowed('messenger', 'https://www.facebook.com/messages/')).toBe(true);
    expect(isNavigationAllowed('messenger', 'https://m.facebook.com/login')).toBe(true);
    expect(isNavigationAllowed('whatsapp', 'https://web.whatsapp.com/')).toBe(true);
    expect(isNavigationAllowed('tiktok', 'https://www.tiktok.com/messages')).toBe(true);
    expect(isNavigationAllowed('instagram', 'https://www.instagram.com/direct/inbox/')).toBe(true);
    expect(isNavigationAllowed('instagram', 'https://www.facebook.com/login')).toBe(true);
    expect(isNavigationAllowed('slack', 'https://app.slack.com/client')).toBe(true);
    expect(isNavigationAllowed('slack', 'https://slack.com/signin')).toBe(true);
  });
  it('blocks a foreign host', () => {
    expect(isNavigationAllowed('messenger', 'https://evil.example/phish')).toBe(false);
    expect(isNavigationAllowed('whatsapp', 'https://evil.example/')).toBe(false);
    expect(isNavigationAllowed('tiktok', 'https://evil.example/')).toBe(false);
    expect(isNavigationAllowed('instagram', 'https://evil.example/')).toBe(false);
    expect(isNavigationAllowed('slack', 'https://evil.example/')).toBe(false);
  });
  it('blocks non-web schemes and malformed urls', () => {
    expect(isNavigationAllowed('discord', 'file:///etc/passwd')).toBe(false);
    expect(isNavigationAllowed('discord', 'not a url')).toBe(false);
  });
});
