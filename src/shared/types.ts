export type ServiceId = 'whatsapp' | 'messenger' | 'telegram' | 'discord' | 'zalo' | 'shopee';

export interface Counts {
  direct: number;
  indirect: number;
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
}

export type ThemePref = 'system' | 'light' | 'dark';

export type RailPosition = 'top' | 'left' | 'right';

export interface Settings {
  order: ServiceId[];
  muted: Record<ServiceId, boolean>;
  disabled: Record<ServiceId, boolean>; // no tile, no view, no network
  globalMuted: boolean;
  neverHibernate: Record<ServiceId, boolean>;
  hibernationMinutes: number;
  closeToTray: boolean;
  launchAtLogin: boolean;
  theme: ThemePref;
  railPosition: RailPosition;
}

export const DEFAULT_SETTINGS: Settings = {
  order: ['messenger', 'telegram', 'zalo', 'whatsapp', 'discord', 'shopee'],
  muted: {
    whatsapp: false,
    messenger: false,
    telegram: false,
    discord: false,
    zalo: false,
    shopee: false,
  },
  disabled: {
    whatsapp: true,
    messenger: false,
    telegram: true,
    discord: true,
    zalo: false,
    shopee: true,
  },
  globalMuted: false,
  neverHibernate: {
    whatsapp: true,
    messenger: true,
    telegram: true,
    discord: true,
    zalo: true,
    shopee: true,
  },
  hibernationMinutes: 30,
  closeToTray: true,
  launchAtLogin: false,
  theme: 'system',
  railPosition: 'top',
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
  theme: 'light' | 'dark'; // effective theme (system already resolved)
  settings: Settings; // raw preferences, for the settings form
  version: string;
}
