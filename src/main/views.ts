import { join } from 'node:path';
import {
  BrowserWindow,
  type ContextMenuParams,
  clipboard,
  desktopCapturer,
  Menu,
  type MenuItemConstructorOptions,
  session,
  shell,
  type WebContents,
  WebContentsView,
} from 'electron';
import { serviceById } from '../shared/services';
import type { RailPosition, ServiceId } from '../shared/types';
import { CALL_ORIGINS, isBlankCallPopup, isCallPopup } from './lib/call-policy';
import { buildContextMenuTemplate, type ContextMenuItem } from './lib/context-menu';
import { isSafeExternalUrl } from './lib/external-url';
import { viewBounds } from './lib/layout';
import { isNavigationAllowed } from './lib/navigation-policy';
import { permissionAllowed } from './lib/permission-policy';
import { reloadAllowed } from './lib/reload-guard';

const EDIT_LABELS = { cut: 'Cut', copy: 'Copy', paste: 'Paste', selectAll: 'Select All' } as const;

export interface ViewHooks {
  onLoading(id: ServiceId, loading: boolean): void;
  /** Main-frame, cross-document navigation started (initial load, reload,
   *  redirect) — never same-document SPA routing or subframe loads, which
   *  also spin the tab spinner (did-start-loading) but must not re-cover
   *  the service with the waking overlay. */
  onNavigate(id: ServiceId): void;
  onCrashed(id: ServiceId): void;
  onLoadFailed(id: ServiceId): void;
}

export class ServiceViewManager {
  activeId: ServiceId | null = null;
  private views = new Map<ServiceId, WebContentsView>();
  private layoutScheduled = false;
  private clickHideTimers = new Map<ServiceId, ReturnType<typeof setTimeout>>();
  private lastRefreshAt = new Map<ServiceId, number>();
  private callWindows = new Map<ServiceId, Set<BrowserWindow>>();

