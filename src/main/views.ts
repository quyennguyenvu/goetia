import { join } from 'node:path';
import {
  app,
  BrowserWindow,
  type ContextMenuParams,
  clipboard,
  desktopCapturer,
  Menu,
  type MenuItemConstructorOptions,
  safeStorage,
  session,
  shell,
  type WebContents,
  WebContentsView,
} from 'electron';
import { PIN_CAP } from '../shared/pins';
import { serviceById } from '../shared/services';
import type { RailPosition, ServiceId } from '../shared/types';
import { CALL_ORIGINS, isBlankCallPopup, isCallPopup } from './lib/call-policy';
import { clientHintHeaders } from './lib/client-hints';
import { buildContextMenuTemplate, type ContextMenuItem } from './lib/context-menu';
import { isSafeExternalUrl } from './lib/external-url';
import { isIdentityHost, isIdentityPopup } from './lib/identity-policy';
import { sameBounds, type ViewBounds, viewBounds } from './lib/layout';
import { NavigationAudit } from './lib/navigation-audit';
import { isNavigationAllowed, shouldContainNavigation } from './lib/navigation-policy';
import { permissionAllowed } from './lib/permission-policy';
import { reloadAllowed } from './lib/reload-guard';
import { type ShellCommand, shellCommandFor } from './lib/shortcuts';

const EDIT_LABELS = { cut: 'Cut', copy: 'Copy', paste: 'Paste', selectAll: 'Select All' } as const;

/** Calls diagnosis (2026-08-16), off unless GOETIA_DEBUG_CALLS is set. Two of
 *  these sat on hot paths: the permission handler fires per request, and the
 *  call window's console-message listener forwards every line the page logs —
 *  a cost paid on registration, so the diagnostic-only listeners below are not
 *  attached at all when the flag is off. */
const DEBUG_CALLS = Boolean(process.env.GOETIA_DEBUG_CALLS);

/** Navigation containment is enforced unless explicitly switched off, which
 *  exists only so a suspected false block can be confirmed as one. */
const NAV_ENFORCED = process.env.GOETIA_NAV_ENFORCE !== 'off';

/** `keepRendered` does two separable things: the preload spoof pins the page's
 *  visibility, and setBackgroundThrottling(false) exempts its timers from
 *  Chromium throttling. Only the first is what Zalo's unmount-when-hidden
 *  behaviour needs; the second is what costs battery 24/7. `throttled` keeps
 *  the spoof and drops the exemption, so the two can be told apart against a
 *  live session before the default changes. */
const KEEP_RENDERED_THROTTLED = process.env.GOETIA_KEEP_RENDERED === 'throttled';

/** The shim advertises an authenticator only when main can actually keep a
 *  key: no OS keyring means an honest "no WebAuthn", never a half-working
 *  one. `off` also exists to confirm a suspected shim bug against the old
 *  block behaviour. */
const webAuthnEnabled = (): boolean =>
  process.env.GOETIA_WEBAUTHN !== 'off' && safeStorage.isEncryptionAvailable();
function debugCalls(message: string): void {
  if (DEBUG_CALLS) console.error(`[calls-debug] ${message}`);
}

export interface ViewHooks {
  onLoading(id: ServiceId, loading: boolean): void;
  /** Main-frame, cross-document navigation started (initial load, reload,
   *  redirect) — never same-document SPA routing or subframe loads, which
   *  also spin the tab spinner (did-start-loading) but must not re-cover
   *  the service with the waking overlay. */
  onNavigate(id: ServiceId): void;
  onCrashed(id: ServiceId): void;
  onLoadFailed(id: ServiceId): void;
  /** "Pin Message" from the page's context menu or the Pin Selection
   *  shortcut — captured here in main, so the service preload needs no
   *  channel for it. `title` is document.title, the conversation's best
   *  generic hint. */
  onPinMessage(
    id: ServiceId,
    text: string,
    href: string,
    title: string,
    conversation: string | null,
  ): void;
  /** the pinboard is at capacity, so the item renders disabled */
  pinsFull(): boolean;
  /** a Goetia chord pressed inside the page (lib/shortcuts.ts) — the page
   *  never sees it, and neither does the menu accelerator */
  onShellCommand(command: ShellCommand): void;
}

/** Detached always: docked devtools would shrink the host's web contents
 *  while the views keep laying out to the window, and overlap it. */
export function toggleDetachedDevTools(wc: WebContents): void {
  if (wc.isDestroyed()) return;
  if (wc.isDevToolsOpened()) wc.closeDevTools();
  else wc.openDevTools({ mode: 'detach' });
}

