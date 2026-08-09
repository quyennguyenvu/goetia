import { app, type BrowserWindow, ipcMain, shell } from 'electron';
import type { RendererToMain } from '../shared/ipc';
import type { ServiceId } from '../shared/types';
import { activateService } from './activate';
import { applyOverlay } from './badges';
import { resolveActivation } from './lib/activation-rules';
import { isSafeExternalUrl } from './lib/external-url';
import { ipcSenderAllowed } from './lib/ipc-sender-policy';
import { anyOverlayOpen } from './lib/overlay-rules';
import { releaseUrl } from './lib/update-check';
import { buildAppMenu } from './menu';
import type { NotificationRouter } from './notifications';
import type { SettingsStore } from './settings';
import type { MainState } from './state';
import type { UpdateChecker } from './updates';
import type { ServiceViewManager } from './views';
import type { WakingTracker } from './waking';

export interface AppContext {
  win: BrowserWindow;
  views: ServiceViewManager;
  state: MainState;
  settings: SettingsStore;
  waking: WakingTracker;
  updates: UpdateChecker;
  broadcast(): void;
  /** resets the hibernation idle clock; late-bound in index.ts */
  noteActivated(id: import('../shared/types').ServiceId): void;
}

function register(ctx: AppContext) {
  return <C extends keyof RendererToMain>(
    channel: C,
    fn: (payload: RendererToMain[C]) => void,
  ): void => {
    ipcMain.on(channel, (e, payload) => {
      const fromShell = e.sender.id === ctx.win.webContents.id;
      const senderServiceId = ctx.views.serviceIdForWebContentsId(e.sender.id);
      const p = payload as { serviceId?: ServiceId };
      if (
        !ipcSenderAllowed({
          channel,
          fromShell,
          senderServiceId,
          payloadServiceId: p?.serviceId,
        })
      ) {
        return; // drop spoofed / cross-service messages
      }
      fn(payload as RendererToMain[C]);
    });
  };
}

export function registerIpcHandlers(ctx: AppContext, router: NotificationRouter): void {
  const on = register(ctx);
  on('service:activate', ({ serviceId }) => activateService(ctx, serviceId));
  on('service:reload', ({ serviceId }) => ctx.views.refresh(serviceId));
  on('service:ready', ({ serviceId }) => ctx.waking.end(serviceId, 'recipe-ready'));
  on('service:setMuted', ({ serviceId, muted }) => {
    const s = ctx.settings.get();
    ctx.settings.update({ muted: { ...s.muted, [serviceId]: muted } });
    ctx.broadcast();
  });
  on('service:reorder', ({ orderedIds }) => {
    ctx.settings.update({ order: orderedIds });
    buildAppMenu(ctx); // keep Cmd/Ctrl+1..9 aligned with the new order
    ctx.broadcast();
  });
  on('global:setMuted', ({ muted }) => {
    ctx.settings.update({ globalMuted: muted });
    ctx.broadcast();
  });
  on('switcher:setOpen', ({ open }) => {
    ctx.state.switcherOpen = open;
    if (open) ctx.views.hideActive();
    else ctx.views.showActive();
    ctx.state.touch();
  });
  on('settings:setOpen', ({ open }) => {
    ctx.state.settingsOpen = open;
    if (open) ctx.views.hideActive();
    else ctx.views.showActive();
    ctx.state.touch();
  });
  on('home:setOpen', ({ open }) => {
    ctx.state.homeOpen = open;
    if (open) ctx.views.hideActive();
    else ctx.views.showActive();
    ctx.state.touch();
    // so Escape and the accelerators reach the shell, not the buried view
    if (open) ctx.win.webContents.focus();
  });
  on('settings:update', (patch) => {
    const before = ctx.settings.get();
    const after = ctx.settings.update(patch);
    if ('launchAtLogin' in patch) {
      app.setLoginItemSettings({ openAtLogin: patch.launchAtLogin === true });
    }
    if ('railPosition' in patch) ctx.views.layout();
    if (patch.disabled) {
      for (const id of after.order) {
        if (after.disabled[id] && ctx.views.has(id)) {
          ctx.views.destroy(id);
          ctx.waking.end(id, 'destroyed');
          ctx.state.setRuntime(id, {
            unread: { direct: 0, indirect: 0 },
            crashed: false,
            stale: false,
            hibernated: false,
            loading: false,
            waking: false,
          });
        }
        if (!after.disabled[id] && before.disabled[id] && after.neverHibernate[id]) {
          ctx.views.ensure(id);
        }
      }
      const next = resolveActivation({
        order: after.order,
        disabled: after.disabled,
        activeId: ctx.state.activeId,
        hasActiveView: ctx.views.has(ctx.state.activeId),
      });
      if (next) {
        ctx.state.activeId = next;
        ctx.noteActivated(next);
        // Resolve now, present later. Showing a view here would cover the
        // surface the user is standing on — this is the settings-modal bug.
        ctx.views.activate(next, { show: !anyOverlayOpen(ctx.state) });
      }
      buildAppMenu(ctx);
    }
    if (patch.neverHibernate) {
      for (const id of after.order) {
        if (after.neverHibernate[id] && !after.disabled[id]) {
          ctx.views.ensure(id);
          if (ctx.state.runtime(id).hibernated) ctx.state.setRuntime(id, { hibernated: false });
        }
      }
    }
    ctx.broadcast();
  });
  on('unread:update', ({ serviceId, direct, indirect }) =>
    ctx.state.setRuntime(serviceId, { unread: { direct, indirect }, stale: false }),
  );
  on('unread:stale', ({ serviceId }) => ctx.state.setRuntime(serviceId, { stale: true }));
  on('badge:overlay', ({ dataUrl, count }) => applyOverlay(ctx.win, dataUrl, count));
  on('notification:fired', ({ serviceId, title, body }) => router.handle(serviceId, title, body));
  on('service:keepalive-click', ({ serviceId, x, y }) => ctx.views.trustedClick(serviceId, x, y));
  on('updates:check', () => void ctx.updates.check('manual'));
  on('updates:openDownload', () => {
    // the URL is built here from a version main validated — the renderer
    // never supplies one
    const version = ctx.state.update.latest;
    if (!version) return;
    const url = releaseUrl(version);
    if (isSafeExternalUrl(url)) shell.openExternal(url);
  });
}
