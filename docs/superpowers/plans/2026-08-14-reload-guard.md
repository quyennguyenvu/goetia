# Reload Guard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Drop user-initiated reloads that would interrupt a wake already in flight, and remove the per-service reload button from Settings ▸ Services.

**Architecture:** A pure predicate in `src/main/lib/reload-guard.ts` decides whether a reload is allowed, given the service's `waking` flag and the timestamp of its last accepted reload. `ServiceViewManager.refresh` — the single choke point every user reload path reaches — consults it and returns early when the answer is no. `views.reload` (crash auto-recovery) is deliberately left unguarded.

**Tech Stack:** TypeScript, Electron (main process), React (renderer), vitest, biome, Playwright.

Spec: `docs/superpowers/specs/2026-08-14-reload-guard-design.md`.

## Global Constraints

- Pure decision logic goes in a `lib/` helper with a vitest unit test; `views.ts` and `index.ts` stay thin wiring. Do not put the timing rules inline in `views.ts`.
- `RELOAD_MIN_INTERVAL_MS` is `1_000`.
- The guard applies to `ServiceViewManager.refresh` only. `ServiceViewManager.reload` (used by `ResilienceManager` for crash recovery) must stay unguarded — it has its own backoff and five-reload cap.
- A dropped reload produces no toast, dialog, sound, or log line. The loading overlay already reads "Waking X…" for the whole blocked interval.
- The `service:reload` IPC channel and its entry in `SHELL_ONLY_CHANNELS` (`src/shared/ipc.ts`) stay — the crashed-view Retry button is still a sender.
- Markdown edits must pass `npx markdownlint-cli2 <file>`; prose is never hard-wrapped (MD013 is off — one line per paragraph or bullet, however long).
- Definition of done for the whole plan: `corepack pnpm lint`, `corepack pnpm typecheck`, `corepack pnpm test` green, plus `corepack pnpm e2e` because main and renderer wiring both change.
- **Never run `git commit`.** Where this plan says "Checkpoint", stop and ask the user to run `/grimoire-core:commit`. Do not write `GRIMOIRE_COMMIT_MSG.txt`.

## File Structure

| File | Responsibility |
| --- | --- |
| `src/main/lib/reload-guard.ts` | **Create.** The pure predicate + the interval constant. No imports. |
| `tests/unit/reload-guard.test.ts` | **Create.** Four cases against the predicate. |
| `src/main/views.ts` | **Modify.** New `waking` constructor callback, `lastRefreshAt` map, guard in `refresh`, cleanup in `destroy`. |
| `src/main/index.ts` | **Modify.** Supply the `waking` callback at the single `new ServiceViewManager(...)` site. |
| `src/renderer/src/components/SettingsView.tsx` | **Modify.** Delete the per-service reload button. |
| `CLAUDE.md` | **Modify.** Record the guard; drop Settings from the `service:reload` sender list. |

---

### Task 1: The reload guard

**Files:**

- Create: `src/main/lib/reload-guard.ts`
- Test: `tests/unit/reload-guard.test.ts`
- Modify: `src/main/views.ts` (constructor ~26-37, `destroy` ~221-233, `refresh` ~243-248)
- Modify: `src/main/index.ts` (the `new ServiceViewManager(...)` call at ~75-101)
- Modify: `CLAUDE.md` (line 12, the "User-initiated reload" bullet)

**Interfaces:**

- Consumes: `MainState.runtime(id).waking` (`src/main/state.ts`), `ServiceId` (`src/shared/types.ts`).
- Produces: `reloadAllowed({ waking, lastReloadAt, now }): boolean` and `RELOAD_MIN_INTERVAL_MS: number`, both exported from `src/main/lib/reload-guard.ts`. `ServiceViewManager`'s constructor gains a fifth positional parameter `waking: (id: ServiceId) => boolean`, placed **before** the existing optional `overlay` parameter.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/reload-guard.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { RELOAD_MIN_INTERVAL_MS, reloadAllowed } from '../../src/main/lib/reload-guard';

