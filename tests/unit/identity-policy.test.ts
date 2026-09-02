import { describe, expect, it } from 'vitest';
import {
  IDENTITY_PROVIDERS,
  identityUrlPatterns,
  isIdentityHost,
  isIdentityPopup,
} from '../../src/main/lib/identity-policy';

// The popup must OPEN on an auth dialog (host + entry path); once open it may
// roam the provider's host. Seeds are from known SDK behaviour and are
// confirmed or pruned by the live pass, never by memory.
describe('isIdentityPopup', () => {
  it('accepts the seeded provider entry URLs', () => {
    expect(isIdentityPopup('https://accounts.google.com/o/oauth2/v2/auth?client_id=x')).toBe(true);
    expect(isIdentityPopup('https://accounts.google.com/gsi/select?client_id=x')).toBe(true);
    expect(isIdentityPopup('https://accounts.google.com/signin/oauth?x=1')).toBe(true);
    expect(isIdentityPopup('https://www.facebook.com/dialog/oauth?client_id=x')).toBe(true);
    expect(isIdentityPopup('https://www.facebook.com/v19.0/dialog/oauth?client_id=x')).toBe(true);
    expect(isIdentityPopup('https://m.facebook.com/login.php?next=x')).toBe(true);
    expect(isIdentityPopup('https://appleid.apple.com/auth/authorize?client_id=x')).toBe(true);
    expect(isIdentityPopup('https://login.microsoftonline.com/common/oauth2/v2.0/authorize')).toBe(
      true,
    );
    expect(isIdentityPopup('https://login.live.com/oauth20_authorize.srf')).toBe(true);
    expect(isIdentityPopup('https://x.com/i/oauth2/authorize?x=1')).toBe(true);
    expect(isIdentityPopup('https://api.twitter.com/oauth/authenticate?x=1')).toBe(true);
    expect(isIdentityPopup('https://access.line.me/oauth2/v2.1/authorize')).toBe(true);
    expect(isIdentityPopup('https://kauth.kakao.com/oauth/authorize')).toBe(true);
    expect(isIdentityPopup('https://accounts.kakao.com/login?continue=x')).toBe(true);
  });

  it('requires https', () => {
    expect(isIdentityPopup('http://accounts.google.com/o/oauth2/v2/auth')).toBe(false);
    expect(isIdentityPopup('file:///o/oauth2/v2/auth')).toBe(false);
  });

  it('rejects a provider host outside its entry paths', () => {
    expect(isIdentityPopup('https://www.facebook.com/marketplace')).toBe(false);
    // the version-segment strip must not turn /videos into a dialog
    expect(isIdentityPopup('https://www.facebook.com/videos/123')).toBe(false);
    expect(isIdentityPopup('https://accounts.google.com/ManageAccount')).toBe(false);
    expect(isIdentityPopup('https://x.com/home')).toBe(false);
  });

  it('rejects lookalike hosts', () => {
    expect(isIdentityPopup('https://accounts.google.com.evil.example/o/oauth2/v2/auth')).toBe(
      false,
    );
    expect(isIdentityPopup('https://evilfacebook.com/dialog/oauth')).toBe(false);
    expect(isIdentityPopup('https://accounts-google.com/o/oauth2/v2/auth')).toBe(false);
  });

  it('rejects junk without throwing', () => {
    expect(isIdentityPopup('not a url')).toBe(false);
    expect(isIdentityPopup('')).toBe(false);
    expect(isIdentityPopup('about:blank')).toBe(false);
  });

  it('declares at least one entry path per provider', () => {
    for (const p of IDENTITY_PROVIDERS) expect(p.entryPaths.length).toBeGreaterThan(0);
  });
});

describe('isIdentityHost', () => {
  it('accepts any path on a provider host', () => {
    expect(isIdentityHost('https://accounts.google.com/signin/v2/challenge/pwd')).toBe(true);
    expect(isIdentityHost('https://accounts.google.com/ManageAccount')).toBe(true);
    expect(isIdentityHost('https://www.facebook.com/checkpoint/')).toBe(true);
    expect(isIdentityHost('https://appleid.apple.com/')).toBe(true);
  });

  it('accepts a roaming host that is never an entry', () => {
    // the FB SDK dialog's redirect_uri (xd_arbiter) — live evidence 2026-08-31
    const arbiter = 'https://staticxx.facebook.com/x/connect/xd_arbiter/?version=46';
    expect(isIdentityHost(arbiter)).toBe(true);
    expect(isIdentityPopup(arbiter)).toBe(false);
    expect(isIdentityHost('https://web.facebook.com/dialog/oauth')).toBe(true);
    // the suffix must not admit a lookalike
    expect(isIdentityHost('https://evilfacebook.com/')).toBe(false);
  });

  it('rejects everything else', () => {
    expect(isIdentityHost('https://www.tiktok.com/login/callback?code=x')).toBe(false);
    expect(isIdentityHost('https://evil.example/')).toBe(false);
    expect(isIdentityHost('http://accounts.google.com/')).toBe(false);
    expect(isIdentityHost('not a url')).toBe(false);
  });
});

// The webRequest client-hints handler must carry a URL filter, or Chromium
// suspends EVERY request in the session for a main-process JS round-trip.
describe('identityUrlPatterns', () => {
  it('covers every provider host and the facebook roaming suffix', () => {
    const p = identityUrlPatterns();
    expect(p).toContain('https://accounts.google.com/*');
    expect(p).toContain('https://login.microsoftonline.com/*');
    // a `.facebook.com` suffix expands to both the wildcard and the bare host
    expect(p).toContain('https://*.facebook.com/*');
    expect(p).toContain('https://facebook.com/*');
  });

  it('emits only https match patterns', () => {
    for (const pat of identityUrlPatterns()) expect(pat.startsWith('https://')).toBe(true);
  });
});
