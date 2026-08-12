import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, type ServiceId, type ServiceMeta } from '../../src/shared/types';
import {
  byName,
  matchesQuery,
  summonDelta,
  summonLabel,
  summonOrder,
  welcomeSections,
} from '../../src/shared/welcome';

const order = DEFAULT_SETTINGS.order;
const named = DEFAULT_SETTINGS.order;
const set = (...ids: ServiceId[]) => new Set<ServiceId>(ids);
const meta = (id: ServiceId, name: string): ServiceMeta => ({
  id,
  name,
  url: 'https://example.test/',
  color: '#000000',
});
const label = (enabled: ServiceId[], selected: ServiceId[]) =>
  summonLabel(summonDelta(order, set(...enabled), set(...selected)), enabled.length > 0);

describe('summonDelta', () => {
  it('reports additions in rail order', () => {
    expect(summonDelta(order, set('messenger'), set('messenger', 'zalo', 'telegram'))).toEqual({
      add: ['telegram', 'zalo'],
      remove: [],
    });
  });

  it('reports removals', () => {
    expect(summonDelta(order, set('messenger', 'zalo'), set('zalo'))).toEqual({
      add: [],
      remove: ['messenger'],
    });
  });

  it('reports both halves of a mixed change', () => {
    expect(summonDelta(order, set('messenger', 'zalo'), set('zalo', 'discord'))).toEqual({
      add: ['discord'],
      remove: ['messenger'],
    });
  });

  it('reports nothing when the selection matches the live set', () => {
    expect(summonDelta(order, set('messenger', 'zalo'), set('zalo', 'messenger'))).toEqual({
      add: [],
      remove: [],
    });
  });
});

describe('summonLabel', () => {
  it('invites a pick on a fresh install', () => {
    expect(label([], [])).toEqual({ label: 'Summon 0 services', disabled: true });
  });

  it('counts the first summoning', () => {
    expect(label([], ['messenger', 'zalo', 'telegram'])).toEqual({
      label: 'Summon 3 services',
      disabled: false,
    });
  });

  it('goes quiet when nothing is staged', () => {
    expect(label(['messenger', 'zalo', 'telegram'], ['messenger', 'zalo', 'telegram'])).toEqual({
      label: 'No changes',
      disabled: true,
    });
  });

  it('names additions', () => {
    expect(label(['messenger'], ['messenger', 'zalo', 'telegram'])).toEqual({
      label: 'Summon 2 services',
      disabled: false,
    });
  });

  it('names a single banishment in the singular', () => {
    expect(label(['messenger', 'zalo'], ['zalo'])).toEqual({
      label: 'Banish 1 service',
      disabled: false,
    });
  });

  it('names both halves of a mixed change', () => {
    expect(label(['messenger', 'zalo'], ['zalo', 'discord', 'telegram'])).toEqual({
      label: 'Summon 2 · Banish 1',
      disabled: false,
    });
  });
});

describe('byName', () => {
  it('sorts ids by display name, not by the order given', () => {
    expect(
      byName([meta('zalo', 'Zalo'), meta('discord', 'Discord'), meta('tiktok', 'TikTok')]),
    ).toEqual(['discord', 'tiktok', 'zalo']);
  });

  it('is empty for an empty catalog', () => {
    expect(byName([])).toEqual([]);
  });
});

describe('matchesQuery', () => {
  it('matches everything on an empty or whitespace query', () => {
    expect(matchesQuery('Telegram', '')).toBe(true);
    expect(matchesQuery('Telegram', '   ')).toBe(true);
  });

  it('matches a substring regardless of case', () => {
    expect(matchesQuery('Telegram', 'gram')).toBe(true);
    expect(matchesQuery('WhatsApp', 'APP')).toBe(true);
  });

  it('does not match a non-substring', () => {
    expect(matchesQuery('Telegram', 'zalo')).toBe(false);
  });

  // the whole reason this is not fuzzyScore: fuzzy matches both, which reads as
  // a bug in a grid you are looking at
  it('rejects a subsequence that is not a substring', () => {
    expect(matchesQuery('Telegram', 'tg')).toBe(false);
    expect(matchesQuery('Instagram', 'tg')).toBe(false);
  });
});

describe('summonOrder', () => {
  it('appends a newly summoned service to the end', () => {
    expect(summonOrder(order, set('zalo'), set('zalo', 'discord'), named)).toEqual([
      'instagram',
      'messenger',
      'shopee',
      'slack',
      'telegram',
      'tiktok',
      'whatsapp',
      'zalo',
      'discord',
    ]);
  });

  it('appends several in name order, whatever the catalog order was', () => {
    expect(
      summonOrder(order, set(), set('whatsapp', 'discord', 'messenger'), named).slice(-3),
    ).toEqual(['discord', 'messenger', 'whatsapp']);
  });

  it('leaves a banished service in its slot', () => {
    expect(summonOrder(order, set('discord', 'messenger'), set('discord'), named)).toEqual(order);
  });

  it('appends a previously banished service when it returns', () => {
    expect(summonOrder(order, set(), set('discord'), named).at(-1)).toBe('discord');
  });

  it('returns an unchanged order when nothing is added', () => {
    expect(summonOrder(order, set('zalo'), set('zalo'), named)).toEqual(order);
  });

  it('never mutates its input', () => {
    const input = [...order];
    summonOrder(input, set(), set('discord'), named);
    expect(input).toEqual(order);
  });
});

describe('welcomeSections', () => {
  it('puts everything in unbound on a fresh install', () => {
    expect(welcomeSections(order, set(), named)).toEqual({
      summoned: [],
      unbound: order,
    });
  });

  it('puts everything in summoned when all are enabled', () => {
    expect(welcomeSections(order, set(...order), named)).toEqual({
      summoned: order,
      unbound: [],
    });
  });

  it('splits a mixed set', () => {
    expect(welcomeSections(order, set('messenger', 'zalo'), named)).toEqual({
      summoned: ['messenger', 'zalo'],
      unbound: ['discord', 'instagram', 'shopee', 'slack', 'telegram', 'tiktok', 'whatsapp'],
    });
  });

  it('lists summoned in rail order, not enabled-set order', () => {
    // 'zalo' is last in order but first into the Set
    expect(welcomeSections(order, set('zalo', 'discord'), named).summoned).toEqual([
      'discord',
      'zalo',
    ]);
  });

  // the change this signature exists for: a reordered rail must not reshuffle
  // the pool of services the user has not chosen
  it('lists unbound in name order even when the rail disagrees', () => {
    const railOrder = ['zalo', 'whatsapp', 'tiktok', 'telegram'] as ServiceId[];
    const catalog = ['telegram', 'tiktok', 'whatsapp', 'zalo'] as ServiceId[];
    expect(welcomeSections(railOrder, set('zalo'), catalog).unbound).toEqual([
      'telegram',
      'tiktok',
      'whatsapp',
    ]);
  });

  it('ignores ids that are enabled but not in order', () => {
    expect(
      welcomeSections(['messenger', 'zalo'], set('messenger', 'discord'), ['messenger', 'zalo']),
    ).toEqual({
      summoned: ['messenger'],
      unbound: ['zalo'],
    });
  });
});
