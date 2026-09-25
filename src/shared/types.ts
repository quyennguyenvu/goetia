import type { ShortcutOverrides } from './shortcuts';

export type ServiceId =
  | 'whatsapp'
  | 'messenger'
  | 'instagram'
  | 'telegram'
  | 'discord'
  | 'zalo'
  | 'tiktok'
  | 'shopee'
  | 'slack'
  | 'teams';

export interface Counts {
  direct: number;
  indirect: number;
}

/** What Home renders per pin. Hrefless like RecentView: the
 *  conversation URL stays in main and is re-validated at open time. */
export interface PinView {
  id: number;
  serviceId: ServiceId;
  /** the captured selection — the "message" */
  text: string;
  /** the user's brief description, '' until edited */
  note: string;
  /** the conversation the message was pinned in, best-effort from the page
   *  title; '' when the title carried nothing beyond the service's name */
  conversation: string;
  at: number;
}

/** A Settings → Passkeys row. Never carries key material. */
export interface PasskeyView {
  /** base64url credential id — the opaque handle forget/restore use */
  id: string;
  rpId: string;
  /** displayName, else userName, else a placeholder */
  account: string;
  /** the service whose view minted it — display only */
  createdIn: ServiceId;
  createdAt: number;
  lastUsedAt: number;
}

export type UpdateStatus = 'idle' | 'checking' | 'current' | 'available' | 'error';

export interface UpdateState {
  status: UpdateStatus;
  /** newest release seen; drives the gear dot and the Updates section */
  latest: string | null;
  /** version the shell should toast now; held back while the window is hidden */
  announce: string | null;
}

/** Settings → Diagnostics: one evidence line or runtime transition main
 *  recorded. Composed main-side from ids and states only — never a title,
 *  body, filename or pin — and stored in a bounded in-memory ring. */
export type DiagTag =
  | 'app'
  | 'nav'
  | 'open'
  | 'identity'
  | 'passkey'
  | 'lock'
  | 'ipc'
  | 'notifications'
  | 'downloads'
  | 'recipe'
  | 'view'
  | 'peek'
  | 'recents';

export interface DiagEntry {
  at: number;
  tag: DiagTag;
  serviceId?: ServiceId;
  line: string;
}

/** which Settings pane a main-side command asked for */
export interface SettingsFocus {
  section: 'downloads';
  seq: number;
}

export type DownloadState = 'downloading' | 'saved' | 'failed' | 'missing';

/** How downloads.json rests: sealed by the keychain, plaintext because there
 *  is none, or sealed by a keychain this launch cannot open (read-only). */
export type DownloadStorage = 'sealed' | 'plain' | 'unreadable';

/** How recents.json rests — the three states downloads.json has. */
export type RecentsStorage = DownloadStorage;

/** What the switcher renders per recent conversation. Hrefless like PinView:
 *  the URL stays in main and is re-validated at open time. */
export interface RecentView {
  id: number;
  serviceId: ServiceId;
  /** the conversation's label — the row's text and the search haystack */
  title: string;
  /** last time it was on screen */
  at: number;
}

/** One row of Settings → Downloads. No path: the pane needs none, and a path
 *  is where a later feature would be tempted to open something. */
export interface DownloadView {
  id: number;
  serviceId: ServiceId;
  filename: string;
  /** `missing`: saved, but the file was gone when the list was fetched */
  state: DownloadState;
  received: number;
  /** 0 when unknown */
  total: number;
  /** epoch ms the download started */
  at: number;
}

export interface ServiceMeta {
  id: ServiceId;
  name: string;
  url: string;
  color: string; // brand color, rail tile bg tint
  /** Disable background throttling so the page never sees itself as hidden.
   *  For sites that suspend/unmount their UI when backgrounded (Zalo). */
  keepRendered?: boolean;
  /** The recipe defines ready(); did-finish-load must not clear the
   *  waking cover — only ready, crash, destroy, or the timeout do. */
  waitForReady?: boolean;
  /** Mirror of the recipe's chatPaths (recipes.test.ts enforces sync) — main
   *  validates banner hrefs against it without importing preload code. */
  chatPaths?: string[];
  /** This site's banner title IS the thread's name (whatsapp, zalo), and its
   *  URL names no thread — so a recents row can be opened only by handing the
   *  title to the recipe's openConversation. Set it solely where that hook
   *  exists (recipes.test.ts enforces it); a name that matches no row is a
   *  no-op, never a wrong thread. */
  bannerTitleNamesConversation?: boolean;
}

export interface QuietHoursSchedule {
  enabled: boolean;
  /** 'HH:MM', 24h local wall-clock */
  start: string;
  /** 'HH:MM'; end < start crosses midnight; end === start is an empty window */
  end: string;
  /** indexed by Date.getDay(): 0 = Sunday … 6 = Saturday */
  days: [boolean, boolean, boolean, boolean, boolean, boolean, boolean];
}

export type ThemePref = 'system' | 'light' | 'dark';

export type RailPosition = 'top' | 'left' | 'right';

