// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { openConversationInPage } from '../../src/preload/lib/conversation-open';

describe('openConversationInPage', () => {
  it('clicks the anchor whose href attribute matches exactly', () => {
    document.documentElement.innerHTML =
      '<body><a href="/messages/t/1">one</a><a href="/messages/e2ee/t/111">two</a></body>';
    const clicked = vi.fn();
    for (const a of document.querySelectorAll('a')) a.addEventListener('click', clicked);
    document.querySelectorAll('a')[1].addEventListener('click', (e) => e.preventDefault());
    const assign = vi.fn();
    openConversationInPage(document, '/messages/e2ee/t/111', 'https://x/full', assign);
    expect(clicked).toHaveBeenCalledTimes(1);
    expect(assign).not.toHaveBeenCalled();
  });

  it('falls back to a full navigation when the anchor left the DOM', () => {
    document.documentElement.innerHTML = '<body><a href="/messages/t/1">one</a></body>';
    const assign = vi.fn();
    openConversationInPage(document, '/messages/t/gone', 'https://x/full', assign);
    expect(assign).toHaveBeenCalledWith('https://x/full');
  });
});
