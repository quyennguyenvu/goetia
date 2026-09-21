# Timed Global Mute Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mute everything for an hour, until tomorrow 08:00, or until unmuted, from the bell's right-click, the tray and the app menu, with the expiry persisted, honoured across a restart, and never dismissing quiet hours.

**Architecture:** `Settings.globalMutedUntil` sits beside `globalMuted`, which stays the single truth. `MuteTimerController` folds the global expiry into its one timer. A pure `globalMuteMenu` in `lib/mute-menu.ts` shapes the entry both menus and the bell's popup build from; `ctx.setGlobalMuted(muted, until)` is the only write path, and the expiry tail bypasses `muteToggleResult` so the quiet-hours override is never stamped by a timer.

**Tech Stack:** TypeScript, Electron `Menu`, React, Vitest fake timers, Playwright-Electron.

Spec: `docs/superpowers/specs/2026-09-21-timed-global-mute-design.md`.

## Global Constraints

- Gates: `corepack pnpm lint`, `corepack pnpm typecheck`, `corepack pnpm test`; `env -u ELECTRON_RUN_AS_NODE corepack pnpm e2e` at the end.
- No commits from the plan; the user commits through `/commit`. One summary at the end.
- `globalMuted` remains the only field `shouldNotify`, `audioMuted`, the menus' state and the bell read. `globalMutedUntil` is consulted only by the controller, the menu labels and the tooltip.
- Every unmute (manual or timed) writes `globalMutedUntil = 0`; only a manual unmute may write `quietOverrideWindowStart`.
- The `mute` accelerator is declared exactly once, in the app menu.
- Copy, verbatim: submenu `Mute All Notifications` → `For 1 hour` / `Until tomorrow` / `Until I unmute`; silenced item `Unmute All Notifications` or `Unmute All Notifications (until 14:30)`; bell tooltip suffix `— muted until 14:30`.

## File Structure

| File | Responsibility |
| --- | --- |
| `src/shared/types.ts` | `Settings.globalMutedUntil`, `ShellState.globalMutedUntil`, default |
| `src/shared/ipc.ts` | `global:setMuted` gains `until?`; new shell-only `global:muteMenu` |
| `src/main/settings.ts` | normalise `globalMutedUntil` |
| `src/main/state.ts` | mirror into `ShellState` |
| `src/main/lib/mute-rules.ts` | `nextMuteExpiry(…, globalUntil)`, `globalMuteDue` |
| `src/main/lib/mute-menu.ts` (create) | `MUTE_CHOICES`, `globalMuteMenu` |
| `src/main/lib/tile-menu.ts` | import `MUTE_CHOICES` |
| `src/main/mute-timer.ts` | global deps |
| `src/main/ipc-handlers.ts` | `setGlobalMuted(muted, until)`, `until` validation, `global:muteMenu` popup |
| `src/main/index.ts` | tail with `until`; expiry tail; controller deps |
| `src/main/menu.ts`, `src/main/tray.ts` | entry from `globalMuteMenu` |
| `src/renderer/src/components/Rail.tsx` | right-click, tooltip, test id |
| tests | `mute-rules`, `mute-timer`, `mute-menu` (new), `settings`, `ipc-sender-policy`, `lock-ipc-policy`; e2e `timed-global-mute.spec.ts` |
| docs | `FEATURES.md`, `README.md`, `CLAUDE.md` |

### Task 1: rules, menu shape, controller, settings field (tests first)

- [ ] `mute-rules.test.ts`, `mute-timer.test.ts`, `mute-menu.test.ts`, `settings.test.ts` additions → red.
- [ ] `types.ts` field + default; `settings.ts`; `lib/mute-rules.ts`; `lib/mute-menu.ts`; `tile-menu.ts` import; `mute-timer.ts` → green.

### Task 2: wiring

- [ ] `ipc.ts` channel + `until?`; policy tests → red; `ipc-handlers.ts` (`AppContext.setGlobalMuted(muted, until?)`, `global:setMuted` with `validUntil`, `global:muteMenu` popup); `state.ts`; `index.ts` (tail, expiry tail, controller deps); `menu.ts`; `tray.ts` → green.

### Task 3: renderer

- [ ] `Rail.tsx` bell: `onContextMenu` → `global:muteMenu`, tooltip suffix, `data-testid="bell"`.

### Task 4: e2e and docs

- [ ] `tests/e2e/timed-global-mute.spec.ts` (quiet hours covering now + seeded global expiry); `FEATURES.md`, `README.md`, `CLAUDE.md`; full gates.
