/** Goetia's chords, declared once. Main builds the app menu from this table
 *  and intercepts the same chords in every service view (`main/lib/shortcuts.ts`);
 *  Settings → Shortcuts renders its list from it, so what the pane shows is
 *  what the keys do. Home and Pin Selection sit on the left half of the
 *  keyboard on purpose (2026-08-28, user decision): both are pressed while
 *  the right hand is on the mouse, selecting text or aiming at a tile. */
export const ACCELERATORS = {
  home: 'CmdOrCtrl+Shift+G',
  pinSelection: 'CmdOrCtrl+Shift+S',
  switcher: 'CmdOrCtrl+K',
  mute: 'CmdOrCtrl+Shift+M',
  settings: 'CmdOrCtrl+,',
  /** F5 is the browser habit; the menu shows the first */
  reload: ['CmdOrCtrl+R', 'F5'],
  zoomIn: 'CmdOrCtrl+=',
  zoomOut: 'CmdOrCtrl+-',
  zoomReset: 'CmdOrCtrl+0',
  /** Home's search field — handled by the shell, not intercepted in views */
  findService: 'CmdOrCtrl+F',
} as const;

/** Electron's own toggleDevTools bindings, per platform */
export function devtoolsAccelerator(platform: string): string {
  return platform === 'darwin' ? 'Alt+CmdOrCtrl+I' : 'Ctrl+Shift+I';
}
