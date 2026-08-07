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
