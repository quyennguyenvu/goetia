# Restore the last active service implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Quitting on Discord and reopening lands on Discord — the app records the surface you left (a service, or Home) and restores it on the next launch.

**Architecture:** Two new `Settings` fields written the moment the surface changes, plus one pure resolver that turns them into a startup decision. `index.ts` stays thin wiring; all branching lives in `src/main/lib/startup-surface.ts` with a unit test, matching how `activation-rules.ts` already works.

**Tech Stack:** Electron 43, TypeScript, `conf` (via `SettingsStore`), vitest for units, Playwright (`_electron`) for e2e.

Spec: `docs/superpowers/specs/2026-08-10-restore-last-active-service-design.md`

## Global Constraints

- Definition of done for every task: `corepack pnpm lint`, `corepack pnpm typecheck`, and `corepack pnpm test` green. Tasks 3 and 4 also need `corepack pnpm e2e`.
- Run e2e as `env -u ELECTRON_RUN_AS_NODE corepack pnpm e2e`. A VS Code integrated shell exports `ELECTRON_RUN_AS_NODE`, which makes Playwright's Electron launch start Node instead of the app.
- **Never run `git commit` yourself.** Every task ends by stopping and asking the user to run `/grimoire-core:commit`, per their global instructions.
- `src/shared/**` stays process-agnostic — no `electron` and no DOM imports. Task 1 touches `src/shared/types.ts` and must keep it import-free.
- No new IPC channel is introduced, so nothing is added to `SHELL_ONLY_CHANNELS`. If a task seems to need one, stop — the design is wrong, not the constraint.
- No code path may make a service view visible while a shell surface is open. Task 4's startup call must pass `{ show: false }` when Home is restored.
- Comments explain *why*, not *what*, and match the density of the file being edited. Do not add section banners or "added X" notes.

## File Structure

| File | Responsibility | Task |
| --- | --- | --- |
| `src/shared/types.ts` | `Settings.lastActiveId` + `lastHomeOpen`, and their defaults | 1 |
| `tests/unit/settings.test.ts` | store round-trip and no-scrub guarantee | 1 |
| `src/main/lib/startup-surface.ts` | **new** — pure launch-surface resolver | 2 |
| `tests/unit/startup-surface.test.ts` | **new** — one case per resolver rule | 2 |
| `src/main/activate.ts` | `rememberSurface` + `setHomeOpen` writers | 3 |
| `src/main/ipc-handlers.ts` | route `home:setOpen`, record after re-homing | 3 |
| `src/main/menu.ts` | route `⌘/Ctrl 0` through `setHomeOpen` | 3 |
| `tests/unit/activate.test.ts` | the two writers record correctly | 3 |
| `src/main/index.ts` | startup wiring | 4 |
| `tests/e2e/restart.spec.ts` | **new** — the real quit-and-reopen loop | 4 |

---

### Task 1: Persist the two fields

`Settings` gains the record. Nothing reads it yet — this task only proves it survives a store round trip and that `normalize()` leaves it alone.

**Files:**

- Modify: `src/shared/types.ts:42-96`
- Test: `tests/unit/settings.test.ts`

**Interfaces:**

- Consumes: nothing.
- Produces: `Settings['lastActiveId']` (`ServiceId | null`, default `null`) and `Settings['lastHomeOpen']` (`boolean`, default `false`). Tasks 2, 3, and 4 all read or write these exact names.

- [ ] **Step 1: Write the failing tests**

Append these three cases inside the existing `describe('SettingsStore', …)` in `tests/unit/settings.test.ts`, after the `persists the last announced version` case:

