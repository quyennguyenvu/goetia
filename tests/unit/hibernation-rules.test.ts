import { describe, expect, it } from 'vitest';
import { shouldHibernate } from '../../src/main/lib/hibernation-rules';

const MIN = 60_000;
const base = {
  active: false,
  hibernated: false,
  neverHibernate: false,
  lastActiveAt: 0,
  lastBannerAt: 0,
};

describe('shouldHibernate', () => {
  it('hibernates an idle background service past the timeout', () => {
    expect(shouldHibernate(base, 31 * MIN, 30)).toBe(true);
  });
  it('not before the timeout', () => {
    expect(shouldHibernate(base, 29 * MIN, 30)).toBe(false);
  });
  it('never the active service', () => {
    expect(shouldHibernate({ ...base, active: true }, 99 * MIN, 30)).toBe(false);
  });
  it('never an already-hibernated service', () => {
    expect(shouldHibernate({ ...base, hibernated: true }, 99 * MIN, 30)).toBe(false);
  });
  it('never an excluded service', () => {
    expect(shouldHibernate({ ...base, neverHibernate: true }, 99 * MIN, 30)).toBe(false);
  });
  it('never within banner grace — the click target must survive', () => {
    expect(shouldHibernate({ ...base, lastBannerAt: 30 * MIN }, 31 * MIN, 30)).toBe(false);
  });
  it('hibernates again once the grace has passed', () => {
    expect(shouldHibernate({ ...base, lastBannerAt: 28 * MIN }, 31 * MIN, 30)).toBe(true);
  });
});
