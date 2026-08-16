import { describe, expect, it } from 'vitest';
import type { PeekCandidate } from '../../src/main/lib/peek-rules';
import { PEEK_INTERVAL_MS, pickPeek } from '../../src/main/lib/peek-rules';

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
