# Timed per-service mute — design

Date: 2026-09-20. Status: approved in brainstorm (user decision, same day); not implemented. Scope: mute one service for a bounded time from the rail tile's menu — one hour, until tomorrow morning, or until unmuted — with the expiry persisted and honoured across a restart. Nothing about what mute _means_ changes.

## Problem

A service's mute is a plain boolean flipped from the tile menu or Settings → Services. Muting a noisy Discord server for a meeting means remembering to unmute it afterwards, and most people don't, so the service stays silent for days and a message is missed. Quiet hours are global and scheduled; there is nothing for "shut this one up for a bit". Every chat client offers the per-conversation version of this; Goetia works at the service grain, so the mute does too.

## Decisions

- **Three durations** (user decision, option 1 of 3): `For 1 hour`, `Until tomorrow`, `Until I unmute`. `Until tomorrow` ends at 08:00 local on the next calendar morning — a mute set at 02:00 ends at 08:00 the same day. Rejected: an 8-hour and a 30-minute option, one more row each for little gain.
- **An expiry beside the flag, and one timer** (approach A of 3). `muted[id]` stays the single truth every reader already consults — `shouldNotify`, `audioMuted`, the bell badge, the tile menu — and `mutedUntil[id]` says when a controller must flip it back. Rejected: computing "muted" lazily from the expiry at read time (the page audio, the tile badge and the menu label all need a real moment of change, so a timer is needed anyway and the truth would be split across two fields); and a per-service quiet-hours schedule (far more UI than "for a bit" needs).
- **Settings → Services keeps its plain checkbox.** Ticking it is `Until I unmute`; unticking clears any expiry. The timed choices live only where a right-click already offers Mute.
- **Every unmute zeroes the expiry**, whether the user's or the timer's, so a stale expiry can never re-silence a service the user unmuted by hand.
- **A past expiry at boot ends the mute at launch.** The controller's `start()` runs the same tail the timer would have; the persisted expiry is what makes a mute that should have ended while Goetia was closed end at all.
- **No Diagnostics line.** A mute is a user action, not a fault.

## Data

`Settings.mutedUntil: Record<ServiceId, number>` — epoch ms of the expiry, `0` for none. Normalised like `lastUsedAt` (`fillLastUsedAt` twin: finite and positive, else 0). Default all zeros. `ShellState.mutedUntil` mirrors it for the renderer's labels; it rides the existing broadcast.

Pure rules in `src/main/lib/mute-rules.ts`:

```ts
export type MuteFor = 'hour' | 'tomorrow' | 'indefinite';
export const MUTE_HOUR_MS = 3_600_000;
export const TOMORROW_HOUR = 8;
/** the expiry for a choice made at `now`; 0 for indefinite */
export function muteExpiry(kind: MuteFor, now: Date): number;
/** `until 14:30`, `until tomorrow 08:00`, or '' for none / past — for menu and tooltip */
export function muteLabel(until: number, now: Date): string;
/** the earliest future expiry among muted services, or null */
export function nextMuteExpiry(muted: Record<ServiceId, boolean>, mutedUntil: Record<ServiceId, number>, now: number): number | null;
/** the services whose timed mute has run out */
export function dueUnmutes(muted: Record<ServiceId, boolean>, mutedUntil: Record<ServiceId, number>, now: number): ServiceId[];
```

`muteLabel` says `until tomorrow 08:00` when the expiry falls on a later calendar day than `now`, else `until HH:MM`.

## Controller

`src/main/mute-timer.ts`, `MuteTimerController`, shaped like `QuietHoursController`: one `setTimeout`, re-armed on every fire and on every mute change, armed for `nextMuteExpiry` plus a small slack. On fire it hands `dueUnmutes` to `onExpire(ids)`, which runs the shared tail once per id. `start()` fires immediately for anything already due, then arms. `dispose()` clears the timer. It never stores engagement; everything is recomputed from settings and the clock, so a late fire (sleep) self-corrects.

## Tail

`setServiceMuted(ctx, id, muted, until = 0)` in `ipc-handlers.ts` writes `muted` and `mutedUntil` in one settings write, applies page audio, calls `ctx.muteTimer.rearm()`, and broadcasts. Both existing callers pass no `until`. The IPC channel `service:setMuted` gains an optional `until` so the tile menu path can carry it, validated in main as a finite number in the future (else treated as 0). Auto-banish leaves both fields alone; a service summoned back honours what is left, and an expired one ends at the next arm.

## Surfaces

- **Tile menu** (`lib/tile-menu.ts`): on an unmuted service `Mute` becomes a submenu — `For 1 hour`, `Until tomorrow`, `Until I unmute`. On a muted one the item is `Unmute`, suffixed with `muteLabel` when there is an expiry: `Unmute (until 14:30)`. `TileMenuItem` gains a `submenu` variant; the handler maps `MuteFor` to `muteExpiry(kind, new Date())`.
- **Rail** (`ServiceTile.tsx`): the bell badge's tooltip reads `Muted until 14:30` when timed, `Muted` otherwise. Computed at render from `state.mutedUntil`; no interval — the expiry's broadcast re-renders it.
- **Settings → Services**: unchanged checkbox; its hint gains `Right-click a tile in the rail to mute for a while.`

## Testing

- `tests/unit/mute-rules.test.ts` — `muteExpiry` for each kind (an hour from now; tomorrow 08:00 across midnight; the 02:00 case ending the same morning; built with local `Date` setters so a DST change does not shift the hour); `muteLabel` for same-day, next-day, none and past; `nextMuteExpiry` and `dueUnmutes` with mixed muted/unmuted/indefinite services.
- `tests/unit/mute-timer.test.ts` — fake timers: one expiry fires once and re-arms to nothing; two staggered expiries fire in order; `rearm()` after a manual unmute cancels the pending fire; a past expiry at `start()` fires immediately; `dispose()` leaves no timer.
- `tests/unit/tile-menu.test.ts` — the submenu shape and labels; the `Unmute (until …)` label.
- `tests/unit/settings.test.ts` — `mutedUntil` defaults to zeros and coerces garbage to 0.
- `tests/e2e/timed-mute.spec.ts` — a native context menu cannot be driven, so the profile seeds `muted.zalo = true` with `mutedUntil.zalo` a few seconds ahead: the tile's bell badge is visible at launch with the `Muted until` tooltip, disappears on its own within the window, and `settings.json` then holds `muted.zalo = false` and `mutedUntil.zalo = 0`.

## Out of scope

- Per-conversation mute (the services' own feature).
- A countdown or live remaining-time display.
- Timed global mute (quiet hours cover the scheduled case).
