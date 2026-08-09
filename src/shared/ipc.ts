import type { Counts, ServiceId, Settings, ShellState } from './types';

/** renderer/preload -> main, via ipcRenderer.send */
export interface RendererToMain {
  'service:activate': { serviceId: ServiceId };
  'service:setMuted': { serviceId: ServiceId; muted: boolean };
  'service:reorder': { orderedIds: ServiceId[] };
  'service:reload': { serviceId: ServiceId };
  'global:setMuted': { muted: boolean };
  'switcher:setOpen': { open: boolean };
  'settings:setOpen': { open: boolean };
  'home:setOpen': { open: boolean };
  'settings:update': Partial<Settings>;
  'badge:overlay': { dataUrl: string | null; count: number };
  'unread:update': { serviceId: ServiceId } & Counts;
  'unread:stale': { serviceId: ServiceId };
  'notification:fired': { serviceId: ServiceId; title: string; body: string };
  'service:keepalive-click': { serviceId: ServiceId; x: number; y: number };
  'service:ready': { serviceId: ServiceId };
  'updates:check': Record<string, never>;
  'updates:openDownload': Record<string, never>;
}

/** main -> shell renderer, via webContents.send */
export interface MainToRenderer {
  'shell:state': ShellState;
  /** main -> loading overlay page */
  'loading:state': { theme: 'light' | 'dark'; serviceName: string };
}

export const R2M_CHANNELS = [
  'service:activate',
  'service:setMuted',
  'service:reorder',
  'service:reload',
  'global:setMuted',
  'switcher:setOpen',
  'settings:setOpen',
  'home:setOpen',
  'settings:update',
  'badge:overlay',
  'unread:update',
  'unread:stale',
  'notification:fired',
  'service:keepalive-click',
  'service:ready',
  'updates:check',
  'updates:openDownload',
] as const satisfies readonly (keyof RendererToMain)[];

/** Channels only the trusted shell renderer may send. Everything else is a
 *  service-preload channel carrying its own serviceId. */
export const SHELL_ONLY_CHANNELS = new Set<keyof RendererToMain>([
  'service:activate',
  'service:setMuted',
  'service:reorder',
  'service:reload',
  'global:setMuted',
  'switcher:setOpen',
  'settings:setOpen',
  'home:setOpen',
  'settings:update',
  'badge:overlay',
  'updates:check',
  'updates:openDownload',
]);
