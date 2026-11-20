// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import messenger from '../../src/preload/recipes/messenger';

function load(name: string): Document {
  const html = readFileSync(join(__dirname, '../fixtures', `${name}.html`), 'utf8');
  document.documentElement.innerHTML = html;
  return document;
}

// 2026-11-19: a badge of 1 over an empty Unread tab. The selector was
// page-wide, so a shared link in the open conversation was a "row"
describe('messenger link card in the open conversation', () => {
  it('is not an unread chat', () => {
    expect(messenger.count(load('messenger-link-card'))).toEqual({ direct: 0, indirect: 0 });
  });

  it('never names a banner', () => {
    expect(messenger.unreadBanners?.(load('messenger-link-card'))).toEqual([]);
  });
});

// 2026-11-19: with no thread links count() read the title, and facebook's
// (n) adds Facebook notifications to unseen chats
describe('messenger empty filter tab', () => {
  it('counts nothing, whatever the title says', () => {
    expect(messenger.count(load('messenger-empty-tab'))).toEqual({ direct: 0, indirect: 0 });
  });

  it('still reads the title until the list says it is empty', () => {
    const doc = load('messenger-empty-tab');
    doc.querySelector('[role="row"]')?.remove(); // the grid while it loads
    expect(messenger.count(doc)).toEqual({ direct: 2, indirect: 0 });
  });
});

// 2026-11-20: facebook made the "Chats" title a link to /messages/t/ — the
// first /t/ link in the list, so watch() observed the heading, not the rows
describe('messenger Chats title link', () => {
  it('is not the row watch() starts from', () => {
    const doc = load('messenger');
    expect(messenger.watch?.(doc)).toBe(doc.querySelector('[role="row"]')?.parentElement);
  });
});

describe('messenger synthesized banners', () => {
  // the three rows count() finds: bold text, the blue dot, the "Unread" string
  it('builds sender and preview for every unread row, in list order', () => {
    expect(messenger.unreadBanners?.(load('messenger'))).toEqual([
      { title: 'Alice', body: 'sent a photo', href: '/messages/e2ee/t/111' },
      { title: 'Carol', body: 'Vl :))', href: '/messages/e2ee/t/333' },
      { title: 'Hưng', body: 'hey', href: '/messages/e2ee/t/555' },
    ]);
  });

  it('keeps the emoji facebook renders as an image in a reaction preview', () => {
    expect(messenger.unreadBanners?.(load('messenger-reaction'))).toEqual([
      {
        title: 'Hồ Nguyễn Tiến Hưng',
        body: 'Reacted 😆 to your message',
        href: '/messages/e2ee/t/777',
      },
    ]);
  });

  it('is empty when nothing is unread', () => {
    expect(messenger.unreadBanners?.(load('blank'))).toEqual([]);
  });

  // one hook or the other: the runner asks unreadBanners and never falls back
  it('declares unreadBanners instead of synthNotification', () => {
    expect(messenger.synthNotification).toBeUndefined();
  });
});
