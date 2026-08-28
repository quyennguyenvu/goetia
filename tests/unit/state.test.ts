import { describe, expect, it, vi } from 'vitest';
import { MainState } from '../../src/main/state';
import { DEFAULT_SETTINGS } from '../../src/shared/types';

describe('MainState', () => {
  it('snapshot orders services per settings and resolves runtime', () => {
    const s = new MainState();
    s.setRuntime('discord', { unread: { direct: 4, indirect: 1 } });
    const snap = s.snapshot(
      { ...DEFAULT_SETTINGS, order: ['discord', 'whatsapp', 'messenger', 'telegram', 'zalo'] },
      'dark',
      '0.1.0',
      false,
    );
    expect(snap.services[0].id).toBe('discord');
    expect(snap.runtime.discord.unread.direct).toBe(4);
    expect(snap.runtime.zalo.unread.direct).toBe(0); // untouched services get defaults
    expect(snap.theme).toBe('dark');
  });

  it('new runtimes start not waking', () => {
    const s = new MainState();
    expect(s.runtime('messenger').waking).toBe(false);
  });

  it('notifies subscribers on mutation', () => {
    const s = new MainState();
    const cb = vi.fn();
    s.onChange(cb);
    s.setRuntime('zalo', { hibernated: true });
    s.activeId = 'telegram'; // plain field write does not notify…
    s.touch(); // …explicit touch() does
    expect(cb).toHaveBeenCalledTimes(2);
  });

  it('does not notify when a patch changes nothing', () => {
    const s = new MainState();
    const cb = vi.fn();
    s.setRuntime('zalo', { stale: true }); // first change notifies
    s.onChange(cb);
    s.setRuntime('zalo', { stale: true }); // identical -> no notify
    expect(cb).not.toHaveBeenCalled();
    s.setRuntime('zalo', { stale: false }); // real change -> notify
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('snapshots capTrimmed, defaulting to empty', () => {
    const s = new MainState();
    expect(s.snapshot(DEFAULT_SETTINGS, 'dark', '0.1.0', false).capTrimmed).toEqual([]);
    s.capTrimmed = ['zalo'];
    const snap = s.snapshot(DEFAULT_SETTINGS, 'dark', '0.1.0', false);
    expect(snap.capTrimmed).toEqual(['zalo']);
    // a copy, not the live array
    snap.capTrimmed.push('shopee');
    expect(s.capTrimmed).toEqual(['zalo']);
  });

  it('snapshots pins, defaulting to empty', () => {
    const s = new MainState();
    expect(s.snapshot(DEFAULT_SETTINGS, 'dark', '0.1.0', false).pins).toEqual([]);
    const pins = [
      { id: 1, serviceId: 'zalo' as const, text: 'x', note: '', conversation: '', at: 1 },
    ];
    expect(s.snapshot(DEFAULT_SETTINGS, 'dark', '0.1.0', false, pins).pins).toEqual(pins);
  });

  it('starts with no update known', () => {
    const s = new MainState();
    expect(s.update).toEqual({ status: 'idle', latest: null, announce: null });
  });

  it('does not notify when an update patch changes nothing', () => {
    const s = new MainState();
    s.setUpdate({ status: 'available', latest: '0.3.0' });
    const cb = vi.fn();
    s.onChange(cb);
    s.setUpdate({ status: 'available', latest: '0.3.0' }); // identical -> no notify
    expect(cb).not.toHaveBeenCalled();
    s.setUpdate({ announce: '0.3.0' }); // real change -> notify
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('snapshot carries the update slice', () => {
    const s = new MainState();
    s.setUpdate({ status: 'available', latest: '0.3.0', announce: '0.3.0' });
    const snap = s.snapshot(DEFAULT_SETTINGS, 'dark', '0.2.0', false);
    expect(snap.update).toEqual({ status: 'available', latest: '0.3.0', announce: '0.3.0' });
  });

  it('snapshot carries quietActive', () => {
    const s = new MainState();
    expect(s.snapshot(DEFAULT_SETTINGS, 'dark', '0.1.0', true).quietActive).toBe(true);
    expect(s.snapshot(DEFAULT_SETTINGS, 'dark', '0.1.0', false).quietActive).toBe(false);
  });

  it('snapshot carries summonHotkeyOk, defaulting true', () => {
    const s = new MainState();
    expect(s.snapshot(DEFAULT_SETTINGS, 'dark', '0.1.0', false).summonHotkeyOk).toBe(true);
    s.summonHotkeyOk = false;
    expect(s.snapshot(DEFAULT_SETTINGS, 'dark', '0.1.0', false).summonHotkeyOk).toBe(false);
  });
});
