import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { app, Notification } from 'electron';
import type { RendererToMain } from '../shared/ipc';
import { SERVICES, serviceById } from '../shared/services';
import { activateService } from './activate';
import type { AppContext } from './ipc-handlers';
import { resolveBannerClick } from './lib/notification-click';
import { resolveIcons } from './lib/notification-icons';
import { notificationTitle, shouldNotify, soundOptions } from './lib/notification-rules';
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

  handle({
    serviceId,
    title,
    body,
    synthetic,
    clickId,
    href,
  }: RendererToMain['notification:fired']): void {
    const s = this.ctx.settings.get();
    if (
      !shouldNotify({
        serviceMuted: s.muted[serviceId],
        globalMuted: s.globalMuted,
        quietNow: this.ctx.quietNow(),
      })
    ) {
      return;
    }
    if (!this.throttle.allow(serviceId, Date.now())) return;
    const icon = this.icons.get(serviceId);
    const notification = new Notification({
      title: notificationTitle(title, serviceById(serviceId).name),
      body,
      ...soundOptions({ enabled: s.notificationSound, synthetic }),
      ...(icon ? { icon } : {}),
    });
    notification.on('failed', (_e, err) => console.error(`[notifications] ${serviceId}: ${err}`));
    notification.on('click', () => {
      this.ctx.win.show();
      const meta = serviceById(serviceId);
      const action = resolveBannerClick({
        // a stale banner can outlive its service being banished on Home
        disabled: this.ctx.settings.get().disabled[serviceId],
        hasView: this.ctx.views.has(serviceId),
        clickId,
        href,
        serviceUrl: meta.url,
        chatPaths: meta.chatPaths,
      });
      if (action.kind === 'show-only') return;
      activateService(this.ctx, serviceId);
      if (action.kind === 'navigate') this.ctx.views.openConversation(serviceId, action.url);
      if (action.kind === 'open-in-page') {
        this.ctx.views.sendOpenConversation(serviceId, action.href, action.url);
      }
      if (action.kind === 'replay') this.ctx.views.sendReplayClick(serviceId, action.clickId);
    });
    this.ctx.noteBannerFired(serviceId);
    notification.show();
  }
}