export class ServiceViewManager {
  activeId: ServiceId | null = null;
  private views = new Map<ServiceId, WebContentsView>();
  private layoutScheduled = false;
  private clickHideTimers = new Map<ServiceId, ReturnType<typeof setTimeout>>();
  private lastRefreshAt = new Map<ServiceId, number>();
  /** last rect actually applied; every view and the overlay share it */
  private lastBounds: ViewBounds | null = null;
  /** which unlisted origins each service reached — see lib/navigation-audit.ts */
  private navAudit = new NavigationAudit();
  /** the one contained window per service holding a refused navigation */
  private containedWindows = new Map<ServiceId, BrowserWindow>();
  private callWindows = new Map<ServiceId, Set<BrowserWindow>>();
  /** sign-in popups a service page opened — see lib/identity-policy.ts */
  private identityWindows = new Map<ServiceId, Set<BrowserWindow>>();

  constructor(
    private win: BrowserWindow,
    private hooks: ViewHooks,
    private railPosition: () => RailPosition,
    private audioMuted: (id: ServiceId) => boolean,
    private waking: (id: ServiceId) => boolean,
    private zoomLevel: (id: ServiceId) => number,
    private overlay?: {
      setBounds(b: { x: number; y: number; width: number; height: number }): void;
      raise(): void;
    },
  ) {
    win.on('resize', () => this.scheduleLayout());
  }

  /** Coalesce a burst of resize events into a single layout pass. */
  private scheduleLayout(): void {
    if (this.layoutScheduled) return;
    this.layoutScheduled = true;
    setTimeout(() => {
      this.layoutScheduled = false;
      this.layout();
    }, 16);
  }

  has(id: ServiceId): boolean {
    return this.views.has(id);
  }

  /** The service whose view owns this webContents id, or null. */
  serviceIdForWebContentsId(wcId: number): ServiceId | null {
    for (const [id, view] of this.views) {
      if (view.webContents.id === wcId) return id;
    }
    return null;
  }

  private configureSession(id: ServiceId) {
    const ses = session.fromPartition(`persist:${id}`);
    const serviceUrl = serviceById(id).url;
    const wanted = ['en-US', 'vi'];
    ses.setSpellCheckerLanguages(
      wanted.filter((l) => ses.availableSpellCheckerLanguages.includes(l)),
    );
    ses.setPermissionRequestHandler((_wc, permission, cb, details) => {
      const ok = permissionAllowed({
        permission,
        requestingUrl: details.requestingUrl ?? '',
        serviceUrl,
        callOrigins: CALL_ORIGINS[id],
      });
      debugCalls(
        `permission "${permission}" from "${details.requestingUrl ?? ''}" on ${id}: ${ok ? 'grant' : 'DENY'}`,
      );
      cb(ok);
    });
    ses.setPermissionCheckHandler((_wc, permission, requestingOrigin) =>
      permissionAllowed({
        permission,
        requestingUrl: requestingOrigin,
        serviceUrl,
        callOrigins: CALL_ORIGINS[id],
      }),
    );
    ses.setDisplayMediaRequestHandler(
      (_request, callback) => {
        // fallback when the native picker is unavailable (Windows/Linux,
        // older macOS) or fails: share the primary screen, don't fail the call
        desktopCapturer.getSources({ types: ['screen'] }).then((sources) => {
          callback(sources[0] ? { video: sources[0] } : {});
        });
      },
      { useSystemPicker: true },
    );
    // Chrome sends UA client hints on every secure request; Electron sends
    // none, and that absence alone reads as an embedded browser to Google's
    // OAuth check. Restore them for identity-provider requests (the sign-in
    // popup runs in this same partition) so a Continue-with-Google dialog
    // clears the "this browser may not be secure" wall.
    const hints = clientHintHeaders(app.userAgentFallback, process.platform);
    ses.webRequest.onBeforeSendHeaders((details, cb) => {
      if (isIdentityHost(details.url)) Object.assign(details.requestHeaders, hints);
      cb({ requestHeaders: details.requestHeaders });
    });
    return ses;
  }

