/** Hide WebAuthn from service pages. Electron ships no platform authenticator,
 *  so a passkey request never settles: Microsoft's sign-in parks forever on
 *  "your device is opening a security window", and Google/Meta dead-end the
 *  same way. An absent API is honest — sites feature-detect it and offer a
 *  password instead. Runs in the unisolated preload, before any page script
 *  reads the globals. Delete this once Electron implements WebAuthn.
 *
 *  Non-passkey Credential Management (`{ password: true }` autofill) is left
 *  alone: it works, and breaking it would cost logins rather than save them. */
export function installWebAuthnBlock(win: Window & typeof globalThis): void {
  for (const key of [
    'PublicKeyCredential',
    'AuthenticatorAssertionResponse',
    'AuthenticatorAttestationResponse',
  ]) {
    // biome-ignore lint/suspicious/noExplicitAny: intentionally removing page globals
    delete (win as any)[key];
  }

  // the real signatures are unions of typed option bags; this shim only cares
  // whether `publicKey` is present, so it works one level looser than the DOM
  type LooseCredentials = Record<
    'get' | 'create',
    ((options?: { publicKey?: unknown }) => Promise<unknown>) | undefined
  >;
  const creds = win.navigator?.credentials as unknown as LooseCredentials | undefined;
  if (!creds) return;
  const refuse = (method: 'get' | 'create') => {
    const original = creds[method]?.bind(creds);
    if (!original) return;
    creds[method] = (options?: { publicKey?: unknown }) => {
      if (!options?.publicKey) return original(options);
      // what a browser without an authenticator returns, so the page's own
      // catch path runs instead of its spinner
      return Promise.reject(
        new win.DOMException('WebAuthn is not available.', 'NotSupportedError'),
      );
    };
  };
  refuse('get');
  refuse('create');
}
