import { describe, expect, it, vi } from 'vitest';
import { startRecipe } from '../../src/preload/recipes/runner';
import type { Recipe } from '../../src/preload/recipes/types';

function once(fns: (() => void)[]): typeof setInterval {
  return ((fn: () => void) => {
    fns.push(fn);
    return 1 as unknown as ReturnType<typeof setInterval>;
  }) as typeof setInterval;
}

describe('runner stale dedup', () => {
  it('reports stale only on the transition into stale', async () => {
    const ticks: (() => void)[] = [];
    let ok = false;
    const recipe: Recipe = {
      id: 'zalo',
      intervalMs: 2000,
      count: () => {
        if (!ok) throw new Error('logged out');
        return { direct: 1, indirect: 0 };
      },
    };
    const report = vi.fn();
    const reportStale = vi.fn();
    startRecipe(recipe, {} as Document, report, reportStale, undefined, undefined, once(ticks));
    await ticks[0]();
    await ticks[0]();
    await ticks[0]();
    expect(reportStale).toHaveBeenCalledTimes(1); // three failures, one report
    ok = true;
    await ticks[0](); // recovers
    ok = false;
    await ticks[0](); // fails again -> new transition
    expect(reportStale).toHaveBeenCalledTimes(2);
  });

  it('recovers from a hung count() via timeout', async () => {
    const ticks: (() => void)[] = [];
    const recipe: Recipe = {
      id: 'whatsapp',
      intervalMs: 2000,
      count: () => new Promise(() => {}), // never settles
    };
    const reportStale = vi.fn();
    startRecipe(
      recipe,
      {} as Document,
      vi.fn(),
      reportStale,
      undefined,
      undefined,
      once(ticks),
      Date.now,
      10, // tiny COUNT_TIMEOUT_MS so the test is fast
    );
    await ticks[0]();
    expect(reportStale).toHaveBeenCalledTimes(1);
  });
});
