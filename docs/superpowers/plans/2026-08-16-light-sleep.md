# Light Sleep Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hibernated services keep their unread badges and notifications working via periodic hidden "peeks", so all services can sleep by default and the app stays light without going blind.

**Architecture:** A pure scheduling helper (`lib/peek-rules.ts`) decides which sleeping service is due; `HibernationController` absorbs the peek cycle into its existing 60s sweep (create the view hidden via `views.ensure`, destroy it on the first unread report or a timeout). A new late-bound `ctx.noteUnreadReport` hook signals peek completion from the `unread:*` IPC handlers, mirroring `noteActivated`. `neverHibernate` defaults flip to `false` now that sleeping is safe.

**Tech Stack:** Electron main process (TypeScript), vitest unit tests, Playwright e2e.

**Spec:** `docs/superpowers/specs/2026-08-16-light-sleep-and-notification-click-through-design.md`

## Global Constraints

- Definition of done for every task: `corepack pnpm lint`, `corepack pnpm typecheck`, `corepack pnpm test` all green; Task 6 additionally needs `env -u ELECTRON_RUN_AS_NODE corepack pnpm e2e` (VS Code shells export `ELECTRON_RUN_AS_NODE`, which breaks Electron launches).
- **Commits:** never run `git commit` directly. At each task's commit step, STOP and ask the user to run `/grimoire-core:commit` with the suggested message. Do not proceed to the next task's code while a commit is pending unless the user says to batch them.
- No new IPC channels; `src/shared/**` stays free of `electron` and DOM imports.
- Peek views are never shown: only `views.ensure(id)`, never `views.activate`. No code path may make a view visible while an overlay is open.
- All new timers are cleared in `dispose()`; deferred callbacks tolerate an already-destroyed view.
- Notifications from peeked views flow through the existing `NotificationRouter` — do not add a second path.
- Comments: concise, explain why not what, match surrounding density.

---

### Task 1: `lightSleep` setting and `neverHibernate` default flip

**Files:**

- Modify: `src/shared/types.ts` (Settings interface ~line 64, DEFAULT_SETTINGS ~line 125)
- Test: `tests/unit/settings.test.ts`

**Interfaces:**

- Produces: `Settings.lightSleep: boolean` (default `true`); `DEFAULT_SETTINGS.neverHibernate` all `false`. Later tasks read `settings.get().lightSleep`.

- [x] **Step 1: Write the failing tests**

In `tests/unit/settings.test.ts`, extend the first-run defaults test and flip the new-service fill assertions:

```ts
  it('returns defaults on first run', () => {
    dir = mkdtempSync(join(tmpdir(), 'goetia-'));
    const store = new SettingsStore(dir);
    expect(store.get().hibernationMinutes).toBe(30);
    expect(store.get().order[0]).toBe('discord');
    expect(store.get().lightSleep).toBe(true);
    // Light Sleep makes sleeping safe, so nothing is kept awake by default
    expect(Object.values(store.get().neverHibernate).every((v) => v === false)).toBe(true);
  });
```

In the `surfaces services added after settings.json was written` test, the seeded file's `neverHibernate` block stays as-is (it represents a legacy install that persisted all-`true`), but the five assertions for services missing from that file now fill from the flipped default — change each of these lines:

```ts
    expect(s.neverHibernate.teams).toBe(false);
    expect(s.neverHibernate.slack).toBe(false);
    expect(s.neverHibernate.instagram).toBe(false);
    expect(s.neverHibernate.tiktok).toBe(false);
    expect(s.neverHibernate.shopee).toBe(false);
```

Also assert legacy persisted keys survive (add after the shopee line):

```ts
    expect(s.neverHibernate.messenger).toBe(true); // persisted choice untouched
```

- [x] **Step 2: Run tests to verify they fail**

Run: `corepack pnpm test tests/unit/settings.test.ts`
Expected: FAIL — `lightSleep` is `undefined`, and the five fill assertions still read `true`.

- [x] **Step 3: Implement the settings change**

In `src/shared/types.ts`, add to the `Settings` interface directly after `hibernationMinutes: number;`:

```ts
  /** Peek sleeping services on a schedule so badges and banners keep working
   *  while their views are destroyed. */
  lightSleep: boolean;
```

In `DEFAULT_SETTINGS`, flip every value in the `neverHibernate` record from `true` to `false`, and add after `hibernationMinutes: 30,`:

```ts
  lightSleep: true,
```

