import { describe, expect, it } from 'vitest';
import { chordLabel } from '../../src/renderer/src/components/chord-label';

// 2026-11-13 audit: tooltips and Home's hints spelled out ⌘⇧G, ⌘⇧S and ⌘⇧M,
// which name a dead chord the moment the user rebinds one.
describe('chordLabel', () => {
  it('names the default chord until it is rebound', () => {
    expect(chordLabel({}, 'home', true)).toBe('⇧⌘G');
    expect(chordLabel({}, 'pinSelection', false)).toBe('Ctrl+Shift+S');
  });

  it('follows a rebind', () => {
    expect(chordLabel({ home: 'CmdOrCtrl+Shift+H' }, 'home', true)).toBe('⇧⌘H');
    expect(chordLabel({ mute: 'Alt+CmdOrCtrl+M' }, 'mute', false)).toBe('Ctrl+Alt+M');
  });
});
