# Goetia Passkeys Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the WebAuthn block in every service view with a Goetia-owned software authenticator so a site's passkey sign-in completes inside the app — Touch ID on a Mac, a native confirm elsewhere — under the current ad-hoc signature.

**Architecture:** The unisolated service preload shims `navigator.credentials.create/get` for `publicKey` requests and forwards them over two `serviceId`-validated invoke channels; main owns the ceremony (`PasskeyAuthenticator`), the encrypted store (`PasskeyStore`, `passkeys.json`, keys under `safeStorage`) and every prompt. Main derives the origin from `e.senderFrame.url`, never the payload; the page only ever receives a signature. Spec: `docs/superpowers/specs/2026-08-30-goetia-passkeys-design.md`.

**Tech Stack:** Electron 43, TypeScript, Node `crypto` (P-256 / ES256), `conf`, vitest (+ happy-dom for the shim), Playwright e2e, React 19 renderer.

## Global Constraints

- Definition of done for every task: `corepack pnpm lint`, `corepack pnpm typecheck`, `corepack pnpm test` green. Task 10 adds `corepack pnpm e2e` (run it as `env -u ELECTRON_RUN_AS_NODE corepack pnpm e2e` from a VS Code shell).
- **Commits are the user's.** A "Commit" step means: stop and ask the user to run `/grimoire-core:commit`, offering the suggested message. Never run `git commit`, never write `GRIMOIRE_COMMIT_MSG.txt`, never add a Co-Authored-By trailer.
- `src/shared/**` imports neither `electron` nor DOM types — it bundles into both main and the sandboxed shell preload.
- Pure decision logic lives in `src/main/lib/*` with a vitest unit test; `views.ts`, `index.ts`, `ipc-handlers.ts` stay thin wiring.
- Every new IPC channel is classified: shell-only → `SHELL_ONLY_CHANNELS`; service channel → carries `serviceId`. Every `ipcMain` registration goes through `register()` / `registerInvoke()`.
- Any timer added is cleared on every exit path (`WEBAUTHN_TIMEOUT_MS` = 120000).
- Comments explain *why*, one short line where possible; no section banners or changelog notes.
- Markdown edits pass `npx --yes markdownlint-cli2 <file>`; prose is never hard-wrapped (MD013 is off in `.markdownlint-cli2.jsonc`).
- Copy is verbatim from the spec: prompt reasons `create a passkey for <rpId>` / `sign in to <rpId>`; `PASSKEY_CAP` = 50; chooser shows at most 4 accounts; flags `UP | UV` (+ `AT` on create), `BE = BS = 0`, sign counter 0, attestation `none`, `getTransports() → ['internal']`, `authenticatorAttachment: 'platform'`.
- Log lines: `[passkey] created rp=<rpId> via=<serviceId>` and `[passkey] asserted rp=<rpId> via=<serviceId>`.

---

## File structure

| File | Responsibility |
| --- | --- |
| `src/shared/webauthn.ts` (new) | Wire types between shim and main; `WebAuthnErrorName`; base64url helpers (no Buffer, no DOM types beyond `atob`/`btoa`) |
| `src/shared/passkeys.ts` (new) | `PASSKEY_CAP`, `PASSKEY_TEXT_MAX`, `PASSKEY_CHOOSER_MAX` |
| `src/shared/types.ts` (modify) | `PasskeyView` |
| `src/shared/ipc.ts` (modify) | `webauthn:create` / `webauthn:get` (service invokes with payload); `passkeys:list` / `passkeys:forget` / `passkeys:restore` (shell-only invokes) |
| `src/shared/purge-copy.ts` (modify) | the "passkeys are kept" sentence |
| `src/main/lib/cbor.ts` (new) | Canonical CBOR encoder |
| `src/main/lib/webauthn-rules.ts` (new) | `WebAuthnError`, `rpIdAllowed`, `parseCreation`, `parseAssertion`, `hostOfOrigin`, `WEBAUTHN_TIMEOUT_MS` |
| `src/main/lib/webauthn-crypto.ts` (new) | Keys, `authenticatorData`, `clientDataJSON`, `attestationObject`, `signAssertion`, `GOETIA_AAGUID`, flags |
| `src/main/lib/passkey-rules.ts` (new) | `Passkey` record, `parsePasskeys`, `passkeyViews`, `accountLabel` |
| `src/main/passkeys/store.ts` (new) | `PasskeyStore` over `conf` with an injected `KeyCodec` |
| `src/main/passkeys/codec.ts` (new) | `safeStorageCodec()` — the only electron import on the store side |
| `src/main/passkeys/authenticator.ts` (new) | `PasskeyAuthenticator`, `PasskeyPrompt` interface |
| `src/main/passkeys/prompt.ts` (new) | `electronPrompt(win)` — Touch ID / message boxes / e2e auto-accept |
| `src/main/ipc-handlers.ts` (modify) | `registerInvoke` with payload; the five handlers; `passkeys` + `passkeyStore` on `AppContext` |
| `src/main/views.ts` (modify) | the `--goetia-webauthn` flag (`on` or `off`) in `additionalArguments` |
| `src/main/index.ts` (modify) | construct store + authenticator |
| `src/preload/lib/webauthn-shim.ts` (new; `webauthn-block.ts` deleted) | page-facing API |
| `src/preload/service.ts` (modify) | install the shim |
| `src/preload/shell.ts` (modify) | `invoke(channel, payload?)` |
| `src/renderer/src/components/PasskeysPane.tsx` (new) | rows, Forget, Undo toast |
| `src/renderer/src/components/SettingsView.tsx` (modify) | the Passkeys section |
| `tests/unit/*.test.ts`, `tests/e2e/passkeys.spec.ts` | see tasks |
| `docs/DEVELOPING.md`, `CLAUDE.md`, `README.md`, Teams spec | truth update |

---

### Task 1: Shared wire types, base64url, and the CBOR encoder

**Files:**

- Create: `src/shared/webauthn.ts`
- Create: `src/shared/passkeys.ts`
- Create: `src/main/lib/cbor.ts`
- Test: `tests/unit/base64url.test.ts`, `tests/unit/cbor.test.ts`

**Interfaces:**

- Produces: `toBase64Url(bytes: Uint8Array): string`, `fromBase64Url(text: string): Uint8Array | null`, `WebAuthnErrorName`, `WireCreateOptions`, `WireGetOptions`, `WireCreateResult`, `WireGetResult`, `WireResult<T>`, `encodeCbor(value: CborValue): Uint8Array`, `PASSKEY_CAP = 50`, `PASSKEY_TEXT_MAX = 120`, `PASSKEY_CHOOSER_MAX = 4`.

- [x] **Step 1: Write the failing tests**

`tests/unit/base64url.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { fromBase64Url, toBase64Url } from '../../src/shared/webauthn';

describe('base64url', () => {
  it('round-trips bytes without padding', () => {
    const bytes = Uint8Array.from([0, 1, 2, 250, 251, 252, 253, 254, 255]);
    const text = toBase64Url(bytes);
    expect(text).not.toMatch(/[+/=]/);
    expect(fromBase64Url(text)).toEqual(bytes);
  });

  it('encodes the empty array as the empty string', () => {
    expect(toBase64Url(new Uint8Array())).toBe('');
    expect(fromBase64Url('')).toEqual(new Uint8Array());
  });

  it('refuses text outside the alphabet instead of throwing', () => {
    expect(fromBase64Url('ab+c')).toBeNull();
    expect(fromBase64Url('ab=')).toBeNull();
    expect(fromBase64Url('a b')).toBeNull();
  });
});
```

`tests/unit/cbor.test.ts` (vectors from RFC 8949 Appendix A):

```ts
import { describe, expect, it } from 'vitest';
import { type CborValue, encodeCbor } from '../../src/main/lib/cbor';

const hex = (bytes: Uint8Array) => Buffer.from(bytes).toString('hex');

describe('encodeCbor', () => {
  it('encodes unsigned integers across the size breaks', () => {
    expect(hex(encodeCbor(0))).toBe('00');
    expect(hex(encodeCbor(23))).toBe('17');
    expect(hex(encodeCbor(24))).toBe('1818');
    expect(hex(encodeCbor(100))).toBe('1864');
    expect(hex(encodeCbor(1000))).toBe('1903e8');
    expect(hex(encodeCbor(1_000_000))).toBe('1a000f4240');
  });

  it('encodes negative integers', () => {
    expect(hex(encodeCbor(-1))).toBe('20');
    expect(hex(encodeCbor(-10))).toBe('29');
    expect(hex(encodeCbor(-100))).toBe('3863');
    expect(hex(encodeCbor(-7))).toBe('26'); // ES256, the one COSE needs
  });

  it('encodes byte and text strings', () => {
    expect(hex(encodeCbor(Uint8Array.from([1, 2, 3, 4])))).toBe('4401020304');
    expect(hex(encodeCbor('a'))).toBe('6161');
    expect(hex(encodeCbor('IETF'))).toBe('6449455446');
    expect(hex(encodeCbor('ü'))).toBe('62c3bc');
  });

  it('encodes arrays and maps', () => {
    expect(hex(encodeCbor([1, 2, 3]))).toBe('83010203');
    expect(hex(encodeCbor(new Map<number | string, number>([[1, 2], [3, 4]])))).toBe('a201020304');
    expect(hex(encodeCbor(new Map<number | string, CborValue>([['a', 1], ['b', [2, 3]]])))).toBe('a26161016162820203');
  });

  it('orders map keys canonically — shorter encodings first, then bytewise', () => {
    // COSE_Key labels: 1, 3, -1, -2, -3 encode as 01 03 20 21 22 whatever the insertion order
    const cose = new Map<number | string, number>([[-3, 0], [3, -7], [-1, 1], [1, 2], [-2, 0]]);
    expect(hex(encodeCbor(cose))).toBe('a501020326200121002200');
    // attestation keys: "fmt" (3) < "attStmt" (7) < "authData" (8)
    const att = new Map<number | string, CborValue>([['authData', 0], ['fmt', 'none'], ['attStmt', new Map()]]);
    expect(hex(encodeCbor(att))).toBe('a363666d74646e6f6e656761747453746d74a068617574684461746100');
  });

  it('rejects what an authenticator never emits', () => {
    expect(() => encodeCbor(1.5 as never)).toThrow(RangeError);
    expect(() => encodeCbor(2 ** 32 as never)).toThrow(RangeError);
  });
});
```

- [x] **Step 2: Run the tests to verify they fail**

Run: `corepack pnpm vitest run tests/unit/base64url.test.ts tests/unit/cbor.test.ts`
Expected: FAIL — `Cannot find module '../../src/shared/webauthn'` and `'../../src/main/lib/cbor'`.

- [x] **Step 3: Write `src/shared/passkeys.ts`**

```ts
/** The passkey store's limits. Shared: main enforces them, the renderer and
 *  the prompts quote them. */
export const PASSKEY_CAP = 50;
/** account names and display names are clamped to one row */
export const PASSKEY_TEXT_MAX = 120;
/** the account chooser lists this many, most recently used first */
export const PASSKEY_CHOOSER_MAX = 4;
```

- [x] **Step 4: Write `src/shared/webauthn.ts`**

```ts
/** Wire shapes between the service preload's WebAuthn shim and main's
 *  authenticator. Process-agnostic: every BufferSource travels as base64url,
 *  which is also what WebAuthn's own JSON serialization uses. */

/** DOMException names a page branches on; the shim rebuilds the exception. */
export type WebAuthnErrorName =
  | 'NotAllowedError'
  | 'NotSupportedError'
  | 'InvalidStateError'
  | 'SecurityError';

export interface WireDescriptor {
  type: string;
  id: string;
  transports?: string[];
}

export interface WireCreateOptions {
  rp: { id?: string; name?: string };
  user: { id: string; name: string; displayName: string };
  challenge: string;
  pubKeyCredParams: { type: string; alg: number }[];
  excludeCredentials?: WireDescriptor[];
  authenticatorSelection?: {
    authenticatorAttachment?: string;
    residentKey?: string;
    requireResidentKey?: boolean;
    userVerification?: string;
  };
  extensions?: { credProps?: boolean };
}

export interface WireGetOptions {
  rpId?: string;
  challenge: string;
  allowCredentials?: WireDescriptor[];
  userVerification?: string;
}

export interface WireCreateResult {
  id: string;
  clientDataJSON: string;
  attestationObject: string;
  authenticatorData: string;
  publicKeySpki: string;
  /** whether the page asked for credProps — the shim answers `{ rk: true }` */
  credProps: boolean;
}

export interface WireGetResult {
  id: string;
  clientDataJSON: string;
  authenticatorData: string;
  signature: string;
  userHandle: string;
}

export type WireResult<T> = { ok: true; value: T } | { ok: false; error: WebAuthnErrorName };

export function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Null on anything outside the unpadded base64url alphabet — the caller
 *  maps that to the WebAuthn error it needs rather than catching. */
export function fromBase64Url(text: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]*$/.test(text)) return null;
  const padded = text.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (text.length % 4)) % 4);
  try {
    return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}
```

- [x] **Step 5: Write `src/main/lib/cbor.ts`**

```ts
/** The slice of CBOR (RFC 8949) an authenticator emits: unsigned and negative
 *  integers, byte and text strings, arrays, and maps in CTAP2 canonical key
 *  order (shorter encoded key first, then bytewise). Floats, tags and
 *  indefinite lengths never occur in a COSE key or a `none` attestation, so
 *  they throw rather than encode wrongly. */
export type CborValue =
  | number
  | string
  | boolean
  | null
  | Uint8Array
  | CborValue[]
  | Map<number | string, CborValue>;

export function encodeCbor(value: CborValue): Uint8Array {
  if (typeof value === 'number') {
    if (!Number.isInteger(value)) throw new RangeError('cbor: floats are not supported');
    return value >= 0 ? head(0, value) : head(1, -1 - value);
  }
  if (typeof value === 'string') {
    const bytes = new TextEncoder().encode(value);
    return concat([head(3, bytes.length), bytes]);
  }
  if (typeof value === 'boolean') return Uint8Array.of(value ? 0xf5 : 0xf4);
  if (value === null) return Uint8Array.of(0xf6);
  if (value instanceof Uint8Array) return concat([head(2, value.length), value]);
  if (Array.isArray(value)) return concat([head(4, value.length), ...value.map(encodeCbor)]);
  const entries = [...value.entries()].map(([k, v]) => ({ key: encodeCbor(k), value: encodeCbor(v) }));
  entries.sort((a, b) => a.key.length - b.key.length || compareBytes(a.key, b.key));
  return concat([head(5, entries.length), ...entries.flatMap((e) => [e.key, e.value])]);
}

function head(major: number, n: number): Uint8Array {
  const m = major << 5;
  if (n < 24) return Uint8Array.of(m | n);
  if (n < 0x100) return Uint8Array.of(m | 24, n);
  if (n < 0x10000) return Uint8Array.of(m | 25, n >> 8, n & 0xff);
  if (n < 0x1_0000_0000) {
    return Uint8Array.of(m | 26, (n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff);
  }
  throw new RangeError('cbor: integer too large');
}

function compareBytes(a: Uint8Array, b: Uint8Array): number {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] - b[i];
  return 0;
}

export function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}
```

