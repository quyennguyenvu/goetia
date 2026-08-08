export type ServiceId =
  | 'messenger'
  | 'telegram'
  | 'zalo'
  | 'whatsapp'
  | 'discord'
  | 'tiktok'
  | 'shopee';

export type Theme = 'light' | 'dark';
export type Surface = 'welcome' | 'rail' | 'switcher' | 'settings' | 'waking';

export interface Shot {
  stem: string;
  surface: Surface;
  enabled: ServiceId[];
  muted?: ServiceId[];
  theme: Theme;
}

export interface SeededSettings {
  theme: Theme;
  railPosition: 'top';
  disabled: Record<ServiceId, boolean>;
  muted: Record<ServiceId, boolean>;
  neverHibernate: Record<ServiceId, boolean>;
}

export const ALL_SERVICE_IDS: ServiceId[];
export const THEMES: Theme[];
export const SHOTS: Shot[];
export function settingsFor(shot: Shot): SeededSettings;
