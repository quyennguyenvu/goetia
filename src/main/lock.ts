import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import Conf from 'conf';
import {
  CONSENT_TTL_MS,
  describeAction,
  type GuardedAction,
  isGuardGroup,
  type LockConfigResult,
  type LockConfigure,
  sameAction,
  type UnlockRequest,
  type UnlockResult,
} from '../shared/lock';
import type { GuardSettings, ServiceId } from '../shared/types';
import type { KeyCodec } from './codec';
import { passcodeAcceptable, unlockDelay } from './lib/lock-rules';

const derive = promisify(scrypt) as (
  passcode: string,
  salt: Buffer,
  keylen: number,
) => Promise<Buffer>;

const SALT_BYTES = 16;
const KEY_BYTES = 32;

interface Credential {
  salt: string;
  hash: string;
}

interface LockFile {
  /** the credential, safeStorage-encrypted; null when the lock is off */
  credential: string | null;
}

/** The unlock passcode at rest, in <cwd>/lock.json.
 *
 *  Two layers, for two different adversaries. The scrypt hash means the file
 *  never holds the passcode itself — safeStorage guards against another user
 *  on the machine, not against a process running as this one, and a passcode
 *  is the kind of secret people reuse elsewhere. The safeStorage envelope on
 *  top is the tier the session cookies and the passkey private keys already
 *  rest under.
 *
 *  Deliberately not in settings.json: ShellState broadcasts that whole object
 *  to the renderer on every state change. */
export class LockStore {
  private conf: Conf<LockFile>;
  private credential: Credential | null = null;
  /** a credential exists on disk but would not decrypt */
  private stuck = false;

  constructor(
    cwd: string,
    private codec: KeyCodec,
  ) {
    this.conf = new Conf<LockFile>({ cwd, configName: 'lock', defaults: { credential: null } });
    const stored = this.conf.store.credential;
    if (!stored) return;
    try {
      this.credential = JSON.parse(this.codec.decrypt(stored)) as Credential;
    } catch {
      // fail closed: reporting "no passcode" here would open the app
      this.stuck = true;
    }
  }

  has(): boolean {
    return this.credential !== null || this.stuck;
  }

  /** False when a credential exists but cannot be decrypted — no passcode can
   *  ever match it, so the lock screen says so instead of letting the user
   *  guess at one that cannot work. */
  readable(): boolean {
    return !this.stuck;
  }

  async set(passcode: string): Promise<void> {
    const salt = randomBytes(SALT_BYTES);
    const hash = await derive(passcode, salt, KEY_BYTES);
    this.credential = { salt: salt.toString('base64'), hash: hash.toString('base64') };
    this.stuck = false;
    this.conf.store = { credential: this.codec.encrypt(JSON.stringify(this.credential)) };
  }

  async verify(passcode: string): Promise<boolean> {
    const c = this.credential;
    if (!c) return false;
    const expected = Buffer.from(c.hash, 'base64');
    const actual = await derive(passcode, Buffer.from(c.salt, 'base64'), expected.length);
    return timingSafeEqual(expected, actual);
  }

  clear(): void {
    this.credential = null;
    this.stuck = false;
    this.conf.store = { credential: null };
  }
}

/** A banner click that arrived while the app was locked. One slot, last write
 *  wins: this is "the thing you were reaching for", not a queue. */
export interface PendingOpen {
  serviceId: ServiceId;
  entryId?: number;
}

export interface LockDeps {
  enabled(): boolean;
  touchIdEnabled(): boolean;
  hasTouchId(): boolean;
  biometric(reason: string): Promise<boolean>;
  persist(patch: { enabled?: boolean; touchId?: boolean; guard?: Partial<GuardSettings> }): void;
  now(): number;
  /** ctx.diag.note('lock', …): methods, kinds and counts, never a secret */
  note?(line: string): void;
}

const method = (req: UnlockRequest): string => (req.method === 'touchId' ? 'touch id' : 'passcode');

/** The ceremony. Owns whether the app is locked, the consecutive-failure
 *  backoff, and the one parked banner click. Electron-free by construction:
 *  Touch ID and the settings write arrive as injected functions, which is
 *  what makes the whole thing unit-testable. */
export class LockController {
  locked = false;
  private failures = 0;
  private blockedUntil = 0;
  private pending: PendingOpen | null = null;
  /** The one action the user has just authorized. Single slot, single use:
   *  this is "yes, do that", not a standing permission. */
  private consent: { action: GuardedAction; at: number } | null = null;

  constructor(
    private store: LockStore,
    private deps: LockDeps,
  ) {}

  configured(): boolean {
    return this.store.has();
  }

  readable(): boolean {
    return this.store.readable();
  }

  /** True when the lock actually engaged. Locking with the setting off, or
   *  with no passcode stored, would be a lockout with no door — refused here
   *  rather than in each of the three callers. */
  lock(): boolean {
    if (!this.deps.enabled() || !this.store.has() || this.locked) return false;
    this.locked = true;
    this.pending = null; // nothing parked before a lock may survive it
    this.consent = null; // nor anything authorized before it
    return true;
  }

  async unlock(req: UnlockRequest): Promise<UnlockResult> {
    if (!this.locked) return { ok: false, waitMs: 0, reason: 'unavailable' };
    const result = await this.check(req);
    if (result.ok) {
      this.open();
      this.deps.note?.(`unlocked (${method(req)})`);
    } else {
      const why = this.failure(result);
      if (result.reason === 'throttled') this.deps.note?.('unlock throttled');
      else if (why) this.deps.note?.(`unlock refused: ${why}`);
    }
    return result;
  }

