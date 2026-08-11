# Home screen and service composition design

**Date:** 2026-08-09

**Goal:** Promote the welcome screen from a fresh-install-only empty state to a reachable Home surface that owns service composition. Add a rail button and a `⌘/Ctrl 0` accelerator that reach it, seed its picker from the live enabled set, and make the confirm button name the change it is about to apply. Remove enable/disable from the Settings modal so no code path can disable the service the user is looking at from behind an overlay.

## Context

- The welcome screen is derived, not flagged: `App.tsx` renders `Welcome` when every service is disabled (`2026-08-08-welcome-screen-design.md`). There is no way back to it once a service is enabled.
- `Welcome.tsx` stages its picker in local React state and applies it on confirm through one `settings:update` patch built by `buildDisabledPatch` (`src/shared/welcome.ts`). Selection starts empty.
- `Settings → Services` carries four controls per service: enabled, mute, never hibernate, reload (`SettingsView.tsx`).
- Shell surfaces (`switcherOpen`, `settingsOpen`) are session-only booleans on `MainState`. Opening one calls `views.hideActive()`; closing calls `views.showActive()`. Service views are native `WebContentsView`s layered above the shell renderer, so a visible view covers any shell surface.

## The bug this fixes

Disabling the active service from the Settings modal appears to close the modal and jump to another service. It does not: `settingsOpen` stays `true`. The `settings:update` handler calls `views.activate(next)` unconditionally (`src/main/ipc-handlers.ts`), and `activate()` re-adds the view at the top of the z-order, makes it visible, and focuses its `webContents` (`src/main/views.ts`). The modal is buried and unfocusable, so `Escape` no longer reaches it.

The defect is not specific to Settings. Once Home can edit the enabled set, the same call would flash a service view over the Home screen. The fix is an invariant, not a special case:

> No code path may make a service view visible while a shell surface (settings, switcher, home) is on screen.

## Decision: Home is a surface, Welcome is its content

`homeOpen: boolean` joins `switcherOpen` and `settingsOpen` on `MainState`, ships in the `ShellState` snapshot, and is never persisted — a restart lands on the active service, as today.

The renderer keeps deriving rather than storing:

```ts
const showWelcome = state.homeOpen || allDisabled;
```

Zero enabled services still means zero service views; the all-disabled path is unchanged, and `homeOpen` simply gives it a second, user-driven trigger.

Rejected alternative: `activeId: ServiceId | null`, with `null` meaning home. It reads well but changes the type of a field threaded through the menu, tray, badges, hibernation, and resilience code, for no behavioral gain.

### IPC

New channel `home:setOpen { open: boolean }`, added to `RendererToMain`, `R2M_CHANNELS`, **and** `SHELL_ONLY_CHANNELS` (`src/shared/ipc.ts`). It carries no `serviceId`, so shell-only is the correct classification per the IPC rule in `CLAUDE.md`.

Its handler mirrors `settings:setOpen`: set the flag, `views.hideActive()` on open and `views.showActive()` on close, `state.touch()`, and `win.webContents.focus()` on open so keyboard input reaches the shell.

### Guards that grow a third term

| Site | Today | Change |
| --- | --- | --- |
| `syncOverlay` (`index.ts`) | `!switcherOpen && !settingsOpen` | add `&& !homeOpen` |
| `win.on('focus')` (`index.ts`) | `!switcherOpen && !settingsOpen` | add `&& !homeOpen` |
| `activateService` (`activate.ts`) | clears both flags | also clears `homeOpen` |

Clearing `homeOpen` in `activateService` is what makes a rail tile, `⌘/Ctrl 1…6`, the quick switcher, and a notification click all leave Home through the one existing entry point.

## Enforcing the invariant

`views.activate(id)` takes an explicit visibility argument. With `show: false` it creates the view if needed and moves it to the top of the z-order, but leaves it hidden and does not call `webContents.focus()`; `showActive()` reveals it when the surface closes.

The call site consults a pure predicate, keeping `ipc-handlers.ts` thin:

```ts
// src/main/lib/overlay-rules.ts
export function anyOverlayOpen(s: {
  settingsOpen: boolean;
  switcherOpen: boolean;
  homeOpen: boolean;
}): boolean;
```

In the `settings:update` disabled-patch branch, `resolveActivation` is unchanged; only the presentation of its result changes:

```ts
if (next) {
  ctx.state.activeId = next;
  ctx.noteActivated(next);
  ctx.views.activate(next, { show: !anyOverlayOpen(ctx.state) });
}
```

## Rail: the leading sigil

A button prepended before the service tiles in `Rail.tsx`, followed by a hairline divider (`w-px h-5` horizontal, `h-px w-6` vertical) that keeps it out of the drag-to-reorder run. Same 32 px footprint as a tile, transparent face, the `Portal` arcs and core at ~22 px.

