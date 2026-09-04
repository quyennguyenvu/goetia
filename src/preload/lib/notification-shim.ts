export type NotifyForward = (title: string, body: string, clickId: number) => void;

export interface NotificationShimHandle {
  /** Fire the page's own click handlers for the banner the user clicked.
   *  False when the registry no longer holds the id (evicted, or a different
   *  document's id) — the caller's cue to try another lane. */
  replayClick(clickId: number): boolean;
}

/** Registered instances kept for replay; oldest evicted past this. Sized to
 *  the recents list (ACTIVITY_CAP, asserted in the shim test): a smaller
 *  registry left every ⌘K row past it dead on arrival. The registry lives
 *  and dies with the page's JS context — correct, since the handlers it
 *  holds are page closures. */
export const REGISTRY_CAP = 50;

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
      clickListeners.set(this, new Set());
      live.set(id, this);
      if (live.size > REGISTRY_CAP) {
        const oldest = live.keys().next().value;
        if (oldest !== undefined) live.delete(oldest);
      }
      // title too: main re-checks, but a non-string must not cross IPC at all
      forward(
        typeof title === 'string' ? title : '',
        typeof options?.body === 'string' ? options.body : '',
        id,
      );
    }
    close(): void {
      // deliberately kept in the registry: sites close banners on a timer or
      // when the thread is read elsewhere, and the onclick still leads to
      // that thread — which is where a recents row for it should land
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
    replayClick(clickId: number): boolean {
      const n = live.get(clickId);
      if (!n) return false;
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
      return true;
    },
  };
}
