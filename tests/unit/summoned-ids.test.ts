import { describe, expect, it } from 'vitest';
import { summonedIds } from '../../src/main/lib/banish-rules';
import { sameAction } from '../../src/shared/lock';
import type { ServiceId } from '../../src/shared/types';

const order: ServiceId[] = ['discord', 'slack', 'zalo'];
const set = (disabled: ServiceId[]): Record<ServiceId, boolean> =>
  Object.fromEntries(order.map((id) => [id, disabled.includes(id)])) as Record<ServiceId, boolean>;

describe('summonedIds', () => {
  it('names the services that went from banished to summoned', () => {
    expect(summonedIds(order, set(['discord', 'slack']), set(['slack']))).toEqual(['discord']);
  });

  // the daily path: a banish-only edit must never ask for a passcode
  it('is empty for a banish-only change', () => {
    expect(summonedIds(order, set([]), set(['discord', 'slack']))).toEqual([]);
  });

  it('is empty when nothing moved — a reorder-only commit', () => {
    expect(summonedIds(order, set(['zalo']), set(['zalo']))).toEqual([]);
  });

  it('names only the summoned half of a mixed edit', () => {
    expect(summonedIds(order, set(['discord']), set(['slack']))).toEqual(['discord']);
  });

  it('reports in catalog order, however the records are keyed', () => {
    expect(summonedIds(order, set(['discord', 'slack', 'zalo']), set([]))).toEqual([
      'discord',
      'slack',
      'zalo',
    ]);
  });
});

describe('sameAction', () => {
  it('matches a summon to a summon', () => {
    expect(sameAction({ kind: 'summon' }, { kind: 'summon' })).toBe(true);
  });

  it('refuses a different kind', () => {
    expect(sameAction({ kind: 'summon' }, { kind: 'purge-all' })).toBe(false);
  });

  // confirming "purge Slack" must never be spendable on Discord
  it('refuses a purge-one for another service', () => {
    expect(
      sameAction(
        { kind: 'purge-one', serviceId: 'slack' },
        { kind: 'purge-one', serviceId: 'discord' },
      ),
    ).toBe(false);
    expect(
      sameAction(
        { kind: 'purge-one', serviceId: 'slack' },
        { kind: 'purge-one', serviceId: 'slack' },
      ),
    ).toBe(true);
  });
});
