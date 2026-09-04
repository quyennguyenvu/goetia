import { describe, expect, it } from 'vitest';
import { shouldBanish, stampSummoned } from '../../src/main/lib/banish-rules';
import { DEFAULT_SETTINGS, type ServiceId } from '../../src/shared/types';

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

describe('stampSummoned', () => {
  const order = DEFAULT_SETTINGS.order;
  // fresh defaults: every service disabled, every clock unstamped
  const disabled = (over: Partial<Record<ServiceId, boolean>>) => ({
    ...DEFAULT_SETTINGS.disabled,
    ...over,
  });
  const used = (over: Partial<Record<ServiceId, number>>) => ({
    ...DEFAULT_SETTINGS.lastUsedAt,
    ...over,
  });

  // the live bug (2026-09-03): summoning instagram, last activated 94h ago,
  // handed auto-banish a service already 70h past a 24h window — the next
  // sweep banished it seconds later
  it('restarts the clock of every service the patch summons', () => {
    const out = stampSummoned({
      order,
      before: disabled({ discord: false }),
      after: disabled({ discord: false, instagram: false, zalo: false }),
      lastUsedAt: used({ discord: 500, instagram: 1 }),
      now: 9_000,
    });
    expect(out?.instagram).toBe(9_000);
    expect(out?.zalo).toBe(9_000);
    expect(out?.discord).toBe(500); // already on the rail — not the user's doing
  });

  it('returns null when the patch summons nothing', () => {
    expect(
      stampSummoned({
        order,
        before: disabled({ discord: false }),
        after: disabled({ discord: false }),
        lastUsedAt: used({ discord: 500 }),
        now: 9_000,
      }),
    ).toBeNull();
  });

  // banishing is the opposite transition; auto-banish shares this tail and
  // must never be handed a stamp that makes a banished service look fresh
  it('never stamps a service the patch banishes', () => {
    expect(
      stampSummoned({
        order,
        before: disabled({ discord: false, zalo: false }),
        after: disabled({ zalo: false }),
        lastUsedAt: used({ discord: 500, zalo: 2 }),
        now: 9_000,
      }),
    ).toBeNull();
  });
});
