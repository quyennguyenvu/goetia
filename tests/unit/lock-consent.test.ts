import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { LockController, LockStore } from '../../src/main/lock';
import type { KeyCodec } from '../../src/main/passkeys/store';
import { CONSENT_TTL_MS } from '../../src/shared/lock';

let dir: string;
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const codec: KeyCodec = {
  encrypt: (plain) => Buffer.from(plain, 'utf8').toString('base64'),
  decrypt: (cipher) => Buffer.from(cipher, 'base64').toString('utf8'),
};

function build(opts: { touchId?: boolean; sensor?: boolean; finger?: boolean } = {}) {
  dir = mkdtempSync(join(tmpdir(), 'goetia-consent-'));
  const store = new LockStore(dir, codec);
  const settings = { enabled: true, touchId: opts.touchId ?? true, guardActions: true };
  let now = 0;
  const controller = new LockController(store, {
    enabled: () => settings.enabled,
    touchIdEnabled: () => settings.touchId,
    hasTouchId: () => opts.sensor ?? true,
    biometric: async () => opts.finger ?? true,
    persist: (patch) => Object.assign(settings, patch),
    now: () => now,
  });
  return { controller, store, settings, advance: (ms: number) => (now += ms) };
}

async function armed(opts: Parameters<typeof build>[0] = {}) {
  const built = build(opts);
  await built.controller.configure({ action: 'enable', passcode: 'correct horse' });
  return built;
}

const pass = { method: 'passcode', passcode: 'correct horse' } as const;

describe('LockController.grantConsent', () => {
  it('mints a consent the matching action can spend', async () => {
    const { controller } = await armed();
    expect((await controller.grantConsent({ kind: 'summon' }, pass)).ok).toBe(true);
    expect(controller.consumeConsent({ kind: 'summon' })).toBe(true);
  });

  it('refuses a wrong passcode and mints nothing', async () => {
    const { controller } = await armed();
    const result = await controller.grantConsent(
      { kind: 'summon' },
      { method: 'passcode', passcode: 'wrong' },
    );
    expect(result).toMatchObject({ ok: false, reason: 'wrong' });
    expect(controller.consumeConsent({ kind: 'summon' })).toBe(false);
  });

  it('accepts Touch ID here, unlike the Lock pane', async () => {
    const { controller } = await armed({ finger: true });
    expect((await controller.grantConsent({ kind: 'purge-all' }, { method: 'touchId' })).ok).toBe(
      true,
    );
    expect(controller.consumeConsent({ kind: 'purge-all' })).toBe(true);
  });

  it('grants while the app is unlocked — that is the whole point', async () => {
    const { controller } = await armed();
    expect(controller.locked).toBe(false);
    expect((await controller.grantConsent({ kind: 'purge-all' }, pass)).ok).toBe(true);
  });

  it('refuses when no passcode is set', async () => {
    const { controller } = build();
    expect(await controller.grantConsent({ kind: 'summon' }, pass)).toMatchObject({
      ok: false,
      reason: 'unavailable',
    });
  });

  // guessing through the confirm must cost what guessing at the lock costs
  it("shares the lock screen's failure backoff", async () => {
    const { controller } = await armed();
    await controller.grantConsent({ kind: 'summon' }, { method: 'passcode', passcode: 'wrong' });
    expect(await controller.grantConsent({ kind: 'summon' }, pass)).toMatchObject({
      ok: false,
      reason: 'throttled',
      waitMs: 1000,
    });
  });
});

describe('LockController.consumeConsent', () => {
  it('is single use', async () => {
    const { controller } = await armed();
    await controller.grantConsent({ kind: 'summon' }, pass);
    expect(controller.consumeConsent({ kind: 'summon' })).toBe(true);
    expect(controller.consumeConsent({ kind: 'summon' })).toBe(false);
  });

  it('refuses a different kind and keeps the slot intact', async () => {
    const { controller } = await armed();
    await controller.grantConsent({ kind: 'summon' }, pass);
    expect(controller.consumeConsent({ kind: 'purge-all' })).toBe(false);
    expect(controller.consumeConsent({ kind: 'summon' })).toBe(true);
  });

  it('refuses a purge-one granted for another service', async () => {
    const { controller } = await armed();
    await controller.grantConsent({ kind: 'purge-one', serviceId: 'slack' }, pass);
    expect(controller.consumeConsent({ kind: 'purge-one', serviceId: 'discord' })).toBe(false);
    expect(controller.consumeConsent({ kind: 'purge-one', serviceId: 'slack' })).toBe(true);
  });

  it('expires', async () => {
    const { controller, advance } = await armed();
    await controller.grantConsent({ kind: 'summon' }, pass);
    advance(CONSENT_TTL_MS + 1);
    expect(controller.consumeConsent({ kind: 'summon' })).toBe(false);
  });

  it('refuses when nothing was ever granted', async () => {
    const { controller } = await armed();
    expect(controller.consumeConsent({ kind: 'summon' })).toBe(false);
  });

  // a lock is a clean slate: anything authorized before it must not survive
  it('is dropped when the app locks', async () => {
    const { controller } = await armed();
    await controller.grantConsent({ kind: 'summon' }, pass);
    controller.lock();
    expect(controller.consumeConsent({ kind: 'summon' })).toBe(false);
  });
});
