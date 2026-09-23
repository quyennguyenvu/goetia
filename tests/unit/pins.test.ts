import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { KeyCodec } from '../../src/main/codec';
import { PinStore } from '../../src/main/pins';
import { PIN_CAP } from '../../src/shared/pins';

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

const legacyPin = {
  id: 1,
  serviceId: 'zalo',
  text: 'Gửi lại báo giá',
  note: '',
  conversation: 'Nhóm Sale',
  href: 'https://chat.zalo.me/',
  at: 1,
};

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'goetia-pins-'));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const input = (text: string, serviceId: 'zalo' | 'messenger' = 'zalo', title = '') => ({
  serviceId,
  text,
  href: 'https://chat.zalo.me/',
  title,
  at: 1,
});

describe('PinStore', () => {
  it('starts empty and appends to the end of the queue', () => {
    const store = new PinStore(dir, codec);
    expect(store.views()).toEqual([]);
    store.pin(input('first'));
    store.pin(input('second'));
    expect(store.views().map((p) => p.text)).toEqual(['first', 'second']);
    expect(store.views().map((p) => p.id)).toEqual([1, 2]);
  });

  it('refuses at the cap and reports isFull', () => {
    const store = new PinStore(dir, codec);
    for (let i = 0; i < PIN_CAP; i++) store.pin(input(`p${i}`));
    expect(store.isFull()).toBe(true);
    expect(store.pin(input('one more'))).toBeNull();
    expect(store.all()).toHaveLength(PIN_CAP);
  });

  it('refuses a selection that clamps to nothing', () => {
    const store = new PinStore(dir, codec);
    expect(store.pin(input('  \n '))).toBeNull();
    expect(store.all()).toHaveLength(0);
  });

  it('refuses the same message from the same conversation twice', () => {
    const store = new PinStore(dir, codec);
    expect(store.pin(input('same'))).not.toBeNull();
    expect(store.pin(input('  same '))).toBeNull(); // clamped text is what is compared
    expect(store.pin(input('same', 'messenger'))).not.toBeNull(); // another service is fine
    expect(store.pin({ ...input('same'), href: 'https://chat.zalo.me/#/other' })).not.toBeNull();
    expect(store.all()).toHaveLength(3);
  });

  it('records the conversation from the page title', () => {
    const store = new PinStore(dir, codec);
    store.pin(input('x', 'zalo', '(1) Nhóm Sale - Zalo'));
    expect(store.views()[0].conversation).toBe('Nhóm Sale');
    store.pin(input('y', 'messenger', 'Messenger'));
    expect(store.views()[1].conversation).toBe('');
  });

  it("prefers the recipe's conversation name over the title", () => {
    const store = new PinStore(dir, codec);
    store.pin({ ...input('x', 'zalo', 'Zalo'), conversation: 'FULL TEAM - Ticketbox' });
    expect(store.views()[0].conversation).toBe('FULL TEAM - Ticketbox');
    // same text in another conversation on a URL-less site is a different todo
    expect(store.pin({ ...input('x', 'zalo', 'Zalo'), conversation: 'Sale Q7' })).not.toBeNull();
    expect(store.pin({ ...input('x', 'zalo', 'Zalo'), conversation: 'Sale Q7' })).toBeNull();
  });

  it('persists across instances and never reuses an id', () => {
    const a = new PinStore(dir, codec);
    a.pin(input('keep'));
    a.pin(input('drop'));
    a.unpin(2);
    const b = new PinStore(dir, codec);
    expect(b.views().map((p) => p.text)).toEqual(['keep']);
    expect(b.pin(input('new'))?.id).toBe(2); // ids continue from the highest kept id
    const bytes = readFileSync(join(dir, 'pins.json'), 'utf8');
    expect(bytes).toContain('"sealed"');
    expect(bytes).not.toContain('"new"'); // the text is inside the envelope, not beside it
  });

  it('recovers from a corrupt file with an empty board', () => {
    writeFileSync(join(dir, 'pins.json'), '{ not json');
    expect(new PinStore(dir, codec).views()).toEqual([]);
  });

  it('drops pins for services no longer in the catalog at load', () => {
    writeFileSync(
      join(dir, 'pins.json'),
      JSON.stringify({
        pins: [
          { id: 1, serviceId: 'gone', text: 'x', note: '', href: 'https://a/', at: 1 },
          { id: 2, serviceId: 'zalo', text: 'y', note: '', href: 'https://chat.zalo.me/', at: 1 },
        ],
      }),
    );
    expect(new PinStore(dir, codec).views().map((p) => p.id)).toEqual([2]);
  });

  it('unpin then restore puts the pin back at its old index', () => {
    const store = new PinStore(dir, codec);
    store.pin(input('a'));
    store.pin(input('b'));
    store.pin(input('c'));
    expect(store.unpin(2)).toBe(true);
    expect(store.views().map((p) => p.text)).toEqual(['a', 'c']);
    expect(store.restore(2)).toBe(true);
    expect(store.views().map((p) => p.text)).toEqual(['a', 'b', 'c']);
  });

  it('restore only undoes the most recent removal, once', () => {
    const store = new PinStore(dir, codec);
    store.pin(input('a'));
    store.pin(input('b'));
    store.unpin(1);
    store.unpin(2);
    expect(store.restore(1)).toBe(false); // superseded
    expect(store.restore(2)).toBe(true);
    expect(store.restore(2)).toBe(false); // already back
    expect(store.unpin(99)).toBe(false);
  });

  it('restore clamps the index when the board shrank meanwhile', () => {
    const store = new PinStore(dir, codec);
    store.pin(input('a'));
    store.pin(input('b'));
    store.pin(input('c'));
    store.unpin(3);
    store.reorder([2, 1]);
    // lastRemoved survives a reorder; the old index 2 still fits at the end
    expect(store.restore(3)).toBe(true);
    expect(store.views().map((p) => p.text)).toEqual(['b', 'a', 'c']);
  });

  it('setNote clamps, persists, and reports a no-op', () => {
    const store = new PinStore(dir, codec);
    store.pin(input('a'));
    expect(store.setNote(1, '  after   lunch ')).toBe(true);
    expect(store.views()[0].note).toBe('after lunch');
    expect(store.setNote(1, 'after lunch')).toBe(false);
    expect(store.setNote(42, 'x')).toBe(false);
    expect(new PinStore(dir, codec).views()[0].note).toBe('after lunch');
  });

  it('reorder accepts only a permutation and ignores a no-op', () => {
    const store = new PinStore(dir, codec);
    store.pin(input('a'));
    store.pin(input('b'));
    store.pin(input('c'));
    expect(store.reorder([1, 2, 3])).toBe(false);
    expect(store.reorder([1, 2])).toBe(false);
    expect(store.reorder([3, 1, 2])).toBe(true);
    expect(store.views().map((p) => p.text)).toEqual(['c', 'a', 'b']);
    expect(new PinStore(dir, codec).views().map((p) => p.text)).toEqual(['c', 'a', 'b']);
  });

  it('views carry no href', () => {
    const store = new PinStore(dir, codec);
    store.pin(input('a'));
    expect('href' in store.views()[0]).toBe(false);
    expect(store.get(1)?.href).toBe('https://chat.zalo.me/');
  });
});

