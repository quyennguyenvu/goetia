import { describe, expect, it } from 'vitest';
import {
  canonical,
  chordFromInput,
  isReserved,
  normalizeShortcuts,
  pairFor,
  parseChord,
  recordVerdict,
} from '../../src/main/lib/shortcut-rules';
import type { KeyInput } from '../../src/main/lib/shortcuts';
import { ACCELERATORS, resolveAccelerators } from '../../src/shared/shortcuts';

const press = (over: Partial<KeyInput>): KeyInput => ({
  type: 'keyDown',
  key: '',
  code: '',
  control: false,
  meta: false,
  shift: false,
  alt: false,
  ...over,
});
const defaults = resolveAccelerators({});

describe('parseChord / canonical', () => {
  it('spells modifiers in one order and upper-cases a letter', () => {
    expect(canonical('Shift+CmdOrCtrl+g')).toBe('CmdOrCtrl+Shift+G');
    expect(canonical('Alt+CmdOrCtrl+I')).toBe('CmdOrCtrl+Alt+I');
    expect(canonical('CommandOrControl+K')).toBe('CmdOrCtrl+K');
    expect(canonical('F5')).toBe('F5');
    expect(parseChord('CmdOrCtrl+Right')).toEqual({ mods: ['CmdOrCtrl'], key: 'Right' });
  });

  it('refuses what Goetia cannot bind', () => {
    // a bare key is a valid shape (F5 is one); the ⌘/Ctrl rule is refusal's
    for (const a of [
      '',
      'CmdOrCtrl',
      'CmdOrCtrl+Escape',
      'Super+G',
      'CmdOrCtrl+CmdOrCtrl+G',
      'CmdOrCtrl+ß',
    ]) {
      expect(canonical(a), a).toBeNull();
    }
  });
});

describe('chordFromInput', () => {
  it('reads the physical key: letters, digits, brackets, period, arrows, F-keys', () => {
    expect(chordFromInput(press({ code: 'KeyE', meta: true, shift: true }), 'darwin')).toBe(
      'CmdOrCtrl+Shift+E',
    );
    expect(chordFromInput(press({ code: 'Digit3', meta: true }), 'darwin')).toBe('CmdOrCtrl+3');
    // a shifted } on a US layout is still the ] key
    expect(
      chordFromInput(press({ key: '}', code: 'BracketRight', meta: true, shift: true }), 'darwin'),
    ).toBe('CmdOrCtrl+Shift+]');
    expect(chordFromInput(press({ code: 'Period', meta: true }), 'darwin')).toBe('CmdOrCtrl+.');
    expect(chordFromInput(press({ code: 'ArrowRight', meta: true }), 'darwin')).toBe(
      'CmdOrCtrl+Right',
    );
    expect(chordFromInput(press({ code: 'PageDown', meta: true, alt: true }), 'darwin')).toBe(
      'CmdOrCtrl+Alt+PageDown',
    );
    expect(chordFromInput(press({ code: 'F7', meta: true }), 'darwin')).toBe('CmdOrCtrl+F7');
    expect(chordFromInput(press({ code: 'Space', control: true, meta: true }), 'darwin')).toBe(
      'CmdOrCtrl+Ctrl+Space',
    );
  });

  it('maps Ctrl to CmdOrCtrl off macOS and drops the Windows key', () => {
    expect(chordFromInput(press({ code: 'KeyE', control: true, shift: true }), 'win32')).toBe(
      'CmdOrCtrl+Shift+E',
    );
    expect(chordFromInput(press({ code: 'KeyE', meta: true }), 'win32')).toBeNull();
  });

  it('is null for a bare modifier or an unmapped key', () => {
    expect(chordFromInput(press({ code: 'ShiftLeft', shift: true }), 'darwin')).toBeNull();
    expect(chordFromInput(press({ code: 'MetaLeft', meta: true }), 'darwin')).toBeNull();
    expect(chordFromInput(press({ code: 'Backquote', meta: true }), 'darwin')).toBeNull();
  });
});

