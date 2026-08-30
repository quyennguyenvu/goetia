import { app, type BrowserWindow, type IpcMainInvokeEvent, ipcMain, Menu, shell } from 'electron';
import type { InvokePayload, RendererInvoke, RendererToMain } from '../shared/ipc';
import { serviceById } from '../shared/services';
import type { ServiceId, Settings } from '../shared/types';
import {
  activateService,
  performBannerAction,
  rememberSurface,
  setHomeOpen,
  setOverlayOpen,
} from './activate';
import { applyOverlay } from './badges';
import { resolveActivation } from './lib/activation-rules';
import type { ActivityLog } from './lib/activity-log';
import { isSafeExternalUrl } from './lib/external-url';
import { ipcSenderAllowed } from './lib/ipc-sender-policy';
import { resolveBannerClick } from './lib/notification-click';
import { anyOverlayOpen } from './lib/overlay-rules';
import { releaseUrl } from './lib/update-check';
import { buildAppMenu } from './menu';
import type { NotificationRouter } from './notifications';
import type { PasskeyAuthenticator } from './passkeys/authenticator';
import type { PasskeyStore } from './passkeys/store';
import type { PinStore } from './pins';
import { purgeAll, purgeLogin } from './purge';
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
  /** banner history behind the switcher's Recent section; in-memory only */
  activity: ActivityLog;
  /** the pinboard; persisted, see pins.ts */
  pins: PinStore;
  /** the software authenticator behind every service view's WebAuthn shim */
  passkeys: PasskeyAuthenticator;
  /** its store — Settings → Passkeys lists and forgets through it */
  passkeyStore: PasskeyStore;
  broadcast(): void;
  /** resets the hibernation idle clock; late-bound in index.ts */
  noteActivated(id: import('../shared/types').ServiceId): void;
  /** ends a Light Sleep peek on the service's first report; late-bound in index.ts */
  noteUnreadReport(id: import('../shared/types').ServiceId): void;
  /** stamps banner-grace so a peek view survives long enough to click;
   *  late-bound in index.ts */
  noteBannerFired(id: import('../shared/types').ServiceId): void;
  /** disable services and run the full disabled side-effects tail; late-bound
   *  in index.ts so hibernation.ts stays free of electron */
  banishServices(ids: ServiceId[]): void;
  /** the one way to move global mute — bell, tray, menu and accelerator all
   *  land here so the pages, both menus' checkmarks and the shell agree;
   *  late-bound in index.ts */
  setGlobalMuted(muted: boolean): void;
  /** quiet-hours engagement right now, override applied; late-bound in index.ts */
  quietNow(): boolean;
  /** running on battery — Light Sleep's opt-in saver peeks less there;
   *  late-bound in index.ts so hibernation.ts stays free of electron */
  onBattery(): boolean;
  /** re-arm the boundary timer and re-apply mute after a schedule edit;
   *  late-bound in index.ts */
  quietScheduleChanged(): void;
  /** re-register the summon hotkey after a setting edit; late-bound in index.ts */
  summonHotkeyChanged(): void;
}

/** The one sender gate, shared by both wrappers below so neither transport can
 *  drift from the other. */
function senderAllowed(
  ctx: AppContext,
  channel: keyof RendererToMain | keyof RendererInvoke,
  senderId: number,
  payloadServiceId?: ServiceId,
): boolean {
  return ipcSenderAllowed({
    channel,
    fromShell: senderId === ctx.win.webContents.id,
    senderServiceId: ctx.views.serviceIdForWebContentsId(senderId),
    payloadServiceId,
  });
}

function register(ctx: AppContext) {
  return <C extends keyof RendererToMain>(
    channel: C,
    fn: (payload: RendererToMain[C]) => void,
  ): void => {
    ipcMain.on(channel, (e, payload) => {
      const p = payload as { serviceId?: ServiceId };
      if (!senderAllowed(ctx, channel, e.sender.id, p?.serviceId)) {
        return; // drop spoofed / cross-service messages
      }
      fn(payload as RendererToMain[C]);
    });
  };
}

