# Pins At Rest Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Seal `pins.json` with `safeStorage` so pinned text is unreadable off this login session, migrating the plaintext file silently and failing safe when the keychain will not open it.

**Architecture:** `PinStore` gains a `KeyCodec | null` and writes `{ sealed }` (or the legacy `{ pins }` shape with no codec), reading either and re-sealing a legacy file at construction. An undecryptable file sets `unreadable`, which empties the board, refuses every write and surfaces as one Diagnostics line plus a `pinsUnreadable` flag on `ShellState` that Home's Pinned band renders. `KeyCodec` and `safeStorageCodec` move to `src/main/codec.ts`, now shared by three stores.

**Tech Stack:** TypeScript, Electron `safeStorage`, `conf`, React, Vitest, Playwright-Electron.

Spec: `docs/superpowers/specs/2026-09-23-pins-at-rest-design.md`.

## Global Constraints

- Gates: `corepack pnpm lint`, `corepack pnpm typecheck`, `corepack pnpm test`; at the end `corepack pnpm build` then `env -u ELECTRON_RUN_AS_NODE npx playwright test tests/e2e/pins.spec.ts --reporter=line` (never `pnpm e2e -- <spec>`, which runs the whole suite).
- No commits from the plan; the user commits through `/commit`. One summary at the end.
- Stores never import `electron` at runtime: `KeyCodec` is a type-only import; only `src/main/codec.ts` and `index.ts` touch `safeStorage`.
- An unreadable file is never written: `save()` returns early while `unreadable`, and every mutation is refused before it.
- Copy, verbatim. Home sentence: `Your pins can't be read right now — Goetia couldn't open its keychain entry. They come back on a launch where it can; to start over, remove pins.json from the profile folder.` Diagnostics lines (tag `app`): `pins.json is sealed but could not be decrypted; pins are read-only until a launch where the keychain opens (remove the file to start over)` and `pins stored unencrypted: the OS keychain is unavailable`.

## File Structure

| File | Responsibility |
| --- | --- |
| `src/main/codec.ts` (create) | `KeyCodec`, `safeStorageCodec` — moved from `passkeys/store.ts` and `passkeys/codec.ts` (deleted) |
| `src/main/passkeys/store.ts`, `src/main/lock.ts` | import `KeyCodec` from `../codec` / `./codec` |
| `src/main/pins.ts` | the sealed envelope, migration, `unreadable`, `isUnreadable()` |
| `src/shared/types.ts`, `src/main/state.ts` | `ShellState.pinsUnreadable`, `snapshot(…, pinsUnreadable)` |
| `src/main/index.ts` | codec choice, the two Diagnostics lines, the broadcast argument |
| `src/renderer/src/components/welcome/PinnedBand.tsx`, `Welcome.tsx` | the unreadable sentence |
| tests | `pins.test.ts`, `state.test.ts`, four import repoints, e2e `pins.spec.ts` |
| docs | spec status, the 2026-08-25 pins spec's superseded note, `CLAUDE.md`, `FEATURES.md` |

---

### Task 1: the codec moves

**Files:**

- Create: `src/main/codec.ts`
- Delete: `src/main/passkeys/codec.ts`
- Modify: `src/main/passkeys/store.ts:1-17`, `src/main/lock.ts:15`, `src/main/index.ts:44`
- Modify: `tests/unit/passkey-store.test.ts:5`, `tests/unit/lock-store.test.ts:6`, `tests/unit/lock-consent.test.ts:6`, `tests/unit/lock-controller.test.ts:6`

**Interfaces:**

- Produces: `import type { KeyCodec } from './codec'` (`{ encrypt(plain: string): string; decrypt(cipher: string): string }`) and `import { safeStorageCodec } from './codec'`, unchanged in shape; Task 2 and Task 3 import from here.

- [ ] **Step 1: Create `src/main/codec.ts`**

