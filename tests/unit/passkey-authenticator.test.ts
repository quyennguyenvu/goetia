import { createPublicKey, verify } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { concat } from '../../src/main/lib/cbor';
import { generateKeyPair, sha256 } from '../../src/main/lib/webauthn-crypto';
import {
  PasskeyAuthenticator,
  type PasskeyPrompt,
  type Verification,
} from '../../src/main/passkeys/authenticator';
import { PasskeyStore } from '../../src/main/passkeys/store';
import { fromBase64Url } from '../../src/shared/webauthn';

const codec = { encrypt: (s: string) => `e:${s}`, decrypt: (c: string) => c.slice(2) };
let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'goetia-auth-'));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

function prompt(over: Partial<PasskeyPrompt> = {}) {
  return {
    confirmCreate: vi.fn(async () => 'verified' as const),
    confirmGet: vi.fn(async () => 'verified' as const),
    chooseAccount: vi.fn(
      async (_rp: string, accounts: { id: string }[]) => accounts[0]?.id ?? null,
    ),
    noPasskey: vi.fn(async () => {}),
    capReached: vi.fn(async () => {}),
    ...over,
  } satisfies PasskeyPrompt;
}

const origin = 'https://teams.microsoft.com';
const createOptions = (over: Record<string, unknown> = {}) => ({
  rp: { id: 'microsoft.com', name: 'Microsoft' },
  user: { id: 'dXNlci0x', name: 'quyen@example.com', displayName: 'Quyen' },
  challenge: 'Y2hhbGxlbmdl',
  pubKeyCredParams: [{ type: 'public-key', alg: -7 }],
  ...over,
});
const getOptions = (over: Record<string, unknown> = {}) => ({
  rpId: 'microsoft.com',
  challenge: 'Z2V0',
  ...over,
});
const input = (options: unknown, viewKey = 1) => ({
  serviceId: 'teams' as const,
  origin,
  options,
  viewKey,
});

const stored = (userHandle: string, at: number, privateKeyPem = 'k') => ({
  rpId: 'microsoft.com',
  userHandle,
  userName: 'two',
  displayName: 'Two',
  privateKeyPem,
  publicKeyCose: new Uint8Array(1),
  createdIn: 'teams' as const,
  at,
});

function setup(p = prompt()) {
  const store = new PasskeyStore(dir, codec);
  const log = vi.fn();
  const auth = new PasskeyAuthenticator(store, p, { now: () => 1000, log });
  return { store, auth, p, log };
}

describe('PasskeyAuthenticator.create', () => {
  it('confirms, mints a discoverable credential and returns a `none` attestation', async () => {
    const { store, auth, p, log } = setup();
    const res = await auth.create(input(createOptions({ extensions: { credProps: true } })));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(p.confirmCreate).toHaveBeenCalledWith('microsoft.com', 'Quyen');
    expect(store.get(res.value.id)?.userHandle).toBe('dXNlci0x');
    expect(res.value.credProps).toBe(true);
    const cd = JSON.parse(
      Buffer.from(fromBase64Url(res.value.clientDataJSON) as Uint8Array).toString(),
    );
    expect(cd).toEqual({
      type: 'webauthn.create',
      challenge: 'Y2hhbGxlbmdl',
      origin,
      crossOrigin: false,
    });
    const ad = fromBase64Url(res.value.authenticatorData) as Uint8Array;
    expect(ad[32]).toBe(0x45); // UP | UV | AT
    expect(fromBase64Url(res.value.attestationObject)?.length).toBeGreaterThan(ad.length);
    expect(log).toHaveBeenCalledWith('[passkey] created rp=microsoft.com via=teams');
  });

  it('refuses when the user cancels', async () => {
    const { store, auth } = setup(prompt({ confirmCreate: vi.fn(async () => false as const) }));
    expect(await auth.create(input(createOptions()))).toEqual({
      ok: false,
      error: 'NotAllowedError',
    });
    expect(store.all()).toEqual([]);
  });

  it('reports an excluded credential as InvalidStateError without prompting', async () => {
    const { auth, p } = setup();
    const first = await auth.create(input(createOptions()));
    if (!first.ok) throw new Error('setup');
    const again = await auth.create(
      input(createOptions({ excludeCredentials: [{ type: 'public-key', id: first.value.id }] })),
    );
    expect(again).toEqual({ ok: false, error: 'InvalidStateError' });
    expect(p.confirmCreate).toHaveBeenCalledTimes(1);
  });

  it('maps validation failures to their WebAuthn names', async () => {
    const { auth } = setup();
    expect(await auth.create(input(createOptions({ rp: { id: 'google.com' } })))).toEqual({
      ok: false,
      error: 'SecurityError',
    });
    expect(
      await auth.create(
        input(createOptions({ pubKeyCredParams: [{ type: 'public-key', alg: -257 }] })),
      ),
    ).toEqual({ ok: false, error: 'NotSupportedError' });
    expect(
      await auth.create({ ...input(createOptions()), origin: 'http://teams.microsoft.com' }),
    ).toEqual({ ok: false, error: 'SecurityError' });
  });

  it('shows the cap notice and refuses when the store is full', async () => {
    const { store, auth, p } = setup();
    for (let i = 0; i < 50; i++) store.add({ ...stored(`u${i}`, 1), rpId: 'x.com' });
    expect(await auth.create(input(createOptions()))).toEqual({
      ok: false,
      error: 'NotAllowedError',
    });
    expect(p.capReached).toHaveBeenCalledTimes(1);
    expect(p.confirmCreate).not.toHaveBeenCalled();
  });
});

