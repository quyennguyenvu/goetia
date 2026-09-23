import { describe, expect, it } from 'vitest';
import {
  actionGuarded,
  normalizeAction,
  normalizeRemoveIds,
  stripAppLock,
} from '../../src/main/lib/guard-policy';
import {
  INVOKE_CHANNELS,
  LOCKED_ALLOWED_CHANNELS,
  SHELL_ONLY_CHANNELS,
} from '../../src/shared/ipc';
import { DEFAULT_SETTINGS } from '../../src/shared/types';

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

describe('normalizeRemoveIds', () => {
  it('sorts and dedupes finite positive integers', () => {
    expect(normalizeRemoveIds([3, 1, 3], 200)).toEqual([1, 3]);
  });
  it('refuses anything a consent must not be minted for', () => {
    expect(normalizeRemoveIds([], 200)).toBeNull();
    expect(normalizeRemoveIds([1.5], 200)).toBeNull();
    expect(normalizeRemoveIds([0], 200)).toBeNull();
    expect(normalizeRemoveIds(['1'], 200)).toBeNull();
    expect(normalizeRemoveIds('1,2', 200)).toBeNull();
    expect(normalizeRemoveIds([1, 2, 3], 2)).toBeNull();
    expect(normalizeRemoveIds([Number.MAX_SAFE_INTEGER + 1], 200)).toBeNull();
  });
});

describe('normalizeAction', () => {
  it('normalises a remove, bounds a passkey id, passes the rest through', () => {
    expect(normalizeAction({ kind: 'downloads-remove', ids: [2, 2, 1] }, 200)).toEqual({
      kind: 'downloads-remove',
      ids: [1, 2],
    });
    expect(normalizeAction({ kind: 'downloads-remove', ids: [] }, 200)).toBeNull();
    expect(normalizeAction({ kind: 'passkey-forget', id: '' }, 200)).toBeNull();
    expect(normalizeAction({ kind: 'passkey-forget', id: 'x'.repeat(257) }, 200)).toBeNull();
    expect(normalizeAction({ kind: 'passkey-forget', id: 'abc' }, 200)).toEqual({
      kind: 'passkey-forget',
      id: 'abc',
    });
    expect(normalizeAction({ kind: 'purge-all' }, 200)).toEqual({ kind: 'purge-all' });
  });
});

describe('stripAppLock', () => {
  // lock:configure is the only writer of appLock; a settings:update that
  // carries it is the shell console trying to switch the lock off
  it('drops appLock and reports it, leaving every other key', () => {
    const { patch, carried } = stripAppLock({
      appLock: { ...DEFAULT_SETTINGS.appLock, enabled: false },
      theme: 'dark',
    });
    expect(carried).toBe(true);
    expect(patch).toEqual({ theme: 'dark' });
  });
  it('passes an ordinary patch through untouched', () => {
    const input = { theme: 'dark' as const };
    const { patch, carried } = stripAppLock(input);
    expect(carried).toBe(false);
    expect(patch).toBe(input);
  });
});
