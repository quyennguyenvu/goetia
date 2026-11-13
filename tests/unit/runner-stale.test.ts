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
    startRecipe(
      recipe,
      {} as Document,
      report,
      reportStale,
      undefined,
      undefined,
      undefined,
      once(ticks),
    );
    await ticks[0]();
    await ticks[0]();
    await ticks[0]();
    expect(reportStale).toHaveBeenCalledTimes(1); // three failures, one report
    expect(reportStale).toHaveBeenCalledWith('logged out'); // the why rides along
    ok = true;
    await ticks[0](); // recovers
    ok = false;
    await ticks[0](); // fails again -> new transition
    expect(reportStale).toHaveBeenCalledTimes(2);
  });

  // 2026-11-13 audit: main clears stale only on unread:update, and the runner
  // sent one only when the number moved — one hiccup left the tile marked.
  it('reports the count again after a stale spell, even when it did not move', async () => {
    const ticks: (() => void)[] = [];
    let ok = true;
    const recipe: Recipe = {
      id: 'discord',
      intervalMs: 2000,
      count: () => {
        if (!ok) throw new Error('dom swapped');
        return { direct: 1, indirect: 0 };
      },
    };
    const report = vi.fn();
    startRecipe(
      recipe,
      {} as Document,
      report,
      vi.fn(),
      undefined,
      undefined,
      undefined,
      once(ticks),
    );
    await ticks[0]();
    ok = false;
    await ticks[0]();
    ok = true;
    await ticks[0]();
    expect(report).toHaveBeenCalledTimes(2);
    await ticks[0](); // and not on every tick after that
    expect(report).toHaveBeenCalledTimes(2);
  });

  it('a banner that cannot be built does not read as a stale count', async () => {
    const ticks: (() => void)[] = [];
    let direct = 0;
    const recipe: Recipe = {
      id: 'shopee',
      intervalMs: 2000,
      count: () => ({ direct, indirect: 0 }),
      synthNotification: () => {
        throw new Error('row gone');
      },
    };
    const reportStale = vi.fn();
    const doc = { hasFocus: () => false } as unknown as Document;
    startRecipe(recipe, doc, vi.fn(), reportStale, undefined, vi.fn(), undefined, once(ticks));
    await ticks[0]();
    direct = 1; // a rise: the runner asks for a banner
    await ticks[0]();
    expect(reportStale).not.toHaveBeenCalled();
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
      undefined,
      once(ticks),
      Date.now,
      10, // tiny COUNT_TIMEOUT_MS so the test is fast
    );
    await ticks[0]();
    expect(reportStale).toHaveBeenCalledTimes(1);
    expect(reportStale).toHaveBeenCalledWith('count timeout');
  });
});
