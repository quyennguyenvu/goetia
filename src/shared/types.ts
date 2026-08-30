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

/** What the switcher renders per recent conversation. Deliberately hrefless:
 *  conversation links never cross IPC — main re-validates at open time. */
export interface ActivityEntryView {
  id: number;
  serviceId: ServiceId;
  title: string;
  /** mute or quiet hours suppressed the banner itself at fire time (🌙) */
  silenced: boolean;
  at: number;
}

/** What Home renders per pin. Hrefless like ActivityEntryView: the
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

export interface Settings {
  order: ServiceId[];
  muted: Record<ServiceId, boolean>;
  disabled: Record<ServiceId, boolean>; // no tile, no view, no network
  globalMuted: boolean;
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
  /** scheduled global mute: window + active days; see lib/quiet-hours-rules */
  quietHours: QuietHoursSchedule;
  /** start (epoch ms) of the one window the user dismissed by unmuting */
  quietOverrideWindowStart: number | null;
  /** system-wide show/hide shortcut; accelerator must be one of SUMMON_COMBOS */
  summonHotkey: { enabled: boolean; accelerator: string };
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
  quietHours: {
    enabled: false,
    start: '22:00',
    end: '07:00',
    days: [true, true, true, true, true, true, true],
  },
  quietOverrideWindowStart: null,
  summonHotkey: { enabled: false, accelerator: 'Alt+CmdOrCtrl+G' },
  closeToTray: true,
  launchAtLogin: false,
  theme: 'system',
  railPosition: 'top',
  checkForUpdates: true,
  lastNotifiedVersion: null,
  lastActiveId: null,
  lastHomeOpen: false,
};

export interface ServiceRuntime {
  unread: Counts;
  hibernated: boolean;
  crashed: boolean;
  stale: boolean; // recipe failed; counts may be outdated
  loading: boolean;
  waking: boolean; // loading screen covers this service
}

export interface ShellState {
  services: ServiceMeta[]; // in user order
  activeId: ServiceId;
  runtime: Record<ServiceId, ServiceRuntime>;
  muted: Record<ServiceId, boolean>;
  globalMuted: boolean;
  /** quiet-hours engaged right now (manual override already applied) */
  quietActive: boolean;
  /** false while an enabled summon combo failed to register (owned elsewhere) */
  summonHotkeyOk: boolean;
  switcherOpen: boolean;
  settingsOpen: boolean;
  homeOpen: boolean;
  /** ids the summon cap banished at startup; the shell toasts them once */
  capTrimmed: ServiceId[];
  /** the pinboard in priority order; pins[0] is the one in progress */
  pins: PinView[];
  theme: 'light' | 'dark'; // effective theme (system already resolved)
  settings: Settings; // raw preferences, for the settings form
  version: string;
  update: UpdateState;
}
