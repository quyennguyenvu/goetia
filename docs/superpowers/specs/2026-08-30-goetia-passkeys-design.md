# Goetia passkeys — design

Date: 2026-08-30. Status: approved (user decision, same day). Scope: replace the WebAuthn block with a Goetia-owned software authenticator so a service's passkey sign-in completes inside the app, on every platform, under the current ad-hoc signature.

## Problem

Since 2026-08-13 every service view hides WebAuthn (`src/preload/lib/webauthn-block.ts`): Electron shipped no platform authenticator, so a passkey-first login (Microsoft's) parked forever on "your device is opening a security window", and an absent API was the honest fix — sites feature-detect it and fall back to a password. The cost is that every sign-in is username, password, second factor and often a captcha, and sites that push passkeys (Microsoft, Google, Meta, Discord, TikTok) push them on every login.

The user wants to sign in with a passkey: after a logout, session expiry or purge, one Touch ID and no typing.

## What Electron 43 can and cannot do (verified 2026-08-30)

- **Electron 42+ ships a macOS Touch ID platform authenticator** — `app.configureWebAuthn({ touchID: { keychainAccessGroup } })` plus the `select-webauthn-account` event (electron/electron#51255). It needs a `keychain-access-groups` entitlement prefixed by an Apple Team ID. Goetia is ad-hoc signed (`identity: '-'`, no Team ID), so the entitlement is not honoured (`errSecMissingEntitlement`). This path costs the Apple Developer Program, the same prerequisite as `docs/superpowers/plans/2026-08-07-code-signing-and-notarization.md`, and its credentials are Secure-Enclave-bound to one Mac.
- **The user's existing passkeys — iCloud Keychain, 1Password, or "scan the QR with your phone" — can never work inside Goetia on macOS.** Apple lets an app assert passkeys for third-party relying parties only under the `com.apple.developer.web-browser.public-key-credential` entitlement it grants to real browsers; the phone/QR hybrid flow lives in `//chrome`, not in Electron. No signing tier changes this. Vault12's `electron-webauthn-mac` only serves domains its developer owns (associated domains).
- **Windows and Linux**: no Electron delegate for `webauthn.dll` or anything else; the hang stays. Roaming keys (YubiKey) half-work through `//device/fido` — no PIN prompt, no discoverable credentials (electron#33353, closed won't-fix) — not a login story.
- **CDP `WebAuthn.addVirtualAuthenticator` through `webContents.debugger`** would work but an attached debugger disables Chromium's background throttling on the view for as long as it is attached — a 24/7 cost the guardrails forbid — and it is the same Goetia-owned model as this design with less control. Rejected.

So any passkey that works in Goetia is a **Goetia-owned passkey**: registered once per site from inside Goetia, confirmed with Touch ID, living in Goetia's profile. That is how 1Password and Bitwarden provide passkeys in Chrome too: they shim `navigator.credentials` in-page and run the ceremony themselves.

## Decisions (user, 2026-08-30)

- **Option 1 — a software authenticator in main, behind a preload shim.** Works with ad-hoc signing on macOS, Windows and Linux; no debugger; no new `webPreferences`, permission grants or partition changes. Electron's native Touch ID authenticator (option 2) is the upgrade path if signing is ever funded: ~20 lines, Secure Enclave keys, macOS only.
- **One store, keyed by rpId, shared across services.** A facebook.com passkey made in Messenger serves Instagram's "Log in with Facebook", the way a browser's passkeys are profile-wide. Safe because main binds every request to the origin of the requesting frame, never to the partition.
- **Passkeys survive purge and banish.** Purge wipes the session; a passkey is a credential, like a saved password, and stays gated by Touch ID. Purge → reopen → one Touch ID → back in. Removal is explicit and per passkey, from Settings.
- **`UV` is set when the confirmation was accepted**, whether that was Touch ID or a click on a machine without it (see Threat model). This is what 1Password and Bitwarden do; the alternative makes Microsoft reject every Windows sign-in.
- **Every credential is discoverable.** That is what makes "sign in without typing a username" work.

## Design

### Architecture

Two halves, mirroring `notification-shim.ts` and `NotificationRouter`: the preload owns the page-facing API, main owns everything that matters — keys, prompts, policy. The page never sees a private key, and main never trusts anything the page says about who it is.

```text
service page ──navigator.credentials.get({publicKey})──▶ preload shim (webauthn-shim.ts)
                                                            │ serialize options (ArrayBuffer → base64url)
                                                            ▼
                                             ipcRenderer.invoke('webauthn:get', { serviceId, options })
                                                            │ gate: ipcSenderAllowed; origin from e.senderFrame.url
                                                            ▼
                                        main: PasskeyAuthenticator (src/main/passkeys/)
                                          rpId ⊆ origin?  → credentials for rpId in PasskeyStore
                                          user verification → Touch ID sheet (or native confirm)
                                          sign(authData ‖ sha256(clientDataJSON)) with the safeStorage-decrypted key
                                                            │ result (base64url fields) or { error: 'NotAllowedError' }
                                                            ▼
                                             shim builds a PublicKeyCredential-shaped object → page
```

### Components

| Unit                                                              | Job                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Depends on                                                              |
| ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `src/preload/lib/webauthn-shim.ts` (replaces `webauthn-block.ts`) | Patches `navigator.credentials.create/get` for `publicKey` requests; leaves `{ password }` autofill alone; overrides the statics sites feature-detect (`isUserVerifyingPlatformAuthenticatorAvailable → true`, `isConditionalMediationAvailable → false`, `parseCreationOptionsFromJSON`, `parseRequestOptionsFromJSON`, `getClientCapabilities`); builds the returned credential with the native `PublicKeyCredential.prototype` as its prototype so `instanceof` checks pass; honours `AbortSignal` | `ipcRenderer.invoke`; the `--goetia-webauthn` argv flag (`on` or `off`) |
| `src/main/lib/webauthn-rules.ts` (pure)                           | `rpIdAllowed(originHost, rpId)`; parse and validate creation/request options; map every failure to the `DOMException` name the page expects                                                                                                                                                                                                                                                                                                                                                           | nothing                                                                 |
| `src/main/lib/cbor.ts` (pure)                                     | Minimal CBOR encoder — maps, byte and text strings, unsigned and negative ints — for the COSE key and the `none` attestation object. No new dependency                                                                                                                                                                                                                                                                                                                                                | nothing                                                                 |
| `src/main/lib/webauthn-crypto.ts` (pure)                          | P-256 key generation, `authenticatorData`, `clientDataJSON`, `attestationObject`, DER ECDSA signature; takes a key codec so tests run without Electron                                                                                                                                                                                                                                                                                                                                                | Node `crypto`, `cbor.ts`                                                |
| `src/main/passkeys/store.ts` — `PasskeyStore`                     | `passkeys.json` via `conf`, the `PinStore` shape; private keys stored as `safeStorage.encryptString` blobs; one record per credential; `PASSKEY_CAP` = 50; forget with one-step restore                                                                                                                                                                                                                                                                                                               | `conf`, `safeStorage`                                                   |
| `src/main/passkeys/authenticator.ts` — `PasskeyAuthenticator`     | The ceremony: validate → look up → verify user → sign. The only code that decrypts a key, and only for the duration of one signature. One in-flight ceremony per view                                                                                                                                                                                                                                                                                                                                 | store, rules, crypto, prompt                                            |
| `src/main/passkeys/prompt.ts`                                     | User verification and account choice: `systemPreferences.promptTouchID` where `canPromptTouchID()`; `dialog.showMessageBox` on the window everywhere else; the account chooser, the "no passkey here yet" notice and the cap notice are message boxes                                                                                                                                                                                                                                                 | `electron`                                                              |
| IPC                                                               | Service invoke channels `webauthn:create` and `webauthn:get`, carrying `serviceId`; shell-only `passkeys:list` (invoke) and `passkeys:forget` / `passkeys:restore` (send)                                                                                                                                                                                                                                                                                                                             | `ipc-handlers.ts`, `shared/ipc.ts`                                      |
| `SettingsView` → Passkeys                                         | List and forget                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | shell preload bridge                                                    |

### Stored record

```ts
interface Passkey {
  id: string // base64url credential id, 32 random bytes
  rpId: string
  userHandle: string // base64url of user.id
  userName: string // clamped
  displayName: string // clamped
  privateKey: string // base64 of safeStorage.encryptString(pkcs8 PEM)
  publicKeyCose: string // base64url, returned unchanged in attestation
  createdIn: ServiceId // display only — never a lookup key
  createdAt: number
  lastUsedAt: number
}
```

`parsePasskeys` drops records with unknown service ids, missing fields or bad base64, the way `parsePins` does; a corrupt file yields defaults (`clearInvalidConfig`). A `create` for an rpId + `userHandle` already held **replaces** the old record: the site asked for a new credential, and a site that wanted to keep the first would have listed it in `excludeCredentials`, which is honoured with `InvalidStateError`. So the chooser never shows duplicates.

### Ceremony — `create`

1. **Validate.** `rp.id` defaults to the origin host; when given it must equal the host or be a dot-suffix of it with at least two labels (`teams.microsoft.com` → `microsoft.com` accepted, `com` refused, `evilmicrosoft.com` refused). Mismatch → `SecurityError`. `pubKeyCredParams` must include ES256 (−7) → else `NotSupportedError`. `authenticatorSelection.authenticatorAttachment === 'cross-platform'` → `NotAllowedError`. Any `excludeCredentials` id held for this rpId → `InvalidStateError`. Store at cap → the cap notice, then `NotAllowedError`.
2. **Verify the user.** Touch ID sheet, or the native confirm. Cancel → `NotAllowedError`.
3. **Mint.** Random 32-byte credential id, P-256 keypair; private key → `safeStorage.encryptString` → store with `user.id`, `user.name`, `user.displayName`.
4. **Return.** `clientDataJSON = { type: 'webauthn.create', challenge, origin, crossOrigin: false }`; `authenticatorData = sha256(rpId) ‖ flags ‖ signCount ‖ AAGUID ‖ credIdLen ‖ credId ‖ COSE(kty EC2, alg ES256, crv P-256, x, y)`; `attestationObject = CBOR{ fmt: 'none', attStmt: {}, authData }`. `credProps.rk = true` when the extension was requested; all other extensions ignored (empty `getClientExtensionResults()`). `getTransports() → ['internal']`, `authenticatorAttachment: 'platform'`, `getPublicKey()` = SPKI DER, `getPublicKeyAlgorithm() → -7`, `getAuthenticatorData()`, `toJSON()` per WebAuthn Level 3.

### Ceremony — `get`

1. **Validate** rpId as above. Candidates = held credentials for rpId, filtered by `allowCredentials` when it is non-empty. Zero → the "no passkey here yet" notice, then `NotAllowedError`, so the page falls to its password path instead of spinning. More than one → account chooser, then verification.
2. **Verify the user.** Touch ID sheet, or the native confirm (with several accounts, choosing one is the confirmation).
3. **Sign.** `authData = sha256(rpId) ‖ flags ‖ signCount`; `signature = ECDSA-SHA256(authData ‖ sha256(clientDataJSON))`, DER-encoded — what ES256 verifiers expect and what Node's `sign` emits. Return `authenticatorData`, `clientDataJSON`, `signature`, `userHandle`. Stamp `lastUsedAt`.

### Constants that are decisions

- **Flags** `UP | UV`, plus `AT` on create. **BE = BS = 0**: not backup-eligible is the truth for a device-bound key.
- **Sign counter always 0**: spec-allowed, what synced passkeys do, and it can never fall "behind" if a profile copy is restored.
- **AAGUID**: one fixed Goetia constant (a random UUID committed in `webauthn-crypto.ts`). Zero is legal; a stable value lets the community AAGUID list name it later.
- **Timeout**: main caps every ceremony at `WEBAUTHN_TIMEOUT_MS` (120 s) regardless of the page's `timeout`, so a dangling prompt cannot hold a pending invoke forever; the Touch ID sheet has its own OS timeout beneath it.
- **Conditional mediation** (Google's autofill hint): advertised unavailable. If a page calls it anyway the promise stays pending until its `AbortSignal` fires (`AbortError`) — a browser with no matching autofill passkey. Sites that use it also render an explicit button, which is our path.
- **Abort**: the shim rejects with `AbortError` on the page's signal; main's result, if it arrives later, is dropped. An open Touch ID sheet cannot be dismissed programmatically and we do not try.
- **One in-flight ceremony per view**: a second concurrent request rejects `NotAllowedError`, as Chrome does. Bounds prompt fatigue from a spamming page.
- **Errors** reach the page as real `DOMException`s with the spec name — `NotAllowedError`, `NotSupportedError`, `InvalidStateError`, `SecurityError`, `AbortError` — because sites branch on `.name`.

### Availability flag

`views.ts` passes `--goetia-webauthn=on` in `additionalArguments` beside `--goetia-service=` when `safeStorage.isEncryptionAvailable()` is true and `GOETIA_WEBAUTHN !== 'off'`; otherwise `off`. With `off` the shim behaves exactly like today's block — `isUserVerifyingPlatformAuthenticatorAvailable → false`, `publicKey` requests reject `NotSupportedError`, `{ password }` passes through — so a Linux box without a keyring gets an honest "no authenticator", never a half-working one. `GOETIA_WEBAUTHN=off` exists for the same reason as `GOETIA_NAV_ENFORCE=off`: to confirm a suspected shim bug against the old behaviour.

### IPC

- `webauthn:create` and `webauthn:get` are **service** invoke channels: not in `SHELL_ONLY_CHANNELS`, payload carries `serviceId`, validated by `ipcSenderAllowed` against the sending view. `registerInvoke` grows a payload parameter and passes `payload.serviceId` through the same gate (today it serves shell-only invokes and passes none). The handler derives the origin from `e.senderFrame.url` — it must be `https:` and the frame must be the view's main frame; the payload carries no origin.
- `passkeys:list` (invoke, returns `PasskeyView[]`: id, rpId, account label, `createdIn`, `createdAt`, `lastUsedAt` — never key material), `passkeys:forget { id }` and `passkeys:restore { id }` (send) are shell-only. The list is fetched when the Passkeys section opens, never broadcast in `ShellState`.

### What the user sees

Every prompt during a ceremony is native — the service page covers the shell, and `showMessageBox` on the window draws over the views.

| Moment                    | macOS with Touch ID                                                                                                                              | Elsewhere (Windows, Linux, Intel Mac without T2)                                                                                     |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| Create                    | Touch ID sheet: _"Goetia" is trying to create a passkey for microsoft.com_                                                                       | **Create a Goetia passkey for microsoft.com?** _account · You'll sign in here with a click instead of a password._ [Create] [Cancel] |
| Sign in, one account      | _"Goetia" is trying to sign in to microsoft.com_                                                                                                 | **Sign in to microsoft.com as account?** [Sign in] [Cancel]                                                                          |
| Sign in, several accounts | Chooser (one button per account, at most 4, plus Cancel), then the Touch ID sheet                                                                | Chooser only — picking the account is the confirmation                                                                               |
| No passkey here yet       | **No Goetia passkey for microsoft.com on this Mac yet.** _Sign in with your password; when the site offers to create a passkey, accept it._ [OK] | same                                                                                                                                 |
| Cap reached               | **Goetia already holds 50 passkeys.** _Forget one in Settings → Passkeys to add another._ [OK]                                                   | same                                                                                                                                 |

More than four accounts for one rpId: the chooser lists the four most recently used; the row's hint in Settings says the rest are reachable by forgetting stale ones. Not expected in practice.

**Settings → Passkeys** (new section beside Services and Shortcuts in `SettingsView`):

- One row per passkey: site (rpId), account (`displayName`, else `userName`), the service tile it was created in, created and last-used dates.
- **Forget** per row — no confirm dialog; a self-dismissing toast with **Undo** (the `PinToast` / `pins:restore` pattern). Undo re-inserts the same encrypted record; after the toast expires the record is gone and the site still lists a dead "Goetia" passkey the user can remove from its own security page — the row's hint says so.
- Empty state: _No passkeys yet. Sign in to a service with your password — when it offers to create a passkey, accept it and Goetia keeps it here._
- No "forget all": fifty clicks is the worst case, and a sweep is exactly the destructive shortcut purge already taught us to gate behind an acknowledgement.

**Purge**: mechanics unchanged; `PurgeConfirm` and the Settings → Services purge row gain one line: _Goetia passkeys are kept — forget them in Settings → Passkeys._

### Not in this design

- The **contained window** and **call windows** have no preload, so a passkey-first page there keeps raw Chromium behaviour (the hang). Already the case today, since the block never reached them either; `contextIsolation: true` also means a preload could not patch the page's `navigator`. Follow-up, not this spec.
- A **Goetia PIN** for machines without Touch ID, **encrypted export/import** of passkeys, and **hardware security keys** are all bounded follow-ups if ever missed.
- Electron's native Touch ID authenticator (`app.configureWebAuthn`) once signing is funded.

## Threat model

Four weaknesses of the new credential, and what does and does not close them. None widens _reach_: whoever could exploit them — same-user malware, someone at the unlocked machine — can already take the session cookies today. The one behaviour that gets weaker is purge on a machine without Touch ID.

1. **Click-as-verification without Touch ID.** On Windows, Linux and Intel Macs without T2, "user verification" is a button on an unlocked machine, yet we set `UV`. Setting `UV` only for a real biometric would make Microsoft (`userVerification: 'required'`) reject every Windows sign-in; 1Password and Bitwarden count "unlocked vault + click" as verification, and our unlocked OS session is the equivalent boundary. Cost: after a purge or session expiry, someone at the unlocked machine can re-establish the login without the password.
2. **Keys at rest are exportable.** `safeStorage` encrypts with a key in the login Keychain (DPAPI on Windows, libsecret on Linux); any process running as the user can decrypt, so user-level malware could lift the passkeys and hold access that, unlike a stolen cookie, never expires. Secure Enclave keys (option 2) cannot be extracted — the one security gain paying for signing would buy. A copied profile folder yields nothing on another machine: the encryption key stays in the original Keychain (which also means no migration).
3. **No clone detection.** Sign counter 0 means a relying party can never notice a copied key used from two places. Synced passkeys behave the same, so RPs do not rely on it.
4. **rpId without a public-suffix list.** A page on `foo.co.uk` could claim rpId `co.uk`. Irrelevant while every host a view can reach is in `ALLOWED_HOSTS` and none sits under a multi-label public suffix — so "Adding a service" gains a rule: never list a host under a shared suffix (`*.github.io`, `*.co.uk`) without adding a PSL check first.

What is not a weakness: the shim lives in the unisolated renderer, but all it can do is ask. A hostile page can only request rpIds under the origin main reads from `senderFrame.url`, so Instagram cannot trigger a facebook.com ceremony unless it genuinely navigated to facebook.com — which is why one store shared across partitions is safe. Private keys never leave main; the shim receives only the signature.

## Testing

### Unit (vitest, pure, no Electron)

- `cbor.test.ts` — RFC 8949 vectors for ints, byte and text strings, maps; the exact COSE key layout.
- `webauthn-rules.test.ts` — rpId table (host, dot-suffix, single label, unrelated, lookalike); ES256 missing → `NotSupportedError`; `cross-platform` → `NotAllowedError`; `excludeCredentials` hit → `InvalidStateError`; timeout clamp.
- `webauthn-crypto.test.ts` — the oracle: create → decode `attestationObject` → parse `authData` (rpIdHash, flag bits, AAGUID, credId) → lift the COSE key into a JWK → **verify an assertion signature with Node `crypto.verify`**; `clientDataJSON` fields; `toJSON` shape.
- `passkey-store.test.ts` — with an injected codec: replace on same `userHandle`, cap, forget and restore, corrupt file → defaults, unknown fields dropped, unknown service id dropped.
- `passkey-authenticator.test.ts` — with fake prompt and store: no credential → notice then `NotAllowedError`; cancel → `NotAllowedError`; chooser only when more than one; `allowCredentials` filtering; one in-flight per view; `lastUsedAt` stamped; a decrypt failure surfaces only as `NotAllowedError`.
- `webauthn-shim.test.ts` (jsdom, fake `ipcRenderer.invoke`) — `publicKey` routed, `{ password }` passes through, result `instanceof` the native `PublicKeyCredential`, statics, ArrayBuffer round-trip, `AbortSignal` → `AbortError`, conditional mediation pending until abort, `--goetia-webauthn=off` → today's block behaviour. `webauthn-block.test.ts` is deleted with the shim it tested.
- `ipc-sender-policy.test.ts` — `webauthn:*` are service channels validated on `serviceId`; `passkeys:*` are shell-only.

### E2E

`passkeys.spec.ts`: a service view runs `navigator.credentials.create` then `get` via `executeJavaScript`, and the test verifies the returned signature against the attested key. The prompt is bypassed with `GOETIA_WEBAUTHN_PROMPT=accept`, honoured only when `!app.isPackaged` — same family as `GOETIA_NAV_ENFORCE=off`; a packaged build ignores it.

### Live checklist

A driven build with real logins — a prior claim is not evidence. Teams (Microsoft, `UV` required), Messenger (Meta), Discord, and one "Sign in with Google" redirect (TikTok or Slack). For each: register from the post-login offer, sign out, sign back in with only Touch ID, purge, sign in again. Expected log lines `[passkey] created rp=… via=<service>` and `[passkey] asserted rp=…`; any verifier-side rejection is recorded here as a finding.

## Rollout

- Ships as v0.12.0. Release notes say plainly what works (a Goetia passkey confirmed with Touch ID, on every platform, surviving purge) and what does not (existing iCloud / 1Password passkeys, phone QR, Windows Hello) and why.
- `DEVELOPING.md`'s "passkeys can never work" note and the CLAUDE.md guardrails are rewritten to the new truth; the Teams spec's passkey paragraph gets a pointer here; README gains a Passkeys line.
- Definition of done: `lint`, `typecheck`, `test`, `e2e` green; `package:mac` launches; the live checklist done.
