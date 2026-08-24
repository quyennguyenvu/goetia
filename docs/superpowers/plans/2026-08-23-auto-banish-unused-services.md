# Auto-Banish Unused Services Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Opt-in auto-banish of services unused for N hours (default 24), and consolidation of all sleep-related settings into the Services pane.

**Architecture:** A persisted per-service `lastUsedAt` clock (stamped only on activation) feeds a pure `shouldBanish` rule evaluated by the existing hibernation sweep; due services are disabled in one settings patch through the same side-effects tail Home's banish uses, reached via a late-bound `ctx.banishServices` so `hibernation.ts` stays free of electron. The Settings UI moves the hibernate/Light Sleep rows into the Services pane and adds the banish toggle + hours input beside them.

**Tech Stack:** Electron + TypeScript, React renderer, `conf` settings store, vitest unit tests, Playwright e2e.

Spec: `docs/superpowers/specs/2026-08-23-auto-banish-unused-services-design.md`.

## Global Constraints

- **Never run `git commit` (or write `GRIMOIRE_COMMIT_MSG.txt`).** At every commit step, stop and ask the user to run `/grimoire-core:commit`, suggesting a message. This is the user's global rule and overrides the workflow's commit habit.
- Definition of done: `corepack pnpm lint`, `corepack pnpm typecheck`, `corepack pnpm test`, and `env -u ELECTRON_RUN_AS_NODE corepack pnpm e2e` all green (VS Code shells export `ELECTRON_RUN_AS_NODE`; e2e breaks without unsetting it).
- Pure decision logic lives in `src/main/lib/` with a vitest test; `views.ts` / `index.ts` / `ipc-handlers.ts` stay thin wiring.
- `src/shared/**` never imports `electron` or main-process modules; `hibernation.ts` and `activate.ts` must stay importable by unit tests without loading electron (that is why `applyDisabledChange` lives in `ipc-handlers.ts` and the sweep reaches it via late-bound `ctx.banishServices`).
- One settings write per action: the activation stamp rides the existing `rememberSurface` write; the sweep's seeding is one batched write; a banish batch is one patch.
- Banners, badges, unread reports, and peeks never touch `lastUsedAt` — only user activation does.
- Any edited `.md` must pass `npx markdownlint-cli2 <file>`; never hard-wrap prose.

---

### Task 1: `shouldBanish` pure rule

**Files:**

- Create: `src/main/lib/banish-rules.ts`
- Test: `tests/unit/banish-rules.test.ts`

**Interfaces:**

- Consumes: nothing.
- Produces: `shouldBanish(s: BanishCandidate, now: number, banishMs: number): boolean`; `interface BanishCandidate { disabled: boolean; active: boolean; neverHibernate: boolean; peeking: boolean; lastUsedAt: number }`; `BANISH_MIN_HOURS = 1`; `BANISH_MAX_HOURS = 720`. Tasks 2 and 5 import these.

- [x] **Step 1: Write the failing test**

Create `tests/unit/banish-rules.test.ts` (style mirrors `tests/unit/hibernation-rules.test.ts`):

```ts
import { describe, expect, it } from 'vitest';
import { shouldBanish } from '../../src/main/lib/banish-rules';

const HOUR = 3_600_000;
const base = {
  disabled: false,
  active: false,
  neverHibernate: false,
  peeking: false,
  lastUsedAt: 0,
};

describe('shouldBanish', () => {
  it('banishes a service unused past the threshold', () => {
    expect(shouldBanish({ ...base, lastUsedAt: 1 * HOUR }, 26 * HOUR, 24 * HOUR)).toBe(true);
  });
  it('not before the threshold', () => {
    expect(shouldBanish({ ...base, lastUsedAt: 3 * HOUR }, 26 * HOUR, 24 * HOUR)).toBe(false);
  });
  it('never an unstamped service — no clock, no banish', () => {
    expect(shouldBanish(base, 999 * HOUR, 24 * HOUR)).toBe(false);
  });
  it('never the active service', () => {
    expect(shouldBanish({ ...base, active: true, lastUsedAt: 1 }, 999 * HOUR, 24 * HOUR)).toBe(
      false,
    );
  });
  it('never an already-banished service', () => {
    expect(shouldBanish({ ...base, disabled: true, lastUsedAt: 1 }, 999 * HOUR, 24 * HOUR)).toBe(
      false,
    );
  });
  it('never a kept-awake service — pinned means pinned', () => {
    expect(
      shouldBanish({ ...base, neverHibernate: true, lastUsedAt: 1 }, 999 * HOUR, 24 * HOUR),
    ).toBe(false);
  });
  it('never the peek in flight', () => {
    expect(shouldBanish({ ...base, peeking: true, lastUsedAt: 1 }, 999 * HOUR, 24 * HOUR)).toBe(
      false,
    );
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `corepack pnpm exec vitest run tests/unit/banish-rules.test.ts`
Expected: FAIL — cannot resolve `../../src/main/lib/banish-rules`.

- [x] **Step 3: Write the implementation**

Create `src/main/lib/banish-rules.ts`:

```ts
/** Bounds for the "banish after (hours)" input; the settings store clamps
 *  persisted values to the same range. */