```ts
  it('starts with no remembered surface', () => {
    dir = mkdtempSync(join(tmpdir(), 'goetia-'));
    const s = new SettingsStore(dir).get();
    expect(s.lastActiveId).toBeNull();
    expect(s.lastHomeOpen).toBe(false);
  });

  it('persists the remembered surface across instances', () => {
    dir = mkdtempSync(join(tmpdir(), 'goetia-'));
    new SettingsStore(dir).update({ lastActiveId: 'discord', lastHomeOpen: true });
    const reread = new SettingsStore(dir).get();
    expect(reread.lastActiveId).toBe('discord');
    expect(reread.lastHomeOpen).toBe(true);
  });

  it('keeps an unknown lastActiveId rather than nulling it', () => {
    dir = mkdtempSync(join(tmpdir(), 'goetia-'));
    writeFileSync(join(dir, 'settings.json'), JSON.stringify({ lastActiveId: 'skype' }));
    // normalize() scrubs order and the boolean records but must not touch this:
    // resolveStartupSurface needs "recorded but gone" to read differently from
    // "never recorded", and only the raw value carries that difference
    expect(new SettingsStore(dir).get().lastActiveId as string).toBe('skype');
  });
```

The `as string` cast is deliberate: `'skype'` is not a `ServiceId`, and the cast is what lets the test assert the un-scrubbed value without widening the production type.

- [ ] **Step 2: Run the tests to verify they fail**

```bash
corepack pnpm vitest run tests/unit/settings.test.ts
```

Expected: the three new cases FAIL. `starts with no remembered surface` fails on `undefined` rather than `null`; the other two fail typecheck-adjacent at runtime because the keys do not exist yet.

- [ ] **Step 3: Add the fields**

In `src/shared/types.ts`, inside `interface Settings`, immediately after the `lastNotifiedVersion: string | null;` line:

```ts
  /** service focused when the app last closed; null until first recorded */
  lastActiveId: ServiceId | null;
  /** Home was the surface on top at close — Settings deliberately is not */
  lastHomeOpen: boolean;
```

And in `DEFAULT_SETTINGS`, immediately after `lastNotifiedVersion: null,`:

```ts
  lastActiveId: null,
  lastHomeOpen: false,
```

Do not touch `normalize()` in `src/main/settings.ts`. Leaving an unknown `lastActiveId` intact is what the third test pins down.

- [ ] **Step 4: Run the tests to verify they pass**

```bash
corepack pnpm vitest run tests/unit/settings.test.ts
```

Expected: PASS, all cases.

- [ ] **Step 5: Full check**

```bash
corepack pnpm lint && corepack pnpm typecheck && corepack pnpm test
```

Expected: all green. `DEFAULT_SETTINGS` is exhaustively typed, so a missed default surfaces here as a typecheck error.

- [ ] **Step 6: Stop and request a commit**

Do not run `git commit`. Stop and ask the user to run `/grimoire-core:commit`, suggesting: `feat(settings): record the last active service and home state`

---

### Task 2: The startup-surface resolver

The whole launch decision, as one pure function with no Electron imports.

**Files:**

- Create: `src/main/lib/startup-surface.ts`
- Test: `tests/unit/startup-surface.test.ts`

**Interfaces:**

- Consumes: `Settings['lastActiveId']` and `Settings['lastHomeOpen']` from Task 1.
- Produces: `resolveStartupSurface(input): StartupSurface` where `StartupSurface = { activeId: ServiceId | null; homeOpen: boolean }` and `input = { order: ServiceId[]; disabled: Settings['disabled']; lastActiveId: ServiceId | null; lastHomeOpen: boolean }`. Task 4 calls exactly this.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/startup-surface.test.ts`. The `rec` helper mirrors `tests/unit/activation-rules.test.ts` — it takes the **enabled** ids and returns the inverted `disabled` record.

```ts
import { describe, expect, it } from 'vitest';
import { resolveStartupSurface } from '../../src/main/lib/startup-surface';
import { DEFAULT_SETTINGS, type ServiceId } from '../../src/shared/types';

// messenger, telegram, zalo, whatsapp, discord, tiktok, shopee
const order = DEFAULT_SETTINGS.order;
const rec = (enabled: ServiceId[]): Record<ServiceId, boolean> =>
  Object.fromEntries(order.map((id) => [id, !enabled.includes(id)])) as Record<ServiceId, boolean>;

