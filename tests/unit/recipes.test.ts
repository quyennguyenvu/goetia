// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { recipes } from '../../src/preload/recipes';
import { discordThreadUrl, openDiscordThread } from '../../src/preload/recipes/discord';
import {
  openSlackThread,
  parseSlackThreadUrl,
  slackThreadUrl,
} from '../../src/preload/recipes/slack';
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

function setURL(url: string): void {
  (window as unknown as { happyDOM: { setURL(u: string): void } }).happyDOM.setURL(url);
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

describe('bannerTitleNamesConversation', () => {
  // the flag tells main a shim banner's title IS the thread name, which is
  // only actionable through the recipe's own row-clicking opener
  it('is set exactly where the URL names no thread, and openConversation exists', () => {
    const flagged = SERVICES.filter((s) => s.bannerTitleNamesConversation).map((s) => s.id);
    expect(flagged).toEqual(['whatsapp', 'zalo']);
    for (const id of flagged) expect(recipes[id].openConversation, id).toBeDefined();
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

describe('slack thread URL', () => {
  const THREAD =
    'https://app.slack.com/client/T0GCQ370X/C1755B8LV/thread/C1755B8LV-1788402687.118899';

  it('mints the canonical thread URL from the flexpane root and the team in the path', () => {
    setURL('https://app.slack.com/client/T0GCQ370X/C1755B8LV');
    expect(slackThreadUrl(load('slack-thread'))).toBe(THREAD);
  });

  it('is null when no thread is open, and on blank and login-shaped pages', () => {
    setURL('https://app.slack.com/client/T0GCQ370X/C1755B8LV');
    const doc = load('slack-thread');
    doc.querySelector('[data-qa="threads_flexpane"]')?.remove();
    expect(slackThreadUrl(doc)).toBeNull();
    expect(slackThreadUrl(load('slack'))).toBeNull();
    expect(slackThreadUrl(load('blank'))).toBeNull();
  });

  it('is null when the document path carries no team segment', () => {
    setURL('https://app.slack.com/client');
    expect(slackThreadUrl(load('slack-thread'))).toBeNull();
  });

  // the flexpane rule: a selection in the channel pane pins the channel
  it('yields the thread for a selection inside the flexpane and null for one outside', () => {
    setURL('https://app.slack.com/client/T0GCQ370X/C1755B8LV');
    const doc = load('slack-thread');
    const inside = doc.querySelector(
      '[data-qa="threads_flexpane"] .c-message_kit__blocks',
    )?.firstChild;
    const outside = doc.querySelector('.p-message_pane .c-message_kit__blocks')?.firstChild;
    expect(slackThreadUrl(doc, inside)).toBe(THREAD);
    expect(slackThreadUrl(doc, outside)).toBeNull();
    expect(slackThreadUrl(doc, null)).toBe(THREAD);
  });

  it('parses only the canonical thread form', () => {
    expect(parseSlackThreadUrl(THREAD)).toEqual({
      team: 'T0GCQ370X',
      channel: 'C1755B8LV',
      ts: '1788402687.118899',
    });
    expect(parseSlackThreadUrl('https://app.slack.com/client/T0GCQ370X/C1755B8LV')).toBeNull();
    expect(
      parseSlackThreadUrl('https://we-build-vn.slack.com/archives/C1755B8LV/p1788402687118899'),
    ).toBeNull();
    expect(
      parseSlackThreadUrl(
        'https://app.slack.com/client/T0GCQ370X/C1755B8LV/thread/C0P5CRESE-1788402687.118899',
      ),
    ).toBeNull(); // the thread's channel must be the route's channel
    expect(parseSlackThreadUrl('not a url')).toBeNull();
  });
});

describe('openSlackThread', () => {
  const THREAD =
    'https://app.slack.com/client/T0GCQ370X/C1755B8LV/thread/C1755B8LV-1788402687.118899';
  const settle = () => Promise.resolve();

  function arm(doc: Document) {
    const row = vi.fn();
    const view = vi.fn();
    doc
      .querySelector('[data-qa-channel-sidebar-channel-id="C1755B8LV"]')
      ?.addEventListener('click', row);
    doc.querySelector('[data-qa="reply_bar_view_thread"]')?.addEventListener('click', view);
    return { row, view };
  }

  it('is done at once when the flexpane already shows the root', async () => {
    const doc = load('slack-thread');
    const { row, view } = arm(doc);
    expect(await openSlackThread(doc, THREAD, { settle })).toBe(true);
    expect(row).not.toHaveBeenCalled();
    expect(view).not.toHaveBeenCalled();
  });

  it('clicks View thread on the root when the channel is already selected', async () => {
    const doc = load('slack-thread');
    doc.querySelector('[data-qa="threads_flexpane"]')?.remove();
    const { row, view } = arm(doc);
    expect(await openSlackThread(doc, THREAD, { settle })).toBe(true);
    expect(row).not.toHaveBeenCalled();
    expect(view).toHaveBeenCalledTimes(1);
  });

  // the root message renders only after the pane switches channel
  it('clicks the channel row first and waits for the root to render', async () => {
    const doc = load('slack-thread');
    doc.querySelector('[data-qa="threads_flexpane"]')?.remove();
    const row = doc.querySelector(
      '[data-qa-channel-sidebar-channel-id="C1755B8LV"]',
    ) as HTMLElement;
    row.setAttribute('data-qa-channel-sidebar-channel-is-selected', 'false');
    const pane = doc.querySelector('.p-message_pane') as HTMLElement;
    const messages = pane.innerHTML;
    pane.innerHTML = '';
    const rowClicks = vi.fn(() => {
      row.setAttribute('data-qa-channel-sidebar-channel-is-selected', 'true');
    });
    row.addEventListener('click', rowClicks);
    let settles = 0;
    const result = await openSlackThread(doc, THREAD, {
      settle: () => {
        settles++;
        pane.innerHTML = messages; // the pane fills in a beat after the switch
        return Promise.resolve();
      },
    });
    expect(result).toBe(true);
    expect(rowClicks).toHaveBeenCalledTimes(1);
    expect(settles).toBe(1);
  });

  it('misses on a non-thread URL, a missing row, and a root outside the pane', async () => {
    const doc = load('slack-thread');
    doc.querySelector('[data-qa="threads_flexpane"]')?.remove();
    expect(
      await openSlackThread(doc, 'https://app.slack.com/client/T0GCQ370X/C1755B8LV', { settle }),
    ).toBe(false);
    expect(
      await openSlackThread(
        doc,
        'https://app.slack.com/client/T0GCQ370X/C0NOPE000/thread/C0NOPE000-1.2',
        { settle, maxWaits: 2 },
      ),
    ).toBe(false);
    expect(
      await openSlackThread(
        doc,
        'https://app.slack.com/client/T0GCQ370X/C1755B8LV/thread/C1755B8LV-1700000000.000001',
        { settle, maxWaits: 2 },
      ),
    ).toBe(false);
  });

  it('misses when the root has no reply bar to click', async () => {
    const doc = load('slack-thread');
    doc.querySelector('[data-qa="threads_flexpane"]')?.remove();
    doc.querySelector('.p-message_pane .c-message__reply_bar')?.remove();
    expect(await openSlackThread(doc, THREAD, { settle, maxWaits: 2 })).toBe(false);
  });
});

describe('conversationUrl / openUrl hook pair', () => {
  it('a recipe declaring one declares the other', () => {
    for (const s of SERVICES) {
      const r = recipes[s.id];
      expect(r.conversationUrl !== undefined, s.id).toBe(r.openUrl !== undefined);
    }
    expect(recipes.slack.conversationUrl).toBeDefined();
    expect(recipes.discord.conversationUrl).toBeDefined();
  });
});

// a Discord thread has no anchor anywhere in the DOM: the sidebar links
// channels only, and the thread opens in-page solely through the Open Thread
// accessory on its root message (whose id IS the thread id). Without a recipe
// opener every lane missed and the pin fell to a full load — the 2026-09-06
// "pin reloads Discord" report.
describe('discord thread URL', () => {
  const SPLIT =
    'https://discord.com/channels/1329647866888589434/1329647867534770198/threads/1545341363917426778';

  it('is the split-view URL while a thread is open beside its channel, else null', () => {
    setURL(SPLIT);
    expect(discordThreadUrl(load('discord-thread'))).toBe(SPLIT);
    setURL('https://discord.com/channels/1329647866888589434/1329647867534770198');
    expect(discordThreadUrl(load('discord-thread'))).toBeNull();
    setURL('https://discord.com/channels/@me');
    expect(discordThreadUrl(load('blank'))).toBeNull();
  });
});

describe('openDiscordThread', () => {
  const SPLIT =
    'https://discord.com/channels/1329647866888589434/1329647867534770198/threads/1545341363917426778';
  const settle = () => Promise.resolve();

  function arm(doc: Document) {
    const channel = vi.fn((e: Event) => e.preventDefault());
    const accessory = vi.fn();
    doc
      .querySelector('a[href="/channels/1329647866888589434/1329647867534770198"]')
      ?.addEventListener('click', channel);
    doc
      .querySelector('#message-accessories-1545341363917426778 [role="button"]')
      ?.addEventListener('click', accessory);
    const row = vi.fn();
    doc
      .querySelector('[data-list-item-id="channels___1545341363917426778"]')
      ?.addEventListener('click', row);
    return { channel, accessory, row };
  }

  // a thread opened full-window is `/channels/<guild>/<thread>` — a channel's
  // shape. Its sidebar row is a role=button div, never an anchor, so the anchor
  // lane cannot reach it and the pin reloaded Discord (2026-09-06, second report)
  it('opens the full-window form by clicking the sidebar item for that id', async () => {
    setURL('https://discord.com/channels/1329647866888589434/1329657364629950495');
    const doc = load('discord-thread');
    const { channel, accessory, row } = arm(doc);
    const FULL = 'https://discord.com/channels/1329647866888589434/1545341363917426778';
    expect(await openDiscordThread(doc, FULL, { settle })).toBe(true);
    expect(row).toHaveBeenCalledTimes(1);
    expect(channel).not.toHaveBeenCalled();
    expect(accessory).not.toHaveBeenCalled();
  });

  it('is done at once when the full-window form is already on screen, split or full', async () => {
    const FULL = 'https://discord.com/channels/1329647866888589434/1545341363917426778';
    setURL(FULL);
    const doc = load('discord-thread');
    const { row } = arm(doc);
    expect(await openDiscordThread(doc, FULL, { settle })).toBe(true);
    setURL(SPLIT);
    expect(await openDiscordThread(doc, FULL, { settle })).toBe(true);
    expect(row).not.toHaveBeenCalled();
  });

  // a thread Discord does not list in the sidebar (the alert thread of the
  // 2026-09-06 third report) has nothing to click: its full-window URL names
  // no parent and no row exists. Discord's router listens to history like
  // browser back does, so the last in-page resort is pushState + popstate,
  // proven by the thread's own messages rendering — every message list item
  // is id'd chat-messages-<channel>-<message>
  it('routes an unlisted thread through history and waits for its messages', async () => {
    setURL('https://discord.com/channels/1329647866888589434/1329657364629950495');
    const doc = load('discord-thread');
    const list = doc.querySelector('[data-list-id="chat-messages"]') as HTMLElement;
    const popstates = vi.fn(() => {
      list.innerHTML = '<li id="chat-messages-1545386122287517717-1545386200000000000">alert</li>';
    });
    window.addEventListener('popstate', popstates);
    const back = vi.spyOn(window.history, 'back');
    const UNLISTED = 'https://discord.com/channels/1329647866888589434/1545386122287517717';
    try {
      expect(await openDiscordThread(doc, UNLISTED, { settle })).toBe(true);
    } finally {
      window.removeEventListener('popstate', popstates);
    }
    expect(popstates).toHaveBeenCalledTimes(1);
    expect(window.location.pathname).toBe('/channels/1329647866888589434/1545386122287517717');
    expect(back).not.toHaveBeenCalled();
    back.mockRestore();
  });

  it('undoes the route and misses when the page never renders the thread', async () => {
    setURL('https://discord.com/channels/1329647866888589434/1329657364629950495');
    const doc = load('discord-thread');
    const back = vi.spyOn(window.history, 'back').mockImplementation(() => {});
    const UNLISTED = 'https://discord.com/channels/1329647866888589434/1545386122287517717';
    expect(await openDiscordThread(doc, UNLISTED, { settle, maxWaits: 2 })).toBe(false);
    expect(back).toHaveBeenCalledTimes(1);
    back.mockRestore();
  });

  it('falls back to the sidebar row when the root accessory never renders', async () => {
    setURL('https://discord.com/channels/1329647866888589434/1329657364629950495');
    const doc = load('discord-thread');
    doc.querySelector('#message-accessories-1545341363917426778')?.remove();
    const { channel, row } = arm(doc);
    expect(await openDiscordThread(doc, SPLIT, { settle, maxWaits: 2 })).toBe(true);
    expect(channel).toHaveBeenCalledTimes(1);
    expect(row).toHaveBeenCalledTimes(1);
  });

  it('is done at once when the document already shows the thread', async () => {
    setURL(SPLIT);
    const doc = load('discord-thread');
    const { channel, accessory } = arm(doc);
    expect(await openDiscordThread(doc, SPLIT, { settle })).toBe(true);
    expect(channel).not.toHaveBeenCalled();
    expect(accessory).not.toHaveBeenCalled();
    setURL('https://discord.com/channels/1329647866888589434/1545341363917426778'); // full-screen form
    expect(await openDiscordThread(doc, SPLIT, { settle })).toBe(true);
  });

  it('clicks the Open Thread accessory when the parent channel is on screen', async () => {
    setURL('https://discord.com/channels/1329647866888589434/1329647867534770198');
    const doc = load('discord-thread');
    const { channel, accessory } = arm(doc);
    expect(await openDiscordThread(doc, SPLIT, { settle })).toBe(true);
    expect(channel).not.toHaveBeenCalled();
    expect(accessory).toHaveBeenCalledTimes(1);
  });

  it('switches to the parent channel first and waits for the root message', async () => {
    setURL('https://discord.com/channels/1329647866888589434/1329657364629950495');
    const doc = load('discord-thread');
    const list = doc.querySelector('[data-list-id="chat-messages"]') as HTMLElement;
    const messages = list.innerHTML;
    list.innerHTML = '';
    const { channel, accessory } = arm(doc);
    let settles = 0;
    const result = await openDiscordThread(doc, SPLIT, {
      settle: () => {
        settles++;
        list.innerHTML = messages; // the channel renders a beat after the switch
        arm(doc);
        return Promise.resolve();
      },
    });
    expect(result).toBe(true);
    expect(channel).toHaveBeenCalledTimes(1);
    expect(settles).toBe(1);
    expect(accessory).not.toHaveBeenCalled(); // the re-armed accessory took the click
  });

  it('misses on an unknown URL, an id with no sidebar item, and a root outside the list', async () => {
    setURL('https://discord.com/channels/1329647866888589434/1329657364629950495');
    const doc = load('discord-thread');
    doc.querySelector('[data-list-item-id="channels___1545341363917426778"]')?.remove();
    const back = vi.spyOn(window.history, 'back').mockImplementation(() => {});
    expect(await openDiscordThread(doc, 'https://discord.com/channels/@me', { settle })).toBe(
      false,
    );
    expect(
      await openDiscordThread(
        doc,
        'https://discord.com/channels/1329647866888589434/1000000000000000002',
        { settle },
      ),
    ).toBe(false);
    expect(
      await openDiscordThread(
        doc,
        'https://discord.com/channels/1329647866888589434/1000000000000000000/threads/1000000000000000001',
        { settle, maxWaits: 2 },
      ),
    ).toBe(false);
    expect(
      await openDiscordThread(
        doc,
        'https://discord.com/channels/1329647866888589434/1329647867534770198/threads/1000000000000000000',
        { settle, maxWaits: 2 },
      ),
    ).toBe(false);
    back.mockRestore();
  });
});
