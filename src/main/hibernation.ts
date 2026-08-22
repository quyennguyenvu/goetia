import type { ServiceId } from '../shared/types';
import type { AppContext } from './ipc-handlers';
import { BANNER_GRACE_MS, shouldHibernate } from './lib/hibernation-rules';
import {
  PEEK_INTERVAL_MS,
  PEEK_STAGGER_MS,
  PEEK_TIMEOUT_MS,
  peekInterval,
  pickPeek,
} from './lib/peek-rules';

// env overrides compress time for e2e; production never sets them
const SWEEP_MS = Number(process.env.GOETIA_SWEEP_MS) || 60_000;
const INTERVAL_MS = Number(process.env.GOETIA_PEEK_INTERVAL_MS) || PEEK_INTERVAL_MS;
const TIMEOUT_MS = Number(process.env.GOETIA_PEEK_TIMEOUT_MS) || PEEK_TIMEOUT_MS;
const GRACE_MS = Number(process.env.GOETIA_BANNER_GRACE_MS) || BANNER_GRACE_MS;
const STAGGER_MS = Number(process.env.GOETIA_PEEK_STAGGER_MS) || PEEK_STAGGER_MS;
/** Peeks are otherwise invisible; this is how the backoff gets tuned. */
const DEBUG_PEEKS = Boolean(process.env.GOETIA_DEBUG_PEEKS);
// first sweep soon after boot so warm-up peeks populate badges without
// waiting out a full sweep interval
const BOOT_DELAY_MS = 5_000;

export class HibernationController {
  private lastActiveAt = new Map<ServiceId, number>();
  /** also stamped on hibernation teardown: the count is live at that instant */
  private lastPeekEndedAt = new Map<ServiceId, number>();
  /** epoch ms of each service's last shown banner — the grace anchor */
  private lastBannerAt = new Map<ServiceId, number>();
  private peeking: {
    id: ServiceId;
    timer: NodeJS.Timeout;
    /** count when the peek started, to tell a useful peek from a wasted one */
    before: { direct: number; indirect: number };
  } | null = null;
  /** consecutive peeks that reported nothing new, per service; drives the
   *  opt-in backoff and is reset by any change or by the user opening it */
  private quietPeeks = new Map<ServiceId, number>();
  private graceTimers = new Map<ServiceId, NodeJS.Timeout>();
  private bootTimer: NodeJS.Timeout | null = null;
  private sweepTimer: NodeJS.Timeout | null = null;
  /** the staggered hand-off from one peek to the next */
  private staggerTimer: NodeJS.Timeout | null = null;

  constructor(private ctx: AppContext) {}

  noteActivated(id: ServiceId): void {
    this.lastActiveAt.set(id, Date.now());
    // mid-peek activation is the wake the user wanted: keep the view
    if (this.peeking?.id === id) this.endPeek(false);
    // an activated view must never be torn down by a stale grace timer
    const grace = this.graceTimers.get(id);
    if (grace) {
      clearTimeout(grace);
      this.graceTimers.delete(id);
    }
    // the user is here: whatever the backoff had decided is now wrong
    this.quietPeeks.delete(id);
  }

  noteUnreadReport(id: ServiceId): void {
    if (this.peeking?.id === id) this.endPeek(true);
  }

  noteBannerFired(id: ServiceId): void {
    this.lastBannerAt.set(id, Date.now());
  }

  start(): void {
    this.bootTimer = setTimeout(() => this.sweep(), BOOT_DELAY_MS);
    this.sweepTimer = setInterval(() => this.sweep(), SWEEP_MS);
  }

  dispose(): void {
    if (this.bootTimer) clearTimeout(this.bootTimer);
    if (this.sweepTimer) clearInterval(this.sweepTimer);
    if (this.peeking) clearTimeout(this.peeking.timer);
    this.peeking = null;
    if (this.staggerTimer) clearTimeout(this.staggerTimer);
    this.staggerTimer = null;
    for (const t of this.graceTimers.values()) clearTimeout(t);
    this.graceTimers.clear();
    this.quietPeeks.clear();
  }

