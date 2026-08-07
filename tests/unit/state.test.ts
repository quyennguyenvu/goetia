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
});
