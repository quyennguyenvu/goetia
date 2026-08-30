// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { installWebAuthnShim, type WebAuthnBridge } from '../../src/preload/lib/webauthn-shim';
import { toBase64Url } from '../../src/shared/webauthn';

/** happy-dom ships neither the interfaces nor navigator.credentials, so the
 *  page's versions are staged here — this is what a real Chromium exposes. */
function pageWindow() {
  const credentials = {
    get: vi.fn(async (_options?: unknown) => 'native-credential'),
    create: vi.fn(async (_options?: unknown) => 'native-credential'),
  };
  // biome-ignore lint/complexity/noStaticOnlyClass: stands in for the page's native class
  class PublicKeyCredential {
    static isUserVerifyingPlatformAuthenticatorAvailable = async () => false;
    static isConditionalMediationAvailable = async () => true;
  }
  const win = {
    PublicKeyCredential,
    AuthenticatorAssertionResponse: class {},
    AuthenticatorAttestationResponse: class {},
    DOMException,
    navigator: { credentials },
  };
  return { win: win as unknown as Window & typeof globalThis, credentials, PublicKeyCredential };
}

const bytes = (s: string) => new TextEncoder().encode(s);
const createResult = {
  id: 'Y3JlZA',
  clientDataJSON: toBase64Url(bytes('{"type":"webauthn.create"}')),
  attestationObject: toBase64Url(bytes('att')),
  authenticatorData: toBase64Url(bytes('auth')),
  publicKeySpki: toBase64Url(bytes('spki')),
  credProps: true,
};
const getResult = {
  id: 'Y3JlZA',
  clientDataJSON: toBase64Url(bytes('{"type":"webauthn.get"}')),
  authenticatorData: toBase64Url(bytes('auth')),
  signature: toBase64Url(bytes('sig')),
  userHandle: 'dXNlcg',
};

type Bridge = WebAuthnBridge & { create: ReturnType<typeof vi.fn>; get: ReturnType<typeof vi.fn> };
function bridge(over: Partial<WebAuthnBridge> = {}): Bridge {
  return {
    create: vi.fn(async () => ({ ok: true as const, value: createResult })),
    get: vi.fn(async () => ({ ok: true as const, value: getResult })),
    ...over,
  } as never;
}

const publicKeyCreate = () => ({
  publicKey: {
    rp: { id: 'microsoft.com', name: 'Microsoft' },
    user: { id: bytes('user-1'), name: 'quyen@example.com', displayName: 'Quyen' },
    challenge: bytes('challenge'),
    pubKeyCredParams: [{ type: 'public-key', alg: -7 }],
    excludeCredentials: [
      { type: 'public-key', id: new Uint8Array(bytes('abc').buffer), transports: ['internal'] },
    ],
    extensions: { credProps: true },
  },
});

const decode = (b: unknown) => new TextDecoder().decode(b as ArrayBuffer);

