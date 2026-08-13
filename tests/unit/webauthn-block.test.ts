// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { installWebAuthnBlock } from '../../src/preload/lib/webauthn-block';

/** happy-dom ships neither the interfaces nor navigator.credentials, so the
 *  page's versions are staged here — this is what a real Chromium exposes. */
function pageWindow() {
  const credentials = {
    get: vi.fn(async (_options?: { publicKey?: unknown }) => 'credential'),
    create: vi.fn(async (_options?: { publicKey?: unknown }) => 'credential'),
  };
  const win = {
    PublicKeyCredential: class {},
    AuthenticatorAssertionResponse: class {},
    AuthenticatorAttestationResponse: class {},
    DOMException,
    navigator: { credentials },
  };
  return { win: win as unknown as Window & typeof globalThis, credentials };
}

describe('webauthn block', () => {
  it('removes the interfaces a page feature-detects', () => {
    const { win } = pageWindow();
    installWebAuthnBlock(win);
    expect('PublicKeyCredential' in win).toBe(false);
    expect('AuthenticatorAssertionResponse' in win).toBe(false);
    expect('AuthenticatorAttestationResponse' in win).toBe(false);
  });

  it('rejects a passkey request the way an authenticator-less browser does', async () => {
    const { win, credentials } = pageWindow();
    installWebAuthnBlock(win);
    await expect(credentials.get({ publicKey: {} })).rejects.toMatchObject({
      name: 'NotSupportedError',
    });
    await expect(credentials.create({ publicKey: {} })).rejects.toMatchObject({
      name: 'NotSupportedError',
    });
  });

  it('leaves password autofill working — it is not WebAuthn', async () => {
    const { win, credentials } = pageWindow();
    const original = credentials.get;
    installWebAuthnBlock(win);
    await expect(credentials.get({})).resolves.toBe('credential');
    expect(original).toHaveBeenCalledWith({});
  });

  it('survives a page with no credentials API at all', () => {
    const win = { PublicKeyCredential: class {}, navigator: {} } as unknown as Window &
      typeof globalThis;
    expect(() => installWebAuthnBlock(win)).not.toThrow();
    expect('PublicKeyCredential' in win).toBe(false);
  });
});
