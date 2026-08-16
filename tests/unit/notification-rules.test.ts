import { describe, expect, it } from 'vitest';
import {
  audioMuted,
  notificationTitle,
  shouldNotify,
  soundOptions,
} from '../../src/main/lib/notification-rules';

describe('shouldNotify', () => {
  it.each([
    [{ serviceMuted: false, globalMuted: false, quietNow: false }, true],
    [{ serviceMuted: true, globalMuted: false, quietNow: false }, false],
    [{ serviceMuted: false, globalMuted: true, quietNow: false }, false],
    [{ serviceMuted: false, globalMuted: false, quietNow: true }, false],
    [{ serviceMuted: true, globalMuted: true, quietNow: true }, false],
  ])('%o -> %s', (opts, expected) => {
    expect(shouldNotify(opts)).toBe(expected);
  });
});

describe('audioMuted', () => {
  it('quiet hours alone mute the page, not just the banner', () => {
    expect(audioMuted({ serviceMuted: false, globalMuted: false, quietNow: true })).toBe(true);
  });

  it('is exactly the inverse of shouldNotify', () => {
    for (const serviceMuted of [true, false]) {
      for (const globalMuted of [true, false]) {
        for (const quietNow of [true, false]) {
          const opts = { serviceMuted, globalMuted, quietNow };
          expect(audioMuted(opts)).toBe(!shouldNotify(opts));
        }
      }
    }
  });
});

describe('soundOptions', () => {
  it('sounds a synthetic banner, whose page stayed silent', () => {
    expect(soundOptions({ enabled: true, synthetic: true })).toEqual({
      silent: false,
      sound: 'default',
    });
  });

  it.each([
    ['the page already dinged', { enabled: true, synthetic: false }],
    ['sound is off', { enabled: false, synthetic: true }],
    ['both', { enabled: false, synthetic: false }],
  ])('stays silent when %s', (_why, opts) => {
    // leaving `sound` set would still ring on macOS, which reads the name first
    const out = soundOptions(opts);
    expect(out.silent).toBe(true);
    expect('sound' in out).toBe(false);
  });
});

describe('notificationTitle', () => {
  it('passes a real title through, trimmed', () => {
    expect(notificationTitle('  Anh Quyền  ', 'Zalo')).toBe('Anh Quyền');
  });

  it.each(['', '   ', '\n\t'])('falls back to the service name for %j', (raw) => {
    expect(notificationTitle(raw, 'Zalo')).toBe('Zalo');
  });
});
