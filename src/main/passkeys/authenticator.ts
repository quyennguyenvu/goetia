import { PASSKEY_CHOOSER_MAX } from '../../shared/passkeys';
import type { ServiceId } from '../../shared/types';
import {
  fromBase64Url,
  toBase64Url,
  type WireCreateOptions,
  type WireCreateResult,
  type WireGetOptions,
  type WireGetResult,
  type WireResult,
} from '../../shared/webauthn';
import { accountLabel } from '../lib/passkey-rules';
import {
  attestationObject,
  authenticatorData,
  clientDataJSON,
  FLAG_AT,
  FLAG_UP,
  FLAG_UV,
  generateKeyPair,
  type KeyPair,
  signAssertion,
} from '../lib/webauthn-crypto';
import {
  hostOfOrigin,
  parseAssertion,
  parseCreation,
  WEBAUTHN_TIMEOUT_MS,
  WebAuthnError,
} from '../lib/webauthn-rules';
import type { PasskeyStore } from './store';

/** The outcome of a consent prompt. `'verified'` = a real user-verification
 *  gesture succeeded (Touch ID); `'presence'` = the user was present and
 *  agreed but nothing verified them (a bare OK button, or picking an account
 *  on a machine without biometrics); `false` = declined. Only `'verified'`
 *  earns the UV flag, the way 1Password/Bitwarden gate it on a real unlock. */
export type Verification = 'verified' | 'presence' | false;

/** Everything the user sees during a ceremony. Electron lives behind this
 *  (prompt.ts); tests hand in fakes. */
export interface PasskeyPrompt {
  confirmCreate(rpId: string, account: string): Promise<Verification>;
  /** `afterChooser`: the user just picked this account, which on a platform
   *  without Touch ID already is the presence confirmation */
  confirmGet(rpId: string, account: string, afterChooser: boolean): Promise<Verification>;
  chooseAccount(rpId: string, accounts: { id: string; label: string }[]): Promise<string | null>;
  noPasskey(rpId: string): Promise<void>;
  capReached(): Promise<void>;
}

export interface CeremonyInput {
  serviceId: ServiceId;
  /** from the sending frame — never the payload */
  origin: string;
  options: unknown;
  /** the sending webContents id: one ceremony in flight per view */
  viewKey: number;
}

interface Deps {
  now(): number;
  keys(): KeyPair;
  log(line: string): void;
  timeoutMs: number;
  /** Silence window after a declined/failed ceremony, per view: a new one
   *  inside it is refused WITHOUT a prompt, so a scripted loop cannot spawn an
   *  endless chain of modal Touch ID / message-box prompts. 0 in tests. */
  cooldownMs: number;
}

/** The ceremony: validate → look up → verify the user → sign. The only code
 *  that decrypts a private key, and only for one signature. */
export class PasskeyAuthenticator {
  private inFlight = new Set<number>();
  /** the live ceremony's token per view — a work() that resolves after its own
   *  timeout (a late Touch ID answer) checks this and refuses to mint or sign */
  private current = new Map<number, symbol>();
  /** when this view's last ceremony was declined/failed — see Deps.cooldownMs */
  private lastDeniedAt = new Map<number, number>();
  private deps: Deps;

  constructor(
    private store: PasskeyStore,
    private prompt: PasskeyPrompt,
    deps: Partial<Deps> = {},
  ) {
    this.deps = {
      now: Date.now,
      keys: generateKeyPair,
      log: (line) => console.log(line),
      timeoutMs: WEBAUTHN_TIMEOUT_MS,
      cooldownMs: 0,
      ...deps,
    };
  }

  create(input: CeremonyInput): Promise<WireResult<WireCreateResult>> {
    return this.run(input.viewKey, (isCurrent) => this.doCreate(input, isCurrent));
  }

  get(input: CeremonyInput): Promise<WireResult<WireGetResult>> {
    return this.run(input.viewKey, (isCurrent) => this.doGet(input, isCurrent));
  }

  /** Stamp a cool-down after a user-visible refusal, so the next scripted call
   *  is turned away silently instead of raising another prompt. */
  private noteDenied(viewKey: number): void {
    this.lastDeniedAt.set(viewKey, this.deps.now());
  }

