# Reliability & Performance Remediation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task.
> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the correctness and resource findings from the two code
reviews: a window-lifecycle crash, a defeated crash-reload cap, unbounded
background polling, a broadcast storm, resize thrash, a startup brick, and
several smaller leaks and cleanups.

**Architecture:** Decision logic moves into pure helpers with vitest unit
tests (resilience dwell, ready-poll bound, runner dedup/timeout,
`setRuntime` no-op, `normalize` coercion, single-pass Messenger detection,
shared badge label). Thin wiring in `index.ts`, `tray.ts`, and `views.ts`
consumes them. No new dependencies.

**Tech Stack:** Electron 43, React 19, TypeScript, vitest (happy-dom),
Playwright e2e, zustand.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-07-hardening-and-remediation-design.md`
- **No `git commit` anywhere** — the repo owner commits via `/commit`.
- Verify code tasks with: `pnpm lint`, `pnpm typecheck`, `pnpm test`; wiring
  tasks also with `pnpm e2e` (unset `ELECTRON_RUN_AS_NODE` first).
- Preserve existing recipe count behaviour: the fixtures in `tests/fixtures`
  are the oracle — Messenger must still count 3, and no recipe row in
  `tests/unit/recipes.test.ts` may change its expected numbers.

---

### Task 1: Close-to-tray off must quit, not zombie the app

**Files:**

- Modify: `src/main/tray.ts:58-64`
- Modify: `src/main/index.ts:110-120` (guard `broadcast`)

**Interfaces:**

- Produces: closing the window with `closeToTray === false` quits the app;
  `broadcast()` is a no-op once the window is destroyed.

- [ ] **Step 1: Make the close handler quit when close-to-tray is off**

In `src/main/tray.ts`, replace the `ctx.win.on('close', …)` block
(`tray.ts:58-64`):

```ts
  ctx.win.on('close', (e) => {
    if (quitting) return; // real quit in progress; let it close
    if (ctx.settings.get().closeToTray) {
      e.preventDefault();
      ctx.win.hide();
      rebuild();
    } else {
      // close-to-tray off: the X button means quit, not hide — never leave a
      // destroyed-window process running with live timers/tray behind it
      quitting = true;
      app.quit();
    }
  });
