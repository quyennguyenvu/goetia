import type { DiagFilter } from './diag-filter';
import type {
  ConsentRequest,
  LockConfigResult,
  LockConfigure,
  UnlockRequest,
  UnlockResult,
} from './lock';
import type { RebindableId, RecordResult } from './shortcuts';
import type {
  Counts,
  DiagEntry,
  DownloadStorage,
  DownloadView,
  PasskeyView,
  RecentsStorage,
  RecentView,
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
  /** `until`: epoch ms a timed mute ends (tile menu only); absent or 0 is
   *  "until I unmute". Validated in main as a finite future number. */
  'service:setMuted': { serviceId: ServiceId; muted: boolean; until?: number };
  'service:reorder': { orderedIds: ServiceId[] };
  'service:reload': { serviceId: ServiceId };
  /** right-click on a rail tile: main pops the native per-service menu */
  'service:tileMenu': { serviceId: ServiceId };
  /** Settings → Services row: wipe the service's login on this device */
  'service:purgeLogin': { serviceId: ServiceId };
  /** `until`: epoch ms a timed global mute ends (bell, tray and app menu);
   *  absent or 0 is "until I unmute". Validated in main like the service one. */
  'global:setMuted': { muted: boolean; until?: number };
  /** right-click on the bell: main pops the durations, or Unmute */
  'global:muteMenu': Record<string, never>;
  'switcher:setOpen': { open: boolean };
  'settings:setOpen': { open: boolean };
  'home:setOpen': { open: boolean };
  'settings:update': Partial<Settings>;
  'badge:overlay': { dataUrl: string | null; count: number };
  'unread:update': { serviceId: ServiceId } & Counts;
  /** `reason`: the recipe's own error message — sanitized and clipped in
   *  main before it reaches the Diagnostics ring, never trusted as-is */
  'unread:stale': { serviceId: ServiceId; reason?: string };
  /** the ready() poll gave up (10s) without a match: a logged-out page or a
   *  dead selector — the line that would have caught the Teams ready() bug */
  'service:readyTimeout': { serviceId: ServiceId };
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
  /** open a Recent row: main resolves the stored row and re-validates its URL */
  'recents:open': { id: number };
  /** Home's pinboard. All shell-only; ids are opaque handles into PinStore
   *  and hrefs never cross IPC — main re-validates at open time. */
  'pins:reorder': { ids: number[] };
  'pins:unpin': { id: number };
  /** undo the most recent unpin/Done */
  'pins:restore': { id: number };
  'pins:setNote': { id: number; note: string };
  'pins:open': { id: number };
  /** Settings → Downloads rows: reveal a saved file, cancel a running one.
   *  `id` is main's own row id; the path never leaves main. Shell-only. */
  'downloads:reveal': { id: number };
  'downloads:cancel': { id: number };
  /** Settings → Downloads history. `remove` and `clear` are guarded actions —
   *  lock:confirm mints the consent first when the guard is on, and main
   *  refuses without one; `restore` is the Undo and is not guarded (the safe
   *  direction); `openDir` opens the download folder itself, a directory from
   *  settings, never a page's path. Ids are main's row ids. All shell-only. */
  'downloads:remove': { ids: number[] };
  'downloads:clear': Record<string, never>;
  'downloads:restore': Record<string, never>;
  'downloads:openDir': Record<string, never>;
  /** a recipe asks for a trusted click at a point in its own view: keep-alive
   *  buttons and Zalo's conversation rows ignore synthetic events */
  'service:trusted-click': { serviceId: ServiceId; x: number; y: number };
  /** chat only: the page tried to follow a link out of its chat surface in
   *  place (see offChatLinkUrl). Main re-checks the URL with
   *  isSafeExternalUrl and throttles it exactly like a scripted popup — no
   *  new reach, since window.open already lands there. */
  'service:openExternal': { serviceId: ServiceId; url: string };
  'service:ready': { serviceId: ServiceId };
  /** the conversation on screen in the focused view, for ⌘K's Recent — sent
   *  on change only. Every field is page data: main sanitizes it and accepts
   *  it for the active, focused, overlay-free service alone (recents-rules) */
  'conversation:active': {
    serviceId: ServiceId;
    conversation: string | null;
    url: string;
    title: string;
  };
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
  'global:muteMenu',
  'switcher:setOpen',
  'settings:setOpen',
  'home:setOpen',
  'settings:update',
  'badge:overlay',
  'unread:update',
  'unread:stale',
  'notification:fired',
  'recents:open',
  'pins:reorder',
  'pins:unpin',
  'pins:restore',
  'pins:setNote',
  'pins:open',
  'downloads:reveal',
  'downloads:cancel',
  'downloads:remove',
  'downloads:clear',
  'downloads:restore',
  'downloads:openDir',
  'service:trusted-click',
  'service:openExternal',
  'service:ready',
  'conversation:active',
  'service:readyTimeout',
  'updates:check',
  'updates:openDownload',
] as const satisfies readonly (keyof RendererToMain)[];