  /** One in-flight ceremony per view (Chrome does the same), a post-refusal
   *  cool-down, a hard timeout, and every failure flattened to a WebAuthn name
   *  — nothing else leaves. */
  private async run<T>(
    viewKey: number,
    work: (isCurrent: () => boolean) => Promise<T>,
  ): Promise<WireResult<T>> {
    if (this.inFlight.has(viewKey)) return { ok: false, error: 'NotAllowedError' };
    const denied = this.lastDeniedAt.get(viewKey);
    if (denied !== undefined && this.deps.now() - denied < this.deps.cooldownMs) {
      // silent: raising a prompt here is exactly the fatigue this prevents
      return { ok: false, error: 'NotAllowedError' };
    }
    this.inFlight.add(viewKey);
    const token = Symbol('ceremony');
    this.current.set(viewKey, token);
    const isCurrent = () => this.current.get(viewKey) === token;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          // supersede the token so a late-resolving work() cannot commit
          if (this.current.get(viewKey) === token) this.current.delete(viewKey);
          reject(new WebAuthnError('NotAllowedError', 'timed out'));
        }, this.deps.timeoutMs);
      });
      return { ok: true, value: await Promise.race([work(isCurrent), timeout]) };
    } catch (e) {
      return { ok: false, error: e instanceof WebAuthnError ? e.code : 'NotAllowedError' };
    } finally {
      clearTimeout(timer);
      this.inFlight.delete(viewKey);
      if (this.current.get(viewKey) === token) this.current.delete(viewKey);
    }
  }

  private async doCreate(
    { serviceId, origin, options, viewKey }: CeremonyInput,
    isCurrent: () => boolean,
  ): Promise<WireCreateResult> {
    const req = parseCreation(options as WireCreateOptions, hostOfOrigin(origin));
    const held = this.store.forRp(req.rpId);
    if (held.some((p) => req.excludeIds.includes(p.id))) {
      throw new WebAuthnError('InvalidStateError', 'a credential for this account already exists');
    }
    if (this.store.isFull() && !this.store.find(req.rpId, req.userHandle)) {
      await this.prompt.capReached();
      throw new WebAuthnError('NotAllowedError', 'passkey store is full');
    }
    const verified = await this.prompt.confirmCreate(req.rpId, accountLabel(req));
    if (!verified) {
      this.noteDenied(viewKey);
      throw new WebAuthnError('NotAllowedError', 'cancelled');
    }
    if (req.uv === 'required' && verified !== 'verified') {
      throw new WebAuthnError('NotAllowedError', 'user verification unavailable');
    }
    // the ceremony timed out while the prompt was open (a late answer): mint
    // nothing — the page already saw this ceremony fail
    if (!isCurrent()) throw new WebAuthnError('NotAllowedError', 'superseded');
    const keys = this.deps.keys();
    const passkey = this.store.add({
      rpId: req.rpId,
      userHandle: req.userHandle,
      userName: req.userName,
      displayName: req.displayName,
      privateKeyPem: keys.privateKeyPem,
      publicKeyCose: keys.publicKeyCose,
      createdIn: serviceId,
      at: this.deps.now(),
    });
    const credentialId = fromBase64Url(passkey.id) as Uint8Array;
    const uvFlag = verified === 'verified' ? FLAG_UV : 0;
    const authData = authenticatorData(req.rpId, FLAG_UP | uvFlag | FLAG_AT, {
      credentialId,
      publicKeyCose: keys.publicKeyCose,
    });
    const clientData = clientDataJSON('webauthn.create', req.challenge, origin);
    this.deps.log(`[passkey] created rp=${req.rpId} via=${serviceId}`);
    return {
      id: passkey.id,
      clientDataJSON: toBase64Url(clientData),
      attestationObject: toBase64Url(attestationObject(authData)),
      authenticatorData: toBase64Url(authData),
      publicKeySpki: toBase64Url(keys.publicKeySpki),
      credProps: req.wantsCredProps,
    };
  }

  private async doGet(
    { serviceId, origin, options, viewKey }: CeremonyInput,
    isCurrent: () => boolean,
  ): Promise<WireGetResult> {
    const req = parseAssertion(options as WireGetOptions, hostOfOrigin(origin));
    let candidates = this.store.forRp(req.rpId);
    if (req.allowIds.length > 0) candidates = candidates.filter((p) => req.allowIds.includes(p.id));
    if (candidates.length === 0) {
      this.noteDenied(viewKey); // and so a scripted loop cannot re-raise it
      await this.prompt.noPasskey(req.rpId);
      throw new WebAuthnError('NotAllowedError', 'no credential for this relying party');
    }
    let chosen = candidates[0];
    let afterChooser = false;
    if (candidates.length > 1) {
      const recent = [...candidates]
        .sort((a, b) => b.lastUsedAt - a.lastUsedAt)
        .slice(0, PASSKEY_CHOOSER_MAX);
      const id = await this.prompt.chooseAccount(
        req.rpId,
        recent.map((p) => ({ id: p.id, label: accountLabel(p) })),
      );
      const pick = recent.find((p) => p.id === id);
      if (!pick) {
        this.noteDenied(viewKey);
        throw new WebAuthnError('NotAllowedError', 'cancelled');
      }
      chosen = pick;
      afterChooser = true;
    }
    const verified = await this.prompt.confirmGet(req.rpId, accountLabel(chosen), afterChooser);
    if (!verified) {
      this.noteDenied(viewKey);
      throw new WebAuthnError('NotAllowedError', 'cancelled');
    }
    if (req.uv === 'required' && verified !== 'verified') {
      throw new WebAuthnError('NotAllowedError', 'user verification unavailable');
    }
    // a late answer after the ceremony's own timeout must not produce a
    // signature for a ceremony the page already saw fail
    if (!isCurrent()) throw new WebAuthnError('NotAllowedError', 'superseded');
    const pem = this.store.privateKeyPem(chosen.id);
    if (!pem) throw new WebAuthnError('NotAllowedError', 'credential unavailable');
    const uvFlag = verified === 'verified' ? FLAG_UV : 0;
    const authData = authenticatorData(req.rpId, FLAG_UP | uvFlag);
    const clientData = clientDataJSON('webauthn.get', req.challenge, origin);
    const signature = signAssertion(pem, authData, clientData);
    this.store.touch(chosen.id, this.deps.now());
    this.deps.log(`[passkey] asserted rp=${req.rpId} via=${serviceId}`);
    return {
      id: chosen.id,
      clientDataJSON: toBase64Url(clientData),
      authenticatorData: toBase64Url(authData),
      signature: toBase64Url(signature),
      userHandle: chosen.userHandle,
    };
  }
}