/** The concerns the action guard is switched by, in the Lock pane's order.
 *  Defined here rather than in lock.ts because appLock.guard is a Settings
 *  field and lock.ts already imports from this file. */
export const GUARD_GROUPS = ['summon', 'purge', 'downloads', 'passkeys'] as const;
export type GuardGroup = (typeof GUARD_GROUPS)[number];

/** One switch per group — `appLock.guard`. */
export type GuardSettings = Record<GuardGroup, boolean>;

export interface Settings {
  order: ServiceId[];
  muted: Record<ServiceId, boolean>;
  /** epoch ms when a timed mute ends, 0 for none. `muted` stays the one
   *  truth every reader consults; this only tells MuteTimerController when to
   *  flip it back, and labels the menu and the tile. Every unmute zeroes it.
   *  See shared/mute.ts and the 2026-09-20 spec. */
  mutedUntil: Record<ServiceId, number>;
  disabled: Record<ServiceId, boolean>; // no tile, no view, no network
  globalMuted: boolean;
  /** epoch ms when a timed global mute ends, 0 for none — the per-service
   *  rule at the global grain: `globalMuted` stays the truth, this only tells
   *  the controller when to flip it back. A timer expiry never touches
   *  quietOverrideWindowStart. See the 2026-09-21 spec. */
  globalMutedUntil: number;
  /** Play a sound with Goetia's banner. Services that notify through the shim
   *  (Discord, WhatsApp, …) already ding in-page, so this is the second sound
   *  the user hears — turning it off leaves the page's own. */
  notificationSound: boolean;
  neverHibernate: Record<ServiceId, boolean>;
  /** Per-service Chromium zoom level (1.2^level); 0 = 100%. */
  zoom: Record<ServiceId, number>;
  hibernationMinutes: number;
  /** Auto-disable (banish) a service untouched for `hours`; opt-in. The unused
   *  clock is `lastUsedAt`, so it spans restarts and time while the app is
   *  closed. See lib/banish-rules. */
  autoBanish: { enabled: boolean; hours: number };
  /** epoch ms of each service's last activation; 0 = never. Only activation
   *  moves it — banners, badges and peeks never do. */
  lastUsedAt: Record<ServiceId, number>;
  /** Peek sleeping services on a schedule so badges and banners keep working
   *  while their views are destroyed. */
  lightSleep: boolean;
  /** Trade badge freshness for battery: peek a service less often the longer
   *  its count sits unchanged, and start at the longest interval on battery.
   *  Off by default — a staler badge is a real cost, so it is the user's call.
   *  See lib/peek-rules peekInterval. */
  peekSaver: boolean;
  /** Let a service's "Continue with Facebook" dialog reuse the session already
   *  signed in under the Messenger service, so a social login costs a consent
   *  click instead of a password and a 2FA code. On by default; off is the old
   *  behaviour exactly — nothing seeded, nothing removed, nothing touched.
   *  See main/lib/identity-share.ts and the 2026-09-01 spec. */
  shareFacebookLogin: boolean;
  /** Require Touch ID or a passcode before Goetia can be read. The secret
   *  itself lives in lock.json — never here, because ShellState broadcasts
   *  this whole object to the renderer. `touchId` is separately switchable
   *  because Touch ID accepts any finger enrolled on the Mac, which on a
   *  shared machine is exactly the person the lock is aimed at. `guard`
   *  extends the same credential to four groups of actions an unlocked Goetia
   *  would otherwise do for anyone, one switch each — `guardGroupOf` in
   *  shared/lock.ts places an action; see the 2026-09-25 spec. */
  appLock: { enabled: boolean; touchId: boolean; guard: GuardSettings };
  /** Where a file a service page downloads lands. `ask` shows the Save dialog
   *  every time; otherwise the file is saved silently into `dir`, or into the
   *  OS Downloads folder (app.getPath('downloads')) while `dir` is null — so
   *  nothing platform-specific is persisted until the user picks a folder.
   *  See main/lib/download-rules.ts and the 2026-09-18 spec. */
  downloads: { ask: boolean; dir: string | null };
  /** scheduled global mute: window + active days; see lib/quiet-hours-rules */
  quietHours: QuietHoursSchedule;
  /** start (epoch ms) of the one window the user dismissed by unmuting */
  quietOverrideWindowStart: number | null;
  /** system-wide show/hide shortcut; accelerator must be one of SUMMON_COMBOS */
  summonHotkey: { enabled: boolean; accelerator: string };
  /** the user's chords, as overrides over shared/shortcuts.ts ACCELERATORS;
   *  canonical spelling, validated by lib/shortcut-rules normalizeShortcuts */
  shortcuts: ShortcutOverrides;
  closeToTray: boolean;
  launchAtLogin: boolean;
  theme: ThemePref;
  railPosition: RailPosition;
  checkForUpdates: boolean;
  /** the version already announced; persisted so a restart never re-toasts */
  lastNotifiedVersion: string | null;
  /** service focused when the app last closed; null until first recorded */
  lastActiveId: ServiceId | null;
  /** Home was the surface on top at close — Settings deliberately is not */
  lastHomeOpen: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  order: [
    'discord',
    'instagram',
    'messenger',
    'teams',
    'shopee',
    'slack',
    'telegram',
    'tiktok',
    'whatsapp',
    'zalo',
  ],
  muted: {
    whatsapp: false,
    messenger: false,
    instagram: false,
    telegram: false,
    discord: false,
    zalo: false,
    tiktok: false,
    shopee: false,
    slack: false,
    teams: false,
  },
  // all disabled ⇒ fresh installs open on the welcome screen
  disabled: {
    whatsapp: true,
    messenger: true,
    instagram: true,
    telegram: true,
    discord: true,
    zalo: true,
    tiktok: true,
    shopee: true,
    slack: true,
    teams: true,
  },
  globalMuted: false,
  globalMutedUntil: 0,
  notificationSound: true,
  // Light Sleep keeps sleeping badges honest, so nothing needs Keep Awake
  neverHibernate: {
    whatsapp: false,
    messenger: false,
    instagram: false,
    telegram: false,
    discord: false,
    zalo: false,
    tiktok: false,
    shopee: false,
    slack: false,
    teams: false,
  },
  zoom: {
    whatsapp: 0,
    messenger: 0,
    instagram: 0,
    telegram: 0,
    discord: 0,
    zalo: 0,
    tiktok: 0,
    shopee: 0,
    slack: 0,
    teams: 0,
  },
  mutedUntil: {
    whatsapp: 0,
    messenger: 0,
    instagram: 0,
    telegram: 0,
    discord: 0,
    zalo: 0,
    tiktok: 0,
    shopee: 0,
    slack: 0,
    teams: 0,
  },
  hibernationMinutes: 30,
  autoBanish: { enabled: false, hours: 24 },
  lastUsedAt: {
    whatsapp: 0,
    messenger: 0,
    instagram: 0,
    telegram: 0,
    discord: 0,
    zalo: 0,
    tiktok: 0,
    shopee: 0,
    slack: 0,
    teams: 0,
  },
  lightSleep: true,
  peekSaver: false,
  shareFacebookLogin: true,
  appLock: {
    enabled: false,
    touchId: true,
    guard: { summon: true, purge: true, downloads: true, passkeys: true },
  },
  downloads: { ask: false, dir: null },
  quietHours: {
    enabled: false,
    start: '22:00',
    end: '07:00',
    days: [true, true, true, true, true, true, true],
  },
  quietOverrideWindowStart: null,
  summonHotkey: { enabled: false, accelerator: 'Alt+CmdOrCtrl+G' },
  shortcuts: {},
  closeToTray: true,
  launchAtLogin: false,
  theme: 'system',
  railPosition: 'top',
  checkForUpdates: true,
  lastNotifiedVersion: null,
  lastActiveId: null,
  lastHomeOpen: false,
};

