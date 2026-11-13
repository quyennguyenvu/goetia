import type { ServiceId } from '../shared/types';
import { presentSurface } from './activate';
import type { AppContext } from './ipc-handlers';
import { backoffDelay } from './lib/backoff';

const MAX_AUTO_RELOADS = 5;
/** how often a pending reload re-checks for the network while offline */
const OFFLINE_POLL_MS = 5_000;
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
  /** services whose last main-frame load failed: Electron then fires
   *  did-finish-load for its own blank error document, which is not a recovery */
  private failed = new Set<ServiceId>();

  constructor(private ctx: AppContext) {}

  /** Bounded timers: this is the one controller that used to leave both its
   *  reload and dwell timers running past quit. */
  dispose(): void {
    for (const t of this.reloadTimers) clearTimeout(t);
    this.reloadTimers.clear();
    for (const t of this.dwellTimers.values()) clearTimeout(t);
    this.dwellTimers.clear();
    this.attempts.clear();
    this.failed.clear();
  }

  private clearDwell(id: ServiceId): void {
    const t = this.dwellTimers.get(id);
    if (t !== undefined) {
      clearTimeout(t);
      this.dwellTimers.delete(id);
    }
  }

  onCrashed(id: ServiceId, detail?: string): void {
    this.fail(id, 'crashed', detail);
  }

  /** A load that failed gets the crash's backoff reloads: launch-at-login
   *  starts the app before the network is up, and nothing else would ever
   *  load the page again (2026-11-13). */
  onLoadFailed(id: ServiceId, detail?: string): void {
    this.failed.add(id);
    this.fail(id, 'load failed', detail);
  }

  /** A new main-frame load started, so its finish is a real one again. */
  noteNavigated(id: ServiceId): void {
    this.failed.delete(id);
  }

  private fail(id: ServiceId, what: string, detail?: string): void {
    this.clearDwell(id); // a failure within the dwell must keep the count
    const attempt = this.attempts.get(id) ?? 0;
    this.ctx.state.setRuntime(id, { crashed: true });
    // the dead or blank page comes down so the shell's Retry placeholder shows
    if (this.ctx.state.activeId === id) presentSurface(this.ctx);
    if (attempt >= MAX_AUTO_RELOADS) {
      this.ctx.diag.note('view', `${id} ${what} (cap reached; manual Retry)`, id);
      return; // give up; manual Retry only
    }
    this.attempts.set(id, attempt + 1);
    const delay = backoffDelay(attempt);
    const cause = detail ? `: ${detail}` : '';
    this.ctx.diag.note(
      'view',
      `${id} ${what}${cause} (attempt ${attempt + 1}/${MAX_AUTO_RELOADS}, reload in ${Math.round(delay / 1000)}s)`,
      id,
    );
    this.reloadIn(id, delay);
  }

  private reloadIn(id: ServiceId, delay: number): void {
    const timer = setTimeout(() => {
      this.reloadTimers.delete(timer);
      if (!this.ctx.views.has(id)) return; // hibernated, banished or purged meanwhile
      // offline, the reload would fail the same way: wait without spending an attempt
      if (this.ctx.online()) this.ctx.views.reload(id);
      else this.reloadIn(id, OFFLINE_POLL_MS);
    }, delay);
    this.reloadTimers.add(timer);
  }

  noteRecovered(id: ServiceId): void {
    if (this.failed.has(id)) return; // Electron's error page finished, not the service
    if (this.ctx.state.runtime(id).crashed) {
      this.ctx.state.setRuntime(id, { crashed: false });
      this.ctx.diag.note('view', `${id} recovered`, id);
      if (this.ctx.state.activeId === id) presentSurface(this.ctx);
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
