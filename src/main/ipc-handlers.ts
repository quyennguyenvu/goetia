import { readFile, stat, writeFile } from 'node:fs/promises';
import { release } from 'node:os';
import { join } from 'node:path';
import {
  app,
  type BrowserWindow,
  dialog,
  type IpcMainInvokeEvent,
  ipcMain,
  Menu,
  shell,
} from 'electron';
import { normalizeDiagFilter } from '../shared/diag-filter';
import type { InvokePayload, RendererInvoke, RendererToMain } from '../shared/ipc';
import { describeAction, type GuardedAction, guardGroupOf, guardOn } from '../shared/lock';
import { muteExpiry } from '../shared/mute';
import { serviceById } from '../shared/services';
import { isRebindable } from '../shared/shortcuts';
import { DEFAULT_SETTINGS, type ServiceId, type Settings } from '../shared/types';
import {
  activateService,
  onScreenKey,
  openActivityEntry,
  openRecentEntry,
  performBannerAction,
  rememberSurface,
  setHomeOpen,
  setOverlayOpen,
} from './activate';
import { applyOverlay } from './badges';
import type { DownloadManager } from './downloads';
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
import { DOWNLOAD_HISTORY_CAP, downloadsSettingLines } from './lib/download-rules';
import { isSafeExternalUrl } from './lib/external-url';
import { normalizeAction, normalizeRemoveIds, stripAppLock } from './lib/guard-policy';
import { channelAllowedWhileLocked, ipcSenderAllowed } from './lib/ipc-sender-policy';
import { resolveBannerClick } from './lib/notification-click';
import { anyOverlayOpen } from './lib/overlay-rules';
import {
  acceptReport,
  conversationKey,
  recentLabel,
  recentRows,
  sanitizeReport,
} from './lib/recents-rules';
import { BACKUP_MAX_BYTES, backupFileName, buildBackup, parseBackup } from './lib/settings-backup';
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
import type { RecentsStore } from './recents';
import type { SettingsStore } from './settings';
import type { ShortcutRecorder } from './shortcut-recorder';
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
  /** banner history behind banner clicks and the lock's parked click; in-memory only */
  activity: ActivityLog;
  /** ⌘K's Recent: the conversations the user opened; persisted sealed, see recents.ts */
  recents: RecentsStore;
  /** the pinboard; persisted, see pins.ts */
  pins: PinStore;
  /** the download history behind Settings → Downloads; persisted, see download-history.ts */
  downloads: DownloadManager;
  /** Settings → Shortcuts' one pending recording */
  recorder: ShortcutRecorder;
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
 *  has just authorized exactly this action. A refusal is silent to the
 *  caller, like every other refusal in this file — and noted in the ring,
 *  because someone asked for a guarded action without the credential. A
 *  grant is not noted: the action's own line records it. */
