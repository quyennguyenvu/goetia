import { Notification } from 'electron';
import { serviceById } from '../shared/services';
import type { ServiceId } from '../shared/types';
import type { AppContext } from './ipc-handlers';
import { shouldNotify } from './lib/notification-rules';

export class NotificationRouter {
  constructor(private ctx: AppContext) {}

  handle(serviceId: ServiceId, title: string, body: string): void {
    const s = this.ctx.settings.get();
    if (!shouldNotify({ serviceMuted: s.muted[serviceId], globalMuted: s.globalMuted })) return;
    const n = new Notification({ title: `${title} — ${serviceById(serviceId).name}`, body });
    n.on('click', () => {
      this.ctx.win.show();
      this.ctx.state.activeId = serviceId;
      this.ctx.state.setRuntime(serviceId, { hibernated: false });
      this.ctx.noteActivated(serviceId);
      this.ctx.views.activate(serviceId);
    });
    n.show();
  }
}
