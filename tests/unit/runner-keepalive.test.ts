// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { KEEPALIVE_MIN_INTERVAL_MS, startRecipe } from '../../src/preload/recipes/runner';
import type { Recipe } from '../../src/preload/recipes/types';

function harness(recipe: Recipe) {
  let tick: (() => Promise<void>) | null = null;
  const fakeSetInterval = ((fn: () => Promise<void>) => {
    tick = fn;
    return 0;
  }) as unknown as typeof setInterval;
  let now = 100_000;
  const report = vi.fn();
  const keepAlive = vi.fn();
  startRecipe(
    recipe,
    document,
    report,
    vi.fn(),
    keepAlive,
    undefined,
    undefined,
    fakeSetInterval,
    () => now,
  );
  if (!tick) throw new Error('interval not started');
  return {
    tick: tick as () => Promise<void>,
    advance: (ms: number) => {
      now += ms;
    },
    report,
    keepAlive,
  };
}

describe('runner keep-alive', () => {
  it('reports keep-alive coordinates at most once per interval window', async () => {
    const recipe: Recipe = {
      id: 'zalo',
      intervalMs: 1000,
      count: () => ({ direct: 0, indirect: 0 }),
      keepAlive: () => ({ x: 10, y: 20 }),
    };
    const h = harness(recipe);
    await h.tick();
    await h.tick();
    expect(h.keepAlive).toHaveBeenCalledTimes(1);
    expect(h.keepAlive).toHaveBeenCalledWith({ x: 10, y: 20 });
    h.advance(KEEPALIVE_MIN_INTERVAL_MS);
    await h.tick();
    expect(h.keepAlive).toHaveBeenCalledTimes(2);
  });

  it('does nothing when the recipe has no keepAlive or it returns null', async () => {
    const recipe: Recipe = {
      id: 'zalo',
      intervalMs: 1000,
      count: () => ({ direct: 1, indirect: 0 }),
      keepAlive: () => null,
    };
    const h = harness(recipe);
    await h.tick();
    expect(h.keepAlive).not.toHaveBeenCalled();
    expect(h.report).toHaveBeenCalledWith({ direct: 1, indirect: 0 });
  });

  it('still counts when keepAlive throws', async () => {
    const recipe: Recipe = {
      id: 'zalo',
      intervalMs: 1000,
      count: () => ({ direct: 2, indirect: 0 }),
      keepAlive: () => {
        throw new Error('weird DOM');
      },
    };
    const h = harness(recipe);
    await h.tick();
    expect(h.report).toHaveBeenCalledWith({ direct: 2, indirect: 0 });
  });
});
