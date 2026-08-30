/** The slice of CBOR (RFC 8949) an authenticator emits: unsigned and negative
 *  integers, byte and text strings, arrays, and maps in CTAP2 canonical key
 *  order (shorter encoded key first, then bytewise). Floats, tags and
 *  indefinite lengths never occur in a COSE key or a `none` attestation, so
 *  they throw rather than encode wrongly. */
export type CborValue =
  | number
  | string
  | boolean
  | null
  | Uint8Array
  | CborValue[]
  | Map<number | string, CborValue>;

export function encodeCbor(value: CborValue): Uint8Array {
  if (typeof value === 'number') {
    if (!Number.isInteger(value)) throw new RangeError('cbor: floats are not supported');
    return value >= 0 ? head(0, value) : head(1, -1 - value);
  }
  if (typeof value === 'string') {
    const bytes = new TextEncoder().encode(value);
    return concat([head(3, bytes.length), bytes]);
  }
  if (typeof value === 'boolean') return Uint8Array.of(value ? 0xf5 : 0xf4);
  if (value === null) return Uint8Array.of(0xf6);
  if (value instanceof Uint8Array) return concat([head(2, value.length), value]);
  if (Array.isArray(value)) return concat([head(4, value.length), ...value.map(encodeCbor)]);
  const entries = [...value.entries()].map(([k, v]) => ({
    key: encodeCbor(k),
    value: encodeCbor(v),
  }));
  entries.sort((a, b) => a.key.length - b.key.length || compareBytes(a.key, b.key));
  return concat([head(5, entries.length), ...entries.flatMap((e) => [e.key, e.value])]);
}

function head(major: number, n: number): Uint8Array {
  const m = major << 5;
  if (n < 24) return Uint8Array.of(m | n);
  if (n < 0x100) return Uint8Array.of(m | 24, n);
  if (n < 0x10000) return Uint8Array.of(m | 25, n >> 8, n & 0xff);
  if (n < 0x1_0000_0000) {
    return Uint8Array.of(m | 26, (n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff);
  }
  throw new RangeError('cbor: integer too large');
}

function compareBytes(a: Uint8Array, b: Uint8Array): number {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] - b[i];
  return 0;
}

export function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}