Update the comment above the `neverHibernate` record if one exists; the record itself becomes:

```ts
  neverHibernate: {
    whatsapp: false,
    messenger: false,
    instagram: false,
    telegram: false,
    discord: false,
    zalo: false,
    tiktok: false,
    shopee: false,
    slack: false,
    teams: false,
  },
```

No `settings.ts` change: `SettingsStore.get()` spreads `DEFAULT_SETTINGS` under the persisted store, so a missing `lightSleep` key resolves to `true`, and `normalize`'s `fill()` already sources missing `neverHibernate` keys from the (now flipped) defaults.

- [x] **Step 4: Run tests to verify they pass**

Run: `corepack pnpm test tests/unit/settings.test.ts`
Expected: PASS.

- [x] **Step 5: Run the full unit suite — other tests may encode the old default**

Run: `corepack pnpm test`
Expected: PASS. If a failure references `neverHibernate` defaults (check `tests/unit/services.test.ts`, `tests/unit/state.test.ts`, `tests/unit/capture-shots.test.ts`), the fix is to update that test's expectation to the flipped default — the new default is the intended behavior. Any other failure is a real regression: stop and investigate.

- [x] **Step 6: Commit checkpoint**

Ask the user to run `/grimoire-core:commit`. Suggested message: `feat(settings): add lightSleep and let services sleep by default`

---

### Task 2: `peek-rules` pure scheduling helper

**Files:**

- Create: `src/main/lib/peek-rules.ts`
- Test: `tests/unit/peek-rules.test.ts`

**Interfaces:**

- Produces (Task 3 consumes exactly these):

```ts
export interface PeekCandidate {
  id: ServiceId;
  disabled: boolean;
  neverHibernate: boolean;
  hasView: boolean;
  lastPeekEndedAt: number; // epoch ms; 0 = never peeked
}
export const PEEK_INTERVAL_MS: number; // 10 * 60_000
export const PEEK_TIMEOUT_MS: number; // 90_000
export function pickPeek(
  candidates: PeekCandidate[],
  now: number,
  intervalMs: number,
  peekingId: ServiceId | null,
): ServiceId | null;
```

- [x] **Step 1: Write the failing test**

Create `tests/unit/peek-rules.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { PEEK_INTERVAL_MS, pickPeek } from '../../src/main/lib/peek-rules';
import type { PeekCandidate } from '../../src/main/lib/peek-rules';

const MIN = 60_000;
const c = (over: Partial<PeekCandidate>): PeekCandidate => ({
  id: 'zalo',
  disabled: false,
  neverHibernate: false,
  hasView: false,
  lastPeekEndedAt: 0,
  ...over,
});

describe('pickPeek', () => {
  it('a never-peeked sleeping service is due immediately', () => {
    expect(pickPeek([c({})], 0, PEEK_INTERVAL_MS, null)).toBe('zalo');
  });
  it('not due again inside the interval', () => {
    expect(pickPeek([c({ lastPeekEndedAt: 1 * MIN })], 10 * MIN, PEEK_INTERVAL_MS, null)).toBe(
      null,
    );
  });
  it('due again once the interval has passed', () => {
    expect(pickPeek([c({ lastPeekEndedAt: 1 * MIN })], 11 * MIN, PEEK_INTERVAL_MS, null)).toBe(
      'zalo',
    );
  });
  it('never while another peek is in flight', () => {
    expect(pickPeek([c({})], 0, PEEK_INTERVAL_MS, 'messenger')).toBe(null);
  });
  it('never a disabled service', () => {
    expect(pickPeek([c({ disabled: true })], 0, PEEK_INTERVAL_MS, null)).toBe(null);
  });
  it('never a kept-awake service', () => {
    expect(pickPeek([c({ neverHibernate: true })], 0, PEEK_INTERVAL_MS, null)).toBe(null);
  });
  it('never a service with a live view — it is already reporting', () => {
    expect(pickPeek([c({ hasView: true })], 0, PEEK_INTERVAL_MS, null)).toBe(null);
  });
  it('picks the first due candidate in rail order', () => {
    const list = [
      c({ id: 'discord', hasView: true }),
      c({ id: 'messenger' }),
      c({ id: 'zalo' }),
    ];
    expect(pickPeek(list, 0, PEEK_INTERVAL_MS, null)).toBe('messenger');
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `corepack pnpm test tests/unit/peek-rules.test.ts`
Expected: FAIL — module `src/main/lib/peek-rules` not found.

- [x] **Step 3: Write the implementation**

Create `src/main/lib/peek-rules.ts`:

```ts
import type { ServiceId } from '../../shared/types';

