import { describe, expect, it, vi } from 'vitest';
import {
  activateService,
  openActivityEntry,
  performBannerAction,
  setHomeOpen,
  setOverlayOpen,
} from '../../src/main/activate';
import type { AppContext } from '../../src/main/ipc-handlers';
import type { ActivityEntry } from '../../src/main/lib/activity-log';
import { MainState } from '../../src/main/state';
import { DEFAULT_SETTINGS } from '../../src/shared/types';

// activate.ts imports AppContext as a type only, so pulling it in here does not
// load electron — a partial ctx with a real MainState is enough.
function makeCtx(state: MainState) {
  const views = { activate: vi.fn(), hideActive: vi.fn(), showActive: vi.fn() };
  const update = vi.fn();
  const ctx = {
    state,
    views,
    settings: { update, get: () => DEFAULT_SETTINGS },
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
    expect(update).toHaveBeenCalledWith({
      lastActiveId: 'discord',
      lastHomeOpen: false,
      lastUsedAt: expect.objectContaining({ discord: expect.any(Number) }),
    });
  });

  it('stamps the usage clock at the activation instant', () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_755_000_000_000);
    const { ctx, update } = makeCtx(new MainState());
    activateService(ctx, 'zalo');
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        lastUsedAt: expect.objectContaining({ zalo: 1_755_000_000_000 }),
      }),
    );
    vi.useRealTimers();
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

  it('stays put when home is re-opened from home', () => {
    const state = new MainState();
    state.activeId = 'discord';
    state.homeOpen = true;
    const cb = vi.fn();
    state.onChange(cb);
    const { ctx, views, update } = makeCtx(state);
    setHomeOpen(ctx, true);
    // the sigil is a destination, not a toggle: no service comes back, and a
    // repeat click costs neither a settings write nor a broadcast
    expect(state.homeOpen).toBe(true);
    expect(views.showActive).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
    expect(cb).not.toHaveBeenCalled();
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
  function makeBannerCtx(result: { lane: string; url: string } | null = null) {
    const state = new MainState();
    const views = {
      activate: vi.fn(),
      hideActive: vi.fn(),
      showActive: vi.fn(),
      openConversation: vi.fn(),
      openInPage: vi.fn().mockResolvedValue(result),
    };
    const activity = { learnUrl: vi.fn() };
    const diag = { note: vi.fn() };
    const ctx = {
      state,
      views: { ...views, pageUrl: () => null },
      activity,
      diag,
      settings: { update: vi.fn(), get: () => DEFAULT_SETTINGS },
      noteActivated: vi.fn(),
    } as unknown as AppContext;
    return { ctx, views, activity, diag };
  }

  it('does nothing for show-only', async () => {
    const { ctx, views } = makeBannerCtx();
    await performBannerAction(ctx, 'telegram', { kind: 'show-only' });
    expect(views.activate).not.toHaveBeenCalled();
  });

  it('activates then hands a dead view the conversation URL', async () => {
    const { ctx, views } = makeBannerCtx();
    await performBannerAction(ctx, 'telegram', { kind: 'navigate', url: 'https://t.example/1' });
    expect(views.activate).toHaveBeenCalledWith('telegram');
    expect(views.openConversation).toHaveBeenCalledWith('telegram', 'https://t.example/1');
  });

  it('hands a live view every lane in one in-page request', async () => {
    const { ctx, views } = makeBannerCtx({ lane: 'anchor', url: 'https://t.example/#123' });
    await performBannerAction(ctx, 'telegram', {
      kind: 'open-in-page',
      clickId: 7,
      href: '#123',
      url: 'https://t.example/#123',
      conversation: 'Mai',
    });
    expect(views.activate).toHaveBeenCalledWith('telegram');
    expect(views.openInPage).toHaveBeenCalledWith('telegram', {
      clickId: 7,
      href: '#123',
      url: 'https://t.example/#123',
      conversation: 'Mai',
    });
  });

  // the replayed onclick moved the SPA to the thread: that URL is the one
  // durable handle a shim-only (Discord) recents row can ever get
  it('learns the URL a replayed banner landed on', async () => {
    const { ctx, views, activity } = makeBannerCtx({
      lane: 'replay',
      url: 'https://discord.com/channels/1/2',
    });
    views.openInPage.mockResolvedValue({
      lane: 'replay',
      url: 'https://discord.com/channels/1/2',
    });
    await performBannerAction(ctx, 'discord', { kind: 'open-in-page', clickId: 7 }, { entryId: 4 });
    expect(activity.learnUrl).toHaveBeenCalledWith(4, 'https://discord.com/channels/1/2');
  });

  it('learns nothing from a lane that was not the replay, or with no entry', async () => {
    const { ctx, activity } = makeBannerCtx({ lane: 'name', url: 'https://web.whatsapp.com/' });
    await performBannerAction(
      ctx,
      'whatsapp',
      { kind: 'open-in-page', conversation: 'Mẹ' },
      {
        entryId: 4,
      },
    );
    await performBannerAction(ctx, 'whatsapp', { kind: 'open-in-page', clickId: 1 });
    expect(activity.learnUrl).not.toHaveBeenCalled();
  });

  it('a miss is noted as evidence, never thrown', async () => {
    const { ctx, diag } = makeBannerCtx({ lane: 'miss', url: 'https://web.whatsapp.com/' });
    await performBannerAction(ctx, 'whatsapp', { kind: 'open-in-page', conversation: 'Mẹ' });
    // lanes only — the conversation name never enters the ring
    expect(diag.note).toHaveBeenCalledWith('open', 'whatsapp miss: lanes=conversation', 'whatsapp');
  });

  it('a view that never answered (destroyed mid-open) is not an error', async () => {
    const { ctx } = makeBannerCtx(null);
    await expect(
      performBannerAction(ctx, 'discord', { kind: 'open-in-page', clickId: 1 }),
    ).resolves.toBeUndefined();
  });
});

