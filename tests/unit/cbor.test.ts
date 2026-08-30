import { describe, expect, it } from 'vitest';
import { type CborValue, encodeCbor } from '../../src/main/lib/cbor';

const hex = (bytes: Uint8Array) => Buffer.from(bytes).toString('hex');

describe('encodeCbor', () => {
  it('encodes unsigned integers across the size breaks', () => {
    expect(hex(encodeCbor(0))).toBe('00');
    expect(hex(encodeCbor(23))).toBe('17');
    expect(hex(encodeCbor(24))).toBe('1818');
    expect(hex(encodeCbor(100))).toBe('1864');
    expect(hex(encodeCbor(1000))).toBe('1903e8');
    expect(hex(encodeCbor(1_000_000))).toBe('1a000f4240');
  });

  it('encodes negative integers', () => {
    expect(hex(encodeCbor(-1))).toBe('20');
    expect(hex(encodeCbor(-10))).toBe('29');
    expect(hex(encodeCbor(-100))).toBe('3863');
    expect(hex(encodeCbor(-7))).toBe('26'); // ES256, the one COSE needs
  });

  it('encodes byte and text strings', () => {
    expect(hex(encodeCbor(Uint8Array.from([1, 2, 3, 4])))).toBe('4401020304');
    expect(hex(encodeCbor('a'))).toBe('6161');
    expect(hex(encodeCbor('IETF'))).toBe('6449455446');
    expect(hex(encodeCbor('ü'))).toBe('62c3bc');
  });

  it('encodes arrays and maps', () => {
    expect(hex(encodeCbor([1, 2, 3]))).toBe('83010203');
    expect(
      hex(
        encodeCbor(
          new Map<number | string, number>([
            [1, 2],
            [3, 4],
          ]),
        ),
      ),
    ).toBe('a201020304');
    expect(
      hex(
        encodeCbor(
          new Map<number | string, CborValue>([
            ['a', 1],
            ['b', [2, 3]],
          ]),
        ),
      ),
    ).toBe('a26161016162820203');
  });

  it('orders map keys canonically — shorter encodings first, then bytewise', () => {
    // COSE_Key labels: 1, 3, -1, -2, -3 encode as 01 03 20 21 22 whatever the insertion order
    const cose = new Map<number | string, number>([
      [-3, 0],
      [3, -7],
      [-1, 1],
      [1, 2],
      [-2, 0],
    ]);
    expect(hex(encodeCbor(cose))).toBe('a501020326200121002200');
    // attestation keys: "fmt" (3) < "attStmt" (7) < "authData" (8)
    const att = new Map<number | string, CborValue>([
      ['authData', 0],
      ['fmt', 'none'],
      ['attStmt', new Map()],
    ]);
    expect(hex(encodeCbor(att))).toBe('a363666d74646e6f6e656761747453746d74a068617574684461746100');
  });

  it('rejects what an authenticator never emits', () => {
    expect(() => encodeCbor(1.5 as never)).toThrow(RangeError);
    expect(() => encodeCbor((2 ** 32) as never)).toThrow(RangeError);
  });
});
