import { randomBytes } from 'node:crypto';
import Conf from 'conf';
import { PASSKEY_CAP } from '../../shared/passkeys';
import { SERVICES } from '../../shared/services';
import type { PasskeyView, ServiceId } from '../../shared/types';
import { toBase64Url } from '../../shared/webauthn';
import { type Passkey, parsePasskeys, passkeyViews } from '../lib/passkey-rules';

/** Encrypts private keys at rest. Main hands in safeStorage; tests hand in
 *  something reversible, so the store itself never imports electron. */
export interface KeyCodec {
  encrypt(plain: string): string;
  decrypt(cipher: string): string;
}

interface PasskeysFile {
  credentials: Passkey[];
}

/** Goetia's passkeys: one record per discoverable credential, keyed by rpId
 *  across services (a facebook.com passkey serves Messenger and Instagram's
 *  "Log in with Facebook"). Persisted to <cwd>/passkeys.json with the private
 *  key encrypted; survives purge and banish — removal is explicit, from
 *  Settings. One atomic write per mutation, like PinStore. */
export class PasskeyStore {
  private conf: Conf<PasskeysFile>;
  private list: Passkey[];
  private lastRemoved: { passkey: Passkey; index: number } | null = null;

  constructor(
    cwd: string,
    private codec: KeyCodec,
  ) {
    this.conf = new Conf<PasskeysFile>({
      cwd,
      configName: 'passkeys',
      defaults: { credentials: [] },
      clearInvalidConfig: true,
    });
    this.list = parsePasskeys(this.conf.store.credentials, new Set(SERVICES.map((s) => s.id)));
  }

  all(): readonly Passkey[] {
    return this.list;
  }

  get(id: string): Passkey | undefined {
    return this.list.find((p) => p.id === id);
  }

  forRp(rpId: string): Passkey[] {
    return this.list.filter((p) => p.rpId === rpId);
  }

  find(rpId: string, userHandle: string): Passkey | undefined {
    return this.list.find((p) => p.rpId === rpId && p.userHandle === userHandle);
  }

  isFull(): boolean {
    return this.list.length >= PASSKEY_CAP;
  }

  /** A second registration for the same rpId + userHandle replaces the first:
   *  the site asked for a new credential, and one that wanted the old kept
   *  would have listed it in excludeCredentials. */
  add(input: {
    rpId: string;
    userHandle: string;
    userName: string;
    displayName: string;
    privateKeyPem: string;
    publicKeyCose: Uint8Array;
    createdIn: ServiceId;
    at: number;
  }): Passkey {
    const passkey: Passkey = {
      id: toBase64Url(randomBytes(32)),
      rpId: input.rpId,
      userHandle: input.userHandle,
      userName: input.userName,
      displayName: input.displayName,
      privateKey: this.codec.encrypt(input.privateKeyPem),
      publicKeyCose: toBase64Url(input.publicKeyCose),
      createdIn: input.createdIn,
      createdAt: input.at,
      lastUsedAt: input.at,
    };
    this.list = [
      ...this.list.filter((p) => !(p.rpId === input.rpId && p.userHandle === input.userHandle)),
      passkey,
    ];
    this.save();
    return passkey;
  }

  /** Null when unknown or undecryptable (keychain denied) — the caller turns
   *  that into NotAllowedError; a key never surfaces through a throw. */
  privateKeyPem(id: string): string | null {
    const p = this.get(id);
    if (!p) return null;
    try {
      return this.codec.decrypt(p.privateKey);
    } catch {
      return null;
    }
  }

  touch(id: string, at: number): void {
    if (!this.get(id)) return;
    this.list = this.list.map((p) => (p.id === id ? { ...p, lastUsedAt: at } : p));
    this.save();
  }

  forget(id: string): boolean {
    const index = this.list.findIndex((p) => p.id === id);
    if (index === -1) return false;
    this.lastRemoved = { passkey: this.list[index], index };
    this.list = this.list.filter((p) => p.id !== id);
    this.save();
    return true;
  }

  /** Undo the last forget, back at its old position (clamped to the end). */
  restore(id: string): boolean {
    const last = this.lastRemoved;
    if (!last || last.passkey.id !== id || this.isFull()) return false;
    const next = [...this.list];
    next.splice(Math.min(last.index, next.length), 0, last.passkey);
    this.list = next;
    this.lastRemoved = null;
    this.save();
    return true;
  }

  views(): PasskeyView[] {
    return passkeyViews(this.list);
  }

  private save(): void {
    this.conf.store = { credentials: this.list };
  }
}