function authorized(ctx: AppContext, action: GuardedAction): boolean {
  const guarded = guardOn(ctx.settings.get().appLock, ctx.lock.configured(), guardGroupOf(action));
  if (!guarded) return true;
  const ok = ctx.lock.consumeConsent(action);
  if (!ok) ctx.diag.note('lock', `${describeAction(action)} refused: no consent`);
  return ok;
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

/** The settings tail every shell write runs — Settings' controls, Home's
 *  one-frame commit and an imported backup alike. False when the guard
 *  refused a summon (the whole frame is refused, not just its disabled half:
 *  Home commits adds, removals and the new order together on purpose, so
 *  there is no partial patch to apply; a banish-only or reorder-only commit
 *  summons nothing and never reaches that branch). */
export function applySettingsPatch(ctx: AppContext, raw: Partial<Settings>): boolean {
  const stripped = stripAppLock(raw);
  if (stripped.carried) ctx.diag.note('ipc', 'settings:update carried appLock; dropped');
  const patch = stripped.patch;
  const before = ctx.settings.get();
  if (patch.disabled) {
    const summoned = summonedIds(before.order, before.disabled, patch.disabled);
    if (summoned.length > 0) {
      if (!authorized(ctx, { kind: 'summon' })) return false;
      ctx.diag.note('app', `summoned: ${summoned.join(', ')}`);
    }
  }
  if (patch.downloads) {
    for (const line of downloadsSettingLines(before.downloads, patch.downloads)) {
      ctx.diag.note('downloads', line);
    }
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
  if ('shortcuts' in patch) buildAppMenu(ctx); // the menu bakes its accelerators in
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
  return true;
}

/** how long a summoning import waits for CredentialConfirm before it is dropped */
const IMPORT_PENDING_MS = 60_000;
let pendingImport: { patch: Partial<Settings>; path: string; at: number } | null = null;

const BACKUP_FILTERS = [{ name: 'Goetia settings', extensions: ['json'] }];

/** Under --goetia-e2e an env path stands in for both dialogs: a native
 *  dialog cannot be driven. Never consulted otherwise. */
function e2eBackupPath(): string | null {
  return process.argv.includes('--goetia-e2e')
    ? (process.env.GOETIA_E2E_BACKUP_PATH ?? null)
    : null;
}

async function backupSavePath(ctx: AppContext): Promise<string | null> {
  const forced = e2eBackupPath();
  if (forced) return forced;
  const { canceled, filePath } = await dialog.showSaveDialog(ctx.win, {
    defaultPath: join(app.getPath('documents'), backupFileName(new Date())),
    filters: BACKUP_FILTERS,
  });
  return canceled || !filePath ? null : filePath;
}

async function backupOpenPath(ctx: AppContext): Promise<string | null> {
  const forced = e2eBackupPath();
  if (forced) return forced;
  const { canceled, filePaths } = await dialog.showOpenDialog(ctx.win, {
    properties: ['openFile'],
    defaultPath: app.getPath('documents'),
    filters: BACKUP_FILTERS,
  });
  return canceled || filePaths.length === 0 ? null : filePaths[0];
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
    ctx.diag.note('app', `purged login: ${serviceId}`);
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
    applySettingsPatch(ctx, patch);
  });
  onInvoke('settings:export', { ok: false, reason: 'cancelled' }, async () => {
    const path = await backupSavePath(ctx);
    if (!path) return { ok: false, reason: 'cancelled' };
    const file = buildBackup(ctx.settings.get(), app.getVersion(), new Date());
    try {
      await writeFile(path, `${JSON.stringify(file, null, 2)}\n`, 'utf8');
    } catch {
      return { ok: false, reason: 'write-failed' };
    }
    return { ok: true, path };
  });
  onInvoke('settings:import', { ok: false, reason: 'cancelled' }, async ({ retry }) => {
    let parsed: { patch: Partial<Settings>; path: string } | null = null;
    if (retry) {
      // CredentialConfirm just verified: apply what the guard parked, once
      if (pendingImport && Date.now() - pendingImport.at <= IMPORT_PENDING_MS) {
        parsed = pendingImport;
      }
      pendingImport = null;
      if (!parsed) return { ok: false, reason: 'cancelled' };
    } else {
      pendingImport = null;
      const path = await backupOpenPath(ctx);
      if (!path) return { ok: false, reason: 'cancelled' };
      let text: string;
      try {
        if ((await stat(path)).size > BACKUP_MAX_BYTES) return { ok: false, reason: 'too-large' };
        text = await readFile(path, 'utf8');
      } catch {
        return { ok: false, reason: 'read-failed' };
      }
      const r = parseBackup(text);
      if (!r.ok) return { ok: false, reason: r.reason };
      parsed = { patch: ctx.settings.sanitize(r.patch), path };
    }
    // an imported mute is a plain one: the file carries no expiries, and a
    // stale one left behind would end a mute the file just set
    const patch: Partial<Settings> = {
      ...parsed.patch,
      ...('muted' in parsed.patch ? { mutedUntil: DEFAULT_SETTINGS.mutedUntil } : {}),
      ...('globalMuted' in parsed.patch ? { globalMutedUntil: 0 } : {}),
    };
    if (!applySettingsPatch(ctx, patch)) {
      pendingImport = { patch: parsed.patch, path: parsed.path, at: Date.now() };
      return { ok: false, reason: 'guarded' };
    }
    ctx.diag.note('app', `settings imported (${Object.keys(parsed.patch).length} keys)`);
    // the tails settings:update never needed, because the UI moves these
    // through other doors (⌘1…9's menu, the zoom chords, the mute tails)
    if (patch.order) buildAppMenu(ctx);
    if (patch.zoom) {
      for (const id of ctx.settings.get().order) if (ctx.views.has(id)) ctx.views.applyZoom(id);
    }
    if ('muted' in patch || 'globalMuted' in patch) {
      ctx.views.applyAudioMuteAll();
      ctx.muteTimer.rearm();
      ctx.quietScheduleChanged(); // page audio, both menus, broadcast
    }
    return { ok: true, path: parsed.path };
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
  on('conversation:active', ({ serviceId, conversation, url, title }) => {
    // the preload's focus gate runs in a world the page shares, so the
    // service on screen is decided here, from main's own state
    if (
      !acceptReport({
        serviceId,
        activeId: ctx.state.activeId,
        overlayOpen: anyOverlayOpen(ctx.state),
        windowFocused: ctx.win.isFocused(),
        disabled: ctx.settings.get().disabled[serviceId],
      })
    ) {
      return;
    }
    const report = sanitizeReport({ conversation, url, title });
    if (!report) return;
    const meta = serviceById(serviceId);
    const named = recentLabel({ ...report, serviceUrl: meta.url, serviceName: meta.name });
    if (!named) {
      // the empty chat list, a login page: nothing is on screen to exclude
      ctx.state.onScreen.delete(serviceId);
      return;
    }
    const sighting = {
      serviceId,
      label: named.label,
      ...(named.conversation ? { conversation: named.conversation } : {}),
      url: report.url,
      at: Date.now(),
    };
    // a chat the user clicked into themselves ends a chord walk; the one the
    // walk just opened reports the cursor's own key and keeps it
    const key = conversationKey(sighting);
    if (ctx.state.walk && ctx.state.walk.cursor !== key) ctx.state.walk = null;
    ctx.state.onScreen.set(serviceId, key);
    ctx.recents.upsert(sighting);
  });
  onInvoke('recents:list', { rows: [], storage: 'sealed' }, () => ({
    rows: recentRows(ctx.recents.rows(), onScreenKey(ctx)),
    storage: ctx.recents.storage(),
  }));
  on('recents:open', ({ id }) => {
    const entry = ctx.recents.get(id);
    if (entry) openRecentEntry(ctx, entry); // else purged since the switcher fetched
  });
  onInvoke('services:purgeAll', { purged: 0 }, async () => {
    // the same shape a blocked sender gets, so the toast says nothing
    // happened — which is true
    if (!authorized(ctx, { kind: 'purge-all' })) return { purged: 0 };
    const result = await purgeAll(ctx);
    ctx.diag.note('app', `purged all logins (${result.purged})`);
    return result;
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
    // destroys a credential Goetia made: guarded like a purge, and recorded
    if (typeof id !== 'string' || !authorized(ctx, { kind: 'passkey-forget', id })) {
      return ctx.passkeyStore.views();
    }
    const rpId = ctx.passkeyStore.get(id)?.rpId;
    if (ctx.passkeyStore.forget(id) && rpId) ctx.diag.note('passkey', `forgot ${rpId}`);
    return ctx.passkeyStore.views();
  });
  onInvoke('passkeys:restore', [], ({ id }) => {
    ctx.passkeyStore.restore(id);
    return ctx.passkeyStore.views();
  });
  onInvoke('diagnostics:recent', [], () => ctx.diag.recent());
  onInvoke('diagnostics:report', '', (payload) => {
    // renderer data until re-checked: unknown tags dropped, query clipped
    const filter = normalizeDiagFilter(payload?.filter);
    const s = ctx.settings.get();
    const enabled = s.order.filter((id) => !s.disabled[id]);
    return ctx.diag.report(
      {
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
      },
      filter,
    );
  });
  onInvoke('downloads:chooseDir', null, async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(ctx.win, {
      properties: ['openDirectory', 'createDirectory'],
      defaultPath: ctx.settings.get().downloads.dir ?? app.getPath('downloads'),
    });
    return canceled || filePaths.length === 0 ? null : filePaths[0];
  });
  onInvoke('downloads:recent', { rows: [], storage: 'sealed' }, () => ctx.downloads.recent());
  on('downloads:reveal', ({ id }) => {
    if (Number.isSafeInteger(id)) ctx.downloads.reveal(id);
  });
  on('downloads:cancel', ({ id }) => {
    if (Number.isSafeInteger(id)) ctx.downloads.cancel(id);
  });
  on('downloads:remove', ({ ids }) => {
    const set = normalizeRemoveIds(ids, DOWNLOAD_HISTORY_CAP);
    if (!set || !authorized(ctx, { kind: 'downloads-remove', ids: set })) return;
    const n = ctx.downloads.remove(set);
    if (n > 0) ctx.diag.note('downloads', `history: removed ${n} rows`);
  });
  on('downloads:clear', () => {
    if (!authorized(ctx, { kind: 'downloads-clear' })) return;
    const n = ctx.downloads.clear();
    if (n > 0) ctx.diag.note('downloads', `history cleared (${n} rows)`);
  });
  on('downloads:restore', () => {
    ctx.downloads.restore();
  });
  on('downloads:openDir', () => {
    ctx.downloads.openFolder();
  });
  onInvoke('shortcuts:record', { ok: false, reason: 'cancelled' }, async ({ id }) => {
    if (!isRebindable(id)) return { ok: false, reason: 'cancelled' };
    const result = await ctx.recorder.start(id);
    if (result.ok && Object.keys(result.patch).length > 0) {
      applySettingsPatch(ctx, { shortcuts: { ...ctx.settings.get().shortcuts, ...result.patch } });
    }
    return result;
  });
  onInvoke('lock:unlock', { ok: false, waitMs: 0, reason: 'unavailable' }, async (req) => {
    const result = await ctx.lock.unlock(req);
    ctx.syncLocked();
    if (result.ok) replayPending(ctx);
    return result;
  });
  onInvoke('lock:confirm', { ok: false, waitMs: 0, reason: 'unavailable' }, (req) => {
    const action = normalizeAction(req.action, DOWNLOAD_HISTORY_CAP);
    if (!action) return { ok: false, waitMs: 0, reason: 'unavailable' };
    return ctx.lock.grantConsent(action, req.credential);
  });
  onInvoke('lock:configure', { ok: false, error: 'wrong' }, async (req) => {
    const result = await ctx.lock.configure(req);
    // the pane renders from ShellState.settings and lockConfigured, and
    // configure() may have moved both
    if (result.ok) ctx.broadcast();
    return result;
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
