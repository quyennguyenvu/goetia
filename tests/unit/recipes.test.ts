// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { recipes } from '../../src/preload/recipes';
import { countWhatsAppChats } from '../../src/preload/recipes/whatsapp';
import type { ServiceId } from '../../src/shared/types';

function load(name: string): Document {
  const html = readFileSync(join(__dirname, '../fixtures', `${name}.html`), 'utf8');
  document.documentElement.innerHTML = html;
  const titleMatch = html.match(/<title>([^<]*)<\/title>/);
  document.title = titleMatch ? titleMatch[1] : '';
  return document;
}

const cases: [ServiceId, string, number, number][] = [
  // [service, fixture, expected direct, expected indirect]
  ['whatsapp', 'whatsapp', 3, 0], // no page IndexedDB in tests -> title fallback
  ['messenger', 'messenger', 2, 0],
  ['telegram', 'telegram', 4, 2], // positive peers direct, negative indirect, muted skipped
  ['discord', 'discord', 3, 1], // lowerBadge_/numberBadge_ sum; "• Discord" title -> indirect
  ['zalo', 'zalo', 2, 0], // fa-2 tab badge
];

describe.each(cases)('%s recipe', (id, fixture, direct, indirect) => {
  it('counts unread from fixture DOM', async () => {
    expect(await recipes[id].count(load(fixture))).toEqual({ direct, indirect });
  });
  it('returns zeros on a blank logged-out page', async () => {
    expect(await recipes[id].count(load('blank'))).toEqual({ direct: 0, indirect: 0 });
  });
});

describe('zalo 5+ tab badge', () => {
  it('sums per-conversation badges, skipping muted', async () => {
    expect(await recipes.zalo.count(load('zalo-5plus'))).toEqual({ direct: 7, indirect: 0 });
  });
});

describe('countWhatsAppChats', () => {
  it('splits unread into direct and muted-indirect, skips archived', () => {
    expect(
      countWhatsAppChats([
        { unreadCount: 2 },
        { unreadCount: 3, muteExpiration: 1234 },
        { unreadCount: 1, isAutoMuted: true },
        { unreadCount: 9, archive: true },
        { unreadCount: 0 },
        {},
      ]),
    ).toEqual({ direct: 2, indirect: 4 });
  });
});
