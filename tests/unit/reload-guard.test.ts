import { describe, expect, it } from 'vitest';
import { RELOAD_MIN_INTERVAL_MS, reloadAllowed } from '../../src/main/lib/reload-guard';

describe('reloadAllowed', () => {
  it('allows the first reload of a settled service', () => {
    expect(reloadAllowed({ waking: false, lastReloadAt: undefined, now: 1_000 })).toBe(true);
  });

  it('drops a reload while the service is still waking', () => {
    // the spam case: ⌘R mid-wake would discard the load it is waiting on
    expect(reloadAllowed({ waking: true, lastReloadAt: undefined, now: 1_000 })).toBe(false);
  });

  it('drops a reload inside the floor, before waking has had time to turn true', () => {
    // did-start-navigation round-trips asynchronously; held F5 repeats faster
    expect(
      reloadAllowed({
        waking: false,
        lastReloadAt: 1_000,
        now: 1_000 + RELOAD_MIN_INTERVAL_MS - 1,
      }),
    ).toBe(false);
  });

  it('allows a reload once the floor has passed', () => {
    expect(
      reloadAllowed({ waking: false, lastReloadAt: 1_000, now: 1_000 + RELOAD_MIN_INTERVAL_MS }),
    ).toBe(true);
  });
});
