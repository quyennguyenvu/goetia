# Timed global mute — design

Date: 2026-09-21. Status: approved in brainstorm (user decision, same day); not implemented. Scope: mute everything for a bounded time — one hour, until tomorrow morning, or until unmuted — from the bell, the tray and the app menu, with the expiry persisted and honoured across a restart. Nothing about what global mute _means_ changes, and quiet hours keep their schedule.

## Problem

The 2026-09-20 timed mute taught the rail tile's `Mute` to offer durations, so the bell offering only on/off is now the odd one out. Quiet hours cover the recurring case; there is nothing for the ad-hoc one — a meeting, a focus hour, an evening off — short of remembering to press `⌘/Ctrl ⇧ M` again. Slack, Discord and macOS Focus all pair a schedule with "for a while".

## Decisions

- **The same three durations** as the tile menu, from the same table (`MUTE_CHOICES`): `For 1 hour`, `Until tomorrow`, `Until I unmute`. One vocabulary for both grains.
- **The boolean plus an expiry, never a second truth** — the per-service rule, applied to the global flag. `globalMuted` stays the only field `shouldNotify`, `audioMuted`, both menus' state and the bell read; `globalMutedUntil` (0 = none) is consulted only by `MuteTimerController`, the menu labels and the bell tooltip.
- **One timer.** `MuteTimerController` already arms for the earliest per-service expiry; the global expiry joins that pick. No second controller.
- **Every path stays on `ctx.setGlobalMuted`**, which gains an `until` and zeroes it on any unmute — a stale expiry must never re-silence after a hand unmute.
- **A timer expiry never dismisses quiet hours** (the one place the two features touch). A hand unmute mid-window runs `muteToggleResult`, which records `quietOverrideWindowStart` and keeps that night loud. Someone who asked for an hour of silence at 22:00 did not ask for that, so the expiry tail writes `globalMuted = false, globalMutedUntil = 0` and leaves the override alone; if a quiet window is open, quiet hours simply resume.
- **Left-click on the bell stays the toggle**, so muscle memory holds; right-click opens the durations. `⌘/Ctrl ⇧ M` stays the indefinite toggle.
- **The menu item carries the state in its label**, no longer as a checkbox: unsilenced it is a submenu of durations, silenced it is a single `Unmute All Notifications`, suffixed with the expiry when there is one. A checkbox cannot be a submenu, and a submenu parent cannot fire an accelerator, so the accelerator rides whichever leaf exists — `Until I unmute` when unsilenced, the Unmute item when silenced — declared once, in the app menu only (the tray copy still carries none).
- **No Diagnostics line.** A mute is a user action, not a fault.

## Data

`Settings.globalMutedUntil: number` — epoch ms, 0 for none; default 0; normalised like `mutedUntil` (finite and positive, else 0). `ShellState.globalMutedUntil` mirrors it for the bell tooltip and rides the existing broadcast.

Pure rules, extended:

```ts
// lib/mute-rules.ts
/** the earliest expiry among muted services and a timed global mute, or null */
export function nextMuteExpiry(muted, mutedUntil, now, globalUntil = 0): number | null;
/** a timed global mute whose expiry has passed */
export function globalMuteDue(globalMuted: boolean, until: number, now: number): boolean;

// lib/mute-menu.ts (new; MUTE_CHOICES moves here, tile-menu imports it)
export type GlobalMuteMenu =
  | { type: 'submenu'; label: 'Mute All Notifications'; items: { kind: MuteFor; label: string }[] }
  | { type: 'item'; label: string }; // `Unmute All Notifications` or `Unmute All Notifications (until 14:30)`
export function globalMuteMenu(o: { silenced: boolean; until: number; now: Date }): GlobalMuteMenu;
```

`silenced` is `globalMuted || quietNow`, the same effective silence the checkbox showed; during quiet hours with no global mute the item reads plain `Unmute All Notifications`, and clicking it is the existing mid-window override.

## Controller

`MuteTimerController` gains `globalMuted()`, `globalMutedUntil()` and `onGlobalExpire()`. `rearm()` arms for `nextMuteExpiry(…, globalUntil)` where `globalUntil` is the expiry when globally muted, else 0. `fireDue()` runs the per-service tail for due services and `onGlobalExpire()` when `globalMuteDue`. `start()` therefore ends a global mute that expired while Goetia was closed.

## Tail

`ctx.setGlobalMuted(muted, until = 0)` writes `muteToggleResult(…)` plus `globalMutedUntil: muted ? until : 0` in one settings write, runs `quietSideEffects` (page audio, both menus, broadcast) and `muteTimer.rearm()`. The expiry tail (`onGlobalExpire` in `index.ts`) writes `{ globalMuted: false, globalMutedUntil: 0 }` — never through `muteToggleResult` — then the same side effects. `global:setMuted` gains an optional `until`, validated by the existing `validUntil` (finite, future, else 0). A new shell-only channel `global:muteMenu` (no payload) pops the native menu on the bell's right-click; being shell-only it is refused while locked, like `service:tileMenu`.

## Surfaces

- **Bell** (`Rail.tsx`): left-click unchanged; `onContextMenu` sends `global:muteMenu`. Tooltip gains the suffix `— muted until 14:30` (`muteLabel`) when timed. `data-testid="bell"`.
- **App menu** (`menu.ts`) and **tray** (`tray.ts`): both build their mute entry from `globalMuteMenu`; a duration child calls `ctx.setGlobalMuted(true, muteExpiry(kind, new Date()))`, `Until I unmute` and the Unmute item run the existing `mute` command (the toggle). The app menu's copies carry `ACCELERATORS.mute` on that leaf; the tray's carry none.
- **`⌘/Ctrl ⇧ M`** and the views' `before-input-event` interception: unchanged, the toggle.

## Testing

- `mute-rules.test.ts` — `nextMuteExpiry` picks a nearer global expiry and ignores it when not globally muted or 0; `globalMuteDue` for due, future, indefinite and unmuted.
- `mute-timer.test.ts` — a global expiry fires `onGlobalExpire` once and re-arms to nothing; a global and a service expiry fire in order; a past global expiry fires at `start()`.
- `mute-menu.test.ts` — submenu shape and labels when unsilenced; `Unmute All Notifications (until 14:30)` when timed; plain when silenced without an expiry.
- `settings.test.ts` — `globalMutedUntil` defaults to 0 and coerces garbage.
- `ipc-sender-policy.test.ts` — `global:muteMenu` shell-only; `lock-ipc-policy.test.ts` — refused while locked.
- `tests/e2e/timed-global-mute.spec.ts` — a native menu cannot be driven, so the profile seeds quiet hours covering now **and** `globalMuted = true` with `globalMutedUntil` a few seconds ahead: the bell's tooltip says `muted until`, then on its own the tooltip loses the suffix but the bell stays silenced (quiet hours resumed), and `settings.json` holds `globalMuted = false`, `globalMutedUntil = 0`, `quietOverrideWindowStart = null` — the override rule, end to end.

## Out of scope

- A countdown or remaining-time display.
- Per-service quiet hours.
- Changing what `⌘/Ctrl ⇧ M` does.
