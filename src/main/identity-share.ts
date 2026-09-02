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

/** Shares the calls-debug flag: this is the same popup story, and a second
 *  env var would be one more thing to remember on a live pass. Counts only —
 *  never a cookie name or value. */
function debugIdentity(message: string): void {
  if (process.env.GOETIA_DEBUG_CALLS) console.error(`[calls-debug] ${message}`);
}

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
  /** seeds whose confirm/copy is still in flight — nothing is marked yet, so a
   *  popup that closes here would find no marker and arm no unseed */
  private inFlight = new Set<ServiceId>();
  /** unseed requests that arrived during an in-flight seed, honoured once it
   *  lands (a popup closed before its own confirm resolved) */
  private pendingUnseed = new Set<ServiceId>();

  constructor(
    cwd: string,
    private jarFor: (id: ServiceId) => CookieJar,
    private enabled: () => boolean,
    /** local user verification (Touch ID, else a native confirm) asked once
     *  per seed — see identitySharePrompt */
    private confirmShare: (target: ServiceId) => Promise<boolean>,
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

  /** Rules 5-6, then the copy. Resolves to whether anything was seeded.
   *  `isLive` reports whether the popup still exists: an unbounded confirm
   *  (Touch ID left unanswered) can outlast a popup the page closed, and a
   *  seed written after that would strand a Facebook session in the target jar
   *  with nothing to take it back but the next boot. */
  async seed(target: ServiceId, isLive: () => boolean = () => true): Promise<boolean> {
    if (IDENTITY_SOURCE === null || target === IDENTITY_SOURCE) return false;
    this.inFlight.add(target);
    try {
      const source = this.jarFor(IDENTITY_SOURCE);
      const dest = this.jarFor(target);
      const filter = { domain: FACEBOOK_COOKIE_DOMAIN.slice(1) };
      const [from, to] = await Promise.all([source.get(filter), dest.get(filter)]);
      // the filter is Chromium's, so re-check ours: a lookalike domain must
      // never be read as the Facebook session, nor written to the target
      if (!hasFacebookSession(from) || hasFacebookSession(to)) return false;
      // Ask only here — after rules 5 and 6 — so a popup that would not be
      // seeded anyway never puts a prompt on screen. FB_APP_IDS refuses an
      // attacker's OWN app id but cannot refuse a compromised service page
      // opening its own real dialog against a seeded jar; this is the step that
      // makes the credential move visible and refusable.
      if (!(await this.confirmShare(target))) {
        debugIdentity(`share refused for ${target}`);
        return false;
      }
      // the popup died while the confirm was on screen: seed nothing. Its
      // 'closed' handler already fired unseedSoon, which parked in pendingUnseed
      // because no marker existed yet — the finally drops it, so no stray timer.
      if (!isLive()) {
        debugIdentity(`popup for ${target} closed before seeding; nothing written`);
        return false;
      }
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
      debugIdentity(`seeded ${share.length} cookie(s) into ${target}`);
      return true;
    } finally {
      this.inFlight.delete(target);
      // a close that raced this seed parked its unseed here; honour it now that
      // the marker (if any) exists
      if (this.pendingUnseed.delete(target)) this.unseedSoon(target);
    }
  }

  /** Take the session back after the popup's completion has had time to
   *  finish. A no-op for a service that was never seeded, so a deliberate
   *  direct login in a service jar is never collected by this path. */
  unseedSoon(target: ServiceId): void {
    // a seed is still deciding: it has not marked yet, so there is nothing to
    // take back. Park the request and let seed()'s finally re-issue it.
    if (this.inFlight.has(target)) {
      this.pendingUnseed.add(target);
      return;
    }
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
    const mine = async (): Promise<Cookie[]> =>
      (await jar.get({ domain: FACEBOOK_COOKIE_DOMAIN.slice(1) })).filter((c) =>
        isFacebookCookieDomain(c.domain ?? ''),
      );
    const cookies = await mine();
    for (const c of cookies) {
      try {
        await jar.remove(removalUrl(c), c.name);
      } catch {
        // one stuck cookie must not strand the rest; the check below is what
        // decides whether this counted
      }
    }
    // Verify, never assume. The whole "present only while the popup is open"
    // promise rests on this removal actually happening, and cookies.remove
    // reports a url that matches nothing by doing nothing at all — no throw.
    // Unmarking regardless would strand a live Facebook session in a service
    // jar AND hide it from the next boot's sweep, which is the one place it
    // could still be caught.
    const left = await mine();
    if (left.length > 0) {
      console.warn(
        `[identity] ${target}: ${left.length} shared Facebook cookie(s) survived removal; keeping the marker so the next sweep retries`,
      );
      return;
    }
    debugIdentity(`unseeded ${cookies.length} cookie(s) from ${target}`);
    this.unmark(target);
  }

  /** The jar is already gone (a purge wiped the partition): drop the marker
   *  and any pending timer without touching cookies. */
  forget(target: ServiceId): void {
    this.cancel(target);
    this.pendingUnseed.delete(target);
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
    this.pendingUnseed.clear();
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
