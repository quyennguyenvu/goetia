import { describe, expect, it } from 'vitest';
import { isNavigationAllowed, shouldContainNavigation } from '../../src/main/lib/navigation-policy';

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

// B1b: enforcing needs hosts the old exact-match list could not express —
// slack's per-workspace {team}.slack.com and Microsoft's login subdomains.
describe('isNavigationAllowed suffix entries', () => {
  it('allows any slack workspace subdomain', () => {
    expect(isNavigationAllowed('slack', 'https://acme.slack.com/')).toBe(true);
    expect(isNavigationAllowed('slack', 'https://my-team-2.slack.com/ssb/redirect')).toBe(true);
    // the bare domain still matches its own suffix entry
    expect(isNavigationAllowed('slack', 'https://slack.com/signin')).toBe(true);
  });

  it('does not let a suffix entry match a lookalike domain', () => {
    expect(isNavigationAllowed('slack', 'https://evilslack.com/')).toBe(false);
    expect(isNavigationAllowed('slack', 'https://slack.com.evil.example/')).toBe(false);
    expect(isNavigationAllowed('slack', 'https://notslack.com/')).toBe(false);
  });

  it('allows the microsoft login subdomains teams bounces through', () => {
    expect(isNavigationAllowed('teams', 'https://login.microsoftonline.com/common/oauth2')).toBe(
      true,
    );
    expect(isNavigationAllowed('teams', 'https://aadcdn.msftauth.net/x')).toBe(false); // still unlisted
    expect(isNavigationAllowed('teams', 'https://teams.microsoft.com/v2/')).toBe(true);
  });

  it('keeps rejecting a foreign host for a suffix-enabled service', () => {
    expect(isNavigationAllowed('slack', 'https://evil.example/')).toBe(false);
    expect(isNavigationAllowed('teams', 'https://evil.example/')).toBe(false);
  });
});

// Containment is about what the TOP-LEVEL view carries, since that document is
// what runs unsandboxed with the recipe preload. Third-party iframes on a
// login page (device fingerprinting, captchas, the MSA passkey ceremony) are
// routine and cannot be enumerated; cancelling one's redirect broke the Teams
// passkey sign-in and opened its frame URL as a blank contained window
// (2026-08-29). will-navigate is main-frame only by contract, will-redirect
// is not — so the frame flag has to be part of the decision.
describe('shouldContainNavigation', () => {
  it('contains a top-level navigation to an unlisted host', () => {
    expect(shouldContainNavigation('teams', 'https://adfs.contoso.example/login', true)).toBe(true);
  });

  it('leaves a top-level navigation to an allowed host alone', () => {
    expect(shouldContainNavigation('teams', 'https://login.live.com/ppsecure/post', true)).toBe(
      false,
    );
  });

  it('never contains a subframe, whatever its host', () => {
    expect(shouldContainNavigation('teams', 'https://df.cfp.microsoft.com/fp', false)).toBe(false);
    expect(shouldContainNavigation('messenger', 'https://evil.example/', false)).toBe(false);
  });
});
