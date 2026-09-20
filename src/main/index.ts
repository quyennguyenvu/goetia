import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  app,
  BrowserWindow,
  Notification,
  nativeImage,
  nativeTheme,
  powerMonitor,
  session,
  shell,
} from 'electron';
import { aggregateBadges, type BadgeSummary } from '../shared/badges';
import { SERVICES, serviceById } from '../shared/services';
import { wakeCaption } from '../shared/wake-caption';
import { applyLocked } from './activate';
import { applyBadges } from './badges';
import { runShellCommand } from './commands';
import { DownloadManager } from './downloads';
import { HibernationController } from './hibernation';
import { IdentityShare } from './identity-share';
import { type AppContext, applyDisabledChange, registerIpcHandlers } from './ipc-handlers';
import { ActivityLog } from './lib/activity-log';
import { biometric, hasTouchId } from './lib/biometrics';
import { coalesce } from './lib/coalesce';
import { Diagnostics } from './lib/diagnostics';
import { resolveIcons } from './lib/notification-icons';
import { audioMuted } from './lib/notification-rules';
import { anyOverlayOpen } from './lib/overlay-rules';
import { muteToggleResult, quietWindowFor } from './lib/quiet-hours-rules';
import { resolveStartupSurface } from './lib/startup-surface';
import { chromeUserAgent } from './lib/ua';
import { LoadingOverlay } from './loading-overlay';
import { LockController, LockStore } from './lock';
import { buildAppMenu } from './menu';
import { ICON_DIR, NotificationRouter } from './notifications';
import { PasskeyAuthenticator } from './passkeys/authenticator';
import { safeStorageCodec } from './passkeys/codec';
import { electronPrompt, identitySharePrompt } from './passkeys/prompt';
import { PasskeyStore } from './passkeys/store';
import { PinStore } from './pins';
import { QuietHoursController } from './quiet-hours';
import { ResilienceManager } from './resilience';
import { SettingsStore } from './settings';
import { MainState } from './state';
import { SummonHotkey } from './summon-hotkey';
import { createTray } from './tray';
import { UpdateChecker } from './updates';
import { ServiceViewManager } from './views';
import { WakingTracker } from './waking';

app.setName('Goetia');
// e2e runs in an isolated throwaway profile, never the user's real sessions
const userDataArg = process.argv.find((a) => a.startsWith('--goetia-user-data='));
if (userDataArg) app.setPath('userData', userDataArg.slice('--goetia-user-data='.length));
const e2eUpdate = process.argv.includes('--goetia-e2e-update');
// Windows toasts are dropped without an explicit AppUserModelID matching the installer's appId
if (process.platform === 'win32') app.setAppUserModelId('com.quyennguyenvu.goetia');
app.userAgentFallback = chromeUserAgent(app.userAgentFallback);

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    // wide enough for Home's nine summoned tiles in one row beside the hero
    // column, with a side rail: 246 + 48 + 34 + 9×76 + 8×8 + 56 = 1132
    minWidth: 1140,
    minHeight: 600,
    title: 'Goetia',
    backgroundColor: '#0F1115',
    webPreferences: {
      preload: join(__dirname, '../preload/shell.cjs'),
      contextIsolation: true,
      sandbox: true,
    },
  });
  // the shell renderer never navigates and never opens windows: a drag-dropped
  // file or URL would otherwise replace the document while keeping the shell's
  // webContents id, and with it the reach of every SHELL_ONLY channel
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'));
  }
  return win;
}