- [x] **Step 6: Run the tests to verify they pass**

Run: `corepack pnpm vitest run tests/unit/base64url.test.ts tests/unit/cbor.test.ts`
Expected: PASS (2 files).

- [x] **Step 7: Lint and typecheck**

Run: `corepack pnpm lint && corepack pnpm typecheck`
Expected: no findings.

- [ ] **Step 8: Commit**

Ask the user to run `/grimoire-core:commit`. Suggested message: `feat(passkeys): add WebAuthn wire types, base64url and a canonical CBOR encoder`.

---

### Task 2: WebAuthn request rules

**Files:**

- Create: `src/main/lib/webauthn-rules.ts`
- Test: `tests/unit/webauthn-rules.test.ts`

**Interfaces:**

- Consumes: `WireCreateOptions`, `WireGetOptions`, `WebAuthnErrorName`, `fromBase64Url` (Task 1); `clampText` from `src/main/lib/pin-rules.ts`; `PASSKEY_TEXT_MAX`.
- Produces: `class WebAuthnError extends Error { code: WebAuthnErrorName }`, `WEBAUTHN_TIMEOUT_MS = 120_000`, `ES256 = -7`, `rpIdAllowed(originHost, rpId): boolean`, `hostOfOrigin(origin: string): string` (throws `SecurityError` unless `https:`), `parseCreation(raw, originHost): CreationRequest`, `parseAssertion(raw, originHost): AssertionRequest`.

- [x] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import {
  hostOfOrigin,
  parseAssertion,
  parseCreation,
  rpIdAllowed,
  WebAuthnError,
} from '../../src/main/lib/webauthn-rules';

const challenge = 'Y2hhbGxlbmdl'; // "challenge"
const create = (over: Record<string, unknown> = {}) => ({
  rp: { id: 'microsoft.com', name: 'Microsoft' },
  user: { id: 'dXNlci0x', name: 'quyen@example.com', displayName: 'Quyen' },
  challenge,
  pubKeyCredParams: [{ type: 'public-key', alg: -7 }],
  ...over,
});

const code = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    return e instanceof WebAuthnError ? e.code : `not a WebAuthnError: ${String(e)}`;
  }
  return 'no throw';
};

describe('rpIdAllowed', () => {
  it.each([
    ['teams.microsoft.com', 'teams.microsoft.com', true],
    ['teams.microsoft.com', 'microsoft.com', true],
    ['login.microsoftonline.com', 'microsoftonline.com', true],
    ['teams.microsoft.com', 'com', false], // single label
    ['teams.microsoft.com', 'evilmicrosoft.com', false], // suffix, not a label boundary
    ['teams.microsoft.com', 'google.com', false],
    ['microsoft.com', 'teams.microsoft.com', false], // rpId may not be a subdomain
    ['teams.microsoft.com', '', false],
    ['Teams.Microsoft.com', 'microsoft.COM', true], // hosts are case-insensitive
  ])('%s claiming %s → %s', (host, rpId, ok) => {
    expect(rpIdAllowed(host, rpId)).toBe(ok);
  });
});

describe('hostOfOrigin', () => {
  it('returns the lower-cased host of an https origin', () => {
    expect(hostOfOrigin('https://Teams.Microsoft.com')).toBe('teams.microsoft.com');
  });
  it('refuses anything but https as SecurityError', () => {
    expect(code(() => hostOfOrigin('http://teams.microsoft.com'))).toBe('SecurityError');
    expect(code(() => hostOfOrigin('about:blank'))).toBe('SecurityError');
    expect(code(() => hostOfOrigin('not a url'))).toBe('SecurityError');
  });
});

describe('parseCreation', () => {
  it('reads the request and defaults rpId to the host', () => {
    const req = parseCreation(create({ rp: { name: 'x' } }), 'teams.microsoft.com');
    expect(req.rpId).toBe('teams.microsoft.com');
    expect(req.challenge).toBe(challenge);
    expect(req.userHandle).toBe('dXNlci0x');
    expect(req.userName).toBe('quyen@example.com');
    expect(req.displayName).toBe('Quyen');
    expect(req.excludeIds).toEqual([]);
    expect(req.wantsCredProps).toBe(false);
  });

  it('accepts a registrable-suffix rpId and rejects others as SecurityError', () => {
    expect(parseCreation(create(), 'teams.microsoft.com').rpId).toBe('microsoft.com');
    expect(code(() => parseCreation(create(), 'accounts.google.com'))).toBe('SecurityError');
  });

  it('requires ES256 unless the list is empty (spec: empty means any)', () => {
    expect(code(() => parseCreation(create({ pubKeyCredParams: [{ type: 'public-key', alg: -257 }] }), 'teams.microsoft.com'))).toBe(
      'NotSupportedError',
    );
    expect(parseCreation(create({ pubKeyCredParams: [] }), 'teams.microsoft.com').rpId).toBe('microsoft.com');
  });

  it('refuses a roaming-authenticator request — this is a platform authenticator', () => {
    expect(
      code(() =>
        parseCreation(create({ authenticatorSelection: { authenticatorAttachment: 'cross-platform' } }), 'teams.microsoft.com'),
      ),
    ).toBe('NotAllowedError');
  });

  it('keeps only well-formed excludeCredentials and reads credProps', () => {
    const req = parseCreation(
      create({
        excludeCredentials: [{ type: 'public-key', id: 'YWJj' }, { type: 'other', id: 'ZGVm' }, { type: 'public-key', id: 'no+pe' }],
        extensions: { credProps: true },
      }),
      'teams.microsoft.com',
    );
    expect(req.excludeIds).toEqual(['YWJj']);
    expect(req.wantsCredProps).toBe(true);
  });

  it('rejects a malformed challenge or user id as NotAllowedError', () => {
    expect(code(() => parseCreation(create({ challenge: 'a+b' }), 'teams.microsoft.com'))).toBe('NotAllowedError');
    expect(code(() => parseCreation(create({ challenge: '' }), 'teams.microsoft.com'))).toBe('NotAllowedError');
    expect(code(() => parseCreation(create({ user: { id: 7, name: 'x', displayName: 'x' } }), 'teams.microsoft.com'))).toBe(
      'NotAllowedError',
    );
  });

  it('clamps account text to one row', () => {
    const req = parseCreation(create({ user: { id: 'dXNlci0x', name: 'a'.repeat(300), displayName: '  b \n c ' } }), 'teams.microsoft.com');
    expect(req.userName).toHaveLength(120);
    expect(req.displayName).toBe('b c');
  });
});

describe('parseAssertion', () => {
  it('reads rpId, challenge and the allow list', () => {
    const req = parseAssertion(
      { rpId: 'microsoft.com', challenge, allowCredentials: [{ type: 'public-key', id: 'YWJj' }] },
      'teams.microsoft.com',
    );
    expect(req).toEqual({ rpId: 'microsoft.com', challenge, allowIds: ['YWJj'] });
  });
  it('defaults rpId to the host and the allow list to empty (discoverable)', () => {
    expect(parseAssertion({ challenge }, 'teams.microsoft.com')).toEqual({
      rpId: 'teams.microsoft.com',
      challenge,
      allowIds: [],
    });
  });
  it('rejects a foreign rpId as SecurityError', () => {
    expect(code(() => parseAssertion({ rpId: 'google.com', challenge }, 'teams.microsoft.com'))).toBe('SecurityError');
  });
});
```

- [x] **Step 2: Run the test to verify it fails**

Run: `corepack pnpm vitest run tests/unit/webauthn-rules.test.ts`
Expected: FAIL — module not found.

- [x] **Step 3: Write `src/main/lib/webauthn-rules.ts`**

```ts
import { PASSKEY_TEXT_MAX } from '../../shared/passkeys';
import {
  fromBase64Url,
  type WebAuthnErrorName,
  type WireCreateOptions,
  type WireDescriptor,
  type WireGetOptions,
} from '../../shared/webauthn';
import { clampText } from './pin-rules';

/** Hard cap on one ceremony, whatever `timeout` the page asked for: a
 *  dangling prompt must never hold a pending invoke forever. */
export const WEBAUTHN_TIMEOUT_MS = 120_000;
export const ES256 = -7;

/** A ceremony failure the page should see by name — `code` is the
 *  DOMException name the shim rebuilds. */
export class WebAuthnError extends Error {
  constructor(
    readonly code: WebAuthnErrorName,
    message: string,
  ) {
    super(message);
    this.name = 'WebAuthnError';
  }
}

export interface CreationRequest {
  rpId: string;
  challenge: string;
  userHandle: string;
  userName: string;
  displayName: string;
  excludeIds: string[];
  wantsCredProps: boolean;
}

export interface AssertionRequest {
  rpId: string;
  challenge: string;
  allowIds: string[];
}

/** The rpId must be the origin's host or a dot-suffix of it with at least two
 *  labels. No public-suffix list: every host a view can reach is in
 *  ALLOWED_HOSTS and none sits under a multi-label public suffix (the spec's
 *  "Adding a service" rule keeps that true). */
export function rpIdAllowed(originHost: string, rpId: string): boolean {
  const host = originHost.toLowerCase();
  const rp = rpId.toLowerCase();
  if (rp === '' || rp !== rp.trim()) return false;
  if (rp === host) return true;
  if (!host.endsWith(`.${rp}`)) return false;
  const labels = rp.split('.');
  return labels.length >= 2 && labels.every((l) => l !== '');
}

/** Origin comes from the sending frame, never the payload; only https pages
 *  hold a session worth a passkey. */
export function hostOfOrigin(origin: string): string {
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    throw new WebAuthnError('SecurityError', `not an origin: ${origin}`);
  }
  if (url.protocol !== 'https:' || url.hostname === '') {
    throw new WebAuthnError('SecurityError', `not an https origin: ${origin}`);
  }
  return url.hostname.toLowerCase();
}

export function parseCreation(raw: WireCreateOptions, originHost: string): CreationRequest {
  const rpId = resolveRpId(raw?.rp?.id, originHost);
  const params = Array.isArray(raw?.pubKeyCredParams) ? raw.pubKeyCredParams : [];
  // an empty list means "any algorithm" in the spec
  if (params.length > 0 && !params.some((p) => p?.type === 'public-key' && p.alg === ES256)) {
    throw new WebAuthnError('NotSupportedError', 'only ES256 credentials are supported');
  }
  if (raw?.authenticatorSelection?.authenticatorAttachment === 'cross-platform') {
    throw new WebAuthnError('NotAllowedError', 'a roaming authenticator was requested');
  }
  const user = raw?.user;
  if (!user || typeof user.name !== 'string') {
    throw new WebAuthnError('NotAllowedError', 'user.name is required');
  }
  return {
    rpId,
    challenge: base64Field(raw.challenge, 'challenge'),
    userHandle: base64Field(user.id, 'user.id'),
    userName: clampText(user.name, PASSKEY_TEXT_MAX),
    displayName: clampText(typeof user.displayName === 'string' ? user.displayName : '', PASSKEY_TEXT_MAX),
    excludeIds: descriptorIds(raw.excludeCredentials),
    wantsCredProps: raw?.extensions?.credProps === true,
  };
}

export function parseAssertion(raw: WireGetOptions, originHost: string): AssertionRequest {
  return {
    rpId: resolveRpId(raw?.rpId, originHost),
    challenge: base64Field(raw?.challenge, 'challenge'),
    allowIds: descriptorIds(raw?.allowCredentials),
  };
}

function resolveRpId(claimed: unknown, originHost: string): string {
  if (claimed === undefined) return originHost.toLowerCase();
  if (typeof claimed !== 'string' || !rpIdAllowed(originHost, claimed)) {
    throw new WebAuthnError('SecurityError', `rpId "${String(claimed)}" is not a registrable suffix of ${originHost}`);
  }
  return claimed.toLowerCase();
}

/** A non-empty base64url string, returned as given. */
function base64Field(value: unknown, field: string): string {
  if (typeof value !== 'string' || value === '' || fromBase64Url(value) === null) {
    throw new WebAuthnError('NotAllowedError', `${field} is not base64url`);
  }
  return value;
}

/** Only well-formed public-key descriptors count; the rest are ignored, as a
 *  browser ignores descriptors for transports it lacks. */
function descriptorIds(list: WireDescriptor[] | undefined): string[] {
  if (!Array.isArray(list)) return [];
  return list
    .filter((d) => d?.type === 'public-key' && typeof d.id === 'string' && d.id !== '' && fromBase64Url(d.id) !== null)
    .map((d) => d.id);
}
```

- [x] **Step 4: Run the test to verify it passes**

Run: `corepack pnpm vitest run tests/unit/webauthn-rules.test.ts`
Expected: PASS.

- [x] **Step 5: Lint and typecheck**

Run: `corepack pnpm lint && corepack pnpm typecheck`
Expected: clean. Biome may reformat the long `it.each` table — accept its formatting (`corepack pnpm biome check --write tests/unit/webauthn-rules.test.ts`).

- [ ] **Step 6: Commit**

Ask the user to run `/grimoire-core:commit`. Suggested message: `feat(passkeys): validate WebAuthn requests against the frame origin`.

---

### Task 3: WebAuthn crypto — keys, authenticator data, attestation, signatures

**Files:**

- Create: `src/main/lib/webauthn-crypto.ts`
- Test: `tests/unit/webauthn-crypto.test.ts`

**Interfaces:**

- Consumes: `encodeCbor`, `concat` (Task 1).
- Produces: `FLAG_UP = 0x01`, `FLAG_UV = 0x04`, `FLAG_AT = 0x40`, `GOETIA_AAGUID: Uint8Array` (16 bytes), `interface KeyPair { privateKeyPem: string; publicKeyCose: Uint8Array; publicKeySpki: Uint8Array }`, `generateKeyPair(): KeyPair`, `sha256(data: Uint8Array): Uint8Array`, `clientDataJSON(type: 'webauthn.create' | 'webauthn.get', challenge: string, origin: string): Uint8Array`, `authenticatorData(rpId: string, flags: number, attested?: { credentialId: Uint8Array; publicKeyCose: Uint8Array }): Uint8Array`, `attestationObject(authData: Uint8Array): Uint8Array`, `signAssertion(privateKeyPem: string, authData: Uint8Array, clientData: Uint8Array): Uint8Array`.

- [x] **Step 1: Write the failing test**

```ts
import { createHash, createPublicKey, verify } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { concat } from '../../src/main/lib/cbor';
import {
  attestationObject,
  authenticatorData,
  clientDataJSON,
  FLAG_AT,
  FLAG_UP,
  FLAG_UV,
  generateKeyPair,
  GOETIA_AAGUID,
  sha256,
  signAssertion,
} from '../../src/main/lib/webauthn-crypto';

