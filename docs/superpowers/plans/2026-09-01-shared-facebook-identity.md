# Shared Facebook Identity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a Facebook session already signed in inside the Messenger service satisfy another service's "Continue with Facebook" dialog, so a social login costs a consent click instead of a password and a 2FA code.

**Architecture:** The sign-in popup keeps running in its opener's `persist:<id>` partition — that inheritance is what keeps `window.opener` alive for the callback's `postMessage`, and it is the flow the 2026-08-31 live pass proved works. All that changes is that the jar is pre-loaded with `persist:messenger`'s facebook.com cookies for the popup's lifetime, gated on a per-service Facebook app-id allowlist, and emptied again when the popup closes. Pure decision logic lives in `src/main/lib/identity-share.ts` with a vitest unit test; the session I/O lives in an injectable-jar `IdentityShare` unit; `views.ts` stays thin wiring.

**Tech Stack:** TypeScript, Electron (`session.cookies`, `WebContents`, `BrowserWindow`), `conf` for the marker file, vitest, biome.

**Spec:** `docs/superpowers/specs/2026-09-01-shared-facebook-identity-design.md`. Read it before Task 1 — the security review in it is why several of these rules exist, and an implementer who skips it will be tempted to simplify them away.

## Global Constraints

- **Never commit.** This repo's owner commits only through `/grimoire-core:commit` after confirming the drafted message. Every task below ends with a **Stop** step instead of a `git commit`. Do not run `git commit`, do not write `GRIMOIRE_COMMIT_MSG.txt`, do not `git add` and leave it staged as a hint.
- **Definition of done for every task:** `corepack pnpm lint`, `corepack pnpm typecheck`, `corepack pnpm test` all green. No task is finished with a red one.
- `src/shared/**` stays process-agnostic: no `electron` import, no DOM. `src/main/lib/**` may import `electron` **types only** (`import type`), which erase at build time and so stay safe under vitest's node environment.
- Pure decision logic goes in `src/main/lib/` with a unit test. `views.ts` and `index.ts` stay thin wiring.
- Every `setTimeout` is cleared on teardown, and every deferred callback checks `isDestroyed()` first.
- `FB_APP_IDS` ships **empty**. Never populate it from memory, a web search, or a guess — only from a live sign-in captured under `GOETIA_DEBUG_CALLS=1`. An empty table means the feature is inert, which is the intended shipping state.
- No cookie value is ever logged, persisted to a Goetia-managed file, or sent over IPC. Debug lines carry counts only.
- `IDENTITY_SEED_GRACE_MS` is `10_000`. Do not reuse `BANNER_GRACE_MS` (`120_000`) — it answers a different question.

---

### Task 1: Pure decision helpers

**Files:**

- Create: `src/main/lib/identity-share.ts`
- Test: `tests/unit/identity-share.test.ts`

**Interfaces:**

