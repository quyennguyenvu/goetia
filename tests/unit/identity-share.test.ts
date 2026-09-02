import type { Cookie } from 'electron';
import { describe, expect, it } from 'vitest';
import {
  cookieSetDetails,
  FB_APP_IDS,
  facebookAppId,
  hasFacebookSession,
  IDENTITY_SOURCE,
  isFacebookCookieDomain,
  isSeedableFacebookDialog,
  maySeed,
  shouldSeed,
} from '../../src/main/lib/identity-share';

const cookie = (over: Partial<Cookie> = {}): Cookie =>
  ({
    name: 'xs',
    value: 'secret',
    domain: '.facebook.com',
    path: '/',
    secure: true,
    httpOnly: true,
    session: false,
    sameSite: 'no_restriction',
    expirationDate: 1_800_000_000,
    ...over,
  }) as Cookie;

// The table is the gate that stops a hostile service page from getting a
// signed-in consent dialog against a seeded jar. Every entry is captured from
// a live sign-in (spec §Live pass) — never from memory or a search.
describe('FB_APP_IDS', () => {
  it('holds the app ids captured on 2026-09-02', () => {
    expect(FB_APP_IDS).toEqual({
      shopee: '421039428061656',
      tiktok: '1862952583919182',
    });
  });

  it('is numeric-only, so a pasted URL or placeholder fails the gate loudly', () => {
    for (const id of Object.values(FB_APP_IDS)) expect(id).toMatch(/^\d+$/);
  });

  // messenger is the source; rule 4 refuses it anyway, but an entry here would
  // mean someone misread what the table is for
  it('never names the identity source', () => {
    expect(FB_APP_IDS.messenger).toBeUndefined();
  });
});

describe('IDENTITY_SOURCE', () => {
  it('derives to the service whose own URL is a facebook host', () => {
    expect(IDENTITY_SOURCE).toBe('messenger');
  });
});

describe('isSeedableFacebookDialog', () => {
  it('accepts the oauth dialog, versioned and not', () => {
    expect(isSeedableFacebookDialog('https://www.facebook.com/dialog/oauth?client_id=1')).toBe(
      true,
    );
    expect(
      isSeedableFacebookDialog('https://www.facebook.com/v18.0/dialog/oauth?client_id=1'),
    ).toBe(true);
    // the live SDK dialog carries no visible redirect_uri (it uses the
    // xd_arbiter), so it must still pass
    expect(
      isSeedableFacebookDialog(
        'https://www.facebook.com/v23.0/dialog/oauth?client_id=1&response_type=token',
      ),
    ).toBe(true);
  });

  // /login stays an identity-popup ENTRY path (a popup may open there) but is
  // never seedable: its next= redirect can walk a lent session onto an
  // attacker's own dialog
  it('never seeds a /login entry', () => {
    expect(isSeedableFacebookDialog('https://m.facebook.com/login.php?next=x')).toBe(false);
    expect(
      isSeedableFacebookDialog('https://www.facebook.com/login/?client_id=421039428061656'),
    ).toBe(false);
  });

  it('rejects other providers, lookalikes and non-https', () => {
    expect(
      isSeedableFacebookDialog('https://accounts.google.com/o/oauth2/v2/auth?client_id=1'),
    ).toBe(false);
    expect(isSeedableFacebookDialog('https://evilfacebook.com/dialog/oauth?client_id=1')).toBe(
      false,
    );
    expect(isSeedableFacebookDialog('https://facebook.com.evil.example/dialog/oauth')).toBe(false);
    expect(isSeedableFacebookDialog('http://www.facebook.com/dialog/oauth?client_id=1')).toBe(
      false,
    );
    expect(isSeedableFacebookDialog('https://www.facebook.com/marketplace')).toBe(false);
    expect(isSeedableFacebookDialog('not a url')).toBe(false);
  });
});

