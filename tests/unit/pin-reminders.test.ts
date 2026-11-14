import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Pin } from '../../src/main/lib/pin-rules';
import { MuteTimerController } from '../../src/main/mute-timer';
import {
  announceReminders,
  PinReminderController,
  type ReminderAnnounceDeps,
} from '../../src/main/pin-reminders';
import { DEFAULT_SETTINGS } from '../../src/shared/types';

const pin = (id: number, remindAt: number, reminded = false): Pin => ({
  id,
  serviceId: 'zalo',
  text: `pin ${id}`,
  note: '',
  conversation: '',
  href: 'https://chat.zalo.me/',
  at: 1,
  remindAt,
  reminded,
});

function harness(seed: Pin[], opts: { throws?: boolean; marks?: boolean } = {}) {
  const board = { pins: seed };
  const fired: number[][] = [];
  const note = vi.fn();
  const ctl = new PinReminderController({
    pins: () => board.pins,
    note,
    announce: (due) => {
      fired.push(due.map((p) => p.id));
      // the real tail marks them first; an unmarked reminder would fire again
      const ids = new Set(due.map((p) => p.id));
      if (opts.marks !== false) {
        board.pins = board.pins.map((p) => (ids.has(p.id) ? { ...p, reminded: true } : p));
      }
      if (opts.throws) throw new Error('boom');
    },
  });
  return { ctl, board, fired, note };
}

afterEach(() => vi.useRealTimers());