  private create(id: ServiceId): WebContentsView {
    const svc = serviceById(id);
    this.configureSession(id);
    const view = new WebContentsView({
      webPreferences: {
        partition: `persist:${id}`,
        preload: join(__dirname, '../preload/service.cjs'),
        contextIsolation: false,
        sandbox: false,
        nodeIntegration: false,
        spellcheck: true,
        // NOTE: backgroundThrottling stays ON by default — disabling it also
        // disables the Page Visibility API, so hidden services think they're
        // visible and stop firing notifications. Their websockets exempt them
        // from Chromium's intensive timer throttling, so recipe polling stays
        // fast enough (measured: 2s cadence while hidden). keepRendered
        // services opt out — they suspend their whole UI when "hidden".
        additionalArguments: [
          `--goetia-service=${id}`,
          `--goetia-webauthn=${webAuthnEnabled() ? 'on' : 'off'}`,
        ],
      },
    });
    const wc = view.webContents;
    wc.setAudioMuted(this.audioMuted(id)); // a fresh view starts unmuted
    wc.setZoomLevel(this.zoomLevel(id));
    if (svc.keepRendered && !KEEP_RENDERED_THROTTLED) wc.setBackgroundThrottling(false);
    wc.setWindowOpenHandler(({ url, disposition }) => {
      const call = isCallPopup(id, url) || isBlankCallPopup(id, url);
      const identity = !call && isIdentityPopup(url);
      debugCalls(
        `window.open from ${id}: "${url}" -> ${
          call ? 'ALLOW call' : identity ? 'ALLOW identity' : 'deny'
        }`,
      );
      // a call is chat: a call-declaring service may open its popup, but the
      // guest window is inert scaffolding — hidden, and never allowed to
      // commit a navigation. It exists so the page keeps a live same-process
      // handle it can script (Chrome parity; Messenger writes into the
      // about:blank popup it just opened, then navigates it). The real call
      // surface opens via adoption in did-create-window below. Guest
      // webPreferences are NOT overridden: about:blank popups ignore the
      // override entirely, and a same-process guest committing a navigation
      // crashes the shared renderer with the opener's Node env pending work
      // (electron#36858 class — reproduced 2026-08-16, SIGSEGV exit 11).
      if (call) {
        return { action: 'allow', overrideBrowserWindowOptions: { show: false } };
      }
      // a sign-in dialog is the other window a chat page may open. It opens
      // on a real https URL, so unlike the blank guest its webPreferences
      // override applies: isolated + sandboxed is a separate process, out of
      // reach of the crash above, and window.opener survives for the
      // callback page's postMessage. Guarded in did-create-window below.
      if (identity) {
        return {
          action: 'allow',
          overrideBrowserWindowOptions: {
            width: 520,
            height: 680,
            backgroundColor: '#0F1115',
            webPreferences: {
              partition: `persist:${id}`,
              contextIsolation: true,
              sandbox: true,
              nodeIntegration: false,
            },
          },
        };
      }
      // only a scripted window.open (features string → new-window) is
      // evidence for the provider table; a target=_blank link click arrives
      // as foreground-tab and is just a link
      if (disposition === 'new-window') {
        const record = this.navAudit.note(`${id}:popup`, url);
        if (record) console.warn(`[nav] popup denied: ${record} (${url})`);
      }
      // external links open in the OS browser, never inside Goetia; only
      // web schemes — a hostile page must not reach file:/smb:/custom
      if (isSafeExternalUrl(url)) shell.openExternal(url);
      return { action: 'deny' };
    });
    wc.on('did-create-window', (child, { url }) => {
      child.excludedFromShownWindowsMenu = true;
      child.webContents.setWindowOpenHandler(({ url: popupUrl }) => {
        if (isSafeExternalUrl(popupUrl)) shell.openExternal(popupUrl);
        return { action: 'deny' };
      });
      if (isIdentityPopup(url)) {
        this.guardIdentityWindow(id, child);
        return;
      }
      // the call guest never navigates and never spawns: its first call-URL
      // navigation is adopted into a standalone call window, anything else
      // closes it. Closing an idle guest is safe — only an in-process
      // navigation commit races the opener's Node env (see above).
      child.webContents.on('will-navigate', (e, navUrl) => {
        debugCalls(`guest nav on ${id}: "${navUrl}"`);
        e.preventDefault();
        if (isCallPopup(id, navUrl)) {
          this.openCallWindow(id, navUrl);
          return;
        }
        if (isSafeExternalUrl(navUrl)) shell.openExternal(navUrl);
        if (!child.isDestroyed()) child.close();
      });
      if (DEBUG_CALLS) child.on('closed', () => debugCalls(`guest closed (${id})`));
    });
    wc.on('context-menu', (_e, params) => {
      const items = buildContextMenuTemplate({
        misspelledWord: params.misspelledWord,
        dictionarySuggestions: params.dictionarySuggestions,
        isEditable: params.isEditable,
        editFlags: {
          canCut: params.editFlags.canCut,
          canCopy: params.editFlags.canCopy,
          canPaste: params.editFlags.canPaste,
          canSelectAll: params.editFlags.canSelectAll,
        },
        selectionText: params.selectionText,
        linkURL: params.linkURL,
        imageURL: params.mediaType === 'image' ? params.srcURL : '',
        pageTitle: wc.getTitle(),
        serviceOrigin: new URL(serviceById(id).url).origin,
        pinsFull: this.hooks.pinsFull(),
      });
      if (items.length === 0) return;
      const template = items.map((item) => this.menuItemFor(id, item, wc, params));
      Menu.buildFromTemplate(template).popup({ window: this.win });
    });
    wc.on('before-input-event', (e, input) => {
      // Goetia's chords win over the page. The page gets a key before the
      // menu and may swallow it (Discord bound the old ⌘⇧H), so a shell chord is
      // taken here — preventDefault also drops the menu accelerator, so the
      // hook runs the command. Repeats: zoom and reload (the reload guard
      // rate-limits a held F5) may repeat; a held ⌘⇧G opens Home once.
      const command = shellCommandFor(input, process.platform);
      if (!command) return;
      e.preventDefault();
      if (input.isAutoRepeat && command.kind !== 'zoom' && command.kind !== 'reload') return;
      this.hooks.onShellCommand(command);
    });
    // Navigation containment, enforced. A service view must never carry an
    // unlisted origin, because this view runs unsandboxed with the recipe
    // preload. The refused URL is not dropped, though: ALLOWED_HOSTS cannot
    // enumerate tenant SSO or ADFS hosts, so killing it outright would strand
    // real logins. It goes to a hardened contained window instead, which hands
    // back to this view the moment it reaches an allowed host. The audit still
    // records every refusal so the list can be completed from evidence.
    // Top-level frame only: will-navigate is main-frame by contract, but
    // will-redirect also reports a subframe's 302 — and a login page's
    // third-party iframes are not the view's origin (see shouldContainNavigation).
    const containNavigation = (
      e: { preventDefault(): void },
      url: string,
      isMainFrame: boolean,
    ): void => {
      if (!shouldContainNavigation(id, url, isMainFrame)) return;
      const record = this.navAudit.note(id, url);
      if (record) console.warn(`[nav] contained: ${record} (${url})`);
      if (!NAV_ENFORCED) return;
      e.preventDefault();
      this.openContainedWindow(id, url);
    };
    wc.on('will-navigate', (e, url, _inPlace, isMainFrame) =>
      containNavigation(e, url, isMainFrame),
    );
    wc.on('will-redirect', (e, url, _inPlace, isMainFrame) =>
      containNavigation(e, url, isMainFrame),
    );
    wc.on('did-start-loading', () => this.hooks.onLoading(id, true));
    wc.on('did-finish-load', () => {
      // re-assert: restarts, hibernation wakes, reloads and purges all
      // land here, and the persisted level must survive every one of them
      wc.setZoomLevel(this.zoomLevel(id));
      this.hooks.onLoading(id, false);
    });
    wc.on('did-start-navigation', ({ isMainFrame, isSameDocument }) => {
      if (isMainFrame && !isSameDocument) this.hooks.onNavigate(id);
    });
    wc.on('render-process-gone', (_e, d) => {
      debugCalls(`service ${id} GONE reason=${d.reason} exit=${d.exitCode}`);
      this.hooks.onCrashed(id);
    });
    wc.on('did-fail-load', (_e, code, _desc, _url, isMainFrame) => {
      if (isMainFrame && code !== -3) this.hooks.onLoadFailed(id);
    });
    wc.loadURL(svc.url);
    this.views.set(id, view);
    // real bounds even while hidden: pages get desktop-class layout and
    // keep-alive click coordinates from getBoundingClientRect stay valid
    const [w, h] = this.win.getContentSize();
    view.setBounds(viewBounds(w, h, this.railPosition()));
    return view;
  }

