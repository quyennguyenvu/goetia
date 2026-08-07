import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, type ServiceId } from '../../src/shared/types';
import { buildDisabledPatch } from '../../src/shared/welcome';

describe('buildDisabledPatch', () => {
  const order = DEFAULT_SETTINGS.order;

  it('enables exactly the selected ids', () => {
    const patch = buildDisabledPatch(order, new Set<ServiceId>(['zalo']));
    expect(patch.zalo).toBe(false);
    expect(patch.messenger).toBe(true);
    expect(patch.shopee).toBe(true);
  });

  it('covers every service id even with nothing selected', () => {
    const patch = buildDisabledPatch(order, new Set());
    expect(Object.keys(patch).sort()).toEqual([...order].sort());
    expect(Object.values(patch).every((v) => v === true)).toBe(true);
  });
});
