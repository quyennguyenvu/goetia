import { describe, expect, it, vi } from 'vitest';
import { startRecipe } from '../../src/preload/recipes/runner';
import type { Recipe } from '../../src/preload/recipes/types';

const LOGIN_URL =
  'https://www.tiktok.com/login?redirect_url=https%3A%2F%2Fwww.tiktok.com%2Fmessages';

// the runner reads only location and title from the document here
function fakeDoc(): Document {
  return { location: { pathname: '/messages', hash: '' }, title: '' } as unknown as Document;
}

function harness(recipe: Recipe) {
  let tick: (() => Promise<void>) | null = null;
  const fakeSetInterval = ((fn: () => Promise<void>) => {
    tick = fn;
    return 0;
  }) as unknown as typeof setInterval;
  const report = vi.fn();
  const navigate = vi.fn();
  startRecipe(
    recipe,
    fakeDoc(),
    report,
    vi.fn(),
    undefined,
    undefined,
    navigate,
    fakeSetInterval,
    () => 100_000,
  );
  if (!tick) throw new Error('interval not started');
  return { tick: tick as () => Promise<void>, report, navigate };
}

const base: Recipe = {
  id: 'tiktok',
  intervalMs: 1000,
  count: () => ({ direct: 0, indirect: 0 }),
};

describe('runner login landing', () => {
  it('navigates to the login URL once, however many ticks the shell stays up', async () => {
    const h = harness({ ...base, loginUrl: () => LOGIN_URL });
    await h.tick();
    await h.tick();
    await h.tick();
    expect(h.navigate).toHaveBeenCalledTimes(1);
    expect(h.navigate).toHaveBeenCalledWith(LOGIN_URL);
  });

  it('stays put while the hook returns null (signed in, login page, captcha)', async () => {
    const h = harness({ ...base, loginUrl: () => null });
    await h.tick();
    await h.tick();
    expect(h.navigate).not.toHaveBeenCalled();
  });

  it('keeps counting when the hook throws', async () => {
    const h = harness({
      ...base,
      loginUrl: () => {
        throw new Error('selector rot');
      },
    });
    await h.tick();
    expect(h.navigate).not.toHaveBeenCalled();
    expect(h.report).toHaveBeenCalledWith({ direct: 0, indirect: 0 });
  });

  it('does nothing for a recipe without the hook', async () => {
    const h = harness(base);
    await h.tick();
    expect(h.navigate).not.toHaveBeenCalled();
  });
});