describe('PasskeyAuthenticator.get', () => {
  async function registered() {
    const s = setup();
    const created = await s.auth.create(input(createOptions()));
    if (!created.ok) throw new Error('setup');
    return { ...s, created: created.value };
  }

  it('signs an assertion the attested key verifies, and stamps lastUsedAt', async () => {
    const { auth, store, created, p, log } = await registered();
    const res = await auth.get(input(getOptions()));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(p.confirmGet).toHaveBeenCalledWith('microsoft.com', 'Quyen', false);
    expect(res.value.id).toBe(created.id);
    expect(res.value.userHandle).toBe('dXNlci0x');
    const ad = fromBase64Url(res.value.authenticatorData) as Uint8Array;
    expect(ad).toHaveLength(37);
    expect(ad[32]).toBe(0x05);
    const cd = fromBase64Url(res.value.clientDataJSON) as Uint8Array;
    expect(JSON.parse(Buffer.from(cd).toString()).type).toBe('webauthn.get');
    const pub = createPublicKey({
      key: Buffer.from(fromBase64Url(created.publicKeySpki) as Uint8Array),
      format: 'der',
      type: 'spki',
    });
    expect(
      verify(
        'sha256',
        concat([ad, sha256(cd)]),
        pub,
        fromBase64Url(res.value.signature) as Uint8Array,
      ),
    ).toBe(true);
    expect(store.get(created.id)?.lastUsedAt).toBe(1000);
    expect(log).toHaveBeenCalledWith('[passkey] asserted rp=microsoft.com via=teams');
  });

  it('shows the no-passkey notice and refuses when nothing matches', async () => {
    const { auth, p } = setup();
    expect(await auth.get(input(getOptions()))).toEqual({ ok: false, error: 'NotAllowedError' });
    expect(p.noPasskey).toHaveBeenCalledWith('microsoft.com');
    expect(p.confirmGet).not.toHaveBeenCalled();
  });

  it('honours allowCredentials', async () => {
    const { auth, created, p } = await registered();
    expect(
      await auth.get(
        input(getOptions({ allowCredentials: [{ type: 'public-key', id: 'b3RoZXI' }] })),
      ),
    ).toEqual({ ok: false, error: 'NotAllowedError' });
    expect(p.noPasskey).toHaveBeenCalledTimes(1);
    const ok = await auth.get(
      input(getOptions({ allowCredentials: [{ type: 'public-key', id: created.id }] })),
    );
    expect(ok.ok).toBe(true);
  });

  it('offers a chooser only with several accounts, most recently used first, and treats it as the confirmation', async () => {
    const { auth, store, p } = await registered();
    const second = store.add(stored('dXNlci0y', 5000, generateKeyPair().privateKeyPem));
    const res = await auth.get(input(getOptions()));
    expect(res.ok).toBe(true);
    expect(p.chooseAccount).toHaveBeenCalledWith('microsoft.com', [
      { id: second.id, label: 'Two' },
      { id: expect.any(String), label: 'Quyen' },
    ]);
    expect(p.confirmGet).toHaveBeenLastCalledWith('microsoft.com', 'Two', true);
  });

  it('refuses when the chooser is cancelled', async () => {
    const { store } = await registered();
    store.add(stored('dXNlci0y', 5000));
    const cancelling = new PasskeyAuthenticator(
      store,
      prompt({ chooseAccount: vi.fn(async () => null) }),
    );
    expect(await cancelling.get(input(getOptions()))).toEqual({
      ok: false,
      error: 'NotAllowedError',
    });
  });

  it('surfaces an undecryptable key only as NotAllowedError', async () => {
    const { created } = await registered();
    const broken = new PasskeyStore(dir, {
      encrypt: codec.encrypt,
      decrypt: () => {
        throw new Error('denied');
      },
    });
    const auth = new PasskeyAuthenticator(broken, prompt());
    expect(broken.get(created.id)).toBeDefined();
    expect(await auth.get(input(getOptions()))).toEqual({ ok: false, error: 'NotAllowedError' });
  });
});

