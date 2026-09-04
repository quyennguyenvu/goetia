// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { ACTIVITY_CAP } from '../../src/main/lib/activity-log';
import { installNotificationShim, REGISTRY_CAP } from '../../src/preload/lib/notification-shim';

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
    expect(forward).toHaveBeenCalledWith('hello', 'world', 1);
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
    expect(forward).toHaveBeenCalledWith('sw title', 'sw body', 1);
  });

  it('tolerates missing ServiceWorkerRegistration', () => {
    const win = freshWindow();
    // biome-ignore lint/suspicious/noExplicitAny: test double for a browser global
    (win as any).ServiceWorkerRegistration = undefined;
    expect(() => installNotificationShim(win, vi.fn())).not.toThrow();
  });

  it('replays the page onclick and click listeners for a registered id', () => {
    const forward = vi.fn();
    const win = freshWindow();
    const shim = installNotificationShim(win, forward);
    const n = new win.Notification('t');
    const id = forward.mock.calls[0][2] as number;
    const onclick = vi.fn();
    const listener = vi.fn();
    // biome-ignore lint/suspicious/noExplicitAny: page-side assignment
    (n as any).onclick = onclick;
    n.addEventListener('click', listener);
    shim.replayClick(id);
    expect(onclick).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(onclick.mock.calls[0][0].type).toBe('click');
  });

  it('a throwing page handler does not break replay of the rest', () => {
    const forward = vi.fn();
    const win = freshWindow();
    const shim = installNotificationShim(win, forward);
    const n = new win.Notification('t');
    const id = forward.mock.calls[0][2] as number;
    const listener = vi.fn();
    // biome-ignore lint/suspicious/noExplicitAny: page-side assignment
    (n as any).onclick = () => {
      throw new Error('page bug');
    };
    n.addEventListener('click', listener);
    expect(() => shim.replayClick(id)).not.toThrow();
    expect(listener).toHaveBeenCalledTimes(1);
  });

  // the site closes its banner on a timer or when the thread is read elsewhere;
  // its onclick still leads to that thread, which is exactly where a ⌘K row
  // for it should land — the 2026-09-04 "recents do nothing" report
  it('a closed notification still replays — the handler still names the thread', () => {
    const forward = vi.fn();
    const win = freshWindow();
    const shim = installNotificationShim(win, forward);
    const n = new win.Notification('t');
    const id = forward.mock.calls[0][2] as number;
    const onclick = vi.fn();
    // biome-ignore lint/suspicious/noExplicitAny: page-side assignment
    (n as any).onclick = onclick;
    n.close();
    expect(shim.replayClick(id)).toBe(true);
    expect(onclick).toHaveBeenCalledTimes(1);
  });

  it('reports a hit even when the page attached no handler', () => {
    const forward = vi.fn();
    const win = freshWindow();
    const shim = installNotificationShim(win, forward);
    new win.Notification('t');
    expect(shim.replayClick(forward.mock.calls[0][2] as number)).toBe(true);
  });

  // the recents list keeps ACTIVITY_CAP rows; a smaller registry made every
  // row past the cap dead on arrival
  it('keeps at least as many handles as the recents list keeps rows', () => {
    expect(REGISTRY_CAP).toBeGreaterThanOrEqual(ACTIVITY_CAP);
  });

  it('caps the registry at REGISTRY_CAP, evicting the oldest', () => {
    const forward = vi.fn();
    const win = freshWindow();
    const shim = installNotificationShim(win, forward);
    const first = new win.Notification('first');
    const firstId = forward.mock.calls[0][2] as number;
    const onclick = vi.fn();
    // biome-ignore lint/suspicious/noExplicitAny: page-side assignment
    (first as any).onclick = onclick;
    for (let i = 0; i < REGISTRY_CAP - 1; i++) new win.Notification(`n${i}`);
    expect(shim.replayClick(firstId)).toBe(true);
    new win.Notification('one too many');
    expect(shim.replayClick(firstId)).toBe(false);
    expect(onclick).toHaveBeenCalledTimes(1);
  });

  it('an unknown id is a reported miss', () => {
    const shim = installNotificationShim(freshWindow(), vi.fn());
    expect(shim.replayClick(999)).toBe(false);
  });
});
