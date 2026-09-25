import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { app, Notification } from 'electron';
import type { RendererToMain } from '../shared/ipc';
import { SERVICES, serviceById } from '../shared/services';
import { activateService, openActivityEntry } from './activate';
import type { AppContext } from './ipc-handlers';
import { splitBannerTitle } from './lib/banner-title';
import { redactBanner } from './lib/lock-rules';
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
export const ICON_DIR = app.isPackaged
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
    // Discord packs "Author (#channel, Server)" into one title, and its author
    // half is not always a name — the row leads with the channel instead
    const { conversation, author } = splitBannerTitle(serviceId, title);
    const entryId = this.ctx.activity.append({
      serviceId,
      title,
      conversation,
      author,
      href,
      clickId,
      synthetic,
      silenced,
      at: Date.now(),
    });
    if (silenced) return;
    const icon = this.icons.get(serviceId);
    // the log above keeps the real title: it is in-memory and only a banner
    // click reads it back, so the entry is correct the moment the lock lifts
    const shown = this.ctx.lock.locked
      ? redactBanner(serviceById(serviceId).name)
      : { title, body };
    const notification = new Notification({
      title: notificationTitle(shown.title, serviceById(serviceId).name),
      body: shown.body,
      ...soundOptions({ enabled: s.notificationSound, synthetic }),
      ...(icon ? { icon } : {}),
    });
    notification.on('failed', (_e, err) =>
      this.ctx.diag.note('notifications', `${serviceId}: ${err}`, serviceId),
    );
    notification.on('click', () => {
      this.ctx.win.show();
      // a banner click must not be a way past the lock screen: park what the
      // user reached for and replay it after the unlock, re-validated then
      if (this.ctx.lock.locked) {
        this.ctx.lock.setPending({ serviceId, entryId });
        return;
      }
      // a Notification Center banner outlives ACTIVITY_CAP newer ones only
      // rarely; with its entry rotated out there is nothing safe left to open
      const entry = this.ctx.activity.get(entryId);
      if (entry) openActivityEntry(this.ctx, entry);
      else activateService(this.ctx, serviceId);
    });
    this.ctx.noteBannerFired(serviceId);
    notification.show();
  }
}
