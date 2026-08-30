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

/** Everything the user sees during a ceremony. Electron lives behind this
 *  (prompt.ts); tests hand in fakes. */
export interface PasskeyPrompt {
  confirmCreate(rpId: string, account: string): Promise<boolean>;
  /** `afterChooser`: the user just picked this account, which on a platform
   *  without Touch ID already is the confirmation */
  confirmGet(rpId: string, account: string, afterChooser: boolean): Promise<boolean>;
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
}

/** The ceremony: validate → look up → verify the user → sign. The only code
 *  that decrypts a private key, and only for one signature. */
export class PasskeyAuthenticator {
  private inFlight = new Set<number>();
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
      ...deps,
    };
  }

  create(input: CeremonyInput): Promise<WireResult<WireCreateResult>> {
    return this.run(input.viewKey, () => this.doCreate(input));
  }

  get(input: CeremonyInput): Promise<WireResult<WireGetResult>> {
    return this.run(input.viewKey, () => this.doGet(input));
  }

  /** One in-flight ceremony per view (Chrome does the same), a hard timeout,
   *  and every failure flattened to a WebAuthn name — nothing else leaves. */
  private async run<T>(viewKey: number, work: () => Promise<T>): Promise<WireResult<T>> {
    if (this.inFlight.has(viewKey)) return { ok: false, error: 'NotAllowedError' };
    this.inFlight.add(viewKey);
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new WebAuthnError('NotAllowedError', 'timed out')),
          this.deps.timeoutMs,
        );
      });
      return { ok: true, value: await Promise.race([work(), timeout]) };
    } catch (e) {
      return { ok: false, error: e instanceof WebAuthnError ? e.code : 'NotAllowedError' };
    } finally {
      clearTimeout(timer);
      this.inFlight.delete(viewKey);
    }
  }

  private async doCreate({ serviceId, origin, options }: CeremonyInput): Promise<WireCreateResult> {
    const req = parseCreation(options as WireCreateOptions, hostOfOrigin(origin));
    const held = this.store.forRp(req.rpId);
    if (held.some((p) => req.excludeIds.includes(p.id))) {
      throw new WebAuthnError('InvalidStateError', 'a credential for this account already exists');
    }
    if (this.store.isFull() && !this.store.find(req.rpId, req.userHandle)) {
      await this.prompt.capReached();
      throw new WebAuthnError('NotAllowedError', 'passkey store is full');
    }
    if (!(await this.prompt.confirmCreate(req.rpId, accountLabel(req)))) {
      throw new WebAuthnError('NotAllowedError', 'cancelled');
    }
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
    const authData = authenticatorData(req.rpId, FLAG_UP | FLAG_UV | FLAG_AT, {
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

  private async doGet({ serviceId, origin, options }: CeremonyInput): Promise<WireGetResult> {
    const req = parseAssertion(options as WireGetOptions, hostOfOrigin(origin));
    let candidates = this.store.forRp(req.rpId);
    if (req.allowIds.length > 0) candidates = candidates.filter((p) => req.allowIds.includes(p.id));
    if (candidates.length === 0) {
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
      if (!pick) throw new WebAuthnError('NotAllowedError', 'cancelled');
      chosen = pick;
      afterChooser = true;
    }
    if (!(await this.prompt.confirmGet(req.rpId, accountLabel(chosen), afterChooser))) {
      throw new WebAuthnError('NotAllowedError', 'cancelled');
    }
    const pem = this.store.privateKeyPem(chosen.id);
    if (!pem) throw new WebAuthnError('NotAllowedError', 'credential unavailable');
    const authData = authenticatorData(req.rpId, FLAG_UP | FLAG_UV);
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