describe('webauthn shim, enabled', () => {
  it('serializes a create request and rebuilds a PublicKeyCredential the page recognises', async () => {
    const { win, credentials, PublicKeyCredential } = pageWindow();
    const b = bridge();
    installWebAuthnShim(win, { enabled: true, bridge: b });
    const cred = (await credentials.create(publicKeyCreate())) as unknown as Record<
      string,
      unknown
    >;
    expect(b.create).toHaveBeenCalledWith({
      rp: { id: 'microsoft.com', name: 'Microsoft' },
      user: { id: toBase64Url(bytes('user-1')), name: 'quyen@example.com', displayName: 'Quyen' },
      challenge: toBase64Url(bytes('challenge')),
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }],
      excludeCredentials: [
        { type: 'public-key', id: toBase64Url(bytes('abc')), transports: ['internal'] },
      ],
      authenticatorSelection: undefined,
      extensions: { credProps: true },
    });
    expect(cred).toBeInstanceOf(PublicKeyCredential);
    expect(cred.id).toBe('Y3JlZA');
    expect(new Uint8Array(cred.rawId as ArrayBuffer)).toEqual(
      Uint8Array.from([0x63, 0x72, 0x65, 0x64]), // "cred"
    );
    expect(cred.type).toBe('public-key');
    expect(cred.authenticatorAttachment).toBe('platform');
    const response = cred.response as Record<string, unknown>;
    expect(response).toBeInstanceOf(win.AuthenticatorAttestationResponse);
    expect(decode(response.clientDataJSON)).toBe('{"type":"webauthn.create"}');
    expect(decode(response.attestationObject)).toBe('att');
    expect(decode((response.getAuthenticatorData as () => unknown)())).toBe('auth');
    expect(decode((response.getPublicKey as () => unknown)())).toBe('spki');
    expect((response.getPublicKeyAlgorithm as () => number)()).toBe(-7);
    expect((response.getTransports as () => string[])()).toEqual(['internal']);
    expect((cred.getClientExtensionResults as () => unknown)()).toEqual({
      credProps: { rk: true },
    });
    expect((cred.toJSON as () => Record<string, unknown>)()).toMatchObject({
      id: 'Y3JlZA',
      rawId: 'Y3JlZA',
      type: 'public-key',
      authenticatorAttachment: 'platform',
      response: {
        clientDataJSON: createResult.clientDataJSON,
        attestationObject: createResult.attestationObject,
        transports: ['internal'],
      },
    });
  });

  it('rebuilds an assertion', async () => {
    const { win, credentials } = pageWindow();
    installWebAuthnShim(win, { enabled: true, bridge: bridge() });
    const cred = (await credentials.get({
      publicKey: {
        rpId: 'microsoft.com',
        challenge: bytes('get'),
        allowCredentials: [{ type: 'public-key', id: bytes('cred') }],
      },
    })) as unknown as Record<string, unknown>;
    const response = cred.response as Record<string, ArrayBuffer | null>;
    expect(response).toBeInstanceOf(win.AuthenticatorAssertionResponse);
    expect(decode(response.signature)).toBe('sig');
    expect(decode(response.userHandle)).toBe('user');
    expect((cred.getClientExtensionResults as () => unknown)()).toEqual({});
  });

  it('raises the DOMException main names', async () => {
    const { win, credentials } = pageWindow();
    installWebAuthnShim(win, {
      enabled: true,
      bridge: bridge({
        get: vi.fn(async () => ({ ok: false as const, error: 'InvalidStateError' as const })),
      }),
    });
    await expect(credentials.get({ publicKey: { challenge: bytes('x') } })).rejects.toMatchObject({
      name: 'InvalidStateError',
    });
  });

  it('advertises a platform authenticator and no conditional mediation', async () => {
    const { win, PublicKeyCredential } = pageWindow();
    installWebAuthnShim(win, { enabled: true, bridge: bridge() });
    await expect(PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()).resolves.toBe(
      true,
    );
    await expect(PublicKeyCredential.isConditionalMediationAvailable()).resolves.toBe(false);
    const P = PublicKeyCredential as unknown as {
      getClientCapabilities(): Promise<Record<string, boolean>>;
    };
    const caps = await P.getClientCapabilities();
    expect(caps.userVerifyingPlatformAuthenticator).toBe(true);
    expect(caps.conditionalGet).toBe(false);
    expect(caps.hybridTransport).toBe(false);
  });

  it('parses JSON options back into BufferSources', () => {
    const { win, PublicKeyCredential } = pageWindow();
    installWebAuthnShim(win, { enabled: true, bridge: bridge() });
    const P = PublicKeyCredential as unknown as {
      parseRequestOptionsFromJSON(j: unknown): {
        challenge: ArrayBuffer;
        allowCredentials: { id: ArrayBuffer }[];
      };
    };
    const parsed = P.parseRequestOptionsFromJSON({
      challenge: toBase64Url(bytes('c')),
      allowCredentials: [{ type: 'public-key', id: toBase64Url(bytes('i')) }],
    });
    expect(decode(parsed.challenge)).toBe('c');
    expect(decode(parsed.allowCredentials[0].id)).toBe('i');
  });

  it('leaves non-WebAuthn credential requests to the page', async () => {
    const { win, credentials } = pageWindow();
    const originalGet = credentials.get;
    const b = bridge();
    installWebAuthnShim(win, { enabled: true, bridge: b });
    await expect(credentials.get({ password: true })).resolves.toBe('native-credential');
    expect(originalGet).toHaveBeenCalledWith({ password: true });
    expect(b.get).not.toHaveBeenCalled();
  });

  it('keeps a conditional-mediation request pending until its signal aborts', async () => {
    const { win, credentials } = pageWindow();
    const b = bridge();
    installWebAuthnShim(win, { enabled: true, bridge: b });
    const ctl = new AbortController();
    const pending = credentials.get({
      publicKey: { challenge: bytes('x') },
      mediation: 'conditional',
      signal: ctl.signal,
    });
    await new Promise((r) => setTimeout(r, 10));
    expect(b.get).not.toHaveBeenCalled();
    ctl.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('rejects with AbortError when the page aborts mid-ceremony', async () => {
    const { win, credentials } = pageWindow();
    installWebAuthnShim(win, {
      enabled: true,
      bridge: bridge({ get: vi.fn(() => new Promise<never>(() => {})) }),
    });
    const ctl = new AbortController();
    const pending = credentials.get({ publicKey: { challenge: bytes('x') }, signal: ctl.signal });
    ctl.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('survives a page with no credentials API at all', () => {
    const win = {
      PublicKeyCredential: class {},
      DOMException,
      navigator: {},
    } as unknown as Window & typeof globalThis;
    expect(() => installWebAuthnShim(win, { enabled: true, bridge: bridge() })).not.toThrow();
  });
});

describe('webauthn shim, disabled', () => {
  it('behaves like the old block: no interfaces, NotSupportedError, password autofill intact', async () => {
    const { win, credentials } = pageWindow();
    const b = bridge();
    installWebAuthnShim(win, { enabled: false, bridge: b });
    expect('PublicKeyCredential' in win).toBe(false);
    expect('AuthenticatorAssertionResponse' in win).toBe(false);
    await expect(credentials.get({ publicKey: {} })).rejects.toMatchObject({
      name: 'NotSupportedError',
    });
    await expect(credentials.create({ publicKey: {} })).rejects.toMatchObject({
      name: 'NotSupportedError',
    });
    await expect(credentials.get({ password: true })).resolves.toBe('native-credential');
    expect(b.get).not.toHaveBeenCalled();
  });
});