describe('PinReminderController', () => {
  it('fires once when the reminder comes due, then has nothing left to arm', () => {
    vi.useFakeTimers();
    vi.setSystemTime(10_000);
    const { ctl, fired } = harness([pin(1, 70_000)]);
    ctl.start();
    vi.advanceTimersByTime(59_000);
    expect(fired).toEqual([]);
    vi.advanceTimersByTime(2_000);
    expect(fired).toEqual([[1]]);
    vi.advanceTimersByTime(3_600_000);
    expect(fired).toHaveLength(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('announces pins that share an instant together, and later ones in order', () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const { ctl, fired } = harness([pin(1, 30_000), pin(2, 10_000), pin(3, 10_000)]);
    ctl.start();
    vi.advanceTimersByTime(11_000);
    expect(fired).toEqual([[2, 3]]);
    vi.advanceTimersByTime(20_000);
    expect(fired).toEqual([[2, 3], [1]]);
  });

  it('announces at start what came due while the app was closed', () => {
    vi.useFakeTimers();
    vi.setSystemTime(100_000);
    const { ctl, fired } = harness([pin(1, 40_000), pin(2, 50_000, true), pin(3, 0)]);
    ctl.start();
    expect(fired).toEqual([[1]]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('re-arms for a reminder set after start', () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const { ctl, board, fired } = harness([pin(1, 0)]);
    ctl.start();
    expect(vi.getTimerCount()).toBe(0);
    board.pins = [pin(1, 5_000)];
    ctl.rearm();
    vi.advanceTimersByTime(6_000);
    expect(fired).toEqual([[1]]);
  });

  it('waits out a time past setTimeout’s ceiling instead of firing early', () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const far = 2 ** 31 + 60_000;
    const { ctl, fired } = harness([pin(1, far)]);
    ctl.start();
    vi.advanceTimersByTime(2 ** 31);
    expect(fired).toEqual([]);
    expect(vi.getTimerCount()).toBe(1); // re-armed for the remainder
    vi.advanceTimersByTime(61_000);
    expect(fired).toEqual([[1]]);
  });

  it('fires nothing after dispose', () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const { ctl, fired } = harness([pin(1, 5_000)]);
    ctl.start();
    ctl.dispose();
    vi.advanceTimersByTime(60_000);
    expect(fired).toEqual([]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('contains an announce that throws at start: noted, timer still armed', () => {
    vi.useFakeTimers();
    vi.setSystemTime(100_000);
    const { ctl, note } = harness([pin(1, 40_000)], { throws: true, marks: false });
    expect(() => ctl.start()).not.toThrow();
    expect(note).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(1);
  });

  it('retries a thrower that left the pin unmarked no sooner than 60 s later', () => {
    vi.useFakeTimers();
    vi.setSystemTime(100_000);
    const { ctl, fired } = harness([pin(1, 40_000)], { throws: true, marks: false });
    ctl.start();
    expect(fired).toHaveLength(1);
    vi.advanceTimersByTime(59_000);
    expect(fired).toHaveLength(1);
    vi.advanceTimersByTime(2_000);
    expect(fired).toHaveLength(2);
  });

  it('notes a throw after the pins were marked, and never announces them again', () => {
    vi.useFakeTimers();
    vi.setSystemTime(100_000);
    // the real failure: markReminded updates memory, then its write throws
    const { ctl, fired, note } = harness([pin(1, 40_000)], { throws: true });
    ctl.start();
    expect(note).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(3_600_000);
    expect(fired).toHaveLength(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('replaces the pending timer on a second rearm', () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const { ctl } = harness([pin(1, 5_000)]);
    ctl.rearm();
    ctl.rearm();
    expect(vi.getTimerCount()).toBe(1);
  });
});

function announcer(o: { locked?: boolean; front?: boolean } = {}) {
  const state = { locked: o.locked ?? false };
  const calls: string[] = [];
  const log = <T extends unknown[]>(name: string) =>
    vi.fn((..._a: T) => {
      calls.push(name);
    });
  const deps = {
    markReminded: log('mark'),
    broadcast: log('broadcast'),
    endExpiredMutes: log('endExpiredMutes'),
    serviceName: () => 'Zalo',
    locked: () => state.locked,
    inFront: () => {
      const f = o.front ?? true;
      return { visible: f, minimized: false, focused: f };
    },
    sound: vi.fn(() => ({ silent: true })),
    icon: vi.fn(() => 'icon.png' as string | undefined),
    notify: log('notify'),
    toast: log('toast'),
    showWindow: log('showWindow'),
    openPin: log('openPin'),
    openHome: log('openHome'),
  } satisfies ReminderAnnounceDeps & Record<string, unknown>;
  return { deps: deps as ReminderAnnounceDeps & typeof deps, state, calls };
}

describe('announceReminders', () => {
  it('marks reminded before anything else, then broadcasts', () => {
    const { deps, calls } = announcer();
    announceReminders(deps, [pin(1, 1), pin(2, 1)]);
    expect(deps.markReminded).toHaveBeenCalledWith([1, 2]);
    expect(calls.slice(0, 2)).toEqual(['mark', 'broadcast']);
  });

  it('toasts one pin in front and unlocked; its action opens the pin', () => {
    const { deps, calls } = announcer();
    announceReminders(deps, [pin(1, 1)]);
    expect(deps.notify).not.toHaveBeenCalled();
    const [card, on] = deps.toast.mock.calls[0] as unknown as [
      Parameters<ReminderAnnounceDeps['toast']>[0],
      Parameters<ReminderAnnounceDeps['toast']>[1],
    ];
    expect(card).toEqual({
      serviceId: 'zalo',
      small: 'Reminder · Zalo',
      main: 'pin 1',
      action: 'Open',
    });
    calls.length = 0;
    on.action();
    expect(calls).toEqual(['showWindow', 'openPin']);
    expect(deps.openPin).toHaveBeenCalledWith(1);
  });

  const bannerOf = (d: ReturnType<typeof announcer>['deps']) =>
    d.notify.mock.calls[0][0] as unknown as Parameters<ReminderAnnounceDeps['notify']>[0];

  it('banners a redacted notice for one pin while locked', () => {
    const { deps } = announcer({ locked: true });
    announceReminders(deps, [pin(1, 1)]);
    expect(deps.toast).not.toHaveBeenCalled();
    expect(bannerOf(deps)).toMatchObject({ title: 'Zalo', body: '' });
  });

  it('redacts a toast fallback after the lock engaged in between', () => {
    const { deps, state } = announcer();
    announceReminders(deps, [pin(1, 1)]);
    const on = deps.toast.mock.calls[0][1] as unknown as { unavailable(): void };
    state.locked = true;
    on.unavailable();
    expect(bannerOf(deps)).toMatchObject({ title: 'Zalo', body: '' });
  });

  it('opens nothing from a banner click or toast action once locked', () => {
    const { deps, state } = announcer({ front: false });
    announceReminders(deps, [pin(1, 1)]);
    state.locked = true;
    bannerOf(deps).onClick();
    expect(deps.showWindow).toHaveBeenCalledTimes(1);
    expect(deps.openPin).not.toHaveBeenCalled();

    const b = announcer();
    announceReminders(b.deps, [pin(1, 1)]);
    const on = b.deps.toast.mock.calls[0][1] as unknown as { action(): void };
    b.state.locked = true;
    on.action();
    expect(b.deps.showWindow).toHaveBeenCalledTimes(1);
    expect(b.deps.openPin).not.toHaveBeenCalled();
  });

  it('banners several pins even in front, click goes Home, redacted when locked', () => {
    const { deps } = announcer();
    announceReminders(deps, [pin(1, 1), pin(2, 1)]);
    expect(deps.toast).not.toHaveBeenCalled();
    const b = bannerOf(deps);
    expect(b.icon).toBeUndefined();
    // no one service to be muted: a summary's sound follows the global half only
    expect(deps.sound).toHaveBeenCalledWith(null);
    b.onClick();
    expect(deps.openHome).toHaveBeenCalled();

    const l = announcer({ locked: true });
    announceReminders(l.deps, [pin(1, 1), pin(2, 1)]);
    expect(bannerOf(l.deps)).toMatchObject({ title: 'Goetia', body: '' });
  });

  it('carries the sound decision, and the icon for one pin', () => {
    const { deps } = announcer({ front: false });
    announceReminders(deps, [pin(1, 1)]);
    expect(bannerOf(deps)).toMatchObject({ silent: true, icon: 'icon.png' });
    expect(deps.sound).toHaveBeenCalledWith('zalo');
  });

  it('ends expired mutes after marking and before it reads the sound', () => {
    const { deps, calls } = announcer({ front: false });
    announceReminders(deps, [pin(1, 1)]);
    expect(calls.slice(0, 3)).toEqual(['mark', 'broadcast', 'endExpiredMutes']);
    expect(deps.endExpiredMutes.mock.invocationCallOrder[0]).toBeLessThan(
      deps.sound.mock.invocationCallOrder[0],
    );
  });

  // `Until tomorrow 08:00` and `Tomorrow 08:00` are two timers on one instant,
  // and nothing else orders them
  it('sounds a reminder whose mute ends on the same instant, whichever timer fires first', () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const s = {
      muted: { ...DEFAULT_SETTINGS.muted, zalo: true },
      mutedUntil: { ...DEFAULT_SETTINGS.mutedUntil, zalo: 60_000 },
    };
    const mute = new MuteTimerController({
      muted: () => s.muted,
      mutedUntil: () => s.mutedUntil,
      onExpire: (ids) => {
        for (const id of ids) {
          s.muted[id] = false;
          s.mutedUntil[id] = 0;
        }
      },
      globalMuted: () => false,
      globalMutedUntil: () => 0,
      onGlobalExpire: () => {},
    });
    const { deps } = announcer({ front: false });
    deps.endExpiredMutes.mockImplementation(() => mute.expireDue());
    deps.sound.mockImplementation(() => ({ silent: s.muted.zalo }));
    const board = { pins: [pin(1, 60_000)] };
    const ctl = new PinReminderController({
      pins: () => board.pins,
      note: vi.fn(),
      announce: (due) => {
        board.pins = board.pins.map((p) => ({ ...p, reminded: true }));
        announceReminders(deps, due);
      },
    });
    // armed first, so its timer runs first: the order that left the mute standing
    ctl.start();
    mute.start();
    vi.advanceTimersByTime(61_000);
    expect(bannerOf(deps)).toMatchObject({ silent: false });
    expect(s.muted.zalo).toBe(false);
    ctl.dispose();
    mute.dispose();
  });
});