export const BANISH_MIN_HOURS = 1;
export const BANISH_MAX_HOURS = 720;

export interface BanishCandidate {
  disabled: boolean;
  active: boolean;
  /** kept-awake is pinned: the user chose it, so it is never trimmed */
  neverHibernate: boolean;
  /** the in-flight Light Sleep peek must run its course, never be yanked */
  peeking: boolean;
  /** epoch ms of the last activation; 0 = never stamped, never banishable */
  lastUsedAt: number;
}

export function shouldBanish(s: BanishCandidate, now: number, banishMs: number): boolean {
  if (s.disabled || s.active || s.neverHibernate || s.peeking) return false;
  if (s.lastUsedAt <= 0) return false;
  return now - s.lastUsedAt >= banishMs;
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `corepack pnpm exec vitest run tests/unit/banish-rules.test.ts`
Expected: PASS (7 tests).

- [x] **Step 5: Commit gate**

Run `corepack pnpm lint` and `corepack pnpm typecheck` (expect clean), then stop and ask the user to run `/grimoire-core:commit` (suggested message: `feat(banish): add shouldBanish rule`). Do not run `git commit` yourself.

---

### Task 2: Settings model — `autoBanish` + `lastUsedAt`

**Files:**

- Modify: `src/shared/types.ts` (Settings interface ~line 84, DEFAULT_SETTINGS ~line 174)
- Modify: `src/main/settings.ts` (imports, two fill helpers, `normalize()`)
- Test: `tests/unit/settings.test.ts`

**Interfaces:**

- Consumes: `BANISH_MIN_HOURS`, `BANISH_MAX_HOURS` from `src/main/lib/banish-rules` (Task 1).
- Produces: `Settings.autoBanish: { enabled: boolean; hours: number }` (default `{ enabled: false, hours: 24 }`) and `Settings.lastUsedAt: Record<ServiceId, number>` (default all 0), normalized on load. Tasks 3, 5, 6, 7 rely on these exact names.

- [x] **Step 1: Write the failing tests**

Append inside the `describe('SettingsStore', …)` block of `tests/unit/settings.test.ts`:

```ts
  it('defaults auto-banish off at 24 hours with no usage stamps', () => {
    dir = mkdtempSync(join(tmpdir(), 'goetia-'));
    const s = new SettingsStore(dir).get();
    expect(s.autoBanish).toEqual({ enabled: false, hours: 24 });
    expect(Object.keys(s.lastUsedAt)).toHaveLength(SERVICES.length);
    expect(Object.values(s.lastUsedAt).every((v) => v === 0)).toBe(true);
  });

  it('coerces a mangled autoBanish block field by field', () => {
    dir = mkdtempSync(join(tmpdir(), 'goetia-'));
    writeFileSync(
      join(dir, 'settings.json'),
      JSON.stringify({ autoBanish: { enabled: 'yes', hours: 9000 } }),
    );
    const s = new SettingsStore(dir).get();
    expect(s.autoBanish.enabled).toBe(false); // junk -> default
    expect(s.autoBanish.hours).toBe(720); // clamped to max
  });

  it('fills missing lastUsedAt keys and zeroes corrupt values', () => {
    dir = mkdtempSync(join(tmpdir(), 'goetia-'));
    writeFileSync(
      join(dir, 'settings.json'),
      JSON.stringify({ lastUsedAt: { zalo: 1000, discord: 'never', slack: -5 } }),
    );
    const s = new SettingsStore(dir).get();
    expect(s.lastUsedAt.zalo).toBe(1000); // valid stamp survives
    expect(s.lastUsedAt.discord).toBe(0); // corrupt string coerced
    expect(s.lastUsedAt.slack).toBe(0); // negative coerced
    expect(s.lastUsedAt.whatsapp).toBe(0); // missing key filled
  });

  it('round-trips lastUsedAt and autoBanish across instances', () => {
    dir = mkdtempSync(join(tmpdir(), 'goetia-'));
    const store = new SettingsStore(dir);
    store.update({
      autoBanish: { enabled: true, hours: 48 },
      lastUsedAt: { ...store.get().lastUsedAt, discord: 123_456 },
    });
    const reread = new SettingsStore(dir).get();
    expect(reread.autoBanish).toEqual({ enabled: true, hours: 48 });
    expect(reread.lastUsedAt.discord).toBe(123_456);
  });
```

- [x] **Step 2: Run tests to verify they fail**

Run: `corepack pnpm exec vitest run tests/unit/settings.test.ts`
Expected: the four new tests FAIL (`s.autoBanish` / `s.lastUsedAt` undefined); all pre-existing tests still PASS.

- [x] **Step 3: Add the fields to `src/shared/types.ts`**

In `interface Settings`, directly after the `hibernationMinutes: number;` line:

```ts
  /** Auto-disable (banish) a service untouched for `hours`; opt-in. The unused
   *  clock is `lastUsedAt`, so it spans restarts and time while the app is
   *  closed. See lib/banish-rules. */
  autoBanish: { enabled: boolean; hours: number };
  /** epoch ms of each service's last activation; 0 = never. Only activation
   *  moves it — banners, badges and peeks never do. */
  lastUsedAt: Record<ServiceId, number>;
```

In `DEFAULT_SETTINGS`, directly after the `hibernationMinutes: 30,` line (shared code cannot import main's `banish-rules`, so the default is written out like `hibernationMinutes`):

```ts
  autoBanish: { enabled: false, hours: 24 },
  lastUsedAt: {
    whatsapp: 0,
    messenger: 0,
    instagram: 0,
    telegram: 0,
    discord: 0,
    zalo: 0,
    tiktok: 0,
    shopee: 0,
    slack: 0,
    teams: 0,
  },
```

- [x] **Step 4: Add the fills to `src/main/settings.ts`**

Add to the imports:

```ts
import { BANISH_MAX_HOURS, BANISH_MIN_HOURS } from './lib/banish-rules';
```

Add the two helpers next to `fillZoom` (after it):

```ts
/** summonHotkey-style field-by-field coercion for the auto-banish block. */
function fillAutoBanish(raw: unknown): Settings['autoBanish'] {
  const d = DEFAULT_SETTINGS.autoBanish;
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<Settings['autoBanish']>;
  return {
    enabled: typeof r.enabled === 'boolean' ? r.enabled : d.enabled,
    hours:
      typeof r.hours === 'number' && Number.isFinite(r.hours)
        ? Math.min(Math.max(r.hours, BANISH_MIN_HOURS), BANISH_MAX_HOURS)
        : d.hours,
  };
}

/** Epoch-ms twin of fillZoom(): missing, corrupt, or non-positive stamps
 *  coerce to 0 (= never used, never banishable). */
function fillLastUsedAt(raw: unknown): Record<ServiceId, number> {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<Record<ServiceId, number>>;
  return Object.fromEntries(
    SERVICES.map((s) => {
      const v = r[s.id];
      return [s.id, typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0];
    }),
  ) as Record<ServiceId, number>;
}
```

In `normalize()`'s returned `settings` object, after the `zoom: fillZoom(raw.zoom),` line:

```ts
      autoBanish: fillAutoBanish(raw.autoBanish),
      lastUsedAt: fillLastUsedAt(raw.lastUsedAt),
```

- [x] **Step 5: Run tests to verify they pass**

Run: `corepack pnpm exec vitest run tests/unit/settings.test.ts && corepack pnpm typecheck`
Expected: PASS, typecheck clean.

- [x] **Step 6: Commit gate**

Run `corepack pnpm lint` (expect clean), then stop and ask the user to run `/grimoire-core:commit` (suggested message: `feat(banish): persist autoBanish setting and lastUsedAt clocks`). Do not run `git commit` yourself.

---

### Task 3: Stamp `lastUsedAt` on activation

**Files:**

- Modify: `src/main/activate.ts` (`rememberSurface`, `activateService`)
- Test: `tests/unit/activate.test.ts`

**Interfaces:**

- Consumes: `Settings.lastUsedAt` (Task 2).
- Produces: `rememberSurface(ctx: AppContext, usedId?: ServiceId): void` — when `usedId` is given, the write also stamps `lastUsedAt[usedId] = Date.now()`. Callers without `usedId` (`setHomeOpen`, `applyDisabledChange`) keep the old two-key patch exactly.

- [x] **Step 1: Update the test harness and write the failing tests**

In `tests/unit/activate.test.ts`, add `DEFAULT_SETTINGS` to the imports and give the mock settings a `get`:

```ts
import { DEFAULT_SETTINGS } from '../../src/shared/types';
```

In `makeCtx`, change the ctx literal's settings entry to:

```ts
    settings: { update, get: () => DEFAULT_SETTINGS },
```

Replace the body of the existing test `records the service as the surface to restore` with:

```ts
    const state = new MainState();
    state.homeOpen = true;
    const { ctx, update } = makeCtx(state);
    activateService(ctx, 'discord');
    expect(update).toHaveBeenCalledWith({
      lastActiveId: 'discord',
      lastHomeOpen: false,
      lastUsedAt: expect.objectContaining({ discord: expect.any(Number) }),
    });
```

Add a new test after it, still inside `describe('activateService', …)`:

```ts
  it('stamps the usage clock at the activation instant', () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_755_000_000_000);
    const { ctx, update } = makeCtx(new MainState());
    activateService(ctx, 'zalo');
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        lastUsedAt: expect.objectContaining({ zalo: 1_755_000_000_000 }),
      }),
    );
    vi.useRealTimers();
  });
```

The two `setHomeOpen` tests asserting the exact two-key patch stay untouched — passing through Home must not stamp any service.

- [x] **Step 2: Run tests to verify they fail**

Run: `corepack pnpm exec vitest run tests/unit/activate.test.ts`
Expected: the replaced and new activation tests FAIL (patch has no `lastUsedAt`); `setHomeOpen` tests PASS.

- [x] **Step 3: Implement the stamp in `src/main/activate.ts`**

Replace `rememberSurface` with:

```ts
/** Remember the surface to restore on the next launch. Written on change, not
 *  at quit: force-quit, a crash, and an OS restart never run before-quit.
 *  Settings and the quick switcher are modals you pass through, so Home is the
 *  only overlay recorded. A service activation also resets the unused clock
 *  auto-banish reads, in the same write. */
export function rememberSurface(ctx: AppContext, usedId?: ServiceId): void {
  ctx.settings.update({
    lastActiveId: ctx.state.activeId,
    lastHomeOpen: ctx.state.homeOpen,
    ...(usedId
      ? { lastUsedAt: { ...ctx.settings.get().lastUsedAt, [usedId]: Date.now() } }
      : {}),
  });
}
```

In `activateService`, change the `rememberSurface(ctx);` call to `rememberSurface(ctx, id);`.

- [x] **Step 4: Run tests to verify they pass**

Run: `corepack pnpm exec vitest run tests/unit/activate.test.ts && corepack pnpm typecheck`
Expected: PASS, typecheck clean.

- [x] **Step 5: Commit gate**

Run `corepack pnpm lint` (expect clean), then stop and ask the user to run `/grimoire-core:commit` (suggested message: `feat(banish): stamp lastUsedAt on service activation`). Do not run `git commit` yourself.

---

### Task 4: Extract `applyDisabledChange`, add `ctx.banishServices`

**Files:**

- Modify: `src/main/ipc-handlers.ts` (type imports, `AppContext`, new exported function, `settings:update` handler)
- Modify: `src/main/index.ts` (import, ctx literal)

**Interfaces:**

- Consumes: `rememberSurface` (Task 3 signature — called here without `usedId`).
- Produces: `applyDisabledChange(ctx: AppContext, before: Settings): void` exported from `src/main/ipc-handlers.ts`; `AppContext.banishServices(ids: ServiceId[]): void` late-bound in `index.ts`. Task 5's sweep calls `this.ctx.banishServices(due)`.

This is a behavior-preserving refactor plus one new late-bound member; existing unit + e2e suites are the test. No unit test imports `ipc-handlers.ts` at runtime (it imports electron), which is exactly why the helper lives here and hibernation reaches it via the late-bound member.

- [x] **Step 1: Extract the helper in `src/main/ipc-handlers.ts`**

Change the shared-types import to include `Settings`:

```ts
import type { ServiceId, Settings } from '../shared/types';
```

Add to the `AppContext` interface, after the `noteBannerFired` member:

```ts
  /** disable services and run the full disabled side-effects tail; late-bound
   *  in index.ts so hibernation.ts stays free of electron */
  banishServices(ids: ServiceId[]): void;
```

Add this exported function above `registerIpcHandlers` (the body is the current `if (patch.disabled) { … }` block moved verbatim, with `after` read from the store):

```ts
/** Side-effects tail of a disabled-set change — shared by the settings:update
 *  handler and auto-banish (via ctx.banishServices), so the two cannot drift. */
export function applyDisabledChange(ctx: AppContext, before: Settings): void {
  const after = ctx.settings.get();
  for (const id of after.order) {
    if (after.disabled[id] && ctx.views.has(id)) {
      ctx.views.destroy(id);
      ctx.waking.end(id, 'destroyed');
      ctx.state.setRuntime(id, {
        unread: { direct: 0, indirect: 0 },
        crashed: false,
        stale: false,
        hibernated: false,
        loading: false,
        waking: false,
      });
    }
    if (!after.disabled[id] && before.disabled[id] && after.neverHibernate[id]) {
      ctx.views.ensure(id);
    }
  }
  const next = resolveActivation({
    order: after.order,
    disabled: after.disabled,
    activeId: ctx.state.activeId,
    hasActiveView: ctx.views.has(ctx.state.activeId),
  });
  if (next) {
    ctx.state.activeId = next;
    ctx.noteActivated(next);
    // Resolve now, present later. Showing a view here would cover the
    // surface the user is standing on — this is the settings-modal bug.
    ctx.views.activate(next, { show: !anyOverlayOpen(ctx.state) });
  }
  // also runs when next is null: banishing the last service leaves
  // activeId pointing at a disabled one, which is exactly the unrestorable
  // record that should reopen on Home
  rememberSurface(ctx);
  buildAppMenu(ctx);
}
```

In the `settings:update` handler, replace the whole `if (patch.disabled) { … }` block with:

```ts
    if (patch.disabled) applyDisabledChange(ctx, before);
```

The `after` variable in the handler is now used only by the `neverHibernate` branch — if TypeScript flags `after` as unused after this change it is not (the `neverHibernate` branch still reads it); leave the handler otherwise untouched.

- [x] **Step 2: Implement `banishServices` in `src/main/index.ts`**

Change the ipc-handlers import to:

```ts
import { type AppContext, applyDisabledChange, registerIpcHandlers } from './ipc-handlers';
```

Add to the `ctx` literal, after the `noteBannerFired` entry:

```ts
      banishServices: (ids) => {
        const before = settings.get();
        const disabled = { ...before.disabled };
        for (const id of ids) disabled[id] = true;
        settings.update({ disabled });
        applyDisabledChange(ctx, before);
        broadcast();
      },
```

- [x] **Step 3: Verify the refactor changed nothing**

Run: `corepack pnpm lint && corepack pnpm typecheck && corepack pnpm test`
Expected: all PASS (pure refactor; no behavior change is observable yet).

- [x] **Step 4: Commit gate**

Stop and ask the user to run `/grimoire-core:commit` (suggested message: `refactor(main): extract applyDisabledChange, add banishServices to AppContext`). Do not run `git commit` yourself.

---

### Task 5: Banish step in the hibernation sweep

**Files:**

- Modify: `src/main/hibernation.ts` (import, `sweep()`)
- Test: `tests/unit/hibernation.test.ts` (harness extension + new describe block)

**Interfaces:**

- Consumes: `shouldBanish` (Task 1), `Settings.autoBanish` / `Settings.lastUsedAt` (Task 2), `ctx.banishServices` (Task 4).
- Produces: sweep behavior — seeding unstamped clocks, one batched `banishServices` call, early return (no peek scheduling) on a sweep that banished.

- [x] **Step 1: Extend the harness and write the failing tests**

In `tests/unit/hibernation.test.ts`, extend `harness()`: add recorders and the two new ctx members. After the `const runtimes = …` declaration, add:

```ts
  const banished: ServiceId[][] = [];
```

In the `ctx` literal, replace `settings: { get: () => settings },` with:

```ts
    settings: {
      get: () => settings,
      update: (patch: Partial<Settings>) => Object.assign(settings, patch),
    },
```

and add after the `waking` entry:

```ts
    banishServices: (ids: ServiceId[]) => {
      banished.push(ids);
      settings.disabled = {
        ...settings.disabled,
        ...Object.fromEntries(ids.map((id) => [id, true])),
      };
    },
```

Change the return to `return { ctx, ensured, destroyed, arrive, banished, settings };`.

Append a new describe block at the end of the file:

```ts
describe('HibernationController auto-banish', () => {
  const HOUR = 3_600_000;
  /** Light Sleep off keeps peeks out of these tests; 1h threshold. */
  const banishHarness = (over: Partial<Settings> = {}) =>
    harness({ lightSleep: false, autoBanish: { enabled: true, hours: 1 }, ...over });

  it('banishes a service unused past the threshold, in one batch call', () => {
    vi.useFakeTimers();
    const { ctx, banished } = banishHarness({
      lastUsedAt: {
        ...DEFAULT_SETTINGS.lastUsedAt,
        discord: Date.now() - 2 * HOUR,
        instagram: Date.now(),
      },
    });
    const h = new HibernationController(ctx);
    h.start();
    vi.advanceTimersByTime(BOOT);
    expect(banished).toEqual([['discord']]); // instagram is fresh
    h.dispose();
    vi.useRealTimers();
  });

  it('batches every due service into one call, in rail order', () => {
    vi.useFakeTimers();
    const { banished, ctx } = banishHarness({
      lastUsedAt: {
        ...DEFAULT_SETTINGS.lastUsedAt,
        discord: Date.now() - 2 * HOUR,
        instagram: Date.now() - 3 * HOUR,
      },
    });
    const h = new HibernationController(ctx);
    h.start();
    vi.advanceTimersByTime(BOOT);
    expect(banished).toEqual([['discord', 'instagram']]);
    h.dispose();
    vi.useRealTimers();
  });

  it('seeds an unstamped clock instead of banishing it', () => {
    vi.useFakeTimers();
    const { ctx, banished, settings } = banishHarness(); // all lastUsedAt 0
    const h = new HibernationController(ctx);
    h.start();
    vi.advanceTimersByTime(BOOT);
    expect(banished).toEqual([]);
    // the clock started at the first sweep — a full fresh window from here
    expect(settings.lastUsedAt.discord).toBeGreaterThan(0);
    expect(settings.lastUsedAt.instagram).toBeGreaterThan(0);
    expect(settings.lastUsedAt.whatsapp).toBe(0); // disabled: not seeded
    h.dispose();
    vi.useRealTimers();
  });

  it('never banishes the active service', () => {
    vi.useFakeTimers();
    const { ctx, banished } = banishHarness({
      lastUsedAt: { ...DEFAULT_SETTINGS.lastUsedAt, discord: Date.now() - 2 * HOUR },
    });
    ctx.state.activeId = 'discord';
    const h = new HibernationController(ctx);
    h.start();
    vi.advanceTimersByTime(BOOT);
    expect(banished).toEqual([]);
    h.dispose();
    vi.useRealTimers();
  });

  it('never banishes a kept-awake service', () => {
    vi.useFakeTimers();
    const { ctx, banished } = banishHarness({
      neverHibernate: { ...DEFAULT_SETTINGS.neverHibernate, discord: true },
      lastUsedAt: { ...DEFAULT_SETTINGS.lastUsedAt, discord: Date.now() - 2 * HOUR },
    });
    const h = new HibernationController(ctx);
    h.start();
    vi.advanceTimersByTime(BOOT);
    expect(banished).toEqual([]);
    h.dispose();
    vi.useRealTimers();
  });

  it('does nothing while the feature is off — not even seeding', () => {
    vi.useFakeTimers();
    const { ctx, banished, settings } = banishHarness({
      autoBanish: { enabled: false, hours: 1 },
      lastUsedAt: { ...DEFAULT_SETTINGS.lastUsedAt, discord: Date.now() - 2 * HOUR },
    });
    const h = new HibernationController(ctx);
    h.start();
    vi.advanceTimersByTime(BOOT);
    expect(banished).toEqual([]);
    expect(settings.lastUsedAt.instagram).toBe(0); // no seeding write
    h.dispose();
    vi.useRealTimers();
  });
});
```

- [x] **Step 2: Run tests to verify they fail**

Run: `corepack pnpm exec vitest run tests/unit/hibernation.test.ts`
Expected: the six new tests FAIL (nothing calls `banishServices` or seeds clocks); all pre-existing peek tests still PASS (their `autoBanish` default is off).

- [x] **Step 3: Implement the sweep step in `src/main/hibernation.ts`**

Add to the imports:

```ts
import { shouldBanish } from './lib/banish-rules';
```

In `sweep()`, insert between the end of the hibernate `for` loop and the `if (!s.lightSleep) return;` line:

```ts
    if (s.autoBanish.enabled) {
      // never-activated services start their unused clock at the first sweep —
      // enabling the feature grants every service a full fresh window
      const stamped = { ...s.lastUsedAt };
      let seeded = false;
      for (const id of s.order) {
        if (!s.disabled[id] && !stamped[id]) {
          stamped[id] = now;
          seeded = true;
        }
      }
      if (seeded) this.ctx.settings.update({ lastUsedAt: stamped });
      const banishMs = s.autoBanish.hours * 3_600_000;
      const due = s.order.filter((id) =>
        shouldBanish(
          {
            disabled: s.disabled[id],
            active: this.ctx.state.activeId === id,
            neverHibernate: s.neverHibernate[id],
            peeking: this.peeking?.id === id,
            lastUsedAt: stamped[id],
          },
          now,
          banishMs,
        ),
      );
      if (due.length > 0) {
        // one patch for the whole batch. `s` is stale past this point, so let
        // the next sweep schedule peeks rather than peeking a banished service
        this.ctx.banishServices(due);
        return;
      }
    }
```

- [x] **Step 4: Run tests to verify they pass**

Run: `corepack pnpm exec vitest run tests/unit/hibernation.test.ts && corepack pnpm typecheck`
Expected: PASS (all peek tests + 6 banish tests), typecheck clean.

- [x] **Step 5: Commit gate**

Run `corepack pnpm lint` (expect clean), then stop and ask the user to run `/grimoire-core:commit` (suggested message: `feat(banish): auto-banish unused services from the hibernation sweep`). Do not run `git commit` yourself.

---

### Task 6: Settings UI — move sleep rows to Services, add banish rows

**Files:**

- Modify: `src/renderer/src/components/SettingsView.tsx`

**Interfaces:**

- Consumes: `Settings.autoBanish` (Task 2) via the existing `update(patch)` → `settings:update` IPC (already typed `Partial<Settings>`, nothing to add in `shared/ipc.ts`).
- Produces: test ids `auto-banish-enabled`, `auto-banish-hours` (Task 7 asserts them); General pane no longer renders the hibernate/Light Sleep rows.

- [x] **Step 1: Move the rows and add the banish controls**

In the **General** pane, delete these three `<Row>` blocks entirely: `Hibernate idle services after (minutes)`, `Light Sleep`, and `Battery saver for Light Sleep`. General keeps: Close to tray, Launch at login, Summoning hotkey, Combo.

In the **Services** pane, between the closing of the `.map(...)` over services and the `{/* composition lives on Home … */}` comment, insert:

```tsx
                <Row label="Hibernate idle services after (minutes)">
                  <input
                    type="number"
                    min={5}
                    max={240}
                    value={s.hibernationMinutes}
                    onChange={(e) =>
                      update({ hibernationMinutes: Math.max(5, Number(e.target.value) || 30) })
                    }
                    className="tabular w-20 rounded-ctl border border-border bg-bg-2 px-2 py-1 text-right text-text-1"
                  />
                </Row>
                <Row
                  label="Banish unused services"
                  hint="An unused service leaves the rail and returns to Home. Sign-in is kept."
                >
                  <input
                    type="checkbox"
                    data-testid="auto-banish-enabled"
                    checked={s.autoBanish.enabled}
                    onChange={(e) =>
                      update({ autoBanish: { ...s.autoBanish, enabled: e.target.checked } })
                    }
                  />
                </Row>
                <Row label="After (hours)">
                  <input
                    type="number"
                    data-testid="auto-banish-hours"
                    min={1}
                    max={720}
                    disabled={!s.autoBanish.enabled}
                    value={s.autoBanish.hours}
                    onChange={(e) =>
                      update({
                        autoBanish: {
                          ...s.autoBanish,
                          hours: Math.max(1, Number(e.target.value) || 24),
                        },
                      })
                    }
                    className="tabular w-20 rounded-ctl border border-border bg-bg-2 px-2 py-1 text-right text-text-1 disabled:opacity-40"
                  />
                </Row>
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
                <Row
                  label="Battery saver for Light Sleep"
                  hint="Wake a quiet service less often, and least often on battery. Saves a lot of work; its badge can lag by up to an hour."
                >
                  <input
                    type="checkbox"
                    data-testid="peek-saver-enabled"
                    disabled={!s.lightSleep}
                    checked={s.peekSaver}
                    onChange={(e) => update({ peekSaver: e.target.checked })}
                  />
                </Row>
```

(The Light Sleep and Battery saver blocks are the General-pane originals moved verbatim, test ids included.)

- [x] **Step 2: Verify**

Run: `corepack pnpm lint && corepack pnpm typecheck && corepack pnpm test`
Expected: all PASS (no unit test renders SettingsView; e2e covers it in Task 7).

- [x] **Step 3: Commit gate**

Stop and ask the user to run `/grimoire-core:commit` (suggested message: `feat(settings): sleep settings move to Services with the banish controls`). Do not run `git commit` yourself.

---

### Task 7: E2E — banish flow and Services-pane layout

**Files:**

- Create: `tests/e2e/banish.spec.ts`

**Interfaces:**

- Consumes: test ids from Task 6, sweep behavior from Task 5, `lastUsedAt` persistence from Task 2, existing test ids `settings-btn`, `settings-nav-services`, `settings-nav-general`, `settings`, `rail`, `service-tile`, `home-btn`, `welcome`.
- Produces: nothing downstream.

- [x] **Step 1: Write the spec**

Create `tests/e2e/banish.spec.ts`:

```ts
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { _electron as electron, expect, test } from '@playwright/test';

const isShell = (p: { url(): string }) =>
  p.url().startsWith('file://') && !p.url().includes('loading.html');

/** messenger + zalo enabled; the rest banished */
const DISABLED = {
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
};

async function launch(extra: Record<string, unknown>, env: Record<string, string> = {}) {
  const profile = mkdtempSync(join(tmpdir(), 'goetia-e2e-'));
  writeFileSync(join(profile, 'settings.json'), JSON.stringify({ disabled: DISABLED, ...extra }));
  const app = await electron.launch({
    args: ['out/main/index.js', '--goetia-e2e', `--goetia-user-data=${profile}`],
    env: { ...process.env, ...env },
  });
  const win =
    app.windows().find(isShell) ?? (await app.waitForEvent('window', { predicate: isShell }));
  return { app, win };
}

test('sleep settings live in Services; the hours input follows the toggle', async () => {
  const { app, win } = await launch({});
  await win.locator('[data-testid="settings-btn"]').click();
  await win.locator('[data-testid="settings-nav-services"]').click();

  const pane = win.locator('[data-testid="settings"]');
  await expect(pane.getByText('Hibernate idle services after (minutes)')).toBeVisible();
  await expect(win.locator('[data-testid="light-sleep-enabled"]')).toBeVisible();

  const hours = win.locator('[data-testid="auto-banish-hours"]');
  await expect(win.locator('[data-testid="auto-banish-enabled"]')).not.toBeChecked();
  await expect(hours).toBeDisabled();
  await expect(hours).toHaveValue('24');
  await win.locator('[data-testid="auto-banish-enabled"]').check();
  await expect(hours).toBeEnabled();

  // the rows really moved: General no longer carries them
  await win.locator('[data-testid="settings-nav-general"]').click();
  await expect(pane.getByText('Hibernate idle services after (minutes)')).toHaveCount(0);
  await expect(win.locator('[data-testid="light-sleep-enabled"]')).toHaveCount(0);
  await app.close();
});

test('a service unused past the threshold is banished to Home', async () => {
  // zalo was last used in 1970 (persisted clock, so the threshold spans
  // restarts); messenger boots active and is exempt. Light Sleep off keeps
  // peek views out of the assertion.
  const { app, win } = await launch(
    {
      lightSleep: false,
      autoBanish: { enabled: true, hours: 24 },
      lastUsedAt: { zalo: 1000 },
    },
    { GOETIA_SWEEP_MS: '1000' },
  );

  const rail = win.locator('[data-testid="rail"]');
  await expect(win.locator('[data-testid="service-tile"]')).toHaveCount(2);

  // the first sweep (5s boot delay) banishes zalo: tile gone, messenger untouched
  await expect(win.locator('[data-testid="service-tile"]')).toHaveCount(1, { timeout: 30_000 });
  await expect(rail.locator('button[aria-current="page"]')).toHaveAttribute(
    'aria-label',
    'Messenger',
  );

  // zalo sits in Home's banished (unbound) section, ready to re-summon
  await win.locator('[data-testid="home-btn"]').click();
  const welcome = win.locator('[data-testid="welcome"]');
  await expect(welcome).toBeVisible();
  await expect(welcome.getByRole('button', { name: 'Zalo' })).toHaveAttribute(
    'aria-pressed',
    'false',
  );
  await app.close();
});
```

- [x] **Step 2: Run the new spec**

Run: `corepack pnpm build && env -u ELECTRON_RUN_AS_NODE corepack pnpm exec playwright test tests/e2e/banish.spec.ts`
Expected: 2 PASS.

- [x] **Step 3: Run the full e2e suite**

Run: `env -u ELECTRON_RUN_AS_NODE corepack pnpm e2e`
Expected: all specs PASS (the moved rows must not break `restart.spec.ts` General assertions or `home.spec.ts` Services assertions — none of them touch the moved rows).

- [x] **Step 4: Commit gate**

Stop and ask the user to run `/grimoire-core:commit` (suggested message: `test(banish): e2e for auto-banish and the Services settings pane`). Do not run `git commit` yourself.

---

### Task 8: Guardrail docs + full verification

**Files:**

- Modify: `CLAUDE.md`

**Interfaces:**

- Consumes: everything above.
- Produces: updated guardrails; final green suite.

- [x] **Step 1: Update CLAUDE.md**

In "Adding a service" step 1, extend the record list `(order, muted, disabled, neverHibernate)` to `(order, muted, disabled, neverHibernate, zoom, lastUsedAt)` (backticked as in the original).

In "Reliability & performance", after the Light Sleep peek bullet, add this bullet (one line, no hard wrap):

```markdown
- Auto-banish is the hibernation sweep, one step later: opt-in (`autoBanish`), decided by `shouldBanish` (`lib/banish-rules.ts`) off the persisted `lastUsedAt` — stamped only by activation (`rememberSurface`), never by banners, badges, or peeks; unstamped clocks seed at the first enabled sweep. All due services land in ONE `ctx.banishServices` patch through the shared `applyDisabledChange` tail, and a sweep that banished skips peek scheduling (its settings snapshot is stale).
```

- [x] **Step 2: Lint the markdown**

Run: `npx markdownlint-cli2 CLAUDE.md`
Expected: no warnings on the edited lines (report any pre-existing warnings elsewhere without churning them).

- [x] **Step 3: Full verification**

Run: `corepack pnpm lint && corepack pnpm typecheck && corepack pnpm test && env -u ELECTRON_RUN_AS_NODE corepack pnpm e2e`
Expected: all green — the project's definition of done.

- [x] **Step 4: Commit gate**

Stop and ask the user to run `/grimoire-core:commit` (suggested message: `docs: record auto-banish guardrails`). Do not run `git commit` yourself.
