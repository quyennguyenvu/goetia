import { describe, expect, it } from 'vitest';
import { channelAllowedWhileLocked } from '../../src/main/lib/ipc-sender-policy';
import {
  INVOKE_CHANNELS,
  LOCKED_ALLOWED_CHANNELS,
  SHELL_ONLY_CHANNELS,
} from '../../src/shared/ipc';

describe('lock channel classification', () => {
  // the project invariant: a channel is shell-only or carries a serviceId,
  // and there is no third option
  it('registers both lock channels as invokable', () => {
    expect(INVOKE_CHANNELS).toContain('lock:unlock');
    expect(INVOKE_CHANNELS).toContain('lock:configure');
  });

  it('restricts both to the shell frame', () => {
    expect(SHELL_ONLY_CHANNELS.has('lock:unlock')).toBe(true);
    expect(SHELL_ONLY_CHANNELS.has('lock:configure')).toBe(true);
  });
});

describe('channelAllowedWhileLocked', () => {
  it('serves the two lock channels — the app must stay unlockable', () => {
    expect(channelAllowedWhileLocked('lock:unlock')).toBe(true);
    expect(channelAllowedWhileLocked('lock:configure')).toBe(true);
  });

  it('serves the taskbar overlay, which carries a count and no content', () => {
    expect(channelAllowedWhileLocked('badge:overlay')).toBe(true);
  });

  // the leaks a lock on opening a service would not have closed
  it('refuses every channel that serves conversation content', () => {
    for (const channel of [
      'recents:list',
      'recents:open',
      'pins:open',
      'pins:reorder',
      'pins:unpin',
      'pins:restore',
      'pins:setNote',
    ] as const) {
      expect(channelAllowedWhileLocked(channel)).toBe(false);
    }
  });

  // a locked app lists, removes, restores and opens nothing
  it('refuses every download history channel', () => {
    for (const channel of [
      'downloads:recent',
      'downloads:remove',
      'downloads:clear',
      'downloads:restore',
      'downloads:openDir',
    ] as const) {
      expect(channelAllowedWhileLocked(channel)).toBe(false);
    }
  });

  it('refuses every channel that would put a service on screen or change it', () => {
    for (const channel of [
      'service:activate',
      'service:reload',
      'service:tileMenu',
      'global:muteMenu',
      'settings:export',
      'settings:import',
      'downloads:recent',
      'downloads:reveal',
      'downloads:cancel',
      'shortcuts:record',
      'service:purgeLogin',
      'service:reorder',
      'settings:update',
      'settings:setOpen',
      'home:setOpen',
      'switcher:setOpen',
      'services:purgeAll',
      'passkeys:list',
      'passkeys:forget',
    ] as const) {
      expect(channelAllowedWhileLocked(channel)).toBe(false);
    }
  });

  // recipes keep counting behind the lock screen, and refusing service:ready
  // would strand a wake cover forever
  it('leaves service-preload channels alone', () => {
    for (const channel of [
      'unread:update',
      'unread:stale',
      'notification:fired',
      'service:ready',
      'service:trusted-click',
      'service:openExternal',
      'webauthn:get',
    ] as const) {
      expect(channelAllowedWhileLocked(channel)).toBe(true);
    }
  });

  // the allowance is only meaningful for channels that were gated to begin
  // with; a stray entry here would be a silent no-op
  it('allows only shell-only channels, so every entry is load-bearing', () => {
    for (const channel of LOCKED_ALLOWED_CHANNELS) {
      expect(SHELL_ONLY_CHANNELS.has(channel)).toBe(true);
    }
  });

  it('refuses every shell-only channel it does not name', () => {
    for (const channel of SHELL_ONLY_CHANNELS) {
      expect(channelAllowedWhileLocked(channel)).toBe(LOCKED_ALLOWED_CHANNELS.has(channel));
    }
  });
});
