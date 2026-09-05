# Wake Captions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The waking cover names the kind of load it covers (Waking / Reloading / Restarting / Signing out of / Signing in to), and the shell placeholder behind ⌘K and Settings stops calling a live service "waking".

**Architecture:** A `LoadKind` rides the existing `MainLoads` mark from `views.load` to `WakingTracker.begin`, which records it on `ServiceRuntime.wakeKind` beside the untouched `waking` boolean. One pure helper in `src/shared/wake-caption.ts` turns `(kind, serviceName)` into the caption; main uses it for the overlay's `loading:state` and the shell renderer uses it in `ContentPlaceholder`, which switches from `runtime.loading` to `runtime.waking`. Spec: `docs/superpowers/specs/2026-09-05-wake-captions-design.md`.

**Tech Stack:** Electron main (TypeScript), React shell renderer, vitest unit tests, Playwright e2e, Biome lint.

## Global Constraints

- Captions, verbatim from the spec: `wake` → `Waking {service}…`, `reload` → `Reloading {service}…`, `restart` → `Restarting {service}…`, `purge` → `Signing out of {service}…`, `hand-back` → `Signing in to {service}…`. The ellipsis is the single character `…` (U+2026), as today.
- `null` kind renders the `wake` caption; the cover never renders an empty caption.
- `src/shared/**` stays process-agnostic: no `electron`, no DOM imports.
- The boolean `runtime.waking`, `endsWake`, the reload guard, the tile breathe, and `MainLoads` one-mark-per-view semantics do not change.
- **Commits:** this repo forbids agents committing. Where a step says "Commit", stop and ask the user to run `/grimoire-core:commit`; never run `git commit` yourself.
- Definition of done: `corepack pnpm lint`, `corepack pnpm typecheck`, `corepack pnpm test` green, and `env -u ELECTRON_RUN_AS_NODE corepack pnpm e2e` green for the wiring task.

---

### Task 1: `LoadKind` type and the `wakeCaption` helper

**Files:**

- Modify: `src/shared/types.ts:264-267` (the `ServiceRuntime` interface; add `LoadKind` above it and `wakeKind` inside it)
- Create: `src/shared/wake-caption.ts`
- Test: `tests/unit/wake-caption.test.ts`

**Interfaces:**

- Consumes: nothing new.
- Produces: `export type LoadKind = 'wake' | 'reload' | 'restart' | 'purge' | 'hand-back'` and `ServiceRuntime.wakeKind: LoadKind | null` in `src/shared/types.ts`; `export function wakeCaption(kind: LoadKind | null, serviceName: string): string` in `src/shared/wake-caption.ts`.

- [x] **Step 1: Write the failing test**

```ts
// tests/unit/wake-caption.test.ts
import { describe, expect, it } from 'vitest';
import { wakeCaption } from '../../src/shared/wake-caption';

// the one place the cover's words live; every load kind has its own line,
// and a missing kind reads as a wake so the cover never renders empty
describe('wakeCaption', () => {
  it.each([
    ['wake', 'Waking Discord…'],
    ['reload', 'Reloading Discord…'],
    ['restart', 'Restarting Discord…'],
    ['purge', 'Signing out of Discord…'],
    ['hand-back', 'Signing in to Discord…'],
  ] as const)('%s', (kind, expected) => {
    expect(wakeCaption(kind, 'Discord')).toBe(expected);
  });

  it('null falls back to the wake caption', () => {
    expect(wakeCaption(null, 'Discord')).toBe('Waking Discord…');
  });
});
```

- [x] **Step 2: Run the test to verify it fails**

Run: `corepack pnpm vitest run tests/unit/wake-caption.test.ts`
Expected: FAIL, "Failed to resolve import ../../src/shared/wake-caption".

- [x] **Step 3: Add `LoadKind` and `wakeKind` to the shared types**

In `src/shared/types.ts`, replace the `ServiceRuntime` interface:

