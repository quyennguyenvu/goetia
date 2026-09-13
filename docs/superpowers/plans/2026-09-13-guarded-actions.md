# Guarded Actions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Require the app lock's credential before three actions an unattended but *unlocked* Goetia would otherwise perform for anyone — summoning a banished service, purging one login, and purging every login.

**Architecture:** `LockController` gains a single-slot, action-bound, single-use consent. The renderer collects Touch ID or the passcode, `lock:confirm` verifies and mints the consent, and then the renderer sends the real action; main's handler consumes a *matching* consent or drops the message silently. The summon test is `summonedIds` — the transition `stampSummoned` already computes — so a banish-only or reorder-only Home commit never asks, and the auto-banish timer is excluded by construction rather than by a special case.

**Tech Stack:** Electron (main + sandboxed shell preload + React renderer), TypeScript, `conf`, vitest, Playwright, Biome, Tailwind.

**Source spec:** `docs/superpowers/specs/2026-09-13-guarded-actions-design.md`. Read it and `docs/superpowers/specs/2026-09-09-app-lock-design.md` before Task 1 — this reuses that credential wholesale.

## Global Constraints

- **Commits are the user's, never yours.** No committing in any form, no amending, and never write a `GRIMOIRE_COMMIT_MSG.txt` file — writing that file *is* the commit authorization, so creating it outside a confirmed `/grimoire-core:commit` forges approval. Each task ends with a **Request commit** step: stop, summarize, ask the user to run `/grimoire-core:commit`. Never add a `Co-Authored-By: Claude` trailer.
- **Definition of done for every task:** `corepack pnpm lint`, `corepack pnpm typecheck`, `corepack pnpm test` green; plus `env -u ELECTRON_RUN_AS_NODE corepack pnpm e2e` for main/preload/renderer wiring (VS Code shells export `ELECTRON_RUN_AS_NODE`, which breaks the Electron launch).
- **`src/shared/` stays process-agnostic:** no `electron`, no DOM imports.
- **Pure decision logic goes in a `lib/` helper with a vitest unit test.** `views.ts`, `index.ts`, `ipc-handlers.ts` stay thin wiring.
- **Every new IPC channel must be classified.** Shell-only → add to `SHELL_ONLY_CHANNELS`. Service channel → carry a validated `serviceId`. No third option.
- **A refused action returns silently.** A guarded handler with no matching consent does nothing and reports nothing, exactly as a disallowed sender does today — no error path for a caller to probe.
- **Enforcement is in main, never the renderer.** The renderer decides when to *ask*; it never decides whether an action is allowed.
- **The guard does not exist when the app lock is unconfigured.** `appLock.guardActions && lock.configured()` is the single condition, in one helper.
- **`lock:confirm` shares the lock screen's failure backoff.** Guessing through the confirm dialog must cost exactly what guessing at the lock screen costs.
- **Comment style:** explain *why*, never *what*. One short line beats a paragraph; no comment beats a redundant one.

## File Structure

**Created:**

- `src/renderer/src/components/CredentialConfirm.tsx` — the shared "prove it's you" block: Touch ID button where admitted, passcode field always, backoff countdown, error line. Calls `lock:confirm` and reports success upward. Knows no actions.
- `src/renderer/src/components/SummonConfirm.tsx` — the modal Home opens when a staged edit would un-banish something.
- `tests/unit/summoned-ids.test.ts`, `tests/unit/lock-consent.test.ts`, `tests/unit/guard-policy.test.ts`
- `tests/e2e/guarded-actions.spec.ts`

**Modified:**

- `src/main/lib/banish-rules.ts` — extract `summonedIds`; `stampSummoned` calls it.
- `src/shared/lock.ts` — `GuardedAction`, `ConsentRequest`, `CONSENT_TTL_MS`; `LockConfigure` gains `setGuardActions`.
- `src/shared/types.ts` — `Settings.appLock.guardActions`, its default.
- `src/shared/ipc.ts` — `lock:confirm` invoke channel, `SHELL_ONLY_CHANNELS`, `LOCKED_ALLOWED_CHANNELS` (it must **not** be added there — see Task 4).
- `src/main/settings.ts` — `fillAppLock` gains the field.
- `src/main/lock.ts` — the consent slot, `grantConsent`, `consumeConsent`, and the extracted credential check.
- `src/main/lib/guard-policy.ts` — **created**: `actionGuarded(...)`, the one condition.
- `src/main/ipc-handlers.ts` — the three gates and the `lock:confirm` handler.
- `src/renderer/src/components/PurgeConfirm.tsx` — folds the credential in as its final step.
- `src/renderer/src/components/Welcome.tsx` — opens `SummonConfirm` instead of committing, when the edit summons.
- `src/renderer/src/components/LockPane.tsx` — the new row.

---

### Task 1: `summonedIds` and the shared action types

Pure. Gives the guard and the unused-clock stamp one definition of "a summon".

**Files:**

- Modify: `src/main/lib/banish-rules.ts`
- Modify: `src/shared/lock.ts`
- Test: `tests/unit/summoned-ids.test.ts`

**Interfaces:**

- Consumes: nothing.
- Produces: `summonedIds(order: ServiceId[], before: Record<ServiceId, boolean>, after: Record<ServiceId, boolean>): ServiceId[]` from `src/main/lib/banish-rules`; and from `src/shared/lock.ts`: `CONSENT_TTL_MS: number`, `type GuardedAction = { kind: 'summon' } | { kind: 'purge-one'; serviceId: ServiceId } | { kind: 'purge-all' }`, `interface ConsentRequest { action: GuardedAction; credential: UnlockRequest }`, `sameAction(a: GuardedAction, b: GuardedAction): boolean`.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/summoned-ids.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { summonedIds } from '../../src/main/lib/banish-rules';
import { sameAction } from '../../src/shared/lock';
import type { ServiceId } from '../../src/shared/types';

const order: ServiceId[] = ['discord', 'slack', 'zalo'];
const set = (disabled: ServiceId[]): Record<ServiceId, boolean> =>
  Object.fromEntries(order.map((id) => [id, disabled.includes(id)])) as Record<ServiceId, boolean>;

