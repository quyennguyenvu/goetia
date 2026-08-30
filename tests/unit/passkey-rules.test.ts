import { describe, expect, it } from 'vitest';
import { accountLabel, parsePasskeys, passkeyViews } from '../../src/main/lib/passkey-rules';

const known = new Set(['teams', 'messenger']);
const record = (over: Record<string, unknown> = {}) => ({
  id: 'Y3JlZA',
  rpId: 'microsoft.com',
  userHandle: 'dXNlcg',
  userName: 'quyen@example.com',
  displayName: 'Quyen',
  privateKey: 'ZW5j',
  publicKeyCose: 'Y29zZQ',
  createdIn: 'teams',
  createdAt: 10,
  lastUsedAt: 20,
  ...over,
});

describe('parsePasskeys', () => {
  it('keeps a well-formed record verbatim', () => {
    expect(parsePasskeys([record()], known)).toEqual([record()]);
  });
  it('drops anything that is not a record, an unknown service, or bad base64', () => {
    expect(parsePasskeys('nope', known)).toEqual([]);
    expect(
      parsePasskeys(
        [null, 3, record({ createdIn: 'gone' }), record({ id: 'a+b' }), record({ userHandle: 5 })],
        known,
      ),
    ).toEqual([]);
  });
  it('drops a duplicate id and a record without a private key', () => {
    expect(parsePasskeys([record(), record({ userName: 'other' })], known)).toHaveLength(1);
    expect(parsePasskeys([record({ privateKey: '' })], known)).toEqual([]);
  });
  it('tolerates missing text and clocks', () => {
    const [p] = parsePasskeys(
      [record({ displayName: undefined, createdAt: 'x', lastUsedAt: undefined })],
      known,
    );
    expect(p.displayName).toBe('');
    expect(p.createdAt).toBe(0);
    expect(p.lastUsedAt).toBe(0);
  });
});

describe('accountLabel', () => {
  it('prefers the display name, then the user name, then a placeholder', () => {
    expect(accountLabel({ userName: 'u', displayName: 'D' })).toBe('D');
    expect(accountLabel({ userName: 'u', displayName: '' })).toBe('u');
    expect(accountLabel({ userName: '', displayName: '' })).toBe('(unnamed account)');
  });
});

describe('passkeyViews', () => {
  it('exposes display fields only — never the key', () => {
    const [v] = passkeyViews(parsePasskeys([record()], known));
    expect(v).toEqual({
      id: 'Y3JlZA',
      rpId: 'microsoft.com',
      account: 'Quyen',
      createdIn: 'teams',
      createdAt: 10,
      lastUsedAt: 20,
    });
    expect('privateKey' in v).toBe(false);
  });
});
