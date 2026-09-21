import { afterEach, describe, expect, it, vi } from 'vitest';
import { MuteTimerController } from '../../src/main/mute-timer';
import { DEFAULT_SETTINGS, type ServiceId } from '../../src/shared/types';

function harness(
  muted: Partial<Record<ServiceId, boolean>>,
  until: Partial<Record<ServiceId, number>>,
  global: { muted: boolean; until: number } = { muted: false, until: 0 },
) {
  const state = {
    muted: { ...DEFAULT_SETTINGS.muted, ...muted },
    mutedUntil: { ...DEFAULT_SETTINGS.mutedUntil, ...until },
    globalMuted: global.muted,
    globalMutedUntil: global.until,
  };
  const expired: (ServiceId[] | 'global')[] = [];
  const ctl = new MuteTimerController({
    muted: () => state.muted,
    mutedUntil: () => state.mutedUntil,
    onExpire: (ids) => {
      expired.push(ids);
      // the real tail unmutes and zeroes the expiry; mirror that here
      for (const id of ids) {
        state.muted[id] = false;
        state.mutedUntil[id] = 0;
      }
    },
    globalMuted: () => state.globalMuted,
    globalMutedUntil: () => state.globalMutedUntil,
    onGlobalExpire: () => {
      expired.push('global');
      state.globalMuted = false;
      state.globalMutedUntil = 0;
    },
  });
  return { ctl, state, expired };
}

afterEach(() => vi.useRealTimers());

describe('MuteTimerController', () => {
  it('fires once at the expiry, then has nothing left to arm', () => {
    vi.useFakeTimers();
    vi.setSystemTime(10_000);
    const { ctl, expired } = harness({ zalo: true }, { zalo: 70_000 });
    ctl.start();
    vi.advanceTimersByTime(59_000);
    expect(expired).toEqual([]);
    vi.advanceTimersByTime(2_000);
    expect(expired).toEqual([['zalo']]);
    vi.advanceTimersByTime(3_600_000);
    expect(expired).toHaveLength(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('fires two staggered expiries in order', () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const { ctl, expired } = harness({ zalo: true, slack: true }, { zalo: 30_000, slack: 10_000 });
    ctl.start();
    vi.advanceTimersByTime(11_000);
    expect(expired).toEqual([['slack']]);
    vi.advanceTimersByTime(20_000);
    expect(expired).toEqual([['slack'], ['zalo']]);
  });

  it('rearm after a manual unmute cancels the pending fire', () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const { ctl, state, expired } = harness({ zalo: true }, { zalo: 30_000 });
    ctl.start();
    state.muted.zalo = false;
    state.mutedUntil.zalo = 0;
    ctl.rearm();
    vi.advanceTimersByTime(60_000);
    expect(expired).toEqual([]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('ends a mute that expired while the app was closed, at start', () => {
    vi.useFakeTimers();
    vi.setSystemTime(100_000);
    const { ctl, expired } = harness({ zalo: true, slack: true }, { zalo: 5_000, slack: 0 });
    ctl.start();
    expect(expired).toEqual([['zalo']]); // slack is indefinite and stays
  });

  it('fires a timed global mute once, then has nothing left to arm', () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const { ctl, expired } = harness({}, {}, { muted: true, until: 30_000 });
    ctl.start();
    vi.advanceTimersByTime(29_000);
    expect(expired).toEqual([]);
    vi.advanceTimersByTime(2_000);
    expect(expired).toEqual(['global']);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('fires a global and a service expiry each at its own time', () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const { ctl, expired } = harness(
      { zalo: true },
      { zalo: 40_000 },
      { muted: true, until: 10_000 },
    );
    ctl.start();
    vi.advanceTimersByTime(11_000);
    expect(expired).toEqual(['global']);
    vi.advanceTimersByTime(30_000);
    expect(expired).toEqual(['global', ['zalo']]);
  });

  it('ends a global mute that expired while the app was closed, at start', () => {
    vi.useFakeTimers();
    vi.setSystemTime(100_000);
    const { ctl, expired } = harness({}, {}, { muted: true, until: 5_000 });
    ctl.start();
    expect(expired).toEqual(['global']);
  });

  it('leaves an indefinite global mute alone', () => {
    vi.useFakeTimers();
    vi.setSystemTime(100_000);
    const { ctl, expired } = harness({}, {}, { muted: true, until: 0 });
    ctl.start();
    vi.advanceTimersByTime(3_600_000);
    expect(expired).toEqual([]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('dispose leaves no timer behind', () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const { ctl } = harness({ zalo: true }, { zalo: 30_000 });
    ctl.start();
    ctl.dispose();
    expect(vi.getTimerCount()).toBe(0);
  });
});
