import type { QuietHoursSchedule } from '../shared/types';
import { nextBoundary, quietNow as quietNowAt } from './lib/quiet-hours-rules';

/** Fire just past the boundary, never marginally before it. */
const BOUNDARY_SLACK_MS = 250;

/** One timer, re-armed on every fire and on schedule edits. A fire that
 *  arrives late (sleep, clock jump) self-corrects: everything is recomputed
 *  from the wall clock, engagement is never stored. */
export class QuietHoursController {
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private opts: {
      schedule: () => QuietHoursSchedule;
      override: () => number | null;
      onBoundary: () => void;
    },
  ) {}

  quietNow(): boolean {
    return quietNowAt(new Date(), this.opts.schedule(), this.opts.override());
  }

  start(): void {
    this.rearm();
  }

  rearm(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    const boundary = nextBoundary(new Date(), this.opts.schedule());
    if (!boundary) return;
    const delay = Math.max(0, boundary.getTime() - Date.now()) + BOUNDARY_SLACK_MS;
    this.timer = setTimeout(() => {
      this.opts.onBoundary();
      this.rearm();
    }, delay);
  }

  dispose(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }
}
