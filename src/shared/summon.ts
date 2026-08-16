/** Curated system-wide accelerators — combos apps rarely claim locally, so a
 *  global registration doesn't shadow common in-app shortcuts. */
export const SUMMON_COMBOS = [
  'Alt+CmdOrCtrl+G',
  'Alt+CmdOrCtrl+Space',
  'Ctrl+Shift+Space',
  'Ctrl+Shift+G',
] as const;

const MAC_GLYPHS: Record<string, string> = { Ctrl: '⌃', Alt: '⌥', Shift: '⇧', CmdOrCtrl: '⌘' };
const MAC_ORDER = ['Ctrl', 'Alt', 'Shift', 'CmdOrCtrl'];
const WIN_NAMES: Record<string, string> = {
  Ctrl: 'Ctrl',
  Alt: 'Alt',
  Shift: 'Shift',
  CmdOrCtrl: 'Ctrl',
};
const WIN_ORDER = ['CmdOrCtrl', 'Ctrl', 'Alt', 'Shift'];

/** '⌥⌘G' on macOS, 'Ctrl+Alt+G' elsewhere — each platform's conventional
 *  modifier order, key last. */
export function comboLabel(accelerator: string, isMac: boolean): string {
  const parts = accelerator.split('+');
  const mods = parts.filter((p) => p in MAC_GLYPHS);
  const keys = parts.filter((p) => !(p in MAC_GLYPHS));
  const order = isMac ? MAC_ORDER : WIN_ORDER;
  mods.sort((a, b) => order.indexOf(a) - order.indexOf(b));
  return isMac
    ? [...mods.map((m) => MAC_GLYPHS[m]), ...keys].join('')
    : [...mods.map((m) => WIN_NAMES[m]), ...keys].join('+');
}
