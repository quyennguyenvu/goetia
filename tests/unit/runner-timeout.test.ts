// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { startRecipe } from '../../src/preload/recipes/runner';
import type { Recipe } from '../../src/preload/recipes/types';

const doc = (): Document => {
  document.title = 'x';
  return document;
};

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('the count timeout', () => {
  it('stops issuing new counts once two are hung, instead of one per tick', async () => {
    let calls = 0;
    const recipe = {
      id: 'x',
      intervalMs: 100,
      count: () => {
        calls++;
        return new Promise<never>(() => {}); // never settles
      },
    } as unknown as Recipe;
    startRecipe(
      recipe,
      doc(),
      () => {},
      () => {},
      undefined,
      undefined,
      undefined,
      setInterval,
      Date.now,
      1_000,
    );
    await vi.advanceTimersByTimeAsync(20_000);
    // without the guard this would be ~200 (one per 100ms tick); bounded at 2
    expect(calls).toBeLessThanOrEqual(2);
  });

  it('clears the race timer on the happy path (no timer left behind per tick)', async () => {
    const recipe = {
      id: 'x',
      intervalMs: 100,
      count: async () => ({ direct: 0, indirect: 0 }),
    } as unknown as Recipe;
    startRecipe(
      recipe,
      doc(),
      () => {},
      () => {},
      undefined,
      undefined,
      undefined,
      setInterval,
      Date.now,
      8_000,
    );
    await vi.advanceTimersByTimeAsync(500); // ~5 ticks
    // only the interval should remain pending, not a pile of 8s race timers
    expect(vi.getTimerCount()).toBeLessThanOrEqual(2);
  });
});
