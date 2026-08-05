import type { ServiceId } from '../shared/types';
import type { AppContext } from './ipc-handlers';
import { backoffDelay } from './lib/backoff';

const MAX_AUTO_RELOADS = 5;

export class ResilienceManager {
  private attempts = new Map<ServiceId, number>();

  constructor(private ctx: AppContext) {}

  onCrashed(id: ServiceId): void {
    const attempt = this.attempts.get(id) ?? 0;
    this.ctx.state.setRuntime(id, { crashed: true });
    if (attempt >= MAX_AUTO_RELOADS) return; // give up; manual Retry only
    this.attempts.set(id, attempt + 1);
    setTimeout(() => this.ctx.views.reload(id), backoffDelay(attempt));
  }

  onLoadFailed(id: ServiceId): void {
    this.ctx.state.setRuntime(id, { crashed: true, loading: false });
    // Chromium paints its own error page inside the view; hide it so the
    // shell's Retry placeholder is visible instead.
    if (this.ctx.state.activeId === id) this.ctx.views.hideActive();
  }

  noteRecovered(id: ServiceId): void {
    this.attempts.delete(id);
    if (this.ctx.state.runtime(id).crashed) this.ctx.state.setRuntime(id, { crashed: false });
  }
}
