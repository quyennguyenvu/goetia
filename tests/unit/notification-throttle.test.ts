import { describe, expect, it } from 'vitest';
import { NotificationThrottle } from '../../src/main/lib/notification-throttle';

describe('NotificationThrottle', () => {
  it('allows the first banner and blocks a burst within the window', () => {
    const t = new NotificationThrottle(800);
    expect(t.allow('messenger', 0)).toBe(true);
    expect(t.allow('messenger', 500)).toBe(false);
    expect(t.allow('messenger', 900)).toBe(true);
  });
  it('tracks services independently', () => {
    const t = new NotificationThrottle(800);
    expect(t.allow('messenger', 0)).toBe(true);
    expect(t.allow('discord', 0)).toBe(true);
  });
});
