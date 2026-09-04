// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { openConversationInPage } from '../../src/preload/lib/conversation-open';

function setURL(url: string): void {
  (window as unknown as { happyDOM: { setURL(u: string): void } }).happyDOM.setURL(url);
}

describe('openConversationInPage', () => {
  it('clicks the anchor whose href attribute matches exactly', async () => {
    document.documentElement.innerHTML =
      '<body><a href="/messages/t/1">one</a><a href="/messages/e2ee/t/111">two</a></body>';
    const clicked = vi.fn();
    for (const a of document.querySelectorAll('a')) a.addEventListener('click', clicked);
    document.querySelectorAll('a')[1].addEventListener('click', (e) => e.preventDefault());
    const assign = vi.fn();
    const lane = await openConversationInPage(
      document,
      { href: '/messages/e2ee/t/111', url: 'https://x/full' },
      { assign },
    );
    expect(lane).toBe('anchor');
    expect(clicked).toHaveBeenCalledTimes(1);
    expect(assign).not.toHaveBeenCalled();
  });

  it('falls back to a full navigation when the anchor left the DOM', async () => {
    document.documentElement.innerHTML = '<body><a href="/messages/t/1">one</a></body>';
    const assign = vi.fn();
    const lane = await openConversationInPage(
      document,
      { href: '/messages/t/gone', url: 'https://x/full' },
      { assign },
    );
    expect(lane).toBe('load');
    expect(assign).toHaveBeenCalledWith('https://x/full');
  });

  // a pin's href is the absolute document URL at pin time; the sidebar links
  // to that thread with a relative href — they must still meet
  it('matches an absolute pin href against a relative sidebar anchor', async () => {
    setURL('https://www.facebook.com/messages/t/1');
    document.documentElement.innerHTML =
      '<body><a href="/messages/t/1">here</a><a href="/messages/t/22">there</a></body>';
    const clicked = vi.fn();
    for (const a of document.querySelectorAll('a')) {
      a.addEventListener('click', (e) => {
        e.preventDefault();
        clicked(a.textContent);
      });
    }
    const assign = vi.fn();
    const url = 'https://www.facebook.com/messages/t/22';
    await openConversationInPage(document, { href: url, url }, { assign });
    expect(clicked).toHaveBeenCalledWith('there');
    expect(assign).not.toHaveBeenCalled();
  });

  // facebook's thread links end in a slash and the pinned URL may carry a
  // query — the 2026-08-27 "waking Messenger" report was exactly this miss
  it('ignores a trailing slash and the query string when matching', async () => {
    setURL('https://www.facebook.com/messages/t/1/');
    document.documentElement.innerHTML = '<body><a href="/messages/t/22/">there</a></body>';
    const clicked = vi.fn();
    document.querySelector('a')?.addEventListener('click', (e) => {
      e.preventDefault();
      clicked();
    });
    const assign = vi.fn();
    const url = 'https://www.facebook.com/messages/t/22?entrypoint=pin';
    await openConversationInPage(document, { href: url, url }, { assign });
    expect(clicked).toHaveBeenCalledTimes(1);
    expect(assign).not.toHaveBeenCalled();
  });

  // opening a pin from inside its own conversation used to reload the SPA
  it('does nothing when the document is already on the URL', async () => {
    setURL('https://www.facebook.com/messages/t/22');
    document.documentElement.innerHTML = '<body><a href="/messages/t/22">here</a></body>';
    const clicked = vi.fn();
    document.querySelector('a')?.addEventListener('click', clicked);
    const assign = vi.fn();
    const url = 'https://www.facebook.com/messages/t/22';
    const lane = await openConversationInPage(document, { href: url, url }, { assign });
    expect(lane).toBe('same');
    expect(clicked).not.toHaveBeenCalled();
    expect(assign).not.toHaveBeenCalled();
  });

  // WhatsApp: every thread shares one URL, so the name goes first — before
  // the same-URL check would declare there is nothing to do
  it('lets a recipe open a named conversation before any URL logic', async () => {
    setURL('https://web.whatsapp.com/');
    document.documentElement.innerHTML = '<body></body>';
    const byName = vi.fn(() => true);
    const assign = vi.fn();
    const url = 'https://web.whatsapp.com/';
    const lane = await openConversationInPage(
      document,
      { href: url, url, conversation: 'FULL TEAM' },
      { byName, assign },
    );
    expect(lane).toBe('name');
    expect(byName).toHaveBeenCalledWith(document, 'FULL TEAM');
    expect(assign).not.toHaveBeenCalled();
  });

  it('awaits a recipe opener that has to scroll a virtual list', async () => {
    setURL('https://web.whatsapp.com/');
    document.documentElement.innerHTML = '<body></body>';
    const byName = vi.fn(async () => true);
    const url = 'https://web.whatsapp.com/';
    const lane = await openConversationInPage(
      document,
      { href: url, url, conversation: 'FULL TEAM' },
      { byName, assign: vi.fn() },
    );
    expect(lane).toBe('name');
  });

  it('falls through to the URL logic when the recipe cannot find the row', async () => {
    setURL('https://web.whatsapp.com/');
    document.documentElement.innerHTML = '<body></body>';
    const assign = vi.fn();
    const url = 'https://web.whatsapp.com/';
    const lane = await openConversationInPage(
      document,
      { href: url, url, conversation: 'gone' },
      { byName: () => false, assign },
    );
    expect(lane).toBe('same'); // same URL: staying put beats a reload
    expect(assign).not.toHaveBeenCalled();
  });

  // Zalo ignores synthetic clicks: the recipe answers with the row's centre
  // and the preload hands it to main for a trusted click — never a navigation
  it('forwards a point from the recipe to the trusted-click sender', async () => {
    setURL('https://chat.zalo.me/');
    document.documentElement.innerHTML = '<body></body>';
    const trustedClick = vi.fn();
    const assign = vi.fn();
    const url = 'https://chat.zalo.me/';
    const lane = await openConversationInPage(
      document,
      { href: url, url, conversation: 'Design team' },
      { byName: () => ({ x: 160, y: 240 }), trustedClick, assign },
    );
    expect(lane).toBe('name');
    expect(trustedClick).toHaveBeenCalledWith({ x: 160, y: 240 });
    expect(assign).not.toHaveBeenCalled();
  });

  // whatsapp/zalo recents: the title is the only handle, and no URL can name
  // a thread — a miss must stay put rather than reload the SPA
  it('a name-only open never navigates, hit or miss', async () => {
    setURL('https://web.whatsapp.com/');
    document.documentElement.innerHTML = '<body><a href="/x">x</a></body>';
    const assign = vi.fn();
    const byName = vi.fn().mockReturnValue(false);
    const lane = await openConversationInPage(
      document,
      { conversation: 'Nguyên Diêu' },
      { assign, byName },
    );
    expect(lane).toBe('miss');
    expect(byName).toHaveBeenCalledWith(document, 'Nguyên Diêu');
    expect(assign).not.toHaveBeenCalled();
  });

  // the shim's registry: the site's own onclick knows the thread id, so it
  // runs before a display name (which can name two chats) is looked up
  it('replays the shim handle first and stops there on a hit', async () => {
    document.documentElement.innerHTML = '<body></body>';
    const replay = vi.fn(() => true);
    const byName = vi.fn(() => true);
    const lane = await openConversationInPage(
      document,
      { clickId: 7, conversation: 'Mẹ' },
      { replay, byName, assign: vi.fn() },
    );
    expect(lane).toBe('replay');
    expect(replay).toHaveBeenCalledWith(7);
    expect(byName).not.toHaveBeenCalled();
  });

  // the site closed or evicted the banner, or the document was replaced —
  // main cannot know, so the miss is what moves the open on to the next lane
  it('falls from a dead replay handle to the name lane', async () => {
    document.documentElement.innerHTML = '<body></body>';
    const byName = vi.fn(() => true);
    const lane = await openConversationInPage(
      document,
      { clickId: 7, conversation: 'Mẹ' },
      { replay: () => false, byName, assign: vi.fn() },
    );
    expect(lane).toBe('name');
    expect(byName).toHaveBeenCalledWith(document, 'Mẹ');
  });

  it('a dead replay handle with nothing else is a miss that stays put', async () => {
    document.documentElement.innerHTML = '<body><a href="/x">x</a></body>';
    const assign = vi.fn();
    const lane = await openConversationInPage(
      document,
      { clickId: 7 },
      { replay: () => false, assign },
    );
    expect(lane).toBe('miss');
    expect(assign).not.toHaveBeenCalled();
  });

  it('a clickId with no replay hook installed is a miss, not a throw', async () => {
    document.documentElement.innerHTML = '<body></body>';
    await expect(openConversationInPage(document, { clickId: 7 }, {})).resolves.toBe('miss');
  });
});
