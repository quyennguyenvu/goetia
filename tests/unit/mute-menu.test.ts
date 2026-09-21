import { describe, expect, it } from 'vitest';
import { globalMuteMenu, MUTE_CHOICES } from '../../src/main/lib/mute-menu';

const now = new Date(2026, 8, 21, 13, 0);

describe('globalMuteMenu', () => {
  it('offers the tile menu’s three durations when nothing is silenced', () => {
    const m = globalMuteMenu({ silenced: false, until: 0, now });
    expect(m.type).toBe('submenu');
    if (m.type !== 'submenu') return;
    expect(m.label).toBe('Mute All Notifications');
    expect(m.items).toBe(MUTE_CHOICES);
    expect(m.items.map((i) => [i.kind, i.label])).toEqual([
      ['hour', 'For 1 hour'],
      ['tomorrow', 'Until tomorrow'],
      ['indefinite', 'Until I unmute'],
    ]);
  });

  it('names the expiry on a timed global mute', () => {
    const until = new Date(2026, 8, 21, 14, 30).getTime();
    expect(globalMuteMenu({ silenced: true, until, now })).toEqual({
      type: 'item',
      label: 'Unmute All Notifications (until 14:30)',
    });
  });

  it('is a plain Unmute for an indefinite mute or quiet hours alone', () => {
    // quiet hours silence with no global mute: until is 0 there too
    expect(globalMuteMenu({ silenced: true, until: 0, now })).toEqual({
      type: 'item',
      label: 'Unmute All Notifications',
    });
  });
});
