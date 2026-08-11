# Restore the last active service design

**Date:** 2026-08-10

**Goal:** Quitting on Discord and reopening should land on Discord. The app remembers the surface you left — a service, or Home — and restores it on the next launch instead of always opening the first enabled service in rail order.

## Context

Startup activation is hardcoded to rail order (`src/main/index.ts`):

```ts
const s0 = settings.get();
const first = s0.order.find((id) => !s0.disabled[id]);
state.activeId = first ?? s0.order[0];
if (first) {
  ctx.noteActivated(first);
  views.activate(first);
}
```

Nothing about the previously focused service is written to disk. `MainState` declares `activeId: ServiceId = 'whatsapp'` as an in-memory field only, and `homeOpen` carries an explicit comment that it is "a shell surface, not a persisted preference: a restart lands on the active service".

`state.activeId` is written in exactly two places today:

1. `activateService` (`src/main/activate.ts`) — the single entry point for every user-initiated switch: rail click, quick switcher, `⌘/Ctrl 1…9`.
2. The `patch.disabled` branch of `settings:update` (`src/main/ipc-handlers.ts`), where `resolveActivation` re-homes the selection after a Home confirm banishes the active service.

Both are covered by this design.

## Decision 1: persist on change, into Settings

The record lives in `settings.json` through the existing `SettingsStore`, and is written the moment the surface changes — not in a `before-quit` hook.

`lastNotifiedVersion` is the precedent: `Settings` already holds a remembered runtime fact that is not a user-facing preference, written from main the instant it becomes true. Writing on change also survives force-quit, a renderer crash, and an OS restart, none of which run `before-quit`. `conf` writes synchronously and atomically, and `settings.json` is about a kilobyte, so the cost of a write per service switch is not worth a debounce.

A separate session-state store was rejected: a second file to construct, normalize, migrate, and test, for two scalar fields that fit an existing one.

Two new fields in `Settings` (`src/shared/types.ts`):

```ts
/** service focused when the app last closed; restored on launch */
lastActiveId: ServiceId | null;
/** Home was the surface on top at close — Home is a destination,
 *  Settings is a modal you pass through */
lastHomeOpen: boolean;
```

`DEFAULT_SETTINGS` gets `lastActiveId: null` and `lastHomeOpen: false`.

Two fields rather than one `lastSurface: ServiceId | 'home'` union, because Home is a layer over a service rather than a replacement for one: closing Home with `Escape` must reveal something underneath, so the service identity has to survive independently of whether Home was on top.

`normalize()` in `src/main/settings.ts` is deliberately **not** extended to scrub `lastActiveId`. It reconciles `order` and the three `Record<ServiceId, boolean>` maps against the catalog; nulling an unknown `lastActiveId` there would erase the difference between "recorded, but that service is gone" and "never recorded", which Decision 2 depends on.

## Decision 2: one pure resolver owns the startup surface

New helper `src/main/lib/startup-surface.ts`, joining `activation-rules.ts` as pure decision logic with a vitest unit test, keeping `index.ts` thin wiring:

```ts
export interface StartupSurface {
  /** service to activate; null when no service can be activated at all */
  activeId: ServiceId | null;
  /** Home covers the surface — the view must be activated hidden */
  homeOpen: boolean;
}

export function resolveStartupSurface(input: {
  order: ServiceId[];
  disabled: Settings['disabled'];
  lastActiveId: ServiceId | null;
  lastHomeOpen: boolean;
}): StartupSurface;
```

Let `firstEnabled = order.find((id) => !disabled[id])`. The rules, in order:

| `lastActiveId` | `activeId` | `homeOpen` |
| --- | --- | --- |
| `null` — never recorded | `firstEnabled ?? null` | `lastHomeOpen` |
| in `order` and enabled | `lastActiveId` | `lastHomeOpen` |
| disabled, or absent from `order` | `firstEnabled ?? null` | `true` |

Two consequences worth stating outright:

**An unrestorable record opens Home, a missing record does not.** A recorded service that is now disabled or gone from the catalog means the app cannot honor the user's last position, so it hands the decision back with the Home picker rather than silently substituting a different service (user decision, 2026-08-10). But `lastActiveId: null` is not a failed restore — it is a fresh install or an upgrade from a build predating this field, and those must keep today's behavior. Treating null as unrestorable would greet every existing user with Home once after upgrading, for no information gained.

**`activeId` still resolves when Home opens.** In the unrestorable row the resolver falls back to `firstEnabled` rather than returning null, so `Escape` out of Home lands on a real service instead of an empty content area.

The all-disabled case needs no special handling: `activeId` is `null`, and the renderer already derives the welcome screen from the settings themselves — `showWelcome = homeOpen || allDisabled` in `App.tsx`. No new flag, consistent with the existing "derived from settings" invariant in `CLAUDE.md`.

## Decision 3: wiring

### Startup

The block quoted in Context becomes:

```ts
const s0 = settings.get();
const surface = resolveStartupSurface({
  order: s0.order,
  disabled: s0.disabled,
  lastActiveId: s0.lastActiveId,
  lastHomeOpen: s0.lastHomeOpen,
});
state.activeId = surface.activeId ?? s0.order[0];
state.homeOpen = surface.homeOpen;
if (surface.activeId) {
  ctx.noteActivated(surface.activeId);
  // Home covers the view: resolve now, present when Home closes
  views.activate(surface.activeId, { show: !surface.homeOpen });
}
```

`{ show: !surface.homeOpen }` is the load-bearing line. The `CLAUDE.md` invariant is that no code path may make a view visible while a shell surface is open — service views are layered above the shell renderer, so a visible view buries Home exactly the way the settings-modal bug buried Settings.

