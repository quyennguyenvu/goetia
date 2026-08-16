import { describe, expect, it } from 'vitest';
import { comboLabel, SUMMON_COMBOS } from '../../src/shared/summon';

describe('SUMMON_COMBOS', () => {
  it('has no duplicates', () => {
    expect(new Set(SUMMON_COMBOS).size).toBe(SUMMON_COMBOS.length);
  });
});

describe('comboLabel', () => {
  it('renders macOS glyphs in ⌃⌥⇧⌘ order', () => {
    expect(comboLabel('Alt+CmdOrCtrl+G', true)).toBe('⌥⌘G');
    expect(comboLabel('Ctrl+Shift+Space', true)).toBe('⌃⇧Space');
  });

  it('renders Windows names in Ctrl+Alt+Shift order', () => {
    expect(comboLabel('Alt+CmdOrCtrl+G', false)).toBe('Ctrl+Alt+G');
    expect(comboLabel('Ctrl+Shift+Space', false)).toBe('Ctrl+Shift+Space');
  });

  it('labels every curated combo on both platforms', () => {
    for (const combo of SUMMON_COMBOS) {
      expect(comboLabel(combo, true)).toBeTruthy();
      expect(comboLabel(combo, false)).toMatch(/\+/);
    }
  });
});