describe('isReserved', () => {
  it('covers the OS and edit chords, the fixed rows and the service numbers', () => {
    for (const a of [
      'CmdOrCtrl+Q',
      'CmdOrCtrl+W',
      'CmdOrCtrl+C',
      'CmdOrCtrl+V',
      'CmdOrCtrl+A',
      'CmdOrCtrl+Shift+Z',
      'CmdOrCtrl+Shift+T',
      'CmdOrCtrl+,',
      'CmdOrCtrl+R',
      'F5',
      'CmdOrCtrl+=',
      'CmdOrCtrl+-',
      'CmdOrCtrl+0',
      'CmdOrCtrl+F',
      'Alt+CmdOrCtrl+I',
      'Ctrl+Shift+I',
      'CmdOrCtrl+1',
      'CmdOrCtrl+9',
    ]) {
      expect(isReserved(a), a).toBe(true);
    }
    for (const a of ['CmdOrCtrl+Shift+E', 'CmdOrCtrl+K', 'CmdOrCtrl+Right', 'CmdOrCtrl+Tab']) {
      expect(isReserved(a), a).toBe(false);
    }
  });
});

describe('pairFor', () => {
  it('mirrors every pair from either side', () => {
    expect(pairFor('CmdOrCtrl+Shift+]')).toEqual({
      next: 'CmdOrCtrl+Shift+]',
      prev: 'CmdOrCtrl+Shift+[',
    });
    expect(pairFor('CmdOrCtrl+Shift+[')).toEqual({
      next: 'CmdOrCtrl+Shift+]',
      prev: 'CmdOrCtrl+Shift+[',
    });
    expect(pairFor('CmdOrCtrl+.')).toEqual({ next: 'CmdOrCtrl+.', prev: 'CmdOrCtrl+,' });
    expect(pairFor('CmdOrCtrl+-')).toEqual({ next: 'CmdOrCtrl+=', prev: 'CmdOrCtrl+-' });
    expect(pairFor('CmdOrCtrl+Left')).toEqual({ next: 'CmdOrCtrl+Right', prev: 'CmdOrCtrl+Left' });
    expect(pairFor('CmdOrCtrl+Alt+Down')).toEqual({
      next: 'CmdOrCtrl+Alt+Down',
      prev: 'CmdOrCtrl+Alt+Up',
    });
    expect(pairFor('CmdOrCtrl+PageUp')).toEqual({
      next: 'CmdOrCtrl+PageDown',
      prev: 'CmdOrCtrl+PageUp',
    });
  });

  it('pairs Tab with Shift toggled', () => {
    expect(pairFor('CmdOrCtrl+Tab')).toEqual({
      next: 'CmdOrCtrl+Tab',
      prev: 'CmdOrCtrl+Shift+Tab',
    });
    expect(pairFor('CmdOrCtrl+Shift+Tab')).toEqual({
      next: 'CmdOrCtrl+Tab',
      prev: 'CmdOrCtrl+Shift+Tab',
    });
  });

  it('is null for a key with no opposite', () => {
    expect(pairFor('CmdOrCtrl+Shift+G')).toBeNull();
    expect(pairFor('nonsense')).toBeNull();
  });
});