  /** A hardened window in the service's partition: isolated, sandboxed, no
   *  preload and no opener, so the signed-in session and the session-level
   *  permission and display-media handlers still apply while the page gets
   *  none of the recipe preload's reach. Both the adopted call surface and a
   *  contained navigation are built on this. */
  private hardenedWindow(id: ServiceId): BrowserWindow {
    return new BrowserWindow({
      width: 1080,
      height: 720,
      backgroundColor: '#0F1115',
      webPreferences: {
        partition: `persist:${id}`,
        contextIsolation: true,
        sandbox: true,
        nodeIntegration: false,
      },
    });
  }

  /** Somewhere the service view is not allowed to go — most often an SSO host
   *  no static list could name. It opens here instead: same session, none of
   *  the preload. As soon as it lands back on a host the policy allows, the
   *  service view takes the URL over and this window closes, so a login that
   *  detours through an unlisted provider still finishes in the right place.
   *  One per service: a page that spams navigations replaces, never stacks. */
  private openContainedWindow(id: ServiceId, url: string): void {
    const existing = this.containedWindows.get(id);
    if (existing && !existing.isDestroyed()) {
      existing.loadURL(url);
      existing.focus();
      return;
    }
    const win = this.hardenedWindow(id);
    this.containedWindows.set(id, win);
    win.on('closed', () => {
      if (this.containedWindows.get(id) === win) this.containedWindows.delete(id);
    });
    win.webContents.setWindowOpenHandler(({ url: popupUrl }) => {
      if (isSafeExternalUrl(popupUrl)) shell.openExternal(popupUrl);
      return { action: 'deny' };
    });
    // did-navigate, not will-navigate: the redirect chain must be allowed to
    // run its course, and only where it actually lands matters
    const handBack = (_e: unknown, landedUrl: string): void => {
      if (!isNavigationAllowed(id, landedUrl)) return;
      const wc = this.views.get(id)?.webContents;
      if (wc && !wc.isDestroyed()) wc.loadURL(landedUrl);
      if (!win.isDestroyed()) win.close();
    };
    win.webContents.on('did-navigate', handBack);
    win.webContents.on('did-navigate-in-page', handBack);
    // A redirect hop back onto an allowed host is handed over BEFORE it
    // commits: the callback then runs once, in the view, whose sessionStorage
    // still holds the state/PKCE the login page stashed. Redirects only — a
    // will-navigate may be a POST (Apple's form_post callback, SAML), and a
    // prevented POST re-issued as loadURL would arrive as an empty GET, so
    // plain navigations keep the post-commit hand-back above.
    win.webContents.on('will-redirect', (e, url, _inPlace, isMainFrame) => {
      if (!isMainFrame || !isNavigationAllowed(id, url)) return;
      e.preventDefault();
      handBack(e, url);
    });
    win.loadURL(url);
  }