app
  .whenReady()
  .then(() => {
    // dev runs the stock Electron binary — hand the dock our real icon
    // (the packaged app gets icon + name from its bundle)
    if (!app.isPackaged && process.platform === 'darwin') {
      app.dock?.setIcon(nativeImage.createFromPath(join(__dirname, '../../resources/icon.png')));
    }

    const settings = new SettingsStore(app.getPath('userData'));
    // the evidence ring behind Settings → Diagnostics; mirrored to the
    // console so a dev run reads as it always did
    const diagFile = join(app.getPath('userData'), 'diagnostics.json');
    const diag = new Diagnostics({
      now: Date.now,
      mirror: (line) => console.warn(line),
      // the previous session's ring, so a report after a restart still holds
      // the evidence from before it; restoreEntries treats the file as data
      load: () => (existsSync(diagFile) ? JSON.parse(readFileSync(diagFile, 'utf8')) : undefined),
      save: (entries) => writeFileSync(diagFile, JSON.stringify(entries)),
    });
    const startedAt = Date.now();
    diag.note('app', `started ${app.getVersion()}`);
    const pins = new PinStore(app.getPath('userData'));
    const passkeyStore = new PasskeyStore(app.getPath('userData'), safeStorageCodec());
    const lock = new LockController(new LockStore(app.getPath('userData'), safeStorageCodec()), {
      enabled: () => settings.get().appLock.enabled,
      touchIdEnabled: () => settings.get().appLock.touchId,
      hasTouchId,
      biometric,
      persist: (patch) => {
        settings.update({ appLock: { ...settings.get().appLock, ...patch } });
      },
      now: Date.now,
    });
    const state = new MainState();
    const win = createWindow();

    const sharePrompt = identitySharePrompt(win);
    const identityShare = new IdentityShare(
      app.getPath('userData'),
      (id) => session.fromPartition(`persist:${id}`).cookies,
      () => settings.get().shareFacebookLogin,
      (id) => sharePrompt(serviceById(id).name),
      (line, target) => diag.note('identity', line, target),
    );
    // a crash that killed the app with a sign-in popup open leaves the shared
    // session parked in a service jar; the marker file is how we notice
    void identityShare.sweepStale();

    const effectiveTheme = (): 'light' | 'dark' => {
      const pref = settings.get().theme;
      if (pref === 'system') return nativeTheme.shouldUseDarkColors ? 'dark' : 'light';
      return pref;
    };

    const overlay = new LoadingOverlay(win, effectiveTheme());
    const waking = new WakingTracker(state);
    const activity = new ActivityLog();
    let resilience: ResilienceManager | null = null;
    const downloads = new DownloadManager({
      settings: () => settings.get().downloads,
      defaultDir: () => app.getPath('downloads'),
      locked: () => lock.locked,
      serviceName: (id) => serviceById(id).name,
      icons: resolveIcons(
        ICON_DIR,
        SERVICES.map((s) => s.id),
        process.platform,
        existsSync,
      ),
      exists: existsSync,
      notify: ({ title, body, icon, onClick }) => {
        // silent always: a download is not a message, and the user asked for it
        const n = new Notification({ title, body, silent: true, ...(icon ? { icon } : {}) });
        n.on('click', onClick);
        n.on('failed', (_e, err) => diag.note('downloads', `banner: ${err}`));
        n.show();
      },
      reveal: (path) => shell.showItemInFolder(path),
      dockFinished: (path) => app.dock?.downloadFinished(path),
      setProgress: (fraction) => {
        if (!win.isDestroyed()) win.setProgressBar(fraction);
      },
      showWindow: () => {
        if (!win.isDestroyed()) win.show();
      },
      now: Date.now,
    });
    const views = new ServiceViewManager(
      win,
      {
        onLoading: (id, loading) => {
          state.setRuntime(id, { loading });
          if (!loading) {
            waking.end(id, 'load-finished');
            resilience?.noteRecovered(id);
          }
        },
        onNavigate: (id, kind) => {
          // the page's JS context is being replaced, taking the notification
          // shim's registry with it — its ids restart at 1 in the new document
          activity.forgetReplay(id);
          if (kind) waking.begin(id, kind);
        },
        onCrashed: (id, detail) => {
          waking.end(id, 'crashed');
          resilience?.onCrashed(id, detail);
        },
        onLoadFailed: (id, detail) => {
          waking.end(id, 'load-failed');
          resilience?.onLoadFailed(id, detail);
        },
        onPinMessage: (id, text, href, title, conversation) => {
          if (pins.pin({ serviceId: id, text, href, title, conversation, at: Date.now() })) {
            broadcast();
          }
        },
        pinsFull: () => pins.isFull(),
        // ctx is assembled below; a key event cannot arrive before it exists
        onShellCommand: (command) => runShellCommand(ctx, command),
        note: (tag, line, id) => diag.note(tag, line, id),
      },
      () => settings.get().railPosition,
      (id) => {
        const s = settings.get();
        return audioMuted({
          serviceMuted: s.muted[id],
          globalMuted: s.globalMuted,
          quietNow: quiet.quietNow(),
        });
      },
      (id) => state.runtime(id).waking,
      (id) => settings.get().zoom[id],
      identityShare,
      downloads,
      () => state.switcherOpen || state.settingsOpen || state.homeOpen,
      overlay,
    );

    const updates = new UpdateChecker({
      version: app.getVersion(),
      state,
      autoEnabled: () => settings.get().checkForUpdates,
      lastNotified: () => settings.get().lastNotifiedVersion,
      setLastNotified: (v) => {
        settings.update({ lastNotifiedVersion: v });
      },
      isVisible: () => !win.isDestroyed() && win.isVisible(),
      // opening the Updates pane re-checks, so e2e needs an answer that is
      // neither the network nor whatever this repo's real latest release is
      fetchFn: e2eUpdate
        ? async () =>
            ({
              ok: true,
              status: 200,
              json: async () => ({ tag_name: 'v99.0.0' }),
            }) as unknown as Response
        : undefined,
    });

    const quiet = new QuietHoursController({
      schedule: () => settings.get().quietHours,
      override: () => settings.get().quietOverrideWindowStart,
      // lazy: defined below with broadcast; boundaries only fire after startup
      onBoundary: () => quietSideEffects(),
    });

    const summon = new SummonHotkey(() => {
      if (win.isDestroyed()) return;
      if (win.isFocused()) {
        // hiding a fullscreen window strands an empty desktop space
        if (!win.isFullScreen()) win.hide();
        return;
      }
      win.show();
      win.focus();
    });
    const applySummon = () => {
      state.summonHotkeyOk = summon.apply(settings.get().summonHotkey);
    };

    const syncOverlay = () => {
      const rt = state.runtime(state.activeId);
      // the cover is a third view above the shell renderer, so it obeys the
      // same predicate the service views do — locked included, or it paints
      // over the lock screen while the restored service wakes behind it
      const show = rt.waking && !rt.crashed && !anyOverlayOpen(state);
      if (!show) {
        overlay.hide();
        return;
      }
      overlay.update({
        theme: effectiveTheme(),
        caption: wakeCaption(rt.wakeKind, serviceById(state.activeId).name),
      });
      overlay.show();
    };

    let tray: ReturnType<typeof createTray> | null = null;
    let appliedBadges: BadgeSummary | null = null;
    const flushBroadcast = () => {
      if (win.isDestroyed()) return;
      const s = settings.get();
      win.webContents.send(
        'shell:state',
        state.snapshot(
          s,
          effectiveTheme(),
          app.getVersion(),
          quiet.quietNow(),
          pins.views(),
          lock.configured(),
        ),
      );
      const summary = aggregateBadges(s.order.map((id) => state.runtime(id).unread));
      // setBadgeCount and setToolTip are platform calls; only make them when
      // the number actually moved, not on every unrelated state change
      if (
        !appliedBadges ||
        appliedBadges.total !== summary.total ||
        appliedBadges.indirectOnly !== summary.indirectOnly
      ) {
        appliedBadges = summary;
        applyBadges(win, summary);
        tray?.updateTooltip(summary.total);
      }
      syncOverlay();
    };
    // one pass per burst: a handler that touches several services in a loop
    // used to pay the whole fan-out per iteration
    const broadcast = coalesce(flushBroadcast);

    // the boundary fire and the mute toggle share one tail so they can't drift
    const quietSideEffects = () => {
      views.applyAudioMuteAll();
      // both menus capture the checkmark when they are built
      buildAppMenu(ctx);
      tray?.refresh();
      broadcast();
    };

    const sampleTouchId = () => {
      const available = hasTouchId();
      if (state.touchIdAvailable === available) return;
      state.touchIdAvailable = available;
      state.touch();
    };
    sampleTouchId();

    state.onChange(broadcast);
    nativeTheme.on('updated', broadcast);
    win.webContents.on('did-finish-load', broadcast);
    win.webContents.on('before-input-event', (_e, input) => {
      // F5 reload while focus is on the shell (menu covers Cmd/Ctrl+R). This
      // path never reaches runShellCommand, so it carries its own lock guard.
      if (state.locked) return;
      if (input.type === 'keyDown' && input.key === 'F5') views.refresh(state.activeId);
    });

    // Returning from another app (alt-tab, password-manager auto-type, …):
    // keyboard focus must land in the service page, not the shell rail —
    // otherwise auto-typed "user → Tab → password → Enter" walks the rail.
    win.on('focus', () => {
      sampleTouchId();
      if (!anyOverlayOpen(state)) views.focusActive();
    });

    // a check can land while the app sits in the tray; the toast waits
    win.on('show', () => updates.flushAnnounce());

    let hibernation: HibernationController;
    const ctx: AppContext = {
      win,
      views,
      state,
      settings,
      waking,
      updates,
      activity,
      pins,
      // a 5s cool-down after a declined ceremony refuses the next one silently,
      // so a scripted loop cannot chain endless modal prompts
      passkeys: new PasskeyAuthenticator(passkeyStore, electronPrompt(win), {
        cooldownMs: 5_000,
        // the authenticator prefixes its own tag; the ring adds it back
        log: (line) => diag.note('passkey', line.replace(/^\[passkey\] /, '')),
      }),
      passkeyStore,
      lock,
      identityShare,
      diag,
      startedAt,
      broadcast,
      noteActivated: (id: Parameters<HibernationController['noteActivated']>[0]) =>
        hibernation.noteActivated(id),
      noteUnreadReport: (id: Parameters<HibernationController['noteUnreadReport']>[0]) =>
        hibernation.noteUnreadReport(id),
      noteDestroyed: (id: Parameters<HibernationController['noteDestroyed']>[0]) =>
        hibernation.noteDestroyed(id),
      noteBannerFired: (id: Parameters<HibernationController['noteBannerFired']>[0]) =>
        hibernation.noteBannerFired(id),
      banishServices: (ids) => {
        const before = settings.get();
        const disabled = { ...before.disabled };
        for (const id of ids) disabled[id] = true;
        settings.update({ disabled });
        applyDisabledChange(ctx, before);
        broadcast();
      },
      setGlobalMuted: (muted) => {
        settings.update(
          muteToggleResult({
            wantSilence: muted,
            engagedWindowStart:
              quietWindowFor(new Date(), settings.get().quietHours)?.start.getTime() ?? null,
          }),
        );
        quietSideEffects();
      },
      quietNow: () => quiet.quietNow(),
      onBattery: () => powerMonitor.onBatteryPower,
      quietScheduleChanged: () => {
        quiet.rearm();
        quietSideEffects();
      },
      summonHotkeyChanged: () => {
        applySummon();
        broadcast();
      },
      syncLocked: () => {
        if (!applyLocked(ctx, lock.locked)) return;
        // both menus bake their disabled state in at build time
        buildAppMenu(ctx);
        tray?.refresh();
      },
    };
    hibernation = new HibernationController(ctx);
    resilience = new ResilienceManager(ctx);
    registerIpcHandlers(ctx, new NotificationRouter(ctx));
    hibernation.start();
    quiet.start();
    applySummon();
    tray = createTray(ctx);
    // the tray missed any badge applied before it existed; re-apply on the next
    // broadcast rather than leaving its tooltip stale
    appliedBadges = null;
    buildAppMenu(ctx);

    // dev and e2e runs must not touch the network; a manual check still works
    if (app.isPackaged) updates.start();
    app.on('before-quit', () => {
      updates.dispose();
      quiet.dispose();
      summon.dispose();
      hibernation.dispose();
      resilience?.dispose();
      identityShare.dispose();
      downloads.dispose();
      diag.flush();
      // last: commits any deferred write (zoom) before the process goes
      settings.dispose();
    });

    // Locked at launch is the whole point: the app restores the service you
    // left, so without this the lock would be a screen behind a live chat.
    // The surface still resolves normally below — locked simply keeps
    // presentSurface from showing it, so the view is warm at unlock.
    lock.lock();
    applyLocked(ctx, lock.locked);

    const s0 = settings.get();
    const surface = resolveStartupSurface({
      order: s0.order,
      disabled: s0.disabled,
      lastActiveId: s0.lastActiveId,
      lastHomeOpen: s0.lastHomeOpen,
    });
    // all-disabled (fresh install): show the welcome screen, create no
    // view — activating order[0] would give a disabled service network
    state.activeId = surface.activeId ?? s0.order[0];
    // a boot trim must be seen: land on Home, where the board reads 9/9 and
    // the toast names what was banished (a covered shell toast is invisible)
    state.homeOpen = surface.homeOpen || settings.bootTrimmed.length > 0;
    state.capTrimmed = settings.bootTrimmed;
    if (surface.activeId) {
      ctx.noteActivated(surface.activeId);
      // Home covers the view: resolve now, present when Home closes
      views.activate(surface.activeId, { show: !anyOverlayOpen(state) });
    }
    // never-hibernate services load hidden from the start, so their unread
    // counts and notifications work before ever being clicked
    for (const id of s0.order) {
      if (!s0.disabled[id] && s0.neverHibernate[id]) views.ensure(id);
    }

    if (process.argv.includes('--goetia-e2e')) {
      // must be an enabled service to reach the rail; its recipe reports {0,0}
      // once on the logged-out page and then never changes, so this survives
      setTimeout(() => {
        state.setRuntime('zalo', { unread: { direct: 3, indirect: 0 } });
        // and one evidence line, so the Diagnostics pane has a row to show
        diag.note('recipe', 'zalo stale', 'zalo');
      }, 1500);
    }

    // separate flag: an update toast must not perturb the other e2e specs
    if (e2eUpdate) {
      setTimeout(() => {
        state.setUpdate({ status: 'available', latest: '99.0.0', announce: '99.0.0' });
      }, 800);
    }
  })
  .catch((err) => {
    console.error('startup failed:', err);
    app.quit();
  });

// Tray app: closing the window hides it; quit only via tray menu / Cmd+Q.
app.on('window-all-closed', () => {});

app.on('activate', () => {
  // reopen from dock when hidden; never steal focus from a visible window
  const win = BrowserWindow.getAllWindows()[0];
  if (win && !win.isVisible()) win.show();
});
