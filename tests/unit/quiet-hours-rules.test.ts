import { describe, expect, it } from 'vitest';
import {
  muteToggleResult,
  nextBoundary,
  quietNow,
  quietWindowFor,
} from '../../src/main/lib/quiet-hours-rules';
import type { QuietHoursSchedule } from '../../src/shared/types';

const allDays: QuietHoursSchedule['days'] = [true, true, true, true, true, true, true];
// getDay(): Fri = 5
const noFriday: QuietHoursSchedule['days'] = [true, true, true, true, true, false, true];
const noDays: QuietHoursSchedule['days'] = [false, false, false, false, false, false, false];

const sched = (over: Partial<QuietHoursSchedule> = {}): QuietHoursSchedule => ({
  enabled: true,
  start: '22:00',
  end: '07:00',
  days: allDays,
  ...over,
});

// 2026-08-14 is a Friday, 2026-08-15 a Saturday
const fri = (h: number, m = 0) => new Date(2026, 7, 14, h, m);
const sat = (h: number, m = 0) => new Date(2026, 7, 15, h, m);

describe('quietWindowFor', () => {
  it('covers the evening side of a midnight-crossing window', () => {
    const w = quietWindowFor(fri(23), sched());
    expect(w?.start).toEqual(fri(22));
    expect(w?.end).toEqual(sat(7));
  });

  it('covers the morning side, attributed to the day the window started', () => {
    expect(quietWindowFor(sat(3), sched())?.start).toEqual(fri(22));
  });

  it('is null outside the window', () => {
    expect(quietWindowFor(sat(12), sched())).toBeNull();
  });

  it('handles a same-day window, end exclusive', () => {
    const q = sched({ start: '09:00', end: '17:00' });
    expect(quietWindowFor(fri(10), q)?.start).toEqual(fri(9));
    expect(quietWindowFor(fri(8, 59), q)).toBeNull();
    expect(quietWindowFor(fri(17), q)).toBeNull();
  });

  it('skips a window whose start day is unchecked — including past midnight', () => {
    expect(quietWindowFor(fri(23), sched({ days: noFriday }))).toBeNull();
    expect(quietWindowFor(sat(3), sched({ days: noFriday }))).toBeNull();
    expect(quietWindowFor(sat(23), sched({ days: noFriday }))?.start).toEqual(sat(22));
  });

  it('never engages when disabled or when start equals end', () => {
    expect(quietWindowFor(fri(23), sched({ enabled: false }))).toBeNull();
    expect(quietWindowFor(fri(23), sched({ start: '22:00', end: '22:00' }))).toBeNull();
  });
});

describe('quietNow', () => {
  it('is dismissed by the override for exactly one window', () => {
    const override = fri(22).getTime();
    expect(quietNow(fri(23), sched(), override)).toBe(false);
    expect(quietNow(sat(3), sched(), override)).toBe(false); // same window, still dismissed
    expect(quietNow(sat(23), sched(), override)).toBe(true); // next window engages again
  });

  it('ignores a stale override from some other moment', () => {
    expect(quietNow(fri(23), sched(), fri(10).getTime())).toBe(true);
    expect(quietNow(fri(23), sched(), null)).toBe(true);
  });
});

describe('nextBoundary', () => {
  it('inside a window: its end', () => {
    expect(nextBoundary(sat(3), sched())).toEqual(sat(7));
  });

  it('outside: the next start', () => {
    expect(nextBoundary(fri(12), sched())).toEqual(fri(22));
  });

  it('skips unchecked days to the next eligible start', () => {
    expect(nextBoundary(fri(12), sched({ days: noFriday }))).toEqual(sat(22));
  });

  it('is null when the schedule can never engage', () => {
    expect(nextBoundary(fri(12), sched({ enabled: false }))).toBeNull();
    expect(nextBoundary(fri(12), sched({ start: '08:00', end: '08:00' }))).toBeNull();
    expect(nextBoundary(fri(12), sched({ days: noDays }))).toBeNull();
  });
});

describe('muteToggleResult', () => {
  it('silence on: plain persistent mute, override cleared', () => {
    expect(muteToggleResult({ wantSilence: true, engagedWindowStart: 123 })).toEqual({
      globalMuted: true,
      quietOverrideWindowStart: null,
    });
  });

  it('silence off mid-window: dismisses exactly that window', () => {
    expect(muteToggleResult({ wantSilence: false, engagedWindowStart: 123 })).toEqual({
      globalMuted: false,
      quietOverrideWindowStart: 123,
    });
  });

  it('silence off with no window engaged: nothing to dismiss', () => {
    expect(muteToggleResult({ wantSilence: false, engagedWindowStart: null })).toEqual({
      globalMuted: false,
      quietOverrideWindowStart: null,
    });
  });
});
