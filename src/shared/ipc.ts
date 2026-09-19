import type {
  ConsentRequest,
  LockConfigResult,
  LockConfigure,
  UnlockRequest,
  UnlockResult,
} from './lock';
import type {
  ActivityEntryView,
  Counts,
  DiagEntry,
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
  /** chat only: the page tried to follow a link out of its chat surface in
   *  place (see offChatLinkUrl). Main re-checks the URL with
   *  isSafeExternalUrl and throttles it exactly like a scripted popup — no
   *  new reach, since window.open already lands there. */
  'service:openExternal': { serviceId: ServiceId; url: string };
  'service:ready': { serviceId: ServiceId };
  'updates:check': Record<string, never>;
  'updates:openDownload': Record<string, never>;
}

/** main -> shell renderer, via webContents.send */
export interface MainToRenderer {
  'shell:state': ShellState;
  /** main -> loading overlay page */
  'loading:state': { theme: 'light' | 'dark'; caption: string };
}

/** Everything main knows about a thread to open on a live view; each field is
 *  one lane, tried in the preload in the order replay → name → same → url →
 *  anchor → load (see openConversationInPage). */
export interface OpenRequest {
  /** the shim registry id of the banner — the site's own onclick */
  clickId?: number;
  /** the anchor to click, as the recipe or pin captured it */
  href?: string;
  /** the validated absolute URL — the full-load fallback */
  url?: string;
  /** the thread's name, for a recipe's row click (whatsapp, zalo) */
  conversation?: string;
}

/** Which lane landed. `same`: already on the thread. `url`: the recipe opened
 *  the URL in-page (Slack's thread, which the document URL never shows).
 *  `miss`: every lane the request carried reported a miss and the page was
 *  left where it was. */
export type OpenLane = 'replay' | 'name' | 'same' | 'url' | 'anchor' | 'load' | 'miss';

/** main -> service view preload, via webContents.postMessage: the request
 *  travels with a MessagePort the preload answers on with `{ lane, url }`
 *  (url = location.href once the chain settled), so main learns whether the
 *  open landed instead of firing blind — main-created port, no new channel. */
export interface MainToService {
  'notification:openConversation': OpenRequest;
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
  'service:openExternal',
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
  /** The lock screen's two channels, and the only shell channels served while
   *  the app is locked. Invoke rather than send: both are questions with an
   *  answer the surface must render, and neither belongs in every later
   *  broadcast. */
  'lock:unlock': { payload: UnlockRequest; result: UnlockResult };
  'lock:configure': { payload: LockConfigure; result: LockConfigResult };
  /** Authorize one guarded action — a summon or a purge — with the lock's
   *  credential. Shell-only, and deliberately absent from
   *  LOCKED_ALLOWED_CHANNELS: a locked app performs no actions at all. */
  'lock:confirm': { payload: ConsentRequest; result: UnlockResult };
  /** Settings → General → Downloads → Choose…: the native folder picker.
   *  Returns the picked path, or null on cancel; the renderer then writes it
   *  through settings:update. Shell-only — a page must never move the
   *  folder its own downloads land in. */
  'downloads:chooseDir': { result: string | null };
  /** Settings → Diagnostics: the evidence ring, fetched once per open and
   *  never broadcast; `report` is the pasteable text behind Copy report.
   *  Shell-only, so both are refused while locked. */
  'diagnostics:recent': { result: DiagEntry[] };
  'diagnostics:report': { result: string };
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
  'lock:unlock',
  'lock:configure',
  'lock:confirm',
  'downloads:chooseDir',
  'diagnostics:recent',
  'diagnostics:report',
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
  'lock:unlock',
  'lock:configure',
  'lock:confirm',
  'downloads:chooseDir',
  'diagnostics:recent',
  'diagnostics:report',
]);

/** The only shell channels served while the app is locked: the two that
 *  unlock it, plus the Windows taskbar overlay, which carries a count and no
 *  content. Every other shell-only channel is refused until unlock. Service
 *  channels are untouched — recipes keep counting behind the lock screen, and
 *  refusing service:ready would strand a wake cover forever. */
export const LOCKED_ALLOWED_CHANNELS = new Set<keyof RendererToMain | keyof RendererInvoke>([
  'lock:unlock',
  'lock:configure',
  'badge:overlay',
]);
