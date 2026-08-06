// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { installNotificationShim } from '../../src/preload/lib/notification-shim';

function freshWindow(): Window & typeof globalThis {
  // happy-dom's window, but with a stubbed ServiceWorkerRegistration like real Chromium
  const win = window as Window & typeof globalThis;
  // biome-ignore lint/suspicious/noExplicitAny: test double for a browser global
  (win as any).ServiceWorkerRegistration = class {
    showNotification(_title: string, _options?: NotificationOptions): Promise<void> {
      throw new Error('native showNotification must be replaced');
    }
  };
  return win;
}

describe('notification shim', () => {
  it('replaces window.Notification and forwards constructor calls', () => {
    const forward = vi.fn();
    const win = freshWindow();
    installNotificationShim(win, forward);
    const n = new win.Notification('hello', { body: 'world' });
    expect(forward).toHaveBeenCalledWith('hello', 'world');
    expect(n.close).toBeTypeOf('function');
  });

  it('reports permission granted, including the legacy callback form', async () => {
    const win = freshWindow();
    installNotificationShim(win, vi.fn());
    expect(win.Notification.permission).toBe('granted');
    const cb = vi.fn();
    await expect(win.Notification.requestPermission(cb)).resolves.toBe('granted');
    expect(cb).toHaveBeenCalledWith('granted');
  });

  it('reroutes ServiceWorkerRegistration.showNotification into the shim', async () => {
    const forward = vi.fn();
    const win = freshWindow();
    installNotificationShim(win, forward);
    // biome-ignore lint/suspicious/noExplicitAny: test double for a browser global
    const reg = new (win as any).ServiceWorkerRegistration();
    await expect(reg.showNotification('sw title', { body: 'sw body' })).resolves.toBeUndefined();
    expect(forward).toHaveBeenCalledWith('sw title', 'sw body');
  });

  it('tolerates missing ServiceWorkerRegistration', () => {
    const win = freshWindow();
    // biome-ignore lint/suspicious/noExplicitAny: test double for a browser global
    (win as any).ServiceWorkerRegistration = undefined;
    expect(() => installNotificationShim(win, vi.fn())).not.toThrow();
  });
});