const hex = (b: Uint8Array) => Buffer.from(b).toString('hex');

/** COSE_Key EC2/P-256 as this encoder lays it out:
 *  a5 01 02 03 26 20 01 | 21 58 20 <x·32> | 22 58 20 <y·32>  (77 bytes) */
function coseToJwk(cose: Uint8Array) {
  expect(hex(cose.slice(0, 10))).toBe('a5010203262001215820');
  expect(hex(cose.slice(42, 45))).toBe('225820');
  expect(cose).toHaveLength(77);
  return {
    kty: 'EC',
    crv: 'P-256',
    x: Buffer.from(cose.slice(10, 42)).toString('base64url'),
    y: Buffer.from(cose.slice(45, 77)).toString('base64url'),
  };
}

describe('webauthn-crypto', () => {
  it('generates a P-256 key whose COSE and SPKI forms agree', () => {
    const k = generateKeyPair();
    expect(k.privateKeyPem).toMatch(/^-----BEGIN PRIVATE KEY-----/);
    const fromCose = createPublicKey({ key: coseToJwk(k.publicKeyCose), format: 'jwk' });
    const fromSpki = createPublicKey({ key: Buffer.from(k.publicKeySpki), format: 'der', type: 'spki' });
    expect(fromCose.export({ format: 'jwk' })).toEqual(fromSpki.export({ format: 'jwk' }));
  });

  it('builds clientDataJSON the way a browser does', () => {
    const cd = JSON.parse(new TextDecoder().decode(clientDataJSON('webauthn.get', 'Y2g', 'https://teams.microsoft.com')));
    expect(cd).toEqual({ type: 'webauthn.get', challenge: 'Y2g', origin: 'https://teams.microsoft.com', crossOrigin: false });
  });

  it('lays out assertion authenticator data: rpIdHash ‖ flags ‖ counter 0', () => {
    const ad = authenticatorData('microsoft.com', FLAG_UP | FLAG_UV);
    expect(ad).toHaveLength(37);
    expect(hex(ad.slice(0, 32))).toBe(createHash('sha256').update('microsoft.com').digest('hex'));
    expect(ad[32]).toBe(0x05);
    expect(hex(ad.slice(33))).toBe('00000000');
  });

  it('lays out attested credential data behind the AAGUID', () => {
    const k = generateKeyPair();
    const credentialId = Uint8Array.from({ length: 32 }, (_, i) => i);
    const ad = authenticatorData('microsoft.com', FLAG_UP | FLAG_UV | FLAG_AT, { credentialId, publicKeyCose: k.publicKeyCose });
    expect(ad[32]).toBe(0x45);
    expect(GOETIA_AAGUID).toHaveLength(16);
    expect(hex(ad.slice(37, 53))).toBe(hex(GOETIA_AAGUID));
    expect(hex(ad.slice(53, 55))).toBe('0020');
    expect(hex(ad.slice(55, 87))).toBe(hex(credentialId));
    expect(hex(ad.slice(87))).toBe(hex(k.publicKeyCose));
  });

  it('wraps authData in a `none` attestation object', () => {
    const ad = authenticatorData('microsoft.com', FLAG_UP | FLAG_UV);
    const att = attestationObject(ad);
    // a3 "fmt" "none" "attStmt" {} "authData" — 28 bytes of framing, then 58 25 and the 37 bytes
    expect(hex(att.slice(0, 28))).toBe('a363666d74646e6f6e656761747453746d74a0686175746844617461');
    expect(hex(att.slice(28, 30))).toBe('5825');
    expect(hex(att.slice(30))).toBe(hex(ad));
  });

  it('signs authData ‖ sha256(clientDataJSON) with DER ECDSA that the attested key verifies', () => {
    const k = generateKeyPair();
    const ad = authenticatorData('microsoft.com', FLAG_UP | FLAG_UV);
    const cd = clientDataJSON('webauthn.get', 'Y2hhbGxlbmdl', 'https://teams.microsoft.com');
    const sig = signAssertion(k.privateKeyPem, ad, cd);
    const pub = createPublicKey({ key: coseToJwk(k.publicKeyCose), format: 'jwk' });
    expect(verify('sha256', concat([ad, sha256(cd)]), pub, sig)).toBe(true);
    expect(sig[0]).toBe(0x30); // DER SEQUENCE, not raw r‖s
    // a different challenge must not verify against this signature
    const other = clientDataJSON('webauthn.get', 'b3RoZXI', 'https://teams.microsoft.com');
    expect(verify('sha256', concat([ad, sha256(other)]), pub, sig)).toBe(false);
  });
});
```

- [x] **Step 2: Run the test to verify it fails**

Run: `corepack pnpm vitest run tests/unit/webauthn-crypto.test.ts`
Expected: FAIL — module not found.

- [x] **Step 3: Write `src/main/lib/webauthn-crypto.ts`**

```ts
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { type CborValue, concat, encodeCbor } from './cbor';

export const FLAG_UP = 0x01;
export const FLAG_UV = 0x04;
export const FLAG_AT = 0x40;

/** Goetia's authenticator identity. Fixed so the community AAGUID list can
 *  name it; zero would be legal but anonymous. */
export const GOETIA_AAGUID = Uint8Array.from([
  0x9e, 0x0c, 0x7a, 0x21, 0x5b, 0x3d, 0x4f, 0x88, 0xa1, 0x6e, 0x2c, 0x47, 0xd9, 0x0b, 0xe3, 0x55,
]);

export interface KeyPair {
  /** PKCS#8 PEM — what the store encrypts */
  privateKeyPem: string;
  /** COSE_Key (EC2, ES256, P-256) — attested in authData */
  publicKeyCose: Uint8Array;
  /** SubjectPublicKeyInfo DER — `getPublicKey()` on the credential */
  publicKeySpki: Uint8Array;
}

export function generateKeyPair(): KeyPair {
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const jwk = publicKey.export({ format: 'jwk' });
  const x = new Uint8Array(Buffer.from(jwk.x as string, 'base64url'));
  const y = new Uint8Array(Buffer.from(jwk.y as string, 'base64url'));
  const cose = new Map<number | string, CborValue>([
    [1, 2], // kty: EC2
    [3, -7], // alg: ES256
    [-1, 1], // crv: P-256
    [-2, x],
    [-3, y],
  ]);
  return {
    privateKeyPem: privateKey.export({ type: 'pkcs8', format: 'pem' }) as string,
    publicKeyCose: encodeCbor(cose),
    publicKeySpki: new Uint8Array(publicKey.export({ type: 'spki', format: 'der' })),
  };
}

export function sha256(data: Uint8Array): Uint8Array {
  return new Uint8Array(createHash('sha256').update(data).digest());
}

export function clientDataJSON(
  type: 'webauthn.create' | 'webauthn.get',
  challenge: string,
  origin: string,
): Uint8Array {
  return new TextEncoder().encode(JSON.stringify({ type, challenge, origin, crossOrigin: false }));
}

/** rpIdHash ‖ flags ‖ signCount(0) [‖ AAGUID ‖ credIdLen ‖ credId ‖ COSE key].
 *  The counter is always 0 (spec-allowed, what synced passkeys do); BE/BS
 *  stay clear because the key is device-bound. */
export function authenticatorData(
  rpId: string,
  flags: number,
  attested?: { credentialId: Uint8Array; publicKeyCose: Uint8Array },
): Uint8Array {
  const parts = [sha256(new TextEncoder().encode(rpId)), Uint8Array.of(flags), new Uint8Array(4)];
  if (attested) {
    const len = attested.credentialId.length;
    parts.push(GOETIA_AAGUID, Uint8Array.of(len >> 8, len & 0xff), attested.credentialId, attested.publicKeyCose);
  }
  return concat(parts);
}

/** `none` attestation: every site accepts it and it is what synced passkeys send. */
export function attestationObject(authData: Uint8Array): Uint8Array {
  return encodeCbor(
    new Map<number | string, CborValue>([
      ['fmt', 'none'],
      ['attStmt', new Map()],
      ['authData', authData],
    ]),
  );
}

/** ECDSA-SHA256 over authData ‖ sha256(clientDataJSON), DER-encoded — the
 *  ES256 form verifiers expect and Node's default. */
export function signAssertion(privateKeyPem: string, authData: Uint8Array, clientData: Uint8Array): Uint8Array {
  return new Uint8Array(sign('sha256', concat([authData, sha256(clientData)]), privateKeyPem));
}
```

- [x] **Step 4: Run the test to verify it passes**

Run: `corepack pnpm vitest run tests/unit/webauthn-crypto.test.ts`
Expected: PASS.

- [x] **Step 5: Lint and typecheck**

Run: `corepack pnpm lint && corepack pnpm typecheck`
Expected: clean.

- [ ] **Step 6: Commit**

Ask the user to run `/grimoire-core:commit`. Suggested message: `feat(passkeys): mint ES256 credentials and sign assertions`.

---

### Task 4: Passkey record rules and the encrypted store

**Files:**

- Create: `src/main/lib/passkey-rules.ts`
- Create: `src/main/passkeys/store.ts`
- Create: `src/main/passkeys/codec.ts`
- Modify: `src/shared/types.ts` (add `PasskeyView` after `PinView`)
- Test: `tests/unit/passkey-rules.test.ts`, `tests/unit/passkey-store.test.ts`

**Interfaces:**

- Consumes: `PASSKEY_CAP`, `PASSKEY_TEXT_MAX`, `fromBase64Url`, `toBase64Url`, `clampText`.
- Produces: `interface Passkey { id; rpId; userHandle; userName; displayName; privateKey; publicKeyCose; createdIn: ServiceId; createdAt; lastUsedAt }`, `parsePasskeys(raw, known): Passkey[]`, `passkeyViews(list): PasskeyView[]`, `accountLabel(p): string`, `interface KeyCodec { encrypt(plain: string): string; decrypt(cipher: string): string }`, `class PasskeyStore` with `all()`, `get(id)`, `forRp(rpId)`, `find(rpId, userHandle)`, `isFull()`, `add(input): Passkey`, `privateKeyPem(id): string | null`, `touch(id, at): void`, `forget(id): boolean`, `restore(id): boolean`, `views(): PasskeyView[]`; `safeStorageCodec(): KeyCodec`.

- [x] **Step 1: Add `PasskeyView` to `src/shared/types.ts`** (directly after the `PinView` interface)

```ts
/** A Settings → Passkeys row. Never carries key material. */
export interface PasskeyView {
  /** base64url credential id — the opaque handle forget/restore use */
  id: string;
  rpId: string;
  /** displayName, else userName, else a placeholder */
  account: string;
  /** the service whose view minted it — display only */
  createdIn: ServiceId;
  createdAt: number;
  lastUsedAt: number;
}
```

- [x] **Step 2: Write the failing tests**

`tests/unit/passkey-rules.test.ts`:

```ts
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
    expect(parsePasskeys([null, 3, record({ createdIn: 'gone' }), record({ id: 'a+b' }), record({ userHandle: 5 })], known)).toEqual([]);
  });
  it('drops a duplicate id and a record without a private key', () => {
    expect(parsePasskeys([record(), record({ userName: 'other' })], known)).toHaveLength(1);
    expect(parsePasskeys([record({ privateKey: '' })], known)).toEqual([]);
  });
  it('tolerates missing text and clocks', () => {
    const [p] = parsePasskeys([record({ displayName: undefined, createdAt: 'x', lastUsedAt: undefined })], known);
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
    expect(v).toEqual({ id: 'Y3JlZA', rpId: 'microsoft.com', account: 'Quyen', createdIn: 'teams', createdAt: 10, lastUsedAt: 20 });
    expect('privateKey' in v).toBe(false);
  });
});
```

`tests/unit/passkey-store.test.ts`:

```ts
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type KeyCodec, PasskeyStore } from '../../src/main/passkeys/store';
import { PASSKEY_CAP } from '../../src/shared/passkeys';

/** reversible and visibly not plaintext, so a leak shows in the file */
const codec: KeyCodec = {
  encrypt: (plain) => `enc:${Buffer.from(plain).toString('base64')}`,
  decrypt: (cipher) => {
    if (!cipher.startsWith('enc:')) throw new Error('bad ciphertext');
    return Buffer.from(cipher.slice(4), 'base64').toString();
  },
};

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'goetia-passkeys-'));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const input = (over: Record<string, unknown> = {}) => ({
  rpId: 'microsoft.com',
  userHandle: 'dXNlci0x',
  userName: 'quyen@example.com',
  displayName: 'Quyen',
  privateKeyPem: '-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----\n',
  publicKeyCose: Uint8Array.from([1, 2, 3]),
  createdIn: 'teams' as const,
  at: 100,
  ...over,
});

