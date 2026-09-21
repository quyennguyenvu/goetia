import type { ServiceId } from '../shared/types';
import { dueUnmutes, globalMuteDue, nextMuteExpiry } from './lib/mute-rules';

/** Fire just past the expiry, never marginally before it. */
const EXPIRY_SLACK_MS = 250;

/** One timer for the earliest timed mute — per-service or global — re-armed
 *  on every fire and on every mute change (both mute tails call rearm).
 *  Nothing is stored here: the due set is recomputed from settings and the
 *  clock on each fire, so a late fire after sleep self-corrects, and start()
 *  ends a mute that expired while the app was closed. QuietHoursController's
 *  shape. */
export class MuteTimerController {
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private opts: {
      muted: () => Record<ServiceId, boolean>;
      mutedUntil: () => Record<ServiceId, number>;
      /** the shared unmute tail, once per due service */
      onExpire: (ids: ServiceId[]) => void;
      globalMuted: () => boolean;
      globalMutedUntil: () => number;
      /** the global expiry tail — never the hand-unmute one, which would
       *  dismiss an open quiet-hours window */
      onGlobalExpire: () => void;
    },
  ) {}

  start(): void {
    this.fireDue();
    this.rearm();
  }

  rearm(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    const globalUntil = this.opts.globalMuted() ? this.opts.globalMutedUntil() : 0;
    const next = nextMuteExpiry(this.opts.muted(), this.opts.mutedUntil(), Date.now(), globalUntil);
    if (next === null) return;
    const delay = Math.max(0, next - Date.now()) + EXPIRY_SLACK_MS;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.fireDue();
      this.rearm();
    }, delay);
  }

  private fireDue(): void {
    const now = Date.now();
    const due = dueUnmutes(this.opts.muted(), this.opts.mutedUntil(), now);
    if (due.length > 0) this.opts.onExpire(due);
    if (globalMuteDue(this.opts.globalMuted(), this.opts.globalMutedUntil(), now)) {
      this.opts.onGlobalExpire();
    }
  }

  dispose(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }
}