describe('facebookAppId', () => {
  it('reads client_id or app_id, and accepts the SDK sending both with one value', () => {
    expect(facebookAppId('https://www.facebook.com/v18.0/dialog/oauth?client_id=123')).toBe('123');
    expect(facebookAppId('https://www.facebook.com/dialog/oauth?app_id=456')).toBe('456');
    expect(facebookAppId('https://www.facebook.com/dialog/oauth?app_id=123&client_id=123')).toBe(
      '123',
    );
  });

  // Facebook's backend reads the LAST duplicate while get() read the first, so
  // a polluted URL would seed one app and render another. Any disagreement —
  // duplicated params or a client_id/app_id mismatch — is refused outright.
  it('refuses parameter pollution: any two differing app ids', () => {
    expect(facebookAppId('https://www.facebook.com/dialog/oauth?client_id=123&client_id=666')).toBe(
      null,
    );
    expect(facebookAppId('https://www.facebook.com/dialog/oauth?client_id=1&app_id=2')).toBe(null);
  });

  it('is null when absent or unparseable', () => {
    expect(facebookAppId('https://www.facebook.com/dialog/oauth')).toBe(null);
    expect(facebookAppId('not a url')).toBe(null);
  });
});

describe('isFacebookCookieDomain', () => {
  it('accepts the session domains, dotted or not', () => {
    expect(isFacebookCookieDomain('.facebook.com')).toBe(true);
    expect(isFacebookCookieDomain('facebook.com')).toBe(true);
    expect(isFacebookCookieDomain('www.facebook.com')).toBe(true);
    expect(isFacebookCookieDomain('staticxx.facebook.com')).toBe(true);
  });

  it('rejects lookalikes', () => {
    expect(isFacebookCookieDomain('notfacebook.com')).toBe(false);
    expect(isFacebookCookieDomain('facebook.com.evil.example')).toBe(false);
    expect(isFacebookCookieDomain('')).toBe(false);
  });
});

describe('hasFacebookSession', () => {
  it('keys on c_user', () => {
    expect(hasFacebookSession([cookie({ name: 'c_user', value: '1' })])).toBe(true);
  });

  it('ignores a fingerprint-only jar', () => {
    expect(hasFacebookSession([cookie({ name: 'datr' }), cookie({ name: 'sb' })])).toBe(false);
    expect(hasFacebookSession([])).toBe(false);
  });

  it('ignores a c_user on some other domain', () => {
    expect(hasFacebookSession([cookie({ name: 'c_user', domain: '.evil.example' })])).toBe(false);
  });
});

// Getting host-only vs domain wrong silently drops the session, which is why
// this is the heaviest test in the feature.
describe('cookieSetDetails', () => {
  it('carries `domain` for a domain cookie and builds an https url', () => {
    expect(cookieSetDetails(cookie())).toEqual({
      url: 'https://facebook.com/',
      name: 'xs',
      value: 'secret',
      domain: '.facebook.com',
      path: '/',
      secure: true,
      httpOnly: true,
      expirationDate: 1_800_000_000,
      sameSite: 'no_restriction',
    });
  });

  it('omits `domain` for a host-only cookie', () => {
    const details = cookieSetDetails(cookie({ domain: 'www.facebook.com', name: 'presence' }));
    expect(details.domain).toBeUndefined();
    expect(details.url).toBe('https://www.facebook.com/');
  });

  it('preserves path and builds a matching url', () => {
    expect(cookieSetDetails(cookie({ path: '/dialog' })).url).toBe('https://facebook.com/dialog');
  });

  it('builds an http url for an insecure cookie', () => {
    expect(cookieSetDetails(cookie({ secure: false })).url).toBe('http://facebook.com/');
  });

  it('leaves expirationDate undefined for a session cookie', () => {
    const details = cookieSetDetails(cookie({ session: true, expirationDate: undefined }));
    expect(details.expirationDate).toBeUndefined();
  });
});

const sync = (over: Record<string, unknown> = {}) => ({
  enabled: true,
  target: 'tiktok' as const,
  popupUrl: 'https://www.facebook.com/v18.0/dialog/oauth?client_id=APP',
  appIds: { tiktok: 'APP' } as Partial<Record<string, string>>,
  ...over,
});

