import { describe, expect, it } from 'vitest';
import { aggregateBadges, badgeLabel } from '../../src/shared/badges';

describe('aggregateBadges', () => {
  const e = (direct: number, indirect = 0) => ({ direct, indirect });

  it('sums direct counts', () => {
    expect(aggregateBadges([e(2), e(3), e(5)])).toEqual({ total: 10, indirectOnly: false });
  });
  it('flags indirect-only when no direct but some indirect', () => {
    expect(aggregateBadges([e(0, 4), e(0)])).toEqual({ total: 0, indirectOnly: true });
  });
  it('is empty with nothing unread', () => {
    expect(aggregateBadges([e(0), e(0)])).toEqual({ total: 0, indirectOnly: false });
  });
});

describe('badgeLabel', () => {
  it.each([
    [1, '1'],
    [9, '9'],
    [99, '99'],
    [100, '99+'],
    [153, '99+'],
  ])('%d -> %s', (n, s) => {
    expect(badgeLabel(n)).toBe(s);
  });
});