/** invoke twin of register(): same gate, so a round-trip channel cannot be
 *  added without one. `blocked` is what a rejected sender receives — always
 *  synchronous, so a refusal never awaits. A service channel's payload
 *  carries `serviceId`, validated against the sending view like a send. */
function registerInvoke(ctx: AppContext) {
  return <C extends keyof RendererInvoke>(
    channel: C,
    blocked: RendererInvoke[C]['result'],
    fn: (
      payload: InvokePayload<C>,
      e: IpcMainInvokeEvent,
    ) => RendererInvoke[C]['result'] | Promise<RendererInvoke[C]['result']>,
  ): void => {
    ipcMain.handle(channel, (e, payload) => {
      const p = payload as { serviceId?: ServiceId } | undefined;
      return senderAllowed(ctx, channel, e.sender.id, p?.serviceId)
        ? fn(payload as InvokePayload<C>, e)
        : blocked;
    });
  };
}

/** The https origin of the frame that invoked, or null: WebAuthn binds to
 *  the page that asked, and a subframe, a blank page or a stale frame gets
 *  nothing. Never read from the payload. */
function invokeOrigin(e: IpcMainInvokeEvent): string | null {
  const frame = e.senderFrame;
  if (!frame || frame !== e.sender.mainFrame) return null;
  try {
    const url = new URL(frame.url);
    return url.protocol === 'https:' ? url.origin : null;
  } catch {
    return null;
  }
}

/** Side-effects tail of a disabled-set change — shared by the settings:update
 *  handler and auto-banish (via ctx.banishServices), so the two cannot drift. */
export function applyDisabledChange(ctx: AppContext, before: Settings): void {
  const after = ctx.settings.get();
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
  // also runs when next is null: banishing the last service leaves
  // activeId pointing at a disabled one, which is exactly the unrestorable
  // record that should reopen on Home
  rememberSurface(ctx);
  buildAppMenu(ctx);
}

function setServiceMuted(ctx: AppContext, serviceId: ServiceId, muted: boolean): void {
  const s = ctx.settings.get();
  ctx.settings.update({ muted: { ...s.muted, [serviceId]: muted } });
  ctx.views.applyAudioMute(serviceId);
  ctx.broadcast();
}

