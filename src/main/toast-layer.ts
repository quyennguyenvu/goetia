import { join } from 'node:path';
import {
  type BrowserWindow,
  MessageChannelMain,
  type MessagePortMain,
  WebContentsView,
} from 'electron';
import type { MainToRenderer } from '../shared/ipc';
import type { ServiceId } from '../shared/types';
import type { ViewBounds } from './lib/layout';
import {
  parseToastReply,
  pauseClock,
  resumeClock,
  startClock,
  TOAST_LAYER_IDLE_MS,
  type ToastClock,
  type ToastReply,
  toastBounds,
} from './lib/toast-layer-rules';

export interface ToastCard {
  serviceId: ServiceId;
  small: string;
  main: string;
  action: string | null;
}

export interface ToastHandlers {
  /** the card's action was clicked */
  action(): void;
  /** the layer could not show this toast; the caller announces another way */
  unavailable(): void;
}

export interface ToastLayerDeps {
  win: BrowserWindow;
  theme(): 'light' | 'dark';
  color(id: ServiceId): string;
  /** the service views' rect, so the toast follows the rail position */
  contentBounds(): ViewBounds;
  /** hand the keyboard back to whatever had it before a click on the toast */
  restoreFocus(): void;
  note(line: string): void;
}

interface Current {
  card: ToastCard;
  on: ToastHandlers;
  shown: boolean;
}

/** One toast at a time on its own view above the service page — the only way
 *  a toast is seen while a page covers the shell. The view exists only around
 *  toasts; the page is told what to draw and answers on a port minted here,
 *  so the layer adds no IPC channel and can never name a file. */
export class ToastLayer {
  private view: WebContentsView | null = null;
  private loaded = false;
  private visible = false;
  private current: Current | null = null;
  private port: MessagePortMain | null = null;
  private clock: ToastClock | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private idle: ReturnType<typeof setTimeout> | null = null;

  constructor(private deps: ToastLayerDeps) {}

  /** Newest wins: a toast replaces the one on screen and restarts the clock. */
  show(card: ToastCard, on: ToastHandlers): void {
    if (this.deps.win.isDestroyed()) {
      on.unavailable();
      return;
    }
    this.clearIdle();
    this.current = { card, on, shown: false };
    if (!this.view) this.create();
    else if (this.loaded) this.present();
    // else: still loading, did-finish-load presents whatever is current
  }

  /** Take the toast down. One that never reached the screen is handed back
   *  to its caller, so a lock or a hidden window turns it into the banner. */
  hide(): void {
    const cur = this.current;
    this.current = null;
    this.disarm();
    this.clock = null;
    this.port?.close();
    this.port = null;
    if (this.visible && this.view) {
      // a click focused this view, which has no chord interceptor
      const focused = !this.view.webContents.isDestroyed() && this.view.webContents.isFocused();
      this.view.setVisible(false);
      this.visible = false;
      if (focused) this.deps.restoreFocus();
    }
    if (cur && !cur.shown) cur.on.unavailable();
    this.armIdle();
  }

  /** The content rect moved (resize, rail position). */
  layout(): void {
    if (this.visible && this.view) this.view.setBounds(toastBounds(this.deps.contentBounds()));
  }

  /** Back to the top after a service view or the waking cover was re-stacked. */
  raise(): void {
    if (!this.visible || !this.view || this.deps.win.isDestroyed()) return;
    this.deps.win.contentView.addChildView(this.view);
  }

  dispose(): void {
    this.current = null;
    this.disarm();
    this.clearIdle();
    this.clock = null;
    this.port?.close();
    this.port = null;
    this.destroyView();
  }

