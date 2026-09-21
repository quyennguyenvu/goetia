import { describe, expect, it } from 'vitest';
import { dueUnmutes, globalMuteDue, nextMuteExpiry } from '../../src/main/lib/mute-rules';
import { MUTE_HOUR_MS, muteExpiry, muteLabel, TOMORROW_HOUR } from '../../src/shared/mute';
import { DEFAULT_SETTINGS, type ServiceId } from '../../src/shared/types';

// local-time constructors: the rules are wall-clock, like quiet hours
const at = (y: number, mo: number, d: number, h: number, mi = 0) => new Date(y, mo, d, h, mi);

describe('muteExpiry', () => {
  it('is an hour from now for "hour"', () => {
    const now = at(2026, 8, 20, 14, 5);
    expect(muteExpiry('hour', now)).toBe(now.getTime() + MUTE_HOUR_MS);
  });

  it('is 08:00 the next calendar morning for "tomorrow"', () => {
    const now = at(2026, 8, 20, 21, 30);
    expect(new Date(muteExpiry('tomorrow', now))).toEqual(at(2026, 8, 21, TOMORROW_HOUR));
  });

  it('ends the same morning when set after midnight', () => {
    const now = at(2026, 8, 21, 2, 0);
    expect(new Date(muteExpiry('tomorrow', now))).toEqual(at(2026, 8, 21, TOMORROW_HOUR));
  });

  it('crosses a month boundary by the calendar, not by 24 hours', () => {
    const now = at(2026, 8, 30, 23, 59);
    expect(new Date(muteExpiry('tomorrow', now))).toEqual(at(2026, 9, 1, TOMORROW_HOUR));
  });

  it('is 0 for indefinite', () => {
    expect(muteExpiry('indefinite', at(2026, 8, 20, 12))).toBe(0);
  });
});

describe('muteLabel', () => {
  const now = at(2026, 8, 20, 13, 0);
  it('names the time when the expiry is later today', () => {
    expect(muteLabel(at(2026, 8, 20, 14, 30).getTime(), now)).toBe('until 14:30');
  });
  it('says tomorrow when the expiry is on a later day', () => {
    expect(muteLabel(at(2026, 8, 21, 8, 0).getTime(), now)).toBe('until tomorrow 08:00');
  });
  it('is empty for none or a past expiry', () => {
    expect(muteLabel(0, now)).toBe('');
    expect(muteLabel(at(2026, 8, 20, 12, 0).getTime(), now)).toBe('');
  });
});

const muted = (ids: ServiceId[]): Record<ServiceId, boolean> =>
  Object.fromEntries(
    Object.keys(DEFAULT_SETTINGS.muted).map((id) => [id, ids.includes(id as ServiceId)]),
  ) as Record<ServiceId, boolean>;
const until = (m: Partial<Record<ServiceId, number>>): Record<ServiceId, number> => ({
  ...DEFAULT_SETTINGS.mutedUntil,
  ...m,
});

describe('nextMuteExpiry', () => {
  it('picks the earliest future expiry among muted services', () => {
    expect(
      nextMuteExpiry(muted(['zalo', 'slack']), until({ zalo: 5_000, slack: 3_000 }), 1_000),
    ).toBe(3_000);
  });
  it('ignores an expiry on an unmuted service and indefinite mutes', () => {
    expect(nextMuteExpiry(muted(['zalo']), until({ slack: 3_000, zalo: 0 }), 1_000)).toBeNull();
  });
  it('returns a past expiry so the controller fires now', () => {
    expect(nextMuteExpiry(muted(['zalo']), until({ zalo: 500 }), 1_000)).toBe(500);
  });
  it('lets a nearer timed global mute win the pick', () => {
    expect(nextMuteExpiry(muted(['zalo']), until({ zalo: 5_000 }), 1_000, 2_000)).toBe(2_000);
    expect(nextMuteExpiry(muted(['zalo']), until({ zalo: 5_000 }), 1_000, 9_000)).toBe(5_000);
  });
  it('arms for the global expiry alone when no service is timed', () => {
    expect(nextMuteExpiry(muted([]), until({}), 1_000, 2_000)).toBe(2_000);
    expect(nextMuteExpiry(muted([]), until({}), 1_000, 0)).toBeNull();
  });
});

describe('globalMuteDue', () => {
  it('is due once a timed global mute has passed', () => {
    expect(globalMuteDue(true, 900, 1_000)).toBe(true);
    expect(globalMuteDue(true, 1_000, 1_000)).toBe(true);
  });
  it('is never due for a future expiry, an indefinite mute, or no mute', () => {
    expect(globalMuteDue(true, 5_000, 1_000)).toBe(false);
    expect(globalMuteDue(true, 0, 1_000)).toBe(false);
    expect(globalMuteDue(false, 900, 1_000)).toBe(false);
  });
});

describe('dueUnmutes', () => {
  it('lists muted services whose expiry has passed, in catalog order', () => {
    expect(
      dueUnmutes(
        muted(['zalo', 'slack', 'teams']),
        until({ zalo: 900, slack: 1_000, teams: 5_000 }),
        1_000,
      ),
    ).toEqual(['slack', 'zalo']);
  });
  it('never lists an indefinite mute or an unmuted service', () => {
    expect(dueUnmutes(muted(['zalo']), until({ zalo: 0, slack: 100 }), 1_000)).toEqual([]);
  });
});
