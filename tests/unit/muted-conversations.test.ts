// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { recipes } from '../../src/preload/recipes';
import { isMutedRow } from '../../src/preload/recipes/meta-unread';
import { countWhatsAppChats } from '../../src/preload/recipes/whatsapp';

// A conversation the user muted on the site never counts toward the badge and
// never names a synthesized banner (user decision, 2026-10-03).

function load(name: string): Document {
  const html = readFileSync(join(__dirname, '../fixtures', `${name}.html`), 'utf8');
  document.documentElement.innerHTML = html;
  const titleMatch = html.match(/<title>([^<]*)<\/title>/);
  document.title = titleMatch ? titleMatch[1] : '';
  return document;
}

describe('messenger muted threads', () => {
  it('tells the muted bell from a pinned icon in the same grey', () => {
    const doc = load('messenger-muted');
    expect(isMutedRow(doc.getElementById('muted') as Element)).toBe(true);
    expect(isMutedRow(doc.getElementById('read-muted') as Element)).toBe(true);
    expect(isMutedRow(doc.getElementById('pinned') as Element)).toBe(false);
  });

  it('leaves a muted thread out of the count, but not a pinned one', () => {
    expect(recipes.messenger.count(load('messenger-muted'))).toEqual({ direct: 1, indirect: 0 });
  });

  it('never names a muted thread in a synthesized banner', () => {
    expect(recipes.messenger.synthNotification?.(load('messenger-muted'))).toMatchObject({
      title: 'Ana Bui',
      href: '/messages/t/602/',
    });
  });
});

describe('instagram muted threads', () => {
  it('leaves a thread carrying the muted icon out of the count', () => {
    expect(recipes.instagram.count(load('instagram-muted'))).toEqual({ direct: 1, indirect: 0 });
  });

  it('never names a muted thread in a synthesized banner', () => {
    expect(recipes.instagram.synthNotification?.(load('instagram-muted'))).toEqual({
      title: 'minh.le',
      body: 'Sent a photo',
    });
  });
});

describe('teams muted chats', () => {
  it('leaves a muted chat out, badge and all', () => {
    expect(recipes.teams.count(load('teams-muted'))).toEqual({ direct: 0, indirect: 1 });
  });

  it('does not fall back to the title when the only unread chat on screen is muted', () => {
    const doc = load('teams-muted');
    doc.getElementById('unmuted')?.remove();
    expect(recipes.teams.count(doc)).toEqual({ direct: 0, indirect: 0 });
  });
});

describe('whatsapp muted chats', () => {
  it('counts neither a muted nor an auto-muted chat', () => {
    expect(
      countWhatsAppChats([
        { unreadCount: 2 },
        { unreadCount: 3, muteExpiration: -1 },
        { unreadCount: 4, muteExpiration: 1_900_000_000 },
        { unreadCount: 1, isAutoMuted: true },
      ]),
    ).toEqual({ direct: 2, indirect: 0 });
  });
});
