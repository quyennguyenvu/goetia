import { describe, expect, it } from 'vitest';
import { resolveBannerClick } from '../../src/main/lib/notification-click';

const base = {
  disabled: false,
  hasView: true,
  serviceUrl: 'https://www.facebook.com/messages/',
  chatPaths: ['/messages', '/messenger_media'],
};

describe('resolveBannerClick', () => {
  it('disabled service: show the window only (stale banner)', () => {
    expect(resolveBannerClick({ ...base, disabled: true, clickId: 1 })).toEqual({
      kind: 'show-only',
    });
  });

  it('valid href on a dead view navigates — the wake load lands on the thread', () => {
    expect(resolveBannerClick({ ...base, hasView: false, href: '/messages/e2ee/t/111' })).toEqual({
      kind: 'navigate',
      url: 'https://www.facebook.com/messages/e2ee/t/111',
    });
  });

  it('valid href on a live view routes in-page — no reload, no waking cover', () => {
    expect(resolveBannerClick({ ...base, href: '/messages/e2ee/t/111' })).toEqual({
      kind: 'open-in-page',
      href: '/messages/e2ee/t/111',
      url: 'https://www.facebook.com/messages/e2ee/t/111',
    });
  });

  it('a live view gets every lane at once — the preload tries them in order', () => {
    expect(resolveBannerClick({ ...base, href: '/messages/t/222', clickId: 4 })).toEqual({
      kind: 'open-in-page',
      clickId: 4,
      href: '/messages/t/222',
      url: 'https://www.facebook.com/messages/t/222',
    });
  });

  it('a dead view has no page to replay in: the URL is its wake load', () => {
    expect(
      resolveBannerClick({ ...base, hasView: false, href: '/messages/t/222', clickId: 4 }),
    ).toEqual({
      kind: 'navigate',
      url: 'https://www.facebook.com/messages/t/222',
    });
  });

  // a rejected href is dropped, not fatal: the other lanes still run
  it('an href outside chatPaths is dropped while the replay lane stays', () => {
    expect(resolveBannerClick({ ...base, href: '/marketplace/item/9', clickId: 4 })).toEqual({
      kind: 'open-in-page',
      clickId: 4,
    });
  });

  it('href on the wrong host downgrades to activate', () => {
    expect(resolveBannerClick({ ...base, href: 'https://evil.example/messages/t/1' })).toEqual({
      kind: 'activate',
    });
  });

  it('href outside chatPaths downgrades to activate', () => {
    expect(resolveBannerClick({ ...base, href: '/marketplace/item/9' })).toEqual({
      kind: 'activate',
    });
  });

  it('unparseable href downgrades to activate', () => {
    expect(resolveBannerClick({ ...base, href: 'http://' })).toEqual({ kind: 'activate' });
  });

  // a chat-only site (no chatPaths) is all chat: same origin is the whole
  // check. Discord's service URL is /channels/@me, and a server channel pin
  // lives at /channels/<guild>/<channel> — the path was never a boundary
  it('no chatPaths: same origin is the only boundary (discord server channel)', () => {
    const discord = {
      ...base,
      serviceUrl: 'https://discord.com/channels/@me',
      chatPaths: undefined,
    };
    const href = 'https://discord.com/channels/1329647866888589434/1545386122287517717';
    expect(resolveBannerClick({ ...discord, href })).toEqual({
      kind: 'open-in-page',
      href,
      url: href,
    });
    expect(resolveBannerClick({ ...discord, href: 'https://discordapp.com/channels/1/2' })).toEqual(
      { kind: 'activate' },
    );
  });

  it('hash-routed chatPaths match pathname + hash (teams)', () => {
    const teams = {
      disabled: false,
      hasView: true,
      serviceUrl: 'https://teams.microsoft.com/v2/#/chat',
      chatPaths: ['/v2/#/chat', '/v2/#/conversations'],
    };
    expect(resolveBannerClick({ ...teams, href: '/v2/#/chat/19:abc' })).toEqual({
      kind: 'open-in-page',
      href: '/v2/#/chat/19:abc',
      url: 'https://teams.microsoft.com/v2/#/chat/19:abc',
    });
  });

  it('clickId replays only while the view is alive', () => {
    expect(resolveBannerClick({ ...base, clickId: 7 })).toEqual({
      kind: 'open-in-page',
      clickId: 7,
    });
    expect(resolveBannerClick({ ...base, clickId: 7, hasView: false })).toEqual({
      kind: 'activate',
    });
  });

  it('carries the conversation name into the in-page open', () => {
    expect(resolveBannerClick({ ...base, href: '/messages/t/222', conversation: 'Mai' })).toEqual({
      kind: 'open-in-page',
      href: '/messages/t/222',
      url: 'https://www.facebook.com/messages/t/222',
      conversation: 'Mai',
    });
  });

  // whatsapp/zalo: every thread shares one URL, so the recipe's row click is
  // the only handle — and with no URL in the action, a miss stays put
  const named = {
    disabled: false,
    hasView: true,
    serviceUrl: 'https://web.whatsapp.com/',
    chatPaths: undefined,
  };

  it('a named thread with no href routes by name alone on a live view', () => {
    expect(resolveBannerClick({ ...named, conversation: 'Nguyên Diêu' })).toEqual({
      kind: 'open-in-page',
      conversation: 'Nguyên Diêu',
    });
  });

  // the site's own handler knows the thread id; a display name can name two
  // chats — so both ride along, and the preload replays before it looks a
  // row up by name, falling to the name only when the handle is gone
  it('clickId and the name lane travel together on a live view', () => {
    expect(resolveBannerClick({ ...named, conversation: 'Nguyên Diêu', clickId: 5 })).toEqual({
      kind: 'open-in-page',
      clickId: 5,
      conversation: 'Nguyên Diêu',
    });
  });

  it('a named thread on a dead view falls back to activate — no live DOM to click', () => {
    expect(resolveBannerClick({ ...named, hasView: false, conversation: 'Nguyên Diêu' })).toEqual({
      kind: 'activate',
    });
  });

  it('an empty conversation name is not a lane', () => {
    expect(resolveBannerClick({ ...named, conversation: '' })).toEqual({ kind: 'activate' });
  });

  it('nothing to go on: activate', () => {
    expect(resolveBannerClick({ ...base })).toEqual({ kind: 'activate' });
  });
});
