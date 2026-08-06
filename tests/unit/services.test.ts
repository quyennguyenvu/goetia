import { describe, expect, it } from 'vitest';
import { SERVICES, serviceById } from '../../src/shared/services';
import { DEFAULT_SETTINGS } from '../../src/shared/types';

describe('service catalog', () => {
  it('has exactly the five spec services, unique, https', () => {
    expect(SERVICES.map((s) => s.id)).toEqual([
      'messenger',
      'telegram',
      'zalo',
      'whatsapp',
      'discord',
    ]);
    expect(new Set(SERVICES.map((s) => s.id)).size).toBe(5);
    for (const s of SERVICES) expect(s.url).toMatch(/^https:\/\//);
  });

  it('serviceById resolves', () => {
    expect(serviceById('zalo').name).toBe('Zalo');
  });

  it('messenger targets facebook.com/messages (messenger.com hands logged-in users to facebook)', () => {
    expect(serviceById('messenger').url).toBe('https://www.facebook.com/messages/');
  });

  it('defaults: nothing hibernates, 30min timeout', () => {
    expect(Object.values(DEFAULT_SETTINGS.neverHibernate).every((v) => v === true)).toBe(true);
    expect(DEFAULT_SETTINGS.hibernationMinutes).toBe(30);
    expect(DEFAULT_SETTINGS.order).toEqual(SERVICES.map((s) => s.id));
    expect(DEFAULT_SETTINGS.railPosition).toBe('top');
  });

  it('defaults: only messenger and zalo enabled', () => {
    const enabled = SERVICES.map((s) => s.id).filter((id) => !DEFAULT_SETTINGS.disabled[id]);
    expect(enabled).toEqual(['messenger', 'zalo']);
  });
});
