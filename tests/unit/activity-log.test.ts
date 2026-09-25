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
    const ids: number[] = [];
    for (let i = 1; i <= ACTIVITY_CAP + 5; i++) ids.push(log.append(entry(i)));
    expect(log.get(ids[0])).toBeUndefined();
    expect(log.get(ids[4])).toBeUndefined();
    expect(log.get(ids[5])?.title).toBe('chat 6');
    expect(log.get(ids[ids.length - 1])?.title).toBe(`chat ${ACTIVITY_CAP + 5}`);
  });

  it('resolves an id back to the full entry', () => {
    const log = new ActivityLog();
    const id = log.append(entry(1, { href: '/x' }));
    expect(log.get(id)?.href).toBe('/x');
    expect(log.get(999)).toBeUndefined();
  });

  it('clears one service without touching the others', () => {
    const log = new ActivityLog();
    const a = log.append(entry(1, { serviceId: 'telegram' }));
    const b = log.append(entry(2, { serviceId: 'messenger' }));
    log.clear('telegram');
    expect(log.get(a)).toBeUndefined();
    expect(log.get(b)?.serviceId).toBe('messenger');
  });

  it('clears every entry when given no service', () => {
    const log = new ActivityLog();
    const a = log.append(entry(1, { serviceId: 'telegram' }));
    const b = log.append(entry(2, { serviceId: 'messenger' }));
    log.clear();
    expect(log.get(a)).toBeUndefined();
    expect(log.get(b)).toBeUndefined();
  });

  // ids are opaque handles a Notification Center banner holds across a
  // purge; a cleared entry must resolve to undefined, never to a recycled row
  it('never reissues a cleared id', () => {
    const log = new ActivityLog();
    const first = log.append(entry(1));
    log.clear();
    const second = log.append(entry(2));
    expect(second).not.toBe(first);
    expect(log.get(first)).toBeUndefined();
    expect(log.get(second)?.title).toBe('chat 2');
  });

  it('keeps the shim clickId so a banner click can replay the page own click', () => {
    const log = new ActivityLog();
    const id = log.append(entry(1, { clickId: 7 }));
    expect(log.get(id)?.clickId).toBe(7);
  });

  // the shim registry lives and dies with the page JS context, and its ids
  // restart at 1 — replaying a pre-reload id would fire a different banner
  it('forgetReplay drops one service replay handles, keeping its entries', () => {
    const log = new ActivityLog();
    const d = log.append(entry(1, { serviceId: 'discord', clickId: 3 }));
    const w = log.append(entry(2, { serviceId: 'whatsapp', clickId: 4 }));
    log.forgetReplay('discord');
    expect(log.get(d)?.clickId).toBeUndefined();
    expect(log.get(d)?.title).toBe('chat 1');
    expect(log.get(w)?.clickId).toBe(4);
  });

  // Discord dings itself, so its entries carry only a shim handle that dies
  // with the banner's document; the URL the page landed on when that handle
  // was replayed is the one durable lane the entry can have
  it('a URL learned from a landed open becomes the entry open href', () => {
    const log = new ActivityLog();
    const id = log.append(entry(1, { serviceId: 'discord', clickId: 3 }));
    expect(openHref(log.get(id) as ActivityEntry)).toBeUndefined();
    log.learnUrl(id, 'https://discord.com/channels/1/2');
    expect(openHref(log.get(id) as ActivityEntry)).toBe('https://discord.com/channels/1/2');
  });

  it('a synthetic banner keeps its own href over anything learned', () => {
    const log = new ActivityLog();
    const id = log.append(
      entry(1, { serviceId: 'messenger', synthetic: true, href: '/messages/t/9' }),
    );
    log.learnUrl(id, 'https://www.facebook.com/messages/t/other');
    expect(openHref(log.get(id) as ActivityEntry)).toBe('/messages/t/9');
  });

  // a shim banner's href field is page-controlled and never a lane by itself
  it('a non-synthetic href is not an open href', () => {
    const log = new ActivityLog();
    const id = log.append(entry(1, { serviceId: 'discord', href: '/channels/1/2' }));
    expect(openHref(log.get(id) as ActivityEntry)).toBeUndefined();
  });

  // the entry a banner click resolves is the conversation's newest, so a
  // lesson stamped on one entry alone would be lost to the very next message
  it('the learned URL follows the conversation across banners', () => {
    const log = new ActivityLog();
    const first = log.append(entry(1, { serviceId: 'discord', title: '#release', clickId: 1 }));
    log.learnUrl(first, 'https://discord.com/channels/1/2');
    const second = log.append(entry(2, { serviceId: 'discord', title: '#release', clickId: 2 }));
    const other = log.append(entry(3, { serviceId: 'discord', title: '#other', clickId: 3 }));
    expect(openHref(log.get(second) as ActivityEntry)).toBe('https://discord.com/channels/1/2');
    expect(openHref(log.get(other) as ActivityEntry)).toBeUndefined();
  });

  it('learnUrl on a rotated-out id is a no-op', () => {
    const log = new ActivityLog();
    expect(() => log.learnUrl(99, 'https://x/')).not.toThrow();
  });
});
