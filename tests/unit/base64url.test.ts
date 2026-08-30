import { describe, expect, it } from 'vitest';
import { fromBase64Url, toBase64Url } from '../../src/shared/webauthn';

describe('base64url', () => {
  it('round-trips bytes without padding', () => {
    const bytes = Uint8Array.from([0, 1, 2, 250, 251, 252, 253, 254, 255]);
    const text = toBase64Url(bytes);
    expect(text).not.toMatch(/[+/=]/);
    expect(fromBase64Url(text)).toEqual(bytes);
  });

  it('encodes the empty array as the empty string', () => {
    expect(toBase64Url(new Uint8Array())).toBe('');
    expect(fromBase64Url('')).toEqual(new Uint8Array());
  });

  it('refuses text outside the alphabet instead of throwing', () => {
    expect(fromBase64Url('ab+c')).toBeNull();
    expect(fromBase64Url('ab=')).toBeNull();
    expect(fromBase64Url('a b')).toBeNull();
  });
});
