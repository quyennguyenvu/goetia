export type NotifyForward = (title: string, body: string, clickId: number) => void;

export interface NotificationShimHandle {
  /** Fire the page's own click handlers for the banner the user clicked. */
  replayClick(clickId: number): void;
}

/** Registered instances kept for replay; oldest evicted past this. The
 *  registry lives and dies with the page's JS context — correct, since the
 *  handlers it holds are page closures. */
const REGISTRY_CAP = 20;

/** Replace the page's Notification API with a proxy that forwards to main.
 *  Covers the constructor, the legacy callback form of requestPermission
 *  (old Facebook code awaits the callback, not the promise), and page-side
 *  ServiceWorkerRegistration.showNotification (Messenger fires through it;
 *  Electron never displays SW notifications, so reroute them here). Each
 *  instance registers under a clickId so main can replay the site's own
 *  onclick — the site's "focus this thread" code — when the user clicks
 *  Goetia's banner. */
export function installNotificationShim(
  win: Window & typeof globalThis,
  forward: NotifyForward,
): NotificationShimHandle {
  let nextId = 1;
  const live = new Map<number, GoetiaNotification>();
  const ids = new WeakMap<GoetiaNotification, number>();
  const clickListeners = new WeakMap<GoetiaNotification, Set<EventListener>>();

  class GoetiaNotification {
    static permission: NotificationPermission = 'granted';
    static requestPermission(
      cb?: (permission: NotificationPermission) => void,
    ): Promise<NotificationPermission> {
      cb?.('granted');
      return Promise.resolve('granted');
    }
    onclick: unknown = null;
    onshow: unknown = null;
    onerror: unknown = null;
    onclose: unknown = null;
    constructor(title: string, options?: NotificationOptions) {
      const id = nextId++;
      ids.set(this, id);
      clickListeners.set(this, new Set());
      live.set(id, this);
      if (live.size > REGISTRY_CAP) {
        const oldest = live.keys().next().value;
        if (oldest !== undefined) live.delete(oldest);
      }
      forward(title, typeof options?.body === 'string' ? options.body : '', id);
    }
    close(): void {
      // a banner the site closed (read elsewhere) must not replay
      const id = ids.get(this);
      if (id !== undefined) live.delete(id);
    }
    addEventListener(type: string, fn: EventListener): void {
      if (type === 'click' && typeof fn === 'function') clickListeners.get(this)?.add(fn);
    }
    removeEventListener(type: string, fn: EventListener): void {
      if (type === 'click') clickListeners.get(this)?.delete(fn);
    }
    dispatchEvent(): boolean {
      return false;
    }
  }

  // biome-ignore lint/suspicious/noExplicitAny: intentionally replacing page globals
  (win as any).Notification = GoetiaNotification;

  // biome-ignore lint/suspicious/noExplicitAny: intentionally replacing page globals
  const swReg = (win as any).ServiceWorkerRegistration;
  if (swReg?.prototype) {
    // the page never holds the SW-rerouted instance, so no handler can
    // attach — it registers harmlessly and only ever falls back
    swReg.prototype.showNotification = function showNotification(
      title = '',
      options?: NotificationOptions,
    ): Promise<void> {
      new GoetiaNotification(title, options);
      return Promise.resolve();
    };
  }

  return {
    replayClick(clickId: number): void {
      const n = live.get(clickId);
      if (!n) return;
      const ev = new win.Event('click');
      const handlers: unknown[] = [n.onclick, ...(clickListeners.get(n) ?? [])];
      for (const fn of handlers) {
        if (typeof fn !== 'function') continue;
        try {
          fn.call(n, ev);
        } catch {
          // page handler errors stay the page's problem
        }
      }
    },
  };
}