```ts
export interface ServiceRuntime {
  unread: Counts;
  hibernated: boolean;
  crashed: boolean;
  stale: boolean; // recipe failed; counts may be outdated
  loading: boolean;
  waking: boolean; // loading screen covers this service
}
```

with:

```ts
/** Why main asked a view to load; names the waking cover's caption. */
export type LoadKind = 'wake' | 'reload' | 'restart' | 'purge' | 'hand-back';

export interface ServiceRuntime {
  unread: Counts;
  hibernated: boolean;
  crashed: boolean;
  stale: boolean; // recipe failed; counts may be outdated
  loading: boolean;
  waking: boolean; // loading screen covers this service
  wakeKind: LoadKind | null; // which load the cover names; read only while waking
}
```

- [x] **Step 4: Write the helper**

```ts
// src/shared/wake-caption.ts
import type { LoadKind } from './types';

/** The cover's words, in one place. `null` (a begin() that forgot its
 *  kind) reads as a wake so the cover never renders empty. */
export function wakeCaption(kind: LoadKind | null, serviceName: string): string {
  switch (kind) {
    case 'reload':
      return `Reloading ${serviceName}…`;
    case 'restart':
      return `Restarting ${serviceName}…`;
    case 'purge':
      return `Signing out of ${serviceName}…`;
    case 'hand-back':
      return `Signing in to ${serviceName}…`;
    default:
      return `Waking ${serviceName}…`;
  }
}
```

- [x] **Step 5: Run the test to verify it passes**

Run: `corepack pnpm vitest run tests/unit/wake-caption.test.ts`
Expected: PASS, 6 tests.

`corepack pnpm typecheck` will fail now because `defaultRuntime` in `src/main/state.ts` and the runtime patch in `src/main/ipc-handlers.ts` lack `wakeKind`. Task 2 fixes that; do not commit between the two.

### Task 2: Default runtime carries `wakeKind: null`

**Files:**

- Modify: `src/main/state.ts:11-18` (`defaultRuntime`)
- Modify: `src/main/ipc-handlers.ts:174-181` (the banish reset patch)
- Test: `tests/unit/state.test.ts:21-24`

**Interfaces:**

- Consumes: `ServiceRuntime.wakeKind` from Task 1.
- Produces: `MainState.runtime(id).wakeKind === null` for a fresh runtime.

- [x] **Step 1: Extend the existing state test**

In `tests/unit/state.test.ts`, replace:

```ts
  it('new runtimes start not waking', () => {
    const s = new MainState();
    expect(s.runtime('messenger').waking).toBe(false);
  });
```

with:

```ts
  it('new runtimes start not waking, with no load kind', () => {
    const s = new MainState();
    expect(s.runtime('messenger').waking).toBe(false);
    expect(s.runtime('messenger').wakeKind).toBeNull();
  });
```

- [x] **Step 2: Run the test to verify it fails**

Run: `corepack pnpm vitest run tests/unit/state.test.ts`
Expected: FAIL, "expected undefined to be null".

- [x] **Step 3: Add the default**

In `src/main/state.ts`, replace:

```ts
const defaultRuntime = (): ServiceRuntime => ({
  unread: { direct: 0, indirect: 0 },
  hibernated: false,
  crashed: false,
  stale: false,
  loading: false,
  waking: false,
});
```

with:

```ts
const defaultRuntime = (): ServiceRuntime => ({
  unread: { direct: 0, indirect: 0 },
  hibernated: false,
  crashed: false,
  stale: false,
  loading: false,
  waking: false,
  wakeKind: null,
});
```

- [x] **Step 4: Reset the kind on banish too**

In `src/main/ipc-handlers.ts`, inside `applyDisabledChange`, replace:

```ts
      ctx.state.setRuntime(id, {
        unread: { direct: 0, indirect: 0 },
        crashed: false,
        stale: false,
        hibernated: false,
        loading: false,
        waking: false,
      });
```

with:

```ts
      ctx.state.setRuntime(id, {
        unread: { direct: 0, indirect: 0 },
        crashed: false,
        stale: false,
        hibernated: false,
        loading: false,
        waking: false,
        wakeKind: null,
      });
```

