// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { COUNT_TIMEOUT_MS, startRecipe } from '../../src/preload/recipes/runner';
import type { Recipe } from '../../src/preload/recipes/types';

function harness(recipe: Recipe, focused: boolean) {
  Object.defineProperty(document, 'hasFocus', { value: () => focused, configurable: true });
  let tick: (() => Promise<void>) | null = null;
  const fakeSetInterval = ((fn: () => Promise<void>) => {
    tick = fn;
    return 0;
  }) as unknown as typeof setInterval;
  const report = vi.fn();
  const onConversation = vi.fn();
  startRecipe(
    recipe,
    document,
    report,
    vi.fn(),
    undefined,
    undefined,
    undefined,
    fakeSetInterval,
    () => 0,
    COUNT_TIMEOUT_MS,
    onConversation,
  );
  if (!tick) throw new Error('interval not started');
  return { tick: tick as () => Promise<void>, report, onConversation };
}

function naming(names: (string | null)[]): Recipe {
  let i = 0;
  return {
    id: 'whatsapp',
    intervalMs: 1000,
    count: () => ({ direct: 0, indirect: 0 }),
    conversation: () => names[Math.min(i++, names.length - 1)],
  };
}

describe('runner conversation reports', () => {
  it('says nothing while the document is unfocused', async () => {
    const h = harness(naming(['Minh Anh']), false);
    await h.tick();
    await h.tick();
    expect(h.onConversation).not.toHaveBeenCalled();
  });

  it('reports the hook name with the URL and title, once per change', async () => {
    document.title = 'WhatsApp';
    const h = harness(naming(['Minh Anh', 'Minh Anh', 'Nhóm Sale']), true);
    await h.tick();
    expect(h.onConversation).toHaveBeenCalledExactlyOnceWith({
      conversation: 'Minh Anh',
      url: document.location.href,
      title: 'WhatsApp',
    });
    await h.tick();
    expect(h.onConversation).toHaveBeenCalledTimes(1);
    await h.tick();
    expect(h.onConversation).toHaveBeenCalledTimes(2);
    expect(h.onConversation).toHaveBeenLastCalledWith({
      conversation: 'Nhóm Sale',
      url: document.location.href,
      title: 'WhatsApp',
    });
  });

  it('with no hook, a title change is a change', async () => {
    document.title = 'Alice - Discord';
    const recipe: Recipe = {
      id: 'discord',
      intervalMs: 1000,
      count: () => ({ direct: 0, indirect: 0 }),
    };
    const h = harness(recipe, true);
    await h.tick();
    expect(h.onConversation).toHaveBeenCalledExactlyOnceWith({
      conversation: null,
      url: document.location.href,
      title: 'Alice - Discord',
    });
    document.title = 'Bob - Discord';
    await h.tick();
    expect(h.onConversation).toHaveBeenCalledTimes(2);
  });

  it('a throwing hook reports no name and never stops the count', async () => {
    document.title = 'WhatsApp';
    const recipe: Recipe = {
      id: 'whatsapp',
      intervalMs: 1000,
      count: () => ({ direct: 1, indirect: 0 }),
      conversation: () => {
        throw new Error('boom');
      },
    };
    const h = harness(recipe, true);
    await h.tick();
    expect(h.onConversation).toHaveBeenCalledExactlyOnceWith({
      conversation: null,
      url: document.location.href,
      title: 'WhatsApp',
    });
    expect(h.report).toHaveBeenCalledExactlyOnceWith({ direct: 1, indirect: 0 });
  });
});
