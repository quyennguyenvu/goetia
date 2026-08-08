import { app, Menu } from 'electron';
import { serviceById } from '../shared/services';
import { activateService } from './activate';
import type { AppContext } from './ipc-handlers';

function openSettings(ctx: AppContext): void {
  ctx.state.settingsOpen = true;
  ctx.views.hideActive();
  ctx.state.touch();
  ctx.win.webContents.focus(); // so Escape closes the modal immediately
}

export function buildAppMenu(ctx: AppContext): void {
  const s = ctx.settings.get();
  const order = s.order.filter((id) => !s.disabled[id]);
  const settingsItem: Electron.MenuItemConstructorOptions = {
    label: 'Settings…',
    accelerator: 'CmdOrCtrl+,',
    click: () => openSettings(ctx),
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
      label: 'Go',
      submenu: [
        ...order.map((id, i) => ({
          label: serviceById(id).name,
          accelerator: `CmdOrCtrl+${i + 1}`,
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
            const open = !ctx.state.switcherOpen;
            ctx.state.switcherOpen = open;
            if (open) ctx.views.hideActive();
            else ctx.views.showActive();
            ctx.state.touch();
            ctx.win.webContents.focus();
          },
        },
        ...(process.platform !== 'darwin'
          ? [{ type: 'separator' as const }, checkUpdatesItem, settingsItem]
          : []),
      ],
    },
    { role: 'windowMenu' },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}
