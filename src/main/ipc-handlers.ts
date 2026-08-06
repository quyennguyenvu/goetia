import { app, type BrowserWindow, ipcMain } from 'electron';
import type { RendererToMain } from '../shared/ipc';
import { activateService } from './activate';
import { applyOverlay } from './badges';
import { buildAppMenu } from './menu';
import type { NotificationRouter } from './notifications';
import type { SettingsStore } from './settings';
import type { MainState } from './state';
import type { ServiceViewManager } from './views';

export interface AppContext {
  win: BrowserWindow;
  views: ServiceViewManager;
  state: MainState;
  settings: SettingsStore;
  broadcast(): void;
  /** resets the hibernation idle clock; late-bound in index.ts */
  noteActivated(id: import('../shared/types').ServiceId): void;
}

function on<C extends keyof RendererToMain>(
  channel: C,
  fn: (payload: RendererToMain[C]) => void,
): void {
  ipcMain.on(channel, (_e, payload) => fn(payload as RendererToMain[C]));
}

export function registerIpcHandlers(ctx: AppContext, router: NotificationRouter): void {
  on('service:activate', ({ serviceId }) => activateService(ctx, serviceId));
  on('service:reload', ({ serviceId }) => ctx.views.refresh(serviceId));
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
          ctx.state.setRuntime(id, {
            unread: { direct: 0, indirect: 0 },
            crashed: false,
            stale: false,
            hibernated: false,
            loading: false,
          });
        }
        if (!after.disabled[id] && before.disabled[id] && after.neverHibernate[id]) {
          ctx.views.ensure(id);
        }
      }
      if (after.disabled[ctx.state.activeId]) {
        const next = after.order.find((id) => !after.disabled[id]) ?? after.order[0];
        ctx.state.activeId = next;
        ctx.noteActivated(next);
        ctx.views.activate(next);
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
}
