import { app, Menu } from 'electron';
import { serviceById } from '../shared/services';
import { openSettings, runShellCommand } from './commands';
import type { AppContext } from './ipc-handlers';
import { serviceAccelerator } from './lib/service-accelerator';
import { ACCELERATORS, devtoolsAccelerator } from './lib/shortcuts';

// Every chord here is also intercepted inside the service views
// (lib/shortcuts.ts), so items only name the command; commands.ts runs it.
export function buildAppMenu(ctx: AppContext): void {
  const s = ctx.settings.get();
  const order = s.order.filter((id) => !s.disabled[id]);
  const run = (command: Parameters<typeof runShellCommand>[1]) => () =>
    runShellCommand(ctx, command);
  const settingsItem: Electron.MenuItemConstructorOptions = {
    label: 'Settings…',
    accelerator: ACCELERATORS.settings,
    click: run({ kind: 'settings' }),
  };
  const muteItem: Electron.MenuItemConstructorOptions = {
    label: 'Mute All Notifications',
    accelerator: ACCELERATORS.mute,
    type: 'checkbox',
    checked: s.globalMuted || ctx.quietNow(),
    click: run({ kind: 'mute' }),
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
    {
      // spelled out rather than role: 'editMenu' so Pin Selection can sit
      // with the other selection verbs
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        ...(process.platform === 'darwin'
          ? [{ role: 'pasteAndMatchStyle' as const }, { role: 'delete' as const }]
          : []),
        { role: 'selectAll' },
        { type: 'separator' },
        {
          // the second way in, for pages that own right-click (Discord)
          label: 'Pin Selection',
          accelerator: ACCELERATORS.pinSelection,
          click: run({ kind: 'pin-selection' }),
        },
      ],
    },
    {
      label: 'View',
      submenu: [
        {
          label: 'Zoom In',
          accelerator: ACCELERATORS.zoomIn,
          click: run({ kind: 'zoom', step: 1 }),
        },
        {
          label: 'Zoom Out',
          accelerator: ACCELERATORS.zoomOut,
          click: run({ kind: 'zoom', step: -1 }),
        },
        {
          label: 'Actual Size',
          accelerator: ACCELERATORS.zoomReset,
          click: run({ kind: 'zoom', step: 0 }),
        },
        { type: 'separator' },
        {
          // the service page on screen, or the shell surface covering it
          label: 'Toggle Developer Tools',
          accelerator: devtoolsAccelerator(process.platform),
          click: run({ kind: 'devtools' }),
        },
      ],
    },
    {
      label: 'Go',
      submenu: [
        { label: 'Home', accelerator: ACCELERATORS.home, click: run({ kind: 'home' }) },
        { type: 'separator' as const },
        ...order.map((id, index) => ({
          label: serviceById(id).name,
          accelerator: serviceAccelerator(index),
          click: run({ kind: 'service', index }),
        })),
        { type: 'separator' as const },
        {
          label: 'Reload Service',
          accelerator: ACCELERATORS.reload[0],
          click: run({ kind: 'reload' }),
        },
        {
          label: 'Quick Switcher',
          accelerator: ACCELERATORS.switcher,
          click: run({ kind: 'switcher' }),
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