  private sweep(): void {
    const s = this.ctx.settings.get();
    const now = Date.now();
    for (const id of s.order) {
      if (s.disabled[id]) continue;
      if (id === this.peeking?.id) continue; // never tear down a peek in flight
      if (this.lastActiveAt.get(id) === undefined) {
        // never-visited services start their idle clock at the first sweep
        this.lastActiveAt.set(id, now);
      }
      const candidate = {
        active: this.ctx.state.activeId === id,
        hibernated: this.ctx.state.runtime(id).hibernated,
        neverHibernate: s.neverHibernate[id],
        lastActiveAt: this.lastActiveAt.get(id) ?? now,
        lastBannerAt: this.lastBannerAt.get(id) ?? 0,
      };
      if (
        shouldHibernate(candidate, now, s.hibernationMinutes, GRACE_MS) &&
        this.ctx.views.has(id)
      ) {
        this.ctx.views.destroy(id);
        this.ctx.waking.end(id, 'destroyed');
        this.ctx.state.setRuntime(id, { hibernated: true });
        this.lastPeekEndedAt.set(id, now);
      }
    }
    if (!s.lightSleep) return;
    const onBattery = this.ctx.onBattery();
    const due = pickPeek(
      s.order.map((id) => ({
        id,
        disabled: s.disabled[id],
        neverHibernate: s.neverHibernate[id],
        hasView: this.ctx.views.has(id),
        lastPeekEndedAt: this.lastPeekEndedAt.get(id) ?? 0,
        intervalMs: peekInterval({
          base: INTERVAL_MS,
          quietPeeks: this.quietPeeks.get(id) ?? 0,
          saver: s.peekSaver,
          onBattery,
        }),
      })),
      now,
      INTERVAL_MS,
      this.peeking?.id ?? null,
    );
    if (due) this.beginPeek(due);
  }

  private beginPeek(id: ServiceId): void {
    const u = this.ctx.state.runtime(id).unread;
    this.ctx.views.ensure(id);
    const timer = setTimeout(() => {
      if (this.peeking?.id === id) this.endPeek(true);
    }, TIMEOUT_MS);
    this.peeking = { id, timer, before: { direct: u.direct, indirect: u.indirect } };
  }

  private endPeek(destroy: boolean): void {
    if (!this.peeking) return;
    const { id, timer, before } = this.peeking;
    clearTimeout(timer);
    this.peeking = null;
    this.lastPeekEndedAt.set(id, Date.now());
    // A peek that loaded a whole page and found the same count was a wasted
    // load. Only counted for a peek that ran its course — `destroy: false`
    // means the user activated mid-peek, and noteActivated clears the streak.
    if (destroy) {
      const u = this.ctx.state.runtime(id).unread;
      const quiet = u.direct === before.direct && u.indirect === before.indirect;
      const streak = quiet ? (this.quietPeeks.get(id) ?? 0) + 1 : 0;
      this.quietPeeks.set(id, streak);
      if (DEBUG_PEEKS) {
        const s = this.ctx.settings.get();
        const next = peekInterval({
          base: INTERVAL_MS,
          quietPeeks: streak,
          saver: s.peekSaver,
          onBattery: this.ctx.onBattery(),
        });
        console.error(
          `[peek] ${id} ${quiet ? 'nothing new' : 'found a change'} · quiet streak ${streak} · next in ${Math.round(next / 60_000)} min`,
        );
      }
    }
    if (destroy) this.destroyOrGrace(id);
    // hand off to the next due service so boot warm-up walks the roster —
    // staggered, because chaining it made launch a queue of cold page loads
    this.scheduleSweep();
  }

  private scheduleSweep(): void {
    if (this.staggerTimer) return;
    this.staggerTimer = setTimeout(() => {
      this.staggerTimer = null;
      this.sweep();
    }, STAGGER_MS);
  }

  /** Tear the peeked view down now — or, within banner grace, defer to the
   *  grace boundary so the banner's in-page click handler survives a prompt
   *  click. Re-entered from its own timer: a newer banner mid-grace extends. */
  private destroyOrGrace(id: ServiceId): void {
    const pending = this.graceTimers.get(id);
    if (pending) {
      clearTimeout(pending);
      this.graceTimers.delete(id);
    }
    // tolerate a view already gone (service disabled mid-peek) and never
    // destroy under the user (activated mid-peek or mid-grace)
    if (this.ctx.state.activeId === id || !this.ctx.views.has(id)) return;
    const remaining = GRACE_MS - (Date.now() - (this.lastBannerAt.get(id) ?? 0));
    if (remaining > 0) {
      this.graceTimers.set(
        id,
        setTimeout(() => {
          this.graceTimers.delete(id);
          this.destroyOrGrace(id);
        }, remaining),
      );
      return;
    }
    this.ctx.views.destroy(id);
    this.ctx.waking.end(id, 'destroyed');
    this.ctx.state.setRuntime(id, { hibernated: true });
  }
}
