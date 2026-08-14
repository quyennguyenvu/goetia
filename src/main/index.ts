import { join } from 'node:path';
import { app, BrowserWindow, nativeImage, nativeTheme } from 'electron';
import { aggregateBadges } from '../shared/badges';
import { serviceById } from '../shared/services';
import { applyBadges } from './badges';
import { HibernationController } from './hibernation';
import { type AppContext, registerIpcHandlers } from './ipc-handlers';
import { audioMuted } from './lib/notification-rules';
import { resolveStartupSurface } from './lib/startup-surface';
import { chromeUserAgent } from './lib/ua';
import { LoadingOverlay } from './loading-overlay';
import { buildAppMenu } from './menu';
import { NotificationRouter } from './notifications';
import { ResilienceManager } from './resilience';
import { SettingsStore } from './settings';
import { MainState } from './state';
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
    const state = new MainState();
    const win = createWindow();

    const effectiveTheme = (): 'light' | 'dark' => {
      const pref = settings.get().theme;
      if (pref === 'system') return nativeTheme.shouldUseDarkColors ? 'dark' : 'light';
      return pref;
    };

    const overlay = new LoadingOverlay(win, effectiveTheme());
    const waking = new WakingTracker(state);
    let resilience: ResilienceManager | null = null;
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
        onNavigate: (id) => waking.begin(id),
        onCrashed: (id) => {
          waking.end(id, 'crashed');
          resilience?.onCrashed(id);
        },
        onLoadFailed: (id) => {
          waking.end(id, 'load-failed');
          resilience?.onLoadFailed(id);
        },
      },
      () => settings.get().railPosition,
      (id) => {
        const s = settings.get();
        return audioMuted({ serviceMuted: s.muted[id], globalMuted: s.globalMuted });
      },
      (id) => state.runtime(id).waking,
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

    const syncOverlay = () => {
      const rt = state.runtime(state.activeId);
      const show =
        rt.waking && !rt.crashed && !state.switcherOpen && !state.settingsOpen && !state.homeOpen;
      if (!show) {
        overlay.hide();
        return;
      }
      overlay.update({
        theme: effectiveTheme(),
        serviceName: serviceById(state.activeId).name,
      });
      overlay.show();
    };

    let tray: ReturnType<typeof createTray> | null = null;
    const broadcast = () => {
      if (win.isDestroyed()) return;
      const s = settings.get();
      win.webContents.send('shell:state', state.snapshot(s, effectiveTheme(), app.getVersion()));
      const summary = aggregateBadges(s.order.map((id) => state.runtime(id).unread));
      applyBadges(win, summary);
      tray?.updateTooltip(summary.total);
      syncOverlay();
    };

    state.onChange(broadcast);
    nativeTheme.on('updated', broadcast);
    win.webContents.on('did-finish-load', broadcast);
    win.webContents.on('before-input-event', (_e, input) => {
      // F5 reload while focus is on the shell (menu covers Cmd/Ctrl+R)
      if (input.type === 'keyDown' && input.key === 'F5') views.refresh(state.activeId);
    });

    // Returning from another app (alt-tab, password-manager auto-type, …):
    // keyboard focus must land in the service page, not the shell rail —
    // otherwise auto-typed "user → Tab → password → Enter" walks the rail.
    win.on('focus', () => {
      if (!state.switcherOpen && !state.settingsOpen && !state.homeOpen) views.focusActive();
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
      broadcast,
      noteActivated: (id: Parameters<HibernationController['noteActivated']>[0]) =>
        hibernation.noteActivated(id),
      setGlobalMuted: (muted) => {
        settings.update({ globalMuted: muted });
        views.applyAudioMuteAll();
        // both menus capture the checkmark when they are built
        buildAppMenu(ctx);
        tray?.refresh();
        broadcast();
      },
    };
    hibernation = new HibernationController(ctx);
    resilience = new ResilienceManager(ctx);
    registerIpcHandlers(ctx, new NotificationRouter(ctx));
    hibernation.start();
    tray = createTray(ctx);
    buildAppMenu(ctx);

    // dev and e2e runs must not touch the network; a manual check still works
    if (app.isPackaged) updates.start();
    app.on('before-quit', () => updates.dispose());

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
      views.activate(surface.activeId, { show: !state.homeOpen });
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
