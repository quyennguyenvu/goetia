/** Wire shapes between the service preload's WebAuthn shim and main's
 *  authenticator. Process-agnostic: every BufferSource travels as base64url,
 *  which is also what WebAuthn's own JSON serialization uses. */

/** DOMException names a page branches on; the shim rebuilds the exception. */
export type WebAuthnErrorName =
  | 'NotAllowedError'
  | 'NotSupportedError'
  | 'InvalidStateError'
  | 'SecurityError';

export interface WireDescriptor {
  type: string;
  id: string;
  transports?: string[];
}

export interface WireCreateOptions {
  rp: { id?: string; name?: string };
  user: { id: string; name: string; displayName: string };
  challenge: string;
  pubKeyCredParams: { type: string; alg: number }[];
  excludeCredentials?: WireDescriptor[];
  authenticatorSelection?: {
    authenticatorAttachment?: string;
    residentKey?: string;
    requireResidentKey?: boolean;
    userVerification?: string;
  };
  extensions?: { credProps?: boolean };
}

export interface WireGetOptions {
  rpId?: string;
  challenge: string;
  allowCredentials?: WireDescriptor[];
  userVerification?: string;
}

export interface WireCreateResult {
  id: string;
  clientDataJSON: string;
  attestationObject: string;
  authenticatorData: string;
  publicKeySpki: string;
  /** whether the page asked for credProps — the shim answers `{ rk: true }` */
  credProps: boolean;
}

export interface WireGetResult {
  id: string;
  clientDataJSON: string;
  authenticatorData: string;
  signature: string;
  userHandle: string;
}

export type WireResult<T> = { ok: true; value: T } | { ok: false; error: WebAuthnErrorName };

export function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Null on anything outside the unpadded base64url alphabet — the caller
 *  maps that to the WebAuthn error it needs rather than catching. */
export function fromBase64Url(text: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]*$/.test(text)) return null;
  const padded =
    text.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (text.length % 4)) % 4);
  try {
    return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}