describe('recordVerdict', () => {
  it('accepts a free chord, canonical, and an unchanged one with an empty patch', () => {
    expect(recordVerdict('home', 'Shift+CmdOrCtrl+e', defaults)).toEqual({
      ok: true,
      patch: { home: 'CmdOrCtrl+Shift+E' },
    });
    expect(recordVerdict('home', 'CmdOrCtrl+Shift+G', defaults)).toEqual({ ok: true, patch: {} });
  });

  it('refuses a chord without ⌘/Ctrl, a reserved one, and one another command holds', () => {
    expect(recordVerdict('home', 'Shift+E', defaults)).toEqual({
      ok: false,
      reason: 'modifier',
      chord: 'Shift+E',
    });
    expect(recordVerdict('home', 'CmdOrCtrl+C', defaults)).toEqual({
      ok: false,
      reason: 'reserved',
      chord: 'CmdOrCtrl+C',
    });
    expect(recordVerdict('home', 'CmdOrCtrl+1', defaults)).toEqual({
      ok: false,
      reason: 'reserved',
      chord: 'CmdOrCtrl+1',
    });
    expect(recordVerdict('pinSelection', 'CmdOrCtrl+K', defaults)).toEqual({
      ok: false,
      reason: 'taken',
      chord: 'CmdOrCtrl+K',
      takenBy: 'switcher',
    });
  });

  it('records the unread pair from either arrow and validates both halves', () => {
    expect(recordVerdict('nextUnread', 'CmdOrCtrl+Right', defaults)).toEqual({
      ok: true,
      patch: { nextUnread: 'CmdOrCtrl+Right', prevUnread: 'CmdOrCtrl+Left' },
    });
    expect(recordVerdict('prevUnread', 'CmdOrCtrl+Left', defaults)).toEqual({
      ok: true,
      patch: { nextUnread: 'CmdOrCtrl+Right', prevUnread: 'CmdOrCtrl+Left' },
    });
    // = is zoom in: refused through its own half
    expect(recordVerdict('nextUnread', 'CmdOrCtrl+=', defaults)).toEqual({
      ok: false,
      reason: 'reserved',
      chord: 'CmdOrCtrl+=',
    });
    // . pairs with , which is Settings
    expect(recordVerdict('nextUnread', 'CmdOrCtrl+.', defaults)).toEqual({
      ok: false,
      reason: 'reserved',
      chord: 'CmdOrCtrl+,',
    });
    expect(recordVerdict('nextUnread', 'CmdOrCtrl+Shift+G', defaults)).toEqual({
      ok: false,
      reason: 'pair',
      chord: 'CmdOrCtrl+Shift+G',
    });
    expect(recordVerdict('nextUnread', 'Shift+]', defaults)).toEqual({
      ok: false,
      reason: 'modifier',
      chord: 'Shift+]',
    });
    expect(recordVerdict('nextUnread', 'CmdOrCtrl+Shift+]', defaults)).toEqual({
      ok: true,
      patch: {},
    });
  });

  it("never reports the pair's own halves as taken", () => {
    const moved = resolveAccelerators({
      nextUnread: 'CmdOrCtrl+Right',
      prevUnread: 'CmdOrCtrl+Left',
    });
    expect(recordVerdict('nextUnread', 'CmdOrCtrl+Shift+]', moved)).toEqual({
      ok: true,
      patch: { nextUnread: 'CmdOrCtrl+Shift+]', prevUnread: 'CmdOrCtrl+Shift+[' },
    });
  });
});

describe('normalizeShortcuts', () => {
  it('keeps valid canonical overrides and drops everything else', () => {
    expect(
      normalizeShortcuts({
        home: 'Shift+CmdOrCtrl+e',
        switcher: 'CmdOrCtrl+C', // reserved
        mute: 'Shift+M', // no ⌘
        lock: 42,
        downloads: 'CmdOrCtrl+Shift+E', // same chord as home: later loses
        bogus: 'CmdOrCtrl+Shift+B',
      }),
    ).toEqual({ home: 'CmdOrCtrl+Shift+E' });
    expect(normalizeShortcuts(undefined)).toEqual({});
    expect(normalizeShortcuts('CmdOrCtrl+K')).toEqual({});
    expect(normalizeShortcuts([])).toEqual({});
  });

  it("drops an override that lands on another command's default", () => {
    expect(normalizeShortcuts({ home: 'CmdOrCtrl+K' })).toEqual({});
    expect(normalizeShortcuts({ home: 'CmdOrCtrl+K', switcher: 'CmdOrCtrl+Shift+E' })).toEqual({
      home: 'CmdOrCtrl+K',
      switcher: 'CmdOrCtrl+Shift+E',
    });
  });

  it('keeps the unread pair only whole and only mirrored', () => {
    expect(normalizeShortcuts({ nextUnread: 'CmdOrCtrl+Right' })).toEqual({});
    expect(
      normalizeShortcuts({ nextUnread: 'CmdOrCtrl+Right', prevUnread: 'CmdOrCtrl+Up' }),
    ).toEqual({});
    expect(
      normalizeShortcuts({ nextUnread: 'CmdOrCtrl+Right', prevUnread: 'CmdOrCtrl+Left' }),
    ).toEqual({ nextUnread: 'CmdOrCtrl+Right', prevUnread: 'CmdOrCtrl+Left' });
  });
});

describe('resolveAccelerators', () => {
  it('lays overrides over the defaults and ignores unknown ids and blanks', () => {
    const r = resolveAccelerators({ home: 'CmdOrCtrl+Shift+E', switcher: '' });
    expect(r.home).toBe('CmdOrCtrl+Shift+E');
    expect(r.switcher).toBe(ACCELERATORS.switcher);
    expect(r.reload).toEqual(ACCELERATORS.reload);
    expect(resolveAccelerators(undefined)).toEqual({ ...ACCELERATORS });
  });
});
