import { app, Menu } from 'electron';
import { serviceById } from '../shared/services';
import { activateService, setHomeOpen, setOverlayOpen } from './activate';
import type { AppContext } from './ipc-handlers';
import { serviceAccelerator } from './lib/service-accelerator';
import { stepZoom } from './lib/zoom-rules';

function openSettings(ctx: AppContext): void {
  setOverlayOpen(ctx, 'settingsOpen', true);
  ctx.win.webContents.focus(); // so Escape closes the modal immediately
}

function goHome(ctx: AppContext): void {
  setHomeOpen(ctx, true);
  ctx.win.webContents.focus();
}

/** Zoom acts on the active service view; with no view anywhere (fresh
 *  install on Home) it is a silent no-op. Persist first, then re-apply. */
function setActiveZoom(ctx: AppContext, next: (current: number) => number): void {
  const id = ctx.state.activeId;
  if (!ctx.views.has(id)) return;
  const s = ctx.settings.get();
  // deferred: ⌘+ is a key-repeat path and an atomic write costs ~5 ms. The
  // level is live in the cache immediately, so applyZoom below still reads it;
  // a hard kill inside the window loses one zoom step and nothing else.
  ctx.settings.updateDeferred({ zoom: { ...s.zoom, [id]: next(s.zoom[id]) } });
  ctx.views.applyZoom(id);
}

export function buildAppMenu(ctx: AppContext): void {
  const s = ctx.settings.get();
  const order = s.order.filter((id) => !s.disabled[id]);
  const settingsItem: Electron.MenuItemConstructorOptions = {
    label: 'Settings…',
    accelerator: 'CmdOrCtrl+,',
    click: () => openSettings(ctx),
  };
  const muteItem: Electron.MenuItemConstructorOptions = {
    label: 'Mute All Notifications',
    accelerator: 'CmdOrCtrl+Shift+M',
    type: 'checkbox',
    checked: s.globalMuted || ctx.quietNow(),
    // the item's own `checked` is stale the moment mute moves elsewhere; read
    // effective silence instead, and let setGlobalMuted rebuild both menus
    click: () => ctx.setGlobalMuted(!(ctx.settings.get().globalMuted || ctx.quietNow())),
  };
  const checkUpdatesItem: Electron.MenuItemConstructorOptions = {
    label: 'Check for Updates…',
    click: () => {
      openSettings(ctx); // land the answer where the user is now looking
      void ctx.updates.check('manual');
    },
  };
  const template: Electron.MenuItemConstructorOptions[] = [
    ...(process.platform === 'darwin'
      ? [
          {
            label: app.name,
            submenu: [
              { role: 'about' as const },
              checkUpdatesItem,
              { type: 'separator' as const },
              muteItem,
              settingsItem,
              { type: 'separator' as const },
              { role: 'services' as const },
              { type: 'separator' as const },
              { role: 'hide' as const },
              { role: 'hideOthers' as const },
              { role: 'unhide' as const },
              { type: 'separator' as const },
              { role: 'quit' as const },
            ],
          },
        ]
      : []),
    { role: 'editMenu' },
    {
      label: 'View',
      submenu: [
        {
          label: 'Zoom In',
          accelerator: 'CmdOrCtrl+=',
          click: () => setActiveZoom(ctx, (z) => stepZoom(z, 1)),
        },
        {
          label: 'Zoom Out',
          accelerator: 'CmdOrCtrl+-',
          click: () => setActiveZoom(ctx, (z) => stepZoom(z, -1)),
        },
        {
          label: 'Actual Size',
          accelerator: 'CmdOrCtrl+0',
          click: () => setActiveZoom(ctx, () => 0),
        },
      ],
    },
    {
      label: 'Go',
      submenu: [
        {
          label: 'Home',
          accelerator: 'CmdOrCtrl+Shift+H',
          click: () => {
            ctx.win.show();
            goHome(ctx);
          },
        },
        { type: 'separator' as const },
        ...order.map((id, i) => ({
          label: serviceById(id).name,
          accelerator: serviceAccelerator(i),
          click: () => {
            ctx.win.show();
            activateService(ctx, id);
          },
        })),
        { type: 'separator' as const },
        {
          label: 'Reload Service',
          accelerator: 'CmdOrCtrl+R',
          click: () => ctx.views.refresh(ctx.state.activeId),
        },
        {
          label: 'Quick Switcher',
          accelerator: 'CmdOrCtrl+K',
          click: () => {
            setOverlayOpen(ctx, 'switcherOpen', !ctx.state.switcherOpen);
            ctx.win.webContents.focus();
          },
        },
        ...(process.platform !== 'darwin'
          ? [{ type: 'separator' as const }, muteItem, checkUpdatesItem, settingsItem]
          : []),
      ],
    },
    { role: 'windowMenu' },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}
