import { describe, expect, it } from 'vitest';
import { wakeCaption } from '../../src/shared/wake-caption';

// the one place the cover's words live; every load kind has its own line,
// and a missing kind reads as a wake so the cover never renders empty
describe('wakeCaption', () => {
  it.each([
    ['wake', 'Waking Discord…'],
    ['reload', 'Reloading Discord…'],
    ['restart', 'Restarting Discord…'],
    ['purge', 'Signing out of Discord…'],
    ['hand-back', 'Signing in to Discord…'],
  ] as const)('%s', (kind, expected) => {
    expect(wakeCaption(kind, 'Discord')).toBe(expected);
  });

  it('null falls back to the wake caption', () => {
    expect(wakeCaption(null, 'Discord')).toBe('Waking Discord…');
  });
});
