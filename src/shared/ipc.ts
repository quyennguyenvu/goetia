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
  'settings:update': Partial<Settings>;
  'badge:overlay': { dataUrl: string | null; count: number };
  'unread:update': { serviceId: ServiceId } & Counts;
  'unread:stale': { serviceId: ServiceId };
  'notification:fired': { serviceId: ServiceId; title: string; body: string };
  'service:keepalive-click': { serviceId: ServiceId; x: number; y: number };
}

/** main -> shell renderer, via webContents.send */
export interface MainToRenderer {
  'shell:state': ShellState;
}

export const R2M_CHANNELS = [
  'service:activate',
  'service:setMuted',
  'service:reorder',
  'service:reload',
  'global:setMuted',
  'switcher:setOpen',
  'settings:setOpen',
  'settings:update',
  'badge:overlay',
  'unread:update',
  'unread:stale',
  'notification:fired',
  'service:keepalive-click',
] as const satisfies readonly (keyof RendererToMain)[];