  /** The adopted call surface: a standalone hardened window (isolated,
   *  sandboxed, no preload, no opener) in the service's own partition, so the
   *  signed-in session and the session-level permission and display-media
   *  handlers apply. Unlike the guest it replaces, it has no Node env to race
   *  and no scripting contract with the opener page. Closed on service
   *  destroy; switching services leaves a call running. */
  private openCallWindow(id: ServiceId, url: string): void {
    debugCalls(`adopting call for ${id}: "${url}"`);
    const call = this.hardenedWindow(id);
    let open = this.callWindows.get(id);
    if (!open) {
      open = new Set();
      this.callWindows.set(id, open);
    }
    open.add(call);
    call.on('closed', () => {
      debugCalls(`call window closed (${id})`);
      this.callWindows.get(id)?.delete(call);
    });
    // a call window is not a browser: no further popups, and every
    // navigation must stay a call URL or at least on the service's own hosts
    call.webContents.setWindowOpenHandler(({ url: popupUrl }) => {
      if (isSafeExternalUrl(popupUrl)) shell.openExternal(popupUrl);
      return { action: 'deny' };
    });
    call.webContents.on('will-navigate', (e, navUrl) => {
      debugCalls(`call window nav on ${id}: "${navUrl}"`);
      if (isCallPopup(id, navUrl) || isNavigationAllowed(id, navUrl)) return;
      e.preventDefault();
      if (isSafeExternalUrl(navUrl)) shell.openExternal(navUrl);
      if (!call.isDestroyed()) call.close();
    });
    // Diagnostic-only: never attached unless the flag is on. console-message
    // in particular means every line the call page logs crosses the boundary.
    if (DEBUG_CALLS) {
      call.webContents.on('did-finish-load', () =>
        debugCalls(`call window loaded: ${call.webContents.getURL()}`),
      );
      call.webContents.on('did-navigate', (_e, navUrl, code) =>
        debugCalls(`call window did-navigate ${code}: "${navUrl}"`),
      );
      call.webContents.on('page-title-updated', (_e, title) =>
        debugCalls(`call window title: "${title}"`),
      );
      call.webContents.on('did-fail-load', (_e, code, desc, failedUrl) =>
        debugCalls(`call window FAILED load ${code} "${desc}" ${failedUrl}`),
      );
      call.webContents.on('console-message', (event) =>
        debugCalls(`call js[${event.level}]: ${event.message.slice(0, 300)}`),
      );
      call.webContents.on('render-process-gone', (_e, d) =>
        debugCalls(`call window GONE reason=${d.reason} exit=${d.exitCode}`),
      );
    }
    call.loadURL(url);
  }

