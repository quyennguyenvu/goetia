import { describe, expect, it } from 'vitest';
import { backoffDelay } from '../../src/main/lib/backoff';

describe('backoffDelay', () => {
  it.each([
    [0, 1000],
    [1, 2000],
    [2, 4000],
    [4, 16000],
    [5, 30000],
    [10, 30000],
  ])('attempt %d -> %dms', (attempt, ms) => {
    expect(backoffDelay(attempt)).toBe(ms);
  });
});