  constructor(
    private win: BrowserWindow,
    private hooks: ViewHooks,
    private railPosition: () => RailPosition,
    private audioMuted: (id: ServiceId) => boolean,
    private waking: (id: ServiceId) => boolean,
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
      // TEMPORARY calls diagnosis (2026-08-16) — do not commit.
      console.error(
        `[calls-debug] permission "${permission}" from "${details.requestingUrl ?? ''}" on ${id}: ${ok ? 'grant' : 'DENY'}`,
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
        additionalArguments: [`--goetia-service=${id}`],
      },
    });
    const wc = view.webContents;
    wc.setAudioMuted(this.audioMuted(id)); // a fresh view starts unmuted
    if (svc.keepRendered) wc.setBackgroundThrottling(false);
    wc.setWindowOpenHandler(({ url }) => {
      // TEMPORARY calls diagnosis (2026-08-16): remove after capturing the
      // real call-popup URL — do not commit.
      console.error(
        `[calls-debug] window.open from ${id}: "${url}" -> ${
          isCallPopup(id, url) || isBlankCallPopup(id, url) ? 'ALLOW' : 'deny'
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
      if (isCallPopup(id, url) || isBlankCallPopup(id, url)) {
        return { action: 'allow', overrideBrowserWindowOptions: { show: false } };
      }
      // external links open in the OS browser, never inside Goetia; only
      // web schemes — a hostile page must not reach file:/smb:/custom
      if (isSafeExternalUrl(url)) shell.openExternal(url);
      return { action: 'deny' };
    });
    wc.on('did-create-window', (child) => {
      // the guest never navigates and never spawns: its first call-URL
      // navigation is adopted into a standalone call window, anything else
      // closes it. Closing an idle guest is safe — only an in-process
      // navigation commit races the opener's Node env (see above).
      child.excludedFromShownWindowsMenu = true;
      child.webContents.setWindowOpenHandler(({ url }) => {
        if (isSafeExternalUrl(url)) shell.openExternal(url);
        return { action: 'deny' };
      });
      child.webContents.on('will-navigate', (e, url) => {
        // TEMPORARY calls diagnosis (2026-08-16): remove before commit.
        console.error(`[calls-debug] guest nav on ${id}: "${url}"`);
        e.preventDefault();
        if (isCallPopup(id, url)) {
          this.openCallWindow(id, url);
          return;
        }
        if (isSafeExternalUrl(url)) shell.openExternal(url);
        if (!child.isDestroyed()) child.close();
      });
      // TEMPORARY calls diagnosis (2026-08-16): remove before commit.
      child.on('closed', () => console.error(`[calls-debug] guest closed (${id})`));
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
      });
      if (items.length === 0) return;
      const template = items.map((item) => this.menuItemFor(item, wc, params));
      Menu.buildFromTemplate(template).popup({ window: this.win });
    });
    wc.on('before-input-event', (_e, input) => {
      // F5 reload while focus is inside the service page (menu covers Cmd/Ctrl+R)
      if (input.type === 'keyDown' && input.key === 'F5') this.refresh(id);
    });
    wc.on('did-start-loading', () => this.hooks.onLoading(id, true));
    wc.on('did-finish-load', () => this.hooks.onLoading(id, false));
    wc.on('did-start-navigation', ({ isMainFrame, isSameDocument }) => {
      if (isMainFrame && !isSameDocument) this.hooks.onNavigate(id);
    });
    wc.on('render-process-gone', (_e, d) => {
      // TEMPORARY calls diagnosis (2026-08-16): remove before commit.
      console.error(`[calls-debug] service ${id} GONE reason=${d.reason} exit=${d.exitCode}`);
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

  /** The adopted call surface: a standalone hardened window (isolated,
   *  sandboxed, no preload, no opener) in the service's own partition, so the
   *  signed-in session and the session-level permission and display-media
   *  handlers apply. Unlike the guest it replaces, it has no Node env to race
   *  and no scripting contract with the opener page. Closed on service
   *  destroy; switching services leaves a call running. */
  private openCallWindow(id: ServiceId, url: string): void {
    // TEMPORARY calls diagnosis (2026-08-16): remove before commit.
    console.error(`[calls-debug] adopting call for ${id}: "${url}"`);
    const call = new BrowserWindow({
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
    let open = this.callWindows.get(id);
    if (!open) {
      open = new Set();
      this.callWindows.set(id, open);
    }
    open.add(call);
    call.on('closed', () => {
      // TEMPORARY calls diagnosis (2026-08-16): remove before commit.
      console.error(`[calls-debug] call window closed (${id})`);
      this.callWindows.get(id)?.delete(call);
    });
    // a call window is not a browser: no further popups, and every
    // navigation must stay a call URL or at least on the service's own hosts
    call.webContents.setWindowOpenHandler(({ url: popupUrl }) => {
      if (isSafeExternalUrl(popupUrl)) shell.openExternal(popupUrl);
      return { action: 'deny' };
    });
    call.webContents.on('will-navigate', (e, navUrl) => {
      // TEMPORARY calls diagnosis (2026-08-16): remove before commit.
      console.error(`[calls-debug] call window nav on ${id}: "${navUrl}"`);
      if (isCallPopup(id, navUrl) || isNavigationAllowed(id, navUrl)) return;
      e.preventDefault();
      if (isSafeExternalUrl(navUrl)) shell.openExternal(navUrl);
      if (!call.isDestroyed()) call.close();
    });
    // TEMPORARY calls diagnosis (2026-08-16): surface what the call page
    // does — remove with the other debug lines, do not commit.
    call.webContents.on('did-finish-load', () =>
      console.error(`[calls-debug] call window loaded: ${call.webContents.getURL()}`),
    );
    call.webContents.on('did-navigate', (_e, navUrl, code) =>
      console.error(`[calls-debug] call window did-navigate ${code}: "${navUrl}"`),
    );
    call.webContents.on('page-title-updated', (_e, title) =>
      console.error(`[calls-debug] call window title: "${title}"`),
    );
    call.webContents.on('did-fail-load', (_e, code, desc, failedUrl) =>
      console.error(`[calls-debug] call window FAILED load ${code} "${desc}" ${failedUrl}`),
    );
    call.webContents.on('console-message', (event) =>
      console.error(`[calls-debug] call js[${event.level}]: ${event.message.slice(0, 300)}`),
    );
    call.webContents.on('render-process-gone', (_e, d) =>
      console.error(`[calls-debug] call window GONE reason=${d.reason} exit=${d.exitCode}`),
    );
    call.loadURL(url);
  }

  /** Map a template descriptor to a native item. Only `open-link` reaches the
   *  outside world, and the builder emits it solely for isSafeExternalUrl
   *  URLs — the same gate as the window-open handler above. */
  private menuItemFor(
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
      case 'separator':
        return { type: 'separator' };
    }
  }

  /** Trusted synthetic click; page-JS clicks are untrusted and e.g. Zalo's
   *  session-activation button ignores them. Input only reaches visible
   *  widgets, so a hidden view is flashed visible underneath the active one
   *  (attached at the bottom of the z-order) for the click. */
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
    for (const call of this.callWindows.get(id) ?? []) {
      if (!call.isDestroyed()) call.close();
    }
    this.callWindows.delete(id);
    view.webContents.close();
    this.views.delete(id);
    if (this.activeId === id) this.activeId = null;
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

  layout(): void {
    const [w, h] = this.win.getContentSize();
    const bounds = viewBounds(w, h, this.railPosition());
    for (const view of this.views.values()) view.setBounds(bounds);
    this.overlay?.setBounds(bounds);
  }
}
