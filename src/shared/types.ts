export type ServiceId =
  | 'whatsapp'
  | 'messenger'
  | 'instagram'
  | 'telegram'
  | 'discord'
  | 'zalo'
  | 'tiktok'
  | 'shopee'
  | 'slack';

export interface Counts {
  direct: number;
  indirect: number;
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
  /** Loaded instead of `url` the very first time the service's view is
   *  created (Settings.visited), then never again — for sites whose default
   *  logged-out landing is hostile to first-timers (slack's workspace-first
   *  signin). Reload and every later launch use `url`. */
  firstRunUrl?: string;
  /** Disable background throttling so the page never sees itself as hidden.
   *  For sites that suspend/unmount their UI when backgrounded (Zalo). */
  keepRendered?: boolean;
  /** The recipe defines ready(); did-finish-load must not clear the
   *  waking cover — only ready, crash, destroy, or the timeout do. */
  waitForReady?: boolean;
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
  /** The service's view has been created at least once; the first creation
   *  loads ServiceMeta.firstRunUrl when one is declared. */
  visited: Record<ServiceId, boolean>;
  hibernationMinutes: number;
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
  },
  globalMuted: false,
  notificationSound: true,
  neverHibernate: {
    whatsapp: true,
    messenger: true,
    instagram: true,
    telegram: true,
    discord: true,
    zalo: true,
    tiktok: true,
    shopee: true,
    slack: true,
  },
  visited: {
    whatsapp: false,
    messenger: false,
    instagram: false,
    telegram: false,
    discord: false,
    zalo: false,
    tiktok: false,
    shopee: false,
    slack: false,
  },
  hibernationMinutes: 30,
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
  switcherOpen: boolean;
  settingsOpen: boolean;
  homeOpen: boolean;
  theme: 'light' | 'dark'; // effective theme (system already resolved)
  settings: Settings; // raw preferences, for the settings form
  version: string;
  update: UpdateState;
}
