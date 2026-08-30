import { createHash, createPublicKey, verify } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { concat } from '../../src/main/lib/cbor';
import {
  attestationObject,
  authenticatorData,
  clientDataJSON,
  FLAG_AT,
  FLAG_UP,
  FLAG_UV,
  GOETIA_AAGUID,
  generateKeyPair,
  sha256,
  signAssertion,
} from '../../src/main/lib/webauthn-crypto';

const hex = (b: Uint8Array) => Buffer.from(b).toString('hex');

/** COSE_Key EC2/P-256 as this encoder lays it out:
 *  a5 01 02 03 26 20 01 | 21 58 20 <x·32> | 22 58 20 <y·32>  (77 bytes) */
function coseToJwk(cose: Uint8Array) {
  expect(hex(cose.slice(0, 10))).toBe('a5010203262001215820');
  expect(hex(cose.slice(42, 45))).toBe('225820');
  expect(cose).toHaveLength(77);
  return {
    kty: 'EC',
    crv: 'P-256',
    x: Buffer.from(cose.slice(10, 42)).toString('base64url'),
    y: Buffer.from(cose.slice(45, 77)).toString('base64url'),
  };
}

describe('webauthn-crypto', () => {
  it('generates a P-256 key whose COSE and SPKI forms agree', () => {
    const k = generateKeyPair();
    expect(k.privateKeyPem).toMatch(/^-----BEGIN PRIVATE KEY-----/);
    const fromCose = createPublicKey({ key: coseToJwk(k.publicKeyCose), format: 'jwk' });
    const fromSpki = createPublicKey({
      key: Buffer.from(k.publicKeySpki),
      format: 'der',
      type: 'spki',
    });
    expect(fromCose.export({ format: 'jwk' })).toEqual(fromSpki.export({ format: 'jwk' }));
  });

  it('builds clientDataJSON the way a browser does', () => {
    const cd = JSON.parse(
      new TextDecoder().decode(
        clientDataJSON('webauthn.get', 'Y2g', 'https://teams.microsoft.com'),
      ),
    );
    expect(cd).toEqual({
      type: 'webauthn.get',
      challenge: 'Y2g',
      origin: 'https://teams.microsoft.com',
      crossOrigin: false,
    });
  });

  it('lays out assertion authenticator data: rpIdHash ‖ flags ‖ counter 0', () => {
    const ad = authenticatorData('microsoft.com', FLAG_UP | FLAG_UV);
    expect(ad).toHaveLength(37);
    expect(hex(ad.slice(0, 32))).toBe(createHash('sha256').update('microsoft.com').digest('hex'));
    expect(ad[32]).toBe(0x05);
    expect(hex(ad.slice(33))).toBe('00000000');
  });

  it('lays out attested credential data behind the AAGUID', () => {
    const k = generateKeyPair();
    const credentialId = Uint8Array.from({ length: 32 }, (_, i) => i);
    const ad = authenticatorData('microsoft.com', FLAG_UP | FLAG_UV | FLAG_AT, {
      credentialId,
      publicKeyCose: k.publicKeyCose,
    });
    expect(ad[32]).toBe(0x45);
    expect(GOETIA_AAGUID).toHaveLength(16);
    expect(hex(ad.slice(37, 53))).toBe(hex(GOETIA_AAGUID));
    expect(hex(ad.slice(53, 55))).toBe('0020');
    expect(hex(ad.slice(55, 87))).toBe(hex(credentialId));
    expect(hex(ad.slice(87))).toBe(hex(k.publicKeyCose));
  });

  it('wraps authData in a `none` attestation object', () => {
    const ad = authenticatorData('microsoft.com', FLAG_UP | FLAG_UV);
    const att = attestationObject(ad);
    // a3 "fmt" "none" "attStmt" {} "authData" — 28 bytes of framing, then 58 25 and the 37 bytes
    expect(hex(att.slice(0, 28))).toBe('a363666d74646e6f6e656761747453746d74a0686175746844617461');
    expect(hex(att.slice(28, 30))).toBe('5825');
    expect(hex(att.slice(30))).toBe(hex(ad));
  });

  it('signs authData ‖ sha256(clientDataJSON) with DER ECDSA that the attested key verifies', () => {
    const k = generateKeyPair();
    const ad = authenticatorData('microsoft.com', FLAG_UP | FLAG_UV);
    const cd = clientDataJSON('webauthn.get', 'Y2hhbGxlbmdl', 'https://teams.microsoft.com');
    const sig = signAssertion(k.privateKeyPem, ad, cd);
    const pub = createPublicKey({ key: coseToJwk(k.publicKeyCose), format: 'jwk' });
    expect(verify('sha256', concat([ad, sha256(cd)]), pub, sig)).toBe(true);
    expect(sig[0]).toBe(0x30); // DER SEQUENCE, not raw r‖s
    // a different challenge must not verify against this signature
    const other = clientDataJSON('webauthn.get', 'b3RoZXI', 'https://teams.microsoft.com');
    expect(verify('sha256', concat([ad, sha256(other)]), pub, sig)).toBe(false);
  });
});
