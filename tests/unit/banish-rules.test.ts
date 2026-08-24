import { describe, expect, it } from 'vitest';
import { shouldBanish } from '../../src/main/lib/banish-rules';

const HOUR = 3_600_000;
const base = {
  disabled: false,
  active: false,
  neverHibernate: false,
  peeking: false,
  lastUsedAt: 0,
};

describe('shouldBanish', () => {
  it('banishes a service unused past the threshold', () => {
    expect(shouldBanish({ ...base, lastUsedAt: 1 * HOUR }, 26 * HOUR, 24 * HOUR)).toBe(true);
  });
  it('not before the threshold', () => {
    expect(shouldBanish({ ...base, lastUsedAt: 3 * HOUR }, 26 * HOUR, 24 * HOUR)).toBe(false);
  });
  it('never an unstamped service — no clock, no banish', () => {
    expect(shouldBanish(base, 999 * HOUR, 24 * HOUR)).toBe(false);
  });
  it('never the active service', () => {
    expect(shouldBanish({ ...base, active: true, lastUsedAt: 1 }, 999 * HOUR, 24 * HOUR)).toBe(
      false,
    );
  });
  it('never an already-banished service', () => {
    expect(shouldBanish({ ...base, disabled: true, lastUsedAt: 1 }, 999 * HOUR, 24 * HOUR)).toBe(
      false,
    );
  });
  it('never a kept-awake service — pinned means pinned', () => {
    expect(
      shouldBanish({ ...base, neverHibernate: true, lastUsedAt: 1 }, 999 * HOUR, 24 * HOUR),
    ).toBe(false);
  });
  it('never the peek in flight', () => {
    expect(shouldBanish({ ...base, peeking: true, lastUsedAt: 1 }, 999 * HOUR, 24 * HOUR)).toBe(
      false,
    );
  });
});