- [x] **Step 5: Run the test and the typecheck**

Run: `corepack pnpm vitest run tests/unit/state.test.ts && corepack pnpm typecheck`
Expected: PASS, and `tsc` exits 0.

- [x] **Step 6: Commit**

Ask the user to run `/grimoire-core:commit` for Tasks 1 and 2 together. Suggested message: `feat(waking): add LoadKind and the wakeCaption helper`.

### Task 3: `MainLoads` carries the kind

**Files:**

- Modify: `src/main/lib/main-loads.ts`
- Test: `tests/unit/main-loads.test.ts`

**Interfaces:**

- Consumes: `LoadKind` from Task 1.
- Produces: `MainLoads.mark(id: ServiceId, kind: LoadKind): void`, `MainLoads.claim(id: ServiceId): LoadKind | null`, `MainLoads.forget(id: ServiceId): void`.

- [x] **Step 1: Rewrite the test for the new signatures**

Replace the whole of `tests/unit/main-loads.test.ts` with:

```ts
import { describe, expect, it } from 'vitest';
import { MainLoads } from '../../src/main/lib/main-loads';

// the waking cover is for loads main asked for (cold start, reload, a dead
// view's banner open); a navigation the page made on its own — the in-page
// route's fallback load, a site's own full-page thread switch — is not one.
// The mark carries WHICH load, so the cover can name it.
describe('MainLoads', () => {
  it('a marked load is claimed by the first navigation, once, with its kind', () => {
    const loads = new MainLoads();
    loads.mark('messenger', 'reload');
    expect(loads.claim('messenger')).toBe('reload');
    expect(loads.claim('messenger')).toBeNull();
  });

  it('a navigation nobody asked for claims nothing', () => {
    expect(new MainLoads().claim('messenger')).toBeNull();
  });

  it('marks are per service', () => {
    const loads = new MainLoads();
    loads.mark('discord', 'wake');
    expect(loads.claim('messenger')).toBeNull();
    expect(loads.claim('discord')).toBe('wake');
  });

  // the later load is the one the navigation belongs to
  it('a second mark before the navigation replaces the kind', () => {
    const loads = new MainLoads();
    loads.mark('messenger', 'wake');
    loads.mark('messenger', 'purge');
    expect(loads.claim('messenger')).toBe('purge');
  });

  // a destroyed view's pending mark must not cover its successor's first
  // page-initiated navigation
  it('forget drops a pending mark', () => {
    const loads = new MainLoads();
    loads.mark('messenger', 'wake');
    loads.forget('messenger');
    expect(loads.claim('messenger')).toBeNull();
  });
});
```

- [x] **Step 2: Run the test to verify it fails**

Run: `corepack pnpm vitest run tests/unit/main-loads.test.ts`
Expected: FAIL, "expected true to be 'reload'" (and similar) on four tests.

- [x] **Step 3: Carry the kind on the mark**

Replace the whole of `src/main/lib/main-loads.ts` with:

```ts
import type { LoadKind, ServiceId } from '../../shared/types';

/** Which views have a load pending that main itself asked for — create, a
 *  hibernation wake, reload, refresh, a dead view's banner open, a contained
 *  window's hand-back — and which kind, so the waking cover can name it. The
 *  cover is for exactly those: the view has nothing (or nothing current) to
 *  show. A cross-document navigation the page made on its own — the in-page
 *  route's fallback load, a site's own full-page thread switch, a login
 *  redirect — is a plain navigation over a live document, and covering it
 *  made a 1-2s reboot look like a cold start (Messenger, reported 2026-09-04
 *  and again 2026-09-05). One mark per view, claimed by the first main-frame
 *  navigation after it; a second mark replaces the first, since the later
 *  load is the one that navigation belongs to. */
export class MainLoads {
  private pending = new Map<ServiceId, LoadKind>();

  mark(id: ServiceId, kind: LoadKind): void {
    this.pending.set(id, kind);
  }

  /** The kind of the load main requested, once per mark; null for a
   *  navigation nobody asked for. */
  claim(id: ServiceId): LoadKind | null {
    const kind = this.pending.get(id) ?? null;
    this.pending.delete(id);
    return kind;
  }

  forget(id: ServiceId): void {
    this.pending.delete(id);
  }
}
```