  /** Map a template descriptor to a native item. Only `open-link` reaches the
   *  outside world, and the builder emits it solely for isSafeExternalUrl
   *  URLs — the same gate as the window-open handler above. */
  private menuItemFor(
    id: ServiceId,
    item: ContextMenuItem,
    wc: WebContents,
    params: ContextMenuParams,
  ): MenuItemConstructorOptions {
    switch (item.kind) {
      case 'suggestion':
        return { label: item.word, click: () => wc.replaceMisspelling(item.word) };
      case 'no-guesses':
        return { label: 'No Guesses Found', enabled: false };
      case 'add-to-dictionary':
        return {
          label: 'Add to Dictionary',
          click: () => wc.session.addWordToSpellCheckerDictionary(item.word),
        };
      case 'edit':
        return {
          label: EDIT_LABELS[item.action],
          enabled: item.enabled,
          click: () => wc[item.action](),
        };
      case 'copy-link':
        return { label: 'Copy Link Address', click: () => clipboard.writeText(item.url) };
      case 'open-link':
        return { label: 'Open Link in Browser', click: () => shell.openExternal(item.url) };
      case 'copy-image':
        return { label: 'Copy Image', click: () => wc.copyImageAt(params.x, params.y) };
      case 'save-image':
        return { label: 'Save Image As…', click: () => wc.downloadURL(item.url) };
      case 'pin-message':
        return {
          label: item.enabled ? 'Pin Message' : `Pin Message — ${PIN_CAP} max`,
          enabled: item.enabled,
          // pageURL is the document at right-click time — the conversation
          // the selection was read in
          click: () => void this.capturePin(id, wc, item.text, item.href ?? params.pageURL),
        };
      case 'separator':
        return { type: 'separator' };
    }
  }

  /** The Pin Selection shortcut: pin whatever is selected in the service
   *  page. Exists because some sites own right-click (Discord draws its own
   *  menu on messages and swallows ours), so the context menu cannot be the
   *  only way in. The selection is read with executeJavaScript rather than a
   *  preload channel: no new service-side IPC, and the text is treated as
   *  page content downstream either way. */
  async pinSelection(id: ServiceId): Promise<void> {
    const wc = this.views.get(id)?.webContents;
    if (!wc || wc.isDestroyed() || this.hooks.pinsFull()) return;
    let text: unknown;
    try {
      text = await wc.executeJavaScript('String(document.getSelection() ?? "")', true);
    } catch {
      return; // page is mid-navigation; nothing to pin
    }
    if (typeof text !== 'string' || text.trim() === '' || wc.isDestroyed()) return;
    await this.capturePin(id, wc, text, wc.getURL());
  }

  /** Both capture doors end here: the title is the generic conversation
   *  hint, and the recipe's own name (WhatsApp) is fetched from the page —
   *  the one thing that can later open a thread whose URL is shared by all. */
  private async capturePin(
    id: ServiceId,
    wc: WebContents,
    text: string,
    href: string,
  ): Promise<void> {
    const title = wc.getTitle();
    let conversation: unknown = null;
    try {
      conversation = await wc.executeJavaScript(
        'globalThis.__goetia?.conversation?.() ?? null',
        true,
      );
    } catch {
      // page mid-navigation: the title alone will have to do
    }
    if (wc.isDestroyed()) return;
    this.hooks.onPinMessage(
      id,
      text,
      href,
      title,
      typeof conversation === 'string' && conversation.trim() !== '' ? conversation : null,
    );
  }

  /** Trusted synthetic click; page-JS clicks are untrusted and e.g. Zalo's
   *  session-activation button ignores them. Input only reaches visible
   *  widgets, so a hidden view is flashed visible underneath the active one
   *  (attached at the bottom of the z-order) for the click. */
  toggleDevTools(id: ServiceId): void {
    const view = this.views.get(id);
    if (view) toggleDetachedDevTools(view.webContents);
  }

  trustedClick(id: ServiceId, x: number, y: number): void {
    const view = this.views.get(id);
    if (!view) return;
    const hidden = id !== this.activeId;
    if (hidden) {
      if (!this.win.contentView.children.includes(view)) {
        this.win.contentView.addChildView(view, 0);
      }
      view.setVisible(true);
    }
    const wc = view.webContents;
    wc.sendInputEvent({ type: 'mouseDown', x, y, button: 'left', clickCount: 1 });
    wc.sendInputEvent({ type: 'mouseUp', x, y, button: 'left', clickCount: 1 });
    if (hidden) {
      const prev = this.clickHideTimers.get(id);
      if (prev !== undefined) clearTimeout(prev);
      this.clickHideTimers.set(
        id,
        setTimeout(() => {
          this.clickHideTimers.delete(id);
          if (!view.webContents.isDestroyed()) view.setVisible(false);
        }, 300),
      );
    }
  }

