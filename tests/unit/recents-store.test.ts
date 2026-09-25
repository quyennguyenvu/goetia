import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { KeyCodec } from '../../src/main/codec';
import type { RecentEntry } from '../../src/main/lib/recents-rules';
import { RecentsStore } from '../../src/main/recents';

/** Reversible stand-in for safeStorage, so the store never imports electron. */
const codec: KeyCodec = {
  encrypt: (plain) => Buffer.from(plain, 'utf8').toString('base64'),
  decrypt: (cipher) => Buffer.from(cipher, 'base64').toString('utf8'),
};

/** A denied keychain, or a profile copied to another machine. */
const denied: KeyCodec = {
  encrypt: codec.encrypt,
  decrypt: () => {
    throw new Error('keychain denied');
  },
};

const sighting = (label: string, at: number, serviceId: RecentEntry['serviceId'] = 'whatsapp') => ({
  serviceId,
  label,
  conversation: label,
  url: 'https://web.whatsapp.com/',
  at,
});

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'goetia-recents-'));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const file = () => readFileSync(join(dir, 'recents.json'), 'utf8');

describe('RecentsStore', () => {
  it('starts empty on a fresh profile and writes nothing until asked', () => {
    const store = new RecentsStore(dir, codec);
    expect(store.rows()).toEqual([]);
    expect(store.storage()).toBe('sealed');
    expect(() => file()).toThrow();
  });

  it('seals with a codec: the file names no chat in clear, and a fresh store reads it back', () => {
    const store = new RecentsStore(dir, codec);
    expect(store.upsert(sighting('Minh Anh', 1))).toBe(true);
    store.upsert(sighting('Nhóm Sale', 2));
    const raw = file();
    expect(raw).toContain('"sealed"');
    expect(raw).not.toContain('Minh Anh');
    const again = new RecentsStore(dir, codec);
    expect(again.rows().map((r) => r.label)).toEqual(['Nhóm Sale', 'Minh Anh']);
    expect(again.get(again.rows()[1].id)?.conversation).toBe('Minh Anh');
  });

  it('continues ids after a reload, so a row never inherits another row id', () => {
    const store = new RecentsStore(dir, codec);
    store.upsert(sighting('a', 1));
    store.upsert(sighting('b', 2));
    const again = new RecentsStore(dir, codec);
    again.upsert(sighting('c', 3));
    const ids = again.rows().map((r) => r.id);
    expect(new Set(ids).size).toBe(3);
    expect(Math.max(...ids)).toBe(3);
  });

  it('writes plaintext with no keychain and says so', () => {
    const store = new RecentsStore(dir, null);
    expect(store.storage()).toBe('plain');
    store.upsert(sighting('a', 1));
    expect(JSON.parse(file())).toEqual({ recents: [{ id: 1, ...sighting('a', 1) }] });
  });

  it('re-seals a plaintext file on a launch that has a keychain', () => {
    writeFileSync(
      join(dir, 'recents.json'),
      JSON.stringify({ recents: [{ id: 1, ...sighting('a', 1) }] }),
    );
    const store = new RecentsStore(dir, codec);
    expect(store.rows().map((r) => r.label)).toEqual(['a']);
    expect(file()).toContain('"sealed"');
    expect(file()).not.toContain('"label"');
  });

  it('keeps a sealed file it cannot open: reads nothing, writes nothing, reports unreadable', () => {
    new RecentsStore(dir, codec).upsert(sighting('a', 1));
    const before = file();
    const store = new RecentsStore(dir, denied);
    expect(store.storage()).toBe('unreadable');
    expect(store.rows()).toEqual([]);
    expect(store.upsert(sighting('b', 2))).toBe(false);
    store.clear('whatsapp');
    expect(file()).toBe(before);
    expect(new RecentsStore(dir, codec).rows().map((r) => r.label)).toEqual(['a']);
  });

  it('treats a sealed file with no keychain at all as unreadable', () => {
    new RecentsStore(dir, codec).upsert(sighting('a', 1));
    const store = new RecentsStore(dir, null);
    expect(store.storage()).toBe('unreadable');
    expect(store.rows()).toEqual([]);
  });

  it('clears one service and leaves the others', () => {
    const store = new RecentsStore(dir, codec);
    store.upsert(sighting('a', 1));
    store.upsert(sighting('b', 2, 'zalo'));
    store.clear('whatsapp');
    expect(store.rows().map((r) => r.label)).toEqual(['b']);
    expect(new RecentsStore(dir, codec).rows().map((r) => r.label)).toEqual(['b']);
  });

  it('survives a corrupt file as an empty list', () => {
    writeFileSync(join(dir, 'recents.json'), '{not json');
    const store = new RecentsStore(dir, codec);
    expect(store.rows()).toEqual([]);
    expect(store.storage()).toBe('sealed');
  });
});
