import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Cookie, CookiesSetDetails } from 'electron';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  type CookieJar,
  IDENTITY_SEED_GRACE_MS,
  IdentityShare,
} from '../../src/main/identity-share';
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

const jarFor = (id: string): FakeJar => {
  const existing = jars[id];
  if (existing) return existing;
  const fresh = new FakeJar();
  jars[id] = fresh;
  return fresh;
};

let confirmed: ServiceId[];
let allowShare: boolean;

const build = (enabled = true) =>
  new IdentityShare(
    dir,
    jarFor,
    () => enabled,
    async (target) => {
      confirmed.push(target);
      return allowShare;
    },
  );

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'goetia-identity-'));
  jars = {
    messenger: new FakeJar([fbCookie({ name: 'c_user', value: '42' }), fbCookie()]),
    tiktok: new FakeJar(),
  };
  FB_APP_IDS.tiktok = 'APP';
  confirmed = [];
  allowShare = true;
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

// Local user verification before a credential crosses partitions. Not a
// passkey and not WebAuthn — the same Touch ID step the passkey prompt uses.
describe('the share confirmation', () => {
  it('is asked once, and the seed proceeds when accepted', async () => {
    const share = build();
    await expect(share.seed('tiktok')).resolves.toBe(true);
    expect(confirmed).toEqual(['tiktok']);
  });

  it('copies nothing and marks nothing when declined', async () => {
    allowShare = false;
    const share = build();
    await expect(share.seed('tiktok')).resolves.toBe(false);
    expect(jars.tiktok.cookies).toEqual([]);
    // nothing was lent, so nothing must be left for the boot sweep to chase
    jars.tiktok.cookies.push(fbCookie({ name: 'c_user', value: '99' }));
    await build().sweepStale();
    expect(jars.tiktok.cookies).toHaveLength(1);
  });

  it('is never asked when a jar rule already refuses, so no stray prompt', async () => {
    jars.tiktok = new FakeJar([fbCookie({ name: 'c_user', value: '99' })]);
    await build().seed('tiktok');
    expect(confirmed).toEqual([]);

    jars.tiktok = new FakeJar();
    jars.messenger = new FakeJar([fbCookie({ name: 'datr' })]);
    await build().seed('tiktok');
    expect(confirmed).toEqual([]);
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

// The security promise is "present only while the popup is open". Chromium's
// cookies.remove reports a url that matches nothing by doing NOTHING — no
// throw — so an unseed that trusted its own removals would strand a live
// session in a service jar and hide it from the next boot's sweep.
describe('unseed when removal does not take', () => {
  class StuckJar extends FakeJar {
    override async remove(): Promise<void> {
      // silently ineffective, exactly as a mismatched removal url behaves
    }
  }

  class ThrowingJar extends FakeJar {
    override async remove(): Promise<void> {
      throw new Error('remove failed');
    }
  }

  it('keeps the marker when the cookies survive, so the next sweep retries', async () => {
    jars.tiktok = new StuckJar();
    const share = build();
    await share.seed('tiktok');
    await share.unseed('tiktok');
    expect(jars.tiktok.cookies).toHaveLength(2);

    // the marker must still name tiktok: a fresh instance has work to do
    jars.tiktok = new FakeJar(jars.tiktok.cookies);
    await build().sweepStale();
    expect(jars.tiktok.cookies).toEqual([]);
  });

  it('keeps the marker when every removal throws', async () => {
    jars.tiktok = new ThrowingJar();
    const share = build();
    await share.seed('tiktok');
    await share.unseed('tiktok');
    expect(jars.tiktok.cookies).toHaveLength(2);

    jars.tiktok = new FakeJar(jars.tiktok.cookies);
    await build().sweepStale();
    expect(jars.tiktok.cookies).toEqual([]);
  });

  it('warns so a silent leak is not silent', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    jars.tiktok = new StuckJar();
    const share = build();
    await share.seed('tiktok');
    await share.unseed('tiktok');
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('survived removal'));
    warn.mockRestore();
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