  /** Muting silences the page as well: the site's own ding is the sound the
   *  mute is really about, and suppressing banners alone left it ringing. The
   *  view's other audio goes with it (calls, voice notes) — setAudioMuted is
   *  per-WebContents, and silence is the whole point of a mute. */
  applyAudioMute(id: ServiceId): void {
    const wc = this.views.get(id)?.webContents;
    if (wc && !wc.isDestroyed()) wc.setAudioMuted(this.audioMuted(id));
  }

  /** Global mute moved: every live view, not just the one that changed. */
  applyAudioMuteAll(): void {
    for (const id of this.views.keys()) this.applyAudioMute(id);
  }

  /** Re-apply the persisted zoom after a View-menu change. */
  applyZoom(id: ServiceId): void {
    const wc = this.views.get(id)?.webContents;
    if (wc && !wc.isDestroyed()) wc.setZoomLevel(this.zoomLevel(id));
  }

  /** Create the view (starts loading, recipes, notifications) without showing it. */
  ensure(id: ServiceId): void {
    if (!this.views.has(id)) this.create(id);
  }

  /** `show: false` resolves activation without presenting: the view is
   *  created and z-ordered but stays hidden and unfocused, so a shell
   *  surface (settings, switcher, home) is never buried by it. */
  activate(id: ServiceId, { show = true }: { show?: boolean } = {}): void {
    const view = this.views.get(id) ?? this.create(id);
    for (const [otherId, v] of this.views) {
      if (otherId !== id) v.setVisible(false);
    }
    // always re-add: moves the active view to the top of the z-order, so a
    // flashed keep-alive view (attached at index 0) stays covered
    this.win.contentView.addChildView(view);
    view.setVisible(show);
    // a covering loading overlay must outrank the view we just re-added
    this.overlay?.raise();
    this.activeId = id;
    this.layout();
    // keyboard (incl. Tab) goes into the service, not the shell rail
    if (show) view.webContents.focus();
  }

  hideActive(): void {
    if (!this.activeId) return;
    this.views.get(this.activeId)?.setVisible(false);
  }

  showActive(): void {
    if (!this.activeId) return;
    const view = this.views.get(this.activeId);
    view?.setVisible(true);
    view?.webContents.focus();
  }

  /** Hand keyboard focus to the active service (restores its inner DOM focus). */
  focusActive(): void {
    if (!this.activeId) return;
    this.views.get(this.activeId)?.webContents.focus();
  }

  destroy(id: ServiceId): void {
    const view = this.views.get(id);
    if (!view) return;
    const t = this.clickHideTimers.get(id);
    if (t !== undefined) {
      clearTimeout(t);
      this.clickHideTimers.delete(id);
    }
    this.win.contentView.removeChildView(view);
    this.lastRefreshAt.delete(id);
    this.closeCallWindows(id);
    this.closeIdentityWindows(id);
    this.closeContainedWindow(id);
    view.webContents.close();
    this.views.delete(id);
    if (this.activeId === id) this.activeId = null;
  }

  /** End every call this service has open. A call outlives a service switch —
   *  but not the service being destroyed, and not a login purge: leaving a
   *  call running on credentials the user just wiped is the surprising state
   *  the purge dialog already promised not to leave them in. */
  closeCallWindows(id: ServiceId): void {
    for (const call of this.callWindows.get(id) ?? []) {
      if (!call.isDestroyed()) call.close();
    }
    this.callWindows.delete(id);
  }

