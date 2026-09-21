import { release } from 'node:os';
import {
  app,
  type BrowserWindow,
  dialog,
  type IpcMainInvokeEvent,
  ipcMain,
  Menu,
  shell,
} from 'electron';
import type { InvokePayload, RendererInvoke, RendererToMain } from '../shared/ipc';
import type { GuardedAction } from '../shared/lock';
import { muteExpiry } from '../shared/mute';
import { serviceById } from '../shared/services';
import type { ServiceId, Settings } from '../shared/types';
import {
  activateService,
  openActivityEntry,
  performBannerAction,
  rememberSurface,
  setHomeOpen,
  setOverlayOpen,
} from './activate';
import { applyOverlay } from './badges';
import { globalMuteMenuTemplate } from './global-mute-menu';
import type { IdentityShare } from './identity-share';
import { resolveActivation } from './lib/activation-rules';
import type { ActivityLog } from './lib/activity-log';
import { stampSummoned, summonedIds } from './lib/banish-rules';
import {
  type Diagnostics,
  recipeTransition,
  sanitizeDetail,
  serviceSnapshotLine,
  settingsSummary,
  withPage,
} from './lib/diagnostics';
import { isSafeExternalUrl } from './lib/external-url';
import { actionGuarded } from './lib/guard-policy';
import { channelAllowedWhileLocked, ipcSenderAllowed } from './lib/ipc-sender-policy';
import { resolveBannerClick } from './lib/notification-click';
import { anyOverlayOpen } from './lib/overlay-rules';
import { type TileMenuAction, tileMenuItems } from './lib/tile-menu';
import { releaseUrl } from './lib/update-check';
import type { LockController } from './lock';
import { buildAppMenu } from './menu';
import type { MuteTimerController } from './mute-timer';
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
  /** the app lock: whether Goetia is readable, and the credential behind it */
  lock: LockController;
  /** lends Messenger's Facebook session to another service's sign-in popup;
   *  see identity-share.ts */
  identityShare: IdentityShare;
  /** the evidence ring behind Settings → Diagnostics; see lib/diagnostics.ts */
  diag: Diagnostics;
  /** epoch ms of this launch — the report's uptime line */
  startedAt: number;
  /** flips a timed mute back when it expires; re-armed by setServiceMuted */
  muteTimer: MuteTimerController;
  broadcast(): void;
  /** resets the hibernation idle clock; late-bound in index.ts */
  noteActivated(id: import('../shared/types').ServiceId): void;
  /** ends a Light Sleep peek on the service's first report; late-bound in index.ts */
  noteUnreadReport(id: import('../shared/types').ServiceId): void;
  /** frees a Light Sleep peek when its view is destroyed externally (banish,
   *  purge); late-bound in index.ts */
  noteDestroyed(id: import('../shared/types').ServiceId): void;
  /** stamps banner-grace so a peek view survives long enough to click;
   *  late-bound in index.ts */
  noteBannerFired(id: import('../shared/types').ServiceId): void;
  /** disable services and run the full disabled side-effects tail; late-bound
   *  in index.ts so hibernation.ts stays free of electron */
  banishServices(ids: ServiceId[]): void;
  /** the one way to move global mute — bell, tray, menu and accelerator all
   *  land here so the pages, both menus' labels and the shell agree; `until`
   *  is a timed mute's expiry (0 = none) and any unmute zeroes it; late-bound
   *  in index.ts */
  setGlobalMuted(muted: boolean, until?: number): void;
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
  /** mirror the controller's lock state onto the shell surfaces and both
   *  menus — one writer, so the two can never disagree; late-bound in
   *  index.ts, which owns the menu and the tray */
  syncLocked(): void;
}

/** The one sender gate, shared by both wrappers below so neither transport can
 *  drift from the other. */
