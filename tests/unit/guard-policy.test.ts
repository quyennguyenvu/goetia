import { describe, expect, it } from 'vitest';
import { actionGuarded } from '../../src/main/lib/guard-policy';
import {
  INVOKE_CHANNELS,
  LOCKED_ALLOWED_CHANNELS,
  SHELL_ONLY_CHANNELS,
} from '../../src/shared/ipc';

describe('actionGuarded', () => {
  it('guards only when the setting is on and a passcode exists', () => {
    expect(actionGuarded({ guardActions: true, configured: true })).toBe(true);
  });

  // no credential to ask for: the guard is absent, and the UI says so rather
  // than degrading into something weaker
  it('is off when the lock was never configured', () => {
    expect(actionGuarded({ guardActions: true, configured: false })).toBe(false);
  });

  it('is off when the user turned it off', () => {
    expect(actionGuarded({ guardActions: false, configured: true })).toBe(false);
    expect(actionGuarded({ guardActions: false, configured: false })).toBe(false);
  });
});

describe('lock:confirm classification', () => {
  it('is a shell-only invoke channel', () => {
    expect(INVOKE_CHANNELS).toContain('lock:confirm');
    expect(SHELL_ONLY_CHANNELS.has('lock:confirm')).toBe(true);
  });

  // it authorizes an action, and a locked app must perform none — so unlike
  // lock:unlock it stays refused behind the lock screen
  it('is NOT served while the app is locked', () => {
    expect(LOCKED_ALLOWED_CHANNELS.has('lock:confirm')).toBe(false);
  });
});
