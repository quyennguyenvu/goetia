/** Goetia's chords, declared once. Main builds the app menu from this table
 *  and intercepts the same chords in every service view (`main/lib/shortcuts.ts`);
 *  Settings → Shortcuts renders its list from it, so what the pane shows is
 *  what the keys do. Home and Pin Selection sit on the left half of the
 *  keyboard on purpose (2026-08-28, user decision): both are pressed while
 *  the right hand is on the mouse, selecting text or aiming at a tile. */
export const ACCELERATORS = {
  home: 'CmdOrCtrl+Shift+G',
  pinSelection: 'CmdOrCtrl+Shift+S',
  /** left half too: Settings → Downloads, this session's files */
  downloads: 'CmdOrCtrl+Shift+D',
  switcher: 'CmdOrCtrl+K',
  /** the browser's next/previous-tab chords, walking only tiles with unread */
  nextUnread: 'CmdOrCtrl+Shift+]',
  prevUnread: 'CmdOrCtrl+Shift+[',
  mute: 'CmdOrCtrl+Shift+M',
  /** left half like Home and Pin: reached one-handed on the way out the door */
  lock: 'CmdOrCtrl+Shift+L',
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

/** The chords the user may change from Settings → Shortcuts. Everything
 *  else — service numbers, ⌘, ⌘R/F5, zoom, ⌘F, dev tools, Esc — is an OS or
 *  browser convention and stays a constant. (2026-09-23, user decision.) */
export const REBINDABLE = [
  'switcher',
  'nextUnread',
  'prevUnread',
  'home',
  'downloads',
  'pinSelection',
  'mute',
  'lock',
] as const;
export type RebindableId = (typeof REBINDABLE)[number];
/** overrides only — a missing id means the default; every value canonical */
export type ShortcutOverrides = Partial<Record<RebindableId, string>>;
/** the table every consumer reads: defaults with overrides laid over */
export type Accelerators = {
  -readonly [K in keyof typeof ACCELERATORS]: K extends 'reload' ? readonly string[] : string;
};
/** what a refusal names: "taken by Quick Switcher" */
export const SHORTCUT_LABELS: Record<RebindableId, string> = {
  switcher: 'Quick Switcher',
  nextUnread: 'Next Unread',
  prevUnread: 'Previous Unread',
  home: 'Home',
  downloads: 'Downloads',
  pinSelection: 'Pin Selection',
  mute: 'Mute All Notifications',
  lock: 'Lock Goetia',
};

export function isRebindable(v: unknown): v is RebindableId {
  return typeof v === 'string' && (REBINDABLE as readonly string[]).includes(v);
}

export function resolveAccelerators(overrides: ShortcutOverrides | undefined): Accelerators {
  const out: Accelerators = { ...ACCELERATORS };
  if (!overrides) return out;
  for (const id of REBINDABLE) {
    const v = overrides[id];
    if (typeof v === 'string' && v !== '') out[id] = v;
  }
  return out;
}

export type RecordFailure = 'modifier' | 'reserved' | 'taken' | 'pair' | 'cancelled';
/** main's answer to shortcuts:record; `patch` holds one id, or both halves
 *  of the unread pair, and is empty when the chord already was the row's */
export type RecordResult =
  | { ok: true; patch: ShortcutOverrides }
  | { ok: false; reason: RecordFailure; chord?: string; takenBy?: RebindableId };