```ts
import { safeStorage } from 'electron';

/** Encrypts a secret at rest. Main hands in safeStorage; tests hand in
 *  something reversible, so no store ever imports electron. Shared by the
 *  passkey, lock and pin stores. */
export interface KeyCodec {
  encrypt(plain: string): string;
  decrypt(cipher: string): string;
}

/** Secrets rest under the OS keychain-backed key safeStorage owns — the
 *  same tier as the session cookies (enableCookieEncryption). */
export function safeStorageCodec(): KeyCodec {
  return {
    encrypt: (plain) => safeStorage.encryptString(plain).toString('base64'),
    decrypt: (cipher) => safeStorage.decryptString(Buffer.from(cipher, 'base64')),
  };
}
```

- [ ] **Step 2: Delete the old file and repoint the imports**

```bash
git rm -q src/main/passkeys/codec.ts
```

In `src/main/passkeys/store.ts`, delete the `KeyCodec` block (the doc comment and the interface, lines 11–16) and add, after the `../lib/passkey-rules` import:

```ts
import type { KeyCodec } from '../codec';
```

In `src/main/lock.ts` replace line 15 with:

```ts
import type { KeyCodec } from './codec';
```

In `src/main/index.ts` replace line 44 with:

```ts
import { safeStorageCodec } from './codec';
```

In `tests/unit/passkey-store.test.ts` replace line 5 with the two lines:

```ts
import type { KeyCodec } from '../../src/main/codec';
import { PasskeyStore } from '../../src/main/passkeys/store';
```

In `tests/unit/lock-store.test.ts`, `tests/unit/lock-consent.test.ts` and `tests/unit/lock-controller.test.ts` replace line 6 with:

```ts
import type { KeyCodec } from '../../src/main/codec';
```

- [ ] **Step 3: Gates**

Run: `corepack pnpm biome check --write src tests && corepack pnpm lint && corepack pnpm typecheck && corepack pnpm vitest run tests/unit/passkey-store.test.ts tests/unit/lock-store.test.ts tests/unit/lock-consent.test.ts tests/unit/lock-controller.test.ts`
Expected: biome may reorder the import blocks it touched; lint and typecheck clean; the four files pass unchanged in count.

---

### Task 2: the sealed store (tests first)

**Files:**

- Modify: `src/main/pins.ts` (whole file)
- Test: `tests/unit/pins.test.ts`

**Interfaces:**

- Consumes: `KeyCodec` from Task 1; `parsePins(raw: unknown, known: ReadonlySet<string>): Pin[]` from `lib/pin-rules.ts` (unchanged).
- Produces: `new PinStore(cwd: string, codec: KeyCodec | null)`; `isUnreadable(): boolean`; `isFull()` true while unreadable; every mutation false / null while unreadable. Task 3 reads `isUnreadable()`.

- [ ] **Step 1: Write the failing tests**

In `tests/unit/pins.test.ts` replace the import block and the `beforeEach` header (lines 1–12) with:

```ts
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { KeyCodec } from '../../src/main/codec';
import { PinStore } from '../../src/main/pins';
import { PIN_CAP } from '../../src/shared/pins';

/** Reversible stand-in for safeStorage, so the store never imports electron. */
const codec: KeyCodec = {
  encrypt: (plain) => Buffer.from(plain, 'utf8').toString('base64'),
  decrypt: (cipher) => Buffer.from(cipher, 'base64').toString('utf8'),
};

/** A codec whose decrypt always throws — a denied keychain, or a profile
 *  copied to another machine. */
const denied: KeyCodec = {
  encrypt: codec.encrypt,
  decrypt: () => {
    throw new Error('keychain denied');
  },
};

const legacyPin = {
  id: 1,
  serviceId: 'zalo',
  text: 'Gửi lại báo giá',
  note: '',
  conversation: 'Nhóm Sale',
  href: 'https://chat.zalo.me/',
  at: 1,
};

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'goetia-pins-'));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));
```

Then every existing `new PinStore(dir)` takes the codec:

```bash
sed -i '' 's/new PinStore(dir)/new PinStore(dir, codec)/g' tests/unit/pins.test.ts
```

In the case `'persists across instances and never reuses an id'` replace the last assertion (the file contains `"new"`) with:

```ts
    const bytes = readFileSync(join(dir, 'pins.json'), 'utf8');
    expect(bytes).toContain('"sealed"');
    expect(bytes).not.toContain('"new"'); // the text is inside the envelope, not beside it
```

