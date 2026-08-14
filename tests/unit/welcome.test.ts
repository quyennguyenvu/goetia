import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, type ServiceId, type ServiceMeta } from '../../src/shared/types';
import {
  byName,
  capBlocked,
  commitOrder,
  enabledKey,
  MAX_SUMMONED,
  matchesQuery,
  summonDelta,
  summonLabel,
  trimToCap,
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
    expect(label([], [])).toEqual({ label: 'Pick a service to begin', disabled: true });
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

  it('offers a pure reorder as its own commit', () => {
    const delta = summonDelta(order, set('messenger', 'zalo'), set('messenger', 'zalo'));
    expect(summonLabel(delta, true, true)).toEqual({ label: 'Apply new order', disabled: false });
  });

  it('lets a reorder ride a summon without renaming the button', () => {
    const delta = summonDelta(order, set('messenger'), set('messenger', 'zalo'));
    expect(summonLabel(delta, true, true)).toEqual({ label: 'Summon 1 service', disabled: false });
  });

  it('stays quiet when neither membership nor order changed', () => {
    const delta = summonDelta(order, set('messenger'), set('messenger'));
    expect(summonLabel(delta, true, false)).toEqual({ label: 'No changes', disabled: true });
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

describe('commitOrder', () => {
  it('leads with the staged sequence and pins the rest in relative order', () => {
    expect(commitOrder(order, ['zalo', 'discord'] as ServiceId[])).toEqual([
      'zalo',
      'discord',
      'instagram',
      'messenger',
      'teams',
      'shopee',
      'slack',
      'telegram',
      'tiktok',
      'whatsapp',
    ]);
  });

  it('is the full order when everything is staged', () => {
    const staged = [...order].reverse();
    expect(commitOrder(order, staged)).toEqual(staged);
  });

  it('keeps the existing order with nothing staged', () => {
    expect(commitOrder(order, [])).toEqual(order);
  });

  it('never mutates its inputs', () => {
    const input = [...order];
    commitOrder(input, ['zalo'] as ServiceId[]);
    expect(input).toEqual(order);
  });
});

describe('welcomeSections', () => {
  it('puts everything in unbound with nothing staged', () => {
    expect(welcomeSections([], named)).toEqual({
      summoned: [],
      unbound: named,
    });
  });

  it('puts everything in summoned when all are staged', () => {
    expect(welcomeSections(order, named)).toEqual({
      summoned: order,
      unbound: [],
    });
  });

  it('mirrors the staged list verbatim — content and order both', () => {
    expect(welcomeSections(['zalo', 'messenger'] as ServiceId[], named)).toEqual({
      summoned: ['zalo', 'messenger'],
      unbound: [
        'discord',
        'instagram',
        'teams',
        'shopee',
        'slack',
        'telegram',
        'tiktok',
        'whatsapp',
      ],
    });
  });

  // a tile clicked out of Summoned must land back in its name slot, so the
  // pool keeps name order whatever sequence things were staged in
  it('lists unbound in name order regardless of staging history', () => {
    const catalog = ['telegram', 'tiktok', 'whatsapp', 'zalo'] as ServiceId[];
    expect(welcomeSections(['zalo'] as ServiceId[], catalog).unbound).toEqual([
      'telegram',
      'tiktok',
      'whatsapp',
    ]);
  });
});

describe('enabledKey', () => {
  // DEFAULT_SETTINGS.disabled is all-true (fresh installs ship every service
  // disabled), so the baseline here has to be built, not borrowed
  const none = Object.fromEntries(DEFAULT_SETTINGS.order.map((id) => [id, false])) as Record<
    ServiceId,
    boolean
  >;
  const svcs = [meta('messenger', 'Messenger'), meta('discord', 'Discord'), meta('slack', 'Slack')];

  it('is stable across a reorder of the same enabled set', () => {
    // the two arrays differ only in order — a drag must not reseed the screen
    const reordered = [svcs[2], svcs[0], svcs[1]];
    expect(enabledKey(svcs, none)).toBe(enabledKey(reordered, none));
  });

  it('changes when a service is dispelled', () => {
    const after = { ...none, discord: true };
    expect(enabledKey(svcs, after)).not.toBe(enabledKey(svcs, none));
  });

  it('changes when a service is summoned', () => {
    const before = { ...none, slack: true };
    expect(enabledKey(svcs, before)).not.toBe(enabledKey(svcs, none));
  });

  it('is empty for an all-disabled catalog', () => {
    const all = { ...none, messenger: true, discord: true, slack: true };
    expect(enabledKey(svcs, all)).toBe('');
  });
});

describe('capBlocked', () => {
  const nine = order.slice(0, 9);

  it('blocks an unpicked tile once the staged set is full', () => {
    expect(capBlocked(set(...nine), order[9])).toBe(true);
  });

  it('never blocks a tile that is already picked', () => {
    expect(capBlocked(set(...nine), nine[0])).toBe(false);
  });

  it('blocks nothing below the cap', () => {
    expect(capBlocked(set(...nine.slice(0, 8)), order[9])).toBe(false);
  });
});

describe('trimToCap', () => {
  const flags = (enabled: ServiceId[]) =>
    Object.fromEntries(order.map((id) => [id, !enabled.includes(id)])) as Record<
      ServiceId,
      boolean
    >;

  it('disables everything past the ninth enabled position, in rail order', () => {
    const { disabled, trimmed } = trimToCap(order, flags([...order]));
    expect(trimmed).toEqual([order[9]]);
    expect(disabled[order[9]]).toBe(true);
    expect(order.slice(0, 9).every((id) => !disabled[id])).toBe(true);
  });

  it('returns a legal set untouched, same reference', () => {
    const input = flags(order.slice(0, 9));
    const { disabled, trimmed } = trimToCap(order, input);
    expect(trimmed).toEqual([]);
    expect(disabled).toBe(input);
  });

  it('never mutates its input', () => {
    const input = flags([...order]);
    const copy = { ...input };
    trimToCap(order, input);
    expect(input).toEqual(copy);
  });
});

describe('MAX_SUMMONED', () => {
  it('is nine', () => {
    expect(MAX_SUMMONED).toBe(9);
  });
});