export interface PeekCandidate {
  id: ServiceId;
  disabled: boolean;
  neverHibernate: boolean;
  hasView: boolean;
  /** epoch ms of the last peek end or hibernation teardown; 0 = never */
  lastPeekEndedAt: number;
}

export const PEEK_INTERVAL_MS = 10 * 60_000;
export const PEEK_TIMEOUT_MS = 90_000;

/** The next sleeping service due for a hidden peek, in rail order. Null while
 *  one is already peeking — peeks never stack renderers. */
export function pickPeek(
  candidates: PeekCandidate[],
  now: number,
  intervalMs: number,
  peekingId: ServiceId | null,
): ServiceId | null {
  if (peekingId !== null) return null;
  for (const c of candidates) {
    if (c.disabled || c.neverHibernate || c.hasView) continue;
    if (c.lastPeekEndedAt === 0 || now - c.lastPeekEndedAt >= intervalMs) return c.id;
  }
  return null;
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `corepack pnpm test tests/unit/peek-rules.test.ts`
Expected: PASS (8 tests).

- [x] **Step 5: Commit checkpoint**

Ask the user to run `/grimoire-core:commit`. Suggested message: `feat(hibernation): add peek scheduling rules`

---

### Task 3: peek cycle in `HibernationController` + `noteUnreadReport` hook

**Files:**

- Modify: `src/main/hibernation.ts` (full rewrite below)
- Modify: `src/main/ipc-handlers.ts` (AppContext ~line 27; `unread:update` / `unread:stale` handlers ~lines 156–159)
- Modify: `src/main/index.ts` (ctx literal ~line 220; `before-quit` ~line 253)

**Interfaces:**

- Consumes: `pickPeek`, `PEEK_INTERVAL_MS`, `PEEK_TIMEOUT_MS`, `PeekCandidate` from Task 2; `Settings.lightSleep` from Task 1.
- Produces: `HibernationController.noteUnreadReport(id: ServiceId): void` and `HibernationController.dispose(): void`; `AppContext.noteUnreadReport(id: ServiceId): void` (late-bound). Task 6's e2e relies on env overrides `GOETIA_SWEEP_MS`, `GOETIA_PEEK_INTERVAL_MS`, `GOETIA_PEEK_TIMEOUT_MS`.

- [x] **Step 1: Rewrite `src/main/hibernation.ts`**

Replace the file's entire contents with:

```ts
import type { ServiceId } from '../shared/types';
import type { AppContext } from './ipc-handlers';
import { shouldHibernate } from './lib/hibernation-rules';
import { PEEK_INTERVAL_MS, PEEK_TIMEOUT_MS, pickPeek } from './lib/peek-rules';

// env overrides compress time for e2e; production never sets them
const SWEEP_MS = Number(process.env.GOETIA_SWEEP_MS) || 60_000;
const INTERVAL_MS = Number(process.env.GOETIA_PEEK_INTERVAL_MS) || PEEK_INTERVAL_MS;
const TIMEOUT_MS = Number(process.env.GOETIA_PEEK_TIMEOUT_MS) || PEEK_TIMEOUT_MS;
// first sweep soon after boot so warm-up peeks populate badges without
// waiting out a full sweep interval
const BOOT_DELAY_MS = 5_000;

export class HibernationController {
  private lastActiveAt = new Map<ServiceId, number>();
  /** also stamped on hibernation teardown: the count is live at that instant */
  private lastPeekEndedAt = new Map<ServiceId, number>();
  private peeking: { id: ServiceId; timer: NodeJS.Timeout } | null = null;
  private bootTimer: NodeJS.Timeout | null = null;
  private sweepTimer: NodeJS.Timeout | null = null;

  constructor(private ctx: AppContext) {}

  noteActivated(id: ServiceId): void {
    this.lastActiveAt.set(id, Date.now());
    // mid-peek activation is the wake the user wanted: keep the view
    if (this.peeking?.id === id) this.endPeek(false);
  }

  noteUnreadReport(id: ServiceId): void {
    if (this.peeking?.id === id) this.endPeek(true);
  }

  start(): void {
    this.bootTimer = setTimeout(() => this.sweep(), BOOT_DELAY_MS);
    this.sweepTimer = setInterval(() => this.sweep(), SWEEP_MS);
  }

  dispose(): void {
    if (this.bootTimer) clearTimeout(this.bootTimer);
    if (this.sweepTimer) clearInterval(this.sweepTimer);
    if (this.peeking) clearTimeout(this.peeking.timer);
    this.peeking = null;
  }

  private sweep(): void {
    const s = this.ctx.settings.get();
    const now = Date.now();
    for (const id of s.order) {
      if (s.disabled[id]) continue;
      if (id === this.peeking?.id) continue; // never tear down a peek in flight
      if (this.lastActiveAt.get(id) === undefined) {
        // never-visited services start their idle clock at the first sweep
        this.lastActiveAt.set(id, now);
      }
      const candidate = {
        active: this.ctx.state.activeId === id,
        hibernated: this.ctx.state.runtime(id).hibernated,
        neverHibernate: s.neverHibernate[id],
        lastActiveAt: this.lastActiveAt.get(id) ?? now,
      };
      if (shouldHibernate(candidate, now, s.hibernationMinutes) && this.ctx.views.has(id)) {
        this.ctx.views.destroy(id);
        this.ctx.waking.end(id, 'destroyed');
        this.ctx.state.setRuntime(id, { hibernated: true });
        this.lastPeekEndedAt.set(id, now);
      }
    }
    if (!s.lightSleep) return;
    const due = pickPeek(
      s.order.map((id) => ({
        id,
        disabled: s.disabled[id],
        neverHibernate: s.neverHibernate[id],
        hasView: this.ctx.views.has(id),
        lastPeekEndedAt: this.lastPeekEndedAt.get(id) ?? 0,
      })),
      now,
      INTERVAL_MS,
      this.peeking?.id ?? null,
    );
    if (due) this.beginPeek(due);
  }

  private beginPeek(id: ServiceId): void {
    this.ctx.views.ensure(id);
    const timer = setTimeout(() => {
      if (this.peeking?.id === id) this.endPeek(true);
    }, TIMEOUT_MS);
    this.peeking = { id, timer };
  }

  private endPeek(destroy: boolean): void {
    if (!this.peeking) return;
    const { id, timer } = this.peeking;
    clearTimeout(timer);
    this.peeking = null;
    this.lastPeekEndedAt.set(id, Date.now());
    // tolerate a view already gone (service disabled mid-peek) and never
    // destroy under the user (activated mid-peek)
    if (destroy && this.ctx.state.activeId !== id && this.ctx.views.has(id)) {
      this.ctx.views.destroy(id);
      this.ctx.waking.end(id, 'destroyed');
      this.ctx.state.setRuntime(id, { hibernated: true });
    }
    // chain straight to the next due service so boot warm-up walks the roster
    this.sweep();
  }
}
```

- [x] **Step 2: Add the `noteUnreadReport` hook to `AppContext`**

In `src/main/ipc-handlers.ts`, after the `noteActivated` member (~line 28), add:

```ts
  /** ends a Light Sleep peek on the service's first report; late-bound in index.ts */
  noteUnreadReport(id: import('../shared/types').ServiceId): void;
```

Replace the two unread handlers (~lines 156–159):

```ts
  on('unread:update', ({ serviceId, direct, indirect }) => {
    ctx.state.setRuntime(serviceId, { unread: { direct, indirect }, stale: false });
    // setRuntime no-ops on an unchanged count, so the peek signal lives here
    ctx.noteUnreadReport(serviceId);
  });
  on('unread:stale', ({ serviceId }) => {
    ctx.state.setRuntime(serviceId, { stale: true });
    ctx.noteUnreadReport(serviceId);
  });
```

- [x] **Step 3: Late-bind in `index.ts`**

In the `ctx` literal (directly after the `noteActivated` entry, ~line 221):

```ts
      noteUnreadReport: (id: Parameters<HibernationController['noteUnreadReport']>[0]) =>
        hibernation.noteUnreadReport(id),
```

In the existing `app.on('before-quit', ...)` block (~line 253), add alongside the other disposals:

```ts
      hibernation.dispose();
```

- [x] **Step 4: Typecheck, lint, full unit suite**

Run: `corepack pnpm typecheck && corepack pnpm lint && corepack pnpm test`
Expected: all green. A typecheck failure about `noteUnreadReport` missing on a mock `AppContext` in unit tests means a test builds an AppContext literal — add a `noteUnreadReport: () => {}` stub there.

- [x] **Step 5: Commit checkpoint**

Ask the user to run `/grimoire-core:commit`. Suggested message: `feat(hibernation): peek sleeping services so badges stay live`

---

### Task 4: Light Sleep toggle in Settings

**Files:**

- Modify: `src/renderer/src/components/SettingsView.tsx` (General pane, after the hibernation-minutes Row ~line 265)

**Interfaces:**

- Consumes: `Settings.lightSleep` (Task 1); the pane's existing `s` (settings) and `update` helpers.

- [x] **Step 1: Add the Row**

Directly after the `Hibernate idle services after (minutes)` Row:

```tsx
                <Row
                  label="Light Sleep"
                  hint="Sleeping services wake hidden every few minutes so badges and banners stay current."
                >
                  <input
                    type="checkbox"
                    data-testid="light-sleep-enabled"
                    checked={s.lightSleep}
                    onChange={(e) => update({ lightSleep: e.target.checked })}
                  />
                </Row>
```

No main-process side effect on toggle: the next sweep reads the new value; an in-flight peek is allowed to finish.

- [x] **Step 2: Verify**

Run: `corepack pnpm typecheck && corepack pnpm lint && corepack pnpm test`
Expected: all green.

- [x] **Step 3: Commit checkpoint**

Ask the user to run `/grimoire-core:commit`. Suggested message: `feat(settings-ui): Light Sleep toggle`

---

### Task 5: stale-banner guard on notification click

**Files:**

- Modify: `src/main/notifications.ts` (~line 50)

**Interfaces:**

- Consumes: `ctx.settings.get().disabled`; existing `activateService`.

- [x] **Step 1: Guard the click handler**

Replace the click handler:

```ts
    notification.on('click', () => {
      this.ctx.win.show();
      // a stale banner can outlive its service being banished on Home
      if (!this.ctx.settings.get().disabled[serviceId]) activateService(this.ctx, serviceId);
    });
```

- [x] **Step 2: Verify**

Run: `corepack pnpm typecheck && corepack pnpm lint && corepack pnpm test`
Expected: all green. Native banners are outside the e2e harness — verify manually during Task 6's live run: fire a banner, banish the service on Home, click the banner in Notification Center; the window shows without activating the banished service.

- [x] **Step 3: Commit checkpoint**

Ask the user to run `/grimoire-core:commit`. Suggested message: `fix(notifications): don't activate a banished service from a stale banner`

---

### Task 6: e2e — a sleeping service peeks hidden and goes back to sleep

**Files:**

- Create: `tests/e2e/peek.spec.ts`

**Interfaces:**

- Consumes: env overrides from Task 3 (`GOETIA_SWEEP_MS`, `GOETIA_PEEK_INTERVAL_MS`, `GOETIA_PEEK_TIMEOUT_MS`); the harness conventions from `tests/e2e/smoke.spec.ts` (seeded profile, `--goetia-e2e`, windows-as-webContents).

- [x] **Step 1: Write the spec**

Create `tests/e2e/peek.spec.ts`:

```ts
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { _electron as electron, expect, test } from '@playwright/test';

const allFalse = {
  whatsapp: false,
  messenger: false,
  instagram: false,
  telegram: false,
  discord: false,
  zalo: false,
  tiktok: false,
  shopee: false,
  slack: false,
  teams: false,
};

test('a sleeping service peeks hidden and goes back to sleep', async () => {
  const profile = mkdtempSync(join(tmpdir(), 'goetia-e2e-'));
  // messenger boots active (first enabled in catalog order); zalo sleeps
  writeFileSync(
    join(profile, 'settings.json'),
    JSON.stringify({
      disabled: {
        whatsapp: true,
        messenger: false,
        instagram: true,
        telegram: true,
        discord: true,
        zalo: false,
        tiktok: true,
        shopee: true,
        slack: true,
        teams: true,
      },
      neverHibernate: allFalse,
    }),
  );
  const app = await electron.launch({
    args: ['out/main/index.js', '--goetia-e2e', `--goetia-user-data=${profile}`],
    env: {
      ...process.env,
      GOETIA_SWEEP_MS: '1000',
      GOETIA_PEEK_INTERVAL_MS: '5000',
      GOETIA_PEEK_TIMEOUT_MS: '10000',
    },
  });

  const isShell = (p: { url(): string }) =>
    p.url().startsWith('file://') && !p.url().includes('loading.html');
  const win =
    app.windows().find(isShell) ?? (await app.waitForEvent('window', { predicate: isShell }));
  const rail = win.locator('[data-testid="rail"]');
  await expect(rail.locator('button[aria-current="page"]')).toHaveAttribute(
    'aria-label',
    'Messenger',
  );

  // the boot warm-up peek creates zalo's view hidden…
  const isZalo = (p: { url(): string }) => p.url().includes('zalo');
  const zalo =
    app.windows().find(isZalo) ??
    (await app.waitForEvent('window', { predicate: isZalo, timeout: 30_000 }));

  // …the rail highlight never moves off the active service…
  await expect(rail.locator('button[aria-current="page"]')).toHaveAttribute(
    'aria-label',
    'Messenger',
  );

  // …and the peek tears the view down after its first report or the timeout
  await zalo.waitForEvent('close', { timeout: 30_000 });
  await expect(rail.locator('button[aria-current="page"]')).toHaveAttribute(
    'aria-label',
    'Messenger',
  );

  await app.close();
});
```

The `neverHibernate: allFalse` seed is belt-and-braces: it matches the new default, but seeding it keeps this spec correct even against a future default change.

- [x] **Step 2: Build and run the spec**

Run: `corepack pnpm build && env -u ELECTRON_RUN_AS_NODE corepack pnpm e2e tests/e2e/peek.spec.ts`
(If the e2e script does not accept a file filter, run the full suite: `env -u ELECTRON_RUN_AS_NODE corepack pnpm e2e`.)
Expected: PASS. The zalo window appears within ~10s of launch (boot sweep at 5s + 1s sweeps) and closes within the compressed timeout even if the login page never reports.

- [x] **Step 3: Run the full e2e suite**

Run: `env -u ELECTRON_RUN_AS_NODE corepack pnpm e2e`
Expected: PASS. `loading.spec.ts` and `smoke.spec.ts` seed their own profiles; if one asserts a service view exists at boot that now sleeps (the flipped `neverHibernate` default), seed `neverHibernate: true` for that service in that spec's profile rather than weakening the assertion.

- [ ] **Step 4: Manual verification of the Task 5 guard**

With the built app running (`corepack pnpm dev` or the e2e build): trigger a banner from an enabled service, banish the service on Home, then click the banner in Notification Center. Expected: the window shows; the rail highlight does not move to the banished service.

- [x] **Step 5: Commit checkpoint**

Ask the user to run `/grimoire-core:commit`. Suggested message: `test(e2e): sleeping service peeks hidden and returns to sleep`

---

### Task 7: docs — README selling point and CLAUDE.md invariant

**Files:**

- Modify: `README.md` (the "Why Goetia" bullet list)
- Modify: `CLAUDE.md` (the "Reliability & performance" section)

**Interfaces:** none — prose only. Markdown must pass markdownlint; never hard-wrap prose.

- [x] **Step 1: README bullet**

Add to the "Why Goetia" list, after the notifications bullet:

```markdown
**Light Sleep.** Idle services give up their renderer but never go dark — each one wakes hidden every few minutes just long enough to refresh its badge and fire any banner, then sleeps again. Nine chats without nine browsers' worth of RAM; Keep Awake stays a per-service opt-out.
```

- [x] **Step 2: CLAUDE.md invariant**

Add to the "Reliability & performance" bullet list:

```markdown
- Light Sleep peeks recreate a sleeping service's view hidden (`views.ensure`, never `activate`/show), one service at a time, and destroy it on the first `unread:*` report (`ctx.noteUnreadReport`) or `PEEK_TIMEOUT_MS`. The hibernate step of the sweep skips the in-flight peek; peek teardown stamps `lastPeekEndedAt` and sets `hibernated`. Mute and quiet hours never pause peeks — badges keep counting.
```

- [x] **Step 3: Lint the markdown**

Run: `npx markdownlint-cli2 README.md CLAUDE.md`
Expected: 0 issues.

- [x] **Step 4: Commit checkpoint**

Ask the user to run `/grimoire-core:commit`. Suggested message: `docs: Light Sleep selling point and guardrails`

---

## Final verification (after all tasks)

- [x] `corepack pnpm lint && corepack pnpm typecheck && corepack pnpm test`
- [x] `env -u ELECTRON_RUN_AS_NODE corepack pnpm e2e`
- [ ] Live pass: launch the app with two services enabled, wait past `hibernationMinutes` (temporarily set to 5 in Settings), confirm the idle service's tile dims (hibernated), its badge still updates within ~10 minutes of new activity, and activating it mid-peek keeps the already-loading view.