Focus needs no new guard. `win.on('focus')` already checks `!state.switcherOpen && !state.settingsOpen && !state.homeOpen` before calling `views.focusActive()`, and `syncOverlay` already suppresses the loading cover while Home is open. Both read the state we set here, before the window finishes loading and the first `broadcast()` fires.

The unchanged `views.ensure(id)` loop that follows still warms every enabled never-hibernate service, so restoring a different service costs no extra view.

### Recording

One helper in `src/main/activate.ts`, writing both fields from live state:

```ts
/** Remember the surface to restore on the next launch. Settings and the quick
 *  switcher are modals you pass through; Home is a destination, so it is the
 *  only overlay recorded. */
export function rememberSurface(ctx: AppContext): void {
  ctx.settings.update({
    lastActiveId: ctx.state.activeId,
    lastHomeOpen: ctx.state.homeOpen,
  });
}
```

Reading `ctx.state` inside the helper rather than taking an id keeps the two fields impossible to write inconsistently, and means the `settings:update` call site below does not have to reason about whether `next` was applied.

`homeOpen` has **two** writers, not one: the `home:setOpen` IPC handler serves the rail sigil, `Escape`, and the Settings link, while `toggleHome` in `src/main/menu.ts` serves the `⌘/Ctrl 0` accelerator by mutating `ctx.state.homeOpen` directly. The two already duplicate the same four steps. Rather than add `rememberSurface` to both and leave a fifth path free to forget it, the shared part moves into `src/main/activate.ts`:

```ts
/** Open or close Home. Both the accelerator and the IPC handler route here so
 *  the surface is recorded exactly once, however Home was reached. Focus stays
 *  with the caller — the two paths differ there. */
export function setHomeOpen(ctx: AppContext, open: boolean): void {
  ctx.state.homeOpen = open;
  if (open) ctx.views.hideActive();
  else ctx.views.showActive();
  rememberSurface(ctx);
  ctx.state.touch();
}
```

Focus deliberately stays at the call sites: the IPC handler focuses the shell only when opening, while `toggleHome` focuses unconditionally. Collapsing that difference is a behavior change this design does not need to make.

Call sites for the record, then, are three:

1. `activateService`, after the state writes — records the new service and, because that function clears `homeOpen`, records leaving Home in the same write.
2. `setHomeOpen`, covering both the sigil and `⌘/Ctrl 0`.
3. The `patch.disabled` branch of `settings:update`, after the `resolveActivation` block. Called whether or not `next` was non-null: when the last enabled service is banished, `next` is null and `activeId` stays pointing at a now-disabled service, which is precisely the unrestorable record that should reopen on Home.

The nested `ctx.settings.update` inside the `settings:update` handler is safe: `SettingsStore.update` writes through `conf` directly with no IPC round trip, and nothing downstream in that handler reads the two new fields. The `ctx.broadcast()` that ends the handler re-reads `settings.get()`.

No new IPC channel, so there is nothing to classify in `SHELL_ONLY_CHANNELS` and no new `serviceId` payload to validate.

## Testing

**Unit (vitest):**

- `tests/unit/startup-surface.test.ts` — one case per row of the resolver table, plus: `lastHomeOpen: true` carried through a successful restore; all-disabled returning `activeId: null`; an id absent from `order` (simulating a service dropped from the catalog) opening Home; and the fallback under an unrestorable record resolving to `firstEnabled` in rail order, not `order[0]`.
- `tests/unit/activate.test.ts` — `activateService` writes `lastActiveId` and `lastHomeOpen: false`; `setHomeOpen(ctx, true)` writes `lastHomeOpen: true` while leaving `lastActiveId` on the service underneath, and hides the active view rather than showing it. The existing `makeCtx` partial gains a `settings` stub with a spied `update`, plus `hideActive` / `showActive` spies.
- `tests/unit/settings.test.ts` — the two defaults, and a round trip proving `normalize` leaves an unknown `lastActiveId` intact rather than nulling it.

**E2E (Playwright), new `tests/e2e/restart.spec.ts`:**

The existing `launch()` helpers mint a fresh `mkdtempSync` profile per call. This spec factors that so a profile directory can be reused across two launches, which is the whole quit-and-reopen loop:

- Launch with two services enabled, click the Telegram tile, `app.close()`, relaunch against the same profile, assert the tile with `aria-current="page"` is Telegram.
- Launch, open Home via the sigil, `app.close()`, relaunch against the same profile, assert `[data-testid="welcome"]` is visible — and that the rail still shows two service tiles, proving Home was restored over a live service rather than by an all-disabled fallback.
- Write a `settings.json` whose `lastActiveId` names a disabled service, launch once, assert Home is on screen — the unrestorable path, and the one case that cannot be reached by driving the UI.

Definition of done is unchanged: `lint`, `typecheck`, `test`, and `e2e` all green.

## Out of scope

- Settings and the quick switcher are not restored (user decision, 2026-08-10). An interrupted settings visit reopens on the service behind it.
- No persistence of runtime state — hibernation, unread counts, scroll position, or per-service navigation. A restored service loads its `SERVICES[].url` chat entry point exactly as it does today.
- No window bounds, position, or maximized-state persistence.
- No change to `resolveActivation`, which keeps owning the *runtime* re-homing after a composition change. `resolveStartupSurface` owns launch only; the two never run in the same moment.
- No migration step. A `settings.json` without the fields reads as `null` / `false` through `DEFAULT_SETTINGS`, which is the fresh-install row of the resolver table.