describe('PasskeyAuthenticator concurrency and timeout', () => {
  it('allows one in-flight ceremony per view and refuses a second', async () => {
    let release: (v: Verification) => void = () => {};
    const gate = new Promise<Verification>((r) => {
      release = r;
    });
    const { auth } = setup(prompt({ confirmCreate: vi.fn(() => gate) }));
    const first = auth.create(input(createOptions(), 7));
    expect(await auth.create(input(createOptions(), 7))).toEqual({
      ok: false,
      error: 'NotAllowedError',
    });
    // another view is unaffected
    const other = auth.create(
      input(createOptions({ user: { id: 'dXNlci0y', name: 'b', displayName: 'B' } }), 8),
    );
    release('verified');
    expect((await first).ok).toBe(true);
    expect((await other).ok).toBe(true);
    // and the slot is free again
    expect((await auth.create(input(createOptions(), 7))).ok).toBe(true);
  });

  it('gives up on a prompt that never answers', async () => {
    vi.useFakeTimers();
    try {
      const never = prompt({ confirmCreate: vi.fn(() => new Promise<Verification>(() => {})) });
      const quick = new PasskeyAuthenticator(new PasskeyStore(dir, codec), never, {
        timeoutMs: 50,
      });
      const pending = quick.create(input(createOptions()));
      await vi.advanceTimersByTimeAsync(60);
      expect(await pending).toEqual({ ok: false, error: 'NotAllowedError' });
    } finally {
      vi.useRealTimers();
    }
  });

  it('mints nothing when the confirm is answered after the timeout', async () => {
    vi.useFakeTimers();
    try {
      let answer: (v: 'verified') => void = () => {};
      const late = prompt({
        confirmCreate: vi.fn(
          () =>
            new Promise<'verified'>((r) => {
              answer = r;
            }),
        ),
      });
      const store = new PasskeyStore(dir, codec);
      const quick = new PasskeyAuthenticator(store, late, { timeoutMs: 50 });
      const pending = quick.create(input(createOptions()));
      await vi.advanceTimersByTimeAsync(60);
      expect(await pending).toEqual({ ok: false, error: 'NotAllowedError' });
      answer('verified'); // the user finally approves, too late
      await vi.runAllTimersAsync();
      expect(store.all()).toEqual([]); // no credential was persisted
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('PasskeyAuthenticator prompt cool-down', () => {
  it('refuses the next ceremony silently within the cool-down after a decline', async () => {
    let clock = 1000;
    const confirmGet = vi.fn<PasskeyPrompt['confirmGet']>(async () => false);
    const p = prompt({ confirmGet });
    const store = new PasskeyStore(dir, codec);
    store.add(stored('dXNlci0x', 1, generateKeyPair().privateKeyPem));
    const auth = new PasskeyAuthenticator(store, p, { now: () => clock, cooldownMs: 5_000 });
    // first get is declined
    expect(await auth.get(input(getOptions()))).toEqual({ ok: false, error: 'NotAllowedError' });
    expect(confirmGet).toHaveBeenCalledTimes(1);
    // a second, within the window, never reaches the prompt
    clock = 3000;
    expect(await auth.get(input(getOptions()))).toEqual({ ok: false, error: 'NotAllowedError' });
    expect(confirmGet).toHaveBeenCalledTimes(1);
    // past the window, the prompt is offered again
    clock = 7000;
    confirmGet.mockResolvedValueOnce('verified');
    expect((await auth.get(input(getOptions()))).ok).toBe(true);
    expect(confirmGet).toHaveBeenCalledTimes(2);
  });
});

describe('PasskeyAuthenticator honest user verification', () => {
  it('leaves UV clear when the confirm was presence, not verification', async () => {
    const p = prompt({
      confirmCreate: vi.fn(async () => 'presence' as const),
      confirmGet: vi.fn(async () => 'presence' as const),
    });
    const store = new PasskeyStore(dir, codec);
    const auth = new PasskeyAuthenticator(store, p, { now: () => 1000 });
    const created = await auth.create(input(createOptions()));
    if (!created.ok) throw new Error('setup');
    const ad = fromBase64Url(created.value.authenticatorData) as Uint8Array;
    expect(ad[32]).toBe(0x41); // UP | AT, no UV
    const got = await auth.get(input(getOptions()));
    if (!got.ok) throw new Error('get');
    expect((fromBase64Url(got.value.authenticatorData) as Uint8Array)[32]).toBe(0x01); // UP only
  });

  it('refuses userVerification:required when only presence is available', async () => {
    const p = prompt({ confirmGet: vi.fn(async () => 'presence' as const) });
    const store = new PasskeyStore(dir, codec);
    store.add(stored('dXNlci0x', 1));
    const auth = new PasskeyAuthenticator(store, p, { now: () => 1000 });
    expect(await auth.get(input(getOptions({ userVerification: 'required' })))).toEqual({
      ok: false,
      error: 'NotAllowedError',
    });
  });
});
