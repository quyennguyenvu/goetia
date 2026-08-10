import { join } from 'node:path';
import { app, Menu, Tray } from 'electron';
import type { AppContext } from './ipc-handlers';

// out/main -> project root (dev/e2e) or asar root (packaged)
const RESOURCES = join(__dirname, '../../resources');

let quitting = false;

export function createTray(ctx: AppContext): {
  updateTooltip(total: number): void;
  refresh(): void;
} {
  const iconName = process.platform === 'darwin' ? 'trayTemplate.png' : 'tray-win.png';
  const tray = new Tray(join(RESOURCES, 'tray', iconName));

  const toggle = () => {
    if (ctx.win.isVisible()) ctx.win.hide();
    else {
      ctx.win.show();
      ctx.win.focus();
    }
    rebuild();
  };

  const rebuild = () => {
    const s = ctx.settings.get();
    tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: ctx.win.isVisible() ? 'Hide Goetia' : 'Show Goetia', click: toggle },
        {
          label: 'Mute all notifications',
          type: 'checkbox',
          checked: s.globalMuted,
          // no accelerator here: the app menu owns the binding, and declaring
          // it twice risks the toggle firing twice for one keypress
          click: (item) => ctx.setGlobalMuted(item.checked),
        },
        { type: 'separator' },
        {
          label: 'Quit Goetia',
          click: () => {
            quitting = true;
            app.quit();
          },
        },
      ]),
    );
  };

  tray.on('click', () => {
    if (process.platform === 'win32') toggle();
  });
  rebuild();

  ctx.win.on('close', (e) => {
    if (quitting) return; // real quit in progress; let it close
    if (ctx.settings.get().closeToTray) {
      e.preventDefault();
      ctx.win.hide();
      rebuild();
    } else {
      // close-to-tray off: the X button means quit, not hide — never leave a
      // destroyed-window process running with live timers/tray behind it
      quitting = true;
      app.quit();
    }
  });
  ctx.win.on('show', rebuild);
  ctx.win.on('hide', rebuild);
  app.on('before-quit', () => {
    quitting = true;
  });

  return {
    updateTooltip(total: number) {
      tray.setToolTip(total > 0 ? `Goetia — ${total} unread` : 'Goetia');
    },
    /** the mute checkmark is baked in at build time — re-stamp it when mute
     *  moves from the bell, the app menu or the accelerator */
    refresh: rebuild,
  };
}
