import { describe, expect, it } from 'vitest';
import { ipcSenderAllowed } from '../../src/main/lib/ipc-sender-policy';

describe('ipcSenderAllowed', () => {
  it('allows a shell-only channel from the shell frame', () => {
    expect(
      ipcSenderAllowed({
        channel: 'settings:update',
        fromShell: true,
        senderServiceId: null,
        payloadServiceId: undefined,
      }),
    ).toBe(true);
  });
  it('rejects a shell-only channel from a service frame', () => {
    expect(
      ipcSenderAllowed({
        channel: 'settings:update',
        fromShell: false,
        senderServiceId: 'messenger',
        payloadServiceId: undefined,
      }),
    ).toBe(false);
  });
  it('allows the tile menu from the shell frame', () => {
    expect(
      ipcSenderAllowed({
        channel: 'service:tileMenu',
        fromShell: true,
        senderServiceId: null,
        payloadServiceId: 'telegram',
      }),
    ).toBe(true);
  });
  it('rejects the tile menu from a service frame', () => {
    expect(
      ipcSenderAllowed({
        channel: 'service:tileMenu',
        fromShell: false,
        senderServiceId: 'telegram',
        payloadServiceId: 'telegram',
      }),
    ).toBe(false);
  });
  it('allows a login purge from the shell frame', () => {
    expect(
      ipcSenderAllowed({
        channel: 'service:purgeLogin',
        fromShell: true,
        senderServiceId: null,
        payloadServiceId: 'telegram',
      }),
    ).toBe(true);
  });
  it('rejects a login purge from a service frame — even for its own id', () => {
    expect(
      ipcSenderAllowed({
        channel: 'service:purgeLogin',
        fromShell: false,
        senderServiceId: 'telegram',
        payloadServiceId: 'telegram',
      }),
    ).toBe(false);
  });
  it('allows the purge-all sweep from the shell frame', () => {
    expect(
      ipcSenderAllowed({
        channel: 'services:purgeAll',
        fromShell: true,
        senderServiceId: null,
        payloadServiceId: undefined,
      }),
    ).toBe(true);
  });
  // the sweep carries no serviceId to validate, so shell-only is the ONLY
  // thing standing between a service page and every partition on disk
  it('rejects the purge-all sweep from a service frame', () => {
    expect(
      ipcSenderAllowed({
        channel: 'services:purgeAll',
        fromShell: false,
        senderServiceId: 'telegram',
        payloadServiceId: undefined,
      }),
    ).toBe(false);
  });
  it('allows activity channels from the shell frame', () => {
    expect(
      ipcSenderAllowed({
        channel: 'activity:open',
        fromShell: true,
        senderServiceId: null,
        payloadServiceId: undefined,
      }),
    ).toBe(true);
    expect(
      ipcSenderAllowed({
        channel: 'activity:recent',
        fromShell: true,
        senderServiceId: null,
        payloadServiceId: undefined,
      }),
    ).toBe(true);
  });
  it('rejects activity channels from a service frame', () => {
    expect(
      ipcSenderAllowed({
        channel: 'activity:open',
        fromShell: false,
        senderServiceId: 'messenger',
        payloadServiceId: undefined,
      }),
    ).toBe(false);
    expect(
      ipcSenderAllowed({
        channel: 'activity:recent',
        fromShell: false,
        senderServiceId: 'messenger',
        payloadServiceId: undefined,
      }),
    ).toBe(false);
  });
  it('allows a service channel when the sender matches the payload id', () => {
    expect(
      ipcSenderAllowed({
        channel: 'notification:fired',
        fromShell: false,
        senderServiceId: 'messenger',
        payloadServiceId: 'messenger',
      }),
    ).toBe(true);
  });
  it('rejects a service channel spoofing another service id', () => {
    expect(
      ipcSenderAllowed({
        channel: 'notification:fired',
        fromShell: false,
        senderServiceId: 'messenger',
        payloadServiceId: 'discord',
      }),
    ).toBe(false);
  });
  it('rejects a service channel from an unknown frame', () => {
    expect(
      ipcSenderAllowed({
        channel: 'unread:update',
        fromShell: false,
        senderServiceId: null,
        payloadServiceId: 'zalo',
      }),
    ).toBe(false);
  });
  it('keeps every pins:* channel shell-only', () => {
    const channels = [
      'pins:reorder',
      'pins:unpin',
      'pins:restore',
      'pins:setNote',
      'pins:open',
    ] as const;
    for (const channel of channels) {
      expect(
        ipcSenderAllowed({
          channel,
          fromShell: true,
          senderServiceId: null,
          payloadServiceId: undefined,
        }),
      ).toBe(true);
      // a service frame naming itself is still refused: only the shell pins
      expect(
        ipcSenderAllowed({
          channel,
          fromShell: false,
          senderServiceId: 'zalo',
          payloadServiceId: 'zalo',
        }),
      ).toBe(false);
    }
  });
  // chat-only link diversion: the sending frame must own the id it names, or
  // one service page could spray the OS browser on another's behalf
  it('validates service:openExternal against the sending frame', () => {
    expect(
      ipcSenderAllowed({
        channel: 'service:openExternal',
        fromShell: false,
        senderServiceId: 'messenger',
        payloadServiceId: 'messenger',
      }),
    ).toBe(true);
    expect(
      ipcSenderAllowed({
        channel: 'service:openExternal',
        fromShell: false,
        senderServiceId: 'messenger',
        payloadServiceId: 'slack',
      }),
    ).toBe(false);
  });
  it('lets a service view run its own WebAuthn ceremony, and no other', () => {
    expect(
      ipcSenderAllowed({
        channel: 'webauthn:get',
        fromShell: false,
        senderServiceId: 'teams',
        payloadServiceId: 'teams',
      }),
    ).toBe(true);
    expect(
      ipcSenderAllowed({
        channel: 'webauthn:create',
        fromShell: false,
        senderServiceId: 'teams',
        payloadServiceId: 'messenger',
      }),
    ).toBe(false);
    expect(
      ipcSenderAllowed({
        channel: 'webauthn:create',
        fromShell: true,
        senderServiceId: null,
        payloadServiceId: 'teams',
      }),
    ).toBe(false); // the shell has no page to sign for
  });
  it('keeps the passkey list and forget/restore shell-only', () => {
    for (const channel of ['passkeys:list', 'passkeys:forget', 'passkeys:restore'] as const) {
      expect(
        ipcSenderAllowed({
          channel,
          fromShell: true,
          senderServiceId: null,
          payloadServiceId: undefined,
        }),
      ).toBe(true);
      expect(
        ipcSenderAllowed({
          channel,
          fromShell: false,
          senderServiceId: 'teams',
          payloadServiceId: undefined,
        }),
      ).toBe(false);
    }
  });
});
