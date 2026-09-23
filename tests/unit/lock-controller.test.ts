import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { KeyCodec } from '../../src/main/codec';
import { LockController, LockStore } from '../../src/main/lock';

let dir: string;
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const codec: KeyCodec = {
  encrypt: (plain) => Buffer.from(plain, 'utf8').toString('base64'),
  decrypt: (cipher) => Buffer.from(cipher, 'base64').toString('utf8'),
};

function build(
  opts: { enabled?: boolean; touchId?: boolean; sensor?: boolean; finger?: boolean } = {},
) {
  dir = mkdtempSync(join(tmpdir(), 'goetia-lockctl-'));
  const store = new LockStore(dir, codec);
  const settings = { enabled: opts.enabled ?? true, touchId: opts.touchId ?? true };
  let now = 0;
  const notes: string[] = [];
  const controller = new LockController(store, {
    enabled: () => settings.enabled,
    touchIdEnabled: () => settings.touchId,
    hasTouchId: () => opts.sensor ?? true,
    biometric: async () => opts.finger ?? true,
    persist: (patch) => Object.assign(settings, patch),
    now: () => now,
    note: (line) => void notes.push(line),
  });
  return { controller, store, settings, notes, advance: (ms: number) => (now += ms) };
}

/** the lock is on and a passcode is set — the only state that can engage */
async function armed(opts: Parameters<typeof build>[0] = {}): Promise<ReturnType<typeof build>> {
  const built = build(opts);
  await built.controller.configure({ action: 'enable', passcode: 'correct horse' });
  return built;
}

describe('LockController.lock', () => {
  it('refuses to lock with no passcode set — that is a lockout, not a lock', () => {
    const { controller } = build();
    expect(controller.lock()).toBe(false);
    expect(controller.locked).toBe(false);
  });

  it('locks once a passcode exists', async () => {
    const { controller } = await armed();
    expect(controller.lock()).toBe(true);
    expect(controller.locked).toBe(true);
  });

  it('is idempotent — locking a locked app changes nothing', async () => {
    const { controller } = await armed();
    controller.lock();
    expect(controller.lock()).toBe(false);
    expect(controller.locked).toBe(true);
  });
});

describe('LockController.unlock', () => {
  it('opens on the right passcode', async () => {
    const { controller } = await armed();
    controller.lock();
    expect((await controller.unlock({ method: 'passcode', passcode: 'correct horse' })).ok).toBe(
      true,
    );
    expect(controller.locked).toBe(false);
  });

  // a success clears the streak, so the next mistake costs one second again
  // rather than resuming the doubling where the last run left off
  it('resets the failure streak on a success', async () => {
    const { controller, advance } = await armed();
    controller.lock();
    await controller.unlock({ method: 'passcode', passcode: 'wrong' });
    advance(1000);
    await controller.unlock({ method: 'passcode', passcode: 'wrong' });
    advance(2000); // second failure cost 2s, so the streak really was at 2
    expect((await controller.unlock({ method: 'passcode', passcode: 'correct horse' })).ok).toBe(
      true,
    );
    controller.lock();
    await controller.unlock({ method: 'passcode', passcode: 'wrong' });
    expect(
      await controller.unlock({ method: 'passcode', passcode: 'correct horse' }),
    ).toMatchObject({ waitMs: 1000 });
  });

  it('throttles consecutive wrong passcodes and clears the throttle with time', async () => {
    const { controller, advance } = await armed();
    controller.lock();
    await controller.unlock({ method: 'passcode', passcode: 'wrong' });
    const throttled = await controller.unlock({ method: 'passcode', passcode: 'correct horse' });
    expect(throttled).toMatchObject({ ok: false, reason: 'throttled', waitMs: 1000 });
    expect(controller.locked).toBe(true);
    advance(1000);
    expect((await controller.unlock({ method: 'passcode', passcode: 'correct horse' })).ok).toBe(
      true,
    );
  });

  it('opens on Touch ID when the setting and the sensor agree', async () => {
    const { controller } = await armed({ finger: true });
    controller.lock();
    expect((await controller.unlock({ method: 'touchId' })).ok).toBe(true);
  });

  it('refuses Touch ID when the setting is off, even with a sensor', async () => {
    const { controller } = await armed({ touchId: false, sensor: true, finger: true });
    controller.lock();
    expect(await controller.unlock({ method: 'touchId' })).toMatchObject({
      ok: false,
      reason: 'unavailable',
    });
    expect(controller.locked).toBe(true);
  });

  it('does not count a cancelled Touch ID as a wrong passcode', async () => {
    const { controller } = await armed({ finger: false });
    controller.lock();
    expect(await controller.unlock({ method: 'touchId' })).toMatchObject({
      ok: false,
      reason: 'cancelled',
    });
    // no backoff was incurred, so the passcode works immediately
    expect((await controller.unlock({ method: 'passcode', passcode: 'correct horse' })).ok).toBe(
      true,
    );
  });
});

