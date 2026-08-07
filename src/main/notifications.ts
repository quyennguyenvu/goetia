import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { app, Notification } from 'electron';
import { SERVICES, serviceById } from '../shared/services';
import type { ServiceId } from '../shared/types';
import { activateService } from './activate';
import type { AppContext } from './ipc-handlers';
import { resolveIcons } from './lib/notification-icons';
import { notificationTitle, shouldNotify } from './lib/notification-rules';
import { NotificationThrottle } from './lib/notification-throttle';

// Packaged, extraResources drops these beside the asar rather than inside it,
// so the path is one the OS itself can open. Dev mirrors tray.ts.
const ICON_DIR = app.isPackaged
  ? join(process.resourcesPath, 'notification-icons')
  : join(__dirname, '../../resources/notification-icons');

export class NotificationRouter {
  // Resolved once: no stat call, no decode and no retained bitmap per banner.
  private icons = resolveIcons(
    ICON_DIR,
    SERVICES.map((s) => s.id),
    process.platform,
    existsSync,
  );
  private throttle = new NotificationThrottle();

  constructor(private ctx: AppContext) {}

  handle(serviceId: ServiceId, title: string, body: string): void {
    const s = this.ctx.settings.get();
    if (!shouldNotify({ serviceMuted: s.muted[serviceId], globalMuted: s.globalMuted })) return;
    if (!this.throttle.allow(serviceId, Date.now())) return;
    const icon = this.icons.get(serviceId);
    const n = new Notification({
      title: notificationTitle(title, serviceById(serviceId).name),
      body,
      sound: 'default', // macOS plays no sound unless one is requested
      ...(icon ? { icon } : {}),
    });
    n.on('failed', (_e, err) => console.error(`[notifications] ${serviceId}: ${err}`));
    n.on('click', () => {
      this.ctx.win.show();
      activateService(this.ctx, serviceId);
    });
    n.show();
  }
}
