// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { startRecipe } from '../../src/preload/recipes/runner';
import type { Recipe } from '../../src/preload/recipes/types';

function harness(recipe: Recipe, focused: boolean) {
  Object.defineProperty(document, 'hasFocus', { value: () => focused, configurable: true });
  let tick: (() => Promise<void>) | null = null;
  const fakeSetInterval = ((fn: () => Promise<void>) => {
    tick = fn;
    return 0;
  }) as unknown as typeof setInterval;
  const notify = vi.fn();
  startRecipe(recipe, document, vi.fn(), vi.fn(), undefined, notify, fakeSetInterval, () => 0);
  if (!tick) throw new Error('interval not started');
  return { tick: tick as () => Promise<void>, notify };
}

function countingRecipe(counts: number[]): Recipe {
  let i = 0;
  return {
    id: 'messenger',
    intervalMs: 1000,
    count: () => ({ direct: counts[Math.min(i++, counts.length - 1)], indirect: 0 }),
    synthNotification: () => ({ title: 'Alice', body: 'hey' }),
  };
}

describe('runner notification synthesis', () => {
  it('fires when the unread count rises and the page is unfocused', async () => {
    const h = harness(countingRecipe([1, 2]), false);
    await h.tick();
    expect(h.notify).not.toHaveBeenCalled(); // first observation is baseline
    await h.tick();
    expect(h.notify).toHaveBeenCalledExactlyOnceWith({ title: 'Alice', body: 'hey' });
  });

  it('stays quiet on equal or falling counts', async () => {
    const h = harness(countingRecipe([2, 2, 1]), false);
    await h.tick();
    await h.tick();
    await h.tick();
    expect(h.notify).not.toHaveBeenCalled();
  });

  it('stays quiet while the page has focus', async () => {
    const h = harness(countingRecipe([1, 2]), true);
    await h.tick();
    await h.tick();
    expect(h.notify).not.toHaveBeenCalled();
  });
});
