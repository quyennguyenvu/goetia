# Timed Mute Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mute one service for an hour, until tomorrow 08:00, or until unmuted, from the rail tile's menu, with the expiry persisted and honoured across a restart.

**Architecture:** `Settings.mutedUntil` sits beside the existing `muted` boolean, which stays the single truth every reader consults. Pure rules in `lib/mute-rules.ts` compute expiries, labels and due unmutes; `MuteTimerController` (shaped like `QuietHoursController`) arms one timer for the earliest expiry and flips due services back through the existing `setServiceMuted` tail. The tile menu grows a submenu; the tile's bell badge grows a tooltip.

**Tech Stack:** TypeScript, Electron `Menu` submenu, React, Vitest fake timers, Playwright-Electron.

Spec: `docs/superpowers/specs/2026-09-20-timed-mute-design.md`.

## Global Constraints

- Gates after every task: `corepack pnpm lint`, `corepack pnpm typecheck`, `corepack pnpm test`; `env -u ELECTRON_RUN_AS_NODE corepack pnpm e2e` after Task 4.
- **Never run `git commit`**; under "auto run" one summary at the end.
- `muted[id]` remains the only field `shouldNotify`, `audioMuted`, badges and the bell badge read. `mutedUntil` is consulted only by the controller, the menu label and the tooltip.
- Every unmute (manual or timed) writes `mutedUntil[id] = 0`.
- Constants: `MUTE_HOUR_MS = 3_600_000`, `TOMORROW_HOUR = 8`, controller slack `250ms`.
- Copy, verbatim: submenu `Mute` → `For 1 hour` / `Until tomorrow` / `Until I unmute`; muted item `Unmute` or `Unmute (until 14:30)` / `Unmute (until tomorrow 08:00)`; tooltip `Muted until 14:30` / `Muted`; Settings hint `Right-click a tile in the rail to mute for a while.`

## File Structure

| File | Responsibility |
| --- | --- |
| `src/shared/types.ts` | `Settings.mutedUntil`, `ShellState.mutedUntil`, defaults |
| `src/shared/ipc.ts` | `service:setMuted` gains optional `until` |
| `src/main/settings.ts` | `fillMutedUntil` |
| `src/main/state.ts` | mirror `mutedUntil` into `ShellState` |
| `src/main/lib/mute-rules.ts` (create) | `muteExpiry`, `muteLabel`, `nextMuteExpiry`, `dueUnmutes` |
| `src/main/mute-timer.ts` (create) | `MuteTimerController` |
| `src/main/lib/tile-menu.ts` | submenu variant and labels |
| `src/main/ipc-handlers.ts` | `setServiceMuted(…, until)`, `ctx.muteTimer`, submenu mapping, `until` validation |
| `src/main/index.ts` | construct/start/dispose the controller; `onExpire` tail |
| `src/renderer/src/components/ServiceTile.tsx`, `Rail.tsx`, `SettingsView.tsx` | tooltip, prop, hint |
| tests | `mute-rules.test.ts`, `mute-timer.test.ts`, `tile-menu.test.ts`, `settings.test.ts`, e2e `timed-mute.spec.ts` |
| docs | `FEATURES.md`, `README.md`, `CLAUDE.md` |

### Task 1: rules, controller, settings field (tests first)

- [ ] `mute-rules.test.ts`, `mute-timer.test.ts`, `settings.test.ts` additions, `tile-menu.test.ts` additions → red.
- [ ] `types.ts` fields + defaults; `settings.ts` `fillMutedUntil`; `lib/mute-rules.ts`; `mute-timer.ts`; `tile-menu.ts` submenu → green.

### Task 2: wiring

- [ ] `ipc.ts` `until?`; `ipc-handlers.ts` tail + submenu handler + `ctx.muteTimer`; `state.ts` mirror; `index.ts` controller with `onExpire: (ids) => ids.forEach(id => setServiceMuted(ctx, id, false))` (export `setServiceMuted`), `start()` after `quiet.start()`, `dispose()` in `before-quit`.

### Task 3: renderer

- [ ] `ServiceTile` prop `mutedUntil: number` → tooltip via a small `muteTooltip(until, now)` computed inline from `shared` (move `muteLabel` to `src/shared/mute.ts` so the renderer can import it without main code); Settings hint.

### Task 4: e2e and docs

- [ ] `tests/e2e/timed-mute.spec.ts` seeded expiry; docs; full gates.