- [x] **Step 4: Run the test to verify it passes**

Run: `corepack pnpm vitest run tests/unit/main-loads.test.ts`
Expected: PASS, 5 tests. `corepack pnpm typecheck` now fails in `src/main/views.ts` (`mark` needs a kind, `onNavigate` receives a `LoadKind | null`); Task 5 fixes that. Do not commit yet.

### Task 4: `WakingTracker.begin` records the kind

**Files:**

- Modify: `src/main/waking.ts:17-26`
- Test: `tests/unit/waking.test.ts`

**Interfaces:**

- Consumes: `LoadKind`, `ServiceRuntime.wakeKind` from Task 1.
- Produces: `WakingTracker.begin(id: ServiceId, kind: LoadKind): void`; `end` unchanged.

- [x] **Step 1: Update the tests**

In `tests/unit/waking.test.ts`, every `w.begin('messenger')` becomes `w.begin('messenger', 'wake')` (four call sites), and append two tests inside the `describe` block:

```ts
  it('begin records the load kind; end clears waking and leaves the kind', () => {
    const state = new MainState();
    const w = new WakingTracker(state);
    w.begin('messenger', 'reload');
    expect(state.runtime('messenger')).toMatchObject({ waking: true, wakeKind: 'reload' });
    w.end('messenger', 'recipe-ready');
    expect(state.runtime('messenger')).toMatchObject({ waking: false, wakeKind: 'reload' });
  });

  // a ⌘R on a service still covered by its cold-start wake: the cover now
  // names the reload the user is waiting on
  it('a re-armed wake with a different kind updates the kind', () => {
    const state = new MainState();
    const w = new WakingTracker(state);
    w.begin('messenger', 'wake');
    w.begin('messenger', 'reload');
    expect(state.runtime('messenger').wakeKind).toBe('reload');
  });
```

- [x] **Step 2: Run the test to verify it fails**

Run: `corepack pnpm vitest run tests/unit/waking.test.ts`
Expected: FAIL, the two new tests: `wakeKind` is `null`.

- [x] **Step 3: Record the kind**

In `src/main/waking.ts`, replace:

```ts
import { serviceById } from '../shared/services';
import type { ServiceId } from '../shared/types';
```

with:

```ts
import { serviceById } from '../shared/services';
import type { LoadKind, ServiceId } from '../shared/types';
```

and replace the `begin` method:

```ts
  begin(id: ServiceId): void {
    clearTimeout(this.timers.get(id));
    this.timers.set(
      id,
      setTimeout(() => this.end(id, 'timeout'), this.timeoutMs),
    );
    if (!this.state.runtime(id).waking) {
      this.state.setRuntime(id, { waking: true });
    }
  }
```

with:

```ts
  /** `kind` names the load for the cover's caption; setRuntime already
   *  skips a patch that changes nothing. */
  begin(id: ServiceId, kind: LoadKind): void {
    clearTimeout(this.timers.get(id));
    this.timers.set(
      id,
      setTimeout(() => this.end(id, 'timeout'), this.timeoutMs),
    );
    this.state.setRuntime(id, { waking: true, wakeKind: kind });
  }
```

Update the class doc comment's first line from `begins on every load start` to `begins on every load main asked for`.

- [x] **Step 4: Run the test to verify it passes**

Run: `corepack pnpm vitest run tests/unit/waking.test.ts`
Expected: PASS, 6 tests. The "recipe-ready reveals immediately and disarms the timer" test still passes: `setRuntime` dedupes, so the broadcast count is unchanged.

### Task 5: Wire the kind through `views.ts`, `index.ts`, and the overlay

