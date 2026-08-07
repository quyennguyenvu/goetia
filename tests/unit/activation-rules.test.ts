import { describe, expect, it } from 'vitest';
import { resolveActivation } from '../../src/main/lib/activation-rules';
import { DEFAULT_SETTINGS, type ServiceId } from '../../src/shared/types';

// messenger, telegram, zalo, whatsapp, discord, tiktok, shopee
const order = DEFAULT_SETTINGS.order;
const rec = (enabled: ServiceId[]): Record<ServiceId, boolean> =>
  Object.fromEntries(order.map((id) => [id, !enabled.includes(id)])) as Record<ServiceId, boolean>;

describe('resolveActivation', () => {
  it('activates nothing when every service is disabled', () => {
    expect(
      resolveActivation({
        order,
        disabled: rec([]),
        activeId: 'messenger',
        hasActiveView: false,
      }),
    ).toBeNull();
  });

  it('keeps an enabled active service that already has a view', () => {
    expect(
      resolveActivation({
        order,
        disabled: rec(['messenger', 'zalo']),
        activeId: 'messenger',
        hasActiveView: true,
      }),
    ).toBeNull();
  });

  it('activates an enabled active service that has no view yet', () => {
    // welcome confirm where the stale activeId is among the selection
    expect(
      resolveActivation({
        order,
        disabled: rec(['messenger']),
        activeId: 'messenger',
        hasActiveView: false,
      }),
    ).toBe('messenger');
  });

  it('falls to the first enabled service in rail order', () => {
    // zalo precedes whatsapp in the default order
    expect(
      resolveActivation({
        order,
        disabled: rec(['whatsapp', 'zalo']),
        activeId: 'messenger',
        hasActiveView: false,
      }),
    ).toBe('zalo');
  });
});
