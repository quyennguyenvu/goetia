import { describe, expect, it } from 'vitest';
import { permissionAllowed } from '../../src/main/lib/permission-policy';

const svc = 'https://www.facebook.com/messages/';

describe('permissionAllowed', () => {
  it('grants notifications on the service origin', () => {
    expect(
      permissionAllowed({
        permission: 'notifications',
        requestingUrl: 'https://www.facebook.com/messages/t/1',
        serviceUrl: svc,
      }),
    ).toBe(true);
  });
  it('denies a foreign origin even for a granted permission', () => {
    expect(
      permissionAllowed({
        permission: 'media',
        requestingUrl: 'https://evil.example/x',
        serviceUrl: svc,
      }),
    ).toBe(false);
  });
  it('denies permissions outside the allowlist', () => {
    expect(
      permissionAllowed({
        permission: 'geolocation',
        requestingUrl: svc,
        serviceUrl: svc,
      }),
    ).toBe(false);
  });
  it('denies malformed requesting urls', () => {
    expect(
      permissionAllowed({
        permission: 'notifications',
        requestingUrl: '',
        serviceUrl: svc,
      }),
    ).toBe(false);
  });
});