```

- [ ] **Step 2: Guard broadcast against a destroyed window**

In `src/main/index.ts`, at the very top of the `broadcast` function
(`index.ts:110`, first line inside the arrow):

```ts
    const broadcast = () => {
      if (win.isDestroyed()) return;
      const s = settings.get();
      // …rest unchanged…
```

- [ ] **Step 3: Verify**

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm e2e`
Expected: PASS. Manual: toggle "Close to tray" off in Settings, press the
window close button — the app quits cleanly (no lingering dock/tray, no
console `Object has been destroyed`).

---

### Task 2: Crash-reload cap survives crashes after a successful load

**Files:**

- Modify: `src/main/resilience.ts`
- Test: `tests/unit/resilience.test.ts` (new)

**Interfaces:**

- Consumes: `AppContext` (uses `ctx.state`, `ctx.views`).
- Produces: `ResilienceManager` that only forgets the attempt count after
  the page has stayed up for `DWELL_MS`; a crash within the dwell keeps the
  count so `MAX_AUTO_RELOADS` is reached.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/resilience.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { ResilienceManager } from '../../src/main/resilience';

function harness() {
  const reloads: string[] = [];
  const runtime = { crashed: false };
  const ctx = {
    state: {
      setRuntime: (_id: string, patch: { crashed?: boolean }) => {
        if (patch.crashed !== undefined) runtime.crashed = patch.crashed;
      },
      runtime: () => runtime,
      activeId: 'messenger',
    },
    views: { reload: (id: string) => reloads.push(id), hideActive: () => {} },
  } as unknown as ConstructorParameters<typeof ResilienceManager>[0];
  return { ctx, reloads };
}

describe('ResilienceManager crash cap', () => {
  it('gives up after MAX_AUTO_RELOADS crashes that never dwell', () => {
    vi.useFakeTimers();
    const { ctx, reloads } = harness();
    const r = new ResilienceManager(ctx);
    for (let i = 0; i < 8; i++) {
      r.onCrashed('messenger');
      vi.advanceTimersByTime(60_000); // fire the backoff reload
      r.noteRecovered('messenger'); // did-finish-load right after reload
      vi.advanceTimersByTime(1_000); // …but crashes again before the dwell
    }
    expect(reloads.length).toBe(5); // capped, not unbounded
    vi.useRealTimers();
  });

  it('forgets the count after the page dwells', () => {
    vi.useFakeTimers();
    const { ctx, reloads } = harness();
    const r = new ResilienceManager(ctx);
    r.onCrashed('messenger');
    vi.advanceTimersByTime(60_000);
    r.noteRecovered('messenger');
    vi.advanceTimersByTime(31_000); // exceeds DWELL_MS -> count reset
    for (let i = 0; i < 5; i++) {
      r.onCrashed('messenger');
      vi.advanceTimersByTime(60_000);
      r.noteRecovered('messenger');
      vi.advanceTimersByTime(31_000);
    }
    expect(reloads.length).toBeGreaterThan(5); // each dwell re-armed the budget
    vi.useRealTimers();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/unit/resilience.test.ts`
Expected: FAIL — current `noteRecovered` resets immediately, so the first
test sees more than 5 reloads.

- [ ] **Step 3: Implement the dwell**

Replace `src/main/resilience.ts` with:

```ts
import type { ServiceId } from '../shared/types';
import type { AppContext } from './ipc-handlers';
import { backoffDelay } from './lib/backoff';

const MAX_AUTO_RELOADS = 5;
/** A page must stay up this long after loading before we forget its crash
 *  count — otherwise a load→crash→reload loop resets the cap every cycle. */
const DWELL_MS = 30_000;

export class ResilienceManager {
  private attempts = new Map<ServiceId, number>();
  private dwellTimers = new Map<ServiceId, ReturnType<typeof setTimeout>>();

  constructor(private ctx: AppContext) {}

  private clearDwell(id: ServiceId): void {
    const t = this.dwellTimers.get(id);
    if (t !== undefined) {
      clearTimeout(t);
      this.dwellTimers.delete(id);
    }
  }

  onCrashed(id: ServiceId): void {
    this.clearDwell(id); // a crash within the dwell must keep the count
    const attempt = this.attempts.get(id) ?? 0;
    this.ctx.state.setRuntime(id, { crashed: true });
    if (attempt >= MAX_AUTO_RELOADS) return; // give up; manual Retry only
    this.attempts.set(id, attempt + 1);
    setTimeout(() => this.ctx.views.reload(id), backoffDelay(attempt));
  }

  onLoadFailed(id: ServiceId): void {
    this.clearDwell(id);
    this.ctx.state.setRuntime(id, { crashed: true, loading: false });
    if (this.ctx.state.activeId === id) this.ctx.views.hideActive();
  }

  noteRecovered(id: ServiceId): void {
    if (this.ctx.state.runtime(id).crashed) {
      this.ctx.state.setRuntime(id, { crashed: false });
    }
    // forget the crash count only after the page proves it can stay up
    this.clearDwell(id);
    this.dwellTimers.set(
      id,
      setTimeout(() => {
        this.attempts.delete(id);
        this.dwellTimers.delete(id);
      }, DWELL_MS),
    );
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/unit/resilience.test.ts`
Expected: PASS.

- [ ] **Step 5: Verify the suite**

Run: `pnpm lint && pnpm typecheck && pnpm test`
Expected: PASS.

---

### Task 3: Bound the readiness poll

**Files:**

- Modify: `src/preload/recipes/ready.ts`
- Modify: `tests/unit/ready-poll.test.ts`

**Interfaces:**

- Produces: `startReadyPoll(...)` stops after at most
  `ceil(WAKE_TIMEOUT_MS / interval) + buffer` ticks even if `ready()` never
  turns true, so a logged-out page cannot poll forever.

- [ ] **Step 1: Add the failing test**

Append to `tests/unit/ready-poll.test.ts` inside `describe('startReadyPoll')`:

```ts
  it('stops polling after the attempt cap when never ready', () => {
    const recipe: Recipe = { ...base, ready: () => false };
    const t = fakeTimers();
    const report = vi.fn();
    startReadyPoll(recipe, doc, report, t.setIntervalFn, t.clearIntervalFn);
    for (let i = 0; i < 60; i++) t.ticks[0]();
    expect(report).not.toHaveBeenCalled();
    expect(t.cleared).toHaveLength(1); // gave up and cleared the interval
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/unit/ready-poll.test.ts`
Expected: FAIL — `t.cleared` stays empty (poll never stops).

- [ ] **Step 3: Implement the cap**

In `src/preload/recipes/ready.ts`, add the constant after
`READY_POLL_INTERVAL_MS`:

```ts
export const READY_POLL_INTERVAL_MS = 250;
/** Give up polling once main's reveal timeout (10s) has surely fired; a
 *  later ready() cannot re-cover the current load, so polling on forever on
 *  a login wall only burns CPU. Buffer a few extra ticks. */
export const READY_POLL_MAX_ATTEMPTS =
  Math.ceil(10_000 / READY_POLL_INTERVAL_MS) + 4;
```

Replace the interval body in `startReadyPoll`:

```ts
  let attempts = 0;
  const timer = setIntervalFn(() => {
    attempts++;
    let ok = false;
    try {
      ok = check(doc);
    } catch {
      // not ready; the timeout reveals eventually
    }
    if (ok) {
      clearIntervalFn(timer);
      report();
      return;
    }
    if (attempts >= READY_POLL_MAX_ATTEMPTS) clearIntervalFn(timer);
  }, READY_POLL_INTERVAL_MS);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/unit/ready-poll.test.ts`
Expected: PASS (all cases, including the existing "reports once then stops").

- [ ] **Step 5: Verify**

Run: `pnpm lint && pnpm typecheck && pnpm test`
Expected: PASS.

---

### Task 4: Dedup stale reporting in the runner

**Files:**

- Modify: `src/preload/recipes/runner.ts`
- Test: `tests/unit/runner-stale.test.ts` (new)

**Interfaces:**

- Produces: `reportStale()` is called only on the transition into stale;
  a subsequent successful `report()` re-arms it.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/runner-stale.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { startRecipe } from '../../src/preload/recipes/runner';
import type { Recipe } from '../../src/preload/recipes/types';

function once(fns: (() => void)[]): typeof setInterval {
  return ((fn: () => void) => {
    fns.push(fn);
    return 1 as unknown as ReturnType<typeof setInterval>;
  }) as typeof setInterval;
}

describe('runner stale dedup', () => {
  it('reports stale only on the transition into stale', async () => {
    const ticks: (() => void)[] = [];
    let ok = false;
    const recipe: Recipe = {
      id: 'zalo',
      intervalMs: 2000,
      count: () => {
        if (!ok) throw new Error('logged out');
        return { direct: 1, indirect: 0 };
      },
    };
    const report = vi.fn();
    const reportStale = vi.fn();
    startRecipe(
      recipe,
      {} as Document,
      report,
      reportStale,
      undefined,
      undefined,
      once(ticks),
    );
    await ticks[0]();
    await ticks[0]();
    await ticks[0]();
    expect(reportStale).toHaveBeenCalledTimes(1); // three failures, one report
    ok = true;
    await ticks[0](); // recovers
    ok = false;
    await ticks[0](); // fails again -> new transition
    expect(reportStale).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/unit/runner-stale.test.ts`
Expected: FAIL — `reportStale` called 3 times on the first burst.

- [ ] **Step 3: Implement the dedup**

In `src/preload/recipes/runner.ts`, add a flag beside `last`:

```ts
  let last: Counts | null = null;
  let stale = false;
  let busy = false;
```

In the success branch, after `report(counts)` re-arms staleness — replace
the `try` body's tail and the `catch`:

```ts
    try {
      const counts = await recipe.count(doc);
      const rose = last !== null && counts.direct > last.direct;
      if (
        !last ||
        counts.direct !== last.direct ||
        counts.indirect !== last.indirect
      ) {
        last = counts;
        report(counts);
      }
      stale = false;
      if (
        rose &&
        reportNotification &&
        recipe.synthNotification &&
        !doc.hasFocus()
      ) {
        const n = recipe.synthNotification(doc);
        if (n) reportNotification(n);
      }
    } catch {
      if (!stale) {
        stale = true;
        reportStale();
      }
    } finally {
      busy = false;
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/unit/runner-stale.test.ts`
Expected: PASS.

- [ ] **Step 5: Verify (existing runner tests unaffected)**

Run: `pnpm vitest run tests/unit/runner-synth.test.ts tests/unit/runner-keepalive.test.ts`
Then: `pnpm lint && pnpm typecheck && pnpm test`
Expected: PASS.

---

### Task 5: `setRuntime` skips the no-op broadcast

**Files:**

- Modify: `src/main/state.ts:29-32`
- Modify: `tests/unit/state.test.ts`

**Interfaces:**

- Produces: `setRuntime` calls `touch()` only when the patch actually
  changes a field (so a repeated `{ stale: true }` no longer broadcasts).

- [ ] **Step 1: Add the failing test**

Append to `tests/unit/state.test.ts` inside `describe('MainState')`:

```ts
  it('does not notify when a patch changes nothing', () => {
    const s = new MainState();
    const cb = vi.fn();
    s.setRuntime('zalo', { stale: true }); // first change notifies
    s.onChange(cb);
    s.setRuntime('zalo', { stale: true }); // identical -> no notify
    expect(cb).not.toHaveBeenCalled();
    s.setRuntime('zalo', { stale: false }); // real change -> notify
    expect(cb).toHaveBeenCalledTimes(1);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/unit/state.test.ts`
Expected: FAIL — `cb` fires on the identical patch.

- [ ] **Step 3: Implement the no-op guard**

In `src/main/state.ts`, replace `setRuntime` (`state.ts:29-32`):

```ts
  setRuntime(id: ServiceId, patch: Partial<ServiceRuntime>): void {
    const current = this.runtime(id);
    if (this.isNoOp(current, patch)) return;
    Object.assign(current, patch);
    this.touch();
  }

  private isNoOp(
    current: ServiceRuntime,
    patch: Partial<ServiceRuntime>,
  ): boolean {
    const entries = Object.entries(patch) as [keyof ServiceRuntime, unknown][];
    for (const [k, v] of entries) {
      if (k === 'unread') {
        const u = v as ServiceRuntime['unread'];
        if (
          u.direct !== current.unread.direct ||
          u.indirect !== current.unread.indirect
        ) {
          return false;
        }
      } else if (current[k] !== v) {
        return false;
      }
    }
    return true;
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/unit/state.test.ts`
Expected: PASS (including the existing "notifies subscribers on mutation").

- [ ] **Step 5: Verify**

Run: `pnpm lint && pnpm typecheck && pnpm test`
Expected: PASS.

---

### Task 6: Coalesce layout on window resize

**Files:**

- Modify: `src/main/views.ts:22-32` (constructor), `layout()` unchanged

**Interfaces:**

- Produces: rapid resize events trigger at most one `layout()` per animation
  tick instead of one per event.

- [ ] **Step 1: Debounce the resize handler**

In `src/main/views.ts`, add a field and a scheduler to `ServiceViewManager`
and change the constructor listener. Add the field near `activeId`:

```ts
  private layoutScheduled = false;
```

Replace the constructor's resize wiring (`views.ts:31`):

```ts
    win.on('resize', () => this.scheduleLayout());
```

Add the method next to `layout()`:

```ts
  /** Coalesce a burst of resize events into a single layout pass. */
  private scheduleLayout(): void {
    if (this.layoutScheduled) return;
    this.layoutScheduled = true;
    setTimeout(() => {
      this.layoutScheduled = false;
      this.layout();
    }, 16);
  }
```

- [ ] **Step 2: Verify build and e2e**

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm e2e`
Expected: PASS. Manual: drag-resize the window with several services live —
views track the frame without per-pixel jitter, main-process CPU stays low.

---

### Task 7: Single-pass Messenger unread detection

**Files:**

- Modify: `src/preload/recipes/messenger.ts:12-32`

**Interfaces:**

- Produces: `isUnreadRow` computes `getComputedStyle` once per element
  (was twice for spans), preserving the fixture result of 3.

- [ ] **Step 1: Confirm the current expectation is green**

Run: `pnpm vitest run tests/unit/recipes.test.ts -t messenger`
Expected: PASS — the messenger row counts 3. This number must not change.

- [ ] **Step 2: Rewrite `isUnreadRow` as a single traversal**

In `src/preload/recipes/messenger.ts`, replace `isUnreadRow`
(`messenger.ts:12-32`):

```ts
function isUnreadRow(row: Element, win: Window & typeof globalThis): boolean {
  if (row.textContent?.includes('Unread')) return true;
  // one computed-style read per element (bold text OR blue unread dot),
  // instead of two overlapping querySelectorAll sweeps
  for (const el of row.querySelectorAll('span, div, i')) {
    const style = win.getComputedStyle(el);
    if (el.tagName === 'SPAN' && Number.parseInt(style.fontWeight, 10) >= 600) {
      return true;
    }
    const radius = style.borderRadius;
    if (!radius || (!radius.includes('%') && Number.parseInt(radius, 10) < 8)) continue;
    const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(style.backgroundColor);
    if (!m) continue;
    const [r, g, b] = [Number(m[1]), Number(m[2]), Number(m[3])];
    if (!(b >= 160 && b > g && g >= r)) continue; // blue-dominant, excludes presence-green
    const rect = el.getBoundingClientRect();
    if (rect.width > 0 && (rect.width < 6 || rect.width > 20)) continue;
    if (rect.height > 0 && (rect.height < 6 || rect.height > 20)) continue;
    return true;
  }
  return false;
}
```

- [ ] **Step 3: Run the recipe tests to confirm the count is unchanged**

Run: `pnpm vitest run tests/unit/recipes.test.ts`
Expected: PASS — messenger still 3, blank still 0, and the `ready()` and
`synthNotification` cases (which call `isUnreadRow`) still pass.

- [ ] **Step 4: Verify**

Run: `pnpm lint && pnpm typecheck && pnpm test`
Expected: PASS.

---

### Task 8: Harden `settings.json` normalization

**Files:**

- Modify: `src/main/settings.ts:9-30`
- Modify: `tests/unit/settings.test.ts`

**Interfaces:**

- Produces: `normalize` coerces a non-array `order` and non-object record
  fields back to defaults instead of throwing, so a corrupt file can't brick
  startup.

- [ ] **Step 1: Add the failing test**

Append to `tests/unit/settings.test.ts` (a test that feeds a corrupt shape
through `normalize` via the store — match the file's existing setup for
constructing a `SettingsStore`; if it writes a temp file, write the corrupt
JSON there first). Minimal shape-level test:

```ts
it('coerces a corrupt order back to defaults instead of throwing', () => {
  // simulate a hand-mangled settings.json where order is not an array
  const raw = { ...DEFAULT_SETTINGS, order: 'oops' } as unknown as Settings;
  expect(() => normalizeForTest(raw)).not.toThrow();
  expect(normalizeForTest(raw).order).toEqual(DEFAULT_SETTINGS.order);
});
```

Export `normalize` for the test by renaming it to an exported
`normalizeForTest` alias — add at the bottom of `settings.ts`:
`export { normalize as normalizeForTest };` and import it in the test:
`import { normalizeForTest } from '../../src/main/settings';` alongside the
existing imports (`DEFAULT_SETTINGS`, `Settings`).

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/unit/settings.test.ts`
Expected: FAIL — `raw.order.filter` throws on a string.

- [ ] **Step 3: Implement per-field coercion**

In `src/main/settings.ts`, replace `normalize` (`settings.ts:9-30`):

```ts
function normalize(raw: Settings): Settings {
  const ids = SERVICES.map((s) => s.id);
  const known = new Set<ServiceId>(ids);
  const fill = (
    rec: unknown,
    defaults: Record<ServiceId, boolean>,
  ): Record<ServiceId, boolean> => {
    const r = (
      rec && typeof rec === 'object' ? rec : {}
    ) as Partial<Record<ServiceId, boolean>>;
    return Object.fromEntries(ids.map((id) => [id, r[id] ?? defaults[id]])) as Record<
      ServiceId,
      boolean
    >;
  };
  const order = Array.isArray(raw.order) ? raw.order : DEFAULT_SETTINGS.order;
  return {
    ...raw,
    order: [
      ...order.filter((id) => known.has(id)),
      ...ids.filter((id) => !order.includes(id)),
    ],
    muted: fill(raw.muted, DEFAULT_SETTINGS.muted),
    disabled: fill(raw.disabled, DEFAULT_SETTINGS.disabled),
    neverHibernate: fill(raw.neverHibernate, DEFAULT_SETTINGS.neverHibernate),
  };
}

export { normalize as normalizeForTest };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/unit/settings.test.ts`
Expected: PASS.

- [ ] **Step 5: Verify**

Run: `pnpm lint && pnpm typecheck && pnpm test`
Expected: PASS.

---

### Task 9: Return the shell IPC unsubscribe

**Files:**

- Modify: `src/renderer/src/store.ts:14-19`

**Interfaces:**

- Consumes: `window.goetia.onState` returns an unsubscribe (`shell.ts:11`).
- Produces: `connectShell(): () => void`.

- [ ] **Step 1: Return the unsubscribe from `connectShell`**

In `src/renderer/src/store.ts`, replace `connectShell` (`store.ts:14-19`):

```ts
export function connectShell(): () => void {
  return window.goetia.onState((s) => {
    document.documentElement.dataset.theme = s.theme;
    useShell.getState().setState(s);
  });
}
```

- [ ] **Step 2: Confirm the effect wiring is unchanged**

`src/renderer/src/App.tsx:13` already reads
`useEffect(() => connectShell(), [])`. Because `connectShell` now returns the
unsubscribe, that arrow returns it too, so React registers it as the effect
cleanup automatically — no edit to `App.tsx` is required. Verify the file
still contains exactly that line and nothing else needs touching.

- [ ] **Step 3: Verify**

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm e2e`
Expected: PASS. Manual (dev): reload the shell twice; the `shell:state`
handler runs once per broadcast, not twice.

---

### Task 10: Guard the deferred `trustedClick` visibility toggle

**Files:**

- Modify: `src/main/views.ts:103-117` (`trustedClick`), `destroy()` at
  `views.ts:159-166`

**Interfaces:**

- Produces: the 300 ms `setVisible(false)` never runs against a destroyed
  view; `destroy()` cancels any pending toggle.

- [ ] **Step 1: Track and guard the deferred toggle**

In `src/main/views.ts`, add a field near `activeId`:

```ts
  private clickHideTimers = new Map<ServiceId, ReturnType<typeof setTimeout>>();
```

Replace the tail of `trustedClick` (`views.ts:116`):

```ts
    if (hidden) {
      const prev = this.clickHideTimers.get(id);
      if (prev !== undefined) clearTimeout(prev);
      this.clickHideTimers.set(
        id,
        setTimeout(() => {
          this.clickHideTimers.delete(id);
          if (!view.webContents.isDestroyed()) view.setVisible(false);
        }, 300),
      );
    }
```

- [ ] **Step 2: Cancel the timer in `destroy()`**

In `destroy()` (`views.ts:159`), after the null check:

```ts
  destroy(id: ServiceId): void {
    const view = this.views.get(id);
    if (!view) return;
    const t = this.clickHideTimers.get(id);
    if (t !== undefined) {
      clearTimeout(t);
      this.clickHideTimers.delete(id);
    }
    this.win.contentView.removeChildView(view);
    view.webContents.close();
    this.views.delete(id);
    if (this.activeId === id) this.activeId = null;
  }
```

- [ ] **Step 3: Verify**

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm e2e`
Expected: PASS. Manual: with a keep-alive-clicking service (Shopee/Zalo)
hidden, disable it in Settings within the click window — no
`Object has been destroyed` in the console.

---

### Task 11: Time out a hung recipe tick

**Files:**

- Modify: `src/preload/recipes/runner.ts`
- Modify: `tests/unit/runner-stale.test.ts`

**Interfaces:**

- Produces: a `count()` that never settles no longer wedges `busy`; the tick
  clears `busy` and reports stale after `COUNT_TIMEOUT_MS`.

- [ ] **Step 1: Add the failing test**

Append to `tests/unit/runner-stale.test.ts`:

```ts
it('recovers from a hung count() via timeout', async () => {
  const ticks: (() => void)[] = [];
  const recipe: Recipe = {
    id: 'whatsapp',
    intervalMs: 2000,
    count: () => new Promise(() => {}), // never settles
  };
  const reportStale = vi.fn();
  const setIntervalFn = ((fn: () => void) => {
    ticks.push(fn);
    return 1 as unknown as ReturnType<typeof setInterval>;
  }) as typeof setInterval;
  startRecipe(
    recipe,
    {} as Document,
    vi.fn(),
    reportStale,
    undefined,
    undefined,
    setIntervalFn,
  );
  await ticks[0]();
  // second tick must run (busy was released by the timeout), and report stale
  await ticks[0]();
  expect(reportStale).toHaveBeenCalled();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/unit/runner-stale.test.ts`
Expected: FAIL — the second tick early-returns on `busy`, `reportStale`
never fires.

- [ ] **Step 3: Implement the timeout race**

In `src/preload/recipes/runner.ts`, add the constant near the top:

```ts
export const COUNT_TIMEOUT_MS = 8_000;
```

Replace `const counts = await recipe.count(doc);` with a race:

```ts
      const counts = await Promise.race([
        recipe.count(doc),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('count timeout')), COUNT_TIMEOUT_MS),
        ),
      ]);
```

The existing `catch` now handles the timeout (reports stale via Task 4's
dedup), and `finally { busy = false }` releases the guard.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/unit/runner-stale.test.ts`
Expected: PASS.

> **Note:** this test uses real timers; keep `COUNT_TIMEOUT_MS` overridable
> if the test proves slow — inject it the same way `setIntervalFn`/`nowFn`
> are injected. If you add the parameter, thread it through
> `src/preload/service.ts`'s `startRecipe` call with its default.

- [ ] **Step 5: Verify**

Run: `pnpm lint && pnpm typecheck && pnpm test`
Expected: PASS.

---

### Task 12: Consolidate the badge label; remove dead export

**Files:**

- Modify: `src/shared/badges.ts:19-21`
- Modify: `src/renderer/src/components/ServiceTile.tsx` (use shared label)
- Modify: `src/main/tray.ts:10-12` (remove `isQuitting`)
- Modify: `tests/unit/badges.test.ts`

**Interfaces:**

- Produces: one `badgeLabel(count)` with a single `99+` threshold used by the
  rail tile, quick switcher, and taskbar overlay.

- [ ] **Step 1: Update the badge-label test to the unified threshold**

In `tests/unit/badges.test.ts`, set the expectation for `badgeLabel`:

```ts
it('caps the badge label at 99+', () => {
  expect(badgeLabel(5)).toBe('5');
  expect(badgeLabel(99)).toBe('99');
  expect(badgeLabel(100)).toBe('99+');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/unit/badges.test.ts`
Expected: FAIL — current `badgeLabel` caps at `9+`.

- [ ] **Step 3: Raise the shared threshold**

In `src/shared/badges.ts`, replace `badgeLabel` (`badges.ts:19-21`):

```ts
export function badgeLabel(count: number): string {
  return count > 99 ? '99+' : String(count);
}
```

- [ ] **Step 4: Point `ServiceTile` at the shared label**

In `src/renderer/src/components/ServiceTile.tsx`, delete the local
`badgeText` (`ServiceTile.tsx:20-22`) and import + use `badgeLabel` from
`../../../shared/badges`, replacing every `badgeText(...)` call site with
`badgeLabel(...)`.

- [ ] **Step 5: Remove the dead `isQuitting` export**

In `src/main/tray.ts`, delete the export (`tray.ts:10-12`):

```ts
export function isQuitting(): boolean {
  return quitting;
}
```

Keep the module-local `let quitting = false;` — it is still used internally.

- [ ] **Step 6: Verify**

Run: `pnpm lint && pnpm typecheck && pnpm test`
Expected: PASS. `pnpm typecheck` confirms nothing imported `isQuitting`.

---

## Self-review notes

- Spec §2.2 coverage: close-to-tray→T1, crash cap→T2, ready poll→T3, stale
  storm→T4+T5, resize→T6, Messenger sweep→T7, settings normalize→T8,
  connectShell→T9, trustedClick→T10, runner wedge→T11, badge label + dead
  export→T12. The two "Accept" items (async overlay show, neverHibernate
  defaults) are intentionally not tasks.
- Type/name consistency: `DWELL_MS`/`MAX_AUTO_RELOADS` (T2),
  `READY_POLL_MAX_ATTEMPTS` (T3), `stale` flag (T4) reused by the timeout
  path (T11), `isNoOp` (T5), `scheduleLayout`/`layoutScheduled` (T6),
  `clickHideTimers` (T10), `COUNT_TIMEOUT_MS` (T11), `badgeLabel` (T12) are
  each defined once and referenced consistently.
- T4 must land before T11 (the timeout path relies on the stale dedup);
  execute in listed order. T7 is behaviour-preserving — the fixture count of
  3 is the guard.