describe('setOverlayOpen', () => {
  it('hides the service view when a surface opens', () => {
    const state = new MainState();
    state.activeId = 'discord';
    const { ctx, views } = makeCtx(state);
    setOverlayOpen(ctx, 'settingsOpen', true);
    expect(state.settingsOpen).toBe(true);
    expect(views.hideActive).toHaveBeenCalled();
    expect(views.showActive).not.toHaveBeenCalled();
  });

  it('presents the service again when the last surface closes', () => {
    const state = new MainState();
    state.activeId = 'discord';
    state.settingsOpen = true;
    const { ctx, views } = makeCtx(state);
    setOverlayOpen(ctx, 'settingsOpen', false);
    expect(views.showActive).toHaveBeenCalled();
  });

  it('leaves the view hidden when settings closes over an open home', () => {
    const state = new MainState();
    state.activeId = 'discord';
    state.homeOpen = true;
    state.settingsOpen = true;
    const { ctx, views } = makeCtx(state);
    setOverlayOpen(ctx, 'settingsOpen', false);
    // home is still the surface on screen: raising the view would bury it
    expect(state.homeOpen).toBe(true);
    expect(views.showActive).not.toHaveBeenCalled();
    expect(views.hideActive).toHaveBeenCalled();
  });

  it('leaves the view hidden when the switcher closes over an open home', () => {
    const state = new MainState();
    state.activeId = 'telegram';
    state.homeOpen = true;
    state.switcherOpen = true;
    const { ctx, views } = makeCtx(state);
    setOverlayOpen(ctx, 'switcherOpen', false);
    expect(views.showActive).not.toHaveBeenCalled();
  });

  it('notifies subscribers', () => {
    const state = new MainState();
    const cb = vi.fn();
    state.onChange(cb);
    setOverlayOpen(makeCtx(state).ctx, 'settingsOpen', true);
    expect(cb).toHaveBeenCalled();
  });
});

