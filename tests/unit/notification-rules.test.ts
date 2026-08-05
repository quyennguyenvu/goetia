import { describe, expect, it } from 'vitest';
import { shouldNotify } from '../../src/main/lib/notification-rules';

describe('shouldNotify', () => {
  it.each([
    [{ serviceMuted: false, globalMuted: false }, true],
    [{ serviceMuted: true, globalMuted: false }, false],
    [{ serviceMuted: false, globalMuted: true }, false],
    [{ serviceMuted: true, globalMuted: true }, false],
  ])('%o -> %s', (opts, expected) => {
    expect(shouldNotify(opts)).toBe(expected);
  });
});
