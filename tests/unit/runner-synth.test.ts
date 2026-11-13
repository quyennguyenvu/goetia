// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { PREVIEW_SETTLE_MS, startRecipe } from '../../src/preload/recipes/runner';
import type { Recipe } from '../../src/preload/recipes/types';

function harness(recipe: Recipe, focused: boolean, stale = vi.fn(), clock = { now: 0 }) {
  Object.defineProperty(document, 'hasFocus', { value: () => focused, configurable: true });
  let tick: (() => Promise<void>) | null = null;
  const fakeSetInterval = ((fn: () => Promise<void>) => {
    tick = fn;
    return 0;
  }) as unknown as typeof setInterval;
  const notify = vi.fn();
  startRecipe(
    recipe,
    document,
    vi.fn(),
    stale,
    undefined,
    notify,
    undefined,
    fakeSetInterval,
    () => clock.now,
  );
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

// a recipe that lists every unread row is asked on each count, so a second
// message in a chat that is already unread is announced too (2026-11-13)
describe('runner notification synthesis from unread rows', () => {
  type Row = { title: string; body: string; href?: string };

  function rowsRecipe(steps: Row[][], over: Partial<Recipe> = {}): Recipe {
    let i = 0;
    let now: Row[] = [];
    return {
      id: 'messenger',
      intervalMs: 1000,
      count: () => {
        now = steps[Math.min(i++, steps.length - 1)];
        return { direct: now.length, indirect: 0 };
      },
      unreadBanners: () => now,
      ...over,
    };
  }

  const first = { title: 'An', body: 'hi', href: '/messages/t/1' };
  const second = { title: 'An', body: 'are you there?', href: '/messages/t/1' };

  it('announces a second message while the unread count stays put', async () => {
    const clock = { now: 0 };
    const h = harness(rowsRecipe([[], [first], [second]]), false, vi.fn(), clock);
    await h.tick();
    await h.tick();
    expect(h.notify).toHaveBeenCalledExactlyOnceWith(first);
    clock.now = PREVIEW_SETTLE_MS;
    await h.tick();
    expect(h.notify).toHaveBeenLastCalledWith(second);
    expect(h.notify).toHaveBeenCalledTimes(2);
    await h.tick();
    expect(h.notify).toHaveBeenCalledTimes(2); // nothing changed since
  });

  // main's throttle drops a second banner inside 800 ms, so the rest wait
  it('announces two chats that changed in one count, one banner a tick', async () => {
    const other = { title: 'Binh', body: 'yo', href: '/messages/t/2' };
    const other2 = { title: 'Binh', body: 'you there?', href: '/messages/t/2' };
    const clock = { now: 0 };
    const h = harness(
      rowsRecipe([
        [first, other],
        [second, other2],
      ]),
      false,
      vi.fn(),
      clock,
    );
    clock.now = PREVIEW_SETTLE_MS; // measured from the runner's own start
    await h.tick();
    await h.tick();
    expect(h.notify).toHaveBeenCalledExactlyOnceWith(second);
    await h.tick();
    expect(h.notify).toHaveBeenLastCalledWith(other2);
    await h.tick();
    expect(h.notify).toHaveBeenCalledTimes(2);
  });

  it('drops what is still waiting once the page has focus', async () => {
    let focused = false;
    const other = { title: 'Binh', body: 'yo', href: '/messages/t/2' };
    const other2 = { title: 'Binh', body: 'you there?', href: '/messages/t/2' };
    const clock = { now: 0 };
    const h = harness(
      rowsRecipe([
        [first, other],
        [second, other2],
      ]),
      false,
      vi.fn(),
      clock,
    );
    clock.now = PREVIEW_SETTLE_MS; // measured from the runner's own start
    Object.defineProperty(document, 'hasFocus', { value: () => focused, configurable: true });
    await h.tick();
    await h.tick();
    focused = true; // the user is looking at the list now
    await h.tick();
    focused = false;
    await h.tick();
    expect(h.notify).toHaveBeenCalledExactlyOnceWith(second);
  });

  it('a preview that changes while the page is still loading is not a message', async () => {
    const h = harness(rowsRecipe([[first], [second]]), false);
    await h.tick();
    await h.tick();
    expect(h.notify).not.toHaveBeenCalled();
  });

  it('keeps track while focused, so a blur announces nothing stale', async () => {
    let focused = true;
    const clock = { now: 0 };
    const h = harness(rowsRecipe([[], [first], [second], [second]]), false, vi.fn(), clock);
    clock.now = PREVIEW_SETTLE_MS; // measured from the runner's own start
    Object.defineProperty(document, 'hasFocus', { value: () => focused, configurable: true });
    await h.tick();
    await h.tick();
    await h.tick();
    focused = false;
    await h.tick();
    expect(h.notify).not.toHaveBeenCalled();
  });

  it('stays quiet about rows that were already unread at the first count', async () => {
    const h = harness(rowsRecipe([[first], [first]]), false);
    await h.tick();
    await h.tick();
    expect(h.notify).not.toHaveBeenCalled();
  });

  it('a throwing hook announces nothing and never marks the count stale', async () => {
    const stale = vi.fn();
    const recipe = rowsRecipe([[], [first]], {
      unreadBanners: () => {
        throw new Error('selector rot');
      },
    });
    const h = harness(recipe, false, stale);
    await h.tick();
    await h.tick();
    expect(h.notify).not.toHaveBeenCalled();
    expect(stale).not.toHaveBeenCalled();
  });
});
