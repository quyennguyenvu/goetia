import { join } from 'node:path';
import { app, BrowserWindow, nativeImage, nativeTheme } from 'electron';
import { aggregateBadges } from '../shared/badges';
import { applyBadges } from './badges';
import { HibernationController } from './hibernation';
import { registerIpcHandlers } from './ipc-handlers';
import { chromeUserAgent } from './lib/ua';
import { buildAppMenu } from './menu';
import { NotificationRouter } from './notifications';
import { ResilienceManager } from './resilience';
import { SettingsStore } from './settings';
import { MainState } from './state';
import { createTray } from './tray';
import { ServiceViewManager } from './views';

app.setName('Goetia');
// e2e runs in an isolated throwaway profile, never the user's real sessions
const userDataArg = process.argv.find((a) => a.startsWith('--goetia-user-data='));
if (userDataArg) app.setPath('userData', userDataArg.slice('--goetia-user-data='.length));
// Windows toasts are dropped without an explicit AppUserModelID matching the installer's appId
if (process.platform === 'win32') app.setAppUserModelId('com.quyennguyenvu.goetia');
app.userAgentFallback = chromeUserAgent(app.userAgentFallback);

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 940,
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

    let resilience: ResilienceManager | null = null;
    const views = new ServiceViewManager(
      win,
      {
        onLoading: (id, loading) => {
          state.setRuntime(id, { loading });
          if (!loading) resilience?.noteRecovered(id);
        },
        onCrashed: (id) => resilience?.onCrashed(id),
        onLoadFailed: (id) => resilience?.onLoadFailed(id),
      },
      () => settings.get().railPosition,
    );

    const effectiveTheme = (): 'light' | 'dark' => {
      const pref = settings.get().theme;
      if (pref === 'system') return nativeTheme.shouldUseDarkColors ? 'dark' : 'light';
      return pref;
    };

    let tray: { updateTooltip(total: number): void } | null = null;
    const broadcast = () => {
      const s = settings.get();
      win.webContents.send('shell:state', state.snapshot(s, effectiveTheme(), app.getVersion()));
      const summary = aggregateBadges(
        s.order.map((id) => ({ ...state.runtime(id).unread, muted: s.muted[id] })),
        s.globalMuted,
      );
      applyBadges(win, summary);
      tray?.updateTooltip(summary.total);
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
      if (!state.switcherOpen && !state.settingsOpen) views.focusActive();
    });

    let hibernation: HibernationController;
    const ctx = {
      win,
      views,
      state,
      settings,
      broadcast,
      noteActivated: (id: Parameters<HibernationController['noteActivated']>[0]) =>
        hibernation.noteActivated(id),
    };
    hibernation = new HibernationController(ctx);
    resilience = new ResilienceManager(ctx);
    registerIpcHandlers(ctx, new NotificationRouter(ctx));
    hibernation.start();
    tray = createTray(ctx);
    buildAppMenu(ctx);

    const s0 = settings.get();
    state.activeId = s0.order.find((id) => !s0.disabled[id]) ?? s0.order[0];
    ctx.noteActivated(state.activeId);
    views.activate(state.activeId);
    // never-hibernate services load hidden from the start, so their unread
    // counts and notifications work before ever being clicked
    for (const id of s0.order) {
      if (!s0.disabled[id] && s0.neverHibernate[id]) views.ensure(id);
    }

    if (process.argv.includes('--goetia-e2e')) {
      // fake unread on a service with no live view, so its recipe can't overwrite it
      setTimeout(() => {
        state.setRuntime('discord', { unread: { direct: 3, indirect: 0 } });
      }, 1500);
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
