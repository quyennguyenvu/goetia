import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { app, Notification } from 'electron';
import type { RendererToMain } from '../shared/ipc';
import { SERVICES, serviceById } from '../shared/services';
import { performBannerAction } from './activate';
import type { AppContext } from './ipc-handlers';
import { resolveBannerClick } from './lib/notification-click';
import { resolveIcons } from './lib/notification-icons';
import {
  notificationTitle,
  sanitizeBanner,
  shouldNotify,
  soundOptions,
} from './lib/notification-rules';
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
    title: rawTitle,
    body: rawBody,
    synthetic,
    clickId,
    href,
  }: RendererToMain['notification:fired']): void {
    // the payload crossed IPC from an unisolated page: type and size are
    // attacker-controlled until re-checked here
    const { title, body } = sanitizeBanner(rawTitle, rawBody);
    const s = this.ctx.settings.get();
    const silenced = !shouldNotify({
      serviceMuted: s.muted[serviceId],
      globalMuted: s.globalMuted,
      quietNow: this.ctx.quietNow(),
    });
    // the throttle bounds the log too: a spammy page during quiet hours
    // must not flood the recents list any more than it may flood banners
    if (!this.throttle.allow(serviceId, Date.now())) return;
    this.ctx.activity.append({ serviceId, title, href, synthetic, silenced, at: Date.now() });
    if (silenced) return;
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
      performBannerAction(this.ctx, serviceId, action);
    });
    this.ctx.noteBannerFired(serviceId);
    notification.show();
  }
}
