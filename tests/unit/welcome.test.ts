import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, type ServiceId } from '../../src/shared/types';
import { summonDelta, summonLabel } from '../../src/shared/welcome';

const order = DEFAULT_SETTINGS.order;
const set = (...ids: ServiceId[]) => new Set<ServiceId>(ids);
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