  private create(): void {
    const view = new WebContentsView({
      webPreferences: {
        preload: join(__dirname, '../preload/toast.cjs'),
        contextIsolation: true,
        sandbox: true,
      },
    });
    view.setBackgroundColor('#00000000');
    view.setVisible(false);
    this.view = view;
    this.loaded = false;
    const wc = view.webContents;
    // the page never goes anywhere: only a reload of itself (dev HMR) passes
    wc.on('will-navigate', (e, url) => {
      if (url !== wc.getURL()) e.preventDefault();
    });
    wc.setWindowOpenHandler(() => ({ action: 'deny' }));
    wc.on('did-finish-load', () => {
      if (this.view !== view) return;
      this.loaded = true;
      if (this.current && !this.current.shown) this.present();
    });
    wc.on('did-fail-load', (_e, code, _desc, _url, isMainFrame) => {
      if (this.view === view && isMainFrame && code !== -3) this.fail(`load ${code}`);
    });
    wc.on('render-process-gone', (_e, details) => {
      if (this.view === view) this.fail(details.reason);
    });
    if (process.env.ELECTRON_RENDERER_URL) {
      wc.loadURL(`${process.env.ELECTRON_RENDERER_URL}/toast.html`);
    } else {
      wc.loadFile(join(__dirname, '../renderer/toast.html'));
    }
  }

  private present(): void {
    const cur = this.current;
    const view = this.view;
    if (!cur || !view || this.deps.win.isDestroyed() || view.webContents.isDestroyed()) return;
    cur.shown = true;
    this.port?.close();
    const { port1, port2 } = new MessageChannelMain();
    this.port = port1;
    // a late message on a replaced toast's port is not this toast's
    port1.on('message', (e) => {
      if (this.port === port1) this.onReply(parseToastReply(e.data));
    });
    port1.start();
    const payload: MainToRenderer['toast:show'] = {
      ...cur.card,
      color: this.deps.color(cur.card.serviceId),
      theme: this.deps.theme(),
    };
    view.webContents.postMessage('toast:show', payload, [port2]);
    view.setBounds(toastBounds(this.deps.contentBounds()));
    // re-added every time, so it lands above the views and the waking cover
    this.deps.win.contentView.addChildView(view);
    view.setVisible(true);
    this.visible = true;
    this.clock = startClock(Date.now());
    this.arm();
  }

  private onReply(reply: ToastReply | null): void {
    if (!reply || !this.visible || !this.clock) return;
    if (reply === 'enter') {
      this.clock = pauseClock(this.clock, Date.now());
      this.disarm();
      return;
    }
    if (reply === 'leave') {
      this.clock = resumeClock(this.clock, Date.now());
      this.arm();
      return;
    }
    const cur = this.current;
    this.hide();
    if (reply === 'reveal' && cur && cur.card.action !== null) cur.on.action();
  }

  /** The page failed to load or its renderer died. The next toast builds a
   *  fresh view; one that had not been shown yet falls back to the banner. */
  private fail(reason: string): void {
    const cur = this.current;
    this.current = null;
    this.disarm();
    this.clearIdle();
    this.clock = null;
    this.port?.close();
    this.port = null;
    this.destroyView();
    this.deps.note(`toast layer failed: ${reason}`);
    if (cur && !cur.shown) cur.on.unavailable();
  }

  private arm(): void {
    this.disarm();
    if (!this.clock || this.clock.runningSince === null) return;
    this.timer = setTimeout(() => this.hide(), this.clock.remaining);
  }

  private disarm(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }

  private armIdle(): void {
    this.clearIdle();
    if (!this.view) return;
    this.idle = setTimeout(() => {
      this.idle = null;
      if (!this.current) this.destroyView();
    }, TOAST_LAYER_IDLE_MS);
  }

  private clearIdle(): void {
    if (this.idle !== null) clearTimeout(this.idle);
    this.idle = null;
  }

  private destroyView(): void {
    const view = this.view;
    if (!view) return;
    // cleared first: the close below must not read as a renderer death
    this.view = null;
    this.loaded = false;
    this.visible = false;
    const { win } = this.deps;
    if (!win.isDestroyed() && win.contentView.children.includes(view)) {
      win.contentView.removeChildView(view);
    }
    if (!view.webContents.isDestroyed()) view.webContents.close();
  }
}
