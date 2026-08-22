// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FORCE_RECOUNT_TICKS, startRecipe } from '../../src/preload/recipes/runner';
import type { Recipe } from '../../src/preload/recipes/types';

function once(fns: (() => void)[]): typeof setInterval {
  return ((fn: () => void) => {
    fns.push(fn);
    return 1 as unknown as ReturnType<typeof setInterval>;
  }) as typeof setInterval;
}

/** MutationObserver callbacks land in a microtask; let them run. */
const settle = () => new Promise((r) => setTimeout(r, 0));

function start(recipe: Recipe) {
  const ticks: (() => void)[] = [];
  startRecipe(recipe, document, vi.fn(), vi.fn(), undefined, undefined, undefined, once(ticks));
  return async () => {
    await ticks[0]();
    await settle();
  };
}

beforeEach(() => {
  document.title = '';
  document.body.innerHTML = `<div id="list"><div class="row">a</div></div>`;
  // happy-dom reports the document as focused; synthetic banners only fire
  // for an unfocused page
  Object.defineProperty(document, 'hasFocus', { value: () => false, configurable: true });
});

describe('runner recount gating', () => {
  // R2: count() ran every 2s forever whether or not the list had changed. On a
  // Meta inbox that is a getComputedStyle sweep over every row, per tick.
  it('skips count() while the watched subtree stays quiet', async () => {
    const count = vi.fn(() => ({ direct: 0, indirect: 0 }));
    const tick = start({
      id: 'messenger',
      intervalMs: 2000,
      count,
      watch: (doc) => doc.querySelector('#list'),
    });
    await tick();
    expect(count).toHaveBeenCalledTimes(1);
    await tick();
    await tick();
    expect(count).toHaveBeenCalledTimes(1); // nothing changed, nothing recounted
  });

  it('recounts after a mutation inside the watched subtree', async () => {
    const count = vi.fn(() => ({ direct: 0, indirect: 0 }));
    const tick = start({
      id: 'messenger',
      intervalMs: 2000,
      count,
      watch: (doc) => doc.querySelector('#list'),
    });
    await tick();
    await tick();
    expect(count).toHaveBeenCalledTimes(1);

    const row = document.createElement('div');
    row.textContent = 'new message';
    document.querySelector('#list')?.appendChild(row);
    await settle();

    await tick();
    expect(count).toHaveBeenCalledTimes(2);
  });

  // the title badge is the count fallback and lives outside the thread list,
  // so a subtree observer alone would never see it move
  it('recounts when the document title changes', async () => {
    const count = vi.fn(() => ({ direct: 0, indirect: 0 }));
    const tick = start({
      id: 'messenger',
      intervalMs: 2000,
      count,
      watch: (doc) => doc.querySelector('#list'),
    });
    await tick();
    await tick();
    expect(count).toHaveBeenCalledTimes(1);

    document.title = 'Messenger (3)';
    await tick();
    expect(count).toHaveBeenCalledTimes(2);
  });

  // the observer is a cost optimization, never what correctness rests on: a
  // missed mutation must cost latency, not the count
  it('forces a recount after enough quiet ticks even with no signal at all', async () => {
    const count = vi.fn(() => ({ direct: 0, indirect: 0 }));
    const tick = start({
      id: 'messenger',
      intervalMs: 2000,
      count,
      // a deliberately useless target: nothing will ever mutate it
      watch: (doc) => doc.querySelector('#list'),
    });
    // guard: an unexported/undefined constant would make the loop below vacuous
    expect(FORCE_RECOUNT_TICKS).toBeGreaterThan(0);
    await tick();
    expect(count).toHaveBeenCalledTimes(1);
    for (let i = 0; i < FORCE_RECOUNT_TICKS; i++) await tick();
    expect(count).toHaveBeenCalledTimes(1);
    await tick();
    expect(count).toHaveBeenCalledTimes(2); // forced, with no mutation and no title change
  });

  it('counts every tick for a recipe that declares no watch target', async () => {
    const count = vi.fn(() => ({ direct: 0, indirect: 0 }));
    const tick = start({ id: 'telegram', intervalMs: 2000, count });
    await tick();
    await tick();
    await tick();
    expect(count).toHaveBeenCalledTimes(3); // unchanged for every other recipe
  });

  it('counts every tick until the watch target exists', async () => {
    const count = vi.fn(() => ({ direct: 0, indirect: 0 }));
    let ready = false;
    const tick = start({
      id: 'messenger',
      intervalMs: 2000,
      count,
      // logged out or still booting: no thread list to observe yet
      watch: (doc) => (ready ? doc.querySelector('#list') : null),
    });
    await tick();
    await tick();
    expect(count).toHaveBeenCalledTimes(2);
    ready = true;
    await tick(); // target appears -> counts
    await tick(); // now quiet -> skipped
    expect(count).toHaveBeenCalledTimes(3);
  });

  // Teams replaces list containers wholesale; an observer bound once would go
  // deaf on the replacement
  it('re-observes a watch target that was swapped out', async () => {
    const count = vi.fn(() => ({ direct: 0, indirect: 0 }));
    const tick = start({
      id: 'messenger',
      intervalMs: 2000,
      count,
      watch: (doc) => doc.querySelector('#list'),
    });
    await tick();
    await tick();
    expect(count).toHaveBeenCalledTimes(1);

    document.body.innerHTML = `<div id="list"><div class="row">b</div></div>`;
    await tick();
    expect(count).toHaveBeenCalledTimes(2); // retargeted, so recounted

    // and the fresh target is live: a mutation on it still triggers
    await tick();
    expect(count).toHaveBeenCalledTimes(2);
    document.querySelector('#list')?.appendChild(document.createElement('div'));
    await settle();
    await tick();
    expect(count).toHaveBeenCalledTimes(3);
  });

  it('keeps reporting a rise for a synthetic banner across skipped ticks', async () => {
    let direct = 0;
    const report = vi.fn();
    const synth = vi.fn(() => ({ title: 'Ana', body: 'hi' }));
    const ticks: (() => void)[] = [];
    startRecipe(
      {
        id: 'messenger',
        intervalMs: 2000,
        count: () => ({ direct, indirect: 0 }),
        synthNotification: synth,
        watch: (doc) => doc.querySelector('#list'),
      },
      document,
      report,
      vi.fn(),
      undefined,
      vi.fn(),
      undefined,
      once(ticks),
    );
    const tick = async () => {
      await ticks[0]();
      await settle();
    };
    await tick(); // first count: 0
    await tick(); // skipped
    // a new message arrives: the DOM it is counted from necessarily changes
    direct = 1;
    document.querySelector('#list')?.appendChild(document.createElement('div'));
    await settle();
    await tick();
    expect(report).toHaveBeenLastCalledWith({ direct: 1, indirect: 0 });
    expect(synth).toHaveBeenCalledTimes(1); // the banner still fires
  });
});