describe('resolveStartupSurface', () => {
  it('restores a recorded service that is still enabled', () => {
    expect(
      resolveStartupSurface({
        order,
        disabled: rec(['messenger', 'discord']),
        lastActiveId: 'discord',
        lastHomeOpen: false,
      }),
    ).toEqual({ activeId: 'discord', homeOpen: false });
  });

  it('falls to rail order when nothing was ever recorded', () => {
    // upgrade from a build without the field: today's behavior, not Home
    expect(
      resolveStartupSurface({
        order,
        disabled: rec(['whatsapp', 'zalo']),
        lastActiveId: null,
        lastHomeOpen: false,
      }),
    ).toEqual({ activeId: 'zalo', homeOpen: false });
  });

  it('restores Home over the recorded service', () => {
    expect(
      resolveStartupSurface({
        order,
        disabled: rec(['discord']),
        lastActiveId: 'discord',
        lastHomeOpen: true,
      }),
    ).toEqual({ activeId: 'discord', homeOpen: true });
  });

  it('opens Home when the recorded service is now disabled', () => {
    // and still resolves a service underneath, so Escape lands somewhere
    expect(
      resolveStartupSurface({
        order,
        disabled: rec(['telegram']),
        lastActiveId: 'discord',
        lastHomeOpen: false,
      }),
    ).toEqual({ activeId: 'telegram', homeOpen: true });
  });

  it('opens Home when the recorded service left the catalog', () => {
    expect(
      resolveStartupSurface({
        order,
        disabled: rec(['telegram']),
        lastActiveId: 'skype' as ServiceId,
        lastHomeOpen: false,
      }),
    ).toEqual({ activeId: 'telegram', homeOpen: true });
  });

  it('activates nothing when every service is disabled', () => {
    expect(
      resolveStartupSurface({
        order,
        disabled: rec([]),
        lastActiveId: 'discord',
        lastHomeOpen: false,
      }),
    ).toEqual({ activeId: null, homeOpen: true });
  });

  it('falls back in rail order, not catalog order', () => {
    // zalo precedes whatsapp in the default order
    expect(
      resolveStartupSurface({
        order,
        disabled: rec(['whatsapp', 'zalo']),
        lastActiveId: 'discord',
        lastHomeOpen: false,
      }).activeId,
    ).toBe('zalo');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
corepack pnpm vitest run tests/unit/startup-surface.test.ts
```

Expected: FAIL — `Failed to resolve import "../../src/main/lib/startup-surface"`.

- [ ] **Step 3: Write the resolver**

Create `src/main/lib/startup-surface.ts`:

```ts
import type { ServiceId, Settings } from '../../shared/types';

export interface StartupSurface {
  /** service to activate; null when no enabled service exists */
  activeId: ServiceId | null;
  /** Home covers the surface — the view must be activated hidden */
  homeOpen: boolean;
}

/** Which surface a launch lands on. A recorded service that is still enabled
 *  wins. One that is disabled or gone from the catalog cannot be honored, so
 *  the launch hands the choice back through Home rather than silently
 *  substituting a different service. No record at all is a fresh install or an
 *  upgrade from a build predating the field — not a failed restore — so that
 *  keeps the old rail-order behavior. */
export function resolveStartupSurface(input: {
  order: ServiceId[];
  disabled: Settings['disabled'];
  lastActiveId: ServiceId | null;
  lastHomeOpen: boolean;
}): StartupSurface {
  const { order, disabled, lastActiveId, lastHomeOpen } = input;
  const firstEnabled = order.find((id) => !disabled[id]) ?? null;
  if (lastActiveId === null) return { activeId: firstEnabled, homeOpen: lastHomeOpen };
  const restorable = order.includes(lastActiveId) && !disabled[lastActiveId];
  if (restorable) return { activeId: lastActiveId, homeOpen: lastHomeOpen };
  return { activeId: firstEnabled, homeOpen: true };
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
corepack pnpm vitest run tests/unit/startup-surface.test.ts
```

Expected: PASS, 7 cases.

- [ ] **Step 5: Full check**

```bash
corepack pnpm lint && corepack pnpm typecheck && corepack pnpm test
```

Expected: all green.

- [ ] **Step 6: Stop and request a commit**

Do not run `git commit`. Stop and ask the user to run `/grimoire-core:commit`, suggesting: `feat(main): resolve the launch surface from the remembered service`

---

### Task 3: Record the surface on every change

Three writers of `activeId`/`homeOpen` become one recorded path. Note the fourth writer this task exists to catch: `toggleHome` in `menu.ts` mutates `ctx.state.homeOpen` directly for `⌘/Ctrl 0`, bypassing the IPC handler.

**Files:**

- Modify: `src/main/activate.ts` (whole file)
- Modify: `src/main/ipc-handlers.ts:86-93` and `:119-133`
- Modify: `src/main/menu.ts:13-20`
- Test: `tests/unit/activate.test.ts` (whole file)

**Interfaces:**

- Consumes: `Settings['lastActiveId']` / `lastHomeOpen` from Task 1.
- Produces: `rememberSurface(ctx: AppContext): void` and `setHomeOpen(ctx: AppContext, open: boolean): void`, both exported from `src/main/activate.ts`. `setHomeOpen` does **not** move focus — callers do.

- [ ] **Step 1: Write the failing test**

Replace the whole of `tests/unit/activate.test.ts`. `makeCtx` now returns the ctx plus the spies the assertions need, so no test reaches into a cast object:

```ts
import { describe, expect, it, vi } from 'vitest';
import { activateService, setHomeOpen } from '../../src/main/activate';
import type { AppContext } from '../../src/main/ipc-handlers';
import { MainState } from '../../src/main/state';

// activate.ts imports AppContext as a type only, so pulling it in here does not
// load electron — a partial ctx with a real MainState is enough.
function makeCtx(state: MainState) {
  const views = { activate: vi.fn(), hideActive: vi.fn(), showActive: vi.fn() };
  const update = vi.fn();
  const ctx = {
    state,
    views,
    settings: { update },
    noteActivated: vi.fn(),
  } as unknown as AppContext;
  return { ctx, views, update };
}

describe('activateService', () => {
  it('notifies subscribers when switching to a non-hibernated service', () => {
    const state = new MainState();
    const cb = vi.fn();
    state.onChange(cb);
    // discord starts non-hibernated, so the incidental setRuntime is a no-op —
    // activation itself must still broadcast, or the rail/content never update
    activateService(makeCtx(state).ctx, 'discord');
    expect(state.activeId).toBe('discord');
    expect(cb).toHaveBeenCalled();
  });

  it('switches the native view to the target service', () => {
    const state = new MainState();
    const { ctx, views } = makeCtx(state);
    activateService(ctx, 'telegram');
    expect(views.activate).toHaveBeenCalledWith('telegram');
  });

  it('leaves home when a service is activated', () => {
    const state = new MainState();
    state.homeOpen = true;
    state.settingsOpen = true;
    state.switcherOpen = true;
    activateService(makeCtx(state).ctx, 'zalo');
    expect(state.homeOpen).toBe(false);
    expect(state.settingsOpen).toBe(false);
    expect(state.switcherOpen).toBe(false);
  });

  it('records the service as the surface to restore', () => {
    const state = new MainState();
    state.homeOpen = true;
    const { ctx, update } = makeCtx(state);
    activateService(ctx, 'discord');
    expect(update).toHaveBeenCalledWith({ lastActiveId: 'discord', lastHomeOpen: false });
  });
});

describe('setHomeOpen', () => {
  it('records home without losing the service underneath', () => {
    const state = new MainState();
    state.activeId = 'discord';
    const { ctx, views, update } = makeCtx(state);
    setHomeOpen(ctx, true);
    expect(state.homeOpen).toBe(true);
    expect(update).toHaveBeenCalledWith({ lastActiveId: 'discord', lastHomeOpen: true });
    // the view must never stay visible under a shell surface
    expect(views.hideActive).toHaveBeenCalled();
    expect(views.showActive).not.toHaveBeenCalled();
  });

  it('records leaving home and presents the service again', () => {
    const state = new MainState();
    state.activeId = 'telegram';
    state.homeOpen = true;
    const { ctx, views, update } = makeCtx(state);
    setHomeOpen(ctx, false);
    expect(update).toHaveBeenCalledWith({ lastActiveId: 'telegram', lastHomeOpen: false });
    expect(views.showActive).toHaveBeenCalled();
  });

  it('notifies subscribers', () => {
    const state = new MainState();
    const cb = vi.fn();
    state.onChange(cb);
    setHomeOpen(makeCtx(state).ctx, true);
    expect(cb).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
corepack pnpm vitest run tests/unit/activate.test.ts
```

Expected: FAIL — `setHomeOpen` is not exported from `activate.ts`.

- [ ] **Step 3: Add the two writers**

Replace `src/main/activate.ts` entirely:

```ts
import type { ServiceId } from '../shared/types';
import type { AppContext } from './ipc-handlers';

/** Remember the surface to restore on the next launch. Written on change, not
 *  at quit: force-quit, a crash, and an OS restart never run before-quit.
 *  Settings and the quick switcher are modals you pass through, so Home is the
 *  only overlay recorded. */
export function rememberSurface(ctx: AppContext): void {
  ctx.settings.update({
    lastActiveId: ctx.state.activeId,
    lastHomeOpen: ctx.state.homeOpen,
  });
}

/** Open or close Home. Both ⌘/Ctrl 0 and the IPC handler route here so the
 *  surface is recorded however Home was reached. Focus stays with the caller:
 *  the two paths deliberately differ there. */
export function setHomeOpen(ctx: AppContext, open: boolean): void {
  ctx.state.homeOpen = open;
  if (open) ctx.views.hideActive();
  else ctx.views.showActive();
  rememberSurface(ctx);
  ctx.state.touch();
}

/** Single entry point for switching services: closes any overlay (settings,
 *  quick switcher) first, then activates — keeps shell state and the native
 *  view layer consistent no matter where the switch came from. */
export function activateService(ctx: AppContext, id: ServiceId): void {
  ctx.state.settingsOpen = false;
  ctx.state.switcherOpen = false;
  ctx.state.homeOpen = false;
  ctx.state.activeId = id;
  ctx.state.setRuntime(id, { hibernated: false });
  ctx.noteActivated(id);
  ctx.views.activate(id);
  rememberSurface(ctx);
  // Broadcast the new activeId. setRuntime above only notifies when it changes
  // a field, so for an already-non-hibernated service it is a no-op and the
  // rail/content would not update until the next state change (e.g. a reload).
  ctx.state.touch();
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
corepack pnpm vitest run tests/unit/activate.test.ts
```

Expected: PASS, 7 cases.

- [ ] **Step 5: Route the IPC handler through `setHomeOpen`**

In `src/main/ipc-handlers.ts`, change the import on line 4 to:

```ts
import { activateService, rememberSurface, setHomeOpen } from './activate';
```

Replace the `home:setOpen` handler (currently lines 86-93) with:

```ts
  on('home:setOpen', ({ open }) => {
    setHomeOpen(ctx, open);
    // so Escape and the accelerators reach the shell, not the buried view
    if (open) ctx.win.webContents.focus();
  });
```

- [ ] **Step 6: Record after a composition change re-homes the selection**

Still in `src/main/ipc-handlers.ts`, in the `if (patch.disabled)` branch, add `rememberSurface(ctx);` between the closing brace of `if (next) { … }` and the `buildAppMenu(ctx);` call, so the block reads:

```ts
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
```

- [ ] **Step 7: Route the accelerator through `setHomeOpen`**

In `src/main/menu.ts`, add `setHomeOpen` to the existing import on line 3:

```ts
import { activateService, setHomeOpen } from './activate';
```

Replace `toggleHome` (currently lines 13-20) with:

```ts
function toggleHome(ctx: AppContext): void {
  setHomeOpen(ctx, !ctx.state.homeOpen);
  ctx.win.webContents.focus();
}
```

Keep the unconditional focus. The IPC path focuses only when opening; making these identical is a behavior change outside this plan's scope.

- [ ] **Step 8: Full check**

```bash
corepack pnpm lint && corepack pnpm typecheck && corepack pnpm test
env -u ELECTRON_RUN_AS_NODE corepack pnpm e2e
```

Expected: all green. `home.spec.ts` exercises the sigil and the banish path that Steps 5 and 6 touched — if it regresses, the cause is here, not Task 4.

- [ ] **Step 9: Stop and request a commit**

Do not run `git commit`. Stop and ask the user to run `/grimoire-core:commit`, suggesting: `feat(main): record the active surface whenever it changes`

---

### Task 4: Restore it at launch

The payoff task: startup reads the record, and an e2e proves the actual quit-and-reopen loop.

**Files:**

- Modify: `src/main/index.ts:188-196`
- Create: `tests/e2e/restart.spec.ts`

**Interfaces:**

- Consumes: `resolveStartupSurface` (Task 2) and the fields written by Task 3.
- Produces: nothing further depends on this.

- [ ] **Step 1: Write the failing e2e**

Create `tests/e2e/restart.spec.ts`. Every test launches twice against the **same** profile directory — that reuse is the whole point, so do not call `mkdtempSync` inside `launch`:

```ts
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { _electron as electron, expect, test } from '@playwright/test';

const isShell = (p: { url(): string }) =>
  p.url().startsWith('file://') && !p.url().includes('loading.html');

const TWO_ENABLED = {
  whatsapp: true,
  messenger: false,
  telegram: false,
  discord: true,
  zalo: true,
  tiktok: true,
  shopee: true,
};

/** A profile that survives between launches — the quit-and-reopen loop needs
 *  the same userData directory twice. */
function makeProfile(settings: Record<string, unknown>): string {
  const profile = mkdtempSync(join(tmpdir(), 'goetia-e2e-'));
  writeFileSync(join(profile, 'settings.json'), JSON.stringify(settings));
  return profile;
}

async function launch(profile: string) {
  const app = await electron.launch({
    args: ['out/main/index.js', `--goetia-user-data=${profile}`],
  });
  const win =
    app.windows().find(isShell) ?? (await app.waitForEvent('window', { predicate: isShell }));
  return { app, win };
}

const activeTile = '[data-testid="service-tile"][aria-current="page"]';

test('restart: reopens on the service that was active at quit', async () => {
  const profile = makeProfile({ disabled: TWO_ENABLED });
  const first = await launch(profile);

  // messenger leads the default order, so it is what a cold start picks
  await expect(first.win.locator(activeTile)).toHaveAttribute('aria-label', 'Messenger');
  // the tile renders an icon, so the name is only on aria-label — never hasText
  await first.win.locator('[data-testid="service-tile"][aria-label="Telegram"]').click();
  await expect(first.win.locator(activeTile)).toHaveAttribute('aria-label', 'Telegram');
  await first.app.close();

  const second = await launch(profile);
  await expect(second.win.locator(activeTile)).toHaveAttribute('aria-label', 'Telegram');
  await expect(second.win.locator('[data-testid="welcome"]')).toHaveCount(0);
  await second.app.close();
});

test('restart: reopens on Home when Home was the surface at quit', async () => {
  const profile = makeProfile({ disabled: TWO_ENABLED });
  const first = await launch(profile);

  await first.win.locator('[data-testid="home-btn"]').click();
  await expect(first.win.locator('[data-testid="welcome"]')).toBeVisible();
  await first.app.close();

  const second = await launch(profile);
  await expect(second.win.locator('[data-testid="welcome"]')).toBeVisible();
  // both services are still enabled: Home was restored over a live service,
  // not shown because everything was disabled
  await expect(second.win.locator('[data-testid="service-tile"]')).toHaveCount(2);
  await second.app.close();
});

test('restart: a recorded service that is now disabled opens Home', async () => {
  // unreachable by driving the UI — only a hand-edited or synced settings.json
  // gets here, so it is written directly
  const profile = makeProfile({ disabled: TWO_ENABLED, lastActiveId: 'shopee' });
  const { app, win } = await launch(profile);

  await expect(win.locator('[data-testid="welcome"]')).toBeVisible();
  await expect(win.locator('[data-testid="service-tile"]')).toHaveCount(2);
  await app.close();
});
```

- [ ] **Step 2: Run the e2e to verify it fails**

```bash
env -u ELECTRON_RUN_AS_NODE corepack pnpm e2e tests/e2e/restart.spec.ts
```

Expected: all three FAIL. The first reopens on Messenger instead of Telegram; the other two find no `welcome` element.

- [ ] **Step 3: Wire the resolver into startup**

In `src/main/index.ts`, add to the imports (keeping them alphabetical among the `./lib/` group, after `./lib/ua`):

```ts
import { resolveStartupSurface } from './lib/startup-surface';
```

Replace lines 188-196 — the `const s0` through the `if (first) { … }` block — with:

```ts
    const s0 = settings.get();
    const surface = resolveStartupSurface({
      order: s0.order,
      disabled: s0.disabled,
      lastActiveId: s0.lastActiveId,
      lastHomeOpen: s0.lastHomeOpen,
    });
    // all-disabled (fresh install): show the welcome screen, create no
    // view — activating order[0] would give a disabled service network
    state.activeId = surface.activeId ?? s0.order[0];
    state.homeOpen = surface.homeOpen;
    if (surface.activeId) {
      ctx.noteActivated(surface.activeId);
      // Home covers the view: resolve now, present when Home closes
      views.activate(surface.activeId, { show: !surface.homeOpen });
    }
```

Leave the `views.ensure(id)` loop that follows untouched — it still warms every enabled never-hibernate service, so restoring a different service costs no extra view.

- [ ] **Step 4: Run the e2e to verify it passes**

```bash
env -u ELECTRON_RUN_AS_NODE corepack pnpm e2e tests/e2e/restart.spec.ts
```

Expected: PASS, 3 tests.

- [ ] **Step 5: Full check, including the specs this could regress**

```bash
corepack pnpm lint && corepack pnpm typecheck && corepack pnpm test
env -u ELECTRON_RUN_AS_NODE corepack pnpm e2e
```

Expected: all green. Watch two in particular:

- `welcome.spec.ts` relaunches after summoning Zalo and asserts the welcome screen is gone. That still holds: a fresh install shows welcome via `allDisabled` with `homeOpen` false, so the confirm records `{ lastActiveId: 'zalo', lastHomeOpen: false }`.
- `home.spec.ts` drives the sigil and the banish path.

- [ ] **Step 6: Verify by hand in the real app**

```bash
corepack pnpm dev
```

Enable two services, click the second, quit with `⌘Q`, relaunch: it opens on the second. Then press `⌘0` for Home, quit, relaunch: it opens on Home, and pressing `Escape` reveals the service underneath rather than a blank pane. That `Escape` check is the one thing no test covers directly — it is the `{ show: false }` invariant paying off.

- [ ] **Step 7: Stop and request a commit**

Do not run `git commit`. Stop and ask the user to run `/grimoire-core:commit`, suggesting: `feat(app): reopen on the last active service or Home`

---

## Out of scope

Do not add any of these, even if a task seems to invite it:

- Persisting Settings or the quick switcher. Only Home is a destination.
- Persisting hibernation, unread counts, scroll position, or per-service navigation. A restored service loads its `SERVICES[].url` chat entry point.
- Window bounds, position, or maximized state.
- Changes to `resolveActivation`, which keeps owning the *runtime* re-homing after a composition change. `resolveStartupSurface` owns launch only.
- A migration step. A `settings.json` without the fields reads as `null` / `false` through `DEFAULT_SETTINGS`.
- Unifying the focus behavior of `toggleHome` and the `home:setOpen` handler.