function senderAllowed(
  ctx: AppContext,
  channel: keyof RendererToMain | keyof RendererInvoke,
  senderId: number,
  payloadServiceId?: ServiceId,
): boolean {
  if (ctx.lock.locked && !channelAllowedWhileLocked(channel)) return false;
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
      // never let a page-shaped payload throw out of an ipcMain listener — an
      // uncaught exception here kills the whole main process
      try {
        // service preloads run main-frame only and the shell has no subframes,
        // so a message from any other frame is spoofed by construction
        if (e.senderFrame && e.senderFrame !== e.sender.mainFrame) return;
        const p = payload as { serviceId?: ServiceId };
        if (!senderAllowed(ctx, channel, e.sender.id, p?.serviceId)) {
          return; // drop spoofed / cross-service messages
        }
        fn(payload as RendererToMain[C]);
      } catch (err) {
        ctx.diag.note('ipc', `${channel} handler failed: ${String(err)}`);
      }
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
      try {
        if (e.senderFrame && e.senderFrame !== e.sender.mainFrame) return blocked;
        const p = payload as { serviceId?: ServiceId } | undefined;
        return senderAllowed(ctx, channel, e.sender.id, p?.serviceId)
          ? fn(payload as InvokePayload<C>, e)
          : blocked;
      } catch (err) {
        ctx.diag.note('ipc', `${channel} handler failed: ${String(err)}`);
        return blocked;
      }
    });
  };
}

/** The https origin of the frame that invoked, or null: WebAuthn binds to
 *  the page that asked, and a subframe, a blank page or a stale frame gets
 *  nothing. Never read from the payload. */