/** renderer -> main round-trips, via ipcRenderer.invoke. `payload` is what
 *  the sender passes; channels without one are invoked bare. */
export interface RendererInvoke {
  /** ⌘K's Recent: the conversations the user opened, newest first, the one
   *  on screen left out, fetched once per open and never broadcast — plus how
   *  recents.json rests, for the switcher's one quiet line */
  'recents:list': { result: { rows: RecentView[]; storage: RecentsStorage } };
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
  /** Settings → Downloads: the history rows, fetched when the pane opens and
   *  polled once a second only while one is still downloading, plus how the
   *  file rests (the pane's keychain band). */
  'downloads:recent': { result: { rows: DownloadView[]; storage: DownloadStorage } };
  /** Settings → Shortcuts: record the next chord for a row. Main reads the
   *  key off the OS event, validates it (lib/shortcut-rules) and writes the
   *  override itself; the pane only shows the verdict. Shell-only. */
  'shortcuts:record': { payload: { id: RebindableId }; result: RecordResult };
  /** Settings → Diagnostics: the evidence ring, fetched once per open and
   *  never broadcast; `report` is the pasteable text behind Copy report,
   *  narrowed by the pane's filter (normalised in main — it is renderer data)
   *  and stamped with a `Filtered:` header line when it narrows.
   *  Shell-only, so both are refused while locked. */
  'diagnostics:recent': { result: DiagEntry[] };
  'diagnostics:report': { payload: { filter: DiagFilter }; result: string };
  /** Settings → General → Backup. Export writes the allowlisted preferences
   *  (lib/settings-backup.ts) to a file the Save dialog names; import reads
   *  the file the Open dialog names and applies it through the ordinary
   *  settings tail. `guarded`: the file would summon a service and the guard
   *  is on — main parks the patch; `retry: true` after CredentialConfirm
   *  applies it without a second dialog. Shell-only, refused while locked. */
  'settings:export': {
    result: { ok: true; path: string } | { ok: false; reason: 'cancelled' | 'write-failed' };
  };
  'settings:import': {
    payload: { retry: boolean };
    result:
      | { ok: true; path: string }
      | {
          ok: false;
          reason:
            | 'cancelled'
            | 'read-failed'
            | 'guarded'
            | 'not-json'
            | 'not-goetia'
            | 'too-large'
            | 'empty';
        };
  };
}

export type InvokePayload<C extends keyof RendererInvoke> = RendererInvoke[C] extends {
  payload: infer P;
}
  ? P
  : undefined;

export const INVOKE_CHANNELS = [
  'recents:list',
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
  'downloads:recent',
  'shortcuts:record',
  'diagnostics:recent',
  'diagnostics:report',
  'settings:export',
  'settings:import',
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
  'global:muteMenu',
  'switcher:setOpen',
  'settings:setOpen',
  'home:setOpen',
  'settings:update',
  'badge:overlay',
  'updates:check',
  'updates:openDownload',
  'recents:open',
  'recents:list',
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
  'downloads:recent',
  'downloads:reveal',
  'downloads:cancel',
  'downloads:remove',
  'downloads:clear',
  'downloads:restore',
  'downloads:openDir',
  'shortcuts:record',
  'diagnostics:recent',
  'diagnostics:report',
  'settings:export',
  'settings:import',
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
