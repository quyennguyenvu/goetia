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
  it('allows sign-out from the shell frame', () => {
    expect(
      ipcSenderAllowed({
        channel: 'service:signOut',
        fromShell: true,
        senderServiceId: null,
        payloadServiceId: 'telegram',
      }),
    ).toBe(true);
  });
  it('rejects sign-out from a service frame — even for its own id', () => {
    expect(
      ipcSenderAllowed({
        channel: 'service:signOut',
        fromShell: false,
        senderServiceId: 'telegram',
        payloadServiceId: 'telegram',
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
});