describe('PasskeyStore', () => {
  it('adds a discoverable credential with a fresh 32-byte id and encrypts the key at rest', () => {
    const store = new PasskeyStore(dir, codec);
    const p = store.add(input());
    expect(p.id).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(p.createdAt).toBe(100);
    expect(p.lastUsedAt).toBe(100);
    const onDisk = readFileSync(join(dir, 'passkeys.json'), 'utf8');
    expect(onDisk).not.toContain('BEGIN PRIVATE KEY');
    expect(onDisk).toContain('enc:');
    expect(store.privateKeyPem(p.id)).toBe(input().privateKeyPem);
  });

  it('looks up by rpId and by rpId + userHandle', () => {
    const store = new PasskeyStore(dir, codec);
    const a = store.add(input());
    const b = store.add(input({ rpId: 'google.com' }));
    expect(store.forRp('microsoft.com').map((p) => p.id)).toEqual([a.id]);
    expect(store.find('google.com', 'dXNlci0x')?.id).toBe(b.id);
    expect(store.find('google.com', 'other')).toBeUndefined();
    expect(store.forRp('facebook.com')).toEqual([]);
  });

  it('replaces the credential for the same rpId + userHandle instead of duplicating', () => {
    const store = new PasskeyStore(dir, codec);
    const first = store.add(input());
    const second = store.add(input({ displayName: 'Quyen 2', at: 200 }));
    expect(store.all()).toHaveLength(1);
    expect(store.get(first.id)).toBeUndefined();
    expect(store.get(second.id)?.displayName).toBe('Quyen 2');
  });

  it('is full at the cap, except for a replacement', () => {
    const store = new PasskeyStore(dir, codec);
    for (let i = 0; i < PASSKEY_CAP; i++) store.add(input({ userHandle: `u${i}` }));
    expect(store.isFull()).toBe(true);
    store.add(input({ userHandle: 'u0', displayName: 'again' }));
    expect(store.all()).toHaveLength(PASSKEY_CAP);
  });

  it('forgets with one-step restore, at the old position', () => {
    const store = new PasskeyStore(dir, codec);
    const a = store.add(input({ userHandle: 'a' }));
    const b = store.add(input({ userHandle: 'b' }));
    const c = store.add(input({ userHandle: 'c' }));
    expect(store.forget(b.id)).toBe(true);
    expect(store.all().map((p) => p.id)).toEqual([a.id, c.id]);
    expect(store.forget(b.id)).toBe(false);
    expect(store.restore(b.id)).toBe(true);
    expect(store.all().map((p) => p.id)).toEqual([a.id, b.id, c.id]);
    expect(store.restore(b.id)).toBe(false); // only the most recent removal
  });

  it('stamps lastUsedAt and reloads from disk', () => {
    const store = new PasskeyStore(dir, codec);
    const p = store.add(input());
    store.touch(p.id, 500);
    const again = new PasskeyStore(dir, codec);
    expect(again.get(p.id)?.lastUsedAt).toBe(500);
    expect(again.privateKeyPem(p.id)).toBe(input().privateKeyPem);
  });

  it('returns null, not a throw, when the key cannot be decrypted', () => {
    const store = new PasskeyStore(dir, codec);
    const p = store.add(input());
    const broken = new PasskeyStore(dir, { encrypt: codec.encrypt, decrypt: () => { throw new Error('keychain denied'); } });
    expect(broken.privateKeyPem(p.id)).toBeNull();
    expect(store.privateKeyPem('missing')).toBeNull();
  });

  it('starts empty from a corrupt file', () => {
    writeFileSync(join(dir, 'passkeys.json'), '{not json');
    expect(new PasskeyStore(dir, codec).all()).toEqual([]);
  });

  it('views carry no key material', () => {
    const store = new PasskeyStore(dir, codec);
    store.add(input());
    const [v] = store.views();
    expect(v.account).toBe('Quyen');
    expect(Object.keys(v).sort()).toEqual(['account', 'createdAt', 'createdIn', 'id', 'lastUsedAt', 'rpId']);
  });
});
```

- [x] **Step 3: Run the tests to verify they fail**

Run: `corepack pnpm vitest run tests/unit/passkey-rules.test.ts tests/unit/passkey-store.test.ts`
Expected: FAIL — modules not found.

- [x] **Step 4: Write `src/main/lib/passkey-rules.ts`**

```ts
import { PASSKEY_TEXT_MAX } from '../../shared/passkeys';
import type { PasskeyView, ServiceId } from '../../shared/types';
import { fromBase64Url } from '../../shared/webauthn';
import { clampText } from './pin-rules';

/** One discoverable credential. Every base64url field stays a string so the
 *  record round-trips through JSON untouched. */
export interface Passkey {
  id: string;
  rpId: string;
  userHandle: string;
  userName: string;
  displayName: string;
  /** safeStorage ciphertext (base64) of the PKCS#8 PEM */
  privateKey: string;
  publicKeyCose: string;
  createdIn: ServiceId;
  createdAt: number;
  lastUsedAt: number;
}

export function accountLabel(p: Pick<Passkey, 'userName' | 'displayName'>): string {
  return p.displayName || p.userName || '(unnamed account)';
}

/** Tolerant loader for passkeys.json: anything not a well-formed record is
 *  dropped, as is one for a service no longer in the catalog. Ids stay unique. */
export function parsePasskeys(raw: unknown, known: ReadonlySet<string>): Passkey[] {
  if (!Array.isArray(raw)) return [];
  const out: Passkey[] = [];
  const ids = new Set<string>();
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const r = entry as Record<string, unknown>;
    if (!isB64(r.id) || ids.has(r.id) || !isB64(r.userHandle) || !isB64(r.publicKeyCose)) continue;
    if (typeof r.rpId !== 'string' || r.rpId === '') continue;
    if (typeof r.privateKey !== 'string' || r.privateKey === '') continue;
    if (typeof r.createdIn !== 'string' || !known.has(r.createdIn)) continue;
    ids.add(r.id);
    out.push({
      id: r.id,
      rpId: r.rpId,
      userHandle: r.userHandle,
      userName: typeof r.userName === 'string' ? clampText(r.userName, PASSKEY_TEXT_MAX) : '',
      displayName: typeof r.displayName === 'string' ? clampText(r.displayName, PASSKEY_TEXT_MAX) : '',
      privateKey: r.privateKey,
      publicKeyCose: r.publicKeyCose,
      createdIn: r.createdIn as ServiceId,
      createdAt: clock(r.createdAt),
      lastUsedAt: clock(r.lastUsedAt),
    });
  }
  return out;
}

function isB64(v: unknown): v is string {
  return typeof v === 'string' && v !== '' && fromBase64Url(v) !== null;
}

function clock(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

/** Renderer rows: display fields and the opaque id — never the key. */
export function passkeyViews(list: readonly Passkey[]): PasskeyView[] {
  return list.map((p) => ({
    id: p.id,
    rpId: p.rpId,
    account: accountLabel(p),
    createdIn: p.createdIn,
    createdAt: p.createdAt,
    lastUsedAt: p.lastUsedAt,
  }));
}
```

- [x] **Step 5: Write `src/main/passkeys/store.ts`**

```ts
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
    this.list = [...this.list.filter((p) => !(p.rpId === input.rpId && p.userHandle === input.userHandle)), passkey];
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
```

- [x] **Step 6: Write `src/main/passkeys/codec.ts`**

```ts
import { safeStorage } from 'electron';
import type { KeyCodec } from './store';

/** Private keys rest under the OS keychain-backed key safeStorage owns — the
 *  same tier as the session cookies (enableCookieEncryption). */
export function safeStorageCodec(): KeyCodec {
  return {
    encrypt: (plain) => safeStorage.encryptString(plain).toString('base64'),
    decrypt: (cipher) => safeStorage.decryptString(Buffer.from(cipher, 'base64')),
  };
}
```

- [x] **Step 7: Run the tests to verify they pass**

Run: `corepack pnpm vitest run tests/unit/passkey-rules.test.ts tests/unit/passkey-store.test.ts`
Expected: PASS.

- [x] **Step 8: Lint and typecheck**

Run: `corepack pnpm lint && corepack pnpm typecheck`
Expected: clean.

- [ ] **Step 9: Commit**

Ask the user to run `/grimoire-core:commit`. Suggested message: `feat(passkeys): persist credentials encrypted under safeStorage`.

---

### Task 5: The authenticator — ceremony orchestration

**Files:**

- Create: `src/main/passkeys/authenticator.ts`
- Test: `tests/unit/passkey-authenticator.test.ts`

**Interfaces:**

- Consumes: `PasskeyStore`, `KeyCodec` (Task 4); `parseCreation`, `parseAssertion`, `hostOfOrigin`, `WebAuthnError`, `WEBAUTHN_TIMEOUT_MS` (Task 2); `generateKeyPair`, `authenticatorData`, `attestationObject`, `clientDataJSON`, `signAssertion`, flags, `KeyPair` (Task 3); `accountLabel`; wire types; `PASSKEY_CHOOSER_MAX`.
- Produces:

```ts
export interface PasskeyPrompt {
  confirmCreate(rpId: string, account: string): Promise<boolean>;
  /** `afterChooser`: the user just picked this account, which on a platform
   *  without Touch ID already is the confirmation */
  confirmGet(rpId: string, account: string, afterChooser: boolean): Promise<boolean>;
  chooseAccount(rpId: string, accounts: { id: string; label: string }[]): Promise<string | null>;
  noPasskey(rpId: string): Promise<void>;
  capReached(): Promise<void>;
}
export interface CeremonyInput { serviceId: ServiceId; origin: string; options: unknown; viewKey: number }
export class PasskeyAuthenticator {
  constructor(store: PasskeyStore, prompt: PasskeyPrompt, deps?: Partial<{ now(): number; keys(): KeyPair; log(line: string): void; timeoutMs: number }>);
  create(input: CeremonyInput): Promise<WireResult<WireCreateResult>>;
  get(input: CeremonyInput): Promise<WireResult<WireGetResult>>;
}
```

- [x] **Step 1: Write the failing test**

```ts
import { createPublicKey, verify } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { concat } from '../../src/main/lib/cbor';
import { generateKeyPair, sha256 } from '../../src/main/lib/webauthn-crypto';
import { PasskeyAuthenticator, type PasskeyPrompt } from '../../src/main/passkeys/authenticator';
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
    confirmCreate: vi.fn(async () => true),
    confirmGet: vi.fn(async () => true),
    chooseAccount: vi.fn(async (_rp: string, accounts: { id: string }[]) => accounts[0]?.id ?? null),
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
const getOptions = (over: Record<string, unknown> = {}) => ({ rpId: 'microsoft.com', challenge: 'Z2V0', ...over });
const input = (options: unknown, viewKey = 1) => ({ serviceId: 'teams' as const, origin, options, viewKey });

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
    const cd = JSON.parse(Buffer.from(fromBase64Url(res.value.clientDataJSON) as Uint8Array).toString());
    expect(cd).toEqual({ type: 'webauthn.create', challenge: 'Y2hhbGxlbmdl', origin, crossOrigin: false });
    const ad = fromBase64Url(res.value.authenticatorData) as Uint8Array;
    expect(ad[32]).toBe(0x45); // UP | UV | AT
    expect(fromBase64Url(res.value.attestationObject)?.length).toBeGreaterThan(ad.length);
    expect(log).toHaveBeenCalledWith('[passkey] created rp=microsoft.com via=teams');
  });

  it('refuses when the user cancels', async () => {
    const { store, auth } = setup(prompt({ confirmCreate: vi.fn(async () => false) }));
    expect(await auth.create(input(createOptions()))).toEqual({ ok: false, error: 'NotAllowedError' });
    expect(store.all()).toEqual([]);
  });

  it('reports an excluded credential as InvalidStateError without prompting', async () => {
    const { auth, p } = setup();
    const first = await auth.create(input(createOptions()));
    if (!first.ok) throw new Error('setup');
    const again = await auth.create(input(createOptions({ excludeCredentials: [{ type: 'public-key', id: first.value.id }] })));
    expect(again).toEqual({ ok: false, error: 'InvalidStateError' });
    expect(p.confirmCreate).toHaveBeenCalledTimes(1);
  });

  it('maps validation failures to their WebAuthn names', async () => {
    const { auth } = setup();
    expect(await auth.create(input(createOptions({ rp: { id: 'google.com' } })))).toEqual({ ok: false, error: 'SecurityError' });
    expect(await auth.create(input(createOptions({ pubKeyCredParams: [{ type: 'public-key', alg: -257 }] })))).toEqual({
      ok: false,
      error: 'NotSupportedError',
    });
    expect(await auth.create({ ...input(createOptions()), origin: 'http://teams.microsoft.com' })).toEqual({
      ok: false,
      error: 'SecurityError',
    });
  });

  it('shows the cap notice and refuses when the store is full', async () => {
    const { store, auth, p } = setup();
    for (let i = 0; i < 50; i++) {
      store.add({ rpId: 'x.com', userHandle: `u${i}`, userName: 'u', displayName: '', privateKeyPem: 'k', publicKeyCose: new Uint8Array(1), createdIn: 'teams', at: 1 });
    }
    expect(await auth.create(input(createOptions()))).toEqual({ ok: false, error: 'NotAllowedError' });
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
    const pub = createPublicKey({ key: Buffer.from(fromBase64Url(created.publicKeySpki) as Uint8Array), format: 'der', type: 'spki' });
    expect(verify('sha256', concat([ad, sha256(cd)]), pub, fromBase64Url(res.value.signature) as Uint8Array)).toBe(true);
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
    expect(await auth.get(input(getOptions({ allowCredentials: [{ type: 'public-key', id: 'b3RoZXI' }] })))).toEqual({
      ok: false,
      error: 'NotAllowedError',
    });
    expect(p.noPasskey).toHaveBeenCalledTimes(1);
    const ok = await auth.get(input(getOptions({ allowCredentials: [{ type: 'public-key', id: created.id }] })));
    expect(ok.ok).toBe(true);
  });

  it('offers a chooser only with several accounts, most recently used first, and treats it as the confirmation', async () => {
    const { auth, store, p } = await registered();
    const second = store.add({ rpId: 'microsoft.com', userHandle: 'dXNlci0y', userName: 'two', displayName: 'Two', privateKeyPem: generateKeyPair().privateKeyPem, publicKeyCose: new Uint8Array(1), createdIn: 'teams', at: 5000 });
    const res = await auth.get(input(getOptions()));
    expect(res.ok).toBe(true);
    expect(p.chooseAccount).toHaveBeenCalledWith('microsoft.com', [
      { id: second.id, label: 'Two' },
      { id: expect.any(String), label: 'Quyen' },
    ]);
    expect(p.confirmGet).toHaveBeenLastCalledWith('microsoft.com', 'Two', true);
  });

  it('refuses when the chooser is cancelled', async () => {
    const { auth, store } = await registered();
    store.add({ rpId: 'microsoft.com', userHandle: 'dXNlci0y', userName: 'two', displayName: 'Two', privateKeyPem: 'k', publicKeyCose: new Uint8Array(1), createdIn: 'teams', at: 5000 });
    const cancelling = new PasskeyAuthenticator(store, prompt({ chooseAccount: vi.fn(async () => null) }));
    expect(await cancelling.get(input(getOptions()))).toEqual({ ok: false, error: 'NotAllowedError' });
  });

  it('surfaces an undecryptable key only as NotAllowedError', async () => {
    const { created } = await registered();
    const broken = new PasskeyStore(dir, { encrypt: codec.encrypt, decrypt: () => { throw new Error('denied'); } });
    const auth = new PasskeyAuthenticator(broken, prompt());
    expect(broken.get(created.id)).toBeDefined();
    expect(await auth.get(input(getOptions()))).toEqual({ ok: false, error: 'NotAllowedError' });
  });
});

