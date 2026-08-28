// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { openConversationInPage } from '../../src/preload/lib/conversation-open';

function setURL(url: string): void {
  (window as unknown as { happyDOM: { setURL(u: string): void } }).happyDOM.setURL(url);
}

describe('openConversationInPage', () => {
  it('clicks the anchor whose href attribute matches exactly', () => {
    document.documentElement.innerHTML =
      '<body><a href="/messages/t/1">one</a><a href="/messages/e2ee/t/111">two</a></body>';
    const clicked = vi.fn();
    for (const a of document.querySelectorAll('a')) a.addEventListener('click', clicked);
    document.querySelectorAll('a')[1].addEventListener('click', (e) => e.preventDefault());
    const assign = vi.fn();
    openConversationInPage(document, '/messages/e2ee/t/111', 'https://x/full', { assign });
    expect(clicked).toHaveBeenCalledTimes(1);
    expect(assign).not.toHaveBeenCalled();
  });

  it('falls back to a full navigation when the anchor left the DOM', () => {
    document.documentElement.innerHTML = '<body><a href="/messages/t/1">one</a></body>';
    const assign = vi.fn();
    openConversationInPage(document, '/messages/t/gone', 'https://x/full', { assign });
    expect(assign).toHaveBeenCalledWith('https://x/full');
  });

  // a pin's href is the absolute document URL at pin time; the sidebar links
  // to that thread with a relative href — they must still meet
  it('matches an absolute pin href against a relative sidebar anchor', () => {
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
    openConversationInPage(document, url, url, { assign });
    expect(clicked).toHaveBeenCalledWith('there');
    expect(assign).not.toHaveBeenCalled();
  });

  // facebook's thread links end in a slash and the pinned URL may carry a
  // query — the 2026-08-27 "waking Messenger" report was exactly this miss
  it('ignores a trailing slash and the query string when matching', () => {
    setURL('https://www.facebook.com/messages/t/1/');
    document.documentElement.innerHTML = '<body><a href="/messages/t/22/">there</a></body>';
    const clicked = vi.fn();
    document.querySelector('a')?.addEventListener('click', (e) => {
      e.preventDefault();
      clicked();
    });
    const assign = vi.fn();
    const url = 'https://www.facebook.com/messages/t/22?entrypoint=pin';
    openConversationInPage(document, url, url, { assign });
    expect(clicked).toHaveBeenCalledTimes(1);
    expect(assign).not.toHaveBeenCalled();
  });

  // opening a pin from inside its own conversation used to reload the SPA
  it('does nothing when the document is already on the URL', () => {
    setURL('https://www.facebook.com/messages/t/22');
    document.documentElement.innerHTML = '<body><a href="/messages/t/22">here</a></body>';
    const clicked = vi.fn();
    document.querySelector('a')?.addEventListener('click', clicked);
    const assign = vi.fn();
    const url = 'https://www.facebook.com/messages/t/22';
    openConversationInPage(document, url, url, { assign });
    expect(clicked).not.toHaveBeenCalled();
    expect(assign).not.toHaveBeenCalled();
  });

  // WhatsApp: every thread shares one URL, so the name goes first — before
  // the same-URL check would declare there is nothing to do
  it('lets a recipe open a named conversation before any URL logic', () => {
    setURL('https://web.whatsapp.com/');
    document.documentElement.innerHTML = '<body></body>';
    const byName = vi.fn(() => true);
    const assign = vi.fn();
    const url = 'https://web.whatsapp.com/';
    openConversationInPage(document, url, url, { conversation: 'FULL TEAM', byName, assign });
    expect(byName).toHaveBeenCalledWith(document, 'FULL TEAM');
    expect(assign).not.toHaveBeenCalled();
  });

  it('falls through to the URL logic when the recipe cannot find the row', () => {
    setURL('https://web.whatsapp.com/');
    document.documentElement.innerHTML = '<body></body>';
    const assign = vi.fn();
    const url = 'https://web.whatsapp.com/';
    openConversationInPage(document, url, url, {
      conversation: 'gone',
      byName: () => false,
      assign,
    });
    expect(assign).not.toHaveBeenCalled(); // same URL: staying put beats a reload
  });

  // Zalo ignores synthetic clicks: the recipe answers with the row's centre
  // and the preload hands it to main for a trusted click — never a navigation
  it('forwards a point from the recipe to the trusted-click sender', () => {
    setURL('https://chat.zalo.me/');
    document.documentElement.innerHTML = '<body></body>';
    const trustedClick = vi.fn();
    const assign = vi.fn();
    const url = 'https://chat.zalo.me/';
    openConversationInPage(document, url, url, {
      conversation: 'Design team',
      byName: () => ({ x: 160, y: 240 }),
      trustedClick,
      assign,
    });
    expect(trustedClick).toHaveBeenCalledWith({ x: 160, y: 240 });
    expect(assign).not.toHaveBeenCalled();
  });
});
