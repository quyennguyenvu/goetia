import { Menu } from 'electron';
import { serviceById } from '../shared/services';
import type { AppContext } from './ipc-handlers';

export function buildAppMenu(ctx: AppContext): void {
  const s = ctx.settings.get();
  const order = s.order.filter((id) => !s.disabled[id]);
  const template: Electron.MenuItemConstructorOptions[] = [
    ...(process.platform === 'darwin' ? [{ role: 'appMenu' as const }] : []),
    { role: 'editMenu' },
    {
      label: 'Go',
      submenu: [
        ...order.map((id, i) => ({
          label: serviceById(id).name,
          accelerator: `CmdOrCtrl+${i + 1}`,
          click: () => {
            ctx.win.show();
            ctx.state.activeId = id;
            ctx.state.setRuntime(id, { hibernated: false });
            ctx.noteActivated(id);
            ctx.views.activate(id);
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
      ],
    },
    { role: 'windowMenu' },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}
