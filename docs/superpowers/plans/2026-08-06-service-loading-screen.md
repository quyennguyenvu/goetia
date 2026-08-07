# Service Loading Screen ("Waking" Overlay) Implementation Plan

<!-- markdownlint-configure-file { "MD013": { "code_blocks": false } } -->

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps
> use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cover every service load (cold start, hibernation wake, reload,
crash retry) with an animated "waking" overlay until the chat UI is
actually usable, with a 10 s reveal fallback.

**Architecture:** A per-service `waking` runtime flag driven by load
events, a per-recipe `ready(doc)` DOM check polled from the service
preload, and one app-owned `WebContentsView` overlay stacked above the
active service view. The service page stays visible and interactive
underneath, so keep-alive trusted clicks still work (Shopee's readiness
depends on one). Rail tiles breathe while their service is waking.

**Tech Stack:** Electron 43 (`WebContentsView`), electron-vite (multi-page
renderer), TypeScript, Tailwind v4 tokens, vitest + happy-dom, Playwright.

Spec: `docs/superpowers/specs/2026-08-06-service-loading-screen-design.md`

## Global Constraints

- **Never run `git commit`.** At each commit checkpoint, stop and ask the
  user to run `/grimoire-core:commit` with the suggested message. Writing
  `GRIMOIRE_COMMIT_MSG.txt` yourself is forbidden.
- Package manager is pnpm. Commands: `pnpm lint` (biome),
  `pnpm typecheck`, `pnpm test` (vitest), `pnpm e2e` (build +
  playwright), `pnpm build`.
- Constants (exact values): `WAKE_TIMEOUT_MS = 10_000`,
  `READY_POLL_INTERVAL_MS = 250`, ring spin `2s`, orb breathe `2.4s`,
  tile breathe `1.6s`.
- Copy: the overlay caption is `Waking {Service}…` (ellipsis character,
  matching `ContentPlaceholder`).
- Match surrounding code style: 2-space indent, single quotes, comments
  explain *why* only. New Markdown must pass markdownlint.
- The `prefers-reduced-motion` kill-switch already exists in `tokens.css`;
  do not duplicate it.

---

### Task 1: Recipe `ready()` for Messenger and Shopee

**Files:**

- Modify: `src/preload/recipes/types.ts`
- Modify: `src/preload/recipes/messenger.ts`
- Modify: `src/preload/recipes/shopee.ts`
- Test: `tests/unit/recipes.test.ts`

**Interfaces:**

- Consumes: existing `Recipe` interface, existing fixtures
  (`messenger.html`, `shopee.html`, `shopee-collapsed.html`, `blank.html`).
- Produces: optional `ready?(doc: Document): boolean` on `Recipe`;
  implementations on the `messenger` and `shopee` recipe objects. Task 3
  polls this; Task 2's consistency test reflects over it.

- [ ] **Step 1: Write the failing tests**

Append to `tests/unit/recipes.test.ts` (uses the existing `load()`
helper and `recipes` import in that file):

```ts
describe('ready()', () => {
  it('messenger is ready once chat rows are rendered', () => {
    expect(recipes.messenger.ready?.(load('messenger'))).toBe(true);
    expect(recipes.messenger.ready?.(load('blank'))).toBe(false);
  });

  it('shopee is ready only when the mini-chat is expanded', () => {
    expect(recipes.shopee.ready?.(load('shopee'))).toBe(true);
    expect(recipes.shopee.ready?.(load('shopee-collapsed'))).toBe(false);
    expect(recipes.shopee.ready?.(load('blank'))).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test tests/unit/recipes.test.ts`
Expected: FAIL — `expected undefined to be true` (no `ready` defined yet).

- [ ] **Step 3: Implement `ready()`**

In `src/preload/recipes/types.ts`, add to the `Recipe` interface after
`count`:

```ts
  /** Chat UI is rendered and usable — ends the shell's waking cover
   *  early. Absent: did-finish-load is the ready signal instead
   *  (ServiceMeta.waitForReady mirrors this). */
  ready?(doc: Document): boolean;
```

In `src/preload/recipes/messenger.ts`, add to the `messenger` object
after `css`:

```ts
  // chat list rendered; the banner-hiding css applied long before this
  ready(doc) {
    return doc.querySelectorAll("a[href*='/t/']").length > 0;
  },
```

In `src/preload/recipes/shopee.ts`, add to the `shopee` object after
`css` (same structural check as `chatHeader()`):

```ts
  // expanded mini-chat (header + body) — the keep-alive click landed
  ready(doc) {
    const wrapper =
      doc.querySelector('#shopee-mini-chat-embedded')?.firstElementChild;
    return (wrapper?.children.length ?? 0) >= 2;
  },
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test tests/unit/recipes.test.ts`
Expected: PASS (all pre-existing cases still green).

- [ ] **Step 5: Lint and typecheck**

Run: `pnpm lint && pnpm typecheck`
Expected: no errors.

- [ ] **Step 6: Commit checkpoint**

Ask the user to run `/grimoire-core:commit`. Suggested message:
`feat(recipes): add ready() chat-usable checks for messenger and shopee`.
Do not run `git commit` yourself.

---

### Task 2: Shared `waking` flag, `waitForReady` meta, IPC channels