function invokeOrigin(e: IpcMainInvokeEvent): string | null {
  // inside the try: property access on a disposed WebFrameMain throws
  try {
    const frame = e.senderFrame;
    if (!frame || frame !== e.sender.mainFrame) return null;
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
      ctx.noteDestroyed(id); // free a peek that was mid-flight on this view
      ctx.waking.end(id, 'destroyed');
      ctx.state.setRuntime(id, {
        unread: { direct: 0, indirect: 0 },
        crashed: false,
        stale: false,
        hibernated: false,
        loading: false,
        waking: false,
        wakeKind: null,
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

/** Finish the banner click the lock screen interrupted. The entry is resolved
 *  and re-validated now rather than at park time, exactly as a live click is:
 *  the service may have been banished, or the entry rotated out of the ring,
 *  in the minutes the app spent locked. */
function replayPending(ctx: AppContext): void {
  const pending = ctx.lock.takePending();
  if (!pending) return;
  const entry = pending.entryId !== undefined ? ctx.activity.get(pending.entryId) : undefined;
  if (entry) openActivityEntry(ctx, entry);
  else activateService(ctx, pending.serviceId);
}

/** True when this action may proceed: either the guard is off, or the user
 *  has just authorized exactly this action. A refusal is silent, like every
 *  other refusal in this file. */
function authorized(ctx: AppContext, action: GuardedAction): boolean {
  const guarded = actionGuarded({
    guardActions: ctx.settings.get().appLock.guardActions,
    configured: ctx.lock.configured(),
  });
  return !guarded || ctx.lock.consumeConsent(action);
}

/** The one mute tail: the tile menu, the Settings checkbox and the expiry
 *  timer all land here. `until` is the timed mute's expiry (0 = none); an
 *  unmute always zeroes it, so a stale expiry can never re-silence a service
 *  the user unmuted by hand. */
export function setServiceMuted(
  ctx: AppContext,
  serviceId: ServiceId,
  muted: boolean,
  until = 0,
): void {
  const s = ctx.settings.get();
  ctx.settings.update({
    muted: { ...s.muted, [serviceId]: muted },
    mutedUntil: { ...s.mutedUntil, [serviceId]: muted ? until : 0 },
  });
  ctx.views.applyAudioMute(serviceId);
  ctx.muteTimer.rearm();
  ctx.broadcast();
}

/** a page-shaped `until` is a finite instant in the future, or it is nothing */
function validUntil(until: unknown): number {
  return typeof until === 'number' && Number.isFinite(until) && until > Date.now() ? until : 0;
}

export function registerIpcHandlers(ctx: AppContext, router: NotificationRouter): void {
  const on = register(ctx);
  const onInvoke = registerInvoke(ctx);
  on('service:activate', ({ serviceId }) => activateService(ctx, serviceId));
  on('service:reload', ({ serviceId }) => ctx.views.refresh(serviceId));
  on('service:ready', ({ serviceId }) => ctx.waking.end(serviceId, 'recipe-ready'));
  on('service:setMuted', ({ serviceId, muted, until }) =>
    setServiceMuted(ctx, serviceId, muted, validUntil(until)),
  );
  on('service:tileMenu', ({ serviceId }) => {
    const s = ctx.settings.get();
    const muted = s.muted[serviceId];
    // every action is quick and recoverable (banish keeps the login) — no confirm
    const run: Record<TileMenuAction, () => void> = {
      reload: () => ctx.views.refresh(serviceId),
      mute: () => setServiceMuted(ctx, serviceId, false),
      banish: () => ctx.banishServices([serviceId]),
    };
    const items = tileMenuItems({
      muted,
      live: ctx.views.has(serviceId),
      mutedUntil: s.mutedUntil[serviceId],
      now: new Date(),
    });
    Menu.buildFromTemplate(
      items.map((item) => {
        if (item.type === 'separator') return item;
        if (item.type === 'submenu') {
          return {
            label: item.label,
            submenu: item.items.map((c) => ({
              label: c.label,
              click: () => setServiceMuted(ctx, serviceId, true, muteExpiry(c.kind, new Date())),
            })),
          };
        }
        return { label: item.label, enabled: item.enabled, click: run[item.action] };
      }),
    ).popup({ window: ctx.win });
  });
  on('service:purgeLogin', ({ serviceId }) => {
    if (!authorized(ctx, { kind: 'purge-one', serviceId })) return;
    void purgeLogin(ctx, serviceId);
  });
  on('service:reorder', ({ orderedIds }) => {
    ctx.settings.update({ order: orderedIds });
    buildAppMenu(ctx); // keep Cmd/Ctrl+1..9 aligned with the new order
    ctx.broadcast();
  });
  on('global:setMuted', ({ muted, until }) => ctx.setGlobalMuted(muted, validUntil(until)));
  on('global:muteMenu', () => {
    // the channel is refused while locked, so the popup needs no guard of its own
    const toggle = () => ctx.setGlobalMuted(!(ctx.settings.get().globalMuted || ctx.quietNow()));
    const entry = globalMuteMenuTemplate(ctx, { toggle, guarded: false });
    // the bell already says "mute all"; pop the durations themselves
    Menu.buildFromTemplate(
      Array.isArray(entry.submenu) ? entry.submenu : [{ label: entry.label, click: entry.click }],
    ).popup({ window: ctx.win });
  });
  on('switcher:setOpen', ({ open }) => setOverlayOpen(ctx, 'switcherOpen', open));
  on('settings:setOpen', ({ open }) => setOverlayOpen(ctx, 'settingsOpen', open));
  on('home:setOpen', ({ open }) => {
    setHomeOpen(ctx, open);
    // so Escape and the accelerators reach the shell, not the buried view
    if (open) ctx.win.webContents.focus();
  });
  on('settings:update', (patch) => {
    const before = ctx.settings.get();
    // The whole frame is refused, not just its disabled half: Home commits
    // adds, removals and the new order together on purpose, so there is no
    // partial patch to apply. A banish-only or reorder-only commit summons
    // nothing and never reaches this branch.
    if (patch.disabled) {
      const summoned = summonedIds(before.order, before.disabled, patch.disabled);
      if (summoned.length > 0 && !authorized(ctx, { kind: 'summon' })) return;
    }
    // summoning restarts the unused clock, in the same write as the summon:
    // Home commits adds, banishes and reorders as one frame, and a second
    // settings write here would cost a second broadcast and menu rebuild
    const stamped = patch.disabled
      ? stampSummoned({
          order: before.order,
          before: before.disabled,
          after: patch.disabled,
          lastUsedAt: before.lastUsedAt,
          now: Date.now(),
        })
      : null;
    const after = ctx.settings.update(stamped ? { ...patch, lastUsedAt: stamped } : patch);
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
  // stale on/off is a diagnostics line only on the transition: a count
  // arrives every ~2s per service and must never be a line per tick
  const noteRecipe = (serviceId: ServiceId, nowStale: boolean, reason?: unknown) => {
    const t = recipeTransition(ctx.state.runtime(serviceId).stale, nowStale);
    if (!t) return;
    const why = t === 'stale' ? sanitizeDetail(reason) : '';
    const line = why ? `${serviceId} stale: ${why}` : `${serviceId} ${t}`;
    ctx.diag.note('recipe', withPage(line, ctx.views.pageUrl(serviceId)), serviceId);
  };
  on('service:readyTimeout', ({ serviceId }) => {
    ctx.diag.note(
      'recipe',
      withPage(`${serviceId} ready() never matched in 10s`, ctx.views.pageUrl(serviceId)),
      serviceId,
    );
  });
  on('unread:update', ({ serviceId, direct, indirect }) => {
    noteRecipe(serviceId, false);
    ctx.state.setRuntime(serviceId, { unread: { direct, indirect }, stale: false });
    // setRuntime no-ops on an unchanged count, so the peek signal lives here
    ctx.noteUnreadReport(serviceId);
  });
  on('unread:stale', ({ serviceId, reason }) => {
    noteRecipe(serviceId, true, reason);
    ctx.state.setRuntime(serviceId, { stale: true });
    ctx.noteUnreadReport(serviceId);
  });
  on('badge:overlay', ({ dataUrl, count }) => applyOverlay(ctx.win, dataUrl, count));
  on('notification:fired', (n) => router.handle(n));
  onInvoke('activity:recent', [], () => ctx.activity.recent());
  onInvoke('services:purgeAll', { purged: 0 }, () => {
    // the same shape a blocked sender gets, so the toast says nothing
    // happened — which is true
    if (!authorized(ctx, { kind: 'purge-all' })) return { purged: 0 };
    return purgeAll(ctx);
  });
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
  onInvoke('diagnostics:recent', [], () => ctx.diag.recent());
  onInvoke('diagnostics:report', '', () => {
    const s = ctx.settings.get();
    const enabled = s.order.filter((id) => !s.disabled[id]);
    return ctx.diag.report({
      version: app.getVersion(),
      electron: process.versions.electron,
      platform: process.platform,
      arch: process.arch,
      os: release(),
      startedAt: ctx.startedAt,
      now: Date.now(),
      enabled,
      settings: settingsSummary(s),
      services: enabled.map((id) => {
        const rt = ctx.state.runtime(id);
        return serviceSnapshotLine({
          id,
          page: ctx.views.pageUrl(id),
          unread: rt.unread,
          stale: rt.stale,
          crashed: rt.crashed,
          muted: s.muted[id],
        });
      }),
    });
  });
  onInvoke('downloads:chooseDir', null, async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(ctx.win, {
      properties: ['openDirectory', 'createDirectory'],
      defaultPath: ctx.settings.get().downloads.dir ?? app.getPath('downloads'),
    });
    return canceled || filePaths.length === 0 ? null : filePaths[0];
  });
  onInvoke('lock:unlock', { ok: false, waitMs: 0, reason: 'unavailable' }, async (req) => {
    const result = await ctx.lock.unlock(req);
    ctx.syncLocked();
    if (result.ok) replayPending(ctx);
    return result;
  });
  onInvoke('lock:confirm', { ok: false, waitMs: 0, reason: 'unavailable' }, (req) =>
    ctx.lock.grantConsent(req.action, req.credential),
  );
  onInvoke('lock:configure', { ok: false, error: 'wrong' }, async (req) => {
    const result = await ctx.lock.configure(req);
    // the pane renders from ShellState.settings and lockConfigured, and
    // configure() may have moved both
    if (result.ok) ctx.broadcast();
    return result;
  });
  on('activity:open', ({ entryId }) => {
    const entry = ctx.activity.get(entryId);
    if (entry) openActivityEntry(ctx, entry); // else rotated out since the switcher fetched
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
      conversation: pin.conversation || undefined,
      serviceUrl: meta.url,
      chatPaths: meta.chatPaths,
    });
    void performBannerAction(ctx, pin.serviceId, action);
  });
  on('service:trusted-click', ({ serviceId, x, y }) => ctx.views.trustedClick(serviceId, x, y));
  on('service:openExternal', ({ serviceId, url }) =>
    ctx.views.openExternalFromPage(serviceId, url),
  );
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
