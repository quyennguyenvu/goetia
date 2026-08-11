import { describe, expect, it } from 'vitest';
import { moveTo } from '../../src/renderer/src/components/reorder';
import type { ServiceId } from '../../src/shared/types';

const base = ['discord', 'instagram', 'messenger', 'shopee'] as ServiceId[];

describe('moveTo', () => {
  // `to` is resolved before the removal, so a forward move lands one slot short
  // of the target's old index. This is the rail's shipped behavior, pinned here
  // so the extraction cannot quietly change it.
  it('drops a forward move one slot short of the target', () => {
    expect(moveTo(base, 'discord', 'messenger')).toEqual([
      'instagram',
      'messenger',
      'discord',
      'shopee',
    ]);
  });

  it('drops a backward move onto the target slot', () => {
    expect(moveTo(base, 'shopee', 'instagram')).toEqual([
      'discord',
      'shopee',
      'instagram',
      'messenger',
    ]);
  });

  it('swaps adjacent ids', () => {
    expect(moveTo(base, 'discord', 'instagram')).toEqual([
      'instagram',
      'discord',
      'messenger',
      'shopee',
    ]);
  });

  it('is a no-op onto itself', () => {
    expect(moveTo(base, 'instagram', 'instagram')).toEqual(base);
  });

  it('is a no-op for an id that is not in the list', () => {
    expect(moveTo(base, 'discord', 'zalo')).toEqual(base);
  });

  it('never mutates its input', () => {
    const input = [...base];
    moveTo(input, 'discord', 'shopee');
    expect(input).toEqual(base);
  });
});
