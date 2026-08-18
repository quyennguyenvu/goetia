import { describe, expect, it, vi } from 'vitest';
import { activateService, performBannerAction, setHomeOpen } from '../../src/main/activate';
import type { AppContext } from '../../src/main/ipc-handlers';
import { MainState } from '../../src/main/state';

// activate.ts imports AppContext as a type only, so pulling it in here does not
// load electron — a partial ctx with a real MainState is enough.
function makeCtx(state: MainState) {
  const views = { activate: vi.fn(), hideActive: vi.fn(), showActive: vi.fn() };
  const update = vi.fn();
  const ctx = {
    state,
    views,
    settings: { update },
    noteActivated: vi.fn(),
  } as unknown as AppContext;
  return { ctx, views, update };
}

describe('activateService', () => {
  it('notifies subscribers when switching to a non-hibernated service', () => {
    const state = new MainState();
    const cb = vi.fn();
    state.onChange(cb);
    // discord starts non-hibernated, so the incidental setRuntime is a no-op —
    // activation itself must still broadcast, or the rail/content never update
    activateService(makeCtx(state).ctx, 'discord');
    expect(state.activeId).toBe('discord');
    expect(cb).toHaveBeenCalled();
  });

  it('switches the native view to the target service', () => {
    const state = new MainState();
    const { ctx, views } = makeCtx(state);
    activateService(ctx, 'telegram');
    expect(views.activate).toHaveBeenCalledWith('telegram');
  });

  it('leaves home when a service is activated', () => {
    const state = new MainState();
    state.homeOpen = true;
    state.settingsOpen = true;
    state.switcherOpen = true;
    activateService(makeCtx(state).ctx, 'zalo');
    expect(state.homeOpen).toBe(false);
    expect(state.settingsOpen).toBe(false);
    expect(state.switcherOpen).toBe(false);
  });

  it('records the service as the surface to restore', () => {
    const state = new MainState();
    state.homeOpen = true;
    const { ctx, update } = makeCtx(state);
    activateService(ctx, 'discord');
    expect(update).toHaveBeenCalledWith({ lastActiveId: 'discord', lastHomeOpen: false });
  });
});

describe('setHomeOpen', () => {
  it('records home without losing the service underneath', () => {
    const state = new MainState();
    state.activeId = 'discord';
    const { ctx, views, update } = makeCtx(state);
    setHomeOpen(ctx, true);
    expect(state.homeOpen).toBe(true);
    expect(update).toHaveBeenCalledWith({ lastActiveId: 'discord', lastHomeOpen: true });
    // the view must never stay visible under a shell surface
    expect(views.hideActive).toHaveBeenCalled();
    expect(views.showActive).not.toHaveBeenCalled();
  });

  it('records leaving home and presents the service again', () => {
    const state = new MainState();
    state.activeId = 'telegram';
    state.homeOpen = true;
    const { ctx, views, update } = makeCtx(state);
    setHomeOpen(ctx, false);
    expect(update).toHaveBeenCalledWith({ lastActiveId: 'telegram', lastHomeOpen: false });
    expect(views.showActive).toHaveBeenCalled();
  });

  it('notifies subscribers', () => {
    const state = new MainState();
    const cb = vi.fn();
    state.onChange(cb);
    setHomeOpen(makeCtx(state).ctx, true);
    expect(cb).toHaveBeenCalled();
  });
});

describe('performBannerAction', () => {
  function makeBannerCtx() {
    const state = new MainState();
    const views = {
      activate: vi.fn(),
      hideActive: vi.fn(),
      showActive: vi.fn(),
      openConversation: vi.fn(),
      sendOpenConversation: vi.fn(),
      sendReplayClick: vi.fn(),
    };
    const ctx = {
      state,
      views,
      settings: { update: vi.fn() },
      noteActivated: vi.fn(),
    } as unknown as AppContext;
    return { ctx, views };
  }

  it('does nothing for show-only', () => {
    const { ctx, views } = makeBannerCtx();
    performBannerAction(ctx, 'telegram', { kind: 'show-only' });
    expect(views.activate).not.toHaveBeenCalled();
  });

  it('activates then hands a dead view the conversation URL', () => {
    const { ctx, views } = makeBannerCtx();
    performBannerAction(ctx, 'telegram', { kind: 'navigate', url: 'https://t.example/1' });
    expect(views.activate).toHaveBeenCalledWith('telegram');
    expect(views.openConversation).toHaveBeenCalledWith('telegram', 'https://t.example/1');
  });

  it('routes in-page on a live view', () => {
    const { ctx, views } = makeBannerCtx();
    performBannerAction(ctx, 'telegram', {
      kind: 'open-in-page',
      href: '#123',
      url: 'https://t.example/#123',
    });
    expect(views.sendOpenConversation).toHaveBeenCalledWith(
      'telegram',
      '#123',
      'https://t.example/#123',
    );
  });

  it('replays the page click for shim banners', () => {
    const { ctx, views } = makeBannerCtx();
    performBannerAction(ctx, 'discord', { kind: 'replay', clickId: 7 });
    expect(views.sendReplayClick).toHaveBeenCalledWith('discord', 7);
  });
});
