import { describe, expect, it } from 'vitest';
import type { ActivityEntry } from '../../src/main/lib/activity-log';
import {
  DEAD_BANNER_MS,
  isDeadBanner,
  matchesSighting,
  ZERO_IDLE,
  type ZeroEvent,
  zeroStep,
} from '../../src/main/lib/banner-clear-rules';

const zero: ZeroEvent = { kind: 'count', direct: 0, indirect: 0 };
const ready: ZeroEvent = { kind: 'ready' };

/** the effects a sequence of events produces, starting from an idle service */
function effects(events: ZeroEvent[]): string[] {
  let state = ZERO_IDLE;
  return events.map((e) => {
    const out = zeroStep(state, e);
    state = out.state;
    return out.effect;
  });
}

describe('zeroStep', () => {
  it('a zero before ready means nothing; ready then arms it', () => {
    // the runner reports its first count before the chat list has rendered
    expect(effects([zero, ready])).toEqual(['none', 'arm']);
  });

  it('ready then zero arms', () => {
    expect(effects([ready, zero])).toEqual(['none', 'arm']);
  });

  it('a repeated zero does not restart the dwell', () => {
    expect(effects([ready, zero, zero])).toEqual(['none', 'arm', 'none']);
  });

  it('a non-zero count cancels, and an indirect dot is not zero', () => {
    expect(effects([ready, zero, { kind: 'count', direct: 1, indirect: 0 }])).toEqual([
      'none',
      'arm',
      'cancel',
    ]);
    expect(effects([ready, { kind: 'count', direct: 0, indirect: 1 }])).toEqual(['none', 'none']);
  });

  it('stale cancels and the old zero is not trusted again', () => {
    expect(effects([ready, zero, { kind: 'stale' }, ready])).toEqual([
      'none',
      'arm',
      'cancel',
      'none',
    ]);
  });

  it('a navigation cancels and forgets both halves', () => {
    expect(effects([ready, zero, { kind: 'navigated' }, zero, ready])).toEqual([
      'none',
      'arm',
      'cancel',
      'none',
      'arm',
    ]);
  });

  it('a zero remembered from the previous document never arms', () => {
    expect(effects([zero, { kind: 'navigated' }, ready])).toEqual(['none', 'none', 'none']);
  });

  it('a destroyed view cancels like a navigation', () => {
    expect(effects([ready, zero, { kind: 'destroyed' }, ready])).toEqual([
      'none',
      'arm',
      'cancel',
      'none',
    ]);
  });
});

const entry = (over: Partial<ActivityEntry> = {}): ActivityEntry => ({
  id: 1,
  serviceId: 'messenger',
  title: 'Mẹ',
  conversation: 'Mẹ',
  synthetic: false,
  silenced: false,
  at: 1,
  ...over,
});

const FB = 'https://www.facebook.com/messages/';

