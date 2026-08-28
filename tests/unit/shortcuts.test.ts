import { describe, expect, it } from 'vitest';
import {
  ACCELERATORS,
  devtoolsAccelerator,
  type KeyInput,
  shellCommandFor,
} from '../../src/main/lib/shortcuts';

const press = (over: Partial<KeyInput>): KeyInput => ({
  type: 'keyDown',
  key: '',
  code: '',
  control: false,
  meta: false,
  shift: false,
  alt: false,
  isAutoRepeat: false,
  ...over,
});

describe('shellCommandFor', () => {
  // ⇧G, not ⇧H: a left-hand chord, because the right hand is on the mouse
  it('maps the Home chord under Cmd on darwin and Ctrl elsewhere', () => {
    const g = { key: 'G', code: 'KeyG', shift: true };
    expect(shellCommandFor(press({ ...g, meta: true }), 'darwin')).toEqual({ kind: 'home' });
    expect(shellCommandFor(press({ ...g, control: true }), 'darwin')).toBeNull();
    expect(shellCommandFor(press({ ...g, control: true }), 'win32')).toEqual({ kind: 'home' });
    expect(shellCommandFor(press({ ...g, meta: true }), 'linux')).toBeNull();
  });

  it('covers every Goetia chord the app menu declares', () => {
    const on = (key: string, mods: Partial<KeyInput>) =>
      shellCommandFor(press({ key, code: '', meta: true, ...mods }), 'darwin');
    expect(on('S', { shift: true })).toEqual({ kind: 'pin-selection' });
    expect(on('M', { shift: true })).toEqual({ kind: 'mute' });
    expect(on('k', {})).toEqual({ kind: 'switcher' });
    expect(on(',', {})).toEqual({ kind: 'settings' });
    expect(on('r', {})).toEqual({ kind: 'reload' });
    expect(on('=', {})).toEqual({ kind: 'zoom', step: 1 });
    expect(on('-', {})).toEqual({ kind: 'zoom', step: -1 });
    expect(on('0', {})).toEqual({ kind: 'zoom', step: 0 });
    expect(on('1', {})).toEqual({ kind: 'service', index: 0 });
    expect(on('9', {})).toEqual({ kind: 'service', index: 8 });
    expect(on('i', { alt: true })).toEqual({ kind: 'devtools' });
  });

  it('keeps F5 as a bare reload and takes Ctrl+Shift+I for devtools off darwin', () => {
    expect(shellCommandFor(press({ key: 'F5', code: 'F5' }), 'win32')).toEqual({ kind: 'reload' });
    expect(shellCommandFor(press({ key: 'F5', code: 'F5' }), 'darwin')).toEqual({ kind: 'reload' });
    const i = { key: 'I', code: 'KeyI', control: true };
    expect(shellCommandFor(press({ ...i, shift: true }), 'linux')).toEqual({ kind: 'devtools' });
    expect(shellCommandFor(press({ ...i, alt: true }), 'linux')).toBeNull();
  });

  it('demands the exact modifier set', () => {
    const g = { key: 'G', code: 'KeyG' };
    expect(shellCommandFor(press({ ...g, meta: true }), 'darwin')).toBeNull();
    expect(
      shellCommandFor(press({ ...g, meta: true, shift: true, alt: true }), 'darwin'),
    ).toBeNull();
    expect(shellCommandFor(press({ ...g, shift: true }), 'darwin')).toBeNull();
  });

  it('ignores key-up and everything that is not a Goetia chord', () => {
    const up = { type: 'keyUp', key: 'G', code: 'KeyG', meta: true, shift: true };
    expect(shellCommandFor(press(up), 'darwin')).toBeNull();
    expect(shellCommandFor(press({ key: 'c', code: 'KeyC', meta: true }), 'darwin')).toBeNull();
    // the chords Home and Pin used to sit on are the page's again
    expect(
      shellCommandFor(press({ key: 'H', code: 'KeyH', meta: true, shift: true }), 'darwin'),
    ).toBeNull();
    expect(
      shellCommandFor(press({ key: 'P', code: 'KeyP', meta: true, shift: true }), 'darwin'),
    ).toBeNull();
    expect(shellCommandFor(press({ key: 'a' }), 'darwin')).toBeNull();
  });

  it('falls back to the physical key when the layout rewrites the character', () => {
    const dead = { key: 'Dead', code: 'KeyG', meta: true, shift: true };
    expect(shellCommandFor(press(dead), 'darwin')).toEqual({ kind: 'home' });
    expect(shellCommandFor(press({ key: '¡', code: 'Digit1', meta: true }), 'darwin')).toEqual({
      kind: 'service',
      index: 0,
    });
  });
});

describe('accelerator table', () => {
  it('is the single source the menu labels and the Settings pane read from', () => {
    expect(ACCELERATORS.home).toBe('CmdOrCtrl+Shift+G');
    expect(ACCELERATORS.pinSelection).toBe('CmdOrCtrl+Shift+S');
    expect(ACCELERATORS.reload).toEqual(['CmdOrCtrl+R', 'F5']);
    expect(devtoolsAccelerator('darwin')).toBe('Alt+CmdOrCtrl+I');
    expect(devtoolsAccelerator('win32')).toBe('Ctrl+Shift+I');
  });
});