describe('PasskeyAuthenticator concurrency and timeout', () => {
  it('allows one in-flight ceremony per view and refuses a second', async () => {
    let release: (v: boolean) => void = () => {};
    const gate = new Promise<boolean>((r) => {
      release = r;
    });
    const { auth } = setup(prompt({ confirmCreate: vi.fn(() => gate) }));
    const first = auth.create(input(createOptions(), 7));
    expect(await auth.create(input(createOptions(), 7))).toEqual({ ok: false, error: 'NotAllowedError' });
    // another view is unaffected
    const other = auth.create(input(createOptions({ user: { id: 'dXNlci0y', name: 'b', displayName: 'B' } }), 8));
    release(true);
    expect((await first).ok).toBe(true);
    expect((await other).ok).toBe(true);
    // and the slot is free again
    expect((await auth.create(input(createOptions(), 7))).ok).toBe(true);
  });

  it('gives up on a prompt that never answers', async () => {
    vi.useFakeTimers();
    try {
      const never = prompt({ confirmCreate: vi.fn(() => new Promise<boolean>(() => {})) });
      const quick = new PasskeyAuthenticator(new PasskeyStore(dir, codec), never, { timeoutMs: 50 });
      const pending = quick.create(input(createOptions()));
      await vi.advanceTimersByTimeAsync(60);
      expect(await pending).toEqual({ ok: false, error: 'NotAllowedError' });
    } finally {
      vi.useRealTimers();
    }
  });
});
```

- [x] **Step 2: Run the test to verify it fails**

Run: `corepack pnpm vitest run tests/unit/passkey-authenticator.test.ts`
Expected: FAIL — module not found.

- [x] **Step 3: Write `src/main/passkeys/authenticator.ts`**

```ts
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
        timer = setTimeout(() => reject(new WebAuthnError('NotAllowedError', 'timed out')), this.deps.timeoutMs);
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
      const recent = [...candidates].sort((a, b) => b.lastUsedAt - a.lastUsedAt).slice(0, PASSKEY_CHOOSER_MAX);
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
```

- [x] **Step 4: Run the test to verify it passes**

Run: `corepack pnpm vitest run tests/unit/passkey-authenticator.test.ts`
Expected: PASS. If the timeout test hangs, the `Promise.race` timer is being created after `work()` resolved synchronously — it is not; check `vi.advanceTimersByTimeAsync` is awaited.

- [x] **Step 5: Lint and typecheck**

Run: `corepack pnpm lint && corepack pnpm typecheck`
Expected: clean.

- [ ] **Step 6: Commit**

Ask the user to run `/grimoire-core:commit`. Suggested message: `feat(passkeys): run create and get ceremonies behind a user prompt`.

---

### Task 6: Electron prompt, IPC channels, handlers, and wiring

**Files:**

- Create: `src/main/passkeys/prompt.ts`
- Modify: `src/shared/ipc.ts`
- Modify: `src/main/ipc-handlers.ts` (`AppContext`, `registerInvoke`, handlers)
- Modify: `src/main/views.ts:181-194` (`additionalArguments`)
- Modify: `src/main/index.ts:71-72, 239-247`
- Modify: `src/preload/shell.ts` (`invoke` with payload)
- Test: `tests/unit/ipc-sender-policy.test.ts` (append cases)

**Interfaces:**

- Consumes: `PasskeyAuthenticator`, `PasskeyPrompt`, `PasskeyStore`, `safeStorageCodec`, wire types, `PasskeyView`.
- Produces: channels `webauthn:create`, `webauthn:get` (service invokes: payload `{ serviceId, options }`), `passkeys:list`, `passkeys:forget`, `passkeys:restore` (shell-only invokes, the last two with payload `{ id: string }`, all returning `PasskeyView[]`); `AppContext.passkeys: PasskeyAuthenticator`, `AppContext.passkeyStore: PasskeyStore`; `electronPrompt(win: BrowserWindow): PasskeyPrompt`; `window.goetia.invoke(channel, payload?)`; the `--goetia-webauthn=on|off` argv flag on every service view.

- [x] **Step 1: Write the failing sender-policy test cases** (append inside the `describe('ipcSenderAllowed')` block of `tests/unit/ipc-sender-policy.test.ts`)

```ts
  it('lets a service view run its own WebAuthn ceremony, and no other', () => {
    expect(
      ipcSenderAllowed({ channel: 'webauthn:get', fromShell: false, senderServiceId: 'teams', payloadServiceId: 'teams' }),
    ).toBe(true);
    expect(
      ipcSenderAllowed({ channel: 'webauthn:create', fromShell: false, senderServiceId: 'teams', payloadServiceId: 'messenger' }),
    ).toBe(false);
    expect(
      ipcSenderAllowed({ channel: 'webauthn:create', fromShell: true, senderServiceId: null, payloadServiceId: 'teams' }),
    ).toBe(false); // the shell has no page to sign for
  });
  it('keeps the passkey list and forget/restore shell-only', () => {
    for (const channel of ['passkeys:list', 'passkeys:forget', 'passkeys:restore'] as const) {
      expect(ipcSenderAllowed({ channel, fromShell: true, senderServiceId: null, payloadServiceId: undefined })).toBe(true);
      expect(ipcSenderAllowed({ channel, fromShell: false, senderServiceId: 'teams', payloadServiceId: undefined })).toBe(false);
    }
  });
```

- [x] **Step 2: Run it to verify it fails**

Run: `corepack pnpm vitest run tests/unit/ipc-sender-policy.test.ts`
Expected: FAIL — TypeScript rejects the unknown channel names (vitest reports a type error or the shell-only test fails because the channels are not in the set).

- [x] **Step 3: Extend `src/shared/ipc.ts`**

Add the import at the top:

```ts
import type { WireCreateOptions, WireCreateResult, WireGetOptions, WireGetResult, WireResult } from './webauthn';
```

Replace the `RendererInvoke` interface and `INVOKE_CHANNELS`:

```ts
/** renderer -> main round-trips, via ipcRenderer.invoke. `payload` is what
 *  the sender passes; channels without one are invoked bare. */
export interface RendererInvoke {
  /** recents for the quick switcher: fetched once per open, never broadcast */
  'activity:recent': { result: ActivityEntryView[] };
  /** Home's sweep: wipes every service's login, summoned and unbound.
   *  Returns the count so the renderer can toast it — invoke rather than
   *  send because the confirm is modal and the wipes are async, and a
   *  one-shot acknowledgement has no business in every later broadcast. */
  'services:purgeAll': { result: { purged: number } };
  /** the service preload's WebAuthn shim: main runs the ceremony and answers
   *  with the signed material or the DOMException name to raise. Origin is
   *  read off the sending frame, never carried here. */
  'webauthn:create': {
    payload: { serviceId: ServiceId; options: WireCreateOptions };
    result: WireResult<WireCreateResult>;
  };
  'webauthn:get': {
    payload: { serviceId: ServiceId; options: WireGetOptions };
    result: WireResult<WireGetResult>;
  };
  /** Settings → Passkeys: fetched when the pane opens, never broadcast; the
   *  mutations return the fresh list so the pane never races a send. */
  'passkeys:list': { result: PasskeyView[] };
  'passkeys:forget': { payload: { id: string }; result: PasskeyView[] };
  'passkeys:restore': { payload: { id: string }; result: PasskeyView[] };
}

export type InvokePayload<C extends keyof RendererInvoke> = RendererInvoke[C] extends { payload: infer P }
  ? P
  : undefined;

export const INVOKE_CHANNELS = [
  'activity:recent',
  'services:purgeAll',
  'webauthn:create',
  'webauthn:get',
  'passkeys:list',
  'passkeys:forget',
  'passkeys:restore',
] as const satisfies readonly (keyof RendererInvoke)[];
```

Add `PasskeyView` to the `./types` import, and add to `SHELL_ONLY_CHANNELS`:

```ts
  'passkeys:list',
  'passkeys:forget',
  'passkeys:restore',
```

- [x] **Step 4: Update `src/preload/shell.ts`** — replace the `invoke` method:

```ts
  invoke<C extends keyof RendererInvoke>(
    channel: C,
    ...payload: InvokePayload<C> extends undefined ? [] : [InvokePayload<C>]
  ): Promise<RendererInvoke[C]['result']> {
    if (!invokable.has(channel)) return Promise.reject(new Error(`blocked channel: ${channel}`));
    return ipcRenderer.invoke(channel, ...payload) as Promise<RendererInvoke[C]['result']>;
  },
```

and add `type InvokePayload` to the import from `'../shared/ipc'`.

- [x] **Step 5: Write `src/main/passkeys/prompt.ts`**

```ts
import { app, type BrowserWindow, dialog, systemPreferences } from 'electron';
import { PASSKEY_CAP } from '../../shared/passkeys';
import type { PasskeyPrompt } from './authenticator';

/** e2e drives ceremonies headless; a packaged build ignores this entirely,
 *  the way GOETIA_NAV_ENFORCE=off exists only to confirm a suspected bug. */
const AUTO_ACCEPT = !app.isPackaged && process.env.GOETIA_WEBAUTHN_PROMPT === 'accept';

/** Every prompt is native: the service page covers the shell, and a message
 *  box on the window draws over the views. macOS renders promptTouchID as
 *  `"Goetia" is trying to <reason>`. */
export function electronPrompt(win: BrowserWindow): PasskeyPrompt {
  const touchId = process.platform === 'darwin' && systemPreferences.canPromptTouchID();
  const device = process.platform === 'darwin' ? 'Mac' : 'computer';

  const biometric = async (reason: string): Promise<boolean> => {
    try {
      await systemPreferences.promptTouchID(reason);
      return true;
    } catch {
      return false; // cancelled, or no finger matched
    }
  };
  const ask = async (message: string, detail: string, ok: string): Promise<boolean> => {
    const { response } = await dialog.showMessageBox(win, {
      type: 'question',
      message,
      detail,
      buttons: [ok, 'Cancel'],
      defaultId: 0,
      cancelId: 1,
    });
    return response === 0;
  };
  const notice = async (message: string, detail: string): Promise<void> => {
    await dialog.showMessageBox(win, { type: 'info', message, detail, buttons: ['OK'] });
  };

  return {
    async confirmCreate(rpId, account) {
      if (AUTO_ACCEPT) return true;
      if (touchId) return biometric(`create a passkey for ${rpId}`);
      return ask(
        `Create a Goetia passkey for ${rpId}?`,
        `${account} · You'll sign in here with a click instead of a password.`,
        'Create',
      );
    },
    async confirmGet(rpId, account, afterChooser) {
      if (AUTO_ACCEPT) return true;
      if (touchId) return biometric(`sign in to ${rpId}`);
      // without biometrics, picking the account was the confirmation
      if (afterChooser) return true;
      return ask(`Sign in to ${rpId} as ${account}?`, '', 'Sign in');
    },
    async chooseAccount(rpId, accounts) {
      if (AUTO_ACCEPT) return accounts[0]?.id ?? null;
      const { response } = await dialog.showMessageBox(win, {
        type: 'question',
        message: `Which account on ${rpId}?`,
        buttons: [...accounts.map((a) => a.label), 'Cancel'],
        defaultId: 0,
        cancelId: accounts.length,
      });
      return accounts[response]?.id ?? null;
    },
    async noPasskey(rpId) {
      if (AUTO_ACCEPT) return;
      await notice(
        `No Goetia passkey for ${rpId} on this ${device} yet.`,
        'Sign in with your password; when the site offers to create a passkey, accept it.',
      );
    },
    async capReached() {
      if (AUTO_ACCEPT) return;
      await notice(`Goetia already holds ${PASSKEY_CAP} passkeys.`, 'Forget one in Settings → Passkeys to add another.');
    },
  };
}
```

- [x] **Step 6: Update `src/main/ipc-handlers.ts`**

Imports: change the electron import to `import { app, type BrowserWindow, type IpcMainInvokeEvent, ipcMain, Menu, shell } from 'electron';`, change the ipc import to `import type { InvokePayload, RendererInvoke, RendererToMain } from '../shared/ipc';`, and add:

```ts
import type { PasskeyAuthenticator } from './passkeys/authenticator';
import type { PasskeyStore } from './passkeys/store';
```

In `AppContext`, after `pins: PinStore;`:

```ts
  /** the software authenticator behind every service view's WebAuthn shim */
  passkeys: PasskeyAuthenticator;
  /** its store — Settings → Passkeys lists and forgets through it */
  passkeyStore: PasskeyStore;
```

Replace `registerInvoke`:

```ts
/** invoke twin of register(): same gate, so a round-trip channel cannot be
 *  added without one. `blocked` is what a rejected sender receives — always
 *  synchronous, so a refusal never awaits. A service channel's payload
 *  carries `serviceId`, validated against the sending view like a send. */
function registerInvoke(ctx: AppContext) {
  return <C extends keyof RendererInvoke>(
    channel: C,
    blocked: RendererInvoke[C]['result'],
    fn: (
      payload: InvokePayload<C>,
      e: IpcMainInvokeEvent,
    ) => RendererInvoke[C]['result'] | Promise<RendererInvoke[C]['result']>,
  ): void => {
    ipcMain.handle(channel, (e, payload) => {
      const p = payload as { serviceId?: ServiceId } | undefined;
      return senderAllowed(ctx, channel, e.sender.id, p?.serviceId)
        ? fn(payload as InvokePayload<C>, e)
        : blocked;
    });
  };
}

/** The https origin of the frame that invoked, or null: WebAuthn binds to
 *  the page that asked, and a subframe, a blank page or a stale frame gets
 *  nothing. Never read from the payload. */
function invokeOrigin(e: IpcMainInvokeEvent): string | null {
  const frame = e.senderFrame;
  if (!frame || frame !== e.sender.mainFrame) return null;
  try {
    const url = new URL(frame.url);
    return url.protocol === 'https:' ? url.origin : null;
  } catch {
    return null;
  }
}
```

In `registerIpcHandlers`, after the `onInvoke('services:purgeAll', …)` line:

```ts
  onInvoke('webauthn:create', { ok: false, error: 'NotAllowedError' }, (payload, e) => {
    const origin = invokeOrigin(e);
    if (!origin) return { ok: false, error: 'SecurityError' };
    return ctx.passkeys.create({ serviceId: payload.serviceId, origin, options: payload.options, viewKey: e.sender.id });
  });
  onInvoke('webauthn:get', { ok: false, error: 'NotAllowedError' }, (payload, e) => {
    const origin = invokeOrigin(e);
    if (!origin) return { ok: false, error: 'SecurityError' };
    return ctx.passkeys.get({ serviceId: payload.serviceId, origin, options: payload.options, viewKey: e.sender.id });
  });
  onInvoke('passkeys:list', [], () => ctx.passkeyStore.views());
  onInvoke('passkeys:forget', [], ({ id }) => {
    ctx.passkeyStore.forget(id);
    return ctx.passkeyStore.views();
  });
  onInvoke('passkeys:restore', [], ({ id }) => {
    ctx.passkeyStore.restore(id);
    return ctx.passkeyStore.views();
  });
