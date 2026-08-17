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

  it('href wins over clickId — it works dead or alive', () => {
    expect(resolveBannerClick({ ...base, href: '/messages/t/222', clickId: 4 })).toEqual({
      kind: 'open-in-page',
      href: '/messages/t/222',
      url: 'https://www.facebook.com/messages/t/222',
    });
    expect(
      resolveBannerClick({ ...base, hasView: false, href: '/messages/t/222', clickId: 4 }),
    ).toEqual({
      kind: 'navigate',
      url: 'https://www.facebook.com/messages/t/222',
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

  it('no chatPaths: the service URL own path is the boundary', () => {
    const insta = {
      ...base,
      serviceUrl: 'https://www.instagram.com/direct/inbox/',
      chatPaths: undefined,
    };
    expect(resolveBannerClick({ ...insta, href: '/direct/inbox/x' })).toEqual({
      kind: 'open-in-page',
      href: '/direct/inbox/x',
      url: 'https://www.instagram.com/direct/inbox/x',
    });
    expect(resolveBannerClick({ ...insta, href: '/direct/t/17801' })).toEqual({
      kind: 'activate',
    });
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
    expect(resolveBannerClick({ ...base, clickId: 7 })).toEqual({ kind: 'replay', clickId: 7 });
    expect(resolveBannerClick({ ...base, clickId: 7, hasView: false })).toEqual({
      kind: 'activate',
    });
  });

  it('nothing to go on: activate', () => {
    expect(resolveBannerClick({ ...base })).toEqual({ kind: 'activate' });
  });
});
