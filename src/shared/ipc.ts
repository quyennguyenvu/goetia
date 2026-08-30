import type {
  ActivityEntryView,
  Counts,
  PasskeyView,
  ServiceId,
  Settings,
  ShellState,
} from './types';
import type {
  WireCreateOptions,
  WireCreateResult,
  WireGetOptions,
  WireGetResult,
  WireResult,
} from './webauthn';

/** renderer/preload -> main, via ipcRenderer.send */
export interface RendererToMain {
  'service:activate': { serviceId: ServiceId };
  'service:setMuted': { serviceId: ServiceId; muted: boolean };
  'service:reorder': { orderedIds: ServiceId[] };
  'service:reload': { serviceId: ServiceId };
  /** right-click on a rail tile: main pops the native per-service menu */
  'service:tileMenu': { serviceId: ServiceId };
  /** Settings → Services row: wipe the service's login on this device */
  'service:purgeLogin': { serviceId: ServiceId };
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
  /** open a recents row: main resolves the stored entry and re-validates */
  'activity:open': { entryId: number };
  /** Home's pinboard. All shell-only; ids are opaque handles into PinStore
   *  and hrefs never cross IPC — main re-validates at open time. */
  'pins:reorder': { ids: number[] };
  'pins:unpin': { id: number };
  /** undo the most recent unpin/Done */
  'pins:restore': { id: number };
  'pins:setNote': { id: number; note: string };
  'pins:open': { id: number };
  /** a recipe asks for a trusted click at a point in its own view: keep-alive
   *  buttons and Zalo's conversation rows ignore synthetic events */
  'service:trusted-click': { serviceId: ServiceId; x: number; y: number };
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
  'notification:openConversation': { href: string; url: string; conversation?: string };
}

export const R2M_CHANNELS = [
  'service:activate',
  'service:setMuted',
  'service:reorder',
  'service:reload',
  'service:tileMenu',
  'service:purgeLogin',
  'global:setMuted',
  'switcher:setOpen',
  'settings:setOpen',
  'home:setOpen',
  'settings:update',
  'badge:overlay',
  'unread:update',
  'unread:stale',
  'notification:fired',
  'activity:open',
  'pins:reorder',
  'pins:unpin',
  'pins:restore',
  'pins:setNote',
  'pins:open',
  'service:trusted-click',
  'service:ready',
  'updates:check',
  'updates:openDownload',
] as const satisfies readonly (keyof RendererToMain)[];

/** renderer -> main round-trips, via ipcRenderer.invoke. `payload` is what
 *  the sender passes; channels without one are invoked bare. */
export interface RendererInvoke {
  /** recents for the quick switcher: fetched once per open, never broadcast */
  'activity:recent': { result: ActivityEntryView[] };
  /** Home's sweep: wipes every service's login, summoned and unbound.
   *  Returns the count so the renderer can toast it — invoke rather than
   *  send because the confirm is modal and the wipes are async, and a
   *  one-shot acknowledgement has no business in every later broadcast. */
  'services:purgeAll': { result: { purged: number } };
  /** the service preload's WebAuthn shim: main runs the ceremony and answers
   *  with the signed material or the DOMException name to raise. Origin is
   *  read off the sending frame, never carried here. */
  'webauthn:create': {
    payload: { serviceId: ServiceId; options: WireCreateOptions };
    result: WireResult<WireCreateResult>;
  };
  'webauthn:get': {
    payload: { serviceId: ServiceId; options: WireGetOptions };
    result: WireResult<WireGetResult>;
  };
  /** Settings → Passkeys: fetched when the pane opens, never broadcast; the
   *  mutations return the fresh list so the pane never races a send. */
  'passkeys:list': { result: PasskeyView[] };
  'passkeys:forget': { payload: { id: string }; result: PasskeyView[] };
  'passkeys:restore': { payload: { id: string }; result: PasskeyView[] };
}

export type InvokePayload<C extends keyof RendererInvoke> = RendererInvoke[C] extends {
  payload: infer P;
}
  ? P
  : undefined;

export const INVOKE_CHANNELS = [
  'activity:recent',
  'services:purgeAll',
  'webauthn:create',
  'webauthn:get',
  'passkeys:list',
  'passkeys:forget',
  'passkeys:restore',
] as const satisfies readonly (keyof RendererInvoke)[];

/** Channels only the trusted shell renderer may send. Everything else is a
 *  service-preload channel carrying its own serviceId. */
export const SHELL_ONLY_CHANNELS = new Set<keyof RendererToMain | keyof RendererInvoke>([
  'service:activate',
  'service:setMuted',
  'service:reorder',
  'service:reload',
  'service:tileMenu',
  'service:purgeLogin',
  'global:setMuted',
  'switcher:setOpen',
  'settings:setOpen',
  'home:setOpen',
  'settings:update',
  'badge:overlay',
  'updates:check',
  'updates:openDownload',
  'activity:open',
  'activity:recent',
  'services:purgeAll',
  'passkeys:list',
  'passkeys:forget',
  'passkeys:restore',
  'pins:reorder',
  'pins:unpin',
  'pins:restore',
  'pins:setNote',
  'pins:open',
]);