**Files:**

- Modify: `src/shared/types.ts`
- Modify: `src/shared/services.ts`
- Modify: `src/shared/ipc.ts`
- Modify: `src/main/state.ts`
- Test: `tests/unit/recipes.test.ts`, `tests/unit/state.test.ts`

**Interfaces:**

- Consumes: `Recipe.ready?` from Task 1.
- Produces: `ServiceRuntime.waking: boolean` (default `false`);
  `ServiceMeta.waitForReady?: boolean` (set on messenger + shopee);
  renderer→main channel `'service:ready': { serviceId: ServiceId }`;
  main→renderer channel
  `'loading:state': { theme: 'light' | 'dark'; serviceName: string }`.
  Tasks 4–7 rely on all of these names exactly.

- [ ] **Step 1: Write the failing tests**

Append to `tests/unit/recipes.test.ts` (add
`import { SERVICES } from '../../src/shared/services';` to its imports):

```ts
describe('waitForReady flag', () => {
  it('matches exactly the recipes that define ready()', () => {
    for (const svc of SERVICES) {
      expect(Boolean(svc.waitForReady)).toBe(
        recipes[svc.id]?.ready !== undefined,
      );
    }
  });
});
```

Append inside the `describe('MainState', ...)` block of
`tests/unit/state.test.ts`:

```ts
  it('new runtimes start not waking', () => {
    const s = new MainState();
    expect(s.runtime('messenger').waking).toBe(false);
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test tests/unit/recipes.test.ts tests/unit/state.test.ts`
Expected: FAIL — `expected false to be true` (messenger defines `ready()`
but has no flag) and `expected undefined to be false`.

- [ ] **Step 3: Implement the shared additions**

`src/shared/types.ts` — add to `ServiceMeta` after `keepRendered`:

```ts
  /** The recipe defines ready(); did-finish-load must not clear the
   *  waking cover — only ready, crash, destroy, or the timeout do. */
  waitForReady?: boolean;
```

`src/shared/types.ts` — add to `ServiceRuntime` after `loading`:

```ts
  waking: boolean; // loading screen covers this service
```

`src/shared/services.ts` — add `waitForReady: true` to the messenger
and shopee entries. Keep the existing comments above both entries
untouched; only the object literals change:

```ts
  {
    id: 'messenger',
    name: 'Messenger',
    url: 'https://www.facebook.com/messages/',
    color: '#0084FF',
    waitForReady: true,
  },
```

```ts
  {
    id: 'shopee',
    name: 'Shopee',
    url: 'https://shopee.vn/',
    color: '#EE4D2D',
    waitForReady: true,
  },
```

`src/shared/ipc.ts` — add to `RendererToMain`:

```ts
  'service:ready': { serviceId: ServiceId };
```

add `'service:ready',` to `R2M_CHANNELS`, and add to `MainToRenderer`:

```ts
  /** main -> loading overlay page */
  'loading:state': { theme: 'light' | 'dark'; serviceName: string };
```

`src/main/state.ts` — add to `defaultRuntime()`:

```ts
  waking: false,
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test`
Expected: PASS (full unit suite — nothing else asserts runtime shape
exhaustively, but run everything to be sure).

- [ ] **Step 5: Lint and typecheck**

Run: `pnpm lint && pnpm typecheck`
Expected: no errors.

- [ ] **Step 6: Commit checkpoint**

Ask the user to run `/grimoire-core:commit`. Suggested message:
`feat(shared): add waking runtime flag, waitForReady meta, ready IPC`.

---

### Task 3: Ready poll in the service preload

**Files:**

- Create: `src/preload/recipes/ready.ts`
- Modify: `src/preload/service.ts`
- Test: `tests/unit/ready-poll.test.ts`

**Interfaces:**

- Consumes: `Recipe.ready?` (Task 1), `'service:ready'` channel (Task 2).
- Produces:
  `startReadyPoll(recipe, doc, report, setIntervalFn?, clearIntervalFn?)`
  and `READY_POLL_INTERVAL_MS = 250`. Sends `service:ready` exactly once
  per document.

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/ready-poll.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { startReadyPoll } from '../../src/preload/recipes/ready';
import type { Recipe } from '../../src/preload/recipes/types';

function fakeTimers() {
  const ticks: (() => void)[] = [];
  const setIntervalFn = ((fn: () => void) => {
    ticks.push(fn);
    return ticks.length as unknown as ReturnType<typeof setInterval>;
  }) as typeof setInterval;
  const cleared: unknown[] = [];
  const clearIntervalFn = ((id: unknown) => {
    cleared.push(id);
  }) as typeof clearInterval;
  return { ticks, cleared, setIntervalFn, clearIntervalFn };
}

const base: Recipe = {
  id: 'messenger',
  intervalMs: 2000,
  count: () => ({ direct: 0, indirect: 0 }),
};

const doc = {} as Document;