```

- [x] **Step 7: Update `src/main/views.ts`**

Add `safeStorage` to the electron import. Below `KEEP_RENDERED_THROTTLED` add:

```ts
/** The shim advertises an authenticator only when main can actually keep a
 *  key: no OS keyring means an honest "no WebAuthn", never a half-working
 *  one. `off` also exists to confirm a suspected shim bug against the old
 *  block behaviour. */
const webAuthnEnabled = (): boolean =>
  process.env.GOETIA_WEBAUTHN !== 'off' && safeStorage.isEncryptionAvailable();
```

and change the `additionalArguments` line in `create()` to:

```ts
        additionalArguments: [`--goetia-service=${id}`, `--goetia-webauthn=${webAuthnEnabled() ? 'on' : 'off'}`],
```

- [x] **Step 8: Update `src/main/index.ts`**

Imports:

```ts
import { PasskeyAuthenticator } from './passkeys/authenticator';
import { safeStorageCodec } from './passkeys/codec';
import { electronPrompt } from './passkeys/prompt';
import { PasskeyStore } from './passkeys/store';
```

After `const pins = new PinStore(app.getPath('userData'));`:

```ts
    const passkeyStore = new PasskeyStore(app.getPath('userData'), safeStorageCodec());
```

In the `ctx` literal, after `pins,`:

```ts
      passkeys: new PasskeyAuthenticator(passkeyStore, electronPrompt(win)),
      passkeyStore,
```

- [x] **Step 9: Run the tests, lint and typecheck**

Run: `corepack pnpm test && corepack pnpm lint && corepack pnpm typecheck`
Expected: all green; the sender-policy cases now pass. (`tests/unit/activate.test.ts` builds its fake context with `as unknown as AppContext`, so the two new fields need nothing there.)

- [ ] **Step 10: Commit**

Ask the user to run `/grimoire-core:commit`. Suggested message: `feat(passkeys): wire the authenticator behind serviceId-validated invoke channels`.

---

### Task 7: The preload shim (replaces the block)

**Files:**

- Create: `src/preload/lib/webauthn-shim.ts`
- Delete: `src/preload/lib/webauthn-block.ts`, `tests/unit/webauthn-block.test.ts`
- Modify: `src/preload/service.ts:7, 23-24`
- Test: `tests/unit/webauthn-shim.test.ts`

**Interfaces:**

- Consumes: wire types, `toBase64Url`, `fromBase64Url`.
- Produces:

```ts
export interface WebAuthnBridge {
  create(options: WireCreateOptions): Promise<WireResult<WireCreateResult>>;
  get(options: WireGetOptions): Promise<WireResult<WireGetResult>>;
}
export function installWebAuthnShim(win: Window & typeof globalThis, opts: { enabled: boolean; bridge: WebAuthnBridge }): void;
```

- [x] **Step 1: Write the failing test**

```ts
// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { installWebAuthnShim, type WebAuthnBridge } from '../../src/preload/lib/webauthn-shim';
import { toBase64Url } from '../../src/shared/webauthn';

/** happy-dom ships neither the interfaces nor navigator.credentials, so the
 *  page's versions are staged here — this is what a real Chromium exposes. */
function pageWindow() {
  const credentials = {
    get: vi.fn(async (_options?: unknown) => 'native-credential'),
    create: vi.fn(async (_options?: unknown) => 'native-credential'),
  };
  class PublicKeyCredential {
    static isUserVerifyingPlatformAuthenticatorAvailable = async () => false;
    static isConditionalMediationAvailable = async () => true;
  }
  const win = {
    PublicKeyCredential,
    AuthenticatorAssertionResponse: class {},
    AuthenticatorAttestationResponse: class {},
    DOMException,
    navigator: { credentials },
  };
  return { win: win as unknown as Window & typeof globalThis, credentials, PublicKeyCredential };
}

const bytes = (s: string) => new TextEncoder().encode(s);
const createResult = {
  id: 'Y3JlZA',
  clientDataJSON: toBase64Url(bytes('{"type":"webauthn.create"}')),
  attestationObject: toBase64Url(bytes('att')),
  authenticatorData: toBase64Url(bytes('auth')),
  publicKeySpki: toBase64Url(bytes('spki')),
  credProps: true,
};
const getResult = {
  id: 'Y3JlZA',
  clientDataJSON: toBase64Url(bytes('{"type":"webauthn.get"}')),
  authenticatorData: toBase64Url(bytes('auth')),
  signature: toBase64Url(bytes('sig')),
  userHandle: 'dXNlcg',
};

function bridge(over: Partial<WebAuthnBridge> = {}): WebAuthnBridge & { create: ReturnType<typeof vi.fn>; get: ReturnType<typeof vi.fn> } {
  return {
    create: vi.fn(async () => ({ ok: true as const, value: createResult })),
    get: vi.fn(async () => ({ ok: true as const, value: getResult })),
    ...over,
  } as never;
}

const publicKeyCreate = () => ({
  publicKey: {
    rp: { id: 'microsoft.com', name: 'Microsoft' },
    user: { id: bytes('user-1'), name: 'quyen@example.com', displayName: 'Quyen' },
    challenge: bytes('challenge'),
    pubKeyCredParams: [{ type: 'public-key', alg: -7 }],
    excludeCredentials: [{ type: 'public-key', id: new Uint8Array(bytes('abc').buffer), transports: ['internal'] }],
    extensions: { credProps: true },
  },
});

describe('webauthn shim, enabled', () => {
  it('serializes a create request and rebuilds a PublicKeyCredential the page recognises', async () => {
    const { win, credentials, PublicKeyCredential } = pageWindow();
    const b = bridge();
    installWebAuthnShim(win, { enabled: true, bridge: b });
    const cred = (await credentials.create(publicKeyCreate())) as PublicKeyCredential & Record<string, unknown>;
    expect(b.create).toHaveBeenCalledWith({
      rp: { id: 'microsoft.com', name: 'Microsoft' },
      user: { id: toBase64Url(bytes('user-1')), name: 'quyen@example.com', displayName: 'Quyen' },
      challenge: toBase64Url(bytes('challenge')),
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }],
      excludeCredentials: [{ type: 'public-key', id: toBase64Url(bytes('abc')), transports: ['internal'] }],
      authenticatorSelection: undefined,
      extensions: { credProps: true },
    });
    expect(cred).toBeInstanceOf(PublicKeyCredential);
    expect(cred.id).toBe('Y3JlZA');
    expect(new Uint8Array(cred.rawId as ArrayBuffer)).toEqual(Uint8Array.from([0x63, 0x72, 0x65, 0x64])); // "cred"
    expect(cred.type).toBe('public-key');
    expect(cred.authenticatorAttachment).toBe('platform');
    const response = cred.response as Record<string, () => unknown> & Record<string, ArrayBuffer>;
    expect(response).toBeInstanceOf(win.AuthenticatorAttestationResponse);
    expect(new TextDecoder().decode(response.clientDataJSON)).toBe('{"type":"webauthn.create"}');
    expect(new TextDecoder().decode(response.attestationObject)).toBe('att');
    expect(new TextDecoder().decode(response.getAuthenticatorData() as ArrayBuffer)).toBe('auth');
    expect(new TextDecoder().decode(response.getPublicKey() as ArrayBuffer)).toBe('spki');
    expect(response.getPublicKeyAlgorithm()).toBe(-7);
    expect(response.getTransports()).toEqual(['internal']);
    expect((cred.getClientExtensionResults as () => unknown)()).toEqual({ credProps: { rk: true } });
    expect((cred.toJSON as () => Record<string, unknown>)()).toMatchObject({
      id: 'Y3JlZA',
      rawId: 'Y3JlZA',
      type: 'public-key',
      authenticatorAttachment: 'platform',
      response: { clientDataJSON: createResult.clientDataJSON, attestationObject: createResult.attestationObject, transports: ['internal'] },
    });
  });

  it('rebuilds an assertion', async () => {
    const { win, credentials } = pageWindow();
    installWebAuthnShim(win, { enabled: true, bridge: bridge() });
    const cred = (await credentials.get({
      publicKey: { rpId: 'microsoft.com', challenge: bytes('get'), allowCredentials: [{ type: 'public-key', id: bytes('cred') }] },
    })) as Record<string, unknown>;
    const response = cred.response as Record<string, ArrayBuffer | null>;
    expect(response).toBeInstanceOf(win.AuthenticatorAssertionResponse);
    expect(new TextDecoder().decode(response.signature as ArrayBuffer)).toBe('sig');
    expect(new TextDecoder().decode(response.userHandle as ArrayBuffer)).toBe('user');
    expect((cred.getClientExtensionResults as () => unknown)()).toEqual({});
  });

  it('raises the DOMException main names', async () => {
    const { win, credentials } = pageWindow();
    installWebAuthnShim(win, {
      enabled: true,
      bridge: bridge({ get: vi.fn(async () => ({ ok: false as const, error: 'InvalidStateError' as const })) }),
    });
    await expect(credentials.get({ publicKey: { challenge: bytes('x') } })).rejects.toMatchObject({ name: 'InvalidStateError' });
  });

  it('advertises a platform authenticator and no conditional mediation', async () => {
    const { win, PublicKeyCredential } = pageWindow();
    installWebAuthnShim(win, { enabled: true, bridge: bridge() });
    await expect(PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()).resolves.toBe(true);
    await expect(PublicKeyCredential.isConditionalMediationAvailable()).resolves.toBe(false);
    const caps = await (PublicKeyCredential as unknown as { getClientCapabilities(): Promise<Record<string, boolean>> }).getClientCapabilities();
    expect(caps.userVerifyingPlatformAuthenticator).toBe(true);
    expect(caps.conditionalGet).toBe(false);
    expect(caps.hybridTransport).toBe(false);
  });

  it('parses JSON options back into BufferSources', () => {
    const { win, PublicKeyCredential } = pageWindow();
    installWebAuthnShim(win, { enabled: true, bridge: bridge() });
    const P = PublicKeyCredential as unknown as { parseRequestOptionsFromJSON(j: unknown): { challenge: ArrayBuffer; allowCredentials: { id: ArrayBuffer }[] } };
    const parsed = P.parseRequestOptionsFromJSON({ challenge: toBase64Url(bytes('c')), allowCredentials: [{ type: 'public-key', id: toBase64Url(bytes('i')) }] });
    expect(new TextDecoder().decode(parsed.challenge)).toBe('c');
    expect(new TextDecoder().decode(parsed.allowCredentials[0].id)).toBe('i');
  });

  it('leaves non-WebAuthn credential requests to the page', async () => {
    const { win, credentials } = pageWindow();
    const originalGet = credentials.get;
    const b = bridge();
    installWebAuthnShim(win, { enabled: true, bridge: b });
    await expect(credentials.get({ password: true })).resolves.toBe('native-credential');
    expect(originalGet).toHaveBeenCalledWith({ password: true });
    expect(b.get).not.toHaveBeenCalled();
  });

  it('keeps a conditional-mediation request pending until its signal aborts', async () => {
    const { win, credentials } = pageWindow();
    const b = bridge();
    installWebAuthnShim(win, { enabled: true, bridge: b });
    const ctl = new AbortController();
    const pending = credentials.get({ publicKey: { challenge: bytes('x') }, mediation: 'conditional', signal: ctl.signal });
    await new Promise((r) => setTimeout(r, 10));
    expect(b.get).not.toHaveBeenCalled();
    ctl.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('rejects with AbortError when the page aborts mid-ceremony', async () => {
    const { win, credentials } = pageWindow();
    installWebAuthnShim(win, { enabled: true, bridge: bridge({ get: vi.fn(() => new Promise(() => {})) }) });
    const ctl = new AbortController();
    const pending = credentials.get({ publicKey: { challenge: bytes('x') }, signal: ctl.signal });
    ctl.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('survives a page with no credentials API at all', () => {
    const win = { PublicKeyCredential: class {}, DOMException, navigator: {} } as unknown as Window & typeof globalThis;
    expect(() => installWebAuthnShim(win, { enabled: true, bridge: bridge() })).not.toThrow();
  });
});

describe('webauthn shim, disabled', () => {
  it('behaves like the old block: no interfaces, NotSupportedError, password autofill intact', async () => {
    const { win, credentials } = pageWindow();
    const b = bridge();
    installWebAuthnShim(win, { enabled: false, bridge: b });
    expect('PublicKeyCredential' in win).toBe(false);
    expect('AuthenticatorAssertionResponse' in win).toBe(false);
    await expect(credentials.get({ publicKey: {} })).rejects.toMatchObject({ name: 'NotSupportedError' });
    await expect(credentials.create({ publicKey: {} })).rejects.toMatchObject({ name: 'NotSupportedError' });
    await expect(credentials.get({ password: true })).resolves.toBe('native-credential');
    expect(b.get).not.toHaveBeenCalled();
  });
});
```

- [x] **Step 2: Run the test to verify it fails**

Run: `corepack pnpm vitest run tests/unit/webauthn-shim.test.ts`
Expected: FAIL — module not found.

- [x] **Step 3: Write `src/preload/lib/webauthn-shim.ts`**

```ts
import {
  fromBase64Url,
  toBase64Url,
  type WireCreateOptions,
  type WireCreateResult,
  type WireDescriptor,
  type WireGetOptions,
  type WireGetResult,
  type WireResult,
} from '../../shared/webauthn';

export interface WebAuthnBridge {
  create(options: WireCreateOptions): Promise<WireResult<WireCreateResult>>;
  get(options: WireGetOptions): Promise<WireResult<WireGetResult>>;
}

type Win = Window & typeof globalThis;
type AnyRecord = Record<string, unknown>;
// the real signatures are unions of typed option bags; this shim only cares
// about `publicKey`, `mediation` and `signal`, so it works one level looser
type LooseOptions = { publicKey?: AnyRecord; mediation?: string; signal?: AbortSignal };
type LooseCredentials = Record<'get' | 'create', ((options?: LooseOptions) => Promise<unknown>) | undefined>;

/** Goetia's passkeys, page side. Enabled: `publicKey` requests go to main's
 *  authenticator and come back as PublicKeyCredential-shaped objects whose
 *  prototype is the page's own class, so `instanceof` holds. Disabled (no OS
 *  keyring, or GOETIA_WEBAUTHN=off): the API is hidden, as an authenticator-
 *  less browser would, so sites offer a password instead of spinning.
 *  Non-passkey Credential Management (`{ password: true }`) is untouched. */
export function installWebAuthnShim(win: Win, opts: { enabled: boolean; bridge: WebAuthnBridge }): void {
  if (!opts.enabled) {
    hide(win);
    return;
  }
  const w = win as unknown as AnyRecord;
  const Native = (w.PublicKeyCredential ?? class PublicKeyCredential {}) as { prototype: object } & AnyRecord;
  w.PublicKeyCredential = Native;
  Object.assign(Native, {
    isUserVerifyingPlatformAuthenticatorAvailable: () => Promise.resolve(true),
    isConditionalMediationAvailable: () => Promise.resolve(false),
    getClientCapabilities: () =>
      Promise.resolve({
        conditionalCreate: false,
        conditionalGet: false,
        hybridTransport: false,
        passkeyPlatformAuthenticator: true,
        userVerifyingPlatformAuthenticator: true,
        relatedOrigins: false,
        signalAllAcceptedCredentials: false,
        signalCurrentUserDetails: false,
        signalUnknownCredential: false,
      }),
    parseCreationOptionsFromJSON: (json: AnyRecord) => fromJson(json, ['challenge', 'user.id'], ['excludeCredentials']),
    parseRequestOptionsFromJSON: (json: AnyRecord) => fromJson(json, ['challenge'], ['allowCredentials']),
  });
  const creds = win.navigator?.credentials as unknown as LooseCredentials | undefined;
  if (!creds) return;

  const domError = (name: string, message: string) => new win.DOMException(message, name);

  /** Settles with the ceremony, or rejects AbortError on the page's signal; a
   *  conditional request has no ceremony and waits for the abort alone — a
   *  browser with no matching autofill passkey does the same. */
  const withSignal = <T>(signal: AbortSignal | undefined, work: (() => Promise<T>) | null): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      const abort = () => reject(domError('AbortError', 'The operation was aborted.'));
      if (signal?.aborted) return abort();
      signal?.addEventListener('abort', abort, { once: true });
      work?.().then(resolve, reject);
    });

  const unwrap = <T>(result: WireResult<T>): T => {
    if (result.ok) return result.value;
    return raise(result.error);
  };
  const raise = (name: string): never => {
    throw domError(name, `WebAuthn request failed: ${name}`);
  };

  const originalCreate = creds.create?.bind(creds);
  const originalGet = creds.get?.bind(creds);

  if (originalCreate) {
    creds.create = (options) => {
      const pk = options?.publicKey;
      if (!pk) return originalCreate(options);
      return withSignal(options?.signal, async () => {
        const value = unwrap(await opts.bridge.create(serializeCreate(pk)));
        return attestation(win, Native, value);
      });
    };
  }
  if (originalGet) {
    creds.get = (options) => {
      const pk = options?.publicKey;
      if (!pk) return originalGet(options);
      if (options?.mediation === 'conditional') return withSignal(options.signal, null);
      return withSignal(options?.signal, async () => {
        const value = unwrap(await opts.bridge.get(serializeGet(pk)));
        return assertion(win, Native, value);
      });
    };
  }
}