  /** A sign-in popup keeps its opener — the callback page finishes through
   *  postMessage — and is otherwise a contained window: it may roam the
   *  provider's hosts and land on the service's own, and anything else
   *  closes it. Main frame only: an IdP page's subframes are not its origin. */
  private guardIdentityWindow(id: ServiceId, popup: BrowserWindow): void {
    let open = this.identityWindows.get(id);
    if (!open) {
      open = new Set();
      this.identityWindows.set(id, open);
    }
    open.add(popup);
    popup.on('closed', () => {
      debugCalls(`identity popup closed (${id})`);
      this.identityWindows.get(id)?.delete(popup);
    });
    const guard = (e: { preventDefault(): void }, url: string, isMainFrame: boolean): void => {
      debugCalls(`identity nav on ${id}: "${url}" (main=${isMainFrame})`);
      if (!isMainFrame || isIdentityHost(url) || isNavigationAllowed(id, url)) return;
      e.preventDefault();
      const record = this.navAudit.note(`${id}:popup`, url);
      if (record) console.warn(`[nav] popup contained: ${record} (${url})`);
      if (!popup.isDestroyed()) popup.close();
    };
    popup.webContents.on('will-navigate', (e, url, _inPlace, isMainFrame) =>
      guard(e, url, isMainFrame),
    );
    popup.webContents.on('will-redirect', (e, url, _inPlace, isMainFrame) =>
      guard(e, url, isMainFrame),
    );
    // diagnostic-only, never attached unless the flag is on (see DEBUG_CALLS)
    if (DEBUG_CALLS) {
      popup.webContents.on('did-finish-load', () =>
        debugCalls(`identity popup loaded: ${popup.webContents.getURL()}`),
      );
    }
  }

  /** A sign-in popup belongs to the view that opened it: it survives a
   *  service switch and dies with the service — and with a purge, since it
   *  runs in the partition being wiped. */
  closeIdentityWindows(id: ServiceId): void {
    for (const popup of this.identityWindows.get(id) ?? []) {
      if (!popup.isDestroyed()) popup.close();
    }
    this.identityWindows.delete(id);
  }

  /** A contained navigation belongs to the view that triggered it. */
  private closeContainedWindow(id: ServiceId): void {
    const win = this.containedWindows.get(id);
    if (win && !win.isDestroyed()) win.close();
    this.containedWindows.delete(id);
  }

  reload(id: ServiceId): void {
    this.views.get(id)?.webContents.reload();
  }

  /** User-initiated reload: return a live service to its chat URL — Goetia
   *  is chat-only, and reload is the way back when a site's own links have
   *  wandered off chat. Re-shows the active view if a failed load hid it.
   *  Dropped while the service is waking, or inside RELOAD_MIN_INTERVAL_MS,
   *  so a spammed ⌘R cannot keep restarting the load it is waiting on.
   *  (Crash auto-reload stays on the current URL — see ResilienceManager.) */
  refresh(id: ServiceId): void {
    const view = this.views.get(id);
    if (!view) return; // hibernated/never-created: nothing to reload
    const now = Date.now();
    if (
      !reloadAllowed({ waking: this.waking(id), lastReloadAt: this.lastRefreshAt.get(id), now })
    ) {
      return;
    }
    this.lastRefreshAt.set(id, now);
    if (this.activeId === id) this.activate(id);
    view.webContents.loadURL(serviceById(id).url);
  }

  /** Post-purge reset: land a live view back on the chat URL. Not the ⌘R
   *  path, so no reload-guard — and no ensure: a hibernated service must not
   *  wake just to show a login page. */
  loadServiceUrl(id: ServiceId): void {
    const wc = this.views.get(id)?.webContents;
    if (wc && !wc.isDestroyed()) wc.loadURL(serviceById(id).url);
  }

  /** Banner click, lane B: land the (possibly just-woken) view on the
   *  conversation URL itself. The URL was validated by resolveBannerClick. */
  openConversation(id: ServiceId, url: string): void {
    this.ensure(id);
    const wc = this.views.get(id)?.webContents;
    if (wc && !wc.isDestroyed()) wc.loadURL(url);
  }

  /** Banner click, lane A: ask the page to run its own notification onclick. */
  sendReplayClick(id: ServiceId, clickId: number): void {
    const wc = this.views.get(id)?.webContents;
    if (wc && !wc.isDestroyed()) wc.send('notification:replayClick', { clickId });
  }

  /** Banner click, lane B on a live view: route in-page — a loadURL here
   *  would reboot the SPA and raise the waking cover for a thread switch. */
  sendOpenConversation(id: ServiceId, href: string, url: string, conversation?: string): void {
    const wc = this.views.get(id)?.webContents;
    if (wc && !wc.isDestroyed()) {
      wc.send('notification:openConversation', { href, url, conversation });
    }
  }

  layout(): void {
    const [w, h] = this.win.getContentSize();
    const bounds = viewBounds(w, h, this.railPosition());
    // a resize drag schedules a pass every ~16ms, and most recompute the rect
    // every view already holds; create() sets a new view's bounds directly, so
    // skipping here can never leave one unsized
    if (sameBounds(this.lastBounds, bounds)) return;
    this.lastBounds = bounds;
    for (const view of this.views.values()) view.setBounds(bounds);
    this.overlay?.setBounds(bounds);
  }
}