describe('startReadyPoll', () => {
  it('reports once when ready flips true, then stops polling', () => {
    let ready = false;
    const recipe: Recipe = { ...base, ready: () => ready };
    const t = fakeTimers();
    const report = vi.fn();
    startReadyPoll(recipe, doc, report, t.setIntervalFn, t.clearIntervalFn);
    t.ticks[0]();
    expect(report).not.toHaveBeenCalled();
    ready = true;
    t.ticks[0]();
    expect(report).toHaveBeenCalledTimes(1);
    expect(t.cleared).toHaveLength(1);
  });

  it('treats a throwing ready() as not ready', () => {
    const recipe: Recipe = {
      ...base,
      ready: () => {
        throw new Error('boom');
      },
    };
    const t = fakeTimers();
    const report = vi.fn();
    startReadyPoll(recipe, doc, report, t.setIntervalFn, t.clearIntervalFn);
    t.ticks[0]();
    expect(report).not.toHaveBeenCalled();
    expect(t.cleared).toHaveLength(0);
  });

  it('does nothing for recipes without ready()', () => {
    const t = fakeTimers();
    startReadyPoll(base, doc, vi.fn(), t.setIntervalFn, t.clearIntervalFn);
    expect(t.ticks).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test tests/unit/ready-poll.test.ts`
Expected: FAIL — cannot resolve `../../src/preload/recipes/ready`.

- [ ] **Step 3: Implement `startReadyPoll`**

Create `src/preload/recipes/ready.ts`:

```ts
import type { Recipe } from './types';

export const READY_POLL_INTERVAL_MS = 250;

/** Poll recipe.ready() until it turns true, then report once and stop.
 *  A throwing ready() counts as not-ready — main's reveal timeout is the
 *  backstop, so the page can never stay covered forever. */
export function startReadyPoll(
  recipe: Recipe,
  doc: Document,
  report: () => void,
  setIntervalFn: typeof setInterval = setInterval,
  clearIntervalFn: typeof clearInterval = clearInterval,
): void {
  const check = recipe.ready;
  if (!check) return;
  const timer = setIntervalFn(() => {
    let ok = false;
    try {
      ok = check(doc);
    } catch {
      // not ready; the timeout reveals eventually
    }
    if (!ok) return;
    clearIntervalFn(timer);
    report();
  }, READY_POLL_INTERVAL_MS);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test tests/unit/ready-poll.test.ts`
Expected: PASS.

- [ ] **Step 5: Wire it into the service preload**

In `src/preload/service.ts`, add the import:

```ts
import { startReadyPoll } from './recipes/ready';
```

and inside the existing `DOMContentLoaded` listener, after the
`startRecipe(...)` call, add:

```ts
  startReadyPoll(recipe, document, () =>
    ipcRenderer.send('service:ready', { serviceId }),
  );
```

- [ ] **Step 6: Full verification**

Run: `pnpm test && pnpm lint && pnpm typecheck`
Expected: all green.

- [ ] **Step 7: Commit checkpoint**

Ask the user to run `/grimoire-core:commit`. Suggested message:
`feat(preload): poll recipe ready() and signal service:ready once`.

---

### Task 4: Waking rules and tracker in main

**Files:**

- Create: `src/main/lib/waking-rules.ts`
- Create: `src/main/waking.ts`
- Test: `tests/unit/waking-rules.test.ts`
- Test: `tests/unit/waking.test.ts`

**Interfaces:**

- Consumes: `MainState` (`runtime`, `setRuntime`), `serviceById`,
  `ServiceMeta.waitForReady` (Task 2).
- Produces: `WAKE_TIMEOUT_MS = 10_000`; type
  `WakeEnd = 'recipe-ready' | 'load-finished' | 'timeout' | 'crashed' |
  'load-failed' | 'destroyed'`; `endsWake(event, meta): boolean`;
  `class WakingTracker { begin(id): void; end(id, event): void }`.
  Task 5 wires these exact names.

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/waking-rules.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { endsWake, type WakeEnd } from '../../src/main/lib/waking-rules';
import type { ServiceMeta } from '../../src/shared/types';

function meta(waitForReady?: true): ServiceMeta {
  return {
    id: 'messenger',
    name: 'Messenger',
    url: 'https://example.test/',
    color: '#fff',
    waitForReady,
  };
}

describe('endsWake', () => {
  it('load-finished reveals only services without a ready() check', () => {
    expect(endsWake('load-finished', meta())).toBe(true);
    expect(endsWake('load-finished', meta(true))).toBe(false);
  });

  it('every other end event always reveals', () => {
    const events: WakeEnd[] = [
      'recipe-ready',
      'timeout',
      'crashed',
      'load-failed',
      'destroyed',
    ];
    for (const e of events) {
      expect(endsWake(e, meta(true))).toBe(true);
      expect(endsWake(e, meta())).toBe(true);
    }
  });
});
```

Create `tests/unit/waking.test.ts` (messenger has `waitForReady`,
telegram does not — set in Task 2):

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MainState } from '../../src/main/state';
import { WakingTracker } from '../../src/main/waking';

describe('WakingTracker', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('begin sets waking; the 10s timeout reveals', () => {
    const state = new MainState();
    const w = new WakingTracker(state);
    w.begin('messenger');
    expect(state.runtime('messenger').waking).toBe(true);
    vi.advanceTimersByTime(9_999);
    expect(state.runtime('messenger').waking).toBe(true);
    vi.advanceTimersByTime(1);
    expect(state.runtime('messenger').waking).toBe(false);
  });

  it('recipe-ready reveals immediately and disarms the timer', () => {
    const state = new MainState();
    const cb = vi.fn();
    state.onChange(cb);
    const w = new WakingTracker(state);
    w.begin('messenger');
    w.end('messenger', 'recipe-ready');
    expect(state.runtime('messenger').waking).toBe(false);
    const calls = cb.mock.calls.length;
    vi.runAllTimers();
    expect(cb.mock.calls.length).toBe(calls); // disarmed: no extra touch
  });

  it('load-finished keeps waitForReady services covered', () => {
    const state = new MainState();
    const w = new WakingTracker(state);
    w.begin('messenger');
    w.end('messenger', 'load-finished');
    expect(state.runtime('messenger').waking).toBe(true);
  });

  it('load-finished reveals services without ready()', () => {
    const state = new MainState();
    const w = new WakingTracker(state);
    w.begin('telegram');
    w.end('telegram', 'load-finished');
    expect(state.runtime('telegram').waking).toBe(false);
  });

  it('a reload mid-wake re-arms the timeout', () => {
    const state = new MainState();
    const w = new WakingTracker(state);
    w.begin('messenger');
    vi.advanceTimersByTime(8_000);
    w.begin('messenger'); // reload restarts the clock
    vi.advanceTimersByTime(8_000);
    expect(state.runtime('messenger').waking).toBe(true);
    vi.advanceTimersByTime(2_000);
    expect(state.runtime('messenger').waking).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test tests/unit/waking-rules.test.ts tests/unit/waking.test.ts`
Expected: FAIL — modules do not exist.

- [ ] **Step 3: Implement the rules module**

Create `src/main/lib/waking-rules.ts`:

```ts
import type { ServiceMeta } from '../../shared/types';

export const WAKE_TIMEOUT_MS = 10_000;

/** Everything that can end a wake (reveal the service). */
export type WakeEnd =
  | 'recipe-ready'
  | 'load-finished'
  | 'timeout'
  | 'crashed'
  | 'load-failed'
  | 'destroyed';

/** load-finished only reveals services without a recipe ready() check
 *  (their chat renders after load); every other end event always
 *  reveals — the cover must never outlive its view or trap a Retry. */
export function endsWake(event: WakeEnd, meta: ServiceMeta): boolean {
  if (event === 'load-finished') return !meta.waitForReady;
  return true;
}
```

Create `src/main/waking.ts`:

```ts
import { serviceById } from '../shared/services';
import type { ServiceId } from '../shared/types';
import { endsWake, WAKE_TIMEOUT_MS, type WakeEnd } from './lib/waking-rules';
import type { MainState } from './state';

/** Per-service "waking" cover: begins on every load start, ends on
 *  recipe readiness, load completion (services without ready()), crash,
 *  destruction, or the reveal timeout — whichever comes first. */
export class WakingTracker {
  private timers = new Map<ServiceId, ReturnType<typeof setTimeout>>();

  constructor(
    private state: MainState,
    private timeoutMs = WAKE_TIMEOUT_MS,
  ) {}

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

  end(id: ServiceId, event: WakeEnd): void {
    if (!endsWake(event, serviceById(id))) return;
    const timer = this.timers.get(id);
    if (timer !== undefined) {
      clearTimeout(timer);
      this.timers.delete(id);
    }
    if (this.state.runtime(id).waking) {
      this.state.setRuntime(id, { waking: false });
    }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test tests/unit/waking-rules.test.ts tests/unit/waking.test.ts`
Expected: PASS.

- [ ] **Step 5: Lint and typecheck**

Run: `pnpm lint && pnpm typecheck`
Expected: no errors.

- [ ] **Step 6: Commit checkpoint**

Ask the user to run `/grimoire-core:commit`. Suggested message:
`feat(main): add waking tracker with ready/timeout reveal rules`.

---

### Task 5: Wire waking into main (hooks, IPC, hibernation, disable)

**Files:**

- Modify: `src/main/index.ts:59-71` (view hooks) and the `ctx` literal
- Modify: `src/main/ipc-handlers.ts` (`AppContext`, handlers)
- Modify: `src/main/hibernation.ts:33-36` (sweep destroy)

**Interfaces:**

- Consumes: `WakingTracker` (Task 4), `'service:ready'` channel (Task 2).
- Produces: `AppContext.waking: WakingTracker` — Task 7's overlay sync
  reads `runtime(id).waking` maintained here.

- [ ] **Step 1: Create the tracker and drive it from view hooks**

In `src/main/index.ts`, add imports:

```ts
import { WakingTracker } from './waking';
```

After `const win = createWindow();` add:

```ts
    const waking = new WakingTracker(state);
```

Replace the hooks object passed to `new ServiceViewManager(win, {...})`
with:

```ts
      {
        onLoading: (id, loading) => {
          state.setRuntime(id, { loading });
          if (loading) waking.begin(id);
          else {
            waking.end(id, 'load-finished');
            resilience?.noteRecovered(id);
          }
        },
        onCrashed: (id) => {
          waking.end(id, 'crashed');
          resilience?.onCrashed(id);
        },
        onLoadFailed: (id) => {
          waking.end(id, 'load-failed');
          resilience?.onLoadFailed(id);
        },
      },
```

(`did-start-loading` fires on the initial `loadURL` too, so view
creation needs no separate begin hook.)

Add `waking` to the `ctx` literal:

```ts
    const ctx = {
      win,
      views,
      state,
      settings,
      waking,
      broadcast,
      noteActivated: (id: Parameters<HibernationController['noteActivated']>[0]) =>
        hibernation.noteActivated(id),
    };
```

- [ ] **Step 2: Extend AppContext and register the ready handler**

In `src/main/ipc-handlers.ts`, add the import and field:

```ts
import type { WakingTracker } from './waking';
```

```ts
export interface AppContext {
  win: BrowserWindow;
  views: ServiceViewManager;
  state: MainState;
  settings: SettingsStore;
  waking: WakingTracker;
  broadcast(): void;
  /** resets the hibernation idle clock; late-bound in index.ts */
  noteActivated(id: import('../shared/types').ServiceId): void;
}
```

In `registerIpcHandlers`, add next to the other `service:*` handlers:

```ts
  on('service:ready', ({ serviceId }) => ctx.waking.end(serviceId, 'recipe-ready'));
```

In the `settings:update` handler's disable loop, after
`ctx.views.destroy(id);` add the end call and extend the reset patch:

```ts
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
```

- [ ] **Step 3: Clear waking when hibernation destroys a view**

In `src/main/hibernation.ts`, extend the sweep's destroy branch:

```ts
      if (shouldHibernate(candidate, now, s.hibernationMinutes) && this.ctx.views.has(id)) {
        this.ctx.views.destroy(id);
        this.ctx.waking.end(id, 'destroyed');
        this.ctx.state.setRuntime(id, { hibernated: true });
      }
```

- [ ] **Step 4: Full verification**

Run: `pnpm test && pnpm lint && pnpm typecheck`
Expected: all green (no behavior change is observable in unit tests yet;
this step catches wiring/type mistakes).

- [ ] **Step 5: Commit checkpoint**

Ask the user to run `/grimoire-core:commit`. Suggested message:
`feat(main): drive waking flag from load, ready, crash, destroy events`.

---

### Task 6: Loading overlay page (renderer + preload + build config)

**Files:**

- Create: `src/renderer/loading.html`
- Create: `src/renderer/src/loading.ts`
- Create: `src/renderer/src/loading.css`
- Create: `src/preload/loading.ts`
- Modify: `electron.vite.config.ts`
- Modify: `src/renderer/src/env.d.ts`

**Interfaces:**

- Consumes: `MainToRenderer['loading:state']` (Task 2), `tokens.css`
  theme variables and its reduced-motion rule.
- Produces: `out/renderer/loading.html` and `out/preload/loading.cjs`
  (paths Task 7 loads); `window.goetiaLoading.onState(cb)` bridge;
  elements `.portal` (svg) and `#caption` (e2e hooks in Task 9).

- [ ] **Step 1: Create the overlay preload**

Create `src/preload/loading.ts`:

```ts
import { contextBridge, ipcRenderer } from 'electron';
import type { MainToRenderer } from '../shared/ipc';

type LoadingState = MainToRenderer['loading:state'];

const api = {
  onState(cb: (s: LoadingState) => void): void {
    ipcRenderer.on('loading:state', (_e, s: LoadingState) => cb(s));
  },
};

contextBridge.exposeInMainWorld('goetiaLoading', api);
export type GoetiaLoadingApi = typeof api;
```

- [ ] **Step 2: Create the overlay page**

Create `src/renderer/loading.html` (the Ember Portal from
`resources/icon.svg`, minus the squircle plate; the inner group already
lives in a ~96×96 coordinate space centered on 48,48):

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta
      http-equiv="Content-Security-Policy"
      content="default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:"
    />
    <title>Goetia — waking</title>
  </head>
  <body>
    <main class="stage">
      <svg class="portal" viewBox="0 0 96 96" aria-hidden="true">
        <defs>
          <linearGradient
            id="arcA"
            gradientUnits="userSpaceOnUse"
            x1="77.5"
            y1="42.8"
            x2="18.7"
            y2="54.2"
          >
            <stop offset="0" stop-color="#E23D28" />
            <stop offset="1" stop-color="#FF7A1F" />
          </linearGradient>
          <linearGradient
            id="arcB"
            gradientUnits="userSpaceOnUse"
            x1="18.7"
            y1="54.2"
            x2="53.2"
            y2="18.5"
          >
            <stop offset="0" stop-color="#FF7A1F" />
            <stop offset="1" stop-color="#FFD34D" />
          </linearGradient>
          <radialGradient id="coreg" cx="0.5" cy="0.42" r="0.75">
            <stop offset="0" stop-color="#FFF6CE" />
            <stop offset="0.35" stop-color="#FFCE5A" />
            <stop offset="0.7" stop-color="#FF9E2C" />
            <stop offset="1" stop-color="#F0663A" />
          </radialGradient>
          <filter id="soft" x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="3.2" />
          </filter>
          <filter id="softer" x="-80%" y="-80%" width="260%" height="260%">
            <feGaussianBlur stdDeviation="5.5" />
          </filter>
        </defs>
        <g class="ring">
          <g filter="url(#soft)" opacity="0.5" fill="none" stroke-linecap="round">
            <path
              d="M77.55 42.79 A30 30 0 0 1 18.66 54.24"
              stroke="url(#arcA)"
              stroke-width="12"
            />
            <path
              d="M18.66 54.24 A30 30 0 0 1 53.21 18.45"
              stroke="url(#arcB)"
              stroke-width="12"
            />
          </g>
          <path
            d="M77.55 42.79 A30 30 0 0 1 18.66 54.24"
            fill="none"
            stroke="url(#arcA)"
            stroke-width="6.5"
            stroke-linecap="round"
          />
          <path
            d="M18.66 54.24 A30 30 0 0 1 53.21 18.45"
            fill="none"
            stroke="url(#arcB)"
            stroke-width="6.5"
            stroke-linecap="round"
          />
          <circle cx="59.2" cy="20.2" r="3.4" fill="#FFD34D" />
          <circle cx="67.3" cy="25" r="2.5" fill="#FFCB45" opacity="0.8" />
          <circle cx="73.2" cy="31.7" r="1.8" fill="#FFC13D" opacity="0.55" />
        </g>
        <g class="core">
          <circle
            cx="48"
            cy="48"
            r="13"
            fill="#FF8A2A"
            opacity="0.45"
            filter="url(#softer)"
          />
          <circle cx="48" cy="48" r="7" fill="url(#coreg)" />
          <circle cx="48" cy="46.5" r="2.6" fill="#FFFBEA" opacity="0.95" />
        </g>
      </svg>
      <p class="caption" id="caption">Waking…</p>
    </main>
    <script type="module" src="/src/loading.ts"></script>
  </body>
</html>
```

Create `src/renderer/src/loading.css` (`tokens.css` already resets
margins, sets `html, body` heights, and kills animations under
`prefers-reduced-motion`):

```css
.stage {
  display: flex;
  height: 100%;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14px;
  background: var(--bg-0);
}
.portal {
  width: 128px;
  height: 128px;
}
.ring {
  transform-origin: 48px 48px;
  animation: portal-spin 2s linear infinite;
}
.core {
  transform-origin: 48px 48px;
  animation: portal-breathe 2.4s ease-in-out infinite;
}
.caption {
  color: var(--text-2);
}
@keyframes portal-spin {
  to {
    transform: rotate(360deg);
  }
}
@keyframes portal-breathe {
  0%,
  100% {
    transform: scale(1);
    opacity: 0.85;
  }
  50% {
    transform: scale(1.14);
    opacity: 1;
  }
}
```

Create `src/renderer/src/loading.ts`:

```ts
import './tokens.css';
import './loading.css';

const caption = document.getElementById('caption');

window.goetiaLoading.onState(({ theme, serviceName }) => {
  document.documentElement.dataset.theme = theme;
  if (caption) caption.textContent = `Waking ${serviceName}…`;
});
```

- [ ] **Step 3: Register the new entries in the build**

`electron.vite.config.ts` — add the preload input:

```ts
        input: {
          shell: resolve(__dirname, 'src/preload/shell.ts'),
          service: resolve(__dirname, 'src/preload/service.ts'),
          loading: resolve(__dirname, 'src/preload/loading.ts'),
        },
```

and give the renderer a multi-page input:

```ts
  renderer: {
    plugins: [react(), tailwindcss()],
    optimizeDeps: { include: ['zustand'] },
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/renderer/index.html'),
          loading: resolve(__dirname, 'src/renderer/loading.html'),
        },
      },
    },
  },
```

`src/renderer/src/env.d.ts` — declare the bridge:

```ts
import type { GoetiaLoadingApi } from '../../preload/loading';
import type { GoetiaApi } from '../../preload/shell';

declare global {
  interface Window {
    goetia: GoetiaApi;
    goetiaLoading: GoetiaLoadingApi;
  }
}
```

- [ ] **Step 4: Verify the build emits both artifacts**

Run: `pnpm build && ls out/renderer/loading.html out/preload/loading.cjs`
Expected: build succeeds; both paths listed.

- [ ] **Step 5: Lint and typecheck**

Run: `pnpm lint && pnpm typecheck`
Expected: no errors.

- [ ] **Step 6: Commit checkpoint**

Ask the user to run `/grimoire-core:commit`. Suggested message:
`feat(renderer): add ember-portal loading page as second entry`.

---

### Task 7: LoadingOverlay view and visibility sync in main

**Files:**

- Create: `src/main/loading-overlay.ts`
- Modify: `src/main/views.ts` (overlay bounds in `layout()`)
- Modify: `src/main/index.ts` (create overlay, sync in `broadcast`)

**Interfaces:**

- Consumes: `out/renderer/loading.html`, `out/preload/loading.cjs`
  (Task 6), `runtime.waking` (Task 5), `viewBounds` shape.
- Produces:
  `class LoadingOverlay { setBounds(b); update(state); show(); hide() }`
  where `state` is `MainToRenderer['loading:state']`. `show()` re-adds
  the view at the top of the z-order every call — that is what keeps it
  above a freshly re-activated service view.

- [ ] **Step 1: Implement the overlay module**

Create `src/main/loading-overlay.ts`:

```ts
import { join } from 'node:path';
import { type BrowserWindow, WebContentsView } from 'electron';
import type { MainToRenderer } from '../shared/ipc';

type LoadingState = MainToRenderer['loading:state'];

// --bg-0 per theme: the view's own background, so no white flash can
// appear before the page paints
const BG = { light: '#f7f8fa', dark: '#0f1115' } as const;

export class LoadingOverlay {
  private view: WebContentsView;
  private visible = false;
  private pending: LoadingState | null = null;

  constructor(
    private win: BrowserWindow,
    initialTheme: 'light' | 'dark',
  ) {
    this.view = new WebContentsView({
      webPreferences: {
        preload: join(__dirname, '../preload/loading.cjs'),
        contextIsolation: true,
        sandbox: true,
      },
    });
    this.view.setBackgroundColor(BG[initialTheme]);
    this.view.setVisible(false);
    const wc = this.view.webContents;
    // loaded hidden at startup so the first show paints instantly;
    // re-send the last state in case update() raced the page load
    wc.on('did-finish-load', () => {
      if (this.pending) wc.send('loading:state', this.pending);
    });
    if (process.env.ELECTRON_RENDERER_URL) {
      wc.loadURL(`${process.env.ELECTRON_RENDERER_URL}/loading.html`);
    } else {
      wc.loadFile(join(__dirname, '../renderer/loading.html'));
    }
  }

  setBounds(bounds: { x: number; y: number; width: number; height: number }): void {
    this.view.setBounds(bounds);
  }

  update(state: LoadingState): void {
    this.pending = state;
    this.view.setBackgroundColor(BG[state.theme]);
    this.view.webContents.send('loading:state', state);
  }

  /** Re-adds at the top of the z-order every time (same trick as
   *  activate()), so it stays above a just-re-added service view. */
  show(): void {
    this.win.contentView.addChildView(this.view);
    this.view.setVisible(true);
    this.visible = true;
  }

  hide(): void {
    if (!this.visible) return;
    this.view.setVisible(false);
    this.visible = false;
  }
}
```

- [ ] **Step 2: Keep overlay bounds in sync with service views**

In `src/main/views.ts`, extend the constructor with an optional overlay
and sync it in `layout()`:

```ts
  constructor(
    private win: BrowserWindow,
    private hooks: ViewHooks,
    private railPosition: () => RailPosition,
    private overlay?: {
      setBounds(b: { x: number; y: number; width: number; height: number }): void;
    },
  ) {
    win.on('resize', () => this.layout());
  }
```

```ts
  layout(): void {
    const [w, h] = this.win.getContentSize();
    const bounds = viewBounds(w, h, this.railPosition());
    for (const view of this.views.values()) view.setBounds(bounds);
    this.overlay?.setBounds(bounds);
  }
```

- [ ] **Step 3: Create and sync the overlay in index.ts**

In `src/main/index.ts`, add imports:

```ts
import { serviceById } from '../shared/services';
import { LoadingOverlay } from './loading-overlay';
```

Move the existing `effectiveTheme` declaration up so it sits right after
`const win = createWindow();` (it only reads `settings`), then create
the overlay and pass it to the view manager:

```ts
    const effectiveTheme = (): 'light' | 'dark' => {
      const pref = settings.get().theme;
      if (pref === 'system') return nativeTheme.shouldUseDarkColors ? 'dark' : 'light';
      return pref;
    };

    const overlay = new LoadingOverlay(win, effectiveTheme());
    const waking = new WakingTracker(state);
```

```ts
    const views = new ServiceViewManager(
      win,
      {
        onLoading: (id, loading) => {
          state.setRuntime(id, { loading });
          if (loading) waking.begin(id);
          else {
            waking.end(id, 'load-finished');
            resilience?.noteRecovered(id);
          }
        },
        onCrashed: (id) => {
          waking.end(id, 'crashed');
          resilience?.onCrashed(id);
        },
        onLoadFailed: (id) => {
          waking.end(id, 'load-failed');
          resilience?.onLoadFailed(id);
        },
      },
      () => settings.get().railPosition,
      overlay,
    );
```

Add the sync function and call it at the end of `broadcast()`:

```ts
    const syncOverlay = () => {
      const rt = state.runtime(state.activeId);
      const show =
        rt.waking && !rt.crashed && !state.switcherOpen && !state.settingsOpen;
      if (!show) {
        overlay.hide();
        return;
      }
      overlay.update({
        theme: effectiveTheme(),
        serviceName: serviceById(state.activeId).name,
      });
      overlay.show();
    };
```

```ts
    const broadcast = () => {
      const s = settings.get();
      win.webContents.send('shell:state', state.snapshot(s, effectiveTheme(), app.getVersion()));
      const summary = aggregateBadges(
        s.order.map((id) => ({ ...state.runtime(id).unread, muted: s.muted[id] })),
        s.globalMuted,
      );
      applyBadges(win, summary);
      tray?.updateTooltip(summary.total);
      syncOverlay();
    };
```

- [ ] **Step 4: Full verification**

Run: `pnpm test && pnpm lint && pnpm typecheck && pnpm build`
Expected: all green.

- [ ] **Step 5: Commit checkpoint**

Ask the user to run `/grimoire-core:commit`. Suggested message:
`feat(main): cover waking services with the loading overlay view`.

---

### Task 8: Rail tiles breathe while waking

**Files:**

- Modify: `src/renderer/src/tokens.css`
- Modify: `src/renderer/src/components/ServiceTile.tsx`

**Interfaces:**

- Consumes: `runtime.waking` in `ShellState` (broadcast since Task 5).
- Produces: `.tile-breathe` class (Task 9's e2e asserts on it).

- [ ] **Step 1: Add the breathe animation to tokens.css**

Append to `src/renderer/src/tokens.css`, before the
`prefers-reduced-motion` block (which must stay last so it wins):

```css
.tile-breathe {
  animation: tile-breathe 1.6s ease-in-out infinite;
}
@keyframes tile-breathe {
  0%,
  100% {
    opacity: 0.35;
  }
  50% {
    opacity: 0.9;
  }
}
```

- [ ] **Step 2: Apply it in ServiceTile**

In `src/renderer/src/components/ServiceTile.tsx`, add above the
`stateClasses` declaration:

```tsx
  const waking = runtime.waking && !runtime.crashed;
```

and extend the button's `className` (the animation overrides the
utility `opacity-*` classes while it runs, which is exactly the
breathing effect):

```tsx
      className={`relative flex h-8 w-8 items-center justify-center rounded-[11px] transition-all duration-150 ease-out outline-none
        focus-visible:ring-2 focus-visible:ring-accent ${stateClasses}
        ${waking ? 'tile-breathe' : ''}`}
```

- [ ] **Step 3: Lint and typecheck**

Run: `pnpm lint && pnpm typecheck`
Expected: no errors.

- [ ] **Step 4: Commit checkpoint**

Ask the user to run `/grimoire-core:commit`. Suggested message:
`feat(rail): breathe service tiles while their service is waking`.

---

### Task 9: E2E coverage, full verification, manual checklist

**Files:**

- Modify: `tests/e2e/smoke.spec.ts:14` (shell predicate)
- Create: `tests/e2e/loading.spec.ts`

**Interfaces:**

- Consumes: `.tile-breathe` (Task 8), the overlay page's `.portal`
  element (Task 6), `--goetia-user-data` isolation flag.
- Produces: nothing downstream; this is the acceptance gate.

- [ ] **Step 1: Fix the shell predicate in smoke.spec.ts**

The overlay page is a second `file://` webContents in the packaged
build, so the existing predicate can pick the wrong page. Replace it:

```ts
  const isShell = (p: { url(): string }) =>
    p.url().startsWith('file://') && !p.url().includes('loading.html');
```

- [ ] **Step 2: Write the loading e2e**

Create `tests/e2e/loading.spec.ts`:

```ts
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { _electron as electron, expect, test } from '@playwright/test';

test('waking cover: overlay page exists, tiles breathe, timeout reveals', async () => {
  const profile = mkdtempSync(join(tmpdir(), 'goetia-e2e-'));
  const app = await electron.launch({
    args: ['out/main/index.js', `--goetia-user-data=${profile}`],
  });

  const isShell = (p: { url(): string }) =>
    p.url().startsWith('file://') && !p.url().includes('loading.html');
  const win =
    app.windows().find(isShell) ??
    (await app.waitForEvent('window', { predicate: isShell }));

  // the overlay page is its own webContents, present from startup
  const isOverlay = (p: { url(): string }) => p.url().includes('loading.html');
  const overlay =
    app.windows().find(isOverlay) ??
    (await app.waitForEvent('window', { predicate: isOverlay }));
  await expect(overlay.locator('.portal')).toBeAttached();

  // messenger (active, logged out, waitForReady) breathes during the
  // wake, then the 10s timeout reveals and the breathing stops
  const tile = win.locator('[data-testid="rail"] button[aria-label="Messenger"]');
  await expect(tile).toHaveClass(/tile-breathe/);
  await expect(tile).not.toHaveClass(/tile-breathe/, { timeout: 15_000 });

  await app.close();
});
```

- [ ] **Step 3: Run the e2e suite**

Run: `pnpm e2e`
Expected: PASS (both spec files; needs network access to load the
logged-out service pages, same as the existing smoke test).

- [ ] **Step 4: Full verification**

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm e2e`
Expected: everything green.

- [ ] **Step 5: Manual checklist (run `pnpm dev`)**

- Cold start: Messenger shows the ember portal (spinning ring,
  breathing orb, "Waking Messenger…"), never the Facebook header flash.
- Enable Shopee in Settings, activate it: no homepage flash; the cover
  holds until the mini-chat is expanded (logged in) or reveals at ~10 s
  (logged out / captcha).
- ⌘R / F5 on an open service: cover shows again, then reveals.
- Toggle theme in Settings while a service is waking: overlay recolors.
- Open Settings or the Quick Switcher mid-wake: overlay hides; closing
  them brings it back if still waking.
- Rail tiles breathe while waking (including background services during
  startup), and stop once revealed.

- [ ] **Step 6: Commit checkpoint**

Ask the user to run `/grimoire-core:commit`. Suggested message:
`test(e2e): cover the waking overlay and tile breathing`.