describe('LockController.configure', () => {
  it('rejects a passcode under the floor and sets nothing', async () => {
    const { controller, store } = build();
    expect(await controller.configure({ action: 'enable', passcode: 'abc' })).toEqual({
      ok: false,
      error: 'too-short',
    });
    expect(store.has()).toBe(false);
  });

  it('turns the lock on and persists the setting', async () => {
    const { controller, settings, store } = build({ enabled: false });
    expect(await controller.configure({ action: 'enable', passcode: 'correct horse' })).toEqual({
      ok: true,
    });
    expect(settings.enabled).toBe(true);
    expect(store.has()).toBe(true);
  });

  it('requires the current passcode to turn the lock off', async () => {
    const { controller, settings, store } = await armed();
    expect(await controller.configure({ action: 'disable', current: 'wrong' })).toEqual({
      ok: false,
      error: 'wrong',
    });
    expect(store.has()).toBe(true);
    expect(await controller.configure({ action: 'disable', current: 'correct horse' })).toEqual({
      ok: true,
    });
    // the flag and the secret leave together — neither may outlive the other
    expect(settings.enabled).toBe(false);
    expect(store.has()).toBe(false);
  });

  it('requires the current passcode to change it', async () => {
    const { controller, store } = await armed();
    expect(
      await controller.configure({ action: 'change', current: 'wrong', next: 'battery staple' }),
    ).toEqual({ ok: false, error: 'wrong' });
    expect(await store.verify('correct horse')).toBe(true);
    expect(
      await controller.configure({
        action: 'change',
        current: 'correct horse',
        next: 'battery staple',
      }),
    ).toEqual({ ok: true });
    expect(await store.verify('battery staple')).toBe(true);
  });

  // the pane reveals its controls on this alone, so it must be exact
  it('verifies without changing anything', async () => {
    const { controller, settings, store } = await armed({ touchId: false });
    expect(await controller.configure({ action: 'verify', current: 'wrong' })).toEqual({
      ok: false,
      error: 'wrong',
    });
    expect(await controller.configure({ action: 'verify', current: 'correct horse' })).toEqual({
      ok: true,
    });
    expect(settings).toEqual({ enabled: true, touchId: false });
    expect(store.has()).toBe(true);
    expect(await store.verify('correct horse')).toBe(true);
  });

  it('refuses to verify when no passcode is set', async () => {
    const { controller } = build();
    expect(await controller.configure({ action: 'verify', current: 'anything' })).toEqual({
      ok: false,
      error: 'not-set',
    });
  });

  // Touch ID must not authorize widening the set of fingers that open the app
  it('requires the passcode to toggle Touch ID', async () => {
    const { controller, settings } = await armed({ touchId: false });
    expect(
      await controller.configure({ action: 'setTouchId', current: 'wrong', touchId: true }),
    ).toEqual({ ok: false, error: 'wrong' });
    expect(settings.touchId).toBe(false);
    expect(
      await controller.configure({ action: 'setTouchId', current: 'correct horse', touchId: true }),
    ).toEqual({ ok: true });
    expect(settings.touchId).toBe(true);
  });
});

describe('LockController pending banner action', () => {
  it('hands the parked action back exactly once', () => {
    const { controller } = build();
    controller.setPending({ serviceId: 'discord', entryId: 7 });
    expect(controller.takePending()).toEqual({ serviceId: 'discord', entryId: 7 });
    expect(controller.takePending()).toBeNull();
  });

  it('keeps only the most recent — one slot, no queue', () => {
    const { controller } = build();
    controller.setPending({ serviceId: 'discord', entryId: 7 });
    controller.setPending({ serviceId: 'slack', entryId: 9 });
    expect(controller.takePending()).toEqual({ serviceId: 'slack', entryId: 9 });
  });

  it('drops the slot when the app locks, so nothing stale fires later', async () => {
    const { controller } = await armed();
    controller.setPending({ serviceId: 'discord', entryId: 7 });
    controller.lock();
    expect(controller.takePending()).toBeNull();
  });
});

describe('LockController notes', () => {
  it('records unlocks and refusals with the method and the failure count', async () => {
    const { controller, notes } = await armed();
    controller.lock();
    await controller.unlock({ method: 'passcode', passcode: 'wrong' });
    await controller.unlock({ method: 'touchId' });
    expect(notes.slice(-2)).toEqual([
      'unlock refused: wrong passcode (1 failures)',
      'unlocked (touch id)',
    ]);
  });

  it('records a cancelled Touch ID and a throttled try', async () => {
    const { controller, notes, advance } = await armed({ finger: false });
    controller.lock();
    await controller.unlock({ method: 'touchId' });
    await controller.unlock({ method: 'passcode', passcode: 'wrong' });
    await controller.unlock({ method: 'passcode', passcode: 'correct horse' });
    expect(notes.slice(-3)).toEqual([
      'unlock refused: touch id cancelled',
      'unlock refused: wrong passcode (1 failures)',
      'unlock throttled',
    ]);
    advance(60_000);
    await controller.unlock({ method: 'passcode', passcode: 'correct horse' });
    expect(notes.at(-1)).toBe('unlocked (passcode)');
  });

  it('records every configuration and a refused one', async () => {
    const { controller, notes } = build();
    await controller.configure({ action: 'enable', passcode: 'correct horse' });
    await controller.configure({ action: 'setTouchId', current: 'correct horse', touchId: false });
    await controller.configure({
      action: 'setGuardActions',
      current: 'correct horse',
      guardActions: false,
    });
    await controller.configure({
      action: 'change',
      current: 'correct horse',
      next: 'battery staple',
    });
    await controller.configure({ action: 'verify', current: 'nope' });
    await controller.configure({ action: 'verify', current: 'battery staple' });
    await controller.configure({ action: 'disable', current: 'battery staple' });
    expect(notes).toEqual([
      'configured: enabled',
      'configured: touch id off',
      'configured: guard off',
      'configured: passcode changed',
      'configure refused: wrong passcode',
      'configured: disabled',
    ]);
  });
});
