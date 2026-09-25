import { app, Menu } from 'electron';
import { serviceById } from '../shared/services';
import { resolveAccelerators } from '../shared/shortcuts';
import { openSettings, runShellCommand } from './commands';
import { globalMuteMenuTemplate } from './global-mute-menu';
import type { AppContext } from './ipc-handlers';
import { serviceAccelerator } from './lib/service-accelerator';
import { devtoolsAccelerator } from './lib/shortcuts';

// Every chord here is also intercepted inside the service views
// (lib/shortcuts.ts), so items only name the command; commands.ts runs it.
export function buildAppMenu(ctx: AppContext): void {
  const s = ctx.settings.get();
  const order = s.order.filter((id) => !s.disabled[id]);
  const acc = resolveAccelerators(s.shortcuts);
  const run = (command: Parameters<typeof runShellCommand>[1]) => () =>
    runShellCommand(ctx, command);
  const settingsItem: Electron.MenuItemConstructorOptions = {
    label: 'Settings…',
    accelerator: acc.settings,
    click: run({ kind: 'settings' }),
  };
  const muteItem = globalMuteMenuTemplate(ctx, {
    toggle: run({ kind: 'mute' }),
    guarded: true,
    accelerator: acc.mute,
  });
  const lockItem: Electron.MenuItemConstructorOptions = {
    label: 'Lock Goetia',
    accelerator: acc.lock,
    enabled: s.appLock.enabled && ctx.lock.configured(),
    click: run({ kind: 'lock' }),
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
              lockItem,
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
          accelerator: acc.pinSelection,
          click: run({ kind: 'pin-selection' }),
        },
      ],
    },
    {
      label: 'View',
      submenu: [
        {
          label: 'Zoom In',
          accelerator: acc.zoomIn,
          click: run({ kind: 'zoom', step: 1 }),
        },
        {
          label: 'Zoom Out',
          accelerator: acc.zoomOut,
          click: run({ kind: 'zoom', step: -1 }),
        },
        {
          label: 'Actual Size',
          accelerator: acc.zoomReset,
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
        { label: 'Home', accelerator: acc.home, click: run({ kind: 'home' }) },
        { type: 'separator' as const },
        ...order.map((id, index) => ({
          label: serviceById(id).name,
          accelerator: serviceAccelerator(index),
          click: run({ kind: 'service', index }),
        })),
        { type: 'separator' as const },
        {
          label: 'Reload Service',
          accelerator: acc.reload[0],
          click: run({ kind: 'reload' }),
        },
        {
          label: 'Quick Switcher',
          accelerator: acc.switcher,
          click: run({ kind: 'switcher' }),
        },
        {
          label: 'Next Conversation',
          accelerator: acc.nextConversation,
          click: run({ kind: 'conversation', step: 1 }),
        },
        {
          label: 'Previous Conversation',
          accelerator: acc.prevConversation,
          click: run({ kind: 'conversation', step: -1 }),
        },
        {
          label: 'Downloads',
          accelerator: acc.downloads,
          click: run({ kind: 'downloads' }),
        },
        ...(process.platform !== 'darwin'
          ? [{ type: 'separator' as const }, muteItem, lockItem, checkUpdatesItem, settingsItem]
          : []),
      ],
    },
    { role: 'windowMenu' },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}
