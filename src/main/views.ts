import { join } from 'node:path';
import { type BrowserWindow, session, shell, WebContentsView } from 'electron';
import { serviceById } from '../shared/services';
import type { RailPosition, ServiceId } from '../shared/types';
import { viewBounds } from './lib/layout';

export interface ViewHooks {
  onLoading(id: ServiceId, loading: boolean): void;
  onCrashed(id: ServiceId): void;
  onLoadFailed(id: ServiceId): void;
}

export class ServiceViewManager {
  activeId: ServiceId | null = null;
  private views = new Map<ServiceId, WebContentsView>();

  constructor(
    private win: BrowserWindow,
    private hooks: ViewHooks,
    private railPosition: () => RailPosition,
  ) {
    win.on('resize', () => this.layout());
  }

  has(id: ServiceId): boolean {
    return this.views.has(id);
  }

  private configureSession(id: ServiceId) {
    const ses = session.fromPartition(`persist:${id}`);
    const wanted = ['en-US', 'vi'];
    ses.setSpellCheckerLanguages(
      wanted.filter((l) => ses.availableSpellCheckerLanguages.includes(l)),
    );
    ses.setPermissionRequestHandler((_wc, permission, cb) =>
      cb(permission === 'notifications' || permission === 'media'),
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
        // hidden views must keep polling recipes and receiving pushes
        backgroundThrottling: false,
        additionalArguments: [`--goetia-service=${id}`],
      },
    });
    const wc = view.webContents;
    wc.setWindowOpenHandler(({ url }) => {
      // external links open in the OS browser, never inside Goetia
      shell.openExternal(url);
      return { action: 'deny' };
    });
    wc.on('before-input-event', (_e, input) => {
      // F5 reload while focus is inside the service page (menu covers Cmd/Ctrl+R)
      if (input.type === 'keyDown' && input.key === 'F5') this.refresh(id);
    });
    wc.on('did-start-loading', () => this.hooks.onLoading(id, true));
    wc.on('did-finish-load', () => this.hooks.onLoading(id, false));
    wc.on('render-process-gone', () => this.hooks.onCrashed(id));
    wc.on('did-fail-load', (_e, code, _desc, _url, isMainFrame) => {
      if (isMainFrame && code !== -3) this.hooks.onLoadFailed(id);
    });
    wc.loadURL(svc.url);
    this.views.set(id, view);
    return view;
  }

  /** Create the view (starts loading, recipes, notifications) without showing it. */
  ensure(id: ServiceId): void {
    if (!this.views.has(id)) this.create(id);
  }

  activate(id: ServiceId): void {
    const view = this.views.get(id) ?? this.create(id);
    for (const [otherId, v] of this.views) {
      if (otherId !== id) v.setVisible(false);
    }
    if (!this.win.contentView.children.includes(view)) this.win.contentView.addChildView(view);
    view.setVisible(true);
    this.activeId = id;
    this.layout();
    // keyboard (incl. Tab) goes into the service, not the shell rail
    view.webContents.focus();
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
    this.win.contentView.removeChildView(view);
    view.webContents.close();
    this.views.delete(id);
    if (this.activeId === id) this.activeId = null;
  }

  reload(id: ServiceId): void {
    this.views.get(id)?.webContents.reload();
  }

  /** Reload a live service; re-shows the active view if a failed load hid it. */
  refresh(id: ServiceId): void {
    if (!this.views.has(id)) return; // hibernated/never-created: nothing to reload
    if (this.activeId === id) this.activate(id);
    this.reload(id);
  }

  layout(): void {
    if (!this.activeId) return;
    const [w, h] = this.win.getContentSize();
    this.views.get(this.activeId)?.setBounds(viewBounds(w, h, this.railPosition()));
  }
}