**Files:**

- Modify: `src/main/views.ts:21` (import), `:76-82` (`ViewHooks.onNavigate`), `:426` (`did-start-navigation`), `:435` (`create`), `:503` (`handBack`), `:905-949` (`load`, `reload`, `refresh`, `loadServiceUrl`, `openConversation`)
- Modify: `src/main/index.ts:4` (import), `:118-123` (`onNavigate`), `:199-212` (`syncOverlay`)
- Modify: `src/shared/ipc.ts:74` (`loading:state`)
- Modify: `src/renderer/src/loading.ts`
- Test: `tests/e2e/loading.spec.ts` (existing, unchanged) plus the full unit suite

**Interfaces:**

- Consumes: `MainLoads.mark(id, kind)` / `claim(id): LoadKind | null` (Task 3), `WakingTracker.begin(id, kind)` (Task 4), `wakeCaption` (Task 1).
- Produces: `ViewHooks.onNavigate(id: ServiceId, kind: LoadKind | null): void`; `MainToRenderer['loading:state'] = { theme: 'light' | 'dark'; caption: string }`. The private `load` becomes `load(id, wc, kind: LoadKind, url?: string)`; the kind comes before the optional URL so `reload` can omit the URL (the spec lists the parameters in prose order; this is the same contract).

- [x] **Step 1: Confirm the typecheck is red for the right reasons**

Run: `corepack pnpm typecheck`
Expected: errors only in `src/main/views.ts` (`mark` expects 2 arguments; `onNavigate` argument type) and `src/main/index.ts` (`begin` expects 2 arguments; `wake` is not boolean). No other files.

- [x] **Step 2: Update `ViewHooks` and the navigation listener in `views.ts`**

Replace the import on line 21:

```ts
import type { RailPosition, ServiceId } from '../shared/types';
```

with:

```ts
import type { LoadKind, RailPosition, ServiceId } from '../shared/types';
```

Replace the `onNavigate` hook declaration:

```ts
  /** Main-frame, cross-document navigation started (initial load, reload,
   *  redirect) — never same-document SPA routing or subframe loads, which
   *  also spin the tab spinner (did-start-loading) but must not re-cover
   *  the service with the waking overlay. `wake` is true only for a load
   *  main itself requested (MainLoads): a navigation the page made on its
   *  own runs over a live document and must not look like a cold start. */
  onNavigate(id: ServiceId, wake: boolean): void;
```

with:

```ts
  /** Main-frame, cross-document navigation started (initial load, reload,
   *  redirect) — never same-document SPA routing or subframe loads, which
   *  also spin the tab spinner (did-start-loading) but must not re-cover
   *  the service with the waking overlay. `kind` names the load main itself
   *  requested (MainLoads) and is null for a navigation the page made on its
   *  own, which runs over a live document and must not look like a cold start. */
  onNavigate(id: ServiceId, kind: LoadKind | null): void;
```

The `did-start-navigation` listener body is unchanged: `this.hooks.onNavigate(id, this.mainLoads.claim(id));` now passes the kind.

- [x] **Step 3: Give every `load` call its kind**

Replace the private `load`:

```ts
  /** Every load main asks for goes through here, so the waking cover knows
   *  the navigation it is about to see is one of ours. */
  private load(id: ServiceId, wc: WebContents, url?: string): void {
    this.mainLoads.mark(id);
    if (url === undefined) wc.reload();
    else wc.loadURL(url);
  }
```

with:

```ts
  /** Every load main asks for goes through here, so the waking cover knows
   *  the navigation it is about to see is one of ours, and which one. */
  private load(id: ServiceId, wc: WebContents, kind: LoadKind, url?: string): void {
    this.mainLoads.mark(id, kind);
    if (url === undefined) wc.reload();
    else wc.loadURL(url);
  }
```

Then update each caller. In `create` (line 435):

```ts
    this.load(id, wc, 'wake', svc.url);
```

In `handBack` inside `openContainedWindow` (line 503):

