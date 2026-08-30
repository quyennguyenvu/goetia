import {
  fromBase64Url,
  toBase64Url,
  type WireCreateOptions,
  type WireCreateResult,
  type WireDescriptor,
  type WireGetOptions,
  type WireGetResult,
  type WireResult,
} from '../../shared/webauthn';

export interface WebAuthnBridge {
  create(options: WireCreateOptions): Promise<WireResult<WireCreateResult>>;
  get(options: WireGetOptions): Promise<WireResult<WireGetResult>>;
}

type Win = Window & typeof globalThis;
type AnyRecord = Record<string, unknown>;
// the real signatures are unions of typed option bags; this shim only cares
// about `publicKey`, `mediation` and `signal`, so it works one level looser
type LooseOptions = { publicKey?: AnyRecord; mediation?: string; signal?: AbortSignal };
type LooseCredentials = Record<
  'get' | 'create',
  ((options?: LooseOptions) => Promise<unknown>) | undefined
>;
type Proto = { prototype: object };

/** Goetia's passkeys, page side. Enabled: `publicKey` requests go to main's
 *  authenticator and come back as PublicKeyCredential-shaped objects whose
 *  prototype is the page's own class, so `instanceof` holds. Disabled (no OS
 *  keyring, or GOETIA_WEBAUTHN=off): the API is hidden, as an authenticator-
 *  less browser would, so sites offer a password instead of spinning.
 *  Non-passkey Credential Management (`{ password: true }`) is untouched. */
export function installWebAuthnShim(
  win: Win,
  opts: { enabled: boolean; bridge: WebAuthnBridge },
): void {
  if (!opts.enabled) {
    hide(win);
    return;
  }
  const w = win as unknown as AnyRecord;
  const Native = (w.PublicKeyCredential ?? class PublicKeyCredential {}) as Proto & AnyRecord;
  w.PublicKeyCredential = Native;
  Object.assign(Native, {
    isUserVerifyingPlatformAuthenticatorAvailable: () => Promise.resolve(true),
    isConditionalMediationAvailable: () => Promise.resolve(false),
    getClientCapabilities: () =>
      Promise.resolve({
        conditionalCreate: false,
        conditionalGet: false,
        hybridTransport: false,
        passkeyPlatformAuthenticator: true,
        userVerifyingPlatformAuthenticator: true,
        relatedOrigins: false,
        signalAllAcceptedCredentials: false,
        signalCurrentUserDetails: false,
        signalUnknownCredential: false,
      }),
    parseCreationOptionsFromJSON: (json: AnyRecord) =>
      fromJson(json, ['challenge', 'user.id'], ['excludeCredentials']),
    parseRequestOptionsFromJSON: (json: AnyRecord) =>
      fromJson(json, ['challenge'], ['allowCredentials']),
  });
  const creds = win.navigator?.credentials as unknown as LooseCredentials | undefined;
  if (!creds) return;

  const domError = (name: string, message: string) => new win.DOMException(message, name);

  /** Settles with the ceremony, or rejects AbortError on the page's signal; a
   *  conditional request has no ceremony and waits for the abort alone — a
   *  browser with no matching autofill passkey does the same. */
  const withSignal = <T>(
    signal: AbortSignal | undefined,
    work: (() => Promise<T>) | null,
  ): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      const abort = () => reject(domError('AbortError', 'The operation was aborted.'));
      if (signal?.aborted) return abort();
      signal?.addEventListener('abort', abort, { once: true });
      work?.().then(resolve, reject);
    });

  const unwrap = <T>(result: WireResult<T>): T => {
    if (result.ok) return result.value;
    throw domError(result.error, `WebAuthn request failed: ${result.error}`);
  };

  const originalCreate = creds.create?.bind(creds);
  const originalGet = creds.get?.bind(creds);

  if (originalCreate) {
    creds.create = (options) => {
      const pk = options?.publicKey;
      if (!pk) return originalCreate(options);
      return withSignal(options?.signal, async () => {
        const value = unwrap(await opts.bridge.create(serializeCreate(pk)));
        return attestation(win, Native, value);
      });
    };
  }
  if (originalGet) {
    creds.get = (options) => {
      const pk = options?.publicKey;
      if (!pk) return originalGet(options);
      if (options?.mediation === 'conditional') return withSignal(options.signal, null);
      return withSignal(options?.signal, async () => {
        const value = unwrap(await opts.bridge.get(serializeGet(pk)));
        return assertion(win, Native, value);
      });
    };
  }
}

/** The pre-2026-08-30 block, kept for the disabled path. */
function hide(win: Win): void {
  for (const key of [
    'PublicKeyCredential',
    'AuthenticatorAssertionResponse',
    'AuthenticatorAttestationResponse',
  ]) {
    delete (win as unknown as AnyRecord)[key];
  }
  const creds = win.navigator?.credentials as unknown as LooseCredentials | undefined;
  if (!creds) return;
  for (const method of ['get', 'create'] as const) {
    const original = creds[method]?.bind(creds);
    if (!original) continue;
    creds[method] = (options) => {
      if (!options?.publicKey) return original(options);
      return Promise.reject(
        new win.DOMException('WebAuthn is not available.', 'NotSupportedError'),
      );
    };
  }
}

