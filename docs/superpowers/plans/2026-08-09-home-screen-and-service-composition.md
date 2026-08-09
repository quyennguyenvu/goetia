# Home screen and service composition implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the welcome screen a reachable Home surface that owns service
composition, reached by a rail sigil and `⌘/Ctrl 0`, and stop any code path
from showing a service view while a shell surface is on screen.

**Architecture:** `homeOpen` joins `switcherOpen` and `settingsOpen` as a
session-only boolean on `MainState`, broadcast in `ShellState`; the renderer
derives `showWelcome = homeOpen || allDisabled`. A pure `anyOverlayOpen()`
predicate gates the one call that makes a view visible, so activation
resolution and view presentation stop being the same action. Service
enable/disable moves out of the Settings modal into Welcome, whose picker
seeds from live state and whose confirm button names the delta.

**Tech Stack:** Electron 43, TypeScript, React 19 + Zustand, Tailwind v4,
vitest (unit), Playwright (e2e), Biome (lint).

Spec: `docs/superpowers/specs/2026-08-09-home-screen-and-service-composition-design.md`

## Global Constraints

- Shell window keeps `contextIsolation: true` + `sandbox: true`; service views
  keep `contextIsolation: false` + `sandbox: false`. Never change either.
- `src/shared/**` stays process-agnostic: no `electron` import, no DOM import.
- Every new IPC channel is registered through the `register()` wrapper in
  `ipc-handlers.ts` and MUST be classified. `home:setOpen` carries no
  `serviceId`, so it goes in `SHELL_ONLY_CHANNELS` in `src/shared/ipc.ts`.
- Pure decision logic lives in a `lib/` helper with a vitest unit test;
  `views.ts` / `index.ts` / `ipc-handlers.ts` stay thin wiring.
- No `innerHTML` / `dangerouslySetInnerHTML` in the shell; renderer CSP is
  unchanged.
- Exact copy strings, used verbatim: `Summon N services`, `Summon 1 service`,
  `Banish N services`, `Banish 1 service`, `Summon N · Banish M` (middle dot
  U+00B7), `No changes`, `Summon 0 services`, `Home — all services (⌘0)`,
  `Manage services…`, `Pick at least one — come back here anytime with ⌘/Ctrl 0.`
- Accelerator is `CmdOrCtrl+0`, registered as an app-menu accelerator. Never
  `globalShortcut`.
- `homeOpen` is never persisted to `settings.json`.
- Definition of done for the whole plan: `corepack pnpm lint`, `corepack pnpm
  typecheck`, `corepack pnpm test`, and `env -u ELECTRON_RUN_AS_NODE corepack
  pnpm e2e` all green.
- **Commits:** this repository's owner commits only through the `/commit`
  command after confirming the message. At every "Checkpoint" step, stop and
  ask the user to run `/commit`. Never run `git commit` yourself.

---

## File Structure

| File | Responsibility |
| --- | --- |
| `src/main/lib/overlay-rules.ts` (new) | Pure `anyOverlayOpen()` predicate |
| `src/shared/ipc.ts` | `home:setOpen` channel + shell-only classification |
| `src/shared/types.ts` | `homeOpen` on `ShellState` |
| `src/shared/welcome.ts` | `summonDelta()` + `summonLabel()` beside `buildDisabledPatch()` |
| `src/main/state.ts` | `homeOpen` field + snapshot |
| `src/main/activate.ts` | Clear `homeOpen` on every service switch |
| `src/main/views.ts` | `activate(id, { show })` — resolve without revealing |
| `src/main/ipc-handlers.ts` | `home:setOpen` handler; overlay-gated activation |
| `src/main/index.ts` | Overlay guards gain `homeOpen` |
| `src/main/menu.ts` | `Go → Home` with `CmdOrCtrl+0` |
| `src/renderer/src/App.tsx` | `showWelcome = homeOpen \|\| allDisabled` |
| `src/renderer/src/components/Rail.tsx` | Leading sigil button + divider |
| `src/renderer/src/components/ServiceTile.tsx` | `data-testid="service-tile"` |
| `src/renderer/src/components/Welcome.tsx` | Seeded picker, delta CTA, Escape |
| `src/renderer/src/components/SettingsView.tsx` | Services pane rework |

---

## Task 1: `anyOverlayOpen` predicate

**Files:**

- Create: `src/main/lib/overlay-rules.ts`
- Test: `tests/unit/overlay-rules.test.ts`

**Interfaces:**

- Consumes: nothing.
- Produces: `anyOverlayOpen(s: { settingsOpen: boolean; switcherOpen: boolean;
  homeOpen: boolean }): boolean` — used by Task 3.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/overlay-rules.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { anyOverlayOpen } from '../../src/main/lib/overlay-rules';

const flags = (patch: Partial<Parameters<typeof anyOverlayOpen>[0]> = {}) => ({
  settingsOpen: false,
  switcherOpen: false,
  homeOpen: false,
  ...patch,
});