```ts
      if (wc && !wc.isDestroyed()) this.load(id, wc, 'hand-back', landedUrl);
```

In `reload` (crash auto-reload):

```ts
  reload(id: ServiceId): void {
    const wc = this.views.get(id)?.webContents;
    if (wc && !wc.isDestroyed()) this.load(id, wc, 'restart');
  }
```

In `refresh`, the last line:

```ts
    this.load(id, view.webContents, 'reload', serviceById(id).url);
```

In `loadServiceUrl`:

```ts
    if (wc && !wc.isDestroyed()) this.load(id, wc, 'purge', serviceById(id).url);
```

In `openConversation`:

```ts
    if (wc && !wc.isDestroyed()) this.load(id, wc, 'wake', url);
```

- [x] **Step 4: Update `index.ts`**

Add the import after line 4 (`serviceById`):

```ts
import { wakeCaption } from '../shared/wake-caption';
```

Replace the `onNavigate` hook:

```ts
        onNavigate: (id, wake) => {
          // the page's JS context is being replaced, taking the notification
          // shim's registry with it — its ids restart at 1 in the new document
          activity.forgetReplay(id);
          if (wake) waking.begin(id);
        },
```

with:

```ts
        onNavigate: (id, kind) => {
          // the page's JS context is being replaced, taking the notification
          // shim's registry with it — its ids restart at 1 in the new document
          activity.forgetReplay(id);
          if (kind) waking.begin(id, kind);
        },
```

Replace the `overlay.update` call in `syncOverlay`:

```ts
      overlay.update({
        theme: effectiveTheme(),
        serviceName: serviceById(state.activeId).name,
      });
```

with:

```ts
      overlay.update({
        theme: effectiveTheme(),
        caption: wakeCaption(rt.wakeKind, serviceById(state.activeId).name),
      });
```

- [x] **Step 5: Change the overlay message and its page**

In `src/shared/ipc.ts`, replace:

```ts
  'loading:state': { theme: 'light' | 'dark'; serviceName: string };
```

with:

```ts
  'loading:state': { theme: 'light' | 'dark'; caption: string };
```

Replace the whole of `src/renderer/src/loading.ts` with:

```ts
import './tokens.css';
import './loading.css';
import './portal.css';

const captionEl = document.getElementById('caption');

window.goetiaLoading.onState(({ theme, caption }) => {
  document.documentElement.dataset.theme = theme;
  if (captionEl) captionEl.textContent = caption;
});
```

`src/preload/loading.ts` and `src/main/loading-overlay.ts` derive their type from `MainToRenderer['loading:state']` and need no edit.

- [x] **Step 6: Lint, typecheck, unit tests**

Run: `corepack pnpm lint && corepack pnpm typecheck && corepack pnpm test`
Expected: all three exit 0.

- [x] **Step 7: E2E**

Run: `env -u ELECTRON_RUN_AS_NODE corepack pnpm e2e`
Expected: every spec passes, including `tests/e2e/loading.spec.ts`. The first load is a `wake`, so the overlay's caption is the same string as before this change.

- [x] **Step 8: Commit**

Ask the user to run `/grimoire-core:commit` for Tasks 3, 4 and 5 together. Suggested message: `feat(waking): name the kind of load the cover is waiting on`.

### Task 6: `ContentPlaceholder` keys on `waking` and shares the caption

**Files:**

- Modify: `src/renderer/src/components/ContentPlaceholder.tsx`

**Interfaces:**

- Consumes: `wakeCaption` (Task 1), `ServiceRuntime.waking` / `wakeKind` (Tasks 1 and 4).
- Produces: nothing downstream.

There is no React component harness in `tests/unit` (happy-dom serves the preload recipe tests only). Executed 2026-09-05: the manual check in Step 3 was replaced by three assertions appended to `tests/e2e/loading.spec.ts` (cover caption during the cold create, the same caption in the placeholder behind ⌘K, and no `Waking` text once the wake ends), which passed against the built app.