describe('maySeed', () => {
  it('passes rules 1-4 together', () => {
    expect(maySeed(sync())).toBe(true);
  });

  it('rule 1: the toggle is off', () => {
    expect(maySeed(sync({ enabled: false }))).toBe(false);
  });

  it('rule 2: not a facebook dialog', () => {
    expect(
      maySeed(sync({ popupUrl: 'https://accounts.google.com/o/oauth2/v2/auth?client_id=APP' })),
    ).toBe(false);
  });

  it('rule 2: a facebook /login entry with the right client_id is still not seedable', () => {
    expect(
      maySeed(sync({ popupUrl: 'https://www.facebook.com/login.php?client_id=APP&next=x' })),
    ).toBe(false);
  });

  it('rule 3: a polluted dialog URL never matches', () => {
    expect(
      maySeed(
        sync({ popupUrl: 'https://www.facebook.com/dialog/oauth?client_id=APP&client_id=EVIL' }),
      ),
    ).toBe(false);
  });

  it('rule 3: the app id does not match, or the service has no entry', () => {
    expect(
      maySeed(sync({ popupUrl: 'https://www.facebook.com/dialog/oauth?client_id=ATTACKER' })),
    ).toBe(false);
    expect(maySeed(sync({ appIds: {} }))).toBe(false);
  });

  it('rule 4: the source is never seeded from itself', () => {
    expect(maySeed(sync({ target: 'messenger', appIds: { messenger: 'APP' } }))).toBe(false);
  });
});

describe('shouldSeed', () => {
  it('adds the two jar rules to maySeed', () => {
    expect(shouldSeed({ ...sync(), sourceHasSession: true, targetHasSession: false })).toBe(true);
    expect(shouldSeed({ ...sync(), sourceHasSession: false, targetHasSession: false })).toBe(false);
    expect(shouldSeed({ ...sync(), sourceHasSession: true, targetHasSession: true })).toBe(false);
  });

  // §3: once stop() has run the popup is blank until something re-navigates
  // it, so the sync gate must stay true in the cases that only fail on a jar.
  it('leaves maySeed true when only a jar rule fails, so the replay still runs', () => {
    expect(maySeed(sync())).toBe(true);
    expect(shouldSeed({ ...sync(), sourceHasSession: false, targetHasSession: true })).toBe(false);
  });
});

// Verbatim from the 2026-09-02 live log: the table is only worth anything if
// it matches the URLs Facebook actually sends, and only safe if it refuses a
// dialog opened for some other app.
describe('the captured dialog URLs', () => {
  const SHOPEE =
    'https://www.facebook.com/v23.0/dialog/oauth?app_id=421039428061656&cbt=1788285638531&client_id=421039428061656&display=popup&domain=shopee.vn&response_type=token%2Csigned_request%2Cgraph_domain&sdk=joey&version=v23.0';
  const TIKTOK =
    'https://www.facebook.com/v18.0/dialog/oauth?app_id=1862952583919182&cbt=1788285765087&client_id=1862952583919182&display=popup&domain=www.tiktok.com&response_type=token%2Csigned_request%2Cgraph_domain&sdk=joey&version=v18.0';

  it('pass the sync gate for the service that opened them', () => {
    expect(maySeed({ enabled: true, target: 'shopee', popupUrl: SHOPEE })).toBe(true);
    expect(maySeed({ enabled: true, target: 'tiktok', popupUrl: TIKTOK })).toBe(true);
  });

  it('fail cross-wired, so no service can borrow another app id', () => {
    expect(maySeed({ enabled: true, target: 'tiktok', popupUrl: SHOPEE })).toBe(false);
    expect(maySeed({ enabled: true, target: 'shopee', popupUrl: TIKTOK })).toBe(false);
  });

  it('fail for a service with no entry', () => {
    expect(maySeed({ enabled: true, target: 'instagram', popupUrl: SHOPEE })).toBe(false);
  });
});