describe('PinStore at rest', () => {
  it('seals the file: neither the text nor the note is readable on disk', () => {
    const store = new PinStore(dir, codec);
    store.pin(input('secret plan'));
    store.setNote(1, 'call An');
    const bytes = readFileSync(join(dir, 'pins.json'), 'utf8');
    expect(Object.keys(JSON.parse(bytes))).toEqual(['sealed']);
    expect(bytes).not.toContain('secret plan');
    expect(bytes).not.toContain('call An');
    expect(new PinStore(dir, codec).views().map((p) => [p.text, p.note])).toEqual([
      ['secret plan', 'call An'],
    ]);
  });

  it('migrates a legacy plaintext file at construction, before any click', () => {
    writeFileSync(join(dir, 'pins.json'), JSON.stringify({ pins: [legacyPin] }));
    const store = new PinStore(dir, codec);
    expect(store.views().map((p) => p.text)).toEqual(['Gửi lại báo giá']);
    const bytes = readFileSync(join(dir, 'pins.json'), 'utf8');
    expect(bytes).toContain('"sealed"');
    expect(bytes).not.toContain('"pins"');
    expect(bytes).not.toContain('Gửi lại báo giá');
    expect(new PinStore(dir, codec).views().map((p) => p.id)).toEqual([1]);
  });

  it('leaves an undecryptable file untouched and refuses every write', () => {
    const before = JSON.stringify({ sealed: 'not for this machine' });
    writeFileSync(join(dir, 'pins.json'), before);
    const store = new PinStore(dir, denied);
    expect(store.isUnreadable()).toBe(true);
    expect(store.isFull()).toBe(true);
    expect(store.views()).toEqual([]);
    expect(store.pin(input('x'))).toBeNull();
    expect(store.unpin(1)).toBe(false);
    expect(store.restore(1)).toBe(false);
    expect(store.setNote(1, 'n')).toBe(false);
    expect(store.reorder([])).toBe(false);
    expect(readFileSync(join(dir, 'pins.json'), 'utf8')).toBe(before);
  });

  it('is unreadable when a sealed file meets a machine with no keychain', () => {
    const before = JSON.stringify({
      sealed: codec.encrypt(JSON.stringify({ pins: [legacyPin] })),
    });
    writeFileSync(join(dir, 'pins.json'), before);
    const store = new PinStore(dir, null);
    expect(store.isUnreadable()).toBe(true);
    expect(store.views()).toEqual([]);
    expect(store.pin(input('x'))).toBeNull();
    expect(readFileSync(join(dir, 'pins.json'), 'utf8')).toBe(before);
  });

  it('writes and reads plaintext when handed no codec', () => {
    const a = new PinStore(dir, null);
    a.pin(input('plain sight'));
    expect(readFileSync(join(dir, 'pins.json'), 'utf8')).toContain('plain sight');
    expect(new PinStore(dir, null).views().map((p) => p.text)).toEqual(['plain sight']);
    expect(new PinStore(dir, null).isUnreadable()).toBe(false);
  });

  it('writes nothing on a fresh profile until the first pin', () => {
    const store = new PinStore(dir, codec);
    expect(store.isUnreadable()).toBe(false);
    expect(existsSync(join(dir, 'pins.json'))).toBe(false);
    store.pin(input('first'));
    expect(existsSync(join(dir, 'pins.json'))).toBe(true);
  });
});
