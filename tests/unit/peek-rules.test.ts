import { describe, expect, it } from 'vitest';
import type { PeekCandidate } from '../../src/main/lib/peek-rules';
import {
  PEEK_BACKOFF_MAX,
  PEEK_INTERVAL_MS,
  peekInterval,
  pickPeek,
} from '../../src/main/lib/peek-rules';

const MIN = 60_000;
const c = (over: Partial<PeekCandidate>): PeekCandidate => ({
  id: 'zalo',
  disabled: false,
  neverHibernate: false,
  hasView: false,
  lastPeekEndedAt: 0,
  ...over,
});

describe('pickPeek', () => {
  it('a never-peeked sleeping service is due immediately', () => {
    expect(pickPeek([c({})], 0, PEEK_INTERVAL_MS, null)).toBe('zalo');
  });
  it('not due again inside the interval', () => {
    expect(pickPeek([c({ lastPeekEndedAt: 1 * MIN })], 10 * MIN, PEEK_INTERVAL_MS, null)).toBe(
      null,
    );
  });
  it('due again once the interval has passed', () => {
    expect(pickPeek([c({ lastPeekEndedAt: 1 * MIN })], 11 * MIN, PEEK_INTERVAL_MS, null)).toBe(
      'zalo',
    );
  });
  it('never while another peek is in flight', () => {
    expect(pickPeek([c({})], 0, PEEK_INTERVAL_MS, 'messenger')).toBe(null);
  });
  it('never a disabled service', () => {
    expect(pickPeek([c({ disabled: true })], 0, PEEK_INTERVAL_MS, null)).toBe(null);
  });
  it('never a kept-awake service', () => {
    expect(pickPeek([c({ neverHibernate: true })], 0, PEEK_INTERVAL_MS, null)).toBe(null);
  });
  it('never a service with a live view — it is already reporting', () => {
    expect(pickPeek([c({ hasView: true })], 0, PEEK_INTERVAL_MS, null)).toBe(null);
  });
  it('picks the first due candidate in rail order', () => {
    const list = [c({ id: 'discord', hasView: true }), c({ id: 'messenger' }), c({ id: 'zalo' })];
    expect(pickPeek(list, 0, PEEK_INTERVAL_MS, null)).toBe('messenger');
  });
});

// R1b: a peek is a full cold page load, and every sleeping service got one
// every 10 minutes forever. Backing off costs badge freshness, so it is opt-in.
describe('peekInterval', () => {
  const BASE = PEEK_INTERVAL_MS;

  it('is the plain base interval while the saver is off', () => {
    expect(peekInterval({ base: BASE, quietPeeks: 0, saver: false, onBattery: false })).toBe(BASE);
    // off means off: neither a long quiet streak nor battery changes anything
    expect(peekInterval({ base: BASE, quietPeeks: 9, saver: false, onBattery: true })).toBe(BASE);
  });

  it('doubles for each peek that found nothing, up to the cap', () => {
    const at = (quietPeeks: number) =>
      peekInterval({ base: BASE, quietPeeks, saver: true, onBattery: false });
    expect(at(0)).toBe(BASE);
    expect(at(1)).toBe(BASE * 2);
    expect(at(2)).toBe(BASE * 4);
    expect(at(3)).toBe(BASE * PEEK_BACKOFF_MAX); // 8 would exceed the cap
    expect(at(50)).toBe(BASE * PEEK_BACKOFF_MAX);
  });

  it('starts at the longest interval on battery', () => {
    expect(peekInterval({ base: BASE, quietPeeks: 0, saver: true, onBattery: true })).toBe(
      BASE * PEEK_BACKOFF_MAX,
    );
  });

  it('treats a nonsense quiet count as no backoff', () => {
    expect(peekInterval({ base: BASE, quietPeeks: -3, saver: true, onBattery: false })).toBe(BASE);
  });
});

describe('pickPeek with a per-service interval', () => {
  it('honours a backed-off candidate over the default interval', () => {
    const backedOff = c({ lastPeekEndedAt: 1, intervalMs: 60 * MIN });
    expect(pickPeek([backedOff], 30 * MIN, PEEK_INTERVAL_MS, null)).toBe(null);
    expect(pickPeek([backedOff], 61 * MIN, PEEK_INTERVAL_MS, null)).toBe('zalo');
  });

  it('falls back to the default interval when a candidate names none', () => {
    expect(pickPeek([c({ lastPeekEndedAt: 1 })], 11 * MIN, PEEK_INTERVAL_MS, null)).toBe('zalo');
  });
});