/** The pre-2026-08-30 block, kept for the disabled path. */
function hide(win: Win): void {
  for (const key of ['PublicKeyCredential', 'AuthenticatorAssertionResponse', 'AuthenticatorAttestationResponse']) {
    delete (win as unknown as AnyRecord)[key];
  }
  const creds = win.navigator?.credentials as unknown as LooseCredentials | undefined;
  if (!creds) return;
  for (const method of ['get', 'create'] as const) {
    const original = creds[method]?.bind(creds);
    if (!original) continue;
    creds[method] = (options) => {
      if (!options?.publicKey) return original(options);
      return Promise.reject(new win.DOMException('WebAuthn is not available.', 'NotSupportedError'));
    };
  }
}

// --- page → wire -----------------------------------------------------------

function b64(source: unknown): string {
  if (source instanceof ArrayBuffer) return toBase64Url(new Uint8Array(source));
  if (ArrayBuffer.isView(source)) return toBase64Url(new Uint8Array(source.buffer, source.byteOffset, source.byteLength));
  return ''; // main rejects an empty field as NotAllowedError
}

function descriptors(list: unknown): WireDescriptor[] | undefined {
  if (!Array.isArray(list)) return undefined;
  return list.map((d: AnyRecord) => ({
    type: String(d?.type),
    id: b64(d?.id),
    ...(Array.isArray(d?.transports) ? { transports: d.transports.map(String) } : {}),
  }));
}

function serializeCreate(pk: AnyRecord): WireCreateOptions {
  const rp = (pk.rp ?? {}) as AnyRecord;
  const user = (pk.user ?? {}) as AnyRecord;
  return {
    rp: { id: rp.id as string | undefined, name: rp.name as string | undefined },
    user: { id: b64(user.id), name: user.name as string, displayName: user.displayName as string },
    challenge: b64(pk.challenge),
    pubKeyCredParams: Array.isArray(pk.pubKeyCredParams) ? (pk.pubKeyCredParams as WireCreateOptions['pubKeyCredParams']) : [],
    excludeCredentials: descriptors(pk.excludeCredentials),
    authenticatorSelection: pk.authenticatorSelection as WireCreateOptions['authenticatorSelection'],
    extensions: { credProps: (pk.extensions as AnyRecord | undefined)?.credProps === true },
  };
}

function serializeGet(pk: AnyRecord): WireGetOptions {
  return {
    rpId: pk.rpId as string | undefined,
    challenge: b64(pk.challenge),
    allowCredentials: descriptors(pk.allowCredentials),
    userVerification: pk.userVerification as string | undefined,
  };
}

/** parse*OptionsFromJSON: base64url fields back to ArrayBuffers, in place of
 *  a copy. `paths` are dotted scalar fields; `lists` hold descriptors. */
function fromJson(json: AnyRecord, paths: string[], lists: string[]): AnyRecord {
  const out = structuredClone(json);
  for (const path of paths) {
    const [head, tail] = path.split('.');
    const holder = tail ? (out[head] as AnyRecord | undefined) : out;
    const key = tail ?? head;
    if (holder && typeof holder[key] === 'string') holder[key] = buffer(holder[key] as string);
  }
  for (const list of lists) {
    const arr = out[list];
    if (Array.isArray(arr)) {
      out[list] = arr.map((d: AnyRecord) => (typeof d?.id === 'string' ? { ...d, id: buffer(d.id) } : d));
    }
  }
  return out;
}

// --- wire → page -----------------------------------------------------------