- [x] **Step 1: Switch the flag and the words**

Replace the whole of `src/renderer/src/components/ContentPlaceholder.tsx` with:

```tsx
import { wakeCaption } from '../../../shared/wake-caption';
import { useShell } from '../store';

/** The shell's content area, seen only while the active view is hidden
 *  behind ⌘K or Settings. Keyed on `waking`, never `loading`: loading is
 *  did-start-loading, which a live page fires for any subframe fetch, and
 *  it made a rendered Discord read "Waking Discord…" behind the switcher
 *  (2026-09-05). */
export default function ContentPlaceholder() {
  const state = useShell((s) => s.state);
  if (!state) return null;
  const active = state.services.find((s) => s.id === state.activeId);
  if (!active) return null;
  const rt = state.runtime[active.id];
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 bg-bg-0 text-text-2">
      {rt.crashed ? (
        <>
          <span>{active.name} stopped responding or failed to load.</span>
          <button
            type="button"
            onClick={() => window.goetia.send('service:reload', { serviceId: active.id })}
            className="rounded-ctl bg-accent px-4 py-1.5 text-on-accent transition-colors duration-120 hover:opacity-90"
          >
            Retry
          </button>
        </>
      ) : rt.waking ? (
        <span>{wakeCaption(rt.wakeKind, active.name)}</span>
      ) : null}
    </div>
  );
}
```

- [x] **Step 2: Lint and typecheck**

Run: `corepack pnpm lint && corepack pnpm typecheck`
Expected: both exit 0.

- [x] **Step 3: Manual check in the app**

Run: `env -u ELECTRON_RUN_AS_NODE corepack pnpm dev`

1. Activate a live, fully loaded service and press ⌘K. Expected: the area behind the switcher is empty, no "Waking …" text.
2. Press Escape, then ⌘R, then ⌘K immediately. Expected: "Reloading {service}…" behind the switcher until the cover would have dropped.
3. Close ⌘K during that same reload. Expected: the cover reads "Reloading {service}…".
4. Home → activate a service that Light Sleep hibernated (or a never-opened one). Expected: the cover reads "Waking {service}…".

Report what each step showed; if any differs, stop and report rather than adjusting the flag.

- [x] **Step 4: Commit**

Ask the user to run `/grimoire-core:commit`. Suggested message: `fix(shell): key the placeholder behind ⌘K on waking, not loading`.

### Task 7: Guardrail line in `CLAUDE.md`

**Files:**

- Modify: `CLAUDE.md:30` (the bullet beginning `**The waking cover is for loads main asked for, and nothing else.**`)

**Interfaces:**

- Consumes: the names introduced above: `LoadKind`, `MainLoads`, `wakeKind`, `shared/wake-caption.ts`.
- Produces: nothing.

- [x] **Step 1: Append the rule to the existing bullet**

At the end of the bullet on line 30 of `CLAUDE.md` (it currently ends `A dead view's \`views.openConversation\` (\`loadURL\`) is a genuine wake and still covers.`), append this sentence on the same line:

```markdown
 **The cover names the kind of load it covers** (2026-09-05): every `views.load` passes a `LoadKind` that rides the `MainLoads` mark into `WakingTracker.begin` and `runtime.wakeKind` — any view creation is `wake` (cold start, hibernation wake, dead-view open), ⌘R is `reload`, the crash auto-reload is `restart`, post-purge is `purge`, the contained window's hand-back is `hand-back` — and the words live only in `shared/wake-caption.ts`. The shell placeholder behind ⌘K and Settings is keyed on `waking`, never `loading`: `loading` fires for any subframe fetch, and it made a live Discord read "Waking Discord…" behind the switcher.
```

- [x] **Step 2: Lint the markdown**

Run: `npx markdownlint-cli2 CLAUDE.md`
Expected: `Summary: 0 issues`.

- [x] **Step 3: Commit**

Ask the user to run `/grimoire-core:commit`. Suggested message: `docs(claude): record load kinds and the placeholder's waking flag`.
