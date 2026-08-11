import { describe, expect, it } from 'vitest';
import { resolveStartupSurface } from '../../src/main/lib/startup-surface';
import { DEFAULT_SETTINGS, type ServiceId } from '../../src/shared/types';

// messenger, telegram, zalo, whatsapp, discord, tiktok, shopee
const order = DEFAULT_SETTINGS.order;
const rec = (enabled: ServiceId[]): Record<ServiceId, boolean> =>
  Object.fromEntries(order.map((id) => [id, !enabled.includes(id)])) as Record<ServiceId, boolean>;

describe('resolveStartupSurface', () => {
  it('restores a recorded service that is still enabled', () => {
    expect(
      resolveStartupSurface({
        order,
        disabled: rec(['messenger', 'discord']),
        lastActiveId: 'discord',
        lastHomeOpen: false,
      }),
    ).toEqual({ activeId: 'discord', homeOpen: false });
  });

  it('falls to rail order when nothing was ever recorded', () => {
    // upgrade from a build without the field: today's behavior, not Home
    expect(
      resolveStartupSurface({
        order,
        disabled: rec(['whatsapp', 'zalo']),
        lastActiveId: null,
        lastHomeOpen: false,
      }),
    ).toEqual({ activeId: 'whatsapp', homeOpen: false });
  });

  it('restores Home over the recorded service', () => {
    expect(
      resolveStartupSurface({
        order,
        disabled: rec(['discord']),
        lastActiveId: 'discord',
        lastHomeOpen: true,
      }),
    ).toEqual({ activeId: 'discord', homeOpen: true });
  });

  it('opens Home when the recorded service is now disabled', () => {
    // and still resolves a service underneath, so Escape lands somewhere
    expect(
      resolveStartupSurface({
        order,
        disabled: rec(['telegram']),
        lastActiveId: 'discord',
        lastHomeOpen: false,
      }),
    ).toEqual({ activeId: 'telegram', homeOpen: true });
  });

  it('opens Home when the recorded service left the catalog', () => {
    expect(
      resolveStartupSurface({
        order,
        disabled: rec(['telegram']),
        lastActiveId: 'skype' as ServiceId,
        lastHomeOpen: false,
      }),
    ).toEqual({ activeId: 'telegram', homeOpen: true });
  });

  it('activates nothing when every service is disabled', () => {
    expect(
      resolveStartupSurface({
        order,
        disabled: rec([]),
        lastActiveId: 'discord',
        lastHomeOpen: false,
      }),
    ).toEqual({ activeId: null, homeOpen: true });
  });

  it('falls back in rail order, not catalog order', () => {
    // whatsapp precedes zalo in the default order
    expect(
      resolveStartupSurface({
        order,
        disabled: rec(['whatsapp', 'zalo']),
        lastActiveId: 'discord',
        lastHomeOpen: false,
      }).activeId,
    ).toBe('whatsapp');
  });
});
