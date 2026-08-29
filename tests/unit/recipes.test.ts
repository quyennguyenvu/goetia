// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { recipes } from '../../src/preload/recipes';
import { countWhatsAppChats } from '../../src/preload/recipes/whatsapp';
import { SERVICES } from '../../src/shared/services';
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
  ['messenger', 'messenger', 3, 0], // bold row + blue-dot row + "Unread" text row; green presence dot excluded
  ['instagram', 'instagram', 2, 0], // "Unread"-labelled row + bold-only row; presence dot and the rail badge excluded
  ['telegram', 'telegram', 4, 2], // positive peers direct, negative indirect, muted skipped
  ['discord', 'discord', 3, 1], // lowerBadge_/numberBadge_ sum; "• Discord" title -> indirect
  ['zalo', 'zalo', 2, 0], // fa-2 tab badge
  ['tiktok', 'tiktok', 2, 0], // header Messages badge total
  ['shopee', 'shopee', 31, 0], // mini-chat header badge
  ['slack', 'slack', 3, 2], // mention badges sum direct; badge-less unread channels indirect; muted skipped
  ['teams', 'teams', 3, 2], // unread-count badges sum direct; badge-less unread rows indirect
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

describe('shopee collapsed pill', () => {
  it('counts from the pill badge while collapsed', async () => {
    expect(await recipes.shopee.count(load('shopee-collapsed'))).toEqual({
      direct: 5,
      indirect: 0,
    });
  });
});

describe('teams virtualized list', () => {
  it('falls back to the title total when no unread row is rendered', async () => {
    expect(await recipes.teams.count(load('teams-virtualized'))).toEqual({
      direct: 7,
      indirect: 0,
    });
  });
});

describe('ready()', () => {
  it('messenger is ready once chat rows are rendered', () => {
    expect(recipes.messenger.ready?.(load('messenger'))).toBe(true);
    expect(recipes.messenger.ready?.(load('blank'))).toBe(false);
  });

  it('instagram is ready once the thread list mounts', () => {
    expect(recipes.instagram.ready?.(load('instagram'))).toBe(true);
    expect(recipes.instagram.ready?.(load('blank'))).toBe(false);
  });

  it('shopee is ready only when the mini-chat is expanded', () => {
    expect(recipes.shopee.ready?.(load('shopee'))).toBe(true);
    expect(recipes.shopee.ready?.(load('shopee-collapsed'))).toBe(false);
    expect(recipes.shopee.ready?.(load('blank'))).toBe(false);
  });

  it('telegram is ready once dialog rows are rendered', () => {
    expect(recipes.telegram.ready?.(load('telegram'))).toBe(true);
    expect(recipes.telegram.ready?.(load('blank'))).toBe(false);
  });

  it('whatsapp is ready once the chat-list pane mounts', () => {
    expect(recipes.whatsapp.ready?.(load('whatsapp'))).toBe(true);
    expect(recipes.whatsapp.ready?.(load('blank'))).toBe(false);
  });

  it('discord is ready once the guild nav mounts', () => {
    expect(recipes.discord.ready?.(load('discord'))).toBe(true);
    expect(recipes.discord.ready?.(load('blank'))).toBe(false);
  });

  it('zalo is ready once the message tab mounts', () => {
    expect(recipes.zalo.ready?.(load('zalo'))).toBe(true);
    expect(recipes.zalo.ready?.(load('blank'))).toBe(false);
  });

  it('tiktok is ready once the chat list mounts under a session', () => {
    expect(recipes.tiktok.ready?.(load('tiktok'))).toBe(true);
    expect(recipes.tiktok.ready?.(load('tiktok-logged-out'))).toBe(false);
    expect(recipes.tiktok.ready?.(load('blank'))).toBe(false);
  });

  it('slack is ready once the channel sidebar mounts', () => {
    expect(recipes.slack.ready?.(load('slack'))).toBe(true);
    expect(recipes.slack.ready?.(load('blank'))).toBe(false);
  });

  it('teams is ready once the chat list mounts', () => {
    expect(recipes.teams.ready?.(load('teams'))).toBe(true);
    expect(recipes.teams.ready?.(load('blank'))).toBe(false);
  });
});

describe('waitForReady flag', () => {
  it('matches exactly the recipes that define ready()', () => {
    for (const svc of SERVICES) {
      expect(Boolean(svc.waitForReady)).toBe(recipes[svc.id]?.ready !== undefined);
    }
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

describe('chatPaths mirror', () => {
  // main validates lane-B hrefs against ServiceMeta.chatPaths; the recipe's
  // copy is what the runner contains with — they must never drift
  it('ServiceMeta.chatPaths matches each recipe', () => {
    for (const s of SERVICES) {
      expect(s.chatPaths ?? null, s.id).toEqual(recipes[s.id].chatPaths ?? null);
    }
  });
});