/** Why main asked a view to load; names the waking cover's caption. */
export type LoadKind = 'wake' | 'reload' | 'restart' | 'purge' | 'hand-back';

export interface ServiceRuntime {
  unread: Counts;
  hibernated: boolean;
  crashed: boolean;
  stale: boolean; // recipe failed; counts may be outdated
  loading: boolean;
  waking: boolean; // loading screen covers this service
  wakeKind: LoadKind | null; // which load the cover names; read only while waking
}

export interface ShellState {
  services: ServiceMeta[]; // in user order
  activeId: ServiceId;
  runtime: Record<ServiceId, ServiceRuntime>;
  muted: Record<ServiceId, boolean>;
  /** timed-mute expiries, for the tile tooltip; see Settings.mutedUntil */
  mutedUntil: Record<ServiceId, number>;
  globalMuted: boolean;
  /** timed global-mute expiry, for the bell tooltip; see Settings.globalMutedUntil */
  globalMutedUntil: number;
  /** quiet-hours engaged right now (manual override already applied) */
  quietActive: boolean;
  /** false while an enabled summon combo failed to register (owned elsewhere) */
  summonHotkeyOk: boolean;
  switcherOpen: boolean;
  settingsOpen: boolean;
  homeOpen: boolean;
  /** a main-side command asked Settings to open on a pane; `seq` makes a
   *  repeat press land again while Settings is already open. Cleared when
   *  Settings closes. */
  settingsFocus: SettingsFocus | null;
  /** the lock screen is up; every other surface is behind it */
  locked: boolean;
  /** a passcode is set — what the Lock pane's rows depend on */
  lockConfigured: boolean;
  /** this machine can prompt Touch ID, as of the last sample */
  touchIdAvailable: boolean;
  /** ids the summon cap banished at startup; the shell toasts them once */
  capTrimmed: ServiceId[];
  /** the pinboard in priority order; pins[0] is the one in progress */
  pins: PinView[];
  /** pins.json is sealed but the keychain would not open it this boot: the
   *  board is empty and read-only until a launch where it does. False while
   *  locked, like `pins` is emptied. */
  pinsUnreadable: boolean;
  theme: 'light' | 'dark'; // effective theme (system already resolved)
  settings: Settings; // raw preferences, for the settings form
  version: string;
  update: UpdateState;
}