// --- page → wire -----------------------------------------------------------

function b64(source: unknown): string {
  if (source instanceof ArrayBuffer) return toBase64Url(new Uint8Array(source));
  if (ArrayBuffer.isView(source)) {
    return toBase64Url(new Uint8Array(source.buffer, source.byteOffset, source.byteLength));
  }
  return ''; // main rejects an empty field as NotAllowedError
}

function descriptors(list: unknown): WireDescriptor[] | undefined {
  if (!Array.isArray(list)) return undefined;
  return list.map((d: AnyRecord) => ({
    type: String(d?.type),
    id: b64(d?.id),
    ...(Array.isArray(d?.transports) ? { transports: d.transports.map(String) } : {}),
  }));
}

function serializeCreate(pk: AnyRecord): WireCreateOptions {
  const rp = (pk.rp ?? {}) as AnyRecord;
  const user = (pk.user ?? {}) as AnyRecord;
  return {
    rp: { id: rp.id as string | undefined, name: rp.name as string | undefined },
    user: { id: b64(user.id), name: user.name as string, displayName: user.displayName as string },
    challenge: b64(pk.challenge),
    pubKeyCredParams: Array.isArray(pk.pubKeyCredParams)
      ? (pk.pubKeyCredParams as WireCreateOptions['pubKeyCredParams'])
      : [],
    excludeCredentials: descriptors(pk.excludeCredentials),
    authenticatorSelection:
      pk.authenticatorSelection as WireCreateOptions['authenticatorSelection'],
    extensions: { credProps: (pk.extensions as AnyRecord | undefined)?.credProps === true },
  };
}

function serializeGet(pk: AnyRecord): WireGetOptions {
  return {
    rpId: pk.rpId as string | undefined,
    challenge: b64(pk.challenge),
    allowCredentials: descriptors(pk.allowCredentials),
    userVerification: pk.userVerification as string | undefined,
  };
}

/** parse*OptionsFromJSON: base64url fields back to ArrayBuffers, on a copy.
 *  `paths` are dotted scalar fields; `lists` hold descriptors. */
function fromJson(json: AnyRecord, paths: string[], lists: string[]): AnyRecord {
  const out = structuredClone(json);
  for (const path of paths) {
    const [head, tail] = path.split('.');
    const holder = tail ? (out[head] as AnyRecord | undefined) : out;
    const key = tail ?? head;
    if (holder && typeof holder[key] === 'string') holder[key] = buffer(holder[key] as string);
  }
  for (const list of lists) {
    const arr = out[list];
    if (Array.isArray(arr)) {
      out[list] = arr.map((d: AnyRecord) =>
        typeof d?.id === 'string' ? { ...d, id: buffer(d.id) } : d,
      );
    }
  }
  return out;
}

// --- wire → page -----------------------------------------------------------

function buffer(text: string): ArrayBuffer {
  const bytes = fromBase64Url(text) ?? new Uint8Array();
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function credential(
  Native: Proto,
  value: { id: string },
  response: object,
  extensions: AnyRecord,
  responseJson: AnyRecord,
): object {
  const cred = {
    id: value.id,
    rawId: buffer(value.id),
    type: 'public-key',
    authenticatorAttachment: 'platform',
    response,
    getClientExtensionResults: () => extensions,
    toJSON: () => ({
      id: value.id,
      rawId: value.id,
      type: 'public-key',
      authenticatorAttachment: 'platform',
      clientExtensionResults: extensions,
      response: responseJson,
    }),
  };
  Object.setPrototypeOf(cred, Native.prototype);
  return cred;
}

function attestation(win: Win, Native: Proto, v: WireCreateResult): object {
  const response = {
    clientDataJSON: buffer(v.clientDataJSON),
    attestationObject: buffer(v.attestationObject),
    getAuthenticatorData: () => buffer(v.authenticatorData),
    getPublicKey: () => buffer(v.publicKeySpki),
    getPublicKeyAlgorithm: () => -7,
    getTransports: () => ['internal'],
  };
  const proto = (win as unknown as AnyRecord).AuthenticatorAttestationResponse as Proto | undefined;
  if (proto) Object.setPrototypeOf(response, proto.prototype);
  return credential(Native, v, response, v.credProps ? { credProps: { rk: true } } : {}, {
    clientDataJSON: v.clientDataJSON,
    attestationObject: v.attestationObject,
    authenticatorData: v.authenticatorData,
    publicKey: v.publicKeySpki,
    publicKeyAlgorithm: -7,
    transports: ['internal'],
  });
}

function assertion(win: Win, Native: Proto, v: WireGetResult): object {
  const response = {
    clientDataJSON: buffer(v.clientDataJSON),
    authenticatorData: buffer(v.authenticatorData),
    signature: buffer(v.signature),
    userHandle: v.userHandle ? buffer(v.userHandle) : null,
  };
  const proto = (win as unknown as AnyRecord).AuthenticatorAssertionResponse as Proto | undefined;
  if (proto) Object.setPrototypeOf(response, proto.prototype);
  return credential(
    Native,
    v,
    response,
    {},
    {
      clientDataJSON: v.clientDataJSON,
      authenticatorData: v.authenticatorData,
      signature: v.signature,
      userHandle: v.userHandle || null,
    },
  );
}
