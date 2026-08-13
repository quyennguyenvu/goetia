import { describe, expect, it, vi } from 'vitest';
import { SNAPBACK_MIN_INTERVAL_MS, startRecipe } from '../../src/preload/recipes/runner';
import type { Recipe } from '../../src/preload/recipes/types';

// hash left undefined unless a case needs one: the path-only services must
// keep working on a location that has no hash to read
function fakeDoc(pathname: string, hash?: string) {
  const loc = { pathname, hash };
  return { doc: { location: loc } as unknown as Document, loc };
}

function harness(recipe: Recipe, doc: Document) {
  let tick: (() => Promise<void>) | null = null;
  const fakeSetInterval = ((fn: () => Promise<void>) => {
    tick = fn;
    return 0;
  }) as unknown as typeof setInterval;
  let now = 100_000;
  const snapBack = vi.fn();
  startRecipe(
    recipe,
    doc,
    vi.fn(),
    vi.fn(),
    undefined,
    undefined,
    snapBack,
    fakeSetInterval,
    () => now,
  );
  if (!tick) throw new Error('interval not started');
  return {
    tick: tick as () => Promise<void>,
    advance: (ms: number) => {
      now += ms;
    },
    snapBack,
  };
}

const recipe: Recipe = {
  id: 'messenger',
  intervalMs: 1000,
  chatPaths: ['/messages', '/messenger_media'],
  count: () => ({ direct: 0, indirect: 0 }),
};

describe('runner chat containment', () => {
  it('snaps back when the page wanders off chat after being on it', async () => {
    const { doc, loc } = fakeDoc('/messages/t/123');
    const h = harness(recipe, doc);
    await h.tick();
    expect(h.snapBack).not.toHaveBeenCalled();
    loc.pathname = '/marketplace/item/9';
    await h.tick();
    expect(h.snapBack).toHaveBeenCalledTimes(1);
    await h.tick(); // still off chat: rate-limited, no second snap
    expect(h.snapBack).toHaveBeenCalledTimes(1);
  });

  it('re-arms after the rate-limit window', async () => {
    const { doc, loc } = fakeDoc('/messages');
    const h = harness(recipe, doc);
    await h.tick();
    loc.pathname = '/watch';
    await h.tick();
    expect(h.snapBack).toHaveBeenCalledTimes(1);
    loc.pathname = '/messages'; // snapped back
    await h.tick();
    loc.pathname = '/gaming'; // wanders again within the window
    await h.tick();
    expect(h.snapBack).toHaveBeenCalledTimes(1);
    h.advance(SNAPBACK_MIN_INTERVAL_MS);
    await h.tick();
    expect(h.snapBack).toHaveBeenCalledTimes(2);
  });

  it('treats every chatPaths prefix as in-chat (media viewer)', async () => {
    const { doc, loc } = fakeDoc('/messages/t/123');
    const h = harness(recipe, doc);
    await h.tick();
    loc.pathname = '/messenger_media/?thread_id=1';
    await h.tick();
    expect(h.snapBack).not.toHaveBeenCalled();
  });

  it('never snaps a document that was never on chat (login flow)', async () => {
    const { doc } = fakeDoc('/login.php');
    const h = harness(recipe, doc);
    await h.tick();
    await h.tick();
    expect(h.snapBack).not.toHaveBeenCalled();
  });

  it('does nothing when the recipe declares no chatPaths', async () => {
    const { doc, loc } = fakeDoc('/messages');
    const h = harness({ ...recipe, chatPaths: undefined }, doc);
    await h.tick();
    loc.pathname = '/watch';
    await h.tick();
    expect(h.snapBack).not.toHaveBeenCalled();
  });
});

// teams: one pathname, every surface in the fragment
const hashRouted: Recipe = {
  id: 'teams',
  intervalMs: 1000,
  chatPaths: ['/v2/#/chat', '/v2/#/conversations'],
  count: () => ({ direct: 0, indirect: 0 }),
};

describe('runner chat containment, hash-routed', () => {
  it('stays put while only the fragment moves within chat', async () => {
    const { doc, loc } = fakeDoc('/v2/', '#/chat');
    const h = harness(hashRouted, doc);
    await h.tick();
    loc.hash = '#/conversations/19:abc@thread.v2?ctx=chat';
    await h.tick();
    expect(h.snapBack).not.toHaveBeenCalled();
  });

  it('snaps back on a fragment that leaves chat, pathname unchanged', async () => {
    const { doc, loc } = fakeDoc('/v2/', '#/chat/19:abc');
    const h = harness(hashRouted, doc);
    await h.tick();
    loc.hash = '#/calendar';
    await h.tick();
    expect(h.snapBack).toHaveBeenCalledTimes(1);
  });

  it('never snaps the sign-in flow, which never reaches a chat fragment', async () => {
    const { doc, loc } = fakeDoc('/', '');
    const h = harness(hashRouted, doc);
    await h.tick();
    loc.pathname = '/v2/';
    loc.hash = '#/calendar';
    await h.tick();
    expect(h.snapBack).not.toHaveBeenCalled();
  });
});
