import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BANNER_ROWS_MAX,
  BannerRegistry,
  BannerShelf,
  HELD_BANNERS_MAX,
} from '../../src/main/banners';
import { ZERO_DWELL_MS } from '../../src/main/lib/banner-clear-rules';
import type { ServiceId } from '../../src/shared/types';

/** a banner the OS already has */
function shown(reg: BannerRegistry, id: number, serviceId: ServiceId = 'telegram') {
  const handle = { close: vi.fn() };
  reg.add(id, serviceId, handle);
  reg.noteShown(id);
  return handle;
}

describe('BannerRegistry', () => {
  it('closes an entry once and forgets it', () => {
    const reg = new BannerRegistry();
    const h = shown(reg, 1);
    reg.closeEntries([1, 99]);
    reg.closeEntries([1]);
    expect(h.close).toHaveBeenCalledTimes(1);
    expect(reg.size).toBe(0);
  });

  it('closes one service and leaves the others', () => {
    const reg = new BannerRegistry();
    const a = shown(reg, 1, 'telegram');
    const b = shown(reg, 2, 'discord');
    const c = shown(reg, 3, 'telegram');
    reg.closeService('telegram');
    expect(a.close).toHaveBeenCalled();
    expect(c.close).toHaveBeenCalled();
    expect(b.close).not.toHaveBeenCalled();
    expect(reg.size).toBe(1);
  });

  it('closes everything', () => {
    const reg = new BannerRegistry();
    const a = shown(reg, 1, 'telegram');
    const b = shown(reg, 2, 'discord');
    reg.closeAll();
    expect(a.close).toHaveBeenCalled();
    expect(b.close).toHaveBeenCalled();
  });

  it('defers a close asked before the OS has the banner', () => {
    // on macOS close() before the request is scheduled removes nothing
    const reg = new BannerRegistry();
    const h = { close: vi.fn() };
    reg.add(1, 'telegram', h);
    reg.closeEntries([1]);
    expect(h.close).not.toHaveBeenCalled();
    reg.noteShown(1);
    expect(h.close).toHaveBeenCalledTimes(1);
    expect(reg.size).toBe(0);
  });

  it('forgets a banner that never reached the OS', () => {
    const reg = new BannerRegistry();
    const h = { close: vi.fn() };
    reg.add(1, 'telegram', h);
    reg.forget(1);
    reg.noteShown(1);
    reg.closeEntries([1]);
    expect(h.close).not.toHaveBeenCalled();
  });

  it('survives a close that re-enters the registry', () => {
    // Electron emits `close` synchronously from close()
    const reg = new BannerRegistry();
    const h = { close: vi.fn(() => reg.closeEntries([1])) };
    reg.add(1, 'telegram', h);
    reg.noteShown(1);
    reg.closeEntries([1]);
    expect(h.close).toHaveBeenCalledTimes(1);
  });

  it('never outgrows its hard cap, even if show is never reported', () => {
    const reg = new BannerRegistry();
    for (let i = 1; i <= BANNER_ROWS_MAX + 3; i++) reg.add(i, 'telegram', { close: vi.fn() });
    expect(reg.size).toBe(BANNER_ROWS_MAX);
  });
});

describe('BannerRegistry zero dwell', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const zero = { kind: 'count', direct: 0, indirect: 0 } as const;

  it("closes a service's banners once its zero has stood for the dwell", () => {
    const reg = new BannerRegistry();
    const mine = shown(reg, 1, 'telegram');
    const other = shown(reg, 2, 'discord');
    reg.noteZero('telegram', { kind: 'ready' });
    reg.noteZero('telegram', zero);
    vi.advanceTimersByTime(ZERO_DWELL_MS - 1);
    expect(mine.close).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(mine.close).toHaveBeenCalledTimes(1);
    expect(other.close).not.toHaveBeenCalled();
  });

  it('a bare zero from an unready page clears nothing', () => {
    const reg = new BannerRegistry();
    const h = shown(reg, 1);
    reg.noteZero('telegram', zero);
    vi.advanceTimersByTime(ZERO_DWELL_MS * 2);
    expect(h.close).not.toHaveBeenCalled();
  });

  it.each([
    ['a new count', { kind: 'count', direct: 2, indirect: 0 }],
    ['a stale report', { kind: 'stale' }],
    ['a navigation', { kind: 'navigated' }],
    ['a destroyed view', { kind: 'destroyed' }],
  ] as const)('%s inside the dwell cancels the clear', (_name, event) => {
    const reg = new BannerRegistry();
    const h = shown(reg, 1);
    reg.noteZero('telegram', { kind: 'ready' });
    reg.noteZero('telegram', zero);
    vi.advanceTimersByTime(ZERO_DWELL_MS - 1);
    reg.noteZero('telegram', event);
    vi.advanceTimersByTime(ZERO_DWELL_MS * 2);
    expect(h.close).not.toHaveBeenCalled();
  });

  it('dispose drops a pending clear and arms nothing afterwards', () => {
    const reg = new BannerRegistry();
    const h = shown(reg, 1);
    reg.noteZero('telegram', { kind: 'ready' });
    reg.noteZero('telegram', zero);
    reg.dispose();
    reg.noteZero('telegram', { kind: 'navigated' });
    reg.noteZero('telegram', { kind: 'ready' });
    reg.noteZero('telegram', zero);
    vi.advanceTimersByTime(ZERO_DWELL_MS * 2);
    expect(h.close).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
});

// download banners have no log entry to hang a registry row on
describe('BannerShelf', () => {
  it('keeps the newest banners and closes the one it lets go', () => {
    const shelf = new BannerShelf();
    const first = { close: vi.fn() };
    shelf.hold(first);
    for (let i = 1; i < HELD_BANNERS_MAX; i++) shelf.hold({ close: vi.fn() });
    expect(first.close).not.toHaveBeenCalled();
    shelf.hold({ close: vi.fn() });
    expect(first.close).toHaveBeenCalledTimes(1);
    expect(shelf.size).toBe(HELD_BANNERS_MAX);
  });

  it('a released banner is never closed', () => {
    const shelf = new BannerShelf();
    const h = { close: vi.fn() };
    shelf.hold(h);
    shelf.release(h);
    shelf.release(h);
    shelf.closeAll();
    expect(h.close).not.toHaveBeenCalled();
    expect(shelf.size).toBe(0);
  });

  it('closes everything it still holds, once', () => {
    const shelf = new BannerShelf();
    const a = { close: vi.fn() };
    // Electron emits `close` synchronously from close()
    const b = { close: vi.fn(() => shelf.closeAll()) };
    shelf.hold(a);
    shelf.hold(b);
    shelf.closeAll();
    expect(a.close).toHaveBeenCalledTimes(1);
    expect(b.close).toHaveBeenCalledTimes(1);
    expect(shelf.size).toBe(0);
  });
});
