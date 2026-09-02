import { PASSKEY_TEXT_MAX } from '../../shared/passkeys';
import {
  fromBase64Url,
  type WebAuthnErrorName,
  type WireCreateOptions,
  type WireDescriptor,
  type WireGetOptions,
} from '../../shared/webauthn';
import { clampText } from './pin-rules';

/** Hard cap on one ceremony, whatever `timeout` the page asked for: a
 *  dangling prompt must never hold a pending invoke forever. */
export const WEBAUTHN_TIMEOUT_MS = 120_000;
export const ES256 = -7;

/** A ceremony failure the page should see by name — `code` is the
 *  DOMException name the shim rebuilds. */
export class WebAuthnError extends Error {
  constructor(
    readonly code: WebAuthnErrorName,
    message: string,
  ) {
    super(message);
    this.name = 'WebAuthnError';
  }
}

export type UserVerification = 'required' | 'preferred' | 'discouraged';

/** The RP's userVerification, coerced to the spec's three values; anything
 *  else (absent, garbage) is the spec default 'preferred'. */
export function parseUserVerification(raw: unknown): UserVerification {
  return raw === 'required' || raw === 'discouraged' ? raw : 'preferred';
}

export interface CreationRequest {
  rpId: string;
  challenge: string;
  userHandle: string;
  userName: string;
  displayName: string;
  excludeIds: string[];
  wantsCredProps: boolean;
  uv: UserVerification;
}

export interface AssertionRequest {
  rpId: string;
  challenge: string;
  allowIds: string[];
  uv: UserVerification;
}

/** The rpId must be the origin's host or a dot-suffix of it with at least two
 *  labels. No public-suffix list: every host a view can reach is in
 *  ALLOWED_HOSTS and none sits under a multi-label public suffix (the spec's
 *  "Adding a service" rule keeps that true). */
export function rpIdAllowed(originHost: string, rpId: string): boolean {
  const host = originHost.toLowerCase();
  const rp = rpId.toLowerCase();
  if (rp === '' || rp !== rp.trim()) return false;
  if (rp === host) return true;
  if (!host.endsWith(`.${rp}`)) return false;
  const labels = rp.split('.');
  return labels.length >= 2 && labels.every((l) => l !== '');
}

/** Origin comes from the sending frame, never the payload; only https pages
 *  hold a session worth a passkey. */
export function hostOfOrigin(origin: string): string {
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    throw new WebAuthnError('SecurityError', `not an origin: ${origin}`);
  }
  if (url.protocol !== 'https:' || url.hostname === '') {
    throw new WebAuthnError('SecurityError', `not an https origin: ${origin}`);
  }
  return url.hostname.toLowerCase();
}

export function parseCreation(raw: WireCreateOptions, originHost: string): CreationRequest {
  const rpId = resolveRpId(raw?.rp?.id, originHost);
  const params = Array.isArray(raw?.pubKeyCredParams) ? raw.pubKeyCredParams : [];
  // an empty list means "any algorithm" in the spec
  if (params.length > 0 && !params.some((p) => p?.type === 'public-key' && p.alg === ES256)) {
    throw new WebAuthnError('NotSupportedError', 'only ES256 credentials are supported');
  }
  if (raw?.authenticatorSelection?.authenticatorAttachment === 'cross-platform') {
    throw new WebAuthnError('NotAllowedError', 'a roaming authenticator was requested');
  }
  const user = raw?.user;
  if (!user || typeof user.name !== 'string') {
    throw new WebAuthnError('NotAllowedError', 'user.name is required');
  }
  return {
    rpId,
    challenge: base64Field(raw.challenge, 'challenge'),
    userHandle: base64Field(user.id, 'user.id'),
    userName: clampText(user.name, PASSKEY_TEXT_MAX),
    displayName: clampText(
      typeof user.displayName === 'string' ? user.displayName : '',
      PASSKEY_TEXT_MAX,
    ),
    excludeIds: descriptorIds(raw.excludeCredentials),
    wantsCredProps: raw?.extensions?.credProps === true,
    uv: parseUserVerification(raw?.authenticatorSelection?.userVerification),
  };
}

export function parseAssertion(raw: WireGetOptions, originHost: string): AssertionRequest {
  return {
    rpId: resolveRpId(raw?.rpId, originHost),
    challenge: base64Field(raw?.challenge, 'challenge'),
    allowIds: descriptorIds(raw?.allowCredentials),
    uv: parseUserVerification(raw?.userVerification),
  };
}

function resolveRpId(claimed: unknown, originHost: string): string {
  if (claimed === undefined) return originHost.toLowerCase();
  if (typeof claimed !== 'string' || !rpIdAllowed(originHost, claimed)) {
    throw new WebAuthnError(
      'SecurityError',
      `rpId "${String(claimed)}" is not a registrable suffix of ${originHost}`,
    );
  }
  return claimed.toLowerCase();
}

/** A non-empty base64url string, returned as given. */
function base64Field(value: unknown, field: string): string {
  if (typeof value !== 'string' || value === '' || fromBase64Url(value) === null) {
    throw new WebAuthnError('NotAllowedError', `${field} is not base64url`);
  }
  return value;
}

/** Only well-formed public-key descriptors count; the rest are ignored, as a
 *  browser ignores descriptors for transports it lacks. */
function descriptorIds(list: WireDescriptor[] | undefined): string[] {
  if (!Array.isArray(list)) return [];
  return list
    .filter(
      (d) =>
        d?.type === 'public-key' &&
        typeof d.id === 'string' &&
        d.id !== '' &&
        fromBase64Url(d.id) !== null,
    )
    .map((d) => d.id);
}
