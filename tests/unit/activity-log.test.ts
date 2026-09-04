import { describe, expect, it } from 'vitest';
import {
  ACTIVITY_CAP,
  type ActivityEntry,
  ActivityLog,
  openHref,
} from '../../src/main/lib/activity-log';

const entry = (
  n: number,
  over: Partial<Omit<ActivityEntry, 'id'>> = {},
): Omit<ActivityEntry, 'id'> => ({
  serviceId: 'telegram',
  title: `chat ${n}`,
  conversation: over.title ?? `chat ${n}`,
  synthetic: false,
  silenced: false,
  at: n,
  ...over,
});

describe('ActivityLog', () => {
  it('caps at ACTIVITY_CAP, dropping the oldest', () => {
    const log = new ActivityLog();
    for (let i = 1; i <= ACTIVITY_CAP + 5; i++) log.append(entry(i));
    const rows = log.recent();
    expect(rows).toHaveLength(ACTIVITY_CAP);
    expect(rows[0].title).toBe(`chat ${ACTIVITY_CAP + 5}`); // newest first
    expect(rows.at(-1)?.title).toBe('chat 6');
  });

  it('dedupes by href with the newest entry winning', () => {
    const log = new ActivityLog();
    log.append(entry(1, { href: '/t/1' }));
    log.append(entry(2, { title: 'renamed', href: '/t/1', silenced: true }));
    const rows = log.recent();
    expect(rows).toHaveLength(1);
    expect(rows[0].title).toBe('renamed');
    expect(rows[0].silenced).toBe(true);
  });

  it('falls back to service+conversation as the dedupe key', () => {
    const log = new ActivityLog();
    log.append(entry(1, { title: 'Mẹ' }));
    log.append(entry(2, { title: 'Mẹ' }));
    log.append(entry(3, { title: 'Mẹ', serviceId: 'whatsapp' }));
    expect(log.recent()).toHaveLength(2); // same title on two services stays two rows
  });

  // two Discord banners from one channel differ in their sender, so the raw
  // title cannot be the key — the parsed conversation is (2026-09-03)
  it('collapses banners that share a conversation but not a title', () => {
    const log = new ActivityLog();
    log.append(
      entry(1, {
        serviceId: 'discord',
        title: 'bangnk (#alerts, Text Channels)',
        conversation: '#alerts',
        author: 'bangnk',
      }),
    );
    log.append(
      entry(2, {
        serviceId: 'discord',
        title: 'Username (#alerts, Ticketbox)',
        conversation: '#alerts',
        author: 'Username',
      }),
    );
    const rows = log.recent();
    expect(rows).toHaveLength(1);
    expect(rows[0].title).toBe('#alerts'); // the row leads with the channel
    expect(rows[0].author).toBe('Username'); // newest sender wins
  });

  it('never exposes hrefs to the renderer view', () => {
    const log = new ActivityLog();
    log.append(entry(1, { href: 'https://web.telegram.org/a/#123' }));
    expect('href' in log.recent()[0]).toBe(false);
  });

  it('resolves an id back to the full entry', () => {
    const log = new ActivityLog();
    log.append(entry(1, { href: '/x' }));
    const id = log.recent()[0].id;
    expect(log.get(id)?.href).toBe('/x');
    expect(log.get(999)).toBeUndefined();
  });

  it('clears one service without touching the others', () => {
    const log = new ActivityLog();
    log.append(entry(1, { serviceId: 'telegram' }));
    log.append(entry(2, { serviceId: 'messenger' }));
    log.append(entry(3, { serviceId: 'telegram' }));

    log.clear('telegram');

    const rows = log.recent();
    expect(rows).toHaveLength(1);
    expect(rows[0].serviceId).toBe('messenger');
  });

  it('clears every entry when given no service', () => {
    const log = new ActivityLog();
    log.append(entry(1, { serviceId: 'telegram' }));
    log.append(entry(2, { serviceId: 'messenger' }));

    log.clear();

    expect(log.recent()).toHaveLength(0);
  });

  // ids are opaque handles the switcher holds across a purge; a cleared
  // entry must resolve to undefined rather than to a recycled row
  it('never reissues a cleared id', () => {
    const log = new ActivityLog();
    log.append(entry(1));
    log.clear();
    log.append(entry(2));

    expect(log.get(1)).toBeUndefined();
    expect(log.get(2)?.title).toBe('chat 2');
  });

  it('keeps the shim clickId so a recents row can replay the page own click', () => {
    const log = new ActivityLog();
    log.append(entry(1, { clickId: 7 }));
    expect(log.get(log.recent()[0].id)?.clickId).toBe(7);
  });

  it('never exposes the clickId to the renderer view', () => {
    const log = new ActivityLog();
    log.append(entry(1, { clickId: 7 }));
    expect('clickId' in log.recent()[0]).toBe(false);
  });

  // the shim registry lives and dies with the page JS context, and its ids
  // restart at 1 — replaying a pre-reload id would fire a different banner
  it('forgetReplay drops one service replay handles, keeping its rows', () => {
    const log = new ActivityLog();
    log.append(entry(1, { serviceId: 'discord', clickId: 3 }));
    log.append(entry(2, { serviceId: 'whatsapp', clickId: 4 }));

    log.forgetReplay('discord');

    const rows = log.recent();
    expect(rows).toHaveLength(2);
    const byService = (id: string) => log.get(rows.find((r) => r.serviceId === id)?.id ?? -1);
    expect(byService('discord')?.clickId).toBeUndefined();
    expect(byService('discord')?.title).toBe('chat 1');
    expect(byService('whatsapp')?.clickId).toBe(4);
  });

  // Discord dings itself, so its rows carry only a shim handle that dies with
  // the banner's document; the URL the page landed on when that handle was
  // replayed is the one durable lane the row can have
  it('a URL learned from a landed open becomes the row open href', () => {
    const log = new ActivityLog();
    log.append(entry(1, { serviceId: 'discord', clickId: 3 }));
    const id = log.recent()[0].id;
    expect(openHref(log.get(id) as ActivityEntry)).toBeUndefined();
    log.learnUrl(id, 'https://discord.com/channels/1/2');
    expect(openHref(log.get(id) as ActivityEntry)).toBe('https://discord.com/channels/1/2');
  });

  it('a synthetic banner keeps its own href over anything learned', () => {
    const log = new ActivityLog();
    log.append(entry(1, { serviceId: 'messenger', synthetic: true, href: '/messages/t/9' }));
    const id = log.recent()[0].id;
    log.learnUrl(id, 'https://www.facebook.com/messages/t/other');
    expect(openHref(log.get(id) as ActivityEntry)).toBe('/messages/t/9');
  });

  // a shim banner's href field is page-controlled and never a lane by itself
  it('a non-synthetic href is not an open href', () => {
    const log = new ActivityLog();
    log.append(entry(1, { serviceId: 'discord', href: '/channels/1/2' }));
    expect(openHref(log.get(log.recent()[0].id) as ActivityEntry)).toBeUndefined();
  });

  // the row for a conversation is its newest banner, so a lesson stamped on
  // one entry alone would be lost to the very next message in that channel
  it('the learned URL follows the conversation across banners', () => {
    const log = new ActivityLog();
    log.append(entry(1, { serviceId: 'discord', title: '#release', clickId: 1 }));
    const first = log.recent()[0].id;
    log.learnUrl(first, 'https://discord.com/channels/1/2');
    log.append(entry(2, { serviceId: 'discord', title: '#release', clickId: 2 }));
    log.append(entry(3, { serviceId: 'discord', title: '#other', clickId: 3 }));
    const rows = log.recent();
    expect(rows.map((r) => r.title)).toEqual(['#other', '#release']);
    expect(openHref(log.get(rows[1].id) as ActivityEntry)).toBe('https://discord.com/channels/1/2');
    expect(openHref(log.get(rows[0].id) as ActivityEntry)).toBeUndefined();
  });

  it('learnUrl on a rotated-out id is a no-op', () => {
    const log = new ActivityLog();
    expect(() => log.learnUrl(99, 'https://x/')).not.toThrow();
  });
});
