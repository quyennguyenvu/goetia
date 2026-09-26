# Diagnostics Records the Unusual Only — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ten routine lines stop landing in the Diagnostics ring, every refusal, failure, transition and harm-capable action keeps landing there, and the rule that tells them apart is written into CLAUDE.md.

**Architecture:** Pure deletion. Ten `note`/`log` calls go from five main-process files; two deps that existed only for those calls (`DownloadManagerDeps.note`, `PasskeyAuthenticator`'s `log`) go with their `index.ts` wiring; `endPeek` notes only a timeout. No new type, field, filter or sink. Tests that pinned the deleted lines now pin their absence, and one new hibernation case pins the peek rule.

**Tech Stack:** Electron main process (TypeScript), vitest unit tests, Playwright e2e, Biome lint, markdownlint-cli2 for docs.

Spec: `docs/superpowers/specs/2026-09-26-diagnostics-unusual-only-design.md`. Read it first.

## Global Constraints

- **Never run `git commit`.** The user commits through `/grimoire-core:commit` only, after confirming the message, and prefers one commit at the end of an auto run. No task below has a commit step; Task 7 ends by asking the user to run `/commit`.
- **The rule** every change serves: a ring line is either something going wrong, or an action that would harm the user if they were not its author. Never a success, never a cadence. A refused guarded action notes; a granted one does not.
- **Lines that must still note** after every task: every refusal (`refused: no consent`, `unlock refused`, `unlock throttled`, `consent refused`, `consent throttled`, `configure refused`), every `configured: …`, `summoned`, `purged login`, `purged all logins`, `settings imported (n keys)`, `history: removed`, `history cleared`, `folder changed`, `folder reset to the OS default`, `mode: ask`, `mode: save to folder`, `forgot <rpId>`, `peek ended: timeout`, and every `[recipe]`, `[view]`, `[nav]`, `[open]`, `[notifications]`, `[ipc]`, `[identity]`, `[recents]` line plus the keychain notices and `[app] started`.
- **Console mirror unchanged.** `Diagnostics.note` still mirrors to `console.warn`; nothing in this plan touches `lib/diagnostics.ts`, `shared/types.ts`, `shared/diag-filter.ts`, the pane or the two channels.
- **Definition of done:** `corepack pnpm lint`, `corepack pnpm typecheck`, `corepack pnpm test` green, and `env -u ELECTRON_RUN_AS_NODE corepack pnpm e2e` green (VS Code shells export `ELECTRON_RUN_AS_NODE`, which breaks e2e). A single e2e spec runs with `corepack pnpm build && env -u ELECTRON_RUN_AS_NODE npx playwright test tests/e2e/<spec>` — `pnpm e2e -- <spec>` runs the whole suite. Drag and restart e2e specs flake under load; rerun one alone before calling it a regression.
- **Biome formats.** If `corepack pnpm lint` reports only formatting, run `corepack pnpm exec biome check --write .` and re-run lint.
- **Markdown:** every `.md` touched must pass `npx markdownlint-cli2 <file>` with 0 issues. Never hard-wrap prose; one line per paragraph or bullet (the repo turns MD013 off).
- **Comments** explain why, not what; one short line beats a paragraph.

---

### Task 1: The peek cadence leaves the ring

**Files:**

- Modify: `src/main/hibernation.ts:179-206` (`beginPeek`, `endPeek`)
- Test: `tests/unit/hibernation.test.ts`

**Interfaces:**

- Consumes: `HibernationController` (`start`, `noteUnreadReport`, `dispose`), `PEEK_TIMEOUT_MS` from `src/main/lib/peek-rules.ts`, `withPage` from `src/main/lib/diagnostics.ts`.
- Produces: nothing new. `endPeek(destroy: boolean, reason?: 'report' | 'timeout')` keeps its signature; only a `'timeout'` reason notes.

- [ ] **Step 1: Make the harness's `diag.note` observable**

In `tests/unit/hibernation.test.ts`, change the import of peek rules to include the timeout:

```ts
import { PEEK_INTERVAL_MS, PEEK_STAGGER_MS, PEEK_TIMEOUT_MS } from '../../src/main/lib/peek-rules';
```

Inside `harness()`, replace the no-op note with a spy. Change:

```ts
  const ctx = {
    diag: { note: () => {} },
```

to:

```ts
  const note = vi.fn();
  const ctx = {
    diag: { note },
```

and change the harness's return line from:

```ts
  return { ctx, ensured, destroyed, arrive, banished, settings };
```

to:

```ts
  return { ctx, ensured, destroyed, arrive, banished, settings, note };
```

- [ ] **Step 2: Write the two failing tests**

Append at the end of `tests/unit/hibernation.test.ts`:

```ts
describe('HibernationController diagnostics', () => {
  // a peek's start and its end by report are the cadence: at eight sleeping
  // services they rotated the whole 200-line ring every two hours
  it('a peek that ends on the report notes nothing', () => {
    vi.useFakeTimers();
    const { ctx, note } = harness();
    const h = new HibernationController(ctx);
    h.start();
    vi.advanceTimersByTime(BOOT);
    h.noteUnreadReport('discord');
    expect(note).not.toHaveBeenCalled();
    h.dispose();
    vi.useRealTimers();
  });

  it('a peek that times out notes once, with the service', () => {
    vi.useFakeTimers();
    const { ctx, note } = harness();
    const h = new HibernationController(ctx);
    h.start();
    vi.advanceTimersByTime(BOOT);
    vi.advanceTimersByTime(PEEK_TIMEOUT_MS);
    expect(note).toHaveBeenCalledTimes(1);
    expect(note).toHaveBeenCalledWith('peek', 'discord peek ended: timeout', 'discord');
    h.dispose();
    vi.useRealTimers();
  });
});
```

(The harness's `views.pageUrl` returns `null`, so `withPage` leaves the line bare.)

- [ ] **Step 3: Run the tests to verify they fail**

Run: `corepack pnpm exec vitest run tests/unit/hibernation.test.ts -t diagnostics`

Expected: 2 failed. The first sees a `peek started` call; the second sees 2 calls (`peek started` and `peek ended: timeout`).

- [ ] **Step 4: Delete the two cadence notes**

In `src/main/hibernation.ts`, `beginPeek` becomes:

```ts
  private beginPeek(id: ServiceId): void {
    const u = this.ctx.state.runtime(id).unread;
    this.ctx.views.ensure(id);
    const timer = setTimeout(() => {
      if (this.peeking?.id === id) this.endPeek(true, 'timeout');
    }, TIMEOUT_MS);
    this.peeking = { id, timer, before: { direct: u.direct, indirect: u.indirect } };
  }
```

and the head of `endPeek` becomes:

```ts
  /** `reason` names a peek that ran its course; an activation or an external
   *  destroy mid-peek passes none. Only a timeout is a diagnostics line: a
   *  start or a report is the cadence, not evidence. */
  private endPeek(destroy: boolean, reason?: 'report' | 'timeout'): void {
    if (!this.peeking) return;
    const { id, timer, before } = this.peeking;
    clearTimeout(timer);
    this.peeking = null;
    this.lastPeekEndedAt.set(id, Date.now());
    if (reason === 'timeout') {
      this.ctx.diag.note(
        'peek',
        withPage(`${id} peek ended: timeout`, this.ctx.views.pageUrl(id)),
        id,
      );
    }
```

Everything after that `if` (the quiet-streak accounting keyed on `destroy`, `destroyOrGrace`, `scheduleSweep`) stays exactly as it is.

- [ ] **Step 5: Run the hibernation tests to verify they pass**

Run: `corepack pnpm exec vitest run tests/unit/hibernation.test.ts`

Expected: all passed, including the two new cases.

---

### Task 2: A granted credential leaves the ring

**Files:**

- Modify: `src/main/lock.ts:118-122` (dep doc, `method` helper), `:161-172` (`unlock`), `:200-215` (`grantConsent`)
- Test: `tests/unit/lock-controller.test.ts:250-276`, `tests/unit/lock-consent.test.ts:93-104`

**Interfaces:**

- Consumes: `LockController.unlock`, `grantConsent`, `configure`; `LockDeps.note?(line)`.
- Produces: `LockDeps.note` stays, and now receives only `unlock refused: …`, `unlock throttled`, `consent refused: …`, `consent throttled: …`, `configure refused: …` and `configured: …`.

- [ ] **Step 1: Rewrite the three tests to expect no grant**

In `tests/unit/lock-controller.test.ts`, replace the first two cases of `describe('LockController notes', …)` — from `it('records unlocks and refusals with the method and the failure count'` through the end of `it('records a cancelled Touch ID and a throttled try'` — with:

```ts
  it('records refusals with the failure count, never a success', async () => {
    const { controller, notes } = await armed();
    controller.lock();
    await controller.unlock({ method: 'passcode', passcode: 'wrong' });
    await controller.unlock({ method: 'touchId' });
    expect(controller.locked).toBe(false);
    // the whole list: a grant creeping back in fails here
    expect(notes).toEqual(['configured: enabled', 'unlock refused: wrong passcode (1 failures)']);
  });

  it('records a cancelled Touch ID and a throttled try', async () => {
    const { controller, notes, advance } = await armed({ finger: false });
    controller.lock();
    await controller.unlock({ method: 'touchId' });
    await controller.unlock({ method: 'passcode', passcode: 'wrong' });
    await controller.unlock({ method: 'passcode', passcode: 'correct horse' });
    advance(60_000);
    await controller.unlock({ method: 'passcode', passcode: 'correct horse' });
    expect(controller.locked).toBe(false);
    expect(notes).toEqual([
      'configured: enabled',
      'unlock refused: touch id cancelled',
      'unlock refused: wrong passcode (1 failures)',
      'unlock throttled',
    ]);
  });
```

(`armed()` enables the lock through `configure`, which is why `configured: enabled` opens each list.)

In `tests/unit/lock-consent.test.ts`, replace `it('records a granted and a refused consent by action, never by content'` with:

```ts
  it('records a refused consent by action, never by content, and no granted one', async () => {
    const { controller, notes } = await armed();
    await controller.grantConsent({ kind: 'purge-one', serviceId: 'slack' }, pass);
    await controller.grantConsent(
      { kind: 'downloads-remove', ids: [2, 1] },
      { method: 'passcode', passcode: 'wrong' },
    );
    expect(notes).toEqual([
      'configured: enabled',
      'consent refused: downloads-remove (2 rows), wrong passcode (1 failures)',
    ]);
  });
```

- [ ] **Step 2: Run the two files to verify they fail**

Run: `corepack pnpm exec vitest run tests/unit/lock-controller.test.ts tests/unit/lock-consent.test.ts`

Expected: 3 failed — each `notes` array holds an extra `unlocked (…)` or `consent granted: …` entry.

- [ ] **Step 3: Delete the two grant notes and the helper they used**

In `src/main/lock.ts`:

Replace the dep's doc comment:

```ts
  /** ctx.diag.note('lock', …): methods, kinds and counts, never a secret */
  note?(line: string): void;
```

with:

```ts
  /** ctx.diag.note('lock', …): refusals and configurations only — a success
   *  is not evidence. Kinds and counts, never a secret. */
  note?(line: string): void;
```

Delete the `method` helper entirely (its only two callers go below; Biome flags it unused otherwise):

```ts
const method = (req: UnlockRequest): string => (req.method === 'touchId' ? 'touch id' : 'passcode');
```

In `unlock`, change:

```ts
    if (result.ok) {
      this.open();
      this.deps.note?.(`unlocked (${method(req)})`);
    } else {
```

to:

```ts
    if (result.ok) {
      this.open();
    } else {
```

In `grantConsent`, change:

```ts
    if (result.ok) {
      this.consent = { action, at: this.deps.now() };
      this.deps.note?.(`consent granted: ${what} (${method(credential)})`);
    } else {
```

to:

```ts
    if (result.ok) {
      this.consent = { action, at: this.deps.now() };
    } else {
```

`what` is still read by the two refusal lines beneath, so it stays.

- [ ] **Step 4: Run the two files to verify they pass, then lint the file**

Run: `corepack pnpm exec vitest run tests/unit/lock-controller.test.ts tests/unit/lock-consent.test.ts`

Expected: all passed.

Run: `corepack pnpm exec biome check src/main/lock.ts`

Expected: no diagnostics. If it reports `UnlockRequest` as an unused import, it is still used by the `unlock` and `grantConsent` signatures — re-read; do not remove it.

---

### Task 3: The `authorized()` grant, the export and the restore leave the ring

**Files:**

- Modify: `src/main/ipc-handlers.ts:283-293` (`authorized`), `:491` (`settings:export`), `:716-719` (`downloads:restore`)
- Test: `tests/e2e/downloads.spec.ts:292-301`

**Interfaces:**

- Consumes: `describeAction` from `src/shared/lock.ts`, `ctx.lock.consumeConsent`, `ctx.downloads.restore(): number`.
- Produces: `authorized(ctx, action): boolean` unchanged in signature; it notes `[lock] <kind> refused: no consent` and nothing on success.

There is no unit test over `authorized()` (it is thin wiring in `ipc-handlers.ts`); the e2e spec below pins it.

- [ ] **Step 1: Flip the e2e assertion**

In `tests/e2e/downloads.spec.ts`, replace:

```ts
  // the removals and the consent are in the ring, as counts: one removal
  // before the lock, one after, and only the second spent a consent
  await win.getByTestId('settings-nav-diagnostics').click();
  const diag = win.getByTestId('diag-row');
  await expect(diag.filter({ hasText: '[downloads] history: removed 1 rows' })).toHaveCount(2);
  await expect(diag.filter({ hasText: '[downloads] history cleared (2 rows)' })).toHaveCount(1);
  await expect(diag.filter({ hasText: '[lock] downloads-remove (1 rows) authorized' })).toHaveCount(
    1,
  );
  await expect(diag.filter({ hasText: 'note.txt' })).toHaveCount(0);
```

with:

```ts
  // the removals are in the ring, as counts: one before the lock, one after.
  // The consent the second one spent is not — a grant is not evidence
  await win.getByTestId('settings-nav-diagnostics').click();
  const diag = win.getByTestId('diag-row');
  await expect(diag.filter({ hasText: '[downloads] history: removed 1 rows' })).toHaveCount(2);
  await expect(diag.filter({ hasText: '[downloads] history cleared (2 rows)' })).toHaveCount(1);
  await expect(diag.filter({ hasText: 'authorized' })).toHaveCount(0);
  await expect(diag.filter({ hasText: 'consent granted' })).toHaveCount(0);
  await expect(diag.filter({ hasText: 'note.txt' })).toHaveCount(0);
```

- [ ] **Step 2: Delete the three notes**

In `src/main/ipc-handlers.ts`, replace `authorized`:

```ts
/** True when this action may proceed: either the guard is off, or the user
 *  has just authorized exactly this action. A refusal is silent to the
 *  caller, like every other refusal in this file — and noted in the ring,
 *  because someone asked for a guarded action without the credential. */
function authorized(ctx: AppContext, action: GuardedAction): boolean {
  const guarded = guardOn(ctx.settings.get().appLock, ctx.lock.configured(), guardGroupOf(action));
  if (!guarded) return true;
  const ok = ctx.lock.consumeConsent(action);
  const what = describeAction(action);
  ctx.diag.note('lock', ok ? `${what} authorized` : `${what} refused: no consent`);
  return ok;
}
```

with:

```ts
/** True when this action may proceed: either the guard is off, or the user
 *  has just authorized exactly this action. A refusal is silent to the
 *  caller, like every other refusal in this file — and noted in the ring,
 *  because someone asked for a guarded action without the credential. A
 *  grant is not noted: the action's own line records it. */
function authorized(ctx: AppContext, action: GuardedAction): boolean {
  const guarded = guardOn(ctx.settings.get().appLock, ctx.lock.configured(), guardGroupOf(action));
  if (!guarded) return true;
  const ok = ctx.lock.consumeConsent(action);
  if (!ok) ctx.diag.note('lock', `${describeAction(action)} refused: no consent`);
  return ok;
}
```

In the `settings:export` handler, delete this one line (the `return { ok: true, path };` after it stays):

```ts
    ctx.diag.note('app', 'settings exported');
```

Replace the `downloads:restore` handler:

```ts
  on('downloads:restore', () => {
    const n = ctx.downloads.restore();
    if (n > 0) ctx.diag.note('downloads', `history: restored ${n} rows`);
  });
```

with:

```ts
  on('downloads:restore', () => {
    ctx.downloads.restore();
  });
```

- [ ] **Step 3: Typecheck and lint**

Run: `corepack pnpm typecheck && corepack pnpm exec biome check src/main/ipc-handlers.ts`

Expected: both clean. `describeAction` is still imported and used in `authorized`.

- [ ] **Step 4: Run the downloads e2e spec**

Run: `corepack pnpm build && env -u ELECTRON_RUN_AS_NODE npx playwright test tests/e2e/downloads.spec.ts`

Expected: passed. The `history: removed` count of 2 and `history cleared` count of 1 prove the audit lines survived; the two zero counts prove the grants are gone (Task 2 removed `consent granted`).

---

### Task 4: The user's cancel leaves the ring, and the dep with it

**Files:**

- Modify: `src/main/downloads.ts:75-76` (dep), `:104-105` (`userCancelled`), `:204-207` (`finish`), `:245-254` (`cancel`)
- Modify: `src/main/index.ts:237` (wiring)
- Test: `tests/unit/downloads.test.ts:88,107,114,512-521`

**Interfaces:**

- Consumes: `DownloadManagerDeps`, `DownloadManager.cancel(id: number): boolean`.
- Produces: `DownloadManagerDeps` without `note`; `cancel` unchanged in signature and result.

- [ ] **Step 1: Drop the `notes` sink and its test**

In `tests/unit/downloads.test.ts`, inside `harness()`:

Delete the line:

```ts
  const notes: string[] = [];
```

Delete the dep line:

```ts
    note: (line) => void notes.push(line),
```

Change the return from:

```ts
  return { dm, ses, deps, banners, box, files, notes, writes: history.writes };
```

to:

```ts
  return { dm, ses, deps, banners, box, files, writes: history.writes };
```

Delete the whole case `it('notes a cancel the user asked for, not one the lifecycle made', …)` (the last case in the file). The behaviour it guarded is still pinned: `it('cancel ends only an in-flight download and removes its row'` covers the row and `it('reports an interrupted download and stays silent on cancel'` covers the banner.

- [ ] **Step 2: Run the file to verify it fails**

Run: `corepack pnpm exec vitest run tests/unit/downloads.test.ts`

Expected: FAIL. The fake item's `cancel()` emits `done` synchronously, so `cancel ends only an in-flight download and removes its row` throws `this.deps.note is not a function` — the harness no longer supplies a dep the manager still calls on a user cancel. (A `detach` or `dispose` cancel returns from `finish` before the note, so those cases still pass.)

- [ ] **Step 3: Delete the dep, the set and the note**

In `src/main/downloads.ts`:

Delete from `DownloadManagerDeps`:

```ts
  /** ctx.diag.note('downloads', …): counts and states, never a name */
  note(line: string): void;
```

Delete the field:

```ts
  /** row ids whose Cancel the user pressed — a lifecycle cancel notes nothing */
  private userCancelled = new Set<number>();
```

In `finish`, change:

```ts
    if (state === 'cancelled') {
      this.records.delete(f.id); // a cancelled file gets no row, as it gets no banner
      if (this.userCancelled.delete(f.id)) this.deps.note(`cancelled by user: ${id}`);
    } else if (record) {
```

to:

```ts
    if (state === 'cancelled') {
      this.records.delete(f.id); // a cancelled file gets no row, as it gets no banner
    } else if (record) {
```

In `cancel`, change:

```ts
  cancel(id: number): boolean {
    for (const [item, f] of this.inflight) {
      if (f.id === id) {
        this.userCancelled.add(id);
        item.cancel();
        return true;
      }
    }
    return false;
  }
```

to:

```ts
  cancel(id: number): boolean {
    for (const [item, f] of this.inflight) {
      if (f.id === id) {
        item.cancel();
        return true;
      }
    }
    return false;
  }
```

In `src/main/index.ts`, inside the `new DownloadManager({ … })` deps, delete the line:

```ts
      note: (line) => diag.note('downloads', line),
```

- [ ] **Step 4: Typecheck, lint and run the file**

Run: `corepack pnpm typecheck && corepack pnpm exec biome check src/main/downloads.ts src/main/index.ts tests/unit/downloads.test.ts && corepack pnpm exec vitest run tests/unit/downloads.test.ts`

Expected: all clean, all passed. If Biome reports `id` unused in `finish`, it is not: the parameter is read by the banner path below the cancel branch — re-read before touching it.

---

### Task 5: Passkey ceremonies leave the ring, and the `log` dep with them

**Files:**

- Modify: `src/main/passkeys/authenticator.ts:64` (dep), `:91` (default), `:190`, `:249` (the two calls)
- Modify: `src/main/index.ts:464-468` (wiring)
- Test: `tests/unit/passkey-authenticator.test.ts:67-71,76,95,155,181`

**Interfaces:**

- Consumes: `PasskeyAuthenticator(store, prompt, deps: Partial<Deps>)`.
- Produces: `Deps` without `log`; `create` and `get` unchanged in signature and result.

- [ ] **Step 1: Drop the `log` spy from the test**

In `tests/unit/passkey-authenticator.test.ts`:

Replace `setup`:

```ts
function setup(p = prompt()) {
  const store = new PasskeyStore(dir, codec);
  const log = vi.fn();
  const auth = new PasskeyAuthenticator(store, p, { now: () => 1000, log });
  return { store, auth, p, log };
}
```

with:

```ts
function setup(p = prompt()) {
  const store = new PasskeyStore(dir, codec);
  const auth = new PasskeyAuthenticator(store, p, { now: () => 1000 });
  return { store, auth, p };
}
```

In the `create` case, change `const { store, auth, p, log } = setup();` to `const { store, auth, p } = setup();` and delete:

```ts
    expect(log).toHaveBeenCalledWith('[passkey] created rp=microsoft.com via=teams');
```

In the `get` case, change `const { auth, store, created, p, log } = await registered();` to `const { auth, store, created, p } = await registered();` and delete:

```ts
    expect(log).toHaveBeenCalledWith('[passkey] asserted rp=microsoft.com via=teams');
```

`vi` stays imported — the cancel cases still use `vi.fn`.

- [ ] **Step 2: Run the file to verify it still passes (the log was never asserted against a default)**

Run: `corepack pnpm exec vitest run tests/unit/passkey-authenticator.test.ts`

Expected: all passed. The failure this task guards against is a type one: Step 4 below.

- [ ] **Step 3: Delete the dep, its default and the two calls**

In `src/main/passkeys/authenticator.ts`:

Delete from `interface Deps`:

```ts
  log(line: string): void;
```

Delete from the constructor's defaults object:

```ts
      log: (line) => console.log(line),
```

In `create`, delete:

```ts
    this.deps.log(`[passkey] created rp=${req.rpId} via=${serviceId}`);
```

In `get`, delete:

```ts
    this.deps.log(`[passkey] asserted rp=${req.rpId} via=${serviceId}`);
```

That was `serviceId`'s last use in `get`, so change its destructured parameter from:

```ts
    { serviceId, origin, options, viewKey }: CeremonyInput,
```

to:

```ts
    { origin, options, viewKey }: CeremonyInput,
```

(`create` keeps `serviceId`: it writes `createdIn: serviceId` on the stored passkey.)

In `src/main/index.ts`, replace:

```ts
      passkeys: new PasskeyAuthenticator(passkeyStore, electronPrompt(win), {
        cooldownMs: 5_000,
        // the authenticator prefixes its own tag; the ring adds it back
        log: (line) => diag.note('passkey', line.replace(/^\[passkey\] /, '')),
      }),
```

with:

```ts
      passkeys: new PasskeyAuthenticator(passkeyStore, electronPrompt(win), { cooldownMs: 5_000 }),
```

The comment above it about the 5s cool-down stays.

- [ ] **Step 4: Typecheck, lint and run the file**

Run: `corepack pnpm typecheck && corepack pnpm exec biome check src/main/passkeys/authenticator.ts src/main/index.ts tests/unit/passkey-authenticator.test.ts && corepack pnpm exec vitest run tests/unit/passkey-authenticator.test.ts`

Expected: all clean, all passed. `create` still reads `serviceId` for `createdIn`; `get` no longer binds it. If Biome asks for formatting on `index.ts`, run `corepack pnpm exec biome check --write src/main/index.ts`.

---

### Task 6: The rule lands in CLAUDE.md and the four specs it amends

**Files:**

- Modify: `CLAUDE.md:55` (guard-audit bullet), `:73` (Diagnostics bullet)
- Modify: `docs/superpowers/specs/2026-09-13-guarded-actions-design.md:31`
- Modify: `docs/superpowers/specs/2026-09-19-diagnostics-pane-design.md:5,25,66`
- Modify: `docs/superpowers/specs/2026-09-23-download-history-design.md:3`
- Modify: `docs/superpowers/specs/2026-09-25-guard-groups-design.md:3`

**Interfaces:** none; documentation only.

- [ ] **Step 1: Amend the two CLAUDE.md bullets**

Confirm the anchors first. Run: `grep -n -o "Every performed or refused guarded action notes itself\|Four rules:\|endPeek\` notes only with a reason" CLAUDE.md`

Expected: three hits (lines 55, 73, 73).

In the guard-audit bullet (line 55), replace the sentence:

```markdown
Every performed or refused guarded action notes itself: `authorized()` writes `[lock] <action> authorized` / `refused: no consent`, `LockController` writes unlocks, consents and configurations under the `lock` tag (methods, kinds, counts — never a secret), and each handler writes its action (`[app] summoned: …`, `purged login: …`, `purged all logins (n)`, `settings exported` / `imported (n keys)`; `[passkey] forgot <rpId>`; `[downloads] folder changed` / `mode: …` / `cancelled by user: <id>`).
```

with:

```markdown
Every refused guarded action notes itself, and so does every performed harm-capable action the audit named; a grant does not (2026-09-26, user decision; spec `docs/superpowers/specs/2026-09-26-diagnostics-unusual-only-design.md`): `authorized()` writes `[lock] <action> refused: no consent` and nothing on success, `LockController` writes refusals, throttles and configurations under the `lock` tag (kinds, methods, counts — never a secret; never `unlocked` or `consent granted`), and each handler writes its action (`[app] summoned: …`, `purged login: …`, `purged all logins (n)`, `settings imported (n keys)`; `[passkey] forgot <rpId>`; `[downloads] folder changed` / `mode: …`). An export, an Undo restore, the user's own cancel and a passkey ceremony write nothing — a success is not evidence.
```

In the Diagnostics bullet (line 73), replace:

```markdown
Four rules: a note is composed from ids and states only
```

with:

```markdown
Five rules: a note is composed from ids and states only
```

and replace:

```markdown
transitions note on the change, never per tick (`recipeTransition`; `endPeek` notes only with a reason); `diagnostics:recent` / `diagnostics:report` are shell-only and therefore refused while locked.
```

with:

```markdown
transitions note on the change, never per tick (`recipeTransition`; `endPeek` notes only a timeout — a peek's start and its report were the cadence, and at eight sleeping services they rotated the whole ring every two hours, 2026-09-26); `diagnostics:recent` / `diagnostics:report` are shell-only and therefore refused while locked; and **a line is either something going wrong or an action that would harm the user if they were not its author — never a success, never a cadence** (2026-09-26, user decision; spec `docs/superpowers/specs/2026-09-26-diagnostics-unusual-only-design.md`), so a refused guarded action notes and a granted one does not, because the action's own line records it.
```

- [ ] **Step 2: Amend the 2026-09-13 spec**

In `docs/superpowers/specs/2026-09-13-guarded-actions-design.md`, line 31 ends with `…closing the shell-console bypass the audit found.`. Append to that same line (one line, no wrap):

```markdown
 Amended 2026-09-26 (`2026-09-26-diagnostics-unusual-only-design.md`): the grant is no longer recorded — only the refusal and the action's own line.
```

- [ ] **Step 3: Amend the 2026-09-19 spec**

In `docs/superpowers/specs/2026-09-19-diagnostics-pane-design.md`:

After the existing `**Amendment (2026-09-20, …)**` paragraph (line 5) and its following blank line, insert a new paragraph followed by a blank line:

```markdown
**Amendment (2026-09-26, user decision — `2026-09-26-diagnostics-unusual-only-design.md`).** The `peek` row of the transitions table is reduced to its timeout line: a peek's start and its end by report were the cadence, not evidence, and at eight sleeping services they rotated the whole ring every two hours. The rule that decides what is a line — something going wrong, or an action that would harm the user if they were not its author; never a success, never a cadence — stands in that spec.
```

In the Decisions bullet (line 25 before the insert), replace the tail:

```markdown
a peek's start and end are recorded as one transition each.
```

with:

```markdown
a peek's timeout is recorded as one transition (its start and its end by report were too, until the 2026-09-26 amendment).
```

In the transitions table, replace the `peek` row:

```markdown
| `peek` | `hibernation.ts` | `<id> peek started`, `<id> peek ended: report`, `<id> peek ended: timeout · on <host/path>`. |
```

with:

```markdown
| `peek` | `hibernation.ts` | `<id> peek ended: timeout · on <host/path>` (start and report lines dropped 2026-09-26). |
```

- [ ] **Step 4: Amend the 2026-09-23 spec**

In `docs/superpowers/specs/2026-09-23-download-history-design.md`, after line 3 (the `Date: … read both first.` paragraph) and its following blank line, insert a new paragraph followed by a blank line:

```markdown
**Amendment (2026-09-26, user decision — `2026-09-26-diagnostics-unusual-only-design.md`).** The grants this spec records are recorded no longer: `[lock] <kind> authorized`, `unlocked (…)` and `consent granted: …` are gone, as are `[app] settings exported`, `[downloads] cancelled by user` and `history: restored`, and the `note` dep on `DownloadManager` went with the cancel line. Every refusal, every `configured: …` line and every action line named below still stands — a success is not evidence, and the action's own line records what was granted.
```

- [ ] **Step 5: Amend the 2026-09-25 spec**

In `docs/superpowers/specs/2026-09-25-guard-groups-design.md`, after line 3 (which ends `Nothing new is guarded and nothing guarded stops being recorded.`) and its following blank line, insert a new paragraph followed by a blank line:

```markdown
**Amendment (2026-09-26, user decision — `2026-09-26-diagnostics-unusual-only-design.md`).** `authorized()` now notes only its refusal; a group that is off still has its action written by the handler's own line, which is what "still written to Diagnostics" below now rests on. The Diagnostics paragraph's "the `authorized()` lines … are unchanged" is superseded.
```

- [ ] **Step 6: Lint every Markdown file touched**

Run: `npx markdownlint-cli2 CLAUDE.md docs/superpowers/specs/2026-09-13-guarded-actions-design.md docs/superpowers/specs/2026-09-19-diagnostics-pane-design.md docs/superpowers/specs/2026-09-23-download-history-design.md docs/superpowers/specs/2026-09-25-guard-groups-design.md docs/superpowers/specs/2026-09-26-diagnostics-unusual-only-design.md docs/superpowers/plans/2026-09-26-diagnostics-unusual-only.md`

Expected: `Summary: 0 issues in 0 files`. All five pre-existing files were at 0 issues before this task.

---

### Task 7: Full verification, then hand the commit to the user

**Files:** none modified.

- [ ] **Step 1: Lint, typecheck, unit tests**

Run: `corepack pnpm lint && corepack pnpm typecheck && corepack pnpm test`

Expected: each exits 0. If lint reports formatting only, run `corepack pnpm exec biome check --write .` and re-run.

- [ ] **Step 2: Confirm no deleted line survives in `src/`**

Run:

```bash
grep -rn "peek started\`\|peek ended: report\|unlocked (\|consent granted\|} authorized\|settings exported\|history: restored\|cancelled by user\|created rp=\|asserted rp=" src/
```

Expected: no output. (The escaped backtick after `peek started` keeps a pre-existing comment in `hibernation.ts`, "count when the peek started", from matching.)

- [ ] **Step 3: Full e2e**

Run: `env -u ELECTRON_RUN_AS_NODE corepack pnpm e2e`

Expected: all passed. If a drag or restart spec fails or hangs in the full run, rerun that one spec alone with `env -u ELECTRON_RUN_AS_NODE npx playwright test tests/e2e/<spec>` before treating it as a regression; the specs this plan touches are `downloads.spec.ts`, and `diagnostics.spec.ts`, `guarded-actions.spec.ts` and `lock.spec.ts` must pass unchanged.

- [ ] **Step 4: Stop and ask the user to commit**

Do not run `git commit`. Report the four green commands with their output, list the files changed (`git status --short`), and ask the user to run `/grimoire-core:commit`. Suggested message for them to confirm or edit:

```text
feat(diagnostics): record the unusual only — drop grants, the peek cadence and other successes from the ring
```
