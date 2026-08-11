// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { startRecipe } from '../../src/preload/recipes/runner';
import type { Recipe } from '../../src/preload/recipes/types';

function harness(recipe: Recipe) {
  let tick: (() => Promise<void>) | null = null;
  const fakeSetInterval = ((fn: () => Promise<void>) => {
    tick = fn;
    return 0;
  }) as unknown as typeof setInterval;
  const report = vi.fn();
  startRecipe(recipe, document, report, vi.fn(), undefined, undefined, undefined, fakeSetInterval);
  if (!tick) throw new Error('interval not started');
  return { tick: tick as () => Promise<void>, report };
}

describe('runner chrome hiding', () => {
  it('hides the elements hideChrome returns, idempotently across ticks', async () => {
    document.body.innerHTML = '<div id="rail"></div>';
    const rail = document.querySelector('#rail') as HTMLElement;
    const recipe: Recipe = {
      id: 'instagram',
      intervalMs: 1000,
      count: () => ({ direct: 0, indirect: 0 }),
      hideChrome: (doc) => [...doc.querySelectorAll('#rail')],
    };
    const h = harness(recipe);
    await h.tick();
    expect(rail.style.display).toBe('none');
    await h.tick();
    expect(rail.style.display).toBe('none');
  });

  it('re-hides a re-rendered rail on the next tick', async () => {
    document.body.innerHTML = '<div id="rail"></div>';
    const recipe: Recipe = {
      id: 'instagram',
      intervalMs: 1000,
      count: () => ({ direct: 0, indirect: 0 }),
      hideChrome: (doc) => [...doc.querySelectorAll('#rail')],
    };
    const h = harness(recipe);
    await h.tick();
    document.body.innerHTML = '<div id="rail"></div>'; // SPA re-render
    await h.tick();
    expect((document.querySelector('#rail') as HTMLElement).style.display).toBe('none');
  });

  it('still counts when hideChrome throws', async () => {
    const recipe: Recipe = {
      id: 'instagram',
      intervalMs: 1000,
      count: () => ({ direct: 2, indirect: 0 }),
      hideChrome: () => {
        throw new Error('weird DOM');
      },
    };
    const h = harness(recipe);
    await h.tick();
    expect(h.report).toHaveBeenCalledWith({ direct: 2, indirect: 0 });
  });
});
