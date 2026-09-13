import { describe, expect, it } from 'vitest';
import { passcodeAcceptable, redactBanner, unlockDelay } from '../../src/main/lib/lock-rules';
import {
  admittedCredentials,
  PASSCODE_MIN_LENGTH,
  UNLOCK_BACKOFF_MAX_MS,
} from '../../src/shared/lock';

describe('unlockDelay', () => {
  it('does not delay the first attempt', () => {
    expect(unlockDelay(0)).toBe(0);
    expect(unlockDelay(-1)).toBe(0);
  });

  it('doubles per consecutive failure', () => {
    expect(unlockDelay(1)).toBe(1000);
    expect(unlockDelay(2)).toBe(2000);
    expect(unlockDelay(3)).toBe(4000);
  });

  it('caps so the owner is never locked out for longer than the ceiling', () => {
    expect(unlockDelay(99)).toBe(UNLOCK_BACKOFF_MAX_MS);
  });
});

describe('passcodeAcceptable', () => {
  it('rejects anything under the floor', () => {
    expect(passcodeAcceptable('a'.repeat(PASSCODE_MIN_LENGTH - 1))).toBe(false);
    expect(passcodeAcceptable('')).toBe(false);
  });

  it('accepts the floor and above', () => {
    expect(passcodeAcceptable('a'.repeat(PASSCODE_MIN_LENGTH))).toBe(true);
    expect(passcodeAcceptable('a long passphrase with spaces')).toBe(true);
  });
});

describe('admittedCredentials', () => {
  it('offers Touch ID only when the setting and the sensor agree', () => {
    expect(admittedCredentials({ touchIdSetting: true, sensorAvailable: true }).touchId).toBe(true);
    expect(admittedCredentials({ touchIdSetting: false, sensorAvailable: true }).touchId).toBe(
      false,
    );
    expect(admittedCredentials({ touchIdSetting: true, sensorAvailable: false }).touchId).toBe(
      false,
    );
  });

  // the state that would brick the app: no configuration may admit neither door
  it('always admits the passcode', () => {
    for (const touchIdSetting of [true, false]) {
      for (const sensorAvailable of [true, false]) {
        const admitted = admittedCredentials({ touchIdSetting, sensorAvailable });
        expect(admitted.passcode).toBe(true);
        expect(admitted.touchId || admitted.passcode).toBe(true);
      }
    }
  });
});

describe('redactBanner', () => {
  it('replaces the title with the service and empties the body', () => {
    expect(redactBanner('WhatsApp')).toEqual({ title: 'WhatsApp', body: '' });
  });

  it('keeps nothing the page wrote', () => {
    const { title, body } = redactBanner('Discord');
    expect(title).not.toContain('Alice');
    expect(body).toBe('');
  });
});