export function registerIpcHandlers(ctx: AppContext, router: NotificationRouter): void {
  const on = register(ctx);
  const onInvoke = registerInvoke(ctx);
  on('service:activate', ({ serviceId }) => activateService(ctx, serviceId));
  on('service:reload', ({ serviceId }) => ctx.views.refresh(serviceId));
  on('service:ready', ({ serviceId }) => ctx.waking.end(serviceId, 'recipe-ready'));
  on('service:setMuted', ({ serviceId, muted }) => setServiceMuted(ctx, serviceId, muted));
  on('service:tileMenu', ({ serviceId }) => {
    const muted = ctx.settings.get().muted[serviceId];
    const name = serviceById(serviceId).name;
    Menu.buildFromTemplate([
      {
        label: muted ? `Unmute ${name}` : `Mute ${name}`,
        click: () => setServiceMuted(ctx, serviceId, !muted),
      },
      { type: 'separator' },
      // quick and recoverable (login kept, re-summon on Home) — no confirm
      { label: `Banish ${name}`, click: () => ctx.banishServices([serviceId]) },
    ]).popup({ window: ctx.win });
  });
  on('service:purgeLogin', ({ serviceId }) => void purgeLogin(ctx, serviceId));
  on('service:reorder', ({ orderedIds }) => {
    ctx.settings.update({ order: orderedIds });
    buildAppMenu(ctx); // keep Cmd/Ctrl+1..9 aligned with the new order
    ctx.broadcast();
  });
  on('global:setMuted', ({ muted }) => ctx.setGlobalMuted(muted));
  on('switcher:setOpen', ({ open }) => setOverlayOpen(ctx, 'switcherOpen', open));
  on('settings:setOpen', ({ open }) => setOverlayOpen(ctx, 'settingsOpen', open));
  on('home:setOpen', ({ open }) => {
    setHomeOpen(ctx, open);
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
    if ('quietHours' in patch) ctx.quietScheduleChanged();
    if ('summonHotkey' in patch) ctx.summonHotkeyChanged();
    if (patch.disabled) applyDisabledChange(ctx, before);
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
  on('unread:update', ({ serviceId, direct, indirect }) => {
    ctx.state.setRuntime(serviceId, { unread: { direct, indirect }, stale: false });
    // setRuntime no-ops on an unchanged count, so the peek signal lives here
    ctx.noteUnreadReport(serviceId);
  });
  on('unread:stale', ({ serviceId }) => {
    ctx.state.setRuntime(serviceId, { stale: true });
    ctx.noteUnreadReport(serviceId);
  });
  on('badge:overlay', ({ dataUrl, count }) => applyOverlay(ctx.win, dataUrl, count));
  on('notification:fired', (n) => router.handle(n));
  onInvoke('activity:recent', [], () => ctx.activity.recent());
  onInvoke('services:purgeAll', { purged: 0 }, () => purgeAll(ctx));
  onInvoke('webauthn:create', { ok: false, error: 'NotAllowedError' }, (payload, e) => {
    const origin = invokeOrigin(e);
    if (!origin) return { ok: false, error: 'SecurityError' };
    return ctx.passkeys.create({
      serviceId: payload.serviceId,
      origin,
      options: payload.options,
      viewKey: e.sender.id,
    });
  });
  onInvoke('webauthn:get', { ok: false, error: 'NotAllowedError' }, (payload, e) => {
    const origin = invokeOrigin(e);
    if (!origin) return { ok: false, error: 'SecurityError' };
    return ctx.passkeys.get({
      serviceId: payload.serviceId,
      origin,
      options: payload.options,
      viewKey: e.sender.id,
    });
  });
  onInvoke('passkeys:list', [], () => ctx.passkeyStore.views());
  onInvoke('passkeys:forget', [], ({ id }) => {
    ctx.passkeyStore.forget(id);
    return ctx.passkeyStore.views();
  });
  onInvoke('passkeys:restore', [], ({ id }) => {
    ctx.passkeyStore.restore(id);
    return ctx.passkeyStore.views();
  });
  on('activity:open', ({ entryId }) => {
    const entry = ctx.activity.get(entryId);
    if (!entry) return; // rotated out of the ring since the switcher fetched
    const meta = serviceById(entry.serviceId);
    const action = resolveBannerClick({
      disabled: ctx.settings.get().disabled[entry.serviceId],
      hasView: ctx.views.has(entry.serviceId),
      href: entry.synthetic ? entry.href : undefined,
      serviceUrl: meta.url,
      chatPaths: meta.chatPaths,
    });
    performBannerAction(ctx, entry.serviceId, action);
  });
  // every mutation broadcasts only when the store actually changed — a stale
  // renderer's no-op must not cost a fan-out
  on('pins:reorder', ({ ids }) => {
    if (ctx.pins.reorder(ids)) ctx.broadcast();
  });
  on('pins:unpin', ({ id }) => {
    if (ctx.pins.unpin(id)) ctx.broadcast();
  });
  on('pins:restore', ({ id }) => {
    if (ctx.pins.restore(id)) ctx.broadcast();
  });
  on('pins:setNote', ({ id, note }) => {
    if (ctx.pins.setNote(id, note)) ctx.broadcast();
  });
  on('pins:open', ({ id }) => {
    const pin = ctx.pins.get(id);
    if (!pin) return; // removed since Home rendered the row
    const meta = serviceById(pin.serviceId);
    // the recents path, verbatim: the href is validated now, not at pin time
    const action = resolveBannerClick({
      disabled: ctx.settings.get().disabled[pin.serviceId],
      hasView: ctx.views.has(pin.serviceId),
      href: pin.href,
      serviceUrl: meta.url,
      chatPaths: meta.chatPaths,
    });
    performBannerAction(ctx, pin.serviceId, action, pin.conversation || undefined);
  });
  on('service:trusted-click', ({ serviceId, x, y }) => ctx.views.trustedClick(serviceId, x, y));
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