describe('reloadAllowed', () => {
  it('allows the first reload of a settled service', () => {
    expect(reloadAllowed({ waking: false, lastReloadAt: undefined, now: 1_000 })).toBe(true);
  });

  it('drops a reload while the service is still waking', () => {
    // the spam case: ⌘R mid-wake would discard the load it is waiting on
    expect(reloadAllowed({ waking: true, lastReloadAt: undefined, now: 1_000 })).toBe(false);
  });

  it('drops a reload inside the floor, before waking has had time to turn true', () => {
    // did-start-navigation round-trips asynchronously; held F5 repeats faster
    expect(
      reloadAllowed({ waking: false, lastReloadAt: 1_000, now: 1_000 + RELOAD_MIN_INTERVAL_MS - 1 }),
    ).toBe(false);
  });

  it('allows a reload once the floor has passed', () => {
    expect(
      reloadAllowed({ waking: false, lastReloadAt: 1_000, now: 1_000 + RELOAD_MIN_INTERVAL_MS }),
    ).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `corepack pnpm vitest run tests/unit/reload-guard.test.ts`

Expected: FAIL — `Failed to resolve import "../../src/main/lib/reload-guard"`.

- [ ] **Step 3: Write the helper**

Create `src/main/lib/reload-guard.ts`:

```ts
export const RELOAD_MIN_INTERVAL_MS = 1_000;

/** A user reload is dropped while the service is still waking, and while the
 *  previous one is younger than the floor — held-down F5 auto-repeats faster
 *  than `waking` can round-trip back from did-start-navigation. */
export function reloadAllowed(o: {
  waking: boolean;
  lastReloadAt: number | undefined;
  now: number;
}): boolean {
  if (o.waking) return false;
  return o.lastReloadAt === undefined || o.now - o.lastReloadAt >= RELOAD_MIN_INTERVAL_MS;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `corepack pnpm vitest run tests/unit/reload-guard.test.ts`

Expected: PASS — 4 passed.

- [ ] **Step 5: Add the import and the constructor callback in `views.ts`**

Add to the import block at the top of `src/main/views.ts`, keeping biome's alphabetical order among the `./lib/` imports (after `./lib/permission-policy`):

```ts
import { reloadAllowed } from './lib/reload-guard';
```

Then add the fifth constructor parameter, **before** `overlay`:

```ts
  constructor(
    private win: BrowserWindow,
    private hooks: ViewHooks,
    private railPosition: () => RailPosition,
    private audioMuted: (id: ServiceId) => boolean,
    private waking: (id: ServiceId) => boolean,
    private overlay?: {
      setBounds(b: { x: number; y: number; width: number; height: number }): void;
      raise(): void;
    },
  ) {
    win.on('resize', () => this.scheduleLayout());
  }
```

- [ ] **Step 6: Add the timestamp map**

In the field block near the top of the class in `src/main/views.ts`, alongside `clickHideTimers`:

```ts
  private clickHideTimers = new Map<ServiceId, ReturnType<typeof setTimeout>>();
  private lastRefreshAt = new Map<ServiceId, number>();
```

- [ ] **Step 7: Guard `refresh`**

Replace the body of `refresh` in `src/main/views.ts`. The existing doc comment stays; append the guard sentence to it:

```ts
  /** User-initiated reload: return a live service to its chat URL — Goetia
   *  is chat-only, and reload is the way back when a site's own links have
   *  wandered off chat. Re-shows the active view if a failed load hid it.
   *  Dropped while the service is waking, or inside RELOAD_MIN_INTERVAL_MS,
   *  so a spammed ⌘R cannot keep restarting the load it is waiting on.
   *  (Crash auto-reload stays on the current URL — see ResilienceManager.) */
  refresh(id: ServiceId): void {
    const view = this.views.get(id);
    if (!view) return; // hibernated/never-created: nothing to reload
    const now = Date.now();
    if (!reloadAllowed({ waking: this.waking(id), lastReloadAt: this.lastRefreshAt.get(id), now })) {
      return;
    }
    this.lastRefreshAt.set(id, now);
    if (this.activeId === id) this.activate(id);
    view.webContents.loadURL(serviceById(id).url);
  }
```

- [ ] **Step 8: Clear the stamp in `destroy`**

In `destroy(id)` in `src/main/views.ts`, next to the existing `clickHideTimers` cleanup, so a view rebuilt after hibernation is not held off by a stamp from its previous life:

```ts
    this.win.contentView.removeChildView(view);
    this.lastRefreshAt.delete(id);
    view.webContents.close();
```

- [ ] **Step 9: Supply the callback in `index.ts`**

In `src/main/index.ts`, the `new ServiceViewManager(...)` call ends with the `audioMuted` arrow and then `overlay`. Insert the waking callback between them:

```ts
      (id) => {
        const s = settings.get();
        return audioMuted({ serviceMuted: s.muted[id], globalMuted: s.globalMuted });
      },
      (id) => state.runtime(id).waking,
      overlay,
    );
```

- [ ] **Step 10: Typecheck and run the full unit suite**

Run: `corepack pnpm typecheck && corepack pnpm test`

Expected: typecheck silent (no output, exit 0); vitest reports all files passed, including the new `reload-guard.test.ts`. If typecheck complains about the `ServiceViewManager` argument count, the callback in Step 9 landed in the wrong position — it goes fifth, before `overlay`.

- [ ] **Step 11: Update `CLAUDE.md`**

In `CLAUDE.md`, replace the "User-initiated reload" bullet (line 12) with the text below. It is one unwrapped line — do not hard-wrap it.

```markdown
- User-initiated reload returns the view to `SERVICES[].url` via `views.refresh` — **reload is the only way back** when a site's own links wander off chat, so don't weaken it. Reachable while a service page covers the window from `Go ▸ Reload Service` (⌘/Ctrl+R) and F5 (handled on both the shell and inside the view); the `service:reload` channel additionally backs the crashed-view placeholder, which needs a shell surface on screen. A user reload is dropped while the service is waking and inside `RELOAD_MIN_INTERVAL_MS` (`lib/reload-guard.ts`), so a spammed ⌘R or held F5 cannot keep restarting the load it is waiting on; the block is bounded because the wake self-expires at `WAKE_TIMEOUT_MS` and a crash ends the wake before the Retry placeholder renders. A history-back affordance was built and rejected instead (2026-08-13 — see `docs/superpowers/specs/2026-08-13-service-back-affordance-design.md`): back is browser chrome, and reload already lands on the chat URL. Crash auto-reload (`ResilienceManager`) keeps reloading the current URL via `views.reload`, which stays unguarded.
```

- [ ] **Step 12: Lint the markdown and the code**

Run: `npx markdownlint-cli2 CLAUDE.md && corepack pnpm lint`

Expected: markdownlint "Summary: 0 issues in 0 files"; biome reports "Checked N files ... No fixes applied" with no errors.

- [ ] **Step 13: Checkpoint**

Do not commit. Stop and tell the user Task 1 is complete and verified, and ask them to run `/grimoire-core:commit`. Suggested subject: `feat(reload): drop user reloads during a wake`.

---

### Task 2: Remove the Settings reload button

**Files:**

- Modify: `src/renderer/src/components/SettingsView.tsx:328-336`

**Interfaces:**

- Consumes: nothing from Task 1. This task is independent and can be reviewed on its own.
- Produces: nothing. After this change the only `service:reload` sender in the renderer is `ContentPlaceholder.tsx`'s Retry button.

- [ ] **Step 1: Delete the button**

In `src/renderer/src/components/SettingsView.tsx`, inside the Services pane's per-service row, delete this element in full. The `<label>` for `never hibernate` immediately above it and the closing `</span>` immediately below it both stay.

```tsx
                        <button
                          type="button"
                          className="rounded-ctl border border-border px-2 py-0.5 hover:bg-bg-2"
                          onClick={() =>
                            window.goetia.send('service:reload', { serviceId: svc.id })
                          }
                        >
                          reload
                        </button>
```

Leave `src/shared/ipc.ts` alone — `service:reload` is still sent by the crashed-view Retry.

- [ ] **Step 2: Verify the row still compiles and nothing else referenced the button**

Run: `corepack pnpm typecheck && grep -rn "service:reload" src/`

Expected: typecheck silent. The grep returns exactly four lines — `ContentPlaceholder.tsx` (the Retry sender), and three in `src/shared/ipc.ts` (the payload type and two channel-list entries). No hit in `SettingsView.tsx`.

- [ ] **Step 3: Lint and run the unit suite**

Run: `corepack pnpm lint && corepack pnpm test`

Expected: biome clean; vitest all passed. No unit test targets the removed button, so nothing should need updating — if a test fails here, it is a real regression, not a fixture to edit.

- [ ] **Step 4: Run the e2e suite**

Run: `env -u ELECTRON_RUN_AS_NODE corepack pnpm e2e`

Expected: all specs pass. `ELECTRON_RUN_AS_NODE` must be unset — VS Code's integrated shell exports it and Electron then refuses to open a window. No e2e spec opens the Services pane, so this is a regression check across both tasks' wiring rather than a test of the removal.

- [ ] **Step 5: Drive the built app**

Run: `corepack pnpm dev`, then confirm by hand:

1. Open Settings ▸ Services — each enabled row shows `mute` and `never hibernate`, and no `reload` button.
2. Switch to a service and hold F5 down for several seconds. The "Waking X…" overlay appears once and the page loads through; it must not flicker or restart with each repeat.
3. Wait for the service to settle, press ⌘R once — it reloads to the chat URL. Press ⌘R twice in quick succession — the second press is swallowed.

- [ ] **Step 6: Checkpoint**

Do not commit. Stop, report the verification results (including what the hand-check in Step 5 actually showed), and ask the user to run `/grimoire-core:commit`. Suggested subject: `refactor(settings): drop per-service reload button`.
