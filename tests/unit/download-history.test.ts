import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { KeyCodec } from '../../src/main/codec';
import { DownloadHistoryStore } from '../../src/main/download-history';
import type { DownloadRecord } from '../../src/main/lib/download-rules';

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

const rec = (id: number, state: DownloadRecord['state'] = 'saved'): DownloadRecord => ({
  id,
  serviceId: 'zalo',
  filename: `bao-gia-${id}.pdf`,
  path: `/tmp/dl/bao-gia-${id}.pdf`,
  state,
  received: 5,
  total: 5,
  at: id,
});

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'goetia-dlhist-'));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const file = () => readFileSync(join(dir, 'downloads.json'), 'utf8');

describe('DownloadHistoryStore', () => {
  it('starts empty on a fresh profile and writes nothing until asked', () => {
    const store = new DownloadHistoryStore(dir, codec);
    expect(store.load()).toEqual([]);
    expect(store.storage()).toBe('sealed');
    expect(() => file()).toThrow(); // no `downloads: []` default, no empty envelope
  });

  it('seals with a codec: the file names no file in clear, and a fresh store reads it back', () => {
    const store = new DownloadHistoryStore(dir, codec);
    store.save([rec(1), rec(2, 'failed')]);
    const raw = file();
    expect(raw).toContain('"sealed"');
    expect(raw).not.toContain('bao-gia');
    expect(new DownloadHistoryStore(dir, codec).load().map((r) => r.id)).toEqual([2, 1]);
  });

  it('never writes a downloading row', () => {
    const store = new DownloadHistoryStore(dir, codec);
    store.save([rec(1), rec(2, 'downloading')]);
    expect(store.load().map((r) => r.id)).toEqual([1]);
    expect(new DownloadHistoryStore(dir, codec).load().map((r) => r.id)).toEqual([1]);
  });

  it('writes plaintext with no keychain and says so', () => {
    const store = new DownloadHistoryStore(dir, null);
    expect(store.storage()).toBe('plain');
    store.save([rec(1)]);
    expect(JSON.parse(file())).toEqual({ downloads: [rec(1)] });
  });

  it('re-seals a plaintext file on a launch that has a keychain', () => {
    writeFileSync(join(dir, 'downloads.json'), JSON.stringify({ downloads: [rec(1)] }));
    const store = new DownloadHistoryStore(dir, codec);
    expect(store.load().map((r) => r.id)).toEqual([1]);
    expect(file()).toContain('"sealed"');
    expect(file()).not.toContain('bao-gia');
  });

  it('keeps a sealed file it cannot open: reads nothing, writes nothing, reports unreadable', () => {
    new DownloadHistoryStore(dir, codec).save([rec(1)]);
    const before = file();
    const store = new DownloadHistoryStore(dir, denied);
    expect(store.storage()).toBe('unreadable');
    expect(store.load()).toEqual([]);
    store.save([rec(2)]);
    expect(file()).toBe(before);
    // the next launch that can read it gets the old rows back
    expect(new DownloadHistoryStore(dir, codec).load().map((r) => r.id)).toEqual([1]);
  });

  it('treats a sealed file with no keychain at all as unreadable', () => {
    new DownloadHistoryStore(dir, codec).save([rec(1)]);
    const store = new DownloadHistoryStore(dir, null);
    expect(store.storage()).toBe('unreadable');
    expect(store.load()).toEqual([]);
  });

  it('survives a corrupt file as an empty history', () => {
    writeFileSync(join(dir, 'downloads.json'), '{not json');
    const store = new DownloadHistoryStore(dir, codec);
    expect(store.load()).toEqual([]);
    expect(store.storage()).toBe('sealed');
  });
});
