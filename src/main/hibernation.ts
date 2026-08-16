import type { ServiceId } from '../shared/types';
import type { AppContext } from './ipc-handlers';
import { shouldHibernate } from './lib/hibernation-rules';
import { PEEK_INTERVAL_MS, PEEK_TIMEOUT_MS, pickPeek } from './lib/peek-rules';

// env overrides compress time for e2e; production never sets them
const SWEEP_MS = Number(process.env.GOETIA_SWEEP_MS) || 60_000;
const INTERVAL_MS = Number(process.env.GOETIA_PEEK_INTERVAL_MS) || PEEK_INTERVAL_MS;
const TIMEOUT_MS = Number(process.env.GOETIA_PEEK_TIMEOUT_MS) || PEEK_TIMEOUT_MS;
// first sweep soon after boot so warm-up peeks populate badges without
// waiting out a full sweep interval
const BOOT_DELAY_MS = 5_000;

export class HibernationController {
  private lastActiveAt = new Map<ServiceId, number>();
  /** also stamped on hibernation teardown: the count is live at that instant */
  private lastPeekEndedAt = new Map<ServiceId, number>();
  private peeking: { id: ServiceId; timer: NodeJS.Timeout } | null = null;
  private bootTimer: NodeJS.Timeout | null = null;
  private sweepTimer: NodeJS.Timeout | null = null;

  constructor(private ctx: AppContext) {}

  noteActivated(id: ServiceId): void {
    this.lastActiveAt.set(id, Date.now());
    // mid-peek activation is the wake the user wanted: keep the view
    if (this.peeking?.id === id) this.endPeek(false);
  }

  noteUnreadReport(id: ServiceId): void {
    if (this.peeking?.id === id) this.endPeek(true);
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
      };
      if (shouldHibernate(candidate, now, s.hibernationMinutes) && this.ctx.views.has(id)) {
        this.ctx.views.destroy(id);
        this.ctx.waking.end(id, 'destroyed');
        this.ctx.state.setRuntime(id, { hibernated: true });
        this.lastPeekEndedAt.set(id, now);
      }
    }
    if (!s.lightSleep) return;
    const due = pickPeek(
      s.order.map((id) => ({
        id,
        disabled: s.disabled[id],
        neverHibernate: s.neverHibernate[id],
        hasView: this.ctx.views.has(id),
        lastPeekEndedAt: this.lastPeekEndedAt.get(id) ?? 0,
      })),
      now,
      INTERVAL_MS,
      this.peeking?.id ?? null,
    );
    if (due) this.beginPeek(due);
  }

  private beginPeek(id: ServiceId): void {
    this.ctx.views.ensure(id);
    const timer = setTimeout(() => {
      if (this.peeking?.id === id) this.endPeek(true);
    }, TIMEOUT_MS);
    this.peeking = { id, timer };
  }

  private endPeek(destroy: boolean): void {
    if (!this.peeking) return;
    const { id, timer } = this.peeking;
    clearTimeout(timer);
    this.peeking = null;
    this.lastPeekEndedAt.set(id, Date.now());
    // tolerate a view already gone (service disabled mid-peek) and never
    // destroy under the user (activated mid-peek)
    if (destroy && this.ctx.state.activeId !== id && this.ctx.views.has(id)) {
      this.ctx.views.destroy(id);
      this.ctx.waking.end(id, 'destroyed');
      this.ctx.state.setRuntime(id, { hibernated: true });
    }
    // chain straight to the next due service so boot warm-up walks the roster
    this.sweep();
  }
}