Append a new `describe` at the end of the file. The texts carry a space or a non-ASCII letter on purpose: neither can occur inside base64, so `not.toContain` is a real check.

```ts
describe('PinStore at rest', () => {
  it('seals the file: neither the text nor the note is readable on disk', () => {
    const store = new PinStore(dir, codec);
    store.pin(input('secret plan'));
    store.setNote(1, 'call An');
    const bytes = readFileSync(join(dir, 'pins.json'), 'utf8');
    expect(Object.keys(JSON.parse(bytes))).toEqual(['sealed']);
    expect(bytes).not.toContain('secret plan');
    expect(bytes).not.toContain('call An');
    expect(new PinStore(dir, codec).views().map((p) => [p.text, p.note])).toEqual([
      ['secret plan', 'call An'],
    ]);
  });

  it('migrates a legacy plaintext file at construction, before any click', () => {
    writeFileSync(join(dir, 'pins.json'), JSON.stringify({ pins: [legacyPin] }));
    const store = new PinStore(dir, codec);
    expect(store.views().map((p) => p.text)).toEqual(['Gửi lại báo giá']);
    const bytes = readFileSync(join(dir, 'pins.json'), 'utf8');
    expect(bytes).toContain('"sealed"');
    expect(bytes).not.toContain('"pins"');
    expect(bytes).not.toContain('Gửi lại báo giá');
    expect(new PinStore(dir, codec).views().map((p) => p.id)).toEqual([1]);
  });

  it('leaves an undecryptable file untouched and refuses every write', () => {
    const before = JSON.stringify({ sealed: 'not for this machine' });
    writeFileSync(join(dir, 'pins.json'), before);
    const store = new PinStore(dir, denied);
    expect(store.isUnreadable()).toBe(true);
    expect(store.isFull()).toBe(true);
    expect(store.views()).toEqual([]);
    expect(store.pin(input('x'))).toBeNull();
    expect(store.unpin(1)).toBe(false);
    expect(store.restore(1)).toBe(false);
    expect(store.setNote(1, 'n')).toBe(false);
    expect(store.reorder([])).toBe(false);
    expect(readFileSync(join(dir, 'pins.json'), 'utf8')).toBe(before);
  });

  it('is unreadable when a sealed file meets a machine with no keychain', () => {
    const before = JSON.stringify({
      sealed: codec.encrypt(JSON.stringify({ pins: [legacyPin] })),
    });
    writeFileSync(join(dir, 'pins.json'), before);
    const store = new PinStore(dir, null);
    expect(store.isUnreadable()).toBe(true);
    expect(store.views()).toEqual([]);
    expect(store.pin(input('x'))).toBeNull();
    expect(readFileSync(join(dir, 'pins.json'), 'utf8')).toBe(before);
  });

  it('writes and reads plaintext when handed no codec', () => {
    const a = new PinStore(dir, null);
    a.pin(input('plain sight'));
    expect(readFileSync(join(dir, 'pins.json'), 'utf8')).toContain('plain sight');
    expect(new PinStore(dir, null).views().map((p) => p.text)).toEqual(['plain sight']);
    expect(new PinStore(dir, null).isUnreadable()).toBe(false);
  });

  it('writes nothing on a fresh profile until the first pin', () => {
    const store = new PinStore(dir, codec);
    expect(store.isUnreadable()).toBe(false);
    expect(existsSync(join(dir, 'pins.json'))).toBe(false);
    store.pin(input('first'));
    expect(existsSync(join(dir, 'pins.json'))).toBe(true);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `corepack pnpm vitest run tests/unit/pins.test.ts`
Expected: the new `describe` fails throughout (`isUnreadable is not a function`, no `"sealed"` key) and the amended persistence case fails on `"sealed"`; the constructor ignores the extra argument so the untouched cases still pass.

- [ ] **Step 3: Rewrite `src/main/pins.ts`**

Replace the imports, the file interface, the class doc, the fields and the constructor (everything down to `all()`):

```ts
import Conf from 'conf';
import { PIN_CAP, PIN_NOTE_MAX, PIN_TEXT_MAX } from '../shared/pins';
import { SERVICES, serviceById } from '../shared/services';
import type { PinView, ServiceId } from '../shared/types';
import type { KeyCodec } from './codec';
import {
  clampText,
  conversationFromTitle,
  isPermutation,
  PIN_CONVERSATION_MAX,
  type Pin,
  parsePins,
  pinViews,
} from './lib/pin-rules';

