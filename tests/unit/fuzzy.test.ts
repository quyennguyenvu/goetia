import { describe, expect, it } from 'vitest';
import { fuzzyScore } from '../../src/renderer/src/components/fuzzy';

describe('fuzzyScore', () => {
  it('matches subsequences, rewards prefix and streaks', () => {
    expect(fuzzyScore('wa', 'WhatsApp')).toBeGreaterThan(0);
    expect(fuzzyScore('wa', 'Zalo')).toBe(-1);
    expect(fuzzyScore('tele', 'Telegram')).toBeGreaterThan(fuzzyScore('tg', 'Telegram'));
    expect(fuzzyScore('', 'Discord')).toBe(0);
    expect(fuzzyScore('discord', 'Disc')).toBe(-1);
  });
});