  /** Verify a credential and move nothing. Shared by the lock screen and the
   *  action confirms, so guessing through either costs the same backoff. */
  private async check(req: UnlockRequest): Promise<UnlockResult> {
    if (req.method === 'touchId') {
      if (!this.deps.touchIdEnabled() || !this.deps.hasTouchId()) {
        return { ok: false, waitMs: 0, reason: 'unavailable' };
      }
      // a cancelled prompt is not a guess: it must not cost the owner a backoff
      if (!(await this.deps.biometric('unlock Goetia'))) {
        return { ok: false, waitMs: 0, reason: 'cancelled' };
      }
      return { ok: true, waitMs: 0 };
    }
    const waitMs = Math.max(0, this.blockedUntil - this.deps.now());
    if (waitMs > 0) return { ok: false, waitMs, reason: 'throttled' };
    if (!this.store.readable()) return { ok: false, waitMs: 0, reason: 'unreadable' };
    if (!(await this.store.verify(req.passcode))) {
      this.failures += 1;
      this.blockedUntil = this.deps.now() + unlockDelay(this.failures);
      return { ok: false, waitMs: 0, reason: 'wrong' };
    }
    return { ok: true, waitMs: 0 };
  }

  /** Authorize one guarded action. Unlike unlock() this runs while the app is
   *  open, which is the whole point: it guards acting, not reading. */
  async grantConsent(action: GuardedAction, credential: UnlockRequest): Promise<UnlockResult> {
    if (!this.deps.enabled() || !this.store.has()) {
      return { ok: false, waitMs: 0, reason: 'unavailable' };
    }
    const result = await this.check(credential);
    const what = describeAction(action);
    if (result.ok) {
      this.consent = { action, at: this.deps.now() };
      this.deps.note?.(`consent granted: ${what} (${method(credential)})`);
    } else {
      const why = this.failure(result);
      if (result.reason === 'throttled') this.deps.note?.(`consent throttled: ${what}`);
      else if (why) this.deps.note?.(`consent refused: ${what}, ${why}`);
    }
    return result;
  }

  /** The refusal, worded for the ring; null for the reasons that say nothing
   *  about the person at the keyboard (unavailable). */
  private failure(result: UnlockResult): string | null {
    switch (result.reason) {
      case 'wrong':
        return `wrong passcode (${this.failures} failures)`;
      case 'cancelled':
        return 'touch id cancelled';
      case 'unreadable':
        return 'stored passcode unreadable';
      default:
        return null;
    }
  }

  /** Spend the consent for exactly this action, or refuse. */
  consumeConsent(action: GuardedAction): boolean {
    const held = this.consent;
    if (!held) return false;
    if (this.deps.now() - held.at > CONSENT_TTL_MS) {
      this.consent = null;
      return false;
    }
    if (!sameAction(held.action, action)) return false;
    this.consent = null;
    return true;
  }

  async configure(req: LockConfigure): Promise<LockConfigResult> {
    if (req.action === 'enable') {
      if (this.store.has()) return { ok: false, error: 'already-set' };
      if (!passcodeAcceptable(req.passcode)) return { ok: false, error: 'too-short' };
      await this.store.set(req.passcode);
      this.deps.persist({ enabled: true });
      this.deps.note?.('configured: enabled');
      return { ok: true };
    }
    if (!this.store.has()) return { ok: false, error: 'not-set' };
    // every configuration is authorized by the passcode, never by Touch ID:
    // the credential a second enrolled finger defeats must not be able to
    // widen or remove the lock it guards
    if (!this.store.readable() || !(await this.store.verify(req.current))) {
      this.deps.note?.('configure refused: wrong passcode');
      return { ok: false, error: 'wrong' };
    }
    if (req.action === 'verify') return { ok: true };
    if (req.action === 'disable') {
      // the flag and the secret leave together; either outliving the other is
      // a state nothing else in the app could recover from
      this.store.clear();
      this.deps.persist({ enabled: false });
      this.deps.note?.('configured: disabled');
      return { ok: true };
    }
    if (req.action === 'change') {
      if (!passcodeAcceptable(req.next)) return { ok: false, error: 'too-short' };
      await this.store.set(req.next);
      this.deps.note?.('configured: passcode changed');
      return { ok: true };
    }
    if (req.action === 'setTouchId') {
      this.deps.persist({ touchId: req.touchId });
      this.deps.note?.(`configured: touch id ${req.touchId ? 'on' : 'off'}`);
      return { ok: true };
    }
    if (!isGuardGroup(req.group) || typeof req.on !== 'boolean') {
      return { ok: false, error: 'invalid' };
    }
    this.deps.persist({ guard: { [req.group]: req.on } });
    this.deps.note?.(`configured: guard ${req.group} ${req.on ? 'on' : 'off'}`);
    return { ok: true };
  }

  setPending(p: PendingOpen | null): void {
    this.pending = p;
  }

  takePending(): PendingOpen | null {
    const p = this.pending;
    this.pending = null;
    return p;
  }

  private open(): void {
    this.locked = false;
    this.failures = 0;
    this.blockedUntil = 0;
  }
}
