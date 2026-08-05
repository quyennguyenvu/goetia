import type { ServiceId } from '../shared/types';
import type { AppContext } from './ipc-handlers';
import { shouldHibernate } from './lib/hibernation-rules';

export class HibernationController {
  private lastActiveAt = new Map<ServiceId, number>();

  constructor(private ctx: AppContext) {}

  noteActivated(id: ServiceId): void {
    this.lastActiveAt.set(id, Date.now());
  }

  start(): void {
    setInterval(() => this.sweep(), 60_000);
  }

  private sweep(): void {
    const s = this.ctx.settings.get();
    const now = Date.now();
    for (const id of s.order) {
      if (s.disabled[id]) continue;
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
        this.ctx.state.setRuntime(id, { hibernated: true });
      }
    }
  }
}