function buffer(text: string): ArrayBuffer {
  const bytes = fromBase64Url(text) ?? new Uint8Array();
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function credential(
  Native: { prototype: object },
  value: { id: string },
  response: object,
  extensions: AnyRecord,
  responseJson: AnyRecord,
): object {
  const cred = {
    id: value.id,
    rawId: buffer(value.id),
    type: 'public-key',
    authenticatorAttachment: 'platform',
    response,
    getClientExtensionResults: () => extensions,
    toJSON: () => ({
      id: value.id,
      rawId: value.id,
      type: 'public-key',
      authenticatorAttachment: 'platform',
      clientExtensionResults: extensions,
      response: responseJson,
    }),
  };
  Object.setPrototypeOf(cred, Native.prototype);
  return cred;
}

function attestation(win: Win, Native: { prototype: object }, v: WireCreateResult): object {
  const response = {
    clientDataJSON: buffer(v.clientDataJSON),
    attestationObject: buffer(v.attestationObject),
    getAuthenticatorData: () => buffer(v.authenticatorData),
    getPublicKey: () => buffer(v.publicKeySpki),
    getPublicKeyAlgorithm: () => -7,
    getTransports: () => ['internal'],
  };
  const proto = (win as unknown as AnyRecord).AuthenticatorAttestationResponse as { prototype: object } | undefined;
  if (proto) Object.setPrototypeOf(response, proto.prototype);
  return credential(Native, v, response, v.credProps ? { credProps: { rk: true } } : {}, {
    clientDataJSON: v.clientDataJSON,
    attestationObject: v.attestationObject,
    authenticatorData: v.authenticatorData,
    publicKey: v.publicKeySpki,
    publicKeyAlgorithm: -7,
    transports: ['internal'],
  });
}

function assertion(win: Win, Native: { prototype: object }, v: WireGetResult): object {
  const response = {
    clientDataJSON: buffer(v.clientDataJSON),
    authenticatorData: buffer(v.authenticatorData),
    signature: buffer(v.signature),
    userHandle: v.userHandle ? buffer(v.userHandle) : null,
  };
  const proto = (win as unknown as AnyRecord).AuthenticatorAssertionResponse as { prototype: object } | undefined;
  if (proto) Object.setPrototypeOf(response, proto.prototype);
  return credential(Native, v, response, {}, {
    clientDataJSON: v.clientDataJSON,
    authenticatorData: v.authenticatorData,
    signature: v.signature,
    userHandle: v.userHandle || null,
  });
}
```

- [x] **Step 4: Wire it into `src/preload/service.ts`**

Replace the import `import { installWebAuthnBlock } from './lib/webauthn-block';` with `import { installWebAuthnShim } from './lib/webauthn-shim';` and replace the two lines

```ts
  // every service: Electron can't complete a passkey, so no page may offer one
  installWebAuthnBlock(window);
```

with

```ts
  // every service: passkeys are Goetia's own software authenticator in main;
  // the flag is off when main has no keyring to keep a key under
  installWebAuthnShim(window, {
    enabled: process.argv.includes('--goetia-webauthn=on'),
    bridge: {
      create: (options) => ipcRenderer.invoke('webauthn:create', { serviceId, options }),
      get: (options) => ipcRenderer.invoke('webauthn:get', { serviceId, options }),
    },
  });
```

- [x] **Step 5: Delete the block and its test**

Run: `git rm src/preload/lib/webauthn-block.ts tests/unit/webauthn-block.test.ts`

- [x] **Step 6: Run the tests, lint and typecheck**

Run: `corepack pnpm test && corepack pnpm lint && corepack pnpm typecheck`
Expected: all green, `webauthn-shim.test.ts` passing.

- [ ] **Step 7: Commit**

Ask the user to run `/grimoire-core:commit`. Suggested message: `feat(passkeys): shim navigator.credentials onto Goetia's authenticator`.

---

### Task 8: Settings → Passkeys and the purge copy

**Files:**

- Create: `src/renderer/src/components/PasskeysPane.tsx`
- Modify: `src/renderer/src/components/SettingsView.tsx:10-19` (section list) and the pane switch after the `services` pane
- Modify: `src/shared/purge-copy.ts`
- Test: `tests/unit/purge-copy.test.ts` (append)

**Interfaces:**

- Consumes: `window.goetia.invoke('passkeys:list' | 'passkeys:forget' | 'passkeys:restore')`, `PasskeyView`, `TOAST_MS`, `useShell`.

- [x] **Step 1: Write the failing purge-copy test cases** (append one `it` to each `describe` in `tests/unit/purge-copy.test.ts`)

```ts
  // purge wipes the session, not the credential — the dialog has to say so
  it('says passkeys are kept and where to forget them', () => {
    expect(purgeLoginCopy('Telegram').detail).toContain('passkeys are kept');
    expect(purgeLoginCopy('Telegram').detail).toContain('Settings → Passkeys');
  });
```

```ts
  it('says passkeys are kept', () => {
    expect(purgeAllCopy(10).detail).toContain('passkeys are kept');
  });
```

- [x] **Step 2: Run to verify they fail**

Run: `corepack pnpm vitest run tests/unit/purge-copy.test.ts`
Expected: FAIL on the two new cases.

- [x] **Step 3: Update `src/shared/purge-copy.ts`**

```ts
/** Purge clears the session, never the credential: a passkey is a saved
 *  login the way a saved password is, and it stays behind Touch ID. */
const PASSKEYS_KEPT = ' Goetia passkeys are kept — forget them in Settings → Passkeys.';
```

and append `+ PASSKEYS_KEPT` to both `detail` strings (turn each into a template or concatenation, e.g. `` detail: `Clears its saved login … signed out elsewhere.${PASSKEYS_KEPT}` ``).

- [x] **Step 4: Write `src/renderer/src/components/PasskeysPane.tsx`**

```tsx
import { useCallback, useEffect, useState } from 'react';
import type { PasskeyView } from '../../../shared/types';
import { useShell } from '../store';
import { TOAST_MS } from './toast-rules';

const dateOf = (t: number) => (t > 0 ? new Date(t).toLocaleDateString() : '—');

/** Settings → Passkeys: Goetia's own credentials, one row each. Forget has
 *  no confirm — a self-dismissing Undo row, the pin pattern. The list is
 *  fetched when the pane opens and returned by every mutation, never
 *  broadcast in ShellState. */
export default function PasskeysPane() {
  // no `?? []` fallback: a fresh array per render would defeat the store's Object.is check
  const services = useShell((s) => s.state?.services);
  const [list, setList] = useState<PasskeyView[] | null>(null);
  const [undo, setUndo] = useState<{ id: string; rpId: string } | null>(null);

  const load = useCallback(() => {
    window.goetia.invoke('passkeys:list').then(setList);
  }, []);
  useEffect(load, [load]);

  useEffect(() => {
    if (!undo) return;
    const t = setTimeout(() => setUndo(null), TOAST_MS);
    return () => clearTimeout(t);
  }, [undo]);

  const forget = async (p: PasskeyView) => {
    setList(await window.goetia.invoke('passkeys:forget', { id: p.id }));
    setUndo({ id: p.id, rpId: p.rpId });
  };
  const restore = async () => {
    if (!undo) return;
    setList(await window.goetia.invoke('passkeys:restore', { id: undo.id }));
    setUndo(null);
  };

  if (list === null) return null;
  if (list.length === 0 && !undo) {
    return (
      <p className="pt-3 text-[11px] text-text-2" data-testid="passkeys-empty">
        No passkeys yet. Sign in to a service with your password — when it offers to create a
        passkey, accept it and Goetia keeps it here.
      </p>
    );
  }
  return (
    <div>
      <p className="pt-3 pb-1 text-[11px] text-text-2">
        Passkeys Goetia made on this device. Forgetting one here leaves a dead entry on the site's
        own security page — remove it there too. A site with more than four accounts offers the four
        most recently used.
      </p>
      {list.map((p) => {
        const svc = services?.find((s) => s.id === p.createdIn);
        return (
          <div
            key={p.id}
            data-testid={`passkey-${p.rpId}`}
            className="flex items-center justify-between gap-4 border-b border-border py-2"
          >
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="truncate text-text-1">
                {p.rpId} <span className="text-text-2">· {p.account}</span>
              </span>
              <span className="text-[11px] text-text-2">
                {svc ? `via ${svc.name} · ` : ''}created {dateOf(p.createdAt)} · last used{' '}
                {dateOf(p.lastUsedAt)}
              </span>
            </span>
            <button
              type="button"
              data-testid={`forget-${p.rpId}`}
              onClick={() => forget(p)}
              className="rounded-ctl border border-border bg-bg-2 px-2.5 py-1 text-text-1 transition-colors duration-120 hover:border-accent"
            >
              Forget
            </button>
          </div>
        );
      })}
      {undo && (
        <div
          role="status"
          data-testid="passkey-undo"
          className="mt-3 flex items-center justify-between gap-4 rounded-ctl bg-bg-2 px-3 py-2"
        >
          <span className="text-text-1">Forgot the passkey for {undo.rpId}.</span>
          <button
            type="button"
            onClick={restore}
            className="font-semibold text-accent transition-colors duration-120 hover:underline"
          >
            Undo
          </button>
        </div>
      )}
    </div>
  );
}
```

- [x] **Step 5: Add the section to `SettingsView.tsx`**

Import: `import PasskeysPane from './PasskeysPane';`. Extend the type and list:

```ts
type SectionId = 'general' | 'appearance' | 'services' | 'passkeys' | 'notifications' | 'shortcuts' | 'updates';

const SECTIONS: { id: SectionId; label: string }[] = [
  { id: 'general', label: 'General' },
  { id: 'appearance', label: 'Appearance' },
  { id: 'services', label: 'Services' },
  { id: 'passkeys', label: 'Passkeys' },
  { id: 'notifications', label: 'Notifications' },
  { id: 'shortcuts', label: 'Shortcuts' },
  { id: 'updates', label: 'Updates' },
];
```

Directly after the closing `)}` of the `{active === 'services' && (…)}` block, add:

```tsx
            {active === 'passkeys' && (
              <Pane title="Passkeys">
                <PasskeysPane />
              </Pane>
            )}
```

- [x] **Step 6: Run the tests, lint and typecheck**

Run: `corepack pnpm test && corepack pnpm lint && corepack pnpm typecheck`
Expected: all green.

- [x] **Step 7: Look at it**

Run: `env -u ELECTRON_RUN_AS_NODE corepack pnpm dev` and open Settings → Passkeys: the empty state renders; the nav shows Passkeys between Services and Notifications. Quit with ⌘Q.

- [ ] **Step 8: Commit**

Ask the user to run `/grimoire-core:commit`. Suggested message: `feat(settings): list and forget Goetia passkeys; purge copy says they are kept`.

---

### Task 9: End-to-end ceremony

**Files:**

- Create: `tests/e2e/passkeys.spec.ts`

**Interfaces:**

- Consumes: the running app with `GOETIA_WEBAUTHN_PROMPT=accept`; the Settings → Passkeys test ids from Task 8.

- [x] **Step 1: Write the spec**

```ts
import { createHash, createPublicKey, verify } from 'node:crypto';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { _electron as electron, expect, type Page, test } from '@playwright/test';

const isShell = (p: Page) => p.url().startsWith('file://') && !p.url().includes('loading.html');
const isService = (p: Page) => p.url().startsWith('https://');

function makeProfile(): string {
  const profile = mkdtempSync(join(tmpdir(), 'goetia-e2e-passkeys-'));
  writeFileSync(
    join(profile, 'settings.json'),
    JSON.stringify({
      lastActiveId: 'zalo',
      disabled: {
        whatsapp: true, messenger: true, telegram: true, discord: true, zalo: false,
        tiktok: true, shopee: true, instagram: true, slack: true, teams: true,
      },
    }),
  );
  return profile;
}

async function launch() {
  const app = await electron.launch({
    args: ['out/main/index.js', '--goetia-e2e', `--goetia-user-data=${makeProfile()}`],
    env: { ...process.env, GOETIA_WEBAUTHN_PROMPT: 'accept' },
  });
  const win = app.windows().find(isShell) ?? (await app.waitForEvent('window', { predicate: isShell }));
  const page = app.windows().find(isService) ?? (await app.waitForEvent('window', { predicate: isService }));
  await page.waitForLoadState('domcontentloaded');
  return { app, win, page };
}

const b64 = (s: string) => Buffer.from(s, 'base64url');

test('a service page registers a passkey, asserts with it, and Settings lists it', async () => {
  const { app, win, page } = await launch();
  try {
    const created = await page.evaluate(async () => {
      const enc = (s: string) => new TextEncoder().encode(s);
      const cred = (await navigator.credentials.create({
        publicKey: {
          rp: { name: 'Zalo' },
          user: { id: enc('user-1'), name: 'e2e@example.com', displayName: 'E2E' },
          challenge: enc('create-challenge'),
          pubKeyCredParams: [{ type: 'public-key', alg: -7 }],
          extensions: { credProps: true },
        },
      })) as PublicKeyCredential;
      const r = cred.response as AuthenticatorAttestationResponse;
      return {
        isInstance: cred instanceof PublicKeyCredential,
        json: cred.toJSON() as unknown as { id: string; response: Record<string, string> },
        spki: btoa(String.fromCharCode(...new Uint8Array(r.getPublicKey() as ArrayBuffer))),
        rk: (cred.getClientExtensionResults() as { credProps?: { rk?: boolean } }).credProps?.rk,
        uvpaa: await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable(),
      };
    });
    expect(created.isInstance).toBe(true);
    expect(created.rk).toBe(true);
    expect(created.uvpaa).toBe(true);
    const pageOrigin = new URL(page.url()); // zalo may have routed within its host; the origin is whatever the page is on
    const clientData = JSON.parse(b64(created.json.response.clientDataJSON).toString());
    expect(clientData).toMatchObject({ type: 'webauthn.create', origin: pageOrigin.origin, crossOrigin: false });

    const asserted = await page.evaluate(async (id: string) => {
      const enc = (s: string) => new TextEncoder().encode(s);
      const cred = (await navigator.credentials.get({
        publicKey: { challenge: enc('get-challenge'), allowCredentials: [{ type: 'public-key', id: Uint8Array.from(atob(id.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0)) }] },
      })) as PublicKeyCredential;
      return cred.toJSON() as unknown as { id: string; response: Record<string, string> };
    }, created.json.id);
    expect(asserted.id).toBe(created.json.id);
    const ad = b64(asserted.response.authenticatorData);
    expect(ad.subarray(0, 32).toString('hex')).toBe(createHash('sha256').update(pageOrigin.hostname).digest('hex'));
    expect(ad[32]).toBe(0x05);
    const pub = createPublicKey({ key: Buffer.from(created.spki, 'base64'), format: 'der', type: 'spki' });
    const signed = Buffer.concat([ad, createHash('sha256').update(b64(asserted.response.clientDataJSON)).digest()]);
    expect(verify('sha256', signed, pub, b64(asserted.response.signature))).toBe(true);

    // the credential shows up in Settings and can be forgotten and restored
    const rp = pageOrigin.hostname;
    await win.getByTestId('settings-btn').click();
    await win.getByTestId('settings-nav-passkeys').click();
    await expect(win.getByTestId(`passkey-${rp}`)).toContainText('E2E');
    await win.getByTestId(`forget-${rp}`).click();
    await expect(win.getByTestId('passkey-undo')).toBeVisible();
    await win.getByTestId('passkey-undo').getByRole('button', { name: 'Undo' }).click();
    await expect(win.getByTestId(`passkey-${rp}`)).toBeVisible();
  } finally {
    await app.close();
  }
});

test('a get with no matching passkey rejects NotAllowedError instead of hanging', async () => {
  const { app, page } = await launch();
  try {
    const name = await page.evaluate(async () => {
      try {
        await navigator.credentials.get({ publicKey: { challenge: new TextEncoder().encode('x') } });
        return 'resolved';
      } catch (e) {
        return (e as DOMException).name;
      }
    });
    expect(name).toBe('NotAllowedError');
  } finally {
    await app.close();
  }
});
```

- [x] **Step 2: Run the spec**

Run: `env -u ELECTRON_RUN_AS_NODE corepack pnpm e2e -- tests/e2e/passkeys.spec.ts`
Expected: 2 passed. The zalo page is `https://chat.zalo.me/`, an https origin, so `invokeOrigin` accepts it; both ceremonies auto-accept under the env flag.

- [x] **Step 3: Run the whole e2e suite**

Run: `env -u ELECTRON_RUN_AS_NODE corepack pnpm e2e`
Expected: all specs pass — the new flag on `additionalArguments` must not disturb any other spec.

- [ ] **Step 4: Commit**

Ask the user to run `/grimoire-core:commit`. Suggested message: `test(passkeys): drive a full register-and-assert ceremony end to end`.

---

### Task 10: Docs, guardrails, and packaged verification

**Files:**

- Modify: `docs/DEVELOPING.md:61`
- Modify: `CLAUDE.md` (Security list, "Adding a service" step 4)
- Modify: `README.md` (Handy to know, If something looks off)
- Modify: `docs/superpowers/specs/2026-08-13-microsoft-teams-service-design.md:27`

- [x] **Step 1: Rewrite the `DEVELOPING.md` note** (replace the "Passkeys can never work" bullet)

```markdown
- Passkeys are Goetia's own: Electron has no platform authenticator Goetia can use under an ad-hoc signature (Electron 42's Touch ID one needs a Team-ID `keychain-access-groups` entitlement), and Apple lets only real browsers assert iCloud Keychain passkeys for third-party sites. So `src/preload/lib/webauthn-shim.ts` routes `navigator.credentials.create/get` to `src/main/passkeys/`, a software authenticator: ES256 keys encrypted under `safeStorage` in `passkeys.json`, Touch ID (or a native confirm) for verification, one store keyed by rpId across services. Existing iCloud/1Password/phone passkeys still can't work. `GOETIA_WEBAUTHN=off` restores the old hide-the-API behaviour to confirm a suspected shim bug; `GOETIA_WEBAUTHN_PROMPT=accept` auto-accepts prompts in non-packaged runs (e2e). Design: `docs/superpowers/specs/2026-08-30-goetia-passkeys-design.md`.
```

- [x] **Step 2: Add a Security bullet to `CLAUDE.md`** (after the **Permissions** bullet)

```markdown
- **Passkeys are a software authenticator in main** (2026-08-30, user decision; spec `docs/superpowers/specs/2026-08-30-goetia-passkeys-design.md`). The service preload's `webauthn-shim.ts` only asks; `PasskeyAuthenticator` validates the rpId against the origin main reads from `e.senderFrame.url` — never the payload — verifies the user (Touch ID, else a native confirm; `UV` is set on an accepted confirm, as 1Password/Bitwarden do), and signs. Private keys live `safeStorage`-encrypted in `passkeys.json`, one store keyed by rpId across services (safe because rpId is bound to the frame origin, not the partition), and **survive purge and banish** — removal is Settings → Passkeys. `webauthn:create`/`webauthn:get` are service invoke channels validated on `serviceId`; `passkeys:*` are shell-only. One ceremony in flight per view, `WEBAUTHN_TIMEOUT_MS` cap, sign counter 0, `BE = BS = 0`, attestation `none`. No CDP virtual authenticator (an attached debugger disables background throttling). The contained and call windows have no preload and keep raw Chromium behaviour.
```

- [x] **Step 3: Extend "Adding a service" step 4 in `CLAUDE.md`** — append to the sentence ending "…(empty lists if it has no calls).":

```markdown
 Never list a host under a shared public suffix (`*.github.io`, `*.co.uk`) without first adding a public-suffix check to `rpIdAllowed` — the passkey rpId rule assumes no allowed host does.
```

- [x] **Step 4: README** — add to "Handy to know", after the Purging bullet:

```markdown
- **Passkeys**: when a service offers to create a passkey after you sign in, accept it — Goetia keeps its own passkey for that site (Touch ID on a Mac, a confirm elsewhere), and the next sign-in is one tap, no password or code. It's a separate passkey from the ones on your phone or in iCloud Keychain, and those can't be used inside Goetia — Apple only allows real browsers to. Passkeys survive `Purge login`; forget them in **Settings → Passkeys**. Deleting Goetia's data folder loses them: sign in with your password once and accept the offer again.
```

and to "If something looks off":

```markdown
- **A site's passkey prompt says no passkey was found**: you haven't made a Goetia passkey for it on this computer yet — sign in with your password and accept the site's offer to create one.
```

- [x] **Step 5: Teams spec pointer** — append to the bullet on line 27:

```markdown
 **Superseded 2026-08-30**: the block became a software authenticator — see `2026-08-30-goetia-passkeys-design.md`.
```

- [x] **Step 6: Lint the markdown**

Run: `npx --yes markdownlint-cli2 docs/DEVELOPING.md CLAUDE.md README.md docs/superpowers/specs/2026-08-13-microsoft-teams-service-design.md`
Expected: `0 issues`.

- [x] **Step 7: Full definition of done**

Run: `corepack pnpm lint && corepack pnpm typecheck && corepack pnpm test && env -u ELECTRON_RUN_AS_NODE corepack pnpm e2e`
Expected: all green.

- [ ] **Step 8: Packaged build launches and the flag is on**

Run: `corepack pnpm package:mac`, open `dist/Goetia-*.dmg`, launch the app, answer **Always Allow** to the `Goetia Safe Storage` prompt, open Settings → Passkeys (empty state renders), then from a logged-in service run in its DevTools console (`View ▸ Toggle Developer Tools`): `PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable().then(console.log)` → `true`.

- [ ] **Step 9: Live checklist** (record findings in the spec's Testing section)

For Teams, Messenger, Discord, and one "Sign in with Google" redirect (TikTok or Slack): sign in with the password → accept the site's "create a passkey" offer → Touch ID → confirm the log line `[passkey] created rp=… via=…` → sign out on the site → sign in with the passkey (Touch ID only) → `[passkey] asserted rp=…` → `Purge login` → sign in with the passkey again. Any verifier-side rejection (`NotAllowedError` surfaced by the site, or a "something went wrong" after the Touch ID) goes into the spec as a finding with the site and the step.

- [ ] **Step 10: Commit**

Ask the user to run `/grimoire-core:commit`. Suggested message: `docs(passkeys): record the software authenticator in guardrails, README and developing notes`. The release bump to v0.12.0 is the user's `chore(release)` step, not part of this plan.
