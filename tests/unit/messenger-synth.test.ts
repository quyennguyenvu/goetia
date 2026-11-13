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