- Idle `opacity-60`, full on hover.
- When `homeOpen`, the tile takes the `bg-bg-2` treatment the gear uses while Settings is open, and the ember core reads at full strength.
- `title="Home — all services (⌘0)"`, `aria-current="page"` when open.
- Sends `home:setOpen { open: !state.homeOpen }`.

Head of the rail survives all three `railPosition` values unchanged, which the rejected alternatives did not: a `+` tile after the last service moves as services are enabled and lands inside the reorder run, and a fourth icon in the trailing bell/gear cluster reads as a setting rather than a place.

Service tiles gain one condition: `active={!state.homeOpen && …}` — no tile should read as current while Home is on screen.

## Menu and accelerator

The `Go` menu gains `Home` with `CmdOrCtrl+0` above the service list, followed by a separator. `0` sits in front of the existing `⌘/Ctrl 1…6`, so the menu reads as an ordered index. Registering it as a menu accelerator (not a `globalShortcut`) is what makes it fire while a service `WebContentsView` has focus — the same mechanism the numbered shortcuts already use.

It **toggles** `homeOpen`, matching `⌘/Ctrl K`: press twice to return to the service. A plain item, not a checkbox — `buildAppMenu` rebuilds only on order and disabled changes, so a checkmark would go stale.

## Welcome screen

Layout is unchanged. Three behaviors change.

**Seeded picker.** `selected` initializes from the live enabled set instead of an empty set, and re-seeds every time the screen becomes visible, so a discarded edit never survives to the next visit. On a fresh install the enabled set is empty, which reproduces today's empty selection exactly.

**Staged toggles.** Nothing is written until confirm; confirming applies and leaves the user on Welcome with the button disabled again. Leaving by any other route (`⌘/Ctrl 0`, the sigil, `Escape`, a rail tile) discards staged toggles. If the confirm banished the active service, `resolveActivation` moves `activeId` to the first enabled service, but the invariant above keeps that view hidden until the user actually leaves Home.

**Delta-named confirm.** The label logic moves into `src/shared/welcome.ts` beside `buildDisabledPatch` — process-agnostic and unit-testable:

```ts
export function summonDelta(
  order: ServiceId[],
  enabled: ReadonlySet<ServiceId>,
  selected: ReadonlySet<ServiceId>,
): { add: ServiceId[]; remove: ServiceId[] };
```

| Live → staged | Label | Button |
| --- | --- | --- |
| 0 → 0 | `Summon 0 services` | disabled |
| 0 → 3 | `Summon 3 services` | enabled |
| 3 → 3 | `No changes` | disabled |
| 3 → 5 | `Summon 2 services` | enabled |
| 3 → 2 | `Banish 1 service` | enabled |
| 3 → 4, mixed | `Summon 2 · Banish 1` | enabled |

Counts are singular/plural and render in tabular numerals, as today.

Copy changes: the hint line becomes "Pick at least one — come back here anytime with `⌘/Ctrl 0`", and the third tip card swaps `⌘/Ctrl ,` settings for `⌘/Ctrl 0` home.

**Banishing the last service is allowed.** It produces exactly the fresh-install state, on the screen the user is already standing on, one click from recovery. Blocking it would need a special-case disabled button that reads as a bug.

**`Escape` leaves Home**, guarded the way `SettingsView` guards its own handler: only when Settings and the quick switcher are both closed, and only when at least one service is enabled.

## Settings

`Services` keeps its name and its slot in the section list and loses the `enabled` checkbox. It lists **only enabled services**, each with mute, never hibernate, and reload. A `Manage services…` row at the bottom closes Settings and opens Home, so composition stays one hop from where people look for it first.

This is what removes the bug class rather than patching it: composition ("which services exist") and per-service behavior ("how this one acts") stop sharing a surface, and the enable toggle no longer lives behind a modal that a view can cover.

`Shortcuts` gains a line: `⌘/Ctrl + 0 — home / all services`.

## Testing

- **Unit (vitest):**
  - `anyOverlayOpen`: every combination of the three flags.
  - `summonDelta`: additions only, removals only, mixed, and no-op; label and disabled state for all six rows of the table above.
  - `resolveActivation`: unchanged, existing cases still pass.
- **E2E (Playwright):**
  - `⌘/Ctrl 0` and the sigil both toggle Welcome, and the active service view is genuinely hidden while it is open.
  - Banishing the active service from Welcome never paints a service view over Welcome, and the rail loses its tile.
  - Settings exposes no enable checkbox; `Manage services…` closes Settings and lands on Home.
  - Existing specs keep passing with seeded profiles.

Definition of done is unchanged: `lint`, `typecheck`, `test`, and `e2e` all green.

## Out of scope

- No changes to recipes, navigation policy, notifications, hibernation, or packaging.
- No tile context menu; mute stays on right-click, and never hibernate and reload stay in Settings.
- No system-wide `globalShortcut`; `⌘/Ctrl 0` is app-scoped.
- `homeOpen` is not persisted, so there is no "open on Home at launch" preference.
