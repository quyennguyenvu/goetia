export type NotifyForward = (title: string, body: string) => void;

/** Replace the page's Notification API with a proxy that forwards to main.
 *  Covers the constructor, the legacy callback form of requestPermission
 *  (old Facebook code awaits the callback, not the promise), and page-side
 *  ServiceWorkerRegistration.showNotification (Messenger fires through it;
 *  Electron never displays SW notifications, so reroute them here). */
export function installNotificationShim(
  win: Window & typeof globalThis,
  forward: NotifyForward,
): void {
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
      forward(title, typeof options?.body === 'string' ? options.body : '');
    }
    close(): void {}
    addEventListener(): void {}
    removeEventListener(): void {}
    dispatchEvent(): boolean {
      return false;
    }
  }

  // biome-ignore lint/suspicious/noExplicitAny: intentionally replacing page globals
  (win as any).Notification = GoetiaNotification;

  // biome-ignore lint/suspicious/noExplicitAny: intentionally replacing page globals
  const swReg = (win as any).ServiceWorkerRegistration;
  if (swReg?.prototype) {
    swReg.prototype.showNotification = function showNotification(
      title = '',
      options?: NotificationOptions,
    ): Promise<void> {
      new GoetiaNotification(title, options);
      return Promise.resolve();
    };
  }
}