describe('summonedIds', () => {
  it('names the services that went from banished to summoned', () => {
    expect(summonedIds(order, set(['discord', 'slack']), set(['slack']))).toEqual(['discord']);
  });

  // the daily path: a banish-only edit must never ask for a passcode
  it('is empty for a banish-only change', () => {
    expect(summonedIds(order, set([]), set(['discord', 'slack']))).toEqual([]);
  });

  it('is empty when nothing moved — a reorder-only commit', () => {
    expect(summonedIds(order, set(['zalo']), set(['zalo']))).toEqual([]);
  });

  it('names only the summoned half of a mixed edit', () => {
    expect(summonedIds(order, set(['discord']), set(['slack']))).toEqual(['discord']);
  });

  it('reports in catalog order, however the records are keyed', () => {
    expect(summonedIds(order, set(['discord', 'slack', 'zalo']), set([]))).toEqual([
      'discord',
      'slack',
      'zalo',
    ]);
  });
});

describe('sameAction', () => {
  it('matches a summon to a summon', () => {
    expect(sameAction({ kind: 'summon' }, { kind: 'summon' })).toBe(true);
  });

  it('refuses a different kind', () => {
    expect(sameAction({ kind: 'summon' }, { kind: 'purge-all' })).toBe(false);
  });

  // confirming "purge Slack" must never be spendable on Discord
  it('refuses a purge-one for another service', () => {
    expect(
      sameAction(
        { kind: 'purge-one', serviceId: 'slack' },
        { kind: 'purge-one', serviceId: 'discord' },
      ),
    ).toBe(false);
    expect(
      sameAction({ kind: 'purge-one', serviceId: 'slack' }, { kind: 'purge-one', serviceId: 'slack' }),
    ).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `corepack pnpm vitest run tests/unit/summoned-ids.test.ts`

Expected: FAIL — `summonedIds` and `sameAction` are not exported.

- [ ] **Step 3: Extract `summonedIds`**

In `src/main/lib/banish-rules.ts`, add above `stampSummoned`:

```ts
/** Services this patch un-banishes. The guard and the unused-clock stamp both
 *  need "what counts as a summon", and two copies of that predicate is how
 *  they would come to disagree. */
export function summonedIds(
  order: ServiceId[],
  before: Record<ServiceId, boolean>,
  after: Record<ServiceId, boolean>,
): ServiceId[] {
  return order.filter((id) => before[id] && !after[id]);
}
```

and replace the first line of `stampSummoned`'s body so it calls it:

```ts
  const summoned = summonedIds(opts.order, opts.before, opts.after);
```

- [ ] **Step 4: Add the shared action types**

Append to `src/shared/lock.ts`:

```ts
/** How long a minted consent stays spendable. Short, because it exists only
 *  to bridge the confirm and the action it authorized — a confirm the user
 *  then abandons must not sit armed. */
export const CONSENT_TTL_MS = 60_000;

/** An action that needs the lock's credential even while the app is unlocked.
 *  See the 2026-09-13 spec: the guard is on the direction that *exposes*
 *  (summon) and on the two that destroy (purge), never on banish or reorder. */
export type GuardedAction =
  | { kind: 'summon' }
  | { kind: 'purge-one'; serviceId: ServiceId }
  | { kind: 'purge-all' };

export interface ConsentRequest {
  action: GuardedAction;
  credential: UnlockRequest;
}

/** Exact match on kind *and* service. Without the service, a consent would be
 *  a capability rather than an authorization, and one logic bug would spend a
 *  confirm for Slack on Discord. */
export function sameAction(a: GuardedAction, b: GuardedAction): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'purge-one' && b.kind === 'purge-one') return a.serviceId === b.serviceId;
  return true;
}
```

`src/shared/lock.ts` needs `import type { ServiceId } from './types';` at the top.

- [ ] **Step 5: Run the test to verify it passes**

Run: `corepack pnpm vitest run tests/unit/summoned-ids.test.ts`

Expected: PASS — 2 suites, 8 tests.

- [ ] **Step 6: Verify the whole gate**

Run: `corepack pnpm lint && corepack pnpm typecheck && corepack pnpm test`

Expected: all green — in particular the existing `banish-rules` tests, which must be unaffected by the extraction.

- [ ] **Step 7: Request commit**

Stop and ask the user to run `/grimoire-core:commit`. Summary: "extracts `summonedIds` from `stampSummoned` and adds the guarded-action types. Nothing wired up." Wait for confirmation.

---

### Task 2: The `guardActions` setting

**Files:**

- Modify: `src/shared/types.ts`
- Modify: `src/main/settings.ts`
- Test: `tests/unit/settings.test.ts` (append)

**Interfaces:**

- Consumes: nothing from Task 1.
- Produces: `Settings['appLock']` becomes `{ enabled: boolean; touchId: boolean; guardActions: boolean }`, defaulting to `{ enabled: false, touchId: true, guardActions: true }`.

- [ ] **Step 1: Write the failing test**

Append inside the existing `describe('SettingsStore', …)` in `tests/unit/settings.test.ts`:

```ts
  it('arms the action guard by default, for when the lock is turned on', () => {
    dir = mkdtempSync(join(tmpdir(), 'goetia-'));
    expect(new SettingsStore(dir).get().appLock).toEqual({
      enabled: false,
      touchId: true,
      guardActions: true,
    });
  });

  it('coerces a non-boolean guardActions to the default', () => {
    dir = mkdtempSync(join(tmpdir(), 'goetia-'));
    writeFileSync(
      join(dir, 'settings.json'),
      JSON.stringify({ appLock: { enabled: true, touchId: true, guardActions: 'no' } }),
    );
    expect(new SettingsStore(dir).get().appLock.guardActions).toBe(true);
  });

  it('keeps guardActions off once a settings.json says so', () => {
    dir = mkdtempSync(join(tmpdir(), 'goetia-'));
    writeFileSync(
      join(dir, 'settings.json'),
      JSON.stringify({ appLock: { enabled: true, touchId: true, guardActions: false } }),
    );
    expect(new SettingsStore(dir).get().appLock.guardActions).toBe(false);
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `corepack pnpm vitest run tests/unit/settings.test.ts`

Expected: FAIL — the `appLock` object has no `guardActions`.

- [ ] **Step 3: Add the field and the default**

In `src/shared/types.ts`, replace the `appLock` field declaration inside `interface Settings`:

```ts
  /** Require Touch ID or a passcode before Goetia can be read. The secret
   *  itself lives in lock.json — never here, because ShellState broadcasts
   *  this whole object to the renderer. `touchId` is separately switchable
   *  because Touch ID accepts any finger enrolled on the Mac, which on a
   *  shared machine is exactly the person the lock is aimed at.
   *  `guardActions` extends the same credential to three actions an unlocked
   *  Goetia would otherwise do for anyone — see the 2026-09-13 spec. */
  appLock: { enabled: boolean; touchId: boolean; guardActions: boolean };
```

and in `DEFAULT_SETTINGS`:

```ts
  appLock: { enabled: false, touchId: true, guardActions: true },
```

- [ ] **Step 4: Coerce it**

In `src/main/settings.ts`, add the field to `fillAppLock`'s returned object:

```ts
    guardActions: typeof r.guardActions === 'boolean' ? r.guardActions : d.guardActions,
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `corepack pnpm vitest run tests/unit/settings.test.ts`

Expected: PASS.

- [ ] **Step 6: Verify the whole gate**

Run: `corepack pnpm lint && corepack pnpm typecheck && corepack pnpm test`

Expected: all green. `typecheck` will flag any place constructing an `appLock` literal — fix those to include the new field.

- [ ] **Step 7: Request commit**

Stop and ask for `/grimoire-core:commit`. Summary: "adds `appLock.guardActions`, default on, with its coercion."

---

### Task 3: The consent slot

**Files:**

- Modify: `src/main/lock.ts`
- Test: `tests/unit/lock-consent.test.ts`

**Interfaces:**

- Consumes: `CONSENT_TTL_MS`, `GuardedAction`, `sameAction` (Task 1); `LockController`, `LockDeps` (existing).
- Produces: on `LockController` — `grantConsent(action: GuardedAction, credential: UnlockRequest): Promise<UnlockResult>` and `consumeConsent(action: GuardedAction): boolean`. `LockDeps.persist` widens to `{ enabled?: boolean; touchId?: boolean; guardActions?: boolean }`.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/lock-consent.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `corepack pnpm vitest run tests/unit/lock-consent.test.ts`

Expected: FAIL — `grantConsent` is not a function.

- [ ] **Step 3: Extract the credential check**

In `src/main/lock.ts`, `unlock` currently verifies inline. Pull that out so `grantConsent` cannot drift from it. Replace the body of `unlock` and add the private helper:

```ts
  async unlock(req: UnlockRequest): Promise<UnlockResult> {
    if (!this.locked) return { ok: false, waitMs: 0, reason: 'unavailable' };
    const result = await this.check(req);
    if (result.ok) this.open();
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
```

and change `open()` so it no longer returns a result, since `unlock` now builds its own:

```ts
  private open(): void {
    this.locked = false;
    this.failures = 0;
    this.blockedUntil = 0;
  }
```

- [ ] **Step 4: Add the consent slot**

Still in `src/main/lock.ts`, add the import and the field:

```ts
import {
  CONSENT_TTL_MS,
  type GuardedAction,
  type LockConfigResult,
  type LockConfigure,
  sameAction,
  type UnlockRequest,
  type UnlockResult,
} from '../shared/lock';
```

```ts
  /** The one action the user has just authorized. Single slot, single use:
   *  this is "yes, do that", not a standing permission. */
  private consent: { action: GuardedAction; at: number } | null = null;
```

Add `this.consent = null;` to `lock()`, beside the existing `this.pending = null;` — a lock is a clean slate, and an authorization granted before it must not survive it.

Then the two methods:

```ts
  /** Authorize one guarded action. Unlike unlock() this runs while the app is
   *  open, which is the whole point: it guards acting, not reading. */
  async grantConsent(action: GuardedAction, credential: UnlockRequest): Promise<UnlockResult> {
    if (!this.deps.enabled() || !this.store.has()) {
      return { ok: false, waitMs: 0, reason: 'unavailable' };
    }
    const result = await this.check(credential);
    if (result.ok) this.consent = { action, at: this.deps.now() };
    return result;
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
```

Widen `LockDeps.persist` so Task 5 can write the new flag:

```ts
  persist(patch: { enabled?: boolean; touchId?: boolean; guardActions?: boolean }): void;
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `corepack pnpm vitest run tests/unit/lock-consent.test.ts`

Expected: PASS — 2 suites, 12 tests.

- [ ] **Step 6: Verify the whole gate**

Run: `corepack pnpm lint && corepack pnpm typecheck && corepack pnpm test`

Expected: all green. `tests/unit/lock-controller.test.ts` is the real check on Step 3 — the unlock and backoff behaviour must be identical after the extraction.

- [ ] **Step 7: Request commit**

Stop and ask for `/grimoire-core:commit`. Summary: "`LockController` gains a single-use, action-bound consent, and the credential check is shared with the lock screen so both pay the same backoff."

---

### Task 4: `lock:confirm`, the guard condition, and the setting write

**Files:**

- Modify: `src/shared/ipc.ts`
- Modify: `src/shared/lock.ts` (`LockConfigure` gains `setGuardActions`)
- Modify: `src/main/lock.ts` (`configure` handles it)
- Create: `src/main/lib/guard-policy.ts`
- Modify: `src/main/ipc-handlers.ts` (register the channel)
- Test: `tests/unit/guard-policy.test.ts`

**Interfaces:**

- Consumes: `ConsentRequest`, `GuardedAction` (Task 1); `grantConsent` (Task 3); `Settings['appLock']` (Task 2).
- Produces: invoke channel `lock:confirm` (payload `ConsentRequest`, result `UnlockResult`); `actionGuarded(opts: { guardActions: boolean; configured: boolean }): boolean` from `src/main/lib/guard-policy`; `LockConfigure` variant `{ action: 'setGuardActions'; current: string; guardActions: boolean }`.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/guard-policy.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { actionGuarded } from '../../src/main/lib/guard-policy';
import { INVOKE_CHANNELS, LOCKED_ALLOWED_CHANNELS, SHELL_ONLY_CHANNELS } from '../../src/shared/ipc';

describe('actionGuarded', () => {
  it('guards only when the setting is on and a passcode exists', () => {
    expect(actionGuarded({ guardActions: true, configured: true })).toBe(true);
  });

  // no credential to ask for: the guard is absent, and the UI says so rather
  // than degrading into something weaker
  it('is off when the lock was never configured', () => {
    expect(actionGuarded({ guardActions: true, configured: false })).toBe(false);
  });

  it('is off when the user turned it off', () => {
    expect(actionGuarded({ guardActions: false, configured: true })).toBe(false);
    expect(actionGuarded({ guardActions: false, configured: false })).toBe(false);
  });
});

describe('lock:confirm classification', () => {
  it('is a shell-only invoke channel', () => {
    expect(INVOKE_CHANNELS).toContain('lock:confirm');
    expect(SHELL_ONLY_CHANNELS.has('lock:confirm')).toBe(true);
  });

  // it authorizes an action, and a locked app must perform none — so unlike
  // lock:unlock it stays refused behind the lock screen
  it('is NOT served while the app is locked', () => {
    expect(LOCKED_ALLOWED_CHANNELS.has('lock:confirm')).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `corepack pnpm vitest run tests/unit/guard-policy.test.ts`

Expected: FAIL — `Failed to resolve import "../../src/main/lib/guard-policy"`.

- [ ] **Step 3: Write the policy helper**

Create `src/main/lib/guard-policy.ts`:

```ts
/** Whether the three guarded actions need a credential right now. One
 *  condition in one place: the setting alone is not enough, because with no
 *  passcode stored there is nothing to ask for. */
export function actionGuarded(opts: { guardActions: boolean; configured: boolean }): boolean {
  return opts.guardActions && opts.configured;
}
```

- [ ] **Step 4: Declare the channel**

In `src/shared/ipc.ts`, add `ConsentRequest` to the type import from `./lock`, add to `RendererInvoke`:

```ts
  /** Authorize one guarded action — a summon or a purge — with the lock's
   *  credential. Shell-only, and deliberately absent from
   *  LOCKED_ALLOWED_CHANNELS: a locked app performs no actions at all. */
  'lock:confirm': { payload: ConsentRequest; result: UnlockResult };
```

Add `'lock:confirm',` to `INVOKE_CHANNELS` and to `SHELL_ONLY_CHANNELS`. **Do not** add it to `LOCKED_ALLOWED_CHANNELS`.

- [ ] **Step 5: Add the setting write**

In `src/shared/lock.ts`, extend `LockConfigure`:

```ts
  | { action: 'setGuardActions'; current: string; guardActions: boolean }
```

In `src/main/lock.ts`'s `configure`, the final branch currently assumes `setTouchId`. Replace it with an explicit pair so a new action can never fall through to the wrong write:

```ts
    if (req.action === 'setTouchId') {
      this.deps.persist({ touchId: req.touchId });
      return { ok: true };
    }
    this.deps.persist({ guardActions: req.guardActions });
    return { ok: true };
```

- [ ] **Step 6: Register the handler**

In `src/main/ipc-handlers.ts`, beside the other `lock:*` handlers:

```ts
  onInvoke('lock:confirm', { ok: false, waitMs: 0, reason: 'unavailable' }, (req) =>
    ctx.lock.grantConsent(req.action, req.credential),
  );
```

- [ ] **Step 7: Run the test to verify it passes**

Run: `corepack pnpm vitest run tests/unit/guard-policy.test.ts`

Expected: PASS.

- [ ] **Step 8: Verify the whole gate**

Run: `corepack pnpm lint && corepack pnpm typecheck && corepack pnpm test && env -u ELECTRON_RUN_AS_NODE corepack pnpm e2e`

Expected: all green. Nothing consumes a consent yet, so behaviour is unchanged.

- [ ] **Step 9: Request commit**

Stop and ask for `/grimoire-core:commit`. Summary: "`lock:confirm` mints consents; `actionGuarded` is the one guard condition; `setGuardActions` persists the switch."

---

### Task 5: The three gates in main

The task that makes the consent mean something. Still invisible, because `guardActions` only bites once the lock is configured — and the renderer does not yet ask, so this task is written and tested with the guard deliberately reachable only from tests until Task 7.

**Files:**

- Modify: `src/main/ipc-handlers.ts`
- Test: `tests/e2e/guarded-actions.spec.ts` covers this end to end in Task 10; the unit-level contract is `guard-policy` + `lock-consent`, already covered.

**Interfaces:**

- Consumes: `summonedIds` (Task 1), `actionGuarded` (Task 4), `consumeConsent` (Task 3).
- Produces: no new exports.

- [ ] **Step 1: Add the guard helper to `ipc-handlers.ts`**

Add the imports:

```ts
import { stampSummoned, summonedIds } from './lib/banish-rules';
import { actionGuarded } from './lib/guard-policy';
import type { GuardedAction } from '../shared/lock';
```

(`stampSummoned` is already imported — extend that line rather than duplicating it.)

Add beside the other module-level helpers:

```ts
/** True when this action may proceed: either the guard is off, or the user
 *  has just authorized exactly this action. A refusal is silent, like every
 *  other refusal in this file. */
function authorized(ctx: AppContext, action: GuardedAction): boolean {
  const guarded = actionGuarded({
    guardActions: ctx.settings.get().appLock.guardActions,
    configured: ctx.lock.configured(),
  });
  return !guarded || ctx.lock.consumeConsent(action);
}
```

- [ ] **Step 2: Gate the summon**

In the `settings:update` handler, insert before the existing `const stamped = …` line:

```ts
    // The whole frame is refused, not just its disabled half: Home commits
    // adds, removals and the new order together on purpose, so there is no
    // partial patch to apply. A banish-only or reorder-only commit summons
    // nothing and never reaches this branch.
    if (patch.disabled) {
      const summoned = summonedIds(before.order, before.disabled, patch.disabled);
      if (summoned.length > 0 && !authorized(ctx, { kind: 'summon' })) return;
    }
```

- [ ] **Step 3: Gate the two purges**

Replace the `service:purgeLogin` registration:

```ts
  on('service:purgeLogin', ({ serviceId }) => {
    if (!authorized(ctx, { kind: 'purge-one', serviceId })) return;
    void purgeLogin(ctx, serviceId);
  });
```

and the `services:purgeAll` registration:

```ts
  onInvoke('services:purgeAll', { purged: 0 }, () => {
    if (!authorized(ctx, { kind: 'purge-all' })) return { purged: 0 };
    return purgeAll(ctx);
  });
```

A refused sweep returns `{ purged: 0 }` — the same shape a blocked sender gets, so the renderer's toast says nothing happened, which is true.

- [ ] **Step 4: Confirm auto-banish is untouched**

Read `ctx.banishServices` in `src/main/index.ts`. It calls `settings.update` directly and never routes through the `settings:update` handler, so it cannot hit the gate; and it only ever sets `disabled` to `true`, so `summonedIds` would be empty regardless. Both facts are load-bearing — do not "tidy" `banishServices` onto the handler path.

Add nothing. This step is a read, and a note for the reviewer.

- [ ] **Step 5: Verify the whole gate**

Run: `corepack pnpm lint && corepack pnpm typecheck && corepack pnpm test && env -u ELECTRON_RUN_AS_NODE corepack pnpm e2e`

Expected: all green. Every e2e profile leaves the lock unconfigured, so `actionGuarded` is false throughout and all three gates are transparent — including `purge.spec.ts` and `welcome.spec.ts`, which are the real check here.

- [ ] **Step 6: Request commit**

Stop and ask for `/grimoire-core:commit`. Summary: "summon and both purges consume a matching consent when the guard is on; auto-banish is excluded by construction."

---

### Task 6: `CredentialConfirm`

The shared "prove it's you" block. Knows how to ask; knows nothing about what it authorizes.

**Files:**

- Create: `src/renderer/src/components/CredentialConfirm.tsx`

**Interfaces:**

- Consumes: `admittedCredentials`, `GuardedAction`, `UnlockResult` (Tasks 1 and the app lock); channel `lock:confirm` (Task 4).
- Produces: default export `CredentialConfirm`, props `{ action: GuardedAction; onVerified(): void; autoFocus?: boolean }`.

- [ ] **Step 1: Write the component**

Create `src/renderer/src/components/CredentialConfirm.tsx`:

```tsx
import type React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { admittedCredentials, type GuardedAction, type UnlockResult } from '../../../shared/lock';
import { useShell } from '../store';

interface Props {
  action: GuardedAction;
  onVerified(): void;
  autoFocus?: boolean;
}

/** One implementation of "prove it's you", shared by the purge confirm and
 *  Home's summon confirm, so both read identically. It asks and reports; it
 *  decides nothing — main is what refuses the action.
 *
 *  Touch ID is offered here, unlike in Settings → Lock: these authorize
 *  ordinary work rather than weakening the lock itself. */
export default function CredentialConfirm({ action, onVerified, autoFocus }: Props) {
  const touchIdSetting = useShell((s) => s.state?.settings.appLock.touchId ?? false);
  const sensorAvailable = useShell((s) => s.state?.touchIdAvailable ?? false);
  const [passcode, setPasscode] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [waitUntil, setWaitUntil] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const field = useRef<HTMLInputElement>(null);

  const admitted = admittedCredentials({ touchIdSetting, sensorAvailable });
  const waitMs = Math.max(0, waitUntil - now);

  useEffect(() => {
    if (autoFocus) field.current?.focus();
  }, [autoFocus]);

  useEffect(() => {
    if (waitMs <= 0) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [waitMs]);

  const apply = useCallback(
    (result: UnlockResult) => {
      if (result.ok) {
        setPasscode('');
        setMessage('');
        onVerified();
        return;
      }
      if (result.waitMs > 0) {
        setWaitUntil(Date.now() + result.waitMs);
        return;
      }
      if (result.reason === 'wrong') {
        setPasscode('');
        setMessage('That is not your passcode.');
      } else if (result.reason === 'unreadable') {
        setMessage('Goetia cannot read its stored passcode on this device.');
      } else if (result.reason === 'cancelled') {
        setMessage('');
      }
    },
    [onVerified],
  );

  const confirm = async (
    credential: { method: 'touchId' } | { method: 'passcode'; passcode: string },
  ) => {
    setBusy(true);
    apply(await window.goetia.invoke('lock:confirm', { action, credential }));
    setBusy(false);
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (busy || waitMs > 0 || passcode === '') return;
    void confirm({ method: 'passcode', passcode });
  };

  return (
    <form onSubmit={submit} data-testid="credential-confirm" className="mt-3.5">
      <div className="flex items-center gap-2">
        <input
          ref={field}
          type="password"
          value={passcode}
          data-testid="credential-passcode"
          aria-label="Your passcode"
          placeholder="Your passcode"
          autoComplete="off"
          disabled={busy || waitMs > 0}
          onChange={(e) => setPasscode(e.target.value)}
          className="min-w-0 flex-1 rounded-ctl border border-border bg-bg-2 px-2 py-1 text-text-1
            outline-none transition-colors duration-120 focus:border-accent disabled:opacity-50"
        />
        {admitted.touchId && (
          <button
            type="button"
            data-testid="credential-touchid"
            disabled={busy}
            onClick={() => void confirm({ method: 'touchId' })}
            className="flex-none rounded-ctl border border-border bg-bg-2 px-2.5 py-1 text-text-1
              transition-colors duration-120 hover:border-accent disabled:opacity-50"
          >
            Touch ID
          </button>
        )}
      </div>
      <p role="alert" data-testid="credential-message" className="h-4 pt-1 text-[11px] text-danger">
        {waitMs > 0 ? `Too many attempts. Try again in ${Math.ceil(waitMs / 1000)}s.` : message}
      </p>
    </form>
  );
}
```

- [ ] **Step 2: Verify it compiles and lints**

Run: `corepack pnpm lint && corepack pnpm typecheck`

Expected: both green. Nothing renders it yet.

- [ ] **Step 3: Request commit**

Stop and ask for `/grimoire-core:commit`. Summary: "the shared credential-confirm block; no call sites yet."

---

### Task 7: Fold it into `PurgeConfirm`

**Files:**

- Modify: `src/renderer/src/components/PurgeConfirm.tsx`

**Interfaces:**

- Consumes: `CredentialConfirm` (Task 6); `actionGuarded`'s renderer twin — the pane reads `appLock.guardActions` and `lockConfigured` from `ShellState` directly.
- Produces: no new exports.

- [ ] **Step 1: Gate the confirm button on the credential**

In `src/renderer/src/components/PurgeConfirm.tsx`, add the import:

```tsx
import CredentialConfirm from './CredentialConfirm';
```

Do **not** import `actionGuarded` from `main/lib/` — that would pull main-process code into the renderer bundle. The renderer reads the same two fields off `ShellState` instead; main remains the only enforcer either way.

Add beside the existing `acked` state:

```tsx
  const [verified, setVerified] = useState(false);
  const guardActions = useShell((s) => s.state?.settings.appLock.guardActions ?? false);
  const lockConfigured = useShell((s) => s.state?.lockConfigured ?? false);
```

Reset it with `acked` in the existing effect:

```tsx
  useEffect(() => {
    setAcked(false);
    setVerified(false);
  }, [request]);
```

Replace the `ready` line:

```tsx
  const guarded = guardActions && lockConfigured;
  const ready = (!gated || acked) && (!guarded || verified);
```

- [ ] **Step 2: Render the block**

Immediately after the `{copy.checkboxLabel && (…)}` block and before the button row:

```tsx
        {guarded && !verified && (
          <CredentialConfirm
            autoFocus
            action={
              request.kind === 'all'
                ? { kind: 'purge-all' }
                : { kind: 'purge-one', serviceId: request.id }
            }
            onVerified={() => setVerified(true)}
          />
        )}
```

The action is built from the request the modal already holds, so the consent is bound to the very service named in the dialog's own title.

- [ ] **Step 3: Verify the whole gate**

Run: `corepack pnpm lint && corepack pnpm typecheck && corepack pnpm test && env -u ELECTRON_RUN_AS_NODE corepack pnpm e2e`

Expected: all green — `purge.spec.ts` in particular, whose profiles have no lock configured, so `guarded` is false and the modal behaves exactly as before.

- [ ] **Step 4: Request commit**

Stop and ask for `/grimoire-core:commit`. Summary: "the purge confirm asks for the credential as its final step when the guard is on, instead of stacking a second dialog."

---

### Task 8: Home's summon confirm

**Files:**

- Create: `src/renderer/src/components/SummonConfirm.tsx`
- Modify: `src/renderer/src/components/Welcome.tsx`

**Interfaces:**

- Consumes: `CredentialConfirm` (Task 6); `summonedIds`' renderer-side equivalent — Home already knows its own delta.
- Produces: default export `SummonConfirm`, props `{ names: string[]; onVerified(): void; onCancel(): void }`.

- [ ] **Step 1: Write the modal**

Create `src/renderer/src/components/SummonConfirm.tsx`:

```tsx
import { useEffect } from 'react';
import CredentialConfirm from './CredentialConfirm';

interface Props {
  /** the services this commit would bring back, named for the dialog */
  names: string[];
  onVerified(): void;
  onCancel(): void;
}

/** Summoning is the direction that exposes: a banished service keeps its
 *  login, so bringing one back reveals conversations the user took off the
 *  rail. Banishing and reordering are unguarded and never open this. */
export default function SummonConfirm({ names, onVerified, onCancel }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      // capture + stopPropagation: Welcome closes itself on Escape and must
      // not fire underneath this, the PurgeConfirm pattern
      e.stopPropagation();
      onCancel();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onCancel]);

  const title = names.length === 1 ? `Summon ${names[0]}?` : `Summon ${names.length} services?`;

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: backdrop click-to-dismiss, mirrored on Escape
    // biome-ignore lint/a11y/useKeyWithClickEvents: Escape is handled on window above
    <div
      data-testid="summon-confirm"
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/50"
      onClick={onCancel}
    >
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: dismissal keys live on window above */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="w-[380px] rounded-lg border border-border bg-bg-1 p-4
          shadow-[0_12px_32px_rgba(0,0,0,0.5)]"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="font-semibold text-text-1">{title}</h2>
        <p className="mt-1.5 text-text-2">
          {names.join(', ')} {names.length === 1 ? 'is' : 'are'} banished. Bringing{' '}
          {names.length === 1 ? 'it' : 'them'} back puts the conversations on your rail again.
        </p>
        <CredentialConfirm autoFocus action={{ kind: 'summon' }} onVerified={onVerified} />
        <div className="mt-2 flex justify-end">
          <button
            type="button"
            data-testid="summon-cancel"
            onClick={onCancel}
            className="rounded-ctl border border-border bg-bg-2 px-4 py-2 text-text-1
              transition-colors duration-120 hover:border-accent"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
```

There is no confirm button: verifying *is* the confirmation, and a second click would only be a place to forget to disable.

- [ ] **Step 2: Open it from Home when the edit summons**

In `src/renderer/src/components/Welcome.tsx`, add the import and a piece of local state (local, not the store — only Welcome opens this):

```tsx
import SummonConfirm from './SummonConfirm';
```

```tsx
  const [askSummon, setAskSummon] = useState<ServiceId[] | null>(null);
```

Replace the `summon` function:

```tsx
  // one patch: adds, removals and the new order land together, so activation
  // and the app menu resolve against a single consistent frame
  const commit = () =>
    window.goetia.send('settings:update', {
      disabled: buildDisabledPatch(order, stagedSet),
      order: commitOrder(order, staged),
    });
  // summoning reveals conversations that were deliberately off the rail, so it
  // asks when the guard is on; banishing and reordering never do
  const summon = () => {
    const brought = order.filter((id) => state.settings.disabled[id] && stagedSet.has(id));
    const guarded = state.settings.appLock.guardActions && state.lockConfigured;
    if (guarded && brought.length > 0) {
      setAskSummon(brought);
      return;
    }
    commit();
  };
```

Render the modal at the end of the component's returned tree, as a sibling of the board (inside the outermost `div`):

```tsx
      {askSummon && (
        <SummonConfirm
          names={askSummon.map((id) => byId.get(id)?.name ?? id)}
          onVerified={() => {
            setAskSummon(null);
            commit();
          }}
          onCancel={() => setAskSummon(null)}
        />
      )}
```

`byId` is the `Map<ServiceId, ServiceMeta>` already built above the return in `Welcome.tsx`. Do **not** reach for `named`: `byName` returns a sorted `ServiceId[]`, not a name lookup.

- [ ] **Step 3: Verify the whole gate**

Run: `corepack pnpm lint && corepack pnpm typecheck && corepack pnpm test && env -u ELECTRON_RUN_AS_NODE corepack pnpm e2e`

Expected: all green — `welcome.spec.ts`, `banish.spec.ts` and `reorder.spec.ts` especially. Their profiles have no lock, so `guarded` is false and Home commits directly as before.

- [ ] **Step 4: Request commit**

Stop and ask for `/grimoire-core:commit`. Summary: "Home asks for the credential before a commit that un-banishes anything; banish-only and reorder-only commits are untouched."

---

### Task 9: The Settings → Lock row

**Files:**

- Modify: `src/renderer/src/components/LockPane.tsx`

**Interfaces:**

- Consumes: `setGuardActions` (Task 4); the pane's existing `verified` gate.
- Produces: no new exports.

- [ ] **Step 1: Add the row**

In `src/renderer/src/components/LockPane.tsx`, read the setting beside the others:

```tsx
  const guardActions = useShell((s) => s.state?.settings.appLock.guardActions ?? true);
```

Add the row inside the unlocked branch, immediately after the `Use Touch ID` block and before `Change passcode`:

```tsx
          <div
            className="flex items-center justify-between gap-4 border-b border-border py-2"
            data-testid="lock-guard-row"
          >
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="text-text-1">Ask before summoning a service or purging a login</span>
              <span className="text-[11px] text-text-2">
                A banished service keeps its login, so summoning one back reveals its conversations
                — and a purge cannot be undone. This asks even while Goetia is unlocked. It does not
                guard services already on your rail.
              </span>
            </span>
            <input
              type="checkbox"
              checked={guardActions}
              data-testid="lock-guard-toggle"
              disabled={busy}
              onChange={(e) =>
                change(
                  { action: 'setGuardActions', current: verified, guardActions: e.target.checked },
                  e.target.checked ? 'Asking before those actions.' : 'No longer asking.',
                )
              }
            />
          </div>
```

It sits inside the pane's existing passcode gate, so weakening the guard is itself an authorized change — no extra work needed.

- [ ] **Step 2: Verify the whole gate**

Run: `corepack pnpm lint && corepack pnpm typecheck && corepack pnpm test && env -u ELECTRON_RUN_AS_NODE corepack pnpm e2e`

Expected: all green, including `tests/e2e/lock.spec.ts`.

- [ ] **Step 3: Verify by hand**

Run: `corepack pnpm dev`. Settings → Lock, set a passcode, enter it to unlock the pane, and confirm the new row is present and toggles with a status line. Then banish a service on Home, and summon it back: expect the summon confirm. Banish one and commit: expect no prompt.

- [ ] **Step 4: Request commit**

Stop and ask for `/grimoire-core:commit`. Summary: "Settings → Lock gains the guard switch, behind the same passcode gate as the other rows."

---

### Task 10: End-to-end coverage

**Files:**

- Create: `tests/e2e/guarded-actions.spec.ts`

**Interfaces:**

- Consumes: everything above.
- Produces: no exports.

- [ ] **Step 1: Write the spec**

Create `tests/e2e/guarded-actions.spec.ts`. It follows `tests/e2e/lock.spec.ts`: launch once to set a passcode through the pane, then drive the guarded paths. Touch ID is switched off in the profile so nothing waits on a prompt that cannot be driven.

```ts
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { _electron as electron, expect, type Page, test } from '@playwright/test';

const PASSCODE = 'correct horse';
const isShell = (p: Page) => p.url().startsWith('file://') && !p.url().includes('loading.html');

function makeProfile(): string {
  const profile = mkdtempSync(join(tmpdir(), 'goetia-e2e-guard-'));
  writeFileSync(
    join(profile, 'settings.json'),
    JSON.stringify({
      lastActiveId: 'zalo',
      lastHomeOpen: true,
      disabled: {
        whatsapp: true,
        messenger: true,
        telegram: true,
        discord: true,
        zalo: false,
        tiktok: true,
        shopee: true,
        instagram: true,
        slack: true,
        teams: true,
      },
      appLock: { enabled: false, touchId: false, guardActions: true },
    }),
  );
  return profile;
}

async function launch(profile: string) {
  const app = await electron.launch({
    args: ['out/main/index.js', '--goetia-e2e', `--goetia-user-data=${profile}`],
  });
  const win =
    app.windows().find(isShell) ?? (await app.waitForEvent('window', { predicate: isShell }));
  await win.waitForLoadState('domcontentloaded');
  return { app, win };
}

/** turn the lock on, which is what arms the guard */
async function armLock(win: Page) {
  await win.getByTestId('settings-btn').click();
  await win.getByTestId('settings-nav-lock').click();
  await win.getByTestId('lock-new-passcode').fill(PASSCODE);
  await win.getByTestId('lock-enable').click();
  await expect(win.getByTestId('lock-status')).toHaveText('Lock on.');
  await win.keyboard.press('Escape');
}

test('summoning asks for the passcode; banishing does not', async () => {
  const { app, win } = await launch(makeProfile());
  await armLock(win);
  await win.keyboard.press('Meta+Shift+G');

  // banishing the one summoned service commits with no prompt at all
  await win.getByTestId('summoned-tile-zalo').click();
  await win.getByTestId('home-summon').click();
  await expect(win.getByTestId('summon-confirm')).toHaveCount(0);

  // bringing it back asks, and a wrong passcode leaves it banished
  await win.getByTestId('pick-tile-zalo').click();
  await win.getByTestId('home-summon').click();
  await expect(win.getByTestId('summon-confirm')).toBeVisible();
  await win.getByTestId('credential-passcode').fill('not the passcode');
  await win.getByTestId('credential-passcode').press('Enter');
  await expect(win.getByTestId('credential-message')).toHaveText('That is not your passcode.');
  await expect(win.getByTestId('summon-confirm')).toBeVisible();

  // the right one commits it
  await expect(win.getByTestId('credential-passcode')).toBeEnabled({ timeout: 5000 });
  await win.getByTestId('credential-passcode').fill(PASSCODE);
  await win.getByTestId('credential-passcode').press('Enter');
  await expect(win.getByTestId('summon-confirm')).toHaveCount(0);
  await expect(win.getByTestId('rail-tile-zalo')).toBeVisible();

  await app.close();
});

test('purging asks for the passcode, and a wrong one leaves the login alone', async () => {
  const { app, win } = await launch(makeProfile());
  await armLock(win);
  await win.getByTestId('settings-btn').click();
  await win.getByTestId('settings-nav-services').click();
  await win.getByTestId('purge-zalo').click();

  await expect(win.getByTestId('purge-confirm')).toBeVisible();
  // the confirm cannot be pressed until the credential passes
  await expect(win.getByTestId('purge-confirm-btn')).toBeDisabled();
  await win.getByTestId('credential-passcode').fill('not the passcode');
  await win.getByTestId('credential-passcode').press('Enter');
  await expect(win.getByTestId('credential-message')).toHaveText('That is not your passcode.');
  await expect(win.getByTestId('purge-confirm-btn')).toBeDisabled();

  await expect(win.getByTestId('credential-passcode')).toBeEnabled({ timeout: 5000 });
  await win.getByTestId('credential-passcode').fill(PASSCODE);
  await win.getByTestId('credential-passcode').press('Enter');
  await expect(win.getByTestId('purge-confirm-btn')).toBeEnabled();

  await app.close();
});
```

- [ ] **Step 2: Fix the selectors against the real DOM**

The test ids above — `summoned-tile-zalo`, `pick-tile-zalo`, `home-summon`, `rail-tile-zalo`, `purge-zalo` — are the ones this plan expects; they may not be what the components actually emit.

Run: `grep -rn "data-testid" src/renderer/src/components/welcome/ src/renderer/src/components/ServiceTile.tsx src/renderer/src/components/SettingsView.tsx | head -40`

and reconcile. Use the ids `welcome.spec.ts`, `banish.spec.ts` and `purge.spec.ts` already drive rather than inventing new ones; add a `data-testid` to a component only if no existing id reaches the element.

- [ ] **Step 3: Run it**

Run: `env -u ELECTRON_RUN_AS_NODE corepack pnpm e2e tests/e2e/guarded-actions.spec.ts`

Expected: PASS, 2 tests. Note the backoff: the wrong attempt arms a 1s block, which is why each test waits for the field to re-enable rather than sleeping.

- [ ] **Step 4: Verify the whole suite**

Run: `corepack pnpm lint && corepack pnpm typecheck && corepack pnpm test && env -u ELECTRON_RUN_AS_NODE corepack pnpm e2e`

Expected: everything green, every pre-existing spec included.

- [ ] **Step 5: Hand-check what tests cannot reach**

On a real Touch ID Mac, with the lock on, `Use Touch ID` on and the guard on:

1. Summon a banished service → the confirm shows a Touch ID button; accepting commits the summon.
2. Cancel the Touch ID prompt → nothing commits, and the passcode field is usable immediately with no countdown.
3. Turn `Use Touch ID` off in Settings → Lock → the confirm shows no Touch ID button at all.

- [ ] **Step 6: Request commit**

Stop and ask for `/grimoire-core:commit`. Summary: "e2e — a summon asks and a banish does not; a purge asks and a wrong passcode leaves the login alone."

---

## Spec Coverage

| Spec section | Task |
| --- | --- |
| Threat model — documented limits | Task 9's row copy states what it does and does not guard |
| Decisions — summon guarded, banish not | 1, 5, 8 |
| Decisions — reorder never guarded | 1, 5, 8 |
| Decisions — both purges guarded | 5, 7 |
| Decisions — a timer never prompts | 5 (Step 4, by construction) |
| Decisions — own switch, on by default | 2, 4, 9 |
| Decisions — every action asks, no grace window | 3 (single-use consent) |
| Decisions — one-shot action-bound consent | 3 |
| Decisions — Touch ID accepted here | 3, 6 |
| What is guarded (the table) | 1, 5 |
| Consent — `lock:confirm`, `consume`, TTL, silent refusal | 3, 4, 5 |
| Surfaces — Settings row | 9 |
| Surfaces — `CredentialConfirm` | 6 |
| Surfaces — purge folds in | 7 |
| Surfaces — Home summon | 8 |
| Testing — unit, integration, e2e | 1, 3, 4, 10 |

## Known gaps, stated rather than buried

- **Touch ID is hand-verified only** (Task 10 Step 5). Biometrics cannot be driven headlessly; the logic is unit-tested through `LockController`'s injected `biometric`.
- **Anyone with a finger enrolled on this Mac passes this guard**, exactly as they pass the lock screen. `Use Touch ID` off is the answer, and Task 9's copy says so.
- **The guard is absent when the app lock is unconfigured.** Deliberate — there is no credential to ask for — and `actionGuarded` makes it one condition in one place rather than a scatter of `&&`s.

## Implementation notes (2026-09-13)

All 10 tasks executed. Final state: `lint`, `typecheck`, 1035 unit tests and 47 e2e specs green. Two places where the plan was wrong and the test was corrected rather than forced:

1. **The plan's e2e repeated a mistake already fixed once in `lock.spec.ts`.** After a wrong passcode the backoff is armed, and `check()` tests it *before* the credential — so the next attempt is refused on time however correct it is, and the user clicks once more. Two of the three specs asserted an immediate unlock. Fixed with a named `verifyAfterFailure` helper that spells the sequence out, so the next person writing a credential test sees it rather than rediscovering it.
2. **Task 10's test ids were guesses and mostly wrong.** `summoned-tile-zalo`, `home-summon`, `rail-tile-zalo` and `pick-tile-zalo` do not exist. The real DOM uses a shared `pick-tile` per tile, `service-tile` for the rail, `welcome-section-summoned` / `welcome-section-unbound` for the bands, and reaches individual tiles by accessible name — which is how `welcome.spec.ts` already drives them. The spec now follows that, and the summon button is located by its label (`Summon 1 service` / `Banish 1 service`) from `summonLabel`. Task 10 Step 2 existed to catch exactly this.

Verified by construction rather than by test, as Task 5 Step 4 anticipated: `ctx.banishServices` calls `settings.update` directly at `index.ts:332`, bypassing the handler, and only ever sets `disabled` to `true`. The auto-banish timer therefore cannot reach the gate and cannot raise a prompt.

Not done, deliberately: **no `CLAUDE.md` invariant was added** for the guard, as with the app lock. That file is the project's guardrail record and both features arguably belong in it; it stays the user's call.
