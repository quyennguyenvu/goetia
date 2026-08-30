import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { type CborValue, concat, encodeCbor } from './cbor';

export const FLAG_UP = 0x01;
export const FLAG_UV = 0x04;
export const FLAG_AT = 0x40;

/** Goetia's authenticator identity. Fixed so the community AAGUID list can
 *  name it; zero would be legal but anonymous. */
export const GOETIA_AAGUID = Uint8Array.from([
  0x9e, 0x0c, 0x7a, 0x21, 0x5b, 0x3d, 0x4f, 0x88, 0xa1, 0x6e, 0x2c, 0x47, 0xd9, 0x0b, 0xe3, 0x55,
]);

export interface KeyPair {
  /** PKCS#8 PEM — what the store encrypts */
  privateKeyPem: string;
  /** COSE_Key (EC2, ES256, P-256) — attested in authData */
  publicKeyCose: Uint8Array;
  /** SubjectPublicKeyInfo DER — `getPublicKey()` on the credential */
  publicKeySpki: Uint8Array;
}

export function generateKeyPair(): KeyPair {
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const jwk = publicKey.export({ format: 'jwk' });
  const x = new Uint8Array(Buffer.from(jwk.x as string, 'base64url'));
  const y = new Uint8Array(Buffer.from(jwk.y as string, 'base64url'));
  const cose = new Map<number | string, CborValue>([
    [1, 2], // kty: EC2
    [3, -7], // alg: ES256
    [-1, 1], // crv: P-256
    [-2, x],
    [-3, y],
  ]);
  return {
    privateKeyPem: privateKey.export({ type: 'pkcs8', format: 'pem' }) as string,
    publicKeyCose: encodeCbor(cose),
    publicKeySpki: new Uint8Array(publicKey.export({ type: 'spki', format: 'der' })),
  };
}

export function sha256(data: Uint8Array): Uint8Array {
  return new Uint8Array(createHash('sha256').update(data).digest());
}

export function clientDataJSON(
  type: 'webauthn.create' | 'webauthn.get',
  challenge: string,
  origin: string,
): Uint8Array {
  return new TextEncoder().encode(JSON.stringify({ type, challenge, origin, crossOrigin: false }));
}

/** rpIdHash ‖ flags ‖ signCount(0) [‖ AAGUID ‖ credIdLen ‖ credId ‖ COSE key].
 *  The counter is always 0 (spec-allowed, what synced passkeys do); BE/BS
 *  stay clear because the key is device-bound. */
export function authenticatorData(
  rpId: string,
  flags: number,
  attested?: { credentialId: Uint8Array; publicKeyCose: Uint8Array },
): Uint8Array {
  const parts = [sha256(new TextEncoder().encode(rpId)), Uint8Array.of(flags), new Uint8Array(4)];
  if (attested) {
    const len = attested.credentialId.length;
    parts.push(
      GOETIA_AAGUID,
      Uint8Array.of(len >> 8, len & 0xff),
      attested.credentialId,
      attested.publicKeyCose,
    );
  }
  return concat(parts);
}

/** `none` attestation: every site accepts it and it is what synced passkeys send. */
export function attestationObject(authData: Uint8Array): Uint8Array {
  return encodeCbor(
    new Map<number | string, CborValue>([
      ['fmt', 'none'],
      ['attStmt', new Map()],
      ['authData', authData],
    ]),
  );
}

/** ECDSA-SHA256 over authData ‖ sha256(clientDataJSON), DER-encoded — the
 *  ES256 form verifiers expect and Node's default. */
export function signAssertion(
  privateKeyPem: string,
  authData: Uint8Array,
  clientData: Uint8Array,
): Uint8Array {
  return new Uint8Array(sign('sha256', concat([authData, sha256(clientData)]), privateKeyPem));
}