/** On disk: one of the two keys, or neither on a fresh profile. `sealed` is
 *  the codec's output over JSON.stringify({ pins }); `pins` is the legacy
 *  plaintext shape, still written when no keychain is available. */
interface PinsFile {
  sealed?: string;
  pins?: Pin[];
}

/** The pinboard: an ordered todo list of messages the user chose to keep.
 *  Persisted to <cwd>/pins.json — the one deliberate exception to
 *  "conversation content never touches disk": unchosen content (the activity
 *  log) still never does; a pin is explicit, and it leaves the file with the
 *  pin. Since 2026-09-23 the file is a safeStorage-sealed envelope, the tier
 *  the cookies and passkeys rest under; a legacy plaintext file is re-sealed
 *  at construction. One atomic write per mutation: every mutation is a user
 *  click, and a drag reaches here once, so nothing needs deferring. */
export class PinStore {
  private conf: Conf<PinsFile>;
  private pins: Pin[] = [];
  private nextId: number;
  /** the most recent removal, kept for one Undo */
  private lastRemoved: { pin: Pin; index: number } | null = null;
  /** a sealed file exists but would not open on this boot — read nothing,
   *  write nothing, so a keychain hiccup can never overwrite the todo list */
  private unreadable = false;

  constructor(
    cwd: string,
    private codec: KeyCodec | null,
  ) {
    this.conf = new Conf<PinsFile>({
      cwd,
      configName: 'pins',
      // no `pins: []` default: it would make a fresh profile look like a
      // legacy file and write an empty envelope at every first boot
      defaults: {},
      // a corrupt file yields the defaults instead of a throw at boot
      clearInvalidConfig: true,
    });
    const known = new Set(SERVICES.map((s) => s.id));
    const raw = this.conf.store;
    if (typeof raw.sealed === 'string') {
      try {
        if (!codec) throw new Error('sealed file, no keychain');
        const opened: unknown = JSON.parse(codec.decrypt(raw.sealed));
        this.pins = parsePins((opened as { pins?: unknown } | null)?.pins, known);
      } catch {
        this.unreadable = true;
      }
    } else if (Array.isArray(raw.pins)) {
      this.pins = parsePins(raw.pins, known);
      // migrate: the plaintext leaves the disk now, not on the next click
      if (codec) this.save();
    }
    this.nextId = this.pins.reduce((max, p) => Math.max(max, p.id), 0) + 1;
  }

