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
  /** `synthetic`: the recipe built this because the site notifies nowhere
   *  in-page, so no page sound accompanied it — see soundOptions.
   *  `clickId`: shim registry id for replaying the page's own click handler.
   *  `href`: synthetic banners' conversation link (validated in main). */
  'notification:fired': {
    serviceId: ServiceId;
    title: string;
    body: string;
    synthetic: boolean;
    clickId?: number;
    href?: string;
  };
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

/** main -> service view preload, via webContents.send */
export interface MainToService {
  'notification:replayClick': { clickId: number };
  /** banner click on a live view: route to the thread in-page (anchor click),
   *  falling back to a full navigation to `url` if the anchor is gone */
  'notification:openConversation': { href: string; url: string };
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
