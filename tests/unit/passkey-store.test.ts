import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type KeyCodec, PasskeyStore } from '../../src/main/passkeys/store';
import { PASSKEY_CAP } from '../../src/shared/passkeys';

/** reversible and visibly not plaintext, so a leak shows in the file */
const codec: KeyCodec = {
  encrypt: (plain) => `enc:${Buffer.from(plain).toString('base64')}`,
  decrypt: (cipher) => {
    if (!cipher.startsWith('enc:')) throw new Error('bad ciphertext');
    return Buffer.from(cipher.slice(4), 'base64').toString();
  },
};

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'goetia-passkeys-'));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const input = (over: Record<string, unknown> = {}) => ({
  rpId: 'microsoft.com',
  userHandle: 'dXNlci0x',
  userName: 'quyen@example.com',
  displayName: 'Quyen',
  privateKeyPem: '-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----\n',
  publicKeyCose: Uint8Array.from([1, 2, 3]),
  createdIn: 'teams' as const,
  at: 100,
  ...over,
});

describe('PasskeyStore', () => {
  it('adds a discoverable credential with a fresh 32-byte id and encrypts the key at rest', () => {
    const store = new PasskeyStore(dir, codec);
    const p = store.add(input());
    expect(p.id).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(p.createdAt).toBe(100);
    expect(p.lastUsedAt).toBe(100);
    const onDisk = readFileSync(join(dir, 'passkeys.json'), 'utf8');
    expect(onDisk).not.toContain('BEGIN PRIVATE KEY');
    expect(onDisk).toContain('enc:');
    expect(store.privateKeyPem(p.id)).toBe(input().privateKeyPem);
  });

  it('looks up by rpId and by rpId + userHandle', () => {
    const store = new PasskeyStore(dir, codec);
    const a = store.add(input());
    const b = store.add(input({ rpId: 'google.com' }));
    expect(store.forRp('microsoft.com').map((p) => p.id)).toEqual([a.id]);
    expect(store.find('google.com', 'dXNlci0x')?.id).toBe(b.id);
    expect(store.find('google.com', 'other')).toBeUndefined();
    expect(store.forRp('facebook.com')).toEqual([]);
  });

  it('replaces the credential for the same rpId + userHandle instead of duplicating', () => {
    const store = new PasskeyStore(dir, codec);
    const first = store.add(input());
    const second = store.add(input({ displayName: 'Quyen 2', at: 200 }));
    expect(store.all()).toHaveLength(1);
    expect(store.get(first.id)).toBeUndefined();
    expect(store.get(second.id)?.displayName).toBe('Quyen 2');
  });

  it('is full at the cap, except for a replacement', () => {
    const store = new PasskeyStore(dir, codec);
    for (let i = 0; i < PASSKEY_CAP; i++) store.add(input({ userHandle: `u${i}` }));
    expect(store.isFull()).toBe(true);
    store.add(input({ userHandle: 'u0', displayName: 'again' }));
    expect(store.all()).toHaveLength(PASSKEY_CAP);
  });

  it('forgets with one-step restore, at the old position', () => {
    const store = new PasskeyStore(dir, codec);
    const a = store.add(input({ userHandle: 'a' }));
    const b = store.add(input({ userHandle: 'b' }));
    const c = store.add(input({ userHandle: 'c' }));
    expect(store.forget(b.id)).toBe(true);
    expect(store.all().map((p) => p.id)).toEqual([a.id, c.id]);
    expect(store.forget(b.id)).toBe(false);
    expect(store.restore(b.id)).toBe(true);
    expect(store.all().map((p) => p.id)).toEqual([a.id, b.id, c.id]);
    expect(store.restore(b.id)).toBe(false); // only the most recent removal
  });

  it('stamps lastUsedAt and reloads from disk', () => {
    const store = new PasskeyStore(dir, codec);
    const p = store.add(input());
    store.touch(p.id, 500);
    const again = new PasskeyStore(dir, codec);
    expect(again.get(p.id)?.lastUsedAt).toBe(500);
    expect(again.privateKeyPem(p.id)).toBe(input().privateKeyPem);
  });

  it('returns null, not a throw, when the key cannot be decrypted', () => {
    const store = new PasskeyStore(dir, codec);
    const p = store.add(input());
    const broken = new PasskeyStore(dir, {
      encrypt: codec.encrypt,
      decrypt: () => {
        throw new Error('keychain denied');
      },
    });
    expect(broken.privateKeyPem(p.id)).toBeNull();
    expect(store.privateKeyPem('missing')).toBeNull();
  });

  it('starts empty from a corrupt file', () => {
    writeFileSync(join(dir, 'passkeys.json'), '{not json');
    expect(new PasskeyStore(dir, codec).all()).toEqual([]);
  });

  it('views carry no key material', () => {
    const store = new PasskeyStore(dir, codec);
    store.add(input());
    const [v] = store.views();
    expect(v.account).toBe('Quyen');
    expect(Object.keys(v).sort()).toEqual([
      'account',
      'createdAt',
      'createdIn',
      'id',
      'lastUsedAt',
      'rpId',
    ]);
  });
});
