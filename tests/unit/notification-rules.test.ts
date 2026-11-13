import { describe, expect, it } from 'vitest';
import {
  audioMuted,
  BANNER_BODY_MAX,
  BANNER_TITLE_MAX,
  bannerGroupId,
  isWordless,
  notificationTitle,
  sanitizeBanner,
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

describe('isWordless', () => {
  it.each([
    ['', ''],
    ['  ', '\n\t'],
  ])('%j / %j says nothing', (title, body) => {
    expect(isWordless(title, body)).toBe(true);
  });

  // tiktok's synthesized banner is a nickname alone, by design
  it.each([
    ['An', ''],
    ['', 'sent a photo'],
  ])('%j / %j says something', (title, body) => {
    expect(isWordless(title, body)).toBe(false);
  });
});

describe('sanitizeBanner', () => {
  it('coerces non-string title/body to empty strings', () => {
    expect(sanitizeBanner(null, undefined)).toEqual({ title: '', body: '' });
    expect(sanitizeBanner(5, {})).toEqual({ title: '', body: '' });
    expect(sanitizeBanner(['x'], () => 'y')).toEqual({ title: '', body: '' });
  });

  it('passes normal page strings through untouched, newlines included', () => {
    expect(sanitizeBanner('Anh Quyền', 'line one\nline two')).toEqual({
      title: 'Anh Quyền',
      body: 'line one\nline two',
    });
  });

  it('clamps oversized page strings', () => {
    const { title, body } = sanitizeBanner('t'.repeat(10_000), 'b'.repeat(10_000));
    expect(title.length).toBeLessThanOrEqual(BANNER_TITLE_MAX);
    expect(body.length).toBeLessThanOrEqual(BANNER_BODY_MAX);
    expect(title.endsWith('…')).toBe(true);
  });
});

// one noisy channel must collapse into its own stack, not bury every other chat
describe('bannerGroupId', () => {
  const id = (serviceId: string, conversation: string, locked = false) =>
    bannerGroupId({ serviceId, conversation, locked });

  it('gives one conversation one group, and another a different one', () => {
    expect(id('discord', '#deploy')).toBe(id('discord', '#deploy'));
    expect(id('discord', '#deploy')).not.toBe(id('discord', 'An Nguyen'));
  });

  it('keeps the same name on two services apart', () => {
    expect(id('discord', 'An Nguyen')).not.toBe(id('telegram', 'An Nguyen'));
  });

  it('ignores emoji presentation, like every other name compare', () => {
    expect(id('whatsapp', 'Nhà ❤')).toBe(id('whatsapp', 'Nhà ❤️'));
  });

  it('never carries the name itself', () => {
    expect(id('whatsapp', 'Big Show - private')).toMatch(/^whatsapp:[0-9a-f]{16}$/);
  });

  it('falls back to the service for a nameless banner', () => {
    expect(id('zalo', '   ')).toBe('zalo');
  });

  it('groups by service alone while locked', () => {
    // a redacted banner must not be sorted by the conversation it hides
    expect(id('discord', '#deploy', true)).toBe('discord');
  });
});
