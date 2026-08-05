import { Notification } from 'electron';
import { serviceById } from '../shared/services';
import type { ServiceId } from '../shared/types';
import { activateService } from './activate';
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
      activateService(this.ctx, serviceId);
    });
    n.show();
  }
}