- Consumes: `hostMatches` from `src/main/lib/host-match.ts`; `isIdentityPopup` from `src/main/lib/identity-policy.ts`; `SERVICES` from `src/shared/services.ts`; `ServiceId` from `src/shared/types.ts`.
- Produces: `FB_APP_IDS: Partial<Record<ServiceId, string>>`, `IDENTITY_SOURCE: ServiceId | null`, `FACEBOOK_COOKIE_DOMAIN: string`, `facebookAppId(url: string): string | null`, `isFacebookDialog(url: string): boolean`, `isFacebookCookieDomain(domain: string): boolean`, `hasFacebookSession(cookies: Cookie[]): boolean`, `cookieSetDetails(cookie: Cookie): CookiesSetDetails`, `maySeed(input: SeedSyncInput): boolean`, `shouldSeed(input: SeedSyncInput & SeedJarInput): boolean`, and the exported types `SeedSyncInput` / `SeedJarInput`.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/identity-share.test.ts`:

```ts
import type { Cookie } from 'electron';
import { describe, expect, it } from 'vitest';
import {
  cookieSetDetails,
  facebookAppId,
  FB_APP_IDS,
  hasFacebookSession,
  IDENTITY_SOURCE,
  isFacebookCookieDomain,
  isFacebookDialog,
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
// signed-in consent dialog. It ships empty on purpose (spec §Live pass).
describe('FB_APP_IDS', () => {
  it('ships empty so the feature is inert until a live pass fills it', () => {
    expect(Object.keys(FB_APP_IDS)).toEqual([]);
  });
});

describe('IDENTITY_SOURCE', () => {
  it('derives to the service whose own URL is a facebook host', () => {
    expect(IDENTITY_SOURCE).toBe('messenger');
  });
});

describe('isFacebookDialog', () => {
  it('accepts the dialog entry points, versioned and not', () => {
    expect(isFacebookDialog('https://www.facebook.com/dialog/oauth?client_id=1')).toBe(true);
    expect(isFacebookDialog('https://www.facebook.com/v18.0/dialog/oauth?client_id=1')).toBe(true);
    expect(isFacebookDialog('https://m.facebook.com/login.php?next=x')).toBe(true);
  });

  it('rejects other providers, lookalikes and non-https', () => {
    expect(isFacebookDialog('https://accounts.google.com/o/oauth2/v2/auth?client_id=1')).toBe(false);
    expect(isFacebookDialog('https://evilfacebook.com/dialog/oauth?client_id=1')).toBe(false);
    expect(isFacebookDialog('https://facebook.com.evil.example/dialog/oauth')).toBe(false);
    expect(isFacebookDialog('http://www.facebook.com/dialog/oauth?client_id=1')).toBe(false);
    expect(isFacebookDialog('https://www.facebook.com/marketplace')).toBe(false);
    expect(isFacebookDialog('not a url')).toBe(false);
  });
});

describe('facebookAppId', () => {
  it('reads client_id, then app_id', () => {
    expect(facebookAppId('https://www.facebook.com/v18.0/dialog/oauth?client_id=123')).toBe('123');
    expect(facebookAppId('https://www.facebook.com/dialog/oauth?app_id=456')).toBe('456');
    expect(facebookAppId('https://www.facebook.com/dialog/oauth?client_id=1&app_id=2')).toBe('1');
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `corepack pnpm vitest run tests/unit/identity-share.test.ts`

Expected: FAIL — `Failed to resolve import "../../src/main/lib/identity-share"`.

- [ ] **Step 3: Write the implementation**

Create `src/main/lib/identity-share.ts`:

```ts
import type { Cookie, CookiesSetDetails } from 'electron';
import { SERVICES } from '../../shared/services';
import type { ServiceId } from '../../shared/types';
import { hostMatches } from './host-match';
import { isIdentityPopup } from './identity-policy';

/** Suffix entry, as in navigation-policy: matches facebook.com and any
 *  subdomain, never a lookalike. */
export const FACEBOOK_COOKIE_DOMAIN = '.facebook.com';

/** Facebook app id per service, captured from a live sign-in under
 *  GOETIA_DEBUG_CALLS=1 (spec §Live pass, step 1). A service with no entry is
 *  never seeded — this table is what stops a malicious or XSS'd service page
 *  from opening its OWN dialog against a signed-in jar and collecting a token
 *  on one click. Never fill an entry in from memory or a search. */
export const FB_APP_IDS: Partial<Record<ServiceId, string>> = {};

/** The service whose own URL is a facebook host: its partition holds a real
 *  www.facebook.com session by construction, which is what makes it the
 *  source rather than a lucky coincidence. Null degrades the feature to off
 *  rather than failing the boot. */
export const IDENTITY_SOURCE: ServiceId | null =
  SERVICES.find((s) => {
    try {
      return hostMatches(new URL(s.url).host, FACEBOOK_COOKIE_DOMAIN);
    } catch {
      return false;
    }
  })?.id ?? null;

/** Chromium reports a domain cookie as `.facebook.com` and a host-only one as
 *  `www.facebook.com`; hostMatches wants the bare host either way. */
export function isFacebookCookieDomain(domain: string): boolean {
  if (!domain) return false;
  return hostMatches(domain.replace(/^\./, ''), FACEBOOK_COOKIE_DOMAIN);
}

/** A Facebook sign-in dialog specifically — isIdentityPopup already owns the
 *  https check, the version-segment strip and the entry-path prefixes, so
 *  this narrows its verdict to the one provider that is shared. */
export function isFacebookDialog(url: string): boolean {
  if (!isIdentityPopup(url)) return false;
  try {
    return hostMatches(new URL(url).host, FACEBOOK_COOKIE_DOMAIN);
  } catch {
    return false;
  }
}

export function facebookAppId(url: string): string | null {
  try {
    const q = new URL(url).searchParams;
    return q.get('client_id') ?? q.get('app_id');
  } catch {
    return null;
  }
}

/** c_user is Facebook's signed-in user id; datr and sb are set for anyone. */
export function hasFacebookSession(cookies: Cookie[]): boolean {
  return cookies.some((c) => c.name === 'c_user' && isFacebookCookieDomain(c.domain ?? ''));
}

/** Electron's `Cookie` → the `CookiesSetDetails` that reproduces it.
 *  A host-only cookie must NOT carry `domain`, or set() widens it to the whole
 *  registrable domain; a domain cookie must, or set() narrows it to one host.
 *  Either mistake drops the session without an error. */
export function cookieSetDetails(cookie: Cookie): CookiesSetDetails {
  const domain = cookie.domain ?? '';
  const path = cookie.path ?? '/';
  const host = domain.replace(/^\./, '');
  return {
    url: `${cookie.secure ? 'https' : 'http'}://${host}${path}`,
    name: cookie.name,
    value: cookie.value,
    ...(domain.startsWith('.') ? { domain } : {}),
    path,
    secure: cookie.secure,
    httpOnly: cookie.httpOnly,
    expirationDate: cookie.expirationDate,
    sameSite: cookie.sameSite,
  };
}

export interface SeedSyncInput {
  enabled: boolean;
  target: ServiceId;
  popupUrl: string;
  /** injected so the truth table is testable without mutating FB_APP_IDS */
  appIds?: Partial<Record<ServiceId, string>>;
}

export interface SeedJarInput {
  sourceHasSession: boolean;
  targetHasSession: boolean;
}

/** Rules 1-4: everything decidable without reading a cookie jar. This is what
 *  decides whether the popup's load is interrupted at all, so it has to answer
 *  before the first await (see views.ts seedIdentityPopup). */
export function maySeed({ enabled, target, popupUrl, appIds = FB_APP_IDS }: SeedSyncInput): boolean {
  if (!enabled) return false;
  if (!isFacebookDialog(popupUrl)) return false;
  const wanted = appIds[target];
  if (!wanted || facebookAppId(popupUrl) !== wanted) return false;
  return IDENTITY_SOURCE !== null && target !== IDENTITY_SOURCE;
}

/** All six rules. Rule 6 leaves Instagram's own Log-in-with-Facebook cookies
 *  alone and makes a deliberate second-account login permanently sticky. */
export function shouldSeed(input: SeedSyncInput & SeedJarInput): boolean {
  return maySeed(input) && input.sourceHasSession && !input.targetHasSession;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `corepack pnpm vitest run tests/unit/identity-share.test.ts`

Expected: PASS, 23 tests.

- [ ] **Step 5: Run the full gate**

Run: `corepack pnpm lint && corepack pnpm typecheck && corepack pnpm test`

Expected: all green.

- [ ] **Step 6: Stop**

Report the task complete and ask the user to run `/grimoire-core:commit`. Do not commit.

---

### Task 2: The settings flag and its toggle

**Files:**

- Modify: `src/shared/types.ts` (the `Settings` interface and `DEFAULT_SETTINGS`)
- Modify: `src/renderer/src/components/SettingsView.tsx:455-478` (the Services pane, beside Light Sleep)
- Test: `tests/unit/settings.test.ts`

**Interfaces:**

- Consumes: nothing from Task 1.
- Produces: `Settings['shareFacebookLogin']: boolean`, defaulting to `true`. Task 3 reads it through an injected `enabled: () => boolean`; Task 5 supplies that as `() => settings.get().shareFacebookLogin`.

- [ ] **Step 1: Write the failing test**

Append to `tests/unit/settings.test.ts`:

```ts
describe('shareFacebookLogin', () => {
  it('defaults on — the feature was asked for, and the switch exists to say no', () => {
    expect(DEFAULT_SETTINGS.shareFacebookLogin).toBe(true);
  });
});
```

If `DEFAULT_SETTINGS` is not already imported in that file, add it to the existing import from `../../src/shared/types`.

- [ ] **Step 2: Run the test to verify it fails**

Run: `corepack pnpm vitest run tests/unit/settings.test.ts`

Expected: FAIL — `expected undefined to be true`.

- [ ] **Step 3: Add the field**

In `src/shared/types.ts`, add to the `Settings` interface next to `peekSaver`:

```ts
  /** Let a service's "Continue with Facebook" dialog reuse the session already
   *  signed in under the Messenger service, so a social login costs a consent
   *  click instead of a password and a 2FA code. On by default; off is the old
   *  behaviour exactly — nothing seeded, nothing removed, nothing touched.
   *  See main/lib/identity-share.ts and the 2026-09-01 spec. */
  shareFacebookLogin: boolean;
```

And in `DEFAULT_SETTINGS`, next to `peekSaver: false,`:

```ts
  shareFacebookLogin: true,
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `corepack pnpm vitest run tests/unit/settings.test.ts`

Expected: PASS.

- [ ] **Step 5: Add the toggle to the Services pane**

In `src/renderer/src/components/SettingsView.tsx`, insert immediately after the "Battery saver for Light Sleep" `</Row>` and before the `{/* composition lives on Home ... */}` comment:

```tsx
                <Row
                  label="Share Facebook login"
                  hint="Sign in to another service with Facebook using the session already signed in under Messenger. The session is present only while the sign-in window is open."
                >
                  <input
                    type="checkbox"
                    data-testid="share-facebook-login"
                    checked={s.shareFacebookLogin}
                    onChange={(e) => update({ shareFacebookLogin: e.target.checked })}
                  />
                </Row>
```

- [ ] **Step 6: Run the full gate**

Run: `corepack pnpm lint && corepack pnpm typecheck && corepack pnpm test`

Expected: all green. If `typecheck` reports a missing `shareFacebookLogin` on any other object literal typed as `Settings` (a test fixture, for example), add `shareFacebookLogin: true` there too.

- [ ] **Step 7: Stop**

Report the task complete and ask the user to run `/grimoire-core:commit`. Do not commit.

---

### Task 3: The `IdentityShare` unit

**Files:**

- Create: `src/main/identity-share.ts`
- Test: `tests/unit/identity-share-store.test.ts`

**Interfaces:**

- Consumes: `cookieSetDetails`, `FACEBOOK_COOKIE_DOMAIN`, `hasFacebookSession`, `IDENTITY_SOURCE`, `isFacebookCookieDomain`, `maySeed` from Task 1; `ServiceId` from `src/shared/types.ts`; `Conf` from `conf`, as `PinStore` uses it.
- Produces: `IDENTITY_SEED_GRACE_MS: number`, `interface CookieJar`, and `class IdentityShare` with `constructor(cwd: string, jarFor: (id: ServiceId) => CookieJar, enabled: () => boolean)`, `maySeed(target: ServiceId, popupUrl: string): boolean`, `seed(target: ServiceId): Promise<boolean>`, `unseed(target: ServiceId): Promise<void>`, `unseedSoon(target: ServiceId): void`, `forget(target: ServiceId): void`, `sweepStale(): Promise<void>`, `dispose(): void`.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/identity-share-store.test.ts`:

```ts
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Cookie, CookiesSetDetails } from 'electron';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type CookieJar, IDENTITY_SEED_GRACE_MS, IdentityShare } from '../../src/main/identity-share';
import { FB_APP_IDS } from '../../src/main/lib/identity-share';
import type { ServiceId } from '../../src/shared/types';

const fbCookie = (over: Partial<Cookie> = {}): Cookie =>
  ({
    name: 'xs',
    value: 'secret',
    domain: '.facebook.com',
    path: '/',
    secure: true,
    httpOnly: true,
    session: false,
    ...over,
  }) as Cookie;

/** An in-memory stand-in for session.cookies, so the unit is testable without
 *  a real Electron session. */
class FakeJar implements CookieJar {
  constructor(public cookies: Cookie[] = []) {}
  async get(): Promise<Cookie[]> {
    return [...this.cookies];
  }
  async set(details: CookiesSetDetails): Promise<void> {
    this.cookies.push({
      name: details.name ?? '',
      value: details.value ?? '',
      domain: details.domain ?? new URL(details.url).host,
      path: details.path ?? '/',
      secure: details.secure ?? false,
    } as Cookie);
  }
  async remove(_url: string, name: string): Promise<void> {
    this.cookies = this.cookies.filter((c) => c.name !== name);
  }
}

let dir: string;
let jars: Record<string, FakeJar>;

const build = (enabled = true) => {
  const share = new IdentityShare(dir, (id) => jars[id] ?? (jars[id] = new FakeJar()), () => enabled);
  return share;
};

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'goetia-identity-'));
  jars = {
    messenger: new FakeJar([fbCookie({ name: 'c_user', value: '42' }), fbCookie()]),
    tiktok: new FakeJar(),
  };
  FB_APP_IDS.tiktok = 'APP';
});
afterEach(() => {
  delete FB_APP_IDS.tiktok;
  rmSync(dir, { recursive: true, force: true });
  vi.useRealTimers();
});

const DIALOG = 'https://www.facebook.com/v18.0/dialog/oauth?client_id=APP';

describe('seed', () => {
  it('copies the whole facebook cookie set into the target jar', async () => {
    const share = build();
    await expect(share.seed('tiktok')).resolves.toBe(true);
    expect(jars.tiktok.cookies.map((c) => c.name).sort()).toEqual(['c_user', 'xs']);
  });

  it('refuses when the source has no session (rule 5)', async () => {
    jars.messenger = new FakeJar([fbCookie({ name: 'datr' })]);
    const share = build();
    await expect(share.seed('tiktok')).resolves.toBe(false);
    expect(jars.tiktok.cookies).toEqual([]);
  });

  it('refuses when the target already has one (rule 6)', async () => {
    jars.tiktok = new FakeJar([fbCookie({ name: 'c_user', value: '99' })]);
    const share = build();
    await expect(share.seed('tiktok')).resolves.toBe(false);
    expect(jars.tiktok.cookies).toHaveLength(1);
    expect(jars.tiktok.cookies[0]?.value).toBe('99');
  });

  it('never copies a non-facebook cookie', async () => {
    jars.messenger.cookies.push(fbCookie({ name: 'tracker', domain: '.evil.example' }));
    const share = build();
    await share.seed('tiktok');
    expect(jars.tiktok.cookies.map((c) => c.name)).not.toContain('tracker');
  });
});

describe('unseed', () => {
  it('empties the facebook cookies it put there', async () => {
    const share = build();
    await share.seed('tiktok');
    await share.unseed('tiktok');
    expect(jars.tiktok.cookies).toEqual([]);
  });

  it('leaves a non-facebook cookie alone', async () => {
    jars.tiktok.cookies.push(fbCookie({ name: 'sessionid', domain: '.tiktok.com' }));
    const share = build();
    await share.seed('tiktok');
    await share.unseed('tiktok');
    expect(jars.tiktok.cookies.map((c) => c.name)).toEqual(['sessionid']);
  });
});

describe('unseedSoon', () => {
  it('waits out the grace, then unseeds', async () => {
    vi.useFakeTimers();
    const share = build();
    await share.seed('tiktok');
    share.unseedSoon('tiktok');
    expect(jars.tiktok.cookies).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(IDENTITY_SEED_GRACE_MS);
    expect(jars.tiktok.cookies).toEqual([]);
  });

  it('is a no-op for a service that was never seeded', async () => {
    vi.useFakeTimers();
    jars.tiktok.cookies.push(fbCookie({ name: 'c_user', value: '99' }));
    const share = build();
    share.unseedSoon('tiktok');
    await vi.advanceTimersByTimeAsync(IDENTITY_SEED_GRACE_MS);
    expect(jars.tiktok.cookies).toHaveLength(1);
  });
});

// A crash with a popup open must not leave a live Facebook session parked in
// a service jar forever — the marker is what makes the next boot notice.
describe('sweepStale', () => {
  it('unseeds every service the marker names, across a restart', async () => {
    const first = build();
    await first.seed('tiktok');
    first.dispose(); // simulates a crash: no unseed ran

    const second = build();
    await second.sweepStale();
    expect(jars.tiktok.cookies).toEqual([]);
  });

  it('clears the marker so a later boot has nothing to do', async () => {
    const first = build();
    await first.seed('tiktok');
    await first.sweepStale();

    jars.tiktok.cookies.push(fbCookie({ name: 'c_user', value: '99' }));
    await build().sweepStale();
    expect(jars.tiktok.cookies).toHaveLength(1);
  });
});

describe('forget', () => {
  it('drops the marker and any pending timer without touching cookies', async () => {
    vi.useFakeTimers();
    const share = build();
    await share.seed('tiktok');
    share.unseedSoon('tiktok');
    share.forget('tiktok');
    await vi.advanceTimersByTimeAsync(IDENTITY_SEED_GRACE_MS);
    expect(jars.tiktok.cookies).toHaveLength(2);
    await build().sweepStale();
    expect(jars.tiktok.cookies).toHaveLength(2);
  });
});

describe('maySeed', () => {
  it('reads the live toggle', () => {
    expect(build(true).maySeed('tiktok' as ServiceId, DIALOG)).toBe(true);
    expect(build(false).maySeed('tiktok' as ServiceId, DIALOG)).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `corepack pnpm vitest run tests/unit/identity-share-store.test.ts`

Expected: FAIL — `Failed to resolve import "../../src/main/identity-share"`.

- [ ] **Step 3: Write the implementation**

Create `src/main/identity-share.ts`:

```ts
import Conf from 'conf';
import type { Cookie, CookiesSetDetails } from 'electron';
import type { ServiceId } from '../shared/types';
import {
  cookieSetDetails,
  FACEBOOK_COOKIE_DOMAIN,
  hasFacebookSession,
  IDENTITY_SOURCE,
  isFacebookCookieDomain,
  maySeed,
} from './lib/identity-share';

/** The opener's arbiter round-trip is sub-second; this is sized to survive a
 *  slow one, and pulling the cookies out from under it would break the very
 *  completion this feature exists to smooth. NOT BANNER_GRACE_MS (120s) —
 *  that answers how long a peek view outlives its banner. */
export const IDENTITY_SEED_GRACE_MS = 10_000;

/** The slice of Electron's Cookies API this needs, so the unit is testable
 *  without a real session. */
export interface CookieJar {
  get(filter: { domain?: string }): Promise<Cookie[]>;
  set(details: CookiesSetDetails): Promise<void>;
  remove(url: string, name: string): Promise<void>;
}

interface SeedsFile {
  seeded: ServiceId[];
}

const removalUrl = (c: Cookie): string =>
  `${c.secure ? 'https' : 'http'}://${(c.domain ?? '').replace(/^\./, '')}${c.path ?? '/'}`;

/** Lends the Messenger partition's Facebook session to another service's
 *  sign-in popup for the popup's lifetime, and takes it back afterwards.
 *
 *  Persists only <userData>/identity-seeds.json, holding service ids and
 *  never a cookie value: it is the marker that lets the next boot clean up
 *  after a crash that killed the app with a popup open. Cookie values live
 *  only in Chromium's own encrypted jars and never cross IPC. */
export class IdentityShare {
  private conf: Conf<SeedsFile>;
  private timers = new Map<ServiceId, ReturnType<typeof setTimeout>>();

  constructor(
    cwd: string,
    private jarFor: (id: ServiceId) => CookieJar,
    private enabled: () => boolean,
  ) {
    this.conf = new Conf<SeedsFile>({
      cwd,
      configName: 'identity-seeds',
      defaults: { seeded: [] },
      clearInvalidConfig: true,
    });
  }

  /** Rules 1-4, synchronously — see views.ts seedIdentityPopup. */
  maySeed(target: ServiceId, popupUrl: string): boolean {
    return maySeed({ enabled: this.enabled(), target, popupUrl });
  }

  /** Rules 5-6, then the copy. Resolves to whether anything was seeded. */
  async seed(target: ServiceId): Promise<boolean> {
    if (IDENTITY_SOURCE === null || target === IDENTITY_SOURCE) return false;
    const source = this.jarFor(IDENTITY_SOURCE);
    const dest = this.jarFor(target);
    const filter = { domain: FACEBOOK_COOKIE_DOMAIN.slice(1) };
    const [from, to] = await Promise.all([source.get(filter), dest.get(filter)]);
    // the filter is Chromium's, so re-check ours: a lookalike domain must
    // never be read as the Facebook session, nor written to the target
    if (!hasFacebookSession(from) || hasFacebookSession(to)) return false;
    // durable, and BEFORE the first set: a crash between here and the unseed
    // is exactly what the marker exists for
    this.mark(target);
    const share = from.filter((c) => isFacebookCookieDomain(c.domain ?? ''));
    for (const c of share) {
      // one rejected cookie must not abort the set — a partial session still
      // beats a full password prompt, and Facebook re-issues what it needs
      try {
        await dest.set(cookieSetDetails(c));
      } catch {
        /* ignore */
      }
    }
    return true;
  }

  /** Take the session back after the popup's completion has had time to
   *  finish. A no-op for a service that was never seeded, so a deliberate
   *  direct login in a service jar is never collected by this path. */
  unseedSoon(target: ServiceId): void {
    if (!this.conf.store.seeded.includes(target)) return;
    this.cancel(target);
    this.timers.set(
      target,
      setTimeout(() => {
        this.timers.delete(target);
        void this.unseed(target);
      }, IDENTITY_SEED_GRACE_MS),
    );
  }

  async unseed(target: ServiceId): Promise<void> {
    this.cancel(target);
    const jar = this.jarFor(target);
    const cookies = await jar.get({ domain: FACEBOOK_COOKIE_DOMAIN.slice(1) });
    for (const c of cookies) {
      if (!isFacebookCookieDomain(c.domain ?? '')) continue;
      try {
        await jar.remove(removalUrl(c), c.name);
      } catch {
        /* ignore */
      }
    }
    this.unmark(target);
  }

  /** The jar is already gone (a purge wiped the partition): drop the marker
   *  and any pending timer without touching cookies. */
  forget(target: ServiceId): void {
    this.cancel(target);
    this.unmark(target);
  }

  /** Boot: clean up after a crash that killed the app with a popup open. */
  async sweepStale(): Promise<void> {
    for (const id of [...this.conf.store.seeded]) await this.unseed(id);
  }

  /** Quit: drop the timers. Any marker left standing is deliberate — the next
   *  boot's sweepStale is what collects it. */
  dispose(): void {
    for (const t of this.timers.values()) clearTimeout(t);
    this.timers.clear();
  }

  private cancel(target: ServiceId): void {
    const t = this.timers.get(target);
    if (t !== undefined) {
      clearTimeout(t);
      this.timers.delete(target);
    }
  }

  private mark(target: ServiceId): void {
    const seeded = this.conf.store.seeded;
    if (!seeded.includes(target)) this.conf.set('seeded', [...seeded, target]);
  }

  private unmark(target: ServiceId): void {
    this.conf.set(
      'seeded',
      this.conf.store.seeded.filter((id) => id !== target),
    );
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `corepack pnpm vitest run tests/unit/identity-share-store.test.ts`

Expected: PASS, 12 tests.

- [ ] **Step 5: Run the full gate**

Run: `corepack pnpm lint && corepack pnpm typecheck && corepack pnpm test`

Expected: all green.

- [ ] **Step 6: Stop**

Report the task complete and ask the user to run `/grimoire-core:commit`. Do not commit.

---

### Task 4: Seed the popup from `views.ts`

**Files:**

- Modify: `src/main/views.ts` — the imports, the constructor at `:113-124`, the `did-create-window` identity branch at `:286-290`, and `guardIdentityWindow`'s `closed` handler at `:749-752`
- Test: none. This is wiring, and an OAuth popup cannot be driven against a live Facebook — the decision logic it calls is already covered by Tasks 1 and 3. Verified by the live pass instead.

**Interfaces:**

- Consumes: `IdentityShare` from Task 3 (`maySeed(target, popupUrl)`, `seed(target)`, `unseedSoon(target)`).
- Produces: a new required `ServiceViewManager` constructor parameter, `identityShare: IdentityShare`, positioned after `zoomLevel` and before the optional `overlay`. Task 5 supplies it.

- [ ] **Step 1: Add the import**

In `src/main/views.ts`, beside the other `./` main-process imports:

```ts
import type { IdentityShare } from './identity-share';
```

- [ ] **Step 2: Take the dependency in the constructor**

In the `ServiceViewManager` constructor, insert a parameter after `private zoomLevel: (id: ServiceId) => number,` and before `private overlay?: {`:

```ts
    private identityShare: IdentityShare,
```

`typecheck` will now fail at the single call site in `src/main/index.ts`. Task 5 fixes it; leave it failing until then, or pass a temporary value only if you must run the app in between.

- [ ] **Step 3: Call the seeder from the identity branch**

In `wc.on('did-create-window', ...)`, replace:

```ts
      if (isIdentityPopup(url)) {
        this.guardIdentityWindow(id, child);
        return;
      }
```

with:

```ts
      if (isIdentityPopup(url)) {
        this.guardIdentityWindow(id, child);
        void this.seedIdentityPopup(id, child, url, wc);
        return;
      }
```

- [ ] **Step 4: Add the seeder method**

Add to `ServiceViewManager`, immediately before `private guardIdentityWindow`:

```ts
  /** Lend the popup the Facebook session Messenger is already signed into, so
   *  a "Continue with Facebook" costs a consent click instead of a password
   *  and a 2FA code.
   *
   *  Timing is the whole problem: setWindowOpenHandler is synchronous and the
   *  child is already fetching the dialog, but every cookie API is async, so
   *  there is no window in which to seed before the first request leaves. The
   *  load is therefore stopped, seeded, and replayed. Re-navigating the same
   *  WebContents keeps window.opener — opener is a property of the browsing
   *  context, not the document — which is the completion path the whole flow
   *  hangs on (2026-08-31 live pass).
   *
   *  The sync gate is load-bearing: once stop() has run the popup is blank
   *  until something re-navigates it, so the decision to interrupt is made
   *  before the first await and the loadURL after it is unconditional. A
   *  popup that fails the gate is never touched. */
  private async seedIdentityPopup(
    id: ServiceId,
    popup: BrowserWindow,
    url: string,
    opener: WebContents,
  ): Promise<void> {
    if (!this.identityShare.maySeed(id, url)) return;
    // read before the await: the opener may navigate while we are seeding
    const httpReferrer = opener.getURL();
    popup.webContents.stop();
    const seeded = await this.identityShare.seed(id);
    if (popup.isDestroyed()) return;
    debugCalls(`identity popup replay on ${id} (seeded=${seeded}): "${url}"`);
    popup.webContents.loadURL(url, { httpReferrer });
  }
```

If `WebContents` is not already imported as a type in this file, add it to the existing `import type { … } from 'electron'` line.

- [ ] **Step 5: Take the session back when the popup closes**

In `guardIdentityWindow`, replace the `closed` handler:

```ts
    popup.on('closed', () => {
      debugCalls(`identity popup closed (${id})`);
      this.identityWindows.get(id)?.delete(popup);
    });
```

with:

```ts
    popup.on('closed', () => {
      debugCalls(`identity popup closed (${id})`);
      this.identityWindows.get(id)?.delete(popup);
      // the opener may still be finishing its arbiter round-trip, so the
      // session goes back after a grace, not on this tick
      this.identityShare.unseedSoon(id);
    });
```

- [ ] **Step 6: Run the full gate**

Run: `corepack pnpm lint && corepack pnpm typecheck && corepack pnpm test`

Expected: `lint` and `test` green. `typecheck` fails **only** with "Expected 7 arguments, but got 6" (or similar) at the `new ServiceViewManager(` call in `src/main/index.ts` — that is Task 5's job. Any other error is yours to fix now.

- [ ] **Step 7: Stop**

Report the task complete, note the expected `typecheck` failure, and ask the user to run `/grimoire-core:commit`. Do not commit.

---

### Task 5: Boot, purge and quit wiring

**Files:**

- Modify: `src/main/index.ts` — construction near `:75-77`, the `ServiceViewManager` call at `:89`, and the `before-quit` handler at `:305`
- Modify: `src/main/ipc-handlers.ts` — the `AppContext` interface
- Modify: `src/main/purge.ts` — `purgeService`
- Test: none new. Covered by Task 3's `sweepStale` and `forget` tests; the wiring is verified by the live pass.

**Interfaces:**

- Consumes: `IdentityShare`, `IDENTITY_SEED_GRACE_MS` from Task 3; the constructor parameter from Task 4; `Settings['shareFacebookLogin']` from Task 2.
- Produces: `AppContext.identityShare: IdentityShare`.

- [ ] **Step 1: Construct it and sweep at boot**

In `src/main/index.ts`, after `const passkeyStore = new PasskeyStore(...)`:

```ts
    const identityShare = new IdentityShare(
      app.getPath('userData'),
      (id) => session.fromPartition(`persist:${id}`).cookies,
      () => settings.get().shareFacebookLogin,
    );
    // a crash that killed the app with a sign-in popup open leaves the shared
    // session parked in a service jar; the marker file is how we notice
    void identityShare.sweepStale();
```

Add `import { IdentityShare } from './identity-share';` beside the other main-process imports, and make sure `session` is in the existing `import { … } from 'electron'` list.

- [ ] **Step 2: Pass it to the view manager**

In the `new ServiceViewManager(` call, add `identityShare,` as the argument after the `zoomLevel` callback and before the `overlay` object — matching the parameter order from Task 4, Step 2.

- [ ] **Step 3: Put it on the context**

In `src/main/ipc-handlers.ts`, add to the `AppContext` interface after `passkeyStore`:

```ts
  /** lends Messenger's Facebook session to another service's sign-in popup;
   *  see identity-share.ts */
  identityShare: IdentityShare;
```

Add `import type { IdentityShare } from './identity-share';`. Then add `identityShare,` to the `const ctx: AppContext = {` literal at `src/main/index.ts:244`, beside `passkeyStore,` at `:254`.

- [ ] **Step 4: Drop the marker on purge**

In `src/main/purge.ts`, inside `purgeService`, immediately after the `clearStorageData()` line:

```ts
  // the wipe already removed any lent Facebook cookies, so all that is left is
  // the bookkeeping: drop the marker and cancel the grace timer, or the next
  // boot sweeps a jar that has nothing in it
  ctx.identityShare.forget(id);
```

- [ ] **Step 5: Clear the timers on quit**

In `src/main/index.ts`, inside the existing `app.on('before-quit', () => {` handler:

```ts
      identityShare.dispose();
```

- [ ] **Step 6: Run the full gate**

Run: `corepack pnpm lint && corepack pnpm typecheck && corepack pnpm test`

Expected: all green, including the `typecheck` error Task 4 left behind.

- [ ] **Step 7: Run the e2e suite**

Run: `env -u ELECTRON_RUN_AS_NODE corepack pnpm e2e`

Expected: green. The `env -u` matters — a VS Code shell exports `ELECTRON_RUN_AS_NODE` and Electron will refuse to open a window with it set. Nothing here should change e2e behaviour; a failure means the boot wiring broke something.

- [ ] **Step 8: Update CLAUDE.md**

Add to the **Security** section, after the External-links bullet:

```markdown
- **Shared Facebook identity** (2026-09-01, user decision; spec `docs/superpowers/specs/2026-09-01-shared-facebook-identity-design.md`). A "Continue with Facebook" popup borrows `persist:messenger`'s facebook.com cookies for the popup's lifetime only — Messenger's URL *is* `www.facebook.com/messages/`, so its partition is the Facebook session by construction. Six rules gate it (`lib/identity-share.ts` `shouldSeed`), and the one that carries the security is **`FB_APP_IDS`**: without a per-service app id captured from a live sign-in, nothing is ever seeded. That table is what stops a malicious or XSS'd service page from opening its *own* `dialog/oauth` against a signed-in jar and collecting a token on one click — the popup guard cannot contain that, because the SDK answers by `postMessage` through the `staticxx.facebook.com` arbiter and never navigates anywhere refusable. Never fill an entry in from memory. The seed is taken back `IDENTITY_SEED_GRACE_MS` after the popup closes, and `identity-seeds.json` (service ids, never a cookie value) lets the next boot clean up after a crash. Rule 6 — target jar must have no Facebook session — is what leaves Instagram's own Log-in-with-Facebook cookies alone. Timing: `setWindowOpenHandler` is sync and every cookie API is async, so `seedIdentityPopup` stops the popup's load, seeds, and replays it with `httpReferrer`; the sync gate (`maySeed`) must decide **before** the first `await`, because a stopped popup is blank until something re-navigates it.
```

- [ ] **Step 9: Verify the docs lint**

Run: `npx markdownlint-cli2 CLAUDE.md docs/superpowers/specs/2026-09-01-shared-facebook-identity-design.md docs/superpowers/plans/2026-09-01-shared-facebook-identity.md`

Expected: `Summary: 0 issues in 0 files`.

- [ ] **Step 10: Stop**

Report the task complete and ask the user to run `/grimoire-core:commit`. Do not commit.

---

## After the plan: the live pass

The feature is **inert** until step 1 below, because `FB_APP_IDS` ships empty. That is deliberate — an implementer who "helpfully" fills it in has removed the security gate. Record every finding in the spec's own **Live pass** section, the way `2026-08-31-social-login-design.md` records its findings.

Build first: `corepack pnpm package:mac`, then launch the packaged app with `GOETIA_DEBUG_CALLS=1`.

1. **Capture the app ids.** Sign into TikTok and Shopee with Facebook. The `window.open from <id>:` debug line carries the dialog URL; read `client_id` out of it and put it in `FB_APP_IDS`. Rebuild.
2. **The payoff.** With Messenger signed in and the toggle on, TikTok → Continue with Facebook reaches the consent screen ("Continue as …"), not `login.php`, and asks for no 2FA.
3. **The known risk from spec §3.** The replayed load is browser-initiated, so `Sec-Fetch-Site` goes from `cross-site` to `none`. Confirm the dialog still renders and Facebook shows no error. If it does not, switch to plan B in the spec: inject the `Cookie` header for facebook hosts on the popup's `webContentsId` through the `onBeforeSendHeaders` hook already in `configureSession`.
4. **Completion.** The popup closes itself and TikTok lands on `/messages`. `grep -c 'popup contained'` on the log must be 0.
5. **The session goes back.** After the popup closes plus 10s, DevTools → Application → Cookies on the TikTok view shows no facebook.com cookies.
6. **Shopee.** Repeat 2-5.
7. **The toggle.** Off ⇒ TikTok → Continue with Facebook renders `login.php` again and nothing is seeded.
8. **The crash path.** Kill the app (`kill -9`) with a popup open, relaunch, and confirm the TikTok jar is clean — this is `sweepStale` doing its job.
9. **Rule 6.** With a Facebook session deliberately established directly in Shopee's own jar, confirm a later popup does **not** clobber it.