// a banner in Notification Center is clicked hours after it fired: the entry
// is what the log holds NOW, never the payload the banner was built from
describe('openActivityEntry', () => {
  // fresh-install defaults disable every service; these clicks land on a
  // summoned one unless a case says otherwise
  const summoned = Object.fromEntries(
    Object.keys(DEFAULT_SETTINGS.disabled).map((k) => [k, false]),
  );
  function makeEntryCtx(hasView = true, disabled: Partial<Record<string, boolean>> = {}) {
    const state = new MainState();
    const views = {
      activate: vi.fn(),
      hideActive: vi.fn(),
      showActive: vi.fn(),
      openConversation: vi.fn(),
      openInPage: vi.fn().mockResolvedValue({ lane: 'name', url: 'https://web.whatsapp.com/' }),
      has: () => hasView,
    };
    const ctx = {
      state,
      views,
      activity: { learnUrl: vi.fn() },
      settings: {
        update: vi.fn(),
        get: () => ({ ...DEFAULT_SETTINGS, disabled: { ...summoned, ...disabled } }),
      },
      noteActivated: vi.fn(),
    } as unknown as AppContext;
    return { ctx, views };
  }
  const entry = (over: Partial<ActivityEntry>): ActivityEntry => ({
    id: 4,
    serviceId: 'whatsapp',
    title: 'TICKETBOX',
    conversation: 'TICKETBOX',
    synthetic: false,
    silenced: false,
    at: 1,
    ...over,
  });

  // the document was replaced since the banner fired (peek, reload, wake):
  // onNavigate forgot the handle, and the shim's ids restarted at 1, so the
  // fire-time id would replay a DIFFERENT banner — the name lane is the truth
  it('a forgotten replay handle stays out of the request', () => {
    const { ctx, views } = makeEntryCtx();
    openActivityEntry(ctx, entry({ clickId: undefined }));
    expect(views.activate).toHaveBeenCalledWith('whatsapp');
    expect(views.openInPage).toHaveBeenCalledWith('whatsapp', { conversation: 'TICKETBOX' });
  });

  it('a live handle and the name travel together', () => {
    const { ctx, views } = makeEntryCtx();
    openActivityEntry(ctx, entry({ clickId: 3 }));
    expect(views.openInPage).toHaveBeenCalledWith('whatsapp', {
      clickId: 3,
      conversation: 'TICKETBOX',
    });
  });

  it('a URL a landed replay taught the row is a lane on the banner too', () => {
    const { ctx, views } = makeEntryCtx();
    openActivityEntry(
      ctx,
      entry({
        serviceId: 'discord',
        conversation: '#release',
        landedUrl: 'https://discord.com/channels/1/2',
      }),
    );
    expect(views.openInPage).toHaveBeenCalledWith('discord', {
      href: 'https://discord.com/channels/1/2',
      url: 'https://discord.com/channels/1/2',
    });
  });

  // a shim banner's href field is page-controlled; only a synthetic one opens
  it('a shim banner own href is not a lane', () => {
    const { ctx, views } = makeEntryCtx();
    openActivityEntry(
      ctx,
      entry({ serviceId: 'messenger', conversation: 'Li', href: '/messages/t/9' }),
    );
    expect(views.activate).toHaveBeenCalledWith('messenger');
    expect(views.openInPage).not.toHaveBeenCalled();
  });

  it('a dead view wakes on the entry URL', () => {
    const { ctx, views } = makeEntryCtx(false);
    openActivityEntry(
      ctx,
      entry({ serviceId: 'messenger', synthetic: true, href: '/messages/t/9' }),
    );
    expect(views.openConversation).toHaveBeenCalledWith(
      'messenger',
      'https://www.facebook.com/messages/t/9',
    );
  });

  it('a banished service only shows the window', () => {
    const { ctx, views } = makeEntryCtx(true, { whatsapp: true });
    openActivityEntry(ctx, entry({ clickId: 3 }));
    expect(views.activate).not.toHaveBeenCalled();
    expect(views.openInPage).not.toHaveBeenCalled();
  });
});
