import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { KeyCodec } from '../../src/main/codec';
import { LockStore } from '../../src/main/lock';

let dir: string;
afterEach(() => rmSync(dir, { recursive: true, force: true }));

/** Reversible stand-in for safeStorage, so the store never imports electron. */
const codec: KeyCodec = {
  encrypt: (plain) => Buffer.from(plain, 'utf8').toString('base64'),
  decrypt: (cipher) => Buffer.from(cipher, 'base64').toString('utf8'),
};

/** A codec whose decrypt always throws — a denied keychain, or a profile
 *  copied to another machine. */
const denied: KeyCodec = {
  encrypt: codec.encrypt,
  decrypt: () => {
    throw new Error('keychain denied');
  },
};

const fresh = () => {
  dir = mkdtempSync(join(tmpdir(), 'goetia-lock-'));
  return new LockStore(dir, codec);
};

describe('LockStore', () => {
  it('starts with no credential', () => {
    const store = fresh();
    expect(store.has()).toBe(false);
    expect(store.readable()).toBe(true);
  });

  it('verifies the passcode it was given', async () => {
    const store = fresh();
    await store.set('correct horse');
    expect(store.has()).toBe(true);
    expect(await store.verify('correct horse')).toBe(true);
  });

  it('rejects a wrong passcode', async () => {
    const store = fresh();
    await store.set('correct horse');
    expect(await store.verify('correct hors')).toBe(false);
    expect(await store.verify('')).toBe(false);
    expect(await store.verify('CORRECT HORSE')).toBe(false);
  });

  it('survives a restart', async () => {
    const store = fresh();
    await store.set('correct horse');
    const reread = new LockStore(dir, codec);
    expect(reread.has()).toBe(true);
    expect(await reread.verify('correct horse')).toBe(true);
  });

  // the file is readable by anything running as this user; the passcode must
  // not be recoverable from it, because people reuse passcodes
  it('writes no recoverable form of the passcode', async () => {
    const store = fresh();
    await store.set('correct horse');
    const raw = readFileSync(join(dir, 'lock.json'), 'utf8');
    expect(raw).not.toContain('correct horse');
    expect(raw).not.toContain(Buffer.from('correct horse', 'utf8').toString('base64'));
  });

  it('salts, so two installs with the same passcode store different hashes', async () => {
    const first = fresh();
    await first.set('correct horse');
    const rawFirst = readFileSync(join(dir, 'lock.json'), 'utf8');
    const dirFirst = dir;
    const second = fresh();
    await second.set('correct horse');
    expect(readFileSync(join(dir, 'lock.json'), 'utf8')).not.toBe(rawFirst);
    rmSync(dirFirst, { recursive: true, force: true });
  });

  it('clears on request', async () => {
    const store = fresh();
    await store.set('correct horse');
    store.clear();
    expect(store.has()).toBe(false);
    expect(await store.verify('correct horse')).toBe(false);
    expect(new LockStore(dir, codec).has()).toBe(false);
  });

  // failing closed: an undecryptable credential must not read as "no lock",
  // which would silently open the app
  it('reports a credential it cannot decrypt rather than reporting none', async () => {
    const store = fresh();
    await store.set('correct horse');
    const stuck = new LockStore(dir, denied);
    expect(stuck.has()).toBe(true);
    expect(stuck.readable()).toBe(false);
    expect(await stuck.verify('correct horse')).toBe(false);
  });
});
