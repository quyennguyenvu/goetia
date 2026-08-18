/** ⌘/Ctrl+0 is zoom's Actual Size and ⌘/Ctrl+⇧+H is Home, so services take
 *  1…9 — and stop there. Electron's
 *  accelerator parser has no key for a multi-digit string: `globalShortcut`
 *  throws a conversion failure on `CmdOrCtrl+10`, while `Menu.buildFromTemplate`
 *  accepts it silently and never binds it. A tenth enabled service would get a
 *  menu item advertising a shortcut that does nothing, so it gets none. */
export const MAX_SERVICE_ACCELERATORS = 9;

export function serviceAccelerator(index: number): string | undefined {
  return index < MAX_SERVICE_ACCELERATORS ? `CmdOrCtrl+${index + 1}` : undefined;
}
