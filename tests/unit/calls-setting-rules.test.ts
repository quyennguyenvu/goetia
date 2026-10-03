import { describe, expect, it } from 'vitest';
import {
  CALLS_CHECK_INTERVAL_MS,
  CALLS_EXPIRY_SLACK_MS,
  callsStateOf,
  callsTransition,
  nextCheckDelay,
  parseCallsBlocked,
} from '../../src/main/lib/calls-setting-rules';

const NOW = 1_790_000_000_000;

describe('parseCallsBlocked', () => {
  it('passes facebook’s two fixed values through', () => {
    expect(parseCallsBlocked(0, NOW)).toBe(0);
    expect(parseCallsBlocked(-1, NOW)).toBe(-1);
  });

  it('turns facebook’s seconds into epoch ms while the block lasts', () => {
    expect(parseCallsBlocked(NOW / 1000 + 3600, NOW)).toBe(NOW + 3_600_000);
  });

  it('reads an expired block as calls on', () => {
    expect(parseCallsBlocked(NOW / 1000 - 1, NOW)).toBe(0);
  });

  it('reads anything facebook does not store as unknown', () => {
    for (const raw of [
      null,
      undefined,
      '-1',
      1.5,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      -2,
      {},
      true,
    ]) {
      expect(parseCallsBlocked(raw, NOW)).toBeNull();
    }
  });
});

describe('callsStateOf', () => {
  it('maps a parsed value to the state the Diagnostics lines track', () => {
    expect(callsStateOf(null)).toBe('unreadable');
    expect(callsStateOf(0)).toBe('on');
    expect(callsStateOf(-1)).toBe('off');
    expect(callsStateOf(NOW + 1)).toBe('off');
  });
});

describe('callsTransition', () => {
  it('notes the way into off and into unreadable, once', () => {
    expect(callsTransition('unset', 'off')).toBe(
      "incoming calls are off in Facebook's chat settings",
    );
    expect(callsTransition('on', 'off')).toBe("incoming calls are off in Facebook's chat settings");
    expect(callsTransition('unset', 'unreadable')).toBe("can't read Facebook's call setting");
    expect(callsTransition('off', 'unreadable')).toBe("can't read Facebook's call setting");
  });

  it('never notes a repeat or a recovery — a success is not evidence', () => {
    expect(callsTransition('off', 'off')).toBeNull();
    expect(callsTransition('unreadable', 'unreadable')).toBeNull();
    expect(callsTransition('off', 'on')).toBeNull();
    expect(callsTransition('unreadable', 'on')).toBeNull();
    expect(callsTransition('unset', 'on')).toBeNull();
  });
});

describe('nextCheckDelay', () => {
  it('waits the interval with no timed block', () => {
    expect(nextCheckDelay(0, NOW)).toBe(CALLS_CHECK_INTERVAL_MS);
    expect(nextCheckDelay(-1, NOW)).toBe(CALLS_CHECK_INTERVAL_MS);
  });

  it('lands just after a timed block that ends before the interval', () => {
    expect(nextCheckDelay(NOW + 60_000, NOW)).toBe(60_000 + CALLS_EXPIRY_SLACK_MS);
    expect(nextCheckDelay(NOW + 2 * CALLS_CHECK_INTERVAL_MS, NOW)).toBe(CALLS_CHECK_INTERVAL_MS);
  });
});
