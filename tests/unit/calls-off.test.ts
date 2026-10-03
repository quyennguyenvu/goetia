import { describe, expect, it } from 'vitest';
import { callsOffLabel, callsOffTooltip, isCallsOff } from '../../src/shared/calls-off';

const now = new Date(2026, 9, 3, 13, 0);

describe('isCallsOff', () => {
  it('is off indefinitely at -1 and until a future time, on otherwise', () => {
    expect(isCallsOff(-1, now.getTime())).toBe(true);
    expect(isCallsOff(now.getTime() + 60_000, now.getTime())).toBe(true);
    expect(isCallsOff(0, now.getTime())).toBe(false);
    expect(isCallsOff(now.getTime() - 1, now.getTime())).toBe(false);
  });
});

describe('callsOffLabel', () => {
  it('names today, tomorrow and a later date', () => {
    expect(callsOffLabel(new Date(2026, 9, 3, 14, 30).getTime(), now)).toBe('until 14:30');
    expect(callsOffLabel(new Date(2026, 9, 4, 8, 0).getTime(), now)).toBe('until tomorrow 08:00');
    expect(callsOffLabel(new Date(2026, 9, 10, 9, 5).getTime(), now)).toBe('until 10 Oct 09:05');
  });

  it('is empty with no end, or an end already past', () => {
    expect(callsOffLabel(-1, now)).toBe('');
    expect(callsOffLabel(now.getTime() - 1, now)).toBe('');
  });
});

describe('callsOffTooltip', () => {
  it('says what is off and how to turn it on', () => {
    expect(callsOffTooltip(-1, now)).toBe(
      'Incoming calls are off on Facebook — right-click to turn on',
    );
    expect(callsOffTooltip(new Date(2026, 9, 3, 14, 30).getTime(), now)).toBe(
      'Incoming calls are off on Facebook until 14:30 — right-click to turn on',
    );
  });
});
