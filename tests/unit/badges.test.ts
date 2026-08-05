import { describe, expect, it } from 'vitest';
import { aggregateBadges, badgeLabel } from '../../src/shared/badges';

describe('aggregateBadges', () => {
  const e = (direct: number, indirect = 0, muted = false) => ({ direct, indirect, muted });

  it('sums direct counts of unmuted services', () => {
    expect(aggregateBadges([e(2), e(3), e(5, 0, true)], false)).toEqual({
      total: 5,
      indirectOnly: false,
    });
  });
  it('flags indirect-only when no direct but some indirect', () => {
    expect(aggregateBadges([e(0, 4), e(0)], false)).toEqual({ total: 0, indirectOnly: true });
  });
  it('global mute zeroes everything', () => {
    expect(aggregateBadges([e(9, 9)], true)).toEqual({ total: 0, indirectOnly: false });
  });
  it('muted services do not contribute indirect either', () => {
    expect(aggregateBadges([e(0, 3, true)], false)).toEqual({ total: 0, indirectOnly: false });
  });
});

describe('badgeLabel', () => {
  it.each([
    [1, '1'],
    [9, '9'],
    [10, '9+'],
    [153, '9+'],
  ])('%d -> %s', (n, s) => {
    expect(badgeLabel(n)).toBe(s);
  });
});
