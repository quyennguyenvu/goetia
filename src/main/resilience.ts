import type { ServiceId } from '../shared/types';
import type { AppContext } from './ipc-handlers';
import { backoffDelay } from './lib/backoff';

const MAX_AUTO_RELOADS = 5;
/** A page must stay up this long after loading before we forget its crash
 *  count — otherwise a load→crash→reload loop resets the cap every cycle. */
const DWELL_MS = 30_000;

export class ResilienceManager {
  private attempts = new Map<ServiceId, number>();
  private dwellTimers = new Map<ServiceId, ReturnType<typeof setTimeout>>();
  /** every pending backoff reload, so quit can cancel them; a set rather than
   *  a per-service slot so two crashes still schedule the two reloads they
   *  always did */
  private reloadTimers = new Set<ReturnType<typeof setTimeout>>();

  constructor(private ctx: AppContext) {}

  /** Bounded timers: this is the one controller that used to leave both its
   *  reload and dwell timers running past quit. */
  dispose(): void {
    for (const t of this.reloadTimers) clearTimeout(t);
    this.reloadTimers.clear();
    for (const t of this.dwellTimers.values()) clearTimeout(t);
    this.dwellTimers.clear();
    this.attempts.clear();
  }

  private clearDwell(id: ServiceId): void {
    const t = this.dwellTimers.get(id);
    if (t !== undefined) {
      clearTimeout(t);
      this.dwellTimers.delete(id);
    }
  }

  onCrashed(id: ServiceId): void {
    this.clearDwell(id); // a crash within the dwell must keep the count
    const attempt = this.attempts.get(id) ?? 0;
    this.ctx.state.setRuntime(id, { crashed: true });
    if (attempt >= MAX_AUTO_RELOADS) return; // give up; manual Retry only
    this.attempts.set(id, attempt + 1);
    const timer = setTimeout(() => {
      this.reloadTimers.delete(timer);
      this.ctx.views.reload(id);
    }, backoffDelay(attempt));
    this.reloadTimers.add(timer);
  }

  onLoadFailed(id: ServiceId): void {
    this.clearDwell(id);
    this.ctx.state.setRuntime(id, { crashed: true, loading: false });
    // Chromium paints its own error page inside the view; hide it so the
    // shell's Retry placeholder is visible instead.
    if (this.ctx.state.activeId === id) this.ctx.views.hideActive();
  }

  noteRecovered(id: ServiceId): void {
    if (this.ctx.state.runtime(id).crashed) {
      this.ctx.state.setRuntime(id, { crashed: false });
    }
    // forget the crash count only after the page proves it can stay up
    this.clearDwell(id);
    this.dwellTimers.set(
      id,
      setTimeout(() => {
        this.attempts.delete(id);
        this.dwellTimers.delete(id);
      }, DWELL_MS),
    );
  }
}