describe('matchesSighting', () => {
  it('matches the conversation by name', () => {
    expect(matchesSighting(entry(), { label: 'Mẹ', url: `${FB}t/1` }, FB)).toBe(true);
  });

  it('matches a banner to a Recent label that was clipped with an ellipsis', () => {
    const long = 'Nhóm '.concat('a'.repeat(120));
    const label = `${long.slice(0, 79)}…`;
    expect(matchesSighting(entry({ conversation: long }), { label, url: FB }, FB)).toBe(true);
    expect(matchesSighting(entry({ conversation: 'Nhóm khác' }), { label, url: FB }, FB)).toBe(
      false,
    );
  });

  it('compares names composed and without emoji presentation selectors', () => {
    const decomposed = 'Mẹ'.normalize('NFD');
    expect(matchesSighting(entry({ conversation: decomposed }), { label: 'Mẹ', url: FB }, FB)).toBe(
      true,
    );
    expect(matchesSighting(entry({ conversation: 'Nhà ❤' }), { label: 'Nhà ❤️', url: FB }, FB)).toBe(
      true,
    );
  });

  it('refuses a prefix, a truncation and an empty name', () => {
    expect(
      matchesSighting(entry({ conversation: 'An' }), { label: 'An Nguyen', url: FB }, FB),
    ).toBe(false);
    expect(
      matchesSighting(entry({ conversation: 'An Ngu…' }), { label: 'An Nguyen', url: FB }, FB),
    ).toBe(false);
    expect(matchesSighting(entry({ conversation: '' }), { label: '', url: FB }, FB)).toBe(false);
  });

  it("matches a synthetic banner's relative href against the page URL", () => {
    const e = entry({ conversation: 'x', synthetic: true, href: '/messages/t/123/' });
    expect(matchesSighting(e, { label: 'y', url: `${FB}t/123` }, FB)).toBe(true);
    expect(matchesSighting(e, { label: 'y', url: `${FB}t/999` }, FB)).toBe(false);
  });

  it("never trusts a shim banner's own href, only a learned URL", () => {
    const shim = entry({ conversation: 'x', href: '/messages/t/123/' });
    expect(matchesSighting(shim, { label: 'y', url: `${FB}t/123` }, FB)).toBe(false);
    const learned = entry({
      serviceId: 'discord',
      conversation: '#release',
      landedUrl: 'https://discord.com/channels/1/2',
    });
    expect(
      matchesSighting(
        learned,
        { label: '#release | Ticketbox', url: 'https://discord.com/channels/1/2' },
        'https://discord.com/channels/@me',
      ),
    ).toBe(true);
  });

  it('refuses another origin and an href that does not parse', () => {
    const e = entry({
      conversation: 'x',
      synthetic: true,
      href: 'https://evil.example/messages/t/1',
    });
    expect(matchesSighting(e, { label: 'y', url: `${FB}t/1` }, FB)).toBe(false);
    const bad = entry({ conversation: 'x', synthetic: true, href: 'http://[' });
    expect(matchesSighting(bad, { label: 'y', url: FB }, FB)).toBe(false);
  });

  it("never matches on the service's own URL — it names no thread", () => {
    const shop = 'https://shopee.vn/';
    const e = entry({ serviceId: 'shopee', conversation: 'Shop A', synthetic: true, href: shop });
    expect(matchesSighting(e, { label: 'Shop B', url: shop }, shop)).toBe(false);
  });
});

describe('isDeadBanner', () => {
  const DISCORD = { url: 'https://discord.com/channels/@me' };
  const MESSENGER = { url: FB, chatPaths: ['/messages'] };
  const WHATSAPP = { url: 'https://web.whatsapp.com/', bannerTitleNamesConversation: true };
  const old = DEAD_BANNER_MS;
  const shim = (over: Partial<ActivityEntry> = {}) =>
    entry({ serviceId: 'discord', conversation: '#release', at: 0, ...over });

  it('a banner with nothing left to open its chat is dead once an hour old', () => {
    expect(isDeadBanner(shim(), DISCORD, true, old - 1)).toBe(false);
    expect(isDeadBanner(shim(), DISCORD, true, old)).toBe(true);
  });

  it("the page's own click handle counts only while that page is alive", () => {
    expect(isDeadBanner(shim({ clickId: 3 }), DISCORD, true, old)).toBe(false);
    expect(isDeadBanner(shim({ clickId: 3 }), DISCORD, false, old)).toBe(true);
  });

  it('a learned or synthetic URL inside the chat surface keeps it alive', () => {
    const learned = shim({ landedUrl: 'https://discord.com/channels/1/2' });
    expect(isDeadBanner(learned, DISCORD, false, old)).toBe(false);
    const synth = entry({ synthetic: true, href: '/messages/t/1/', at: 0 });
    expect(isDeadBanner(synth, MESSENGER, false, old)).toBe(false);
  });

  it('a URL that fails validation is no lane', () => {
    const offChat = entry({ synthetic: true, href: '/marketplace/', at: 0 });
    expect(isDeadBanner(offChat, MESSENGER, false, old)).toBe(true);
    // a shim banner's own href is page-controlled and never a lane
    expect(isDeadBanner(shim({ href: '/channels/1/2' }), DISCORD, false, old)).toBe(true);
  });

  it('a service whose banner title names the chat always has the name lane', () => {
    const wa = entry({ serviceId: 'whatsapp', at: 0 });
    expect(isDeadBanner(wa, WHATSAPP, false, old * 10)).toBe(false);
  });
});