describe('anyOverlayOpen', () => {
  it('is false when every surface is closed', () => {
    expect(anyOverlayOpen(flags())).toBe(false);
  });

  it('is true for settings alone', () => {
    expect(anyOverlayOpen(flags({ settingsOpen: true }))).toBe(true);
  });

  it('is true for the quick switcher alone', () => {
    expect(anyOverlayOpen(flags({ switcherOpen: true }))).toBe(true);
  });

  it('is true for home alone', () => {
    expect(anyOverlayOpen(flags({ homeOpen: true }))).toBe(true);
  });

  it('is true when several are open at once', () => {
    expect(anyOverlayOpen(flags({ homeOpen: true, settingsOpen: true }))).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `corepack pnpm vitest run tests/unit/overlay-rules.test.ts`

Expected: FAIL — `Failed to resolve import
"../../src/main/lib/overlay-rules"`.

- [ ] **Step 3: Write the implementation**

Create `src/main/lib/overlay-rules.ts`:

```ts
/** Any shell-rendered surface that a service view would cover. A visible
 *  WebContentsView is layered above the renderer, so activating one while a
 *  surface is up buries it and steals the keyboard. */
export function anyOverlayOpen(s: {
  settingsOpen: boolean;
  switcherOpen: boolean;
  homeOpen: boolean;
}): boolean {
  return s.settingsOpen || s.switcherOpen || s.homeOpen;
}
```

- [ ] **Step 4: Run the test and confirm it passes**

Run: `corepack pnpm vitest run tests/unit/overlay-rules.test.ts`

Expected: PASS — 5 passed.

- [ ] **Step 5: Checkpoint**

Stop. Report the passing test and ask the user to run `/commit`. Suggested
subject: `feat(main): add anyOverlayOpen predicate`.

---

## Task 2: `homeOpen` state, channel, and guards

**Files:**

- Modify: `src/shared/types.ts` (`ShellState`)
- Modify: `src/shared/ipc.ts`
- Modify: `src/main/state.ts:18` and `src/main/state.ts:75-91`
- Modify: `src/main/activate.ts:7-18`
- Modify: `src/main/ipc-handlers.ts:79-84`
- Modify: `src/main/index.ts:109` and `src/main/index.ts:147`
- Test: `tests/unit/activate.test.ts`

**Interfaces:**

- Consumes: nothing from Task 1.
- Produces: `MainState.homeOpen: boolean`; `ShellState.homeOpen: boolean`;
  IPC channel `'home:setOpen': { open: boolean }`. Tasks 3, 5, 6, 7, 8 read
  these.

- [ ] **Step 1: Write the failing test**

Append to `tests/unit/activate.test.ts` inside the existing
`describe('activateService', …)` block:

```ts
  it('leaves home when a service is activated', () => {
    const state = new MainState();
    state.homeOpen = true;
    state.settingsOpen = true;
    state.switcherOpen = true;
    activateService(makeCtx(state), 'zalo');
    expect(state.homeOpen).toBe(false);
    expect(state.settingsOpen).toBe(false);
    expect(state.switcherOpen).toBe(false);
  });
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `corepack pnpm vitest run tests/unit/activate.test.ts`

Expected: FAIL — `expected true to be false` on the `homeOpen` assertion.
(vitest transpiles without typechecking, so the unknown property assignment
runs fine; it is `activateService` not clearing the flag that fails.)

- [ ] **Step 3: Add the state field and the snapshot entry**

In `src/main/state.ts`, beside the existing flags:

```ts
  switcherOpen = false;
  settingsOpen = false;
  /** Home (the welcome screen) is a shell surface, not a persisted
   *  preference: a restart lands on the active service. */
  homeOpen = false;
```

and in `snapshot()`, beside `settingsOpen`:

```ts
      switcherOpen: this.switcherOpen,
      settingsOpen: this.settingsOpen,
      homeOpen: this.homeOpen,
```

In `src/shared/types.ts`, add to `ShellState` after `settingsOpen`:

```ts
  settingsOpen: boolean;
  homeOpen: boolean;
```

- [ ] **Step 4: Clear the flag on activation**

In `src/main/activate.ts`, extend the existing reset:

```ts
export function activateService(ctx: AppContext, id: ServiceId): void {
  ctx.state.settingsOpen = false;
  ctx.state.switcherOpen = false;
  ctx.state.homeOpen = false;
  ctx.state.activeId = id;
```

Leave the rest of the function unchanged.

- [ ] **Step 5: Run the test and confirm it passes**

Run: `corepack pnpm vitest run tests/unit/activate.test.ts`

Expected: PASS — 3 passed.

- [ ] **Step 6: Register the IPC channel**

In `src/shared/ipc.ts`, add to `RendererToMain` after `'settings:setOpen'`:

```ts
  'settings:setOpen': { open: boolean };
  'home:setOpen': { open: boolean };
```

add to `R2M_CHANNELS` after `'settings:setOpen'`:

```ts
  'settings:setOpen',
  'home:setOpen',
```

and add to `SHELL_ONLY_CHANNELS` after `'settings:setOpen'`:

```ts
  'settings:setOpen',
  'home:setOpen',
```

- [ ] **Step 7: Add the handler**

In `src/main/ipc-handlers.ts`, immediately after the `settings:setOpen`
handler:

```ts
  on('home:setOpen', ({ open }) => {
    ctx.state.homeOpen = open;
    if (open) ctx.views.hideActive();
    else ctx.views.showActive();
    ctx.state.touch();
    // so Escape and the accelerators reach the shell, not the buried view
    if (open) ctx.win.webContents.focus();
  });
```

- [ ] **Step 8: Extend the two overlay guards**

In `src/main/index.ts`, line 109:

```ts
      const show =
        rt.waking && !rt.crashed && !state.switcherOpen && !state.settingsOpen && !state.homeOpen;
```

and line 147:

```ts
    win.on('focus', () => {
      if (!state.switcherOpen && !state.settingsOpen && !state.homeOpen) views.focusActive();
    });
```

- [ ] **Step 9: Verify the suite and types**

Run: `corepack pnpm typecheck && corepack pnpm test`

Expected: typecheck clean; all vitest files pass.

- [ ] **Step 10: Checkpoint**

Stop and ask the user to run `/commit`. Suggested subject:
`feat(main): add homeOpen shell surface state and channel`.

---

## Task 3: Resolve activation without revealing the view

**Files:**

- Modify: `src/main/views.ts:167-182`
- Modify: `src/main/ipc-handlers.ts:110-120`
- Test: `tests/unit/overlay-rules.test.ts` (already covers the predicate)

**Interfaces:**

- Consumes: `anyOverlayOpen` (Task 1); `MainState.homeOpen` (Task 2).
- Produces: `ServiceViewManager.activate(id: ServiceId, opts?: { show?:
  boolean }): void`, `show` defaulting to `true`. No other call site changes.

- [ ] **Step 1: Add the visibility argument**

In `src/main/views.ts`, replace the `activate` method:

```ts
  /** `show: false` resolves activation without presenting: the view is
   *  created and z-ordered but stays hidden and unfocused, so a shell
   *  surface (settings, switcher, home) is never buried by it. */
  activate(id: ServiceId, { show = true }: { show?: boolean } = {}): void {
    const view = this.views.get(id) ?? this.create(id);
    for (const [otherId, v] of this.views) {
      if (otherId !== id) v.setVisible(false);
    }
    // always re-add: moves the active view to the top of the z-order, so a
    // flashed keep-alive view (attached at index 0) stays covered
    this.win.contentView.addChildView(view);
    view.setVisible(show);
    // a covering loading overlay must outrank the view we just re-added
    this.overlay?.raise();
    this.activeId = id;
    this.layout();
    // keyboard (incl. Tab) goes into the service, not the shell rail
    if (show) view.webContents.focus();
  }
```

- [ ] **Step 2: Gate the disabled-patch activation**

In `src/main/ipc-handlers.ts`, add the import beside the existing
`resolveActivation` import:

```ts
import { resolveActivation } from './lib/activation-rules';
import { isSafeExternalUrl } from './lib/external-url';
import { ipcSenderAllowed } from './lib/ipc-sender-policy';
import { anyOverlayOpen } from './lib/overlay-rules';
```

then replace the activation block inside the `patch.disabled` branch:

```ts
      if (next) {
        ctx.state.activeId = next;
        ctx.noteActivated(next);
        // Resolve now, present later. Showing a view here would cover the
        // surface the user is standing on — this is the settings-modal bug.
        ctx.views.activate(next, { show: !anyOverlayOpen(ctx.state) });
      }
```

- [ ] **Step 3: Verify nothing else regressed**

Run: `corepack pnpm typecheck && corepack pnpm test`

Expected: typecheck clean; all tests pass, including
`tests/unit/activate.test.ts` whose `expect(activate).toHaveBeenCalledWith(
'telegram')` still holds because `activate.ts` passes no options.

- [ ] **Step 4: Verify the bug is actually dead**

Run: `env -u ELECTRON_RUN_AS_NODE corepack pnpm e2e`

Expected: all existing specs pass. (The user-visible proof arrives with the
Home e2e spec in Task 9; this run is a regression guard for the signature
change.)

- [ ] **Step 5: Checkpoint**

Stop and ask the user to run `/commit`. Suggested subject:
`fix(main): never reveal a service view over a shell surface`.

---

## Task 4: `summonDelta` and the confirm label

**Files:**

- Modify: `src/shared/welcome.ts`
- Test: `tests/unit/welcome.test.ts` (create if absent; otherwise append)

**Interfaces:**

- Consumes: nothing.
- Produces, both used by Task 7:

```ts
summonDelta(
  order: ServiceId[],
  enabled: ReadonlySet<ServiceId>,
  selected: ReadonlySet<ServiceId>,
): { add: ServiceId[]; remove: ServiceId[] };

summonLabel(
  delta: { add: ServiceId[]; remove: ServiceId[] },
  hasEnabled: boolean,
): { label: string; disabled: boolean };
```

- [ ] **Step 1: Write the failing test**

Create `tests/unit/welcome.test.ts` (if the file already exists, append the
two `describe` blocks below):

```ts
import { describe, expect, it } from 'vitest';
import { summonDelta, summonLabel } from '../../src/shared/welcome';
import { DEFAULT_SETTINGS, type ServiceId } from '../../src/shared/types';

const order = DEFAULT_SETTINGS.order;
const set = (...ids: ServiceId[]) => new Set<ServiceId>(ids);
const label = (enabled: ServiceId[], selected: ServiceId[]) =>
  summonLabel(summonDelta(order, set(...enabled), set(...selected)), enabled.length > 0);

describe('summonDelta', () => {
  it('reports additions in rail order', () => {
    expect(summonDelta(order, set('messenger'), set('messenger', 'zalo', 'telegram'))).toEqual({
      add: ['telegram', 'zalo'],
      remove: [],
    });
  });

  it('reports removals', () => {
    expect(summonDelta(order, set('messenger', 'zalo'), set('zalo'))).toEqual({
      add: [],
      remove: ['messenger'],
    });
  });

  it('reports both halves of a mixed change', () => {
    expect(summonDelta(order, set('messenger', 'zalo'), set('zalo', 'discord'))).toEqual({
      add: ['discord'],
      remove: ['messenger'],
    });
  });

  it('reports nothing when the selection matches the live set', () => {
    expect(summonDelta(order, set('messenger', 'zalo'), set('zalo', 'messenger'))).toEqual({
      add: [],
      remove: [],
    });
  });
});

describe('summonLabel', () => {
  it('invites a pick on a fresh install', () => {
    expect(label([], [])).toEqual({ label: 'Summon 0 services', disabled: true });
  });

  it('counts the first summoning', () => {
    expect(label([], ['messenger', 'zalo', 'telegram'])).toEqual({
      label: 'Summon 3 services',
      disabled: false,
    });
  });

  it('goes quiet when nothing is staged', () => {
    expect(label(['messenger', 'zalo', 'telegram'], ['messenger', 'zalo', 'telegram'])).toEqual({
      label: 'No changes',
      disabled: true,
    });
  });

  it('names additions', () => {
    expect(label(['messenger'], ['messenger', 'zalo', 'telegram'])).toEqual({
      label: 'Summon 2 services',
      disabled: false,
    });
  });

  it('names a single banishment in the singular', () => {
    expect(label(['messenger', 'zalo'], ['zalo'])).toEqual({
      label: 'Banish 1 service',
      disabled: false,
    });
  });

  it('names both halves of a mixed change', () => {
    expect(label(['messenger', 'zalo'], ['zalo', 'discord', 'telegram'])).toEqual({
      label: 'Summon 2 · Banish 1',
      disabled: false,
    });
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `corepack pnpm vitest run tests/unit/welcome.test.ts`

Expected: FAIL — `summonDelta is not exported`.

- [ ] **Step 3: Write the implementation**

Append to `src/shared/welcome.ts`:

```ts
export interface SummonDelta {
  add: ServiceId[];
  remove: ServiceId[];
}

/** What a welcome-screen confirm would change, in rail order. */
export function summonDelta(
  order: ServiceId[],
  enabled: ReadonlySet<ServiceId>,
  selected: ReadonlySet<ServiceId>,
): SummonDelta {
  return {
    add: order.filter((id) => selected.has(id) && !enabled.has(id)),
    remove: order.filter((id) => enabled.has(id) && !selected.has(id)),
  };
}

const services = (n: number): string => `${n} ${n === 1 ? 'service' : 'services'}`;

/** The confirm button names the change it is about to apply: banishing a
 *  service tears down a logged-in view, which deserves its own word. */
export function summonLabel(
  delta: SummonDelta,
  hasEnabled: boolean,
): { label: string; disabled: boolean } {
  const { add, remove } = delta;
  if (add.length > 0 && remove.length > 0) {
    return { label: `Summon ${add.length} · Banish ${remove.length}`, disabled: false };
  }
  if (add.length > 0) return { label: `Summon ${services(add.length)}`, disabled: false };
  if (remove.length > 0) return { label: `Banish ${services(remove.length)}`, disabled: false };
  return { label: hasEnabled ? 'No changes' : 'Summon 0 services', disabled: true };
}
```

- [ ] **Step 4: Run the test and confirm it passes**

Run: `corepack pnpm vitest run tests/unit/welcome.test.ts`

Expected: PASS — 10 passed.

- [ ] **Step 5: Checkpoint**

Stop and ask the user to run `/commit`. Suggested subject:
`feat(shared): add summonDelta and the delta-named confirm label`.

---

## Task 5: The rail sigil

**Files:**

- Modify: `src/renderer/src/components/Rail.tsx`
- Modify: `src/renderer/src/components/ServiceTile.tsx:42-59`
- Modify: `src/renderer/src/App.tsx:33-44`
- Modify: `tests/e2e/smoke.spec.ts:38`
- Modify: `tests/e2e/welcome.spec.ts:25,39,47`

**Interfaces:**

- Consumes: `ShellState.homeOpen` and channel `home:setOpen` (Task 2).
- Produces: DOM contract for Task 9 — `[data-testid="home-btn"]` in the rail,
  `[data-testid="service-tile"]` on every service tile.

- [ ] **Step 1: Tag service tiles so counting them stays unambiguous**

The sigil is a rail button and would otherwise be counted by the existing
`button[aria-label]` selectors. In `src/renderer/src/components/ServiceTile.tsx`,
add one attribute to the `<button>`:

```tsx
    <button
      type="button"
      data-testid="service-tile"
      draggable
```

- [ ] **Step 2: Update the three existing e2e selectors**

`tests/e2e/smoke.spec.ts` line 38:

```ts
  await expect(win.locator('[data-testid="service-tile"]')).toHaveCount(2);
```

`tests/e2e/welcome.spec.ts` line 25:

```ts
  const tiles = win.locator('[data-testid="service-tile"]');
```

`tests/e2e/welcome.spec.ts` line 39:

```ts
  await expect(win.locator('[data-testid="service-tile"][aria-current="page"]')).toHaveAttribute(
    'aria-label',
    'Zalo',
  );
```

`tests/e2e/welcome.spec.ts` line 47:

```ts
  await expect(second.win.locator('[data-testid="service-tile"]')).toHaveCount(1);
```

`tests/e2e/smoke.spec.ts` line 63 and 68 use `rail.locator('button[aria-current
="page"]')`; the sigil only carries `aria-current` while Home is open, and that
spec never opens Home, so leave those two lines alone.

- [ ] **Step 3: Add the sigil to the rail**

In `src/renderer/src/components/Rail.tsx`, add the import:

```tsx
import { useShell } from '../store';
import Portal from './Portal';
import ServiceTile from './ServiceTile';
```

then insert, immediately before `{visible.map(…)}`:

```tsx
      <button
        type="button"
        data-testid="home-btn"
        aria-label="Home"
        aria-current={state.homeOpen ? 'page' : undefined}
        title="Home — all services (⌘0)"
        onClick={() => window.goetia.send('home:setOpen', { open: !state.homeOpen })}
        className={`flex h-8 w-8 flex-none items-center justify-center rounded-[11px]
          transition-all duration-150 ease-out outline-none focus-visible:ring-2
          focus-visible:ring-accent ${
            state.homeOpen ? 'bg-bg-2 opacity-100' : 'opacity-60 hover:opacity-100'
          }`}
      >
        <Portal className="h-[22px] w-[22px]" />
      </button>
      <div
        aria-hidden="true"
        className={horizontal ? 'h-5 w-px flex-none bg-border' : 'h-px w-6 flex-none bg-border'}
      />
```

- [ ] **Step 4: Stop tiles reading as current while Home is up**

In the same file, in the `ServiceTile` props:

```tsx
          active={!state.homeOpen && state.activeId === svc.id}
```

- [ ] **Step 5: Render Welcome when Home is open**

In `src/renderer/src/App.tsx`, replace the `allDisabled` derivation and its use:

```tsx
  const allDisabled = state
    ? state.services.every((svc) => state.settings.disabled[svc.id])
    : false;
  const showWelcome = (state?.homeOpen ?? false) || allDisabled;
```

```tsx
        {showWelcome ? <Welcome /> : <ContentPlaceholder />}
```

- [ ] **Step 6: Verify**

Run: `corepack pnpm lint && corepack pnpm typecheck && env -u
ELECTRON_RUN_AS_NODE corepack pnpm e2e`

Expected: lint and typecheck clean; `smoke`, `welcome`, `loading`, and
`updates` specs all pass with the retargeted selectors.

- [ ] **Step 7: Checkpoint**

Stop and ask the user to run `/commit`. Suggested subject:
`feat(renderer): add the home sigil to the rail`.

---

## Task 6: The `⌘/Ctrl 0` accelerator

**Files:**

- Modify: `src/main/menu.ts:51-84`
- Modify: `src/renderer/src/components/SettingsView.tsx:319-331` (Shortcuts pane)

**Interfaces:**

- Consumes: `MainState.homeOpen` (Task 2), `views.hideActive/showActive`.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Add the menu item**

In `src/main/menu.ts`, add a helper beside `openSettings`:

```ts
function toggleHome(ctx: AppContext): void {
  const open = !ctx.state.homeOpen;
  ctx.state.homeOpen = open;
  if (open) ctx.views.hideActive();
  else ctx.views.showActive();
  ctx.state.touch();
  ctx.win.webContents.focus();
}
```

then make it the head of the `Go` submenu, before the service items:

```ts
      label: 'Go',
      submenu: [
        {
          label: 'Home',
          accelerator: 'CmdOrCtrl+0',
          click: () => {
            ctx.win.show();
            toggleHome(ctx);
          },
        },
        { type: 'separator' as const },
        ...order.map((id, i) => ({
```

Leave the rest of the submenu unchanged. A plain item, not a checkbox:
`buildAppMenu` rebuilds only on order and disabled changes, so a checkmark
would go stale.

- [ ] **Step 2: Document it in the Shortcuts pane**

In `src/renderer/src/components/SettingsView.tsx`, inside the `shortcuts`
pane, after the `⌘/Ctrl + K` line:

```tsx
                  <p className="py-1">⌘/Ctrl + 0 — home / all services</p>
```

- [ ] **Step 3: Verify by hand**

Run: `corepack pnpm dev`

Check, in order:

1. `⌘0` from inside a service view shows the welcome screen and the service
   view disappears (not merely covered — the rail is fully interactive).
2. `⌘0` again returns to the same service.
3. `Go → Home` shows the accelerator `⌘0` next to the label.
4. `⌘1` from Home lands on the first service and leaves Home.

- [ ] **Step 4: Verify the suite**

Run: `corepack pnpm lint && corepack pnpm typecheck && corepack pnpm test`

Expected: all clean.

- [ ] **Step 5: Checkpoint**

Stop and ask the user to run `/commit`. Suggested subject:
`feat(main): add the Home menu item and ⌘0 accelerator`.

---

## Task 7: Welcome seeds from live state and names its delta

**Files:**

- Modify: `src/renderer/src/components/Welcome.tsx`

**Interfaces:**

- Consumes: `summonDelta`, `summonLabel` (Task 4); `buildDisabledPatch`
  (existing); `ShellState.homeOpen` (Task 2).
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Seed the picker from the enabled set**

In `src/renderer/src/components/Welcome.tsx`, replace the imports and the
component's state setup:

```tsx
import type React from 'react';
import { useEffect, useState } from 'react';
import type { ServiceId, ServiceMeta } from '../../../shared/types';
import { buildDisabledPatch, summonDelta, summonLabel } from '../../../shared/welcome';
import { useShell } from '../store';
import Portal from './Portal';
```

```tsx
export default function Welcome() {
  const state = useShell((s) => s.state);
  const enabledKey = state
    ? state.services
        .filter((svc) => !state.settings.disabled[svc.id])
        .map((svc) => svc.id)
        .join(',')
    : '';
  const [selected, setSelected] = useState<ReadonlySet<ServiceId>>(new Set());

  // Re-seed every time the screen becomes visible or the live set changes, so
  // a discarded edit never survives to the next visit. A fresh install has an
  // empty enabled set, which reproduces the original empty selection.
  useEffect(() => {
    setSelected(new Set(enabledKey ? (enabledKey.split(',') as ServiceId[]) : []));
  }, [enabledKey]);

  if (!state) return null;
```

- [ ] **Step 2: Let Escape leave Home**

Add a second effect directly below the seeding effect and **above** the
`if (!state) return null;` guard — an early return between hooks would break
the rules of hooks:

```tsx
  // Home is a place, not a modal — but Escape is the reflex. Guarded the way
  // SettingsView guards its own handler: only when nothing is layered on top,
  // and never when there is no service to go back to.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      const s = useShell.getState().state;
      if (!s?.homeOpen || s.settingsOpen || s.switcherOpen) return;
      if (s.services.every((svc) => s.settings.disabled[svc.id])) return;
      window.goetia.send('home:setOpen', { open: false });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
```

- [ ] **Step 3: Wire the delta-named confirm**

Replace the `summon` function, the `n` constant, the hint line, and the
button:

```tsx
  const enabled = new Set<ServiceId>(
    state.services.filter((svc) => !state.settings.disabled[svc.id]).map((svc) => svc.id),
  );
  const order = state.services.map((svc) => svc.id);
  const { label, disabled } = summonLabel(
    summonDelta(order, enabled, selected),
    enabled.size > 0,
  );

  const summon = () =>
    window.goetia.send('settings:update', { disabled: buildDisabledPatch(order, selected) });
```

```tsx
      <p className="text-xs text-text-2">
        Pick at least one — come back here anytime with ⌘/Ctrl 0.
      </p>
      <button
        type="button"
        disabled={disabled}
        onClick={summon}
        className="tabular rounded-ctl bg-linear-to-br from-[#FFB43D] via-[#FF8A2A] to-[#F04E3E]
          px-6 py-2 font-semibold text-[#15181F] shadow-[0_0_12px_rgba(255,158,44,0.35)]
          transition-opacity duration-150 enabled:hover:opacity-90 disabled:opacity-40
          disabled:shadow-none"
      >
        {label}
      </button>
```

- [ ] **Step 4: Update the third tip card**

Replace the `Quick keys` card body:

```tsx
        <Tip
          icon={<KeysIcon />}
          title="Quick keys"
          body="⌘/Ctrl K switcher · ⌘/Ctrl 0 home · right-click mutes."
        />
```

- [ ] **Step 5: Verify by hand**

Run: `corepack pnpm dev`

Check, in order:

1. `⌘0` with three services enabled shows three lit tiles and a disabled
   `No changes` button.
2. Lighting two more reads `Summon 2 services`; confirming applies, the rail
   grows two tiles, and the button falls back to `No changes` while Welcome
   stays on screen.
3. Dimming the **active** service reads `Banish 1 service`; confirming removes
   its tile and **no service view appears over Welcome**.
4. A mixed edit reads `Summon 2 · Banish 1`.
5. Staging a change then pressing `Escape` leaves Home; reopening shows the
   live set again, not the discarded edit.

- [ ] **Step 6: Verify the suite**

Run: `corepack pnpm lint && corepack pnpm typecheck && corepack pnpm test &&
env -u ELECTRON_RUN_AS_NODE corepack pnpm e2e`

Expected: all clean. `tests/e2e/welcome.spec.ts` still passes — on a fresh
profile the enabled set is empty, so the seeded selection is empty and the
button still reads `Summon 1 service` after picking Zalo.

- [ ] **Step 7: Checkpoint**

Stop and ask the user to run `/commit`. Suggested subject:
`feat(renderer): seed the welcome picker and name its delta`.

---

## Task 8: Settings gives up composition

**Files:**

- Modify: `src/renderer/src/components/SettingsView.tsx:243-303`

**Interfaces:**

- Consumes: channel `home:setOpen` (Task 2).
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Rework the Services pane**

In `src/renderer/src/components/SettingsView.tsx`, replace the whole
`{active === 'services' && (…)}` block:

```tsx
            {active === 'services' && (
              <Pane title="Services">
                {state.services
                  .filter((svc) => !s.disabled[svc.id])
                  .map((svc) => (
                    <div
                      key={svc.id}
                      className="flex items-center justify-between gap-4 border-b border-border py-2"
                    >
                      <span className="text-text-1">{svc.name}</span>
                      <span className="flex items-center gap-4 text-text-2">
                        <label className="flex items-center gap-1.5">
                          <input
                            type="checkbox"
                            checked={s.muted[svc.id]}
                            onChange={(e) =>
                              window.goetia.send('service:setMuted', {
                                serviceId: svc.id,
                                muted: e.target.checked,
                              })
                            }
                          />
                          mute
                        </label>
                        <label className="flex items-center gap-1.5">
                          <input
                            type="checkbox"
                            checked={s.neverHibernate[svc.id]}
                            onChange={(e) =>
                              update({
                                neverHibernate: { ...s.neverHibernate, [svc.id]: e.target.checked },
                              })
                            }
                          />
                          never hibernate
                        </label>
                        <button
                          type="button"
                          className="rounded-ctl border border-border px-2 py-0.5 hover:bg-bg-2"
                          onClick={() =>
                            window.goetia.send('service:reload', { serviceId: svc.id })
                          }
                        >
                          reload
                        </button>
                      </span>
                    </div>
                  ))}
                {/* composition lives on Home: an enable toggle behind a modal
                    is what let a view bury the modal it was toggled from */}
                <div className="flex items-center justify-between gap-4 py-2.5">
                  <span className="text-text-2">Add or remove services</span>
                  <button
                    type="button"
                    data-testid="manage-services"
                    onClick={() => {
                      window.goetia.send('settings:setOpen', { open: false });
                      window.goetia.send('home:setOpen', { open: true });
                    }}
                    className="rounded-ctl border border-border bg-bg-2 px-3 py-1 text-text-1 transition-colors duration-120 hover:border-accent"
                  >
                    Manage services…
                  </button>
                </div>
              </Pane>
            )}
```

- [ ] **Step 2: Verify by hand**

Run: `corepack pnpm dev`

Check, in order:

1. `⌘,` → Services lists only enabled services, with no `enabled` checkbox.
2. `Manage services…` closes Settings and lands on Welcome in one step.
3. Mute, never hibernate, and reload still work from the pane.

- [ ] **Step 3: Verify the suite**

Run: `corepack pnpm lint && corepack pnpm typecheck && corepack pnpm test`

Expected: all clean.

- [ ] **Step 4: Checkpoint**

Stop and ask the user to run `/commit`. Suggested subject:
`refactor(renderer): move service composition out of Settings`.

---

## Task 9: End-to-end coverage for Home

**Files:**

- Create: `tests/e2e/home.spec.ts`

**Interfaces:**

- Consumes: `[data-testid="home-btn"]`, `[data-testid="service-tile"]`
  (Task 5), `[data-testid="manage-services"]` (Task 8),
  `[data-testid="welcome"]` and `[data-testid="settings"]` (existing).
- Produces: nothing.

- [ ] **Step 1: Write the failing spec**

Create `tests/e2e/home.spec.ts`:

```ts
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { _electron as electron, expect, test } from '@playwright/test';

const isShell = (p: { url(): string }) =>
  p.url().startsWith('file://') && !p.url().includes('loading.html');

async function launch() {
  const profile = mkdtempSync(join(tmpdir(), 'goetia-e2e-'));
  writeFileSync(
    join(profile, 'settings.json'),
    JSON.stringify({
      disabled: {
        whatsapp: true,
        messenger: false,
        telegram: true,
        discord: true,
        zalo: false,
        tiktok: true,
        shopee: true,
      },
    }),
  );
  const app = await electron.launch({
    args: ['out/main/index.js', '--goetia-e2e', `--goetia-user-data=${profile}`],
  });
  const win =
    app.windows().find(isShell) ?? (await app.waitForEvent('window', { predicate: isShell }));
  return { app, win };
}

test('home: sigil toggles welcome and seeds the live selection', async () => {
  const { app, win } = await launch();
  const welcome = win.locator('[data-testid="welcome"]');
  const home = win.locator('[data-testid="home-btn"]');

  await expect(win.locator('[data-testid="service-tile"]')).toHaveCount(2);
  await expect(welcome).toHaveCount(0);

  await home.click();
  await expect(welcome).toBeVisible();
  // seeded: the two enabled services arrive already selected, so the confirm
  // button has nothing to do
  await expect(welcome.getByRole('button', { name: 'Messenger' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(welcome.getByRole('button', { name: 'Telegram' })).toHaveAttribute(
    'aria-pressed',
    'false',
  );
  await expect(win.getByRole('button', { name: 'No changes' })).toBeDisabled();

  // toggling back off returns to the service
  await home.click();
  await expect(welcome).toHaveCount(0);
  await app.close();
});

test('home: banishing the active service leaves welcome on screen', async () => {
  const { app, win } = await launch();
  const welcome = win.locator('[data-testid="welcome"]');

  await expect(win.locator('[data-testid="service-tile"][aria-current="page"]')).toHaveAttribute(
    'aria-label',
    'Messenger',
  );

  await win.locator('[data-testid="home-btn"]').click();
  await welcome.getByRole('button', { name: 'Messenger' }).click();

  const confirm = win.getByRole('button', { name: 'Banish 1 service' });
  await expect(confirm).toBeEnabled();
  await confirm.click();

  // the regression this whole plan exists for: no service view may take over
  await expect(welcome).toBeVisible();
  await expect(win.locator('[data-testid="service-tile"]')).toHaveCount(1);
  await expect(win.getByRole('button', { name: 'No changes' })).toBeDisabled();
  await app.close();
});

test('settings: composition is gone, Manage services… lands on home', async () => {
  const { app, win } = await launch();

  await win.locator('[data-testid="settings-btn"]').click();
  await win.locator('[data-testid="settings-nav-services"]').click();

  const pane = win.locator('[data-testid="settings"]');
  await expect(pane.getByText('enabled')).toHaveCount(0);
  // only the two enabled services are listed
  await expect(pane.getByText('never hibernate')).toHaveCount(2);

  await win.locator('[data-testid="manage-services"]').click();
  await expect(pane).toHaveCount(0);
  await expect(win.locator('[data-testid="welcome"]')).toBeVisible();
  await app.close();
});
```

- [ ] **Step 2: Run the spec**

Run: `env -u ELECTRON_RUN_AS_NODE corepack pnpm e2e home.spec.ts`

Expected: 3 passed. If a Playwright run reports `ELECTRON_RUN_AS_NODE` errors,
the `env -u` prefix was dropped — VS Code shells export that variable.

- [ ] **Step 3: Run everything**

Run: `corepack pnpm lint && corepack pnpm typecheck && corepack pnpm test &&
env -u ELECTRON_RUN_AS_NODE corepack pnpm e2e`

Expected: all four green.

- [ ] **Step 4: Checkpoint**

Stop and ask the user to run `/commit`. Suggested subject:
`test(e2e): cover the home surface and settings composition move`.

---

## Task 10: Update the engineering guardrails

**Files:**

- Modify: `CLAUDE.md`

**Interfaces:**

- Consumes: everything above.
- Produces: nothing.

- [ ] **Step 1: Record the new invariant**

In `CLAUDE.md`, under **Process boundaries (never weaken)**, add:

```markdown
- Service views are layered above the shell renderer, so a visible view
  covers any shell surface. No code path may make a view visible while
  `anyOverlayOpen()` is true (settings, quick switcher, home) — resolve
  activation with `views.activate(id, { show: false })` and let
  `showActive()` present it when the surface closes.
```

- [ ] **Step 2: Record where composition lives**

Under **Product principle: chat ONLY**, add:

```markdown
- Enabling and disabling services lives on Home (the welcome screen),
  reachable from the rail sigil and `⌘/Ctrl 0`. Settings never gets an
  enable toggle back: composition behind a modal is what let a service view
  bury the modal it was toggled from.
```

- [ ] **Step 3: Verify the file lints**

Run: `npx markdownlint-cli2 CLAUDE.md`

Expected: `0 issues`.

- [ ] **Step 4: Checkpoint**

Stop and ask the user to run `/commit`. Suggested subject:
`docs(claude): record the overlay and composition invariants`.
