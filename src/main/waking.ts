import { serviceById } from '../shared/services';
import type { ServiceId } from '../shared/types';
import { endsWake, WAKE_TIMEOUT_MS, type WakeEnd } from './lib/waking-rules';
import type { MainState } from './state';

/** Per-service "waking" cover: begins on every load start, ends on
 *  recipe readiness, load completion (services without ready()), crash,
 *  destruction, or the reveal timeout — whichever comes first. */
export class WakingTracker {
  private timers = new Map<ServiceId, ReturnType<typeof setTimeout>>();

  constructor(
    private state: MainState,
    private timeoutMs = WAKE_TIMEOUT_MS,
  ) {}

  begin(id: ServiceId): void {
    clearTimeout(this.timers.get(id));
    this.timers.set(
      id,
      setTimeout(() => this.end(id, 'timeout'), this.timeoutMs),
    );
    if (!this.state.runtime(id).waking) {
      this.state.setRuntime(id, { waking: true });
    }
  }

  end(id: ServiceId, event: WakeEnd): void {
    if (!endsWake(event, serviceById(id))) return;
    const timer = this.timers.get(id);
    if (timer !== undefined) {
      clearTimeout(timer);
      this.timers.delete(id);
    }
    if (this.state.runtime(id).waking) {
      this.state.setRuntime(id, { waking: false });
    }
  }
}