  /** True when pins.json is sealed but the keychain would not open it this
   *  boot. The board reads empty and refuses every write until a launch
   *  where it does; index.ts notes it and Home's band says so. */
  isUnreadable(): boolean {
    return this.unreadable;
  }
```

Replace `isFull`:

```ts
  /** Also true while unreadable: that one gate is what disables the
   *  context-menu item and makes pin() return null, so nothing new is wired. */
  isFull(): boolean {
    return this.unreadable || this.pins.length >= PIN_CAP;
  }
```

Add `if (this.unreadable) return false;` as the first line of `unpin`, `restore`, `setNote` and `reorder` (`pin` is already refused by `isFull()`).

Replace `save`:

```ts
  private save(): void {
    if (this.unreadable) return; // never overwrite what could not be read
    // assigning the store is one atomic write, same as SettingsStore
    this.conf.store = this.codec
      ? { sealed: this.codec.encrypt(JSON.stringify({ pins: this.pins })) }
      : { pins: this.pins };
  }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `corepack pnpm vitest run tests/unit/pins.test.ts`
Expected: PASS, every existing case plus the six new ones.

- [ ] **Step 5: Lint and typecheck**

Run: `corepack pnpm lint && corepack pnpm typecheck`
Expected: lint clean; typecheck reports exactly one error, `src/main/index.ts` — `new PinStore(app.getPath('userData'))` now needs the codec. Task 3 fixes it.

---

### Task 3: the flag reaches the shell, and main chooses the codec

**Files:**

- Modify: `src/shared/types.ts` (after `pins: PinView[];`, line 361)
- Modify: `src/main/state.ts` (`snapshot`, lines 100–107 and 126)
- Modify: `src/main/index.ts` (the `electron` import, lines 3–12; the store block, line 119; the broadcast, lines 319–327)
- Test: `tests/unit/state.test.ts`

**Interfaces:**

- Consumes: `PinStore.isUnreadable()` from Task 2, `safeStorageCodec` from Task 1.
- Produces: `ShellState.pinsUnreadable: boolean`; `MainState.snapshot(settings, theme, version, quietActive, pins = [], lockConfigured = false, pinsUnreadable = false)`. Task 4 reads `state.pinsUnreadable`.

- [ ] **Step 1: Write the failing test**

In `tests/unit/state.test.ts`, after the case `'snapshots pins, defaulting to empty'`:

```ts
  it('snapshots pinsUnreadable, and hides it while locked like the pins', () => {
    const s = new MainState();
    expect(s.snapshot(DEFAULT_SETTINGS, 'dark', '0.1.0', false).pinsUnreadable).toBe(false);
    expect(
      s.snapshot(DEFAULT_SETTINGS, 'dark', '0.1.0', false, [], false, true).pinsUnreadable,
    ).toBe(true);
    s.locked = true;
    expect(
      s.snapshot(DEFAULT_SETTINGS, 'dark', '0.1.0', false, [], false, true).pinsUnreadable,
    ).toBe(false);
  });
```

- [ ] **Step 2: Run it to verify it fails**

Run: `corepack pnpm vitest run tests/unit/state.test.ts`
Expected: the new case FAILS (`pinsUnreadable` is `undefined`).

- [ ] **Step 3: The type and the snapshot**

In `src/shared/types.ts`, after `pins: PinView[];`:

```ts
  /** pins.json is sealed but the keychain would not open it this boot: the
   *  board is empty and read-only until a launch where it does. False while
   *  locked, like `pins` is emptied. */
  pinsUnreadable: boolean;
```

In `src/main/state.ts`, the `snapshot` signature gains a parameter after `lockConfigured = false`:

```ts
    lockConfigured = false,
    pinsUnreadable = false,
  ): ShellState {
```

and after `pins: this.locked ? [] : pins,`:

```ts
      pinsUnreadable: this.locked ? false : pinsUnreadable,
```

- [ ] **Step 4: Main wires the codec, the lines and the broadcast**

In `src/main/index.ts` add `safeStorage,` to the `electron` import (alphabetical, after `powerMonitor`):

```ts
import {
  app,
  BrowserWindow,
  Notification,
  nativeImage,
  nativeTheme,
  powerMonitor,
  safeStorage,
  session,
  shell,
} from 'electron';
```

Replace `const pins = new PinStore(app.getPath('userData'));` with:

```ts
    // pins rest under the same keychain-backed key as the cookies and the
    // passkeys; with no keychain the store keeps today's plaintext and says so
    const pinCodec = safeStorage.isEncryptionAvailable() ? safeStorageCodec() : null;
    const pins = new PinStore(app.getPath('userData'), pinCodec);
    if (pins.isUnreadable()) {
      diag.note(
        'app',
        'pins.json is sealed but could not be decrypted; pins are read-only until a launch where the keychain opens (remove the file to start over)',
      );
    } else if (!pinCodec) {
      diag.note('app', 'pins stored unencrypted: the OS keychain is unavailable');
    }
```

This block already sits inside `app.whenReady().then(…)`, which `isEncryptionAvailable()` requires on Linux.

In `broadcast()`, the `snapshot` call gains the seventh argument:

```ts
        state.snapshot(
          s,
          effectiveTheme(),
          app.getVersion(),
          quiet.quietNow(),
          pins.views(),
          lock.configured(),
          pins.isUnreadable(),
        ),
```

- [ ] **Step 5: Gates**

Run: `corepack pnpm lint && corepack pnpm typecheck && corepack pnpm test`
Expected: all clean; the Task 2 typecheck error is gone; every unit file green.

---

### Task 4: Home says so

**Files:**

- Modify: `src/renderer/src/components/welcome/PinnedBand.tsx` (`Props`, the component signature, the empty-state branch)
- Modify: `src/renderer/src/components/Welcome.tsx:314-318`

**Interfaces:**

- Consumes: `state.pinsUnreadable` from Task 3.
- Produces: `data-testid="pins-unreadable"` for Task 5.

- [ ] **Step 1: The band**

In `PinnedBand.tsx` add to `Props`:

```ts
  /** pins.json exists but the keychain would not open it this boot */
  unreadable: boolean;
```

and take it in the signature:

```ts
export default function PinnedBand({ pins, services, disabled, unreadable }: Props) {
```

Just before the `return (`, build the notice (a nested ternary in JSX is what this avoids):

```tsx
  let notice: React.ReactNode = null;
  if (unreadable) {
    notice = (
      <p className="text-xs text-text-2 opacity-70" data-testid="pins-unreadable">
        Your pins can't be read right now — Goetia couldn't open its keychain entry. They come back
        on a launch where it can; to start over, remove pins.json from the profile folder.
      </p>
    );
  } else if (pins.length === 0) {
    notice = (
      <p className="text-xs text-text-2 opacity-70">
        Nothing pinned — right-click a message in any service, or select text and press ⌘/Ctrl ⇧ S.
      </p>
    );
  }
```

Then replace the existing `{pins.length === 0 ? ( <p …>Nothing pinned …</p> ) : ( <Reorder.Group …` opening with `{notice ?? ( <Reorder.Group …` and the matching closing `)}` stays as is. `React` is already imported as a type in this file, so `React.ReactNode` needs no new import.

- [ ] **Step 2: Welcome passes it**

In `Welcome.tsx`:

```tsx
        <PinnedBand
          pins={state.pins}
          services={state.services}
          disabled={state.settings.disabled}
          unreadable={state.pinsUnreadable}
        />
```

- [ ] **Step 3: Gates**

Run: `corepack pnpm lint && corepack pnpm typecheck && corepack pnpm test`
Expected: clean. If biome reflows the JSX text, accept its fix.

---

### Task 5: e2e

**Files:**

- Modify: `tests/e2e/pins.spec.ts` (imports, the first test, one new test)

**Interfaces:**

- Consumes: the seeded plaintext profile from `seedProfile()`; `pins-unreadable` from Task 4; `pin-tally`, which the rail renders only when there is at least one pin.

- [ ] **Step 1: Migration is asserted in the first test**

Change the import to include `readFileSync`:

```ts
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
```

In `'pins: the tally counts them, Home shows altar + queue'` replace the first line of the body and add the migration check right after the tally assertion:

```ts
  const profile = seedProfile();
  const { app, win } = await launch(profile);
  await expect(win.locator('[data-testid="pin-tally"]')).toHaveText('2');

  // the seeded plaintext file was sealed at boot, before any click
  const sealed = readFileSync(join(profile, 'pins.json'), 'utf8');
  expect(sealed).toContain('"sealed"');
  expect(sealed).not.toContain('"pins"');
  expect(sealed).not.toContain('Gửi lại báo giá');
```

- [ ] **Step 2: The unreadable test**

Append after `'pins: a removal survives a relaunch'`:

```ts
// a sealed file this keychain cannot open: kept in place for a boot that can,
// pinning paused, and Home says why (never an overwrite, never a set-aside)
test('pins: an unreadable sealed file is kept, and Home says so', async () => {
  const profile = seedProfile();
  const bogus = JSON.stringify({ sealed: 'bm90IGEgcmVhbCBibG9i' });
  writeFileSync(join(profile, 'pins.json'), bogus);
  const { app, win } = await launch(profile);
  await expect(win.locator('[data-testid="home-btn"]')).toBeVisible();
  await expect(win.locator('[data-testid="pin-tally"]')).toHaveCount(0);
  await win.locator('[data-testid="home-btn"]').click();
  await expect(win.locator('[data-testid="pins-unreadable"]')).toContainText(
    "can't be read right now",
  );
  expect(readFileSync(join(profile, 'pins.json'), 'utf8')).toBe(bogus);
  await app.close();
});
```

- [ ] **Step 3: Build and run the spec**

Run: `corepack pnpm build && env -u ELECTRON_RUN_AS_NODE npx playwright test tests/e2e/pins.spec.ts --reporter=line`
Expected: 6 passed (the five existing tests, including the relaunch that now decrypts, plus the new one). If the migration assertion fails on `"sealed"`, check `safeStorage.isEncryptionAvailable()` under Playwright by running `tests/e2e/lock.spec.ts`, which depends on the same thing.

---

### Task 6: docs

**Files:**

- Modify: `docs/superpowers/specs/2026-09-23-pins-at-rest-design.md` (status line)
- Modify: `docs/superpowers/specs/2026-08-25-pinned-messages-design.md:10`
- Modify: `CLAUDE.md` (the pins bullet, line 22)
- Modify: `docs/FEATURES.md` (the pins bullet, line 20; the Security hardening list, line 80)

- [ ] **Step 1: The two specs**

In the new spec change `Status: approved in brainstorm (user decision, same day); not implemented.` to `Status: implemented 2026-09-23.`

In the 2026-08-25 spec, append to the end of the line-10 bullet (after `…adds keychain prompts on every ad-hoc rebuild.`):

```text
 **Superseded 2026-09-23** (`2026-09-23-pins-at-rest-design.md`): the file is now a `safeStorage`-sealed envelope. The prompt objection lapsed once `passkeys.json`, `lock.json` and cookie encryption all opened the same keychain item at every boot; a legacy plaintext file is re-sealed at first launch.
```

- [ ] **Step 2: CLAUDE.md**

In the pins bullet replace `` `PinStore` (`src/main/pins.ts`) persists to `pins.json`: the one exception to "conversation content never touches disk" — explicitly pinned text lives there and leaves with the pin; `` with:

```text
`PinStore` (`src/main/pins.ts`) persists to `pins.json`: the one exception to "conversation content never touches disk" — explicitly pinned text lives there and leaves with the pin — and since 2026-09-23 the file is a `safeStorage`-sealed envelope (`{ sealed }`, spec `docs/superpowers/specs/2026-09-23-pins-at-rest-design.md`), the cookies' and passkeys' tier, so a copied profile yields nothing; a legacy `{ pins }` file is re-sealed at construction, a machine with no keychain keeps plaintext and says so in Diagnostics, and a sealed file the keychain will not open is **kept, never overwritten or set aside** — `isUnreadable()` empties the board, `isFull()` refuses pinning, Home's band says why, and the next boot that can read it gets it back;
```

- [ ] **Step 3: FEATURES.md**

In the pins bullet replace `` Persisted to `pins.json`. `` with:

```text
Persisted to `pins.json` as a `safeStorage`-sealed envelope (a legacy plaintext file is re-sealed at first launch; a file the keychain cannot open is kept untouched, the board reads empty and read-only, and Home says so).
```

and in its `Impl:` list add `` `src/main/codec.ts` ``; in `Verified:` extend the e2e note to `` e2e `pins.spec.ts` (incl. a paragraph-length pin: zero horizontal overflow before, during and after a drag; the seeded plaintext file sealed at boot; an unreadable sealed file kept in place) ``.

Under `## Security hardening`, after the Electron fuses bullet, add:

```text
- **Pins sealed at rest** — `pins.json`, the only conversation content on disk, is one `safeStorage` blob: unreadable from a backup, a cloned disk or another account, readable by a process running as this user exactly like the cookies. Fails safe when the keychain will not open it (kept, not overwritten). Impl: `src/main/pins.ts`, `src/main/codec.ts`. Verified: `pins.test.ts`, e2e `pins.spec.ts`.
```

- [ ] **Step 4: Lint the markdown**

Run: `npx markdownlint-cli2 CLAUDE.md docs/FEATURES.md docs/superpowers/specs/2026-09-23-pins-at-rest-design.md docs/superpowers/specs/2026-08-25-pinned-messages-design.md docs/superpowers/plans/2026-09-23-pins-at-rest.md`
Expected: `Summary: 0 issues`.

- [ ] **Step 5: Hand off**

Do not commit. Report the files touched, the gate results (lint, typecheck, unit count, the e2e result) and ask the user to run `/commit`.
