import { describe, expect, it } from 'vitest';
import { applySubsetOrder } from '../../src/renderer/src/components/reorder';
import type { ServiceId } from '../../src/shared/types';

describe('applySubsetOrder', () => {
  const full = ['discord', 'instagram', 'messenger', 'shopee', 'slack'] as ServiceId[];

  it('reorders members and pins every non-member to its index', () => {
    // instagram and slack are disabled: they hold indices 1 and 4 no matter
    // what the visible tiles do
    const subset = ['shopee', 'messenger', 'discord'] as ServiceId[];
    expect(applySubsetOrder(full, subset)).toEqual([
      'shopee',
      'instagram',
      'messenger',
      'discord',
      'slack',
    ]);
  });

  it('applies a full-length subset as the whole order', () => {
    const subset = [...full].reverse() as ServiceId[];
    expect(applySubsetOrder(full, subset)).toEqual(subset);
  });

  it('is a no-op for a single-element subset', () => {
    expect(applySubsetOrder(full, ['messenger'] as ServiceId[])).toEqual(full);
  });

  it('is a no-op for an empty subset', () => {
    expect(applySubsetOrder(full, [])).toEqual(full);
  });

  it('ignores an id the full order does not contain', () => {
    // the naive version writes 'zalo' into discord's slot and drops discord
    const subset = ['zalo', 'messenger', 'discord'] as ServiceId[];
    expect(applySubsetOrder(full, subset)).toEqual([
      'messenger',
      'instagram',
      'discord',
      'shopee',
      'slack',
    ]);
  });

  it('never mutates its inputs', () => {
    const a = [...full];
    const b = ['shopee', 'discord'] as ServiceId[];
    const bCopy = [...b];
    applySubsetOrder(a, b);
    expect(a).toEqual(full);
    expect(b).toEqual(bCopy);
  });
});
